'use client'

import { useState } from 'react'

interface Candidate { staff_id: string; name: string }

interface Props {
  candidates: Candidate[]
  onSubmit: (staffId: string | null) => void
  submitting: boolean
}

// 참여자 방 나가기 흐름의 "직원 친절도 투표" 단계 (Staff 도메인, BUSINESS_RULES.md §2.4,
// §2.12 "참여자 방 나가기(Exit Flow) — 도메인 간 순서 규칙"). 별점이 아니라 "가장
// 친절했던 직원 1명"을 고르는 단일 선택이며, 스킵 가능하다. InteractionModal과 같은
// 톤(전체화면 다크 배경)으로 맞춰 참여자 경험이 이질적이지 않게 했다.
export default function KindnessVoteModal({ candidates, onSubmit, submitting }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(16px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '56px 24px 24px', overflow: 'hidden' }}>
        <p style={{ fontSize: 13, color: 'var(--purple-light)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>나가기 전에</p>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>오늘 누가 제일 친절했나요?</h2>
        <p style={{ fontSize: 13, color: 'var(--muted2)', marginBottom: 24 }}>1명만 고를 수 있어요 (스킵해도 괜찮아요)</p>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
          {candidates.map(c => {
            const sel = selectedId === c.staff_id
            return (
              <button key={c.staff_id} onClick={() => setSelectedId(c.staff_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16,
                  background: sel ? 'rgba(124,92,191,0.12)' : 'var(--card)',
                  border: `1.5px solid ${sel ? 'var(--purple-light)' : 'var(--border)'}`, cursor: 'pointer',
                }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--text2)' }}>
                  {c.name[0] ?? '?'}
                </div>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600, color: sel ? 'var(--purple-light)' : 'var(--text)' }}>{c.name}</span>
                {sel && <span style={{ fontSize: 20 }}>👍</span>}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={() => onSubmit(null)} disabled={submitting} style={{ flex: 1, fontSize: 15 }}>
            스킵하고 나가기
          </button>
          <button className="btn" onClick={() => selectedId && onSubmit(selectedId)} disabled={!selectedId || submitting}
            style={{
              flex: 1.4, fontSize: 15, color: '#fff',
              background: selectedId ? 'linear-gradient(135deg,#7c5cbf,#6d28d9)' : 'var(--card2)',
              boxShadow: selectedId ? '0 8px 24px rgba(124,92,191,0.4)' : 'none',
              opacity: !selectedId || submitting ? 0.5 : 1,
            }}>
            {submitting ? '처리 중...' : '투표하고 나가기'}
          </button>
        </div>
      </div>
    </div>
  )
}
