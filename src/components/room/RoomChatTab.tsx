'use client'

import { useEffect, useRef, useState } from 'react'
import { Message, Participant, QnaMessage, VenueSeat } from '@/lib/supabase/types'
import InlineMessage from '@/components/InlineMessage'

type Channel = 'room' | 'external'

// 좌석 번호 아바타 — 디자인상 채팅에서 발신자를 닉네임 대신 좌석 번호로 식별한다.
// 좌석이 없거나(외부인) 못 찾으면 닉네임 첫 글자로 대체한다.
function Avatar({ label, external }: { label: string; external: boolean }) {
  return (
    <div style={{
      flexShrink: 0, width: 30, height: 30, borderRadius: 999,
      border: `1.5px solid ${external ? 'var(--muted)' : 'var(--accent)'}`,
      color: external ? 'var(--muted2)' : 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 800,
    }}>
      {label}
    </div>
  )
}

// 방 화면 "채팅" 탭 — 두 채널.
//  · 매장: 입장한 손님끼리의 대화 (기존 Chat 도메인, messages)
//  · 외부 QnA: 매장에 입장하지 않은 외부인 ↔ 입장 손님 (신규 venue_qna)
export default function RoomChatTab({
  messages, qna, seats, participants, myParticipantId,
  onSendRoom, onSendQna, qnaError,
}: {
  messages: Message[]
  qna: QnaMessage[]
  seats: VenueSeat[]
  participants: Participant[]
  myParticipantId: string
  onSendRoom: (content: string) => Promise<{ error?: string }>
  onSendQna: (content: string) => Promise<{ error?: string }>
  qnaError?: string
}) {
  const [channel, setChannel] = useState<Channel>('room')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const count = channel === 'room' ? messages.length : qna.length
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [count, channel])

  // 참여자 → 좌석 번호. 채팅 아바타를 그리는 데만 쓴다.
  const seatLabelOf = (participantId: string | null) => {
    if (!participantId) return null
    const p = participants.find(x => x.id === participantId)
    if (!p?.seat_id) return null
    return seats.find(s => s.id === p.seat_id)?.label ?? null
  }

  const handleSend = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    setError('')
    try {
      const res = channel === 'room' ? await onSendRoom(content) : await onSendQna(content)
      if (res?.error) { setInput(content); setError(res.error) }
    } catch {
      setInput(content)
      setError('메시지를 보내지 못했어요. 잠시 후 다시 시도해주세요')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 채널 전환 */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 20px' }}>
        {([{ key: 'room' as const, label: '매장' }, { key: 'external' as const, label: '외부 QnA' }]).map(c => (
          <button key={c.key} onClick={() => { setChannel(c.key); setError('') }}
            style={{
              padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 800,
              background: channel === c.key ? 'var(--accent)' : 'var(--card2)',
              color: channel === c.key ? '#fff' : 'var(--muted2)',
            }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div ref={listRef} style={{
        flex: 1, overflowY: 'auto', padding: '8px 20px 12px',
        display: 'flex', flexDirection: 'column', gap: 10, minHeight: 220,
      }}>
        {channel === 'room' ? (
          messages.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '40px 0' }}>
              아직 대화가 없어요. 먼저 말을 걸어보세요!
            </p>
          ) : messages.map(m => {
            const seat = seatLabelOf(m.sender_participant_id)
            const isMe = m.sender_participant_id === myParticipantId
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar label={seat ?? m.sender_nickname.slice(0, 1)} external={false} />
                <div style={{
                  flex: 1, padding: '10px 14px', borderRadius: 999,
                  background: isMe ? 'rgba(225,6,0,0.28)' : 'rgba(225,6,0,0.12)',
                  border: '1px solid rgba(225,6,0,0.35)',
                  fontSize: 14, color: 'var(--text)', wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              </div>
            )
          })
        ) : (
          qna.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '40px 0' }}>
              아직 질문이 없어요. 밖에서 궁금해하는 사람들과 이야기해보세요
            </p>
          ) : qna.map(m => {
            const seat = seatLabelOf(m.author_participant_id)
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar label={seat ?? m.author_nickname.slice(0, 1)} external={m.is_external} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {m.is_external && (
                    <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, marginLeft: 4 }}>
                      {m.author_nickname} · 외부
                    </p>
                  )}
                  <div style={{
                    padding: '10px 14px', borderRadius: 999,
                    background: m.is_external ? 'var(--card2)' : 'rgba(225,6,0,0.12)',
                    border: `1px solid ${m.is_external ? 'var(--border)' : 'rgba(225,6,0,0.35)'}`,
                    fontSize: 14, color: 'var(--text)', wordBreak: 'break-word',
                  }}>
                    {m.content}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {(error || qnaError) && (
        <div style={{ padding: '0 20px 8px' }}>
          <InlineMessage type="error">{error || qnaError}</InlineMessage>
        </div>
      )}

      {/* 입력 */}
      <div style={{ display: 'flex', gap: 8, padding: '0 20px 12px' }}>
        <input
          className="input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 300))}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={channel === 'room' ? '채팅을 입력해주세요' : '외부 손님에게 답해주세요'}
          autoComplete="off"
          style={{ flex: 1, borderRadius: 999 }}
        />
        <button onClick={handleSend} disabled={!input.trim() || sending} aria-label="보내기"
          style={{
            width: 54, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: input.trim() ? 'var(--accent)' : 'var(--card2)',
            color: '#fff', fontSize: 18, opacity: !input.trim() || sending ? 0.45 : 1,
          }}>
          ▶
        </button>
      </div>
    </div>
  )
}
