'use client'

import { useState, useRef, useEffect } from 'react'
import { Message } from '@/lib/supabase/types'

interface Props {
  messages: Message[]
  loading: boolean
  sendMessage: (content: string, optimistic: { participantId: string; nickname: string }) => Promise<{ error?: string }>
  myParticipantId: string
  myNickname: string
  onClose: () => void
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatPanel({ messages, loading, sendMessage, myParticipantId, myNickname, onClose }: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    setError('')
    try {
      const res = await sendMessage(content, { participantId: myParticipantId, nickname: myNickname })
      if (res?.error) {
        setInput(content)
        setError(res.error)
      }
    } catch {
      setInput(content)
      setError('메시지를 보내지 못했어요. 잠시 후 다시 시도해주세요')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(16px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 24px 16px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>💬 채팅</h2>
        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>불러오는 중...</p>
        ) : messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>아직 채팅이 없어요. 먼저 말을 걸어보세요!</p>
        ) : messages.map(m => {
          const isMe = m.sender_participant_id === myParticipantId
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              {!isMe && <span style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 3, marginLeft: 4 }}>{m.sender_nickname}</span>}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: 16,
                borderBottomRightRadius: isMe ? 4 : 16,
                borderBottomLeftRadius: isMe ? 16 : 4,
                background: isMe ? 'linear-gradient(135deg,#ff6b6b,#ee4444)' : 'var(--card)',
                border: isMe ? 'none' : '1px solid var(--border)',
                color: isMe ? '#fff' : 'var(--text)',
                fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                {m.content}
              </div>
              <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, marginLeft: isMe ? 0 : 4, marginRight: isMe ? 4 : 0 }}>{fmtTime(m.created_at)}</span>
            </div>
          )
        })}
      </div>

      {error && <p style={{ fontSize: 12, color: '#ff6b6b', padding: '0 20px', marginTop: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, padding: '12px 20px calc(20px + env(safe-area-inset-bottom))' }}>
        <input
          className="input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 300))}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="메시지 입력"
          autoComplete="off"
          style={{ flex: 1 }}
        />
        <button onClick={handleSend} disabled={!input.trim() || sending}
          style={{ width: 52, borderRadius: 14, background: input.trim() ? 'linear-gradient(135deg,#ff6b6b,#ee4444)' : 'var(--card)', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: !input.trim() || sending ? 0.4 : 1 }}>
          ➤
        </button>
      </div>
    </div>
  )
}
