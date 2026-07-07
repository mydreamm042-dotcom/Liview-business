'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getRoomData, getSessionToken, clearRoomData } from '@/lib/session'
import { createClient } from '@/lib/supabase/client'
import { Participant, Reaction, Room } from '@/lib/supabase/types'
import { calcHotIndex } from '@/lib/hotIndex'

interface ResultData {
  room: Room | null
  participants: Participant[]
  reactions: Reaction[]
  endVoteCounts: Record<string, number>
}

const BUCKET_MS = 30 * 60 * 1000
const HOT_BUCKET_MS = 30 * 60 * 1000

function makeBuckets(reactions: Reaction[], type: string) {
  const filtered = reactions.filter(r => r.type === type && r.created_at)
  if (filtered.length === 0) return []
  const times = filtered.map(r => new Date(r.created_at!).getTime())
  const minT = Math.min(...times)
  const maxT = Math.max(...times)
  const base = Math.floor(minT / BUCKET_MS) * BUCKET_MS
  const count = Math.floor((maxT - base) / BUCKET_MS) + 1
  const buckets: { label: string; value: number }[] = []
  for (let i = 0; i < count; i++) {
    const bStart = base + i * BUCKET_MS
    const bEnd = bStart + BUCKET_MS
    const inBucket = filtered.filter(r => {
      const t = new Date(r.created_at!).getTime()
      return t >= bStart && t < bEnd
    })
    if (inBucket.length > 0) {
      const d = new Date(bStart)
      const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
      const avg = inBucket.reduce((a, r) => a + (r.value ?? 0), 0) / inBucket.length
      buckets.push({ label, value: avg })
    }
  }
  return buckets
}

// hot 탭 "횟수"가 아니라, 구간 동안 도달한 HOT 지수(%)의 최고치를 보여준다.
// (탭을 여러 번 눌러 서서히 올리는 구조라 평균을 내면 상승 과정 때문에 항상 최고치보다 낮게 나옴)
// 버킷은 첫 탭 시각부터 시작하고(벽시계 30분 단위로 맞추지 않음), 방 종료 시각(없으면 지금)에서 잘라
// 실제 활동이 없던 시간은 집계에서 제외한다.
function makeHotBuckets(reactions: Reaction[], roomEndedAt: number | null) {
  const hotReactions = reactions.filter(r => r.type === 'hot' && r.created_at)
  if (hotReactions.length === 0) return []
  const times = hotReactions.map(r => new Date(r.created_at!).getTime())
  const minT = Math.min(...times)
  const maxT = Math.max(roomEndedAt ?? Date.now(), minT)
  const count = Math.max(1, Math.ceil((maxT - minT) / HOT_BUCKET_MS))
  const buckets: { label: string; value: number }[] = []
  for (let i = 0; i < count; i++) {
    const bStart = minT + i * HOT_BUCKET_MS
    const bEnd = Math.min(bStart + HOT_BUCKET_MS, maxT)
    const valuesInBucket = times
      .filter(t => t >= bStart && t < bEnd)
      .map(t => calcHotIndex(hotReactions, t))
    const peak = valuesInBucket.length > 0 ? Math.max(...valuesInBucket) : 0
    const d = new Date(bStart)
    const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    buckets.push({ label, value: peak })
  }
  return buckets
}

export default function ResultPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const roomData = getRoomData()
  const [data, setData] = useState<ResultData | null>(null)
  const [voted, setVoted] = useState<string | null>(null)
  const [votingSending, setVotingSending] = useState(false)

  useEffect(() => {
    if (!roomData) { router.replace('/'); return }
    fetchResult()

    // 베타 참여도 분석용: 결과 화면을 실제로 열어봤는지 최초 1회 기록 (실패해도 화면엔 영향 없음)
    fetch('/api/participants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_id: roomData.participantId, session_token: getSessionToken(), event: 'result_viewed' }),
    }).catch(() => {})

    const supabase = createClient()
    const channel = supabase
      .channel('result-end-votes-' + roomData.roomId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'end_votes', filter: `room_id=eq.${roomData.roomId}` },
        (payload) => {
          const votedForId = (payload.new as { voted_for_id: string }).voted_for_id
          setData(prev => {
            if (!prev) return prev
            const updated = { ...prev.endVoteCounts }
            updated[votedForId] = (updated[votedForId] ?? 0) + 1
            return { ...prev, endVoteCounts: updated }
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchResult = async () => {
    const [rRes, rxRes, evRes] = await Promise.all([
      fetch('/api/rooms/' + code),
      fetch('/api/reactions?room_id=' + roomData!.roomId),
      fetch('/api/end-votes?room_id=' + roomData!.roomId + '&voter_session=' + getSessionToken()),
    ])
    const rData = await rRes.json()
    const rxData = await rxRes.json()
    const evData = await evRes.json()
    setData({
      room: rData.room ?? null,
      participants: rData.participants ?? [],
      reactions: rxData.reactions ?? [],
      endVoteCounts: evData.counts ?? {},
    })
    // 새로고침해도 "이미 투표함" 상태 유지 (서버 기준으로 복원)
    if (evData.myVote) setVoted(evData.myVote)
  }

  const handleVote = async (participantId: string) => {
    if (voted || votingSending || !roomData) return
    setVotingSending(true)
    const res = await fetch('/api/end-votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomData.roomId, voter_session: getSessionToken(), voted_for_id: participantId }),
    })
    if (res.ok) { setVoted(participantId) }
    setVotingSending(false)
  }

  const handleLeave = () => { clearRoomData(); router.replace('/') }

  if (!data || !roomData) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
          <p style={{ color: 'var(--muted2)' }}>결과 불러오는 중...</p>
        </div>
      </main>
    )
  }

  const heartCounts: Record<string, number> = {}
  data.reactions.filter(r => r.type === 'heart').forEach(r => {
    heartCounts[r.receiver_id] = (heartCounts[r.receiver_id] ?? 0) + 1
  })
  const heartTop3 = Object.entries(heartCounts)
    .sort(([, a], [, b]) => b - a).slice(0, 3)
    .map(([id, count]) => ({ participant: data.participants.find(p => p.id === id), count }))
    .filter(x => x.participant)

  const starReactions = data.reactions.filter(r => r.type === 'star' && r.value)
  const avgMood = starReactions.length > 0
    ? starReactions.reduce((a, r) => a + (r.value ?? 0), 0) / starReactions.length
    : null

  const starBuckets = makeBuckets(data.reactions, 'star')
  const roomEndedAt = data.room?.ended_at ? new Date(data.room.ended_at).getTime() : null
  const hotBuckets = makeHotBuckets(data.reactions, roomEndedAt)
  const maxStarVal = starBuckets.length > 0 ? Math.max(...starBuckets.map(b => b.value), 5) : 5

  const seeAgainTop = Object.entries(data.endVoteCounts)
    .sort(([, a], [, b]) => b - a).slice(0, 5)
    .map(([id, count]) => ({ participant: data.participants.find(p => p.id === id), count }))
    .filter(x => x.participant)

  const others = data.participants.filter(p => p.id !== roomData.participantId)
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
  const totalHearts = data.reactions.filter(r => r.type === 'heart').length

  return (
    <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 40 }}>
      <div style={{ padding: '52px 20px 24px', textAlign: 'center', background: 'linear-gradient(180deg, rgba(255,107,107,0.08) 0%, transparent 100%)' }} className="animate-fade-in">
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>{roomData.roomName}</h1>
        <p style={{ fontSize: 14, color: 'var(--muted2)' }}>오늘 모임 결과</p>
      </div>

      <div style={{ padding: '0 20px', marginBottom: 20 }} className="animate-fade-in">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { e: '👥', v: data.participants.length, l: '참여자', c: 'var(--text)' },
            { e: '💖', v: totalHearts, l: '하트', c: '#ff6b6b' },
            { e: '⭐', v: avgMood !== null ? avgMood.toFixed(1) : '-', l: '평균 만족도', c: '#fbbf24' },
          ].map(s => (
            <div key={s.l} className="card" style={{ padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.e}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 11, color: 'var(--muted2)' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>💖</span>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#ff6b6b' }}>오늘의 하트 Top 3</h2>
          </div>
          {heartTop3.length === 0 ? (
            <p style={{ fontSize: 14, textAlign: 'center', padding: '16px 0', color: 'var(--muted2)' }}>아직 하트가 없어요</p>
          ) : heartTop3.map(({ participant: p, count }, i) => (
            <div key={p!.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 24, width: 32, textAlign: 'center' }}>{medals[i]}</span>
              <p style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
                {p!.id === roomData.participantId ? roomData.nickname + ' (나)' : '누군가'}
              </p>
              <div style={{ background: 'rgba(255,107,107,0.12)', padding: '4px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14 }}>💖</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#ff6b6b' }}>{count}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>⭐</span>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#fbbf24' }}>시간별 만족도</h2>
          </div>
          {starBuckets.length === 0 ? (
            <p style={{ fontSize: 14, textAlign: 'center', padding: '16px 0', color: 'var(--muted2)' }}>투표 기록이 없어요</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110, paddingBottom: 20, position: 'relative' }}>
              {starBuckets.map((b, i) => {
                const h = (b.value / maxStarVal) * 76
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24' }}>{b.value.toFixed(1)}</span>
                    <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'linear-gradient(180deg,#fbbf24,#f59e0b)', height: h, minHeight: 4, transition: 'height 0.5s ease' }} />
                    <span style={{ fontSize: 9, color: 'var(--muted2)', position: 'absolute', bottom: 0 }}>{b.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>🔥</span>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#f97316' }}>시간별 HOT 지수</h2>
          </div>
          {hotBuckets.length === 0 ? (
            <p style={{ fontSize: 14, textAlign: 'center', padding: '16px 0', color: 'var(--muted2)' }}>HOT 기록이 없어요</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110, paddingBottom: 20, position: 'relative' }}>
              {hotBuckets.map((b, i) => {
                const h = (b.value / 100) * 76
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#f97316' }}>{b.value}%</span>
                    <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'linear-gradient(180deg,#f97316,#ef4444)', height: h, minHeight: 4, transition: 'height 0.5s ease' }} />
                    <span style={{ fontSize: 9, color: 'var(--muted2)', position: 'absolute', bottom: 0 }}>{b.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🙋</span>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>다음에 또 보고 싶은 사람</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 16 }}>익명 투표 · 1명 선택</p>
          {others.length === 0 ? (
            <p style={{ fontSize: 14, textAlign: 'center', padding: '16px 0', color: 'var(--muted2)' }}>다른 참여자가 없어요</p>
          ) : others.map(p => {
            const voteCount = data.endVoteCounts[p.id] ?? 0
            const isVoted = voted === p.id
            const totalVotes = Object.values(data.endVoteCounts).reduce((a, b) => a + b, 0)
            return (
              <button key={p.id} onClick={() => handleVote(p.id)} disabled={!!voted || votingSending}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderRadius: 14, marginBottom: 8,
                  background: isVoted ? 'rgba(16,185,129,0.12)' : 'var(--card2)',
                  border: '1.5px solid ' + (isVoted ? 'rgba(16,185,129,0.4)' : 'var(--border)'),
                  cursor: voted ? 'default' : 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👤</div>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>누군가</span>
                </div>
                {totalVotes > 0 && voteCount > 0 && (
                  <div style={{ background: 'rgba(16,185,129,0.15)', padding: '4px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14 }}>🙋</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>{voteCount}</span>
                  </div>
                )}
              </button>
            )
          })}
          {seeAgainTop.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 10 }}>투표 결과</p>
              {seeAgainTop.map(({ participant: p, count }, i) => (
                <div key={p!.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14 }}>
                  <span>{medals[i]}</span>
                  <span style={{ flex: 1 }}>{p!.id === roomData.participantId ? '나' : '누군가'}</span>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>🙋 {count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 20px 0' }}>
        <button className="btn btn-ghost" onClick={handleLeave} style={{ fontSize: 16 }}>
          홈으로 돌아가기
        </button>
      </div>
    </main>
  )
}
