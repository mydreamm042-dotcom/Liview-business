'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionToken, storeRoomData } from '@/lib/session'

export default function CreatePage() {
  const router = useRouter()
  const [roomName, setRoomName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!roomName.trim()) { setError('방 이름을 입력해주세요'); return }
    setLoading(true); setError('')

    try {
      const host_session = getSessionToken()
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim(), host_session }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      storeRoomData({
        roomId: data.room.id,
        roomCode: data.room.code,
        roomName: data.room.name,
        participantId: data.participant.id,
        nickname: '호스트',
      })
      router.push(`/room/${data.room.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <button onClick={() => router.back()}
        style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 32 }}>
        ←
      </button>

      <div className="animate-fade-in" style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>NEW ROOM</p>
        <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>방 만들기</h1>
        <p style={{ color: 'var(--muted2)', fontSize: 14 }}>오늘 모임의 이름을 정해주세요</p>
      </div>

      <div style={{ flex: 1 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>모임 이름</label>
        <input
          className="input"
          type="text"
          value={roomName}
          onChange={e => setRoomName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="예: 팀 회식, 대학 동창 모임"
          maxLength={30}
          autoFocus
        />
        {error && <p style={{ marginTop: 8, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}

        <div className="card" style={{ padding: 18, marginTop: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>방 만들면 생기는 것들</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['6자리 참여 코드 + QR코드 자동 생성', '1시간마다 인터랙션 알림', '익명 하트 · 자제 시그널 · 별점 전송', '종료 시 오늘의 하이라이트 결과'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>{t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !roomName.trim()}
        style={{ opacity: loading || !roomName.trim() ? 0.5 : 1, fontSize: 17, marginTop: 24 }}>
        {loading ? '생성 중...' : '🎉 방 만들기'}
      </button>
    </main>
  )
}
