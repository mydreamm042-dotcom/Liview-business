'use client'

import { useEffect, useState } from 'react'
import { Participant, Reaction } from '@/lib/supabase/types'
import { WARNING_COOLDOWN_MS, STAR_COOLDOWN_MS, formatCooldown } from '@/lib/cooldown'

interface Props {
  participants: Participant[]
  reactions: Reaction[]
  myParticipantId: string
  onSend: (receiver_id: string, type: 'heart' | 'warning' | 'star', value?: number) => Promise<{ error?: string; warningCount?: number }>
  onClose: () => void
}

type Mode = 'select' | 'heart' | 'warning' | 'star'

const MOOD_LABELS = ['', '😴 좀 쳐지네요', '😐 평범한 편', '😊 괜찮아요', '😄 꽤 좋아요!', '🔥 완전 핫해요!!']

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
          heart: '💖 하트를 보냈어요!',
          warning: '🤫 조용히 전달했어요',
          star: `⭐ ${starValue}점 투표 완료!`,
        }
        setResult({ success: true, message: msgs[mode] })
      }
    } finally { setSending(false) }
  }

  if (result) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}>
        <div className="card animate-bounce-in" style={{ width: '100%', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>{result.success ? '✨' : '😅'}</div>
          <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>{result.message}</p>
          <button className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(16px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '56px 24px 24px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800 }}>지금 표현해볼까요?</h2>
          </div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
        </div>

        {mode === 'select' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { m: 'heart' as Mode, emoji: '💖', label: '호감 표현', desc: '익명으로 호감표시!', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.25)' },
              { m: 'warning' as Mode, emoji: '🤫', label: '자제 시그널', desc: '5분마다 익명으로 전달', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
              { m: 'star' as Mode, emoji: '⭐', label: '만족도 별점', desc: '지금 이 자리, 몇 점짜리?', color: 'var(--purple-light)', bg: 'rgba(124,92,191,0.1)', border: 'rgba(124,92,191,0.25)' },
            ].map(({ m, emoji, label, desc, color, bg, border }) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: 18, background: bg, border: `1.5px solid ${border}`, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 36 }}>{emoji}</span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted2)' }}>{desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {(mode === 'heart' || mode === 'warning') && (
          <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <button onClick={() => { setMode('select'); setSelectedId(null) }}
              style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: 14, cursor: 'pointer', marginBottom: 20, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>← 뒤로</button>
            <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
              {mode === 'heart' ? '💖 하트 보낼 사람' : '🤫 시그널 보낼 사람'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted2)', marginBottom: 20 }}>
              {mode === 'heart' ? '익명으로 몰래 호감을 표시해요' : '자제 시그널은 익명으로 5분 마다 보낼 수 있어요'}
            </p>
            {mode === 'warning' && warningCooldownMs > 0 && (
              <p style={{ fontSize: 13, color: '#f59e0b', marginTop: -12, marginBottom: 20, fontWeight: 700 }}>
                ⏱ {formatCooldown(warningCooldownMs)} 후에 다시 보낼 수 있어요
              </p>
            )}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
              {others.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>아직 다른 참여자가 없어요</p>
              ) : others.map(p => {
                const sel = selectedId === p.id
                const ac = mode === 'heart' ? '#ff6b6b' : '#f59e0b'
                return (
                  <button key={p.id} onClick={() => setSelectedId(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16, background: sel ? `rgba(${mode === 'heart' ? '255,107,107' : '245,158,11'},0.12)` : 'var(--card)', border: `1.5px solid ${sel ? ac : 'var(--border)'}`, cursor: 'pointer' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--text2)' }}>{p.nickname[0] ?? '?'}</div>
                    <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600, color: sel ? ac : 'var(--text)' }}>{p.nickname}</span>
                    {sel && <span style={{ fontSize: 20 }}>{mode === 'heart' ? '💖' : '🤫'}</span>}
                  </button>
                )
              })}
            </div>
            <button className="btn" onClick={handleSend} disabled={!selectedId || sending || (mode === 'warning' && warningCooldownMs > 0)}
              style={{ marginTop: 16, fontSize: 17, background: selectedId ? (mode === 'heart' ? 'linear-gradient(135deg,#ff6b6b,#ee4444)' : 'linear-gradient(135deg,#f59e0b,#d97706)') : 'var(--card)', color: '#fff', boxShadow: selectedId ? `0 8px 24px rgba(${mode === 'heart' ? '255,107,107' : '245,158,11'},0.4)` : 'none', opacity: (!selectedId || (mode === 'warning' && warningCooldownMs > 0)) ? 0.4 : 1 }}>
              {sending ? '전송 중...' : mode === 'heart' ? '💖 하트 보내기' : '🤫 시그널 보내기'}
            </button>
          </div>
        )}

        {mode === 'star' && (
          <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => { setMode('select'); setStarValue(0) }}
              style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: 14, cursor: 'pointer', marginBottom: 20, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>← 뒤로</button>
            <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>⭐ 지금 만족도 몇 점?</p>
            <p style={{ fontSize: 13, color: 'var(--muted2)', marginBottom: starCooldownMs > 0 ? 4 : 40 }}>전체 평균이 실시간으로 업데이트돼요</p>
            {starCooldownMs > 0 && (
              <p style={{ fontSize: 13, color: '#f59e0b', marginBottom: 36, fontWeight: 700 }}>
                ⏱ {formatCooldown(starCooldownMs)} 후에 다시 투표할 수 있어요
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setStarValue(n)}
                  style={{ fontSize: 48, background: 'none', border: 'none', cursor: 'pointer', transition: 'all 0.15s', transform: starValue >= n ? 'scale(1.25)' : 'scale(1)', filter: starValue >= n ? 'brightness(1) drop-shadow(0 0 8px rgba(251,191,36,0.6))' : 'brightness(0.25)' }}>⭐</button>
              ))}
            </div>
            {starValue > 0 && (
              <p style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#fbbf24', marginBottom: 32 }}>{MOOD_LABELS[starValue]}</p>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={handleSend} disabled={starValue === 0 || sending || starCooldownMs > 0}
              style={{ fontSize: 17, background: starValue > 0 ? 'linear-gradient(135deg,#7c5cbf,#6d28d9)' : 'var(--card)', color: '#fff', boxShadow: starValue > 0 ? '0 8px 24px rgba(124,92,191,0.4)' : 'none', opacity: (starValue === 0 || starCooldownMs > 0) ? 0.4 : 1 }}>
              {sending ? '투표 중...' : `⭐ ${starValue > 0 ? starValue + '점' : '?점'} 투표하기`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
