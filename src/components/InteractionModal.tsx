'use client'

import { useEffect, useState } from 'react'
import { Participant, Reaction } from '@/lib/supabase/types'
import { WARNING_COOLDOWN_MS, STAR_COOLDOWN_MS, formatCooldown } from '@/lib/cooldown'
import Icon, { IconName } from './Icon'
import { GAP, TYPE, ICON, RADIUS, SURFACE, SEMANTIC } from '@/lib/design'

interface Props {
  participants: Participant[]
  reactions: Reaction[]
  myParticipantId: string
  onSend: (receiver_id: string, type: 'heart' | 'warning' | 'star', value?: number) => Promise<{ error?: string; warningCount?: number }>
  onClose: () => void
}

type Mode = 'select' | 'heart' | 'warning' | 'star'

// 1~5점의 기분 라벨과 아이콘. 2026-08-17(ADR-0009): 라벨 앞에 붙어 있던 이모지
// (😴😐😊😄🔥)를 Material Symbols의 sentiment 5단계로 교체했다. 이모지 다섯 개는 서로
// 계열이 다른 그림(자는 얼굴 / 무표정 / 웃음 / 큰웃음 / 불꽃)이라 "같은 척도의 5단계"로
// 읽히지 않았다 — sentiment 세트는 같은 얼굴이 표정만 바뀌는 한 계열이라 순서가 눈에 보인다.
const MOODS: { label: string; icon: IconName }[] = [
  { label: '', icon: 'sentiment_neutral' }, // 0점(미선택) — 실제로 렌더링되지 않는다
  { label: '좀 쳐지네요', icon: 'sentiment_very_dissatisfied' },
  { label: '평범한 편', icon: 'sentiment_dissatisfied' },
  { label: '괜찮아요', icon: 'sentiment_neutral' },
  { label: '꽤 좋아요!', icon: 'sentiment_satisfied' },
  { label: '완전 핫해요!!', icon: 'sentiment_very_satisfied' },
]

// 세 가지 표현 방식. 색/아이콘/문구를 한 곳에 모아, 이 값들이 화면 여러 곳(카드·헤더·버튼)에서
// 항상 같은 조합으로 쓰이게 한다 — 같은 행동이 화면마다 다른 색으로 보이면 유사성이 깨진다.
const ACTIONS = {
  heart: {
    icon: 'favorite' as IconName, label: '호감 표현', desc: '익명으로 호감표시!',
    color: SEMANTIC.danger, rgb: '255,107,107', gradient: 'linear-gradient(135deg,#ff6b6b,#ee4444)',
  },
  warning: {
    icon: 'volume_off' as IconName, label: '자제 시그널', desc: '5분마다 익명으로 전달',
    color: SEMANTIC.warning, rgb: '245,158,11', gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',
  },
  // 2026-08-17(ADR-0009): 별점은 보라(#7c5cbf 계열)였는데, 팔레트를 모노시그널(블랙+레드)로
  // 옮길 때 `--purple-light`만 레드로 리매핑되고 하드코딩된 rgb '124,92,191'는 그대로 남아
  // **테두리·배경은 보라인데 아이콘만 빨강**인 상태였다. 별은 앱 전체에서 노랑(`StarRow`의
  // #f5c518)으로 그려지므로 여기도 같은 노랑으로 맞춘다 — 같은 대상은 화면이 달라도 같은 색.
  star: {
    icon: 'star' as IconName, label: '만족도 별점', desc: '지금 이 자리, 몇 점짜리?',
    color: SEMANTIC.score, rgb: '245,197,24', gradient: 'linear-gradient(135deg,#f5c518,#d9a406)',
  },
} as const

// 뒤로 가기 — 세 하위 화면이 똑같이 쓴다. 글자 "←"를 Icon으로 바꾸면서 공통으로 뽑았다.
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        background: 'none', border: 'none', color: 'var(--muted2)', cursor: 'pointer',
        marginBottom: 20, textAlign: 'left', display: 'flex', alignItems: 'center',
        gap: GAP.tight + 2, ...TYPE.body, padding: 0,
      }}>
      <Icon name="arrow_back" size={ICON.inline} />
      뒤로
    </button>
  )
}

// 쿨타임 안내. 이전엔 "⏱" 이모지 + 주황 글씨였는데, 두 화면에서 여백 값이 달라(marginTop:-12
// 같은 보정이 들어가 있었다) 같은 안내가 다르게 보였다. 하나로 묶어 항상 같게 만든다.
function CooldownNotice({ ms }: { ms: number }) {
  return (
    <p style={{
      display: 'flex', alignItems: 'center', gap: GAP.tight + 2,
      ...TYPE.body, fontWeight: 700, color: SEMANTIC.warning, marginBottom: 20,
    }}>
      <Icon name="schedule" size={ICON.inline} />
      {formatCooldown(ms)} 후에 다시 보낼 수 있어요
    </p>
  )
}

export default function InteractionModal({ participants, reactions, myParticipantId, onSend, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [starValue, setStarValue] = useState(0)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [tick, setTick] = useState(0)

  const others = participants.filter(p => p.id !== myParticipantId)

  // 탭을 누른 순간부터 1초 단위로 남은 쿨타임을 갱신
  useEffect(() => {
    if (mode !== 'warning' && mode !== 'star') return
    const id = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [mode])

  const lastSentAt = (type: 'warning' | 'star'): number | null => {
    const mine = reactions.filter(r => r.sender_participant_id === myParticipantId && r.type === type)
    if (mine.length === 0) return null
    return Math.max(...mine.map(r => new Date(r.created_at).getTime()))
  }

  const cooldownRemaining = (type: 'warning' | 'star'): number => {
    void tick
    const at = lastSentAt(type)
    if (at === null) return 0
    const duration = type === 'warning' ? WARNING_COOLDOWN_MS : STAR_COOLDOWN_MS
    return Math.max(0, at + duration - Date.now())
  }

  const warningCooldownMs = cooldownRemaining('warning')
  const starCooldownMs = cooldownRemaining('star')

  const handleSend = async () => {
    if (mode !== 'star' && !selectedId) return
    if (mode === 'star' && starValue === 0) return
    if (mode === 'warning' && warningCooldownMs > 0) return
    if (mode === 'star' && starCooldownMs > 0) return
    setSending(true)
    try {
      const receiverId = mode === 'star' ? (others[0]?.id ?? myParticipantId) : selectedId!
      const res = await onSend(receiverId, mode === 'star' ? 'star' : mode as 'heart' | 'warning', mode === 'star' ? starValue : undefined)
      if (res?.error) {
        setResult({ success: false, message: res.error })
      } else {
        const msgs: Record<Mode, string> = {
          select: '',
          heart: '하트를 보냈어요!',
          warning: '조용히 전달했어요',
          star: `${starValue}점 투표 완료!`,
        }
        setResult({ success: true, message: msgs[mode] })
      }
    } finally { setSending(false) }
  }

  if (result) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}>
        <div className="card animate-bounce-in" style={{
          width: '100%', padding: 32, textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: GAP.loose,
        }}>
          {/* 성공/실패를 이모지(✨/😅) 대신 의미 아이콘 + 의미색으로 표현한다 — 이모지는
              성공인지 실패인지가 그림 해석에 달려 있었지만, 체크/경고는 색과 형태 둘 다로
              말한다. */}
          <span style={{ color: result.success ? SEMANTIC.success : SEMANTIC.danger, display: 'flex' }}>
            <Icon name={result.success ? 'check_circle' : 'error'} size={ICON.hero} />
          </span>
          <p style={{ ...TYPE.heading, fontSize: 20 }}>{result.message}</p>
          <button className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    )
  }

  const action = mode !== 'select' ? ACTIONS[mode] : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(16px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '56px 24px 24px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <h2 style={TYPE.title}>지금 표현해볼까요?</h2>
          <button onClick={onClose} aria-label="닫기"
            style={{
              width: 40, height: 40, borderRadius: RADIUS.item, background: SURFACE.group,
              border: '1px solid var(--border)', color: 'var(--muted2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}>
            <Icon name="close" size={ICON.row} />
          </button>
        </div>

        {mode === 'select' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: GAP.base }}>
            {(['heart', 'warning', 'star'] as const).map(m => {
              const a = ACTIONS[m]
              return (
                <button key={m} onClick={() => setMode(m)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: GAP.loose, padding: `18px ${GAP.loose + 4}px`,
                    borderRadius: 18, background: `rgba(${a.rgb},0.1)`, border: `1.5px solid rgba(${a.rgb},0.25)`,
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  {/* 아이콘을 같은 크기의 원 안에 넣는다 — 이모지 시절엔 글리프마다 실제 폭이
                      달라 세 카드의 글자 시작선이 어긋났다(연속성 위반). */}
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    width: 48, height: 48, borderRadius: RADIUS.pill,
                    background: `rgba(${a.rgb},0.16)`, color: a.color,
                  }}>
                    <Icon name={a.icon} size={ICON.card} />
                  </span>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: a.color, marginBottom: 3 }}>{a.label}</div>
                    <div style={TYPE.caption}>{a.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {(mode === 'heart' || mode === 'warning') && action && (
          <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <BackLink onClick={() => { setMode('select'); setSelectedId(null) }} />
            <p style={{
              ...TYPE.heading, fontSize: 20, marginBottom: GAP.tight,
              display: 'flex', alignItems: 'center', gap: GAP.snug,
            }}>
              <span style={{ color: action.color, display: 'flex' }}><Icon name={action.icon} size={ICON.row} /></span>
              {mode === 'heart' ? '하트 보낼 사람' : '시그널 보낼 사람'}
            </p>
            <p style={{ ...TYPE.caption, marginBottom: 20 }}>
              {mode === 'heart' ? '익명으로 몰래 호감을 표시해요' : '자제 시그널은 익명으로 5분 마다 보낼 수 있어요'}
            </p>
            {mode === 'warning' && warningCooldownMs > 0 && <CooldownNotice ms={warningCooldownMs} />}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: GAP.snug, paddingBottom: GAP.snug }}>
              {others.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>아직 다른 참여자가 없어요</p>
              ) : others.map(p => {
                const sel = selectedId === p.id
                return (
                  <button key={p.id} onClick={() => setSelectedId(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: GAP.base, padding: `14px ${GAP.loose}px`,
                      borderRadius: RADIUS.group,
                      background: sel ? `rgba(${action.rgb},0.12)` : SURFACE.group,
                      border: `1.5px solid ${sel ? action.color : 'var(--border)'}`, cursor: 'pointer',
                    }}>
                    <div style={{ width: 40, height: 40, borderRadius: RADIUS.item, background: SURFACE.item, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--text2)' }}>{p.nickname[0] ?? '?'}</div>
                    <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600, color: sel ? action.color : 'var(--text)' }}>{p.nickname}</span>
                    {sel && <span style={{ color: action.color, display: 'flex' }}><Icon name={action.icon} size={ICON.row} /></span>}
                  </button>
                )
              })}
            </div>
            <button className="btn" onClick={handleSend} disabled={!selectedId || sending || (mode === 'warning' && warningCooldownMs > 0)}
              style={{
                marginTop: GAP.loose, fontSize: 17, gap: GAP.snug,
                background: selectedId ? action.gradient : SURFACE.group, color: '#fff',
                boxShadow: selectedId ? `0 8px 24px rgba(${action.rgb},0.4)` : 'none',
                opacity: (!selectedId || (mode === 'warning' && warningCooldownMs > 0)) ? 0.4 : 1,
              }}>
              {sending ? '전송 중...' : (
                <>
                  <Icon name={action.icon} size={ICON.row} />
                  {mode === 'heart' ? '하트 보내기' : '시그널 보내기'}
                </>
              )}
            </button>
          </div>
        )}

        {mode === 'star' && action && (
          <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <BackLink onClick={() => { setMode('select'); setStarValue(0) }} />
            <p style={{
              ...TYPE.heading, fontSize: 20, marginBottom: GAP.tight + 2,
              display: 'flex', alignItems: 'center', gap: GAP.snug,
            }}>
              <span style={{ color: SEMANTIC.score, display: 'flex' }}><Icon name="star" size={ICON.row} /></span>
              지금 만족도 몇 점?
            </p>
            <p style={{ ...TYPE.caption, marginBottom: starCooldownMs > 0 ? GAP.tight : 40 }}>전체 평균이 실시간으로 업데이트돼요</p>
            {starCooldownMs > 0 && <CooldownNotice ms={starCooldownMs} />}
            <div style={{ display: 'flex', justifyContent: 'center', gap: GAP.base, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setStarValue(n)} aria-label={`${n}점`}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    transition: 'all 0.15s', transform: starValue >= n ? 'scale(1.18)' : 'scale(1)',
                    // 이모지 시절엔 brightness 필터로 껐다 켰다 했는데(⭐를 어둡게 눌러서
                    // "안 고른 별"을 표현), 이제 색을 직접 줄 수 있어 의미가 분명해졌다.
                    color: starValue >= n ? SEMANTIC.score : 'var(--card2)',
                    filter: starValue >= n ? 'drop-shadow(0 0 8px rgba(245,197,24,0.5))' : 'none',
                  }}>
                  <Icon name="star" size={44} />
                </button>
              ))}
            </div>
            {starValue > 0 && (
              <p style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: GAP.snug,
                fontSize: 16, fontWeight: 700, color: SEMANTIC.score, marginBottom: 32,
              }}>
                <Icon name={MOODS[starValue].icon} size={ICON.row} />
                {MOODS[starValue].label}
              </p>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={handleSend} disabled={starValue === 0 || sending || starCooldownMs > 0}
              style={{
                fontSize: 17, gap: GAP.snug,
                background: starValue > 0 ? action.gradient : SURFACE.group, color: '#fff',
                boxShadow: starValue > 0 ? `0 8px 24px rgba(${action.rgb},0.4)` : 'none',
                opacity: (starValue === 0 || starCooldownMs > 0) ? 0.4 : 1,
              }}>
              {sending ? '투표 중...' : (
                <>
                  <Icon name="star" size={ICON.row} />
                  {starValue > 0 ? `${starValue}점` : '?점'} 투표하기
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
