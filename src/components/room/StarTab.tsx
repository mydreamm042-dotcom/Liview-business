'use client'

import { useState } from 'react'
import { VenueBranding } from '@/lib/supabase/types'
import { formatCooldown } from '@/lib/cooldown'
import StarRow from './StarRow'
import InlineMessage from '@/components/InlineMessage'
import Icon from '@/components/Icon'
import { ICON } from '@/lib/design'

const CATEGORY_LABELS: Record<string, string> = {
  pocha: '포차', bar: '바', pub: '펍', wine_bar: '와인바', cafe: '카페', event_hall: '행사장', etc: '기타',
}

// 방 화면 "별점" 탭 — 실시간 매장 만족도(Reaction 도메인의 star, 30분 쿨타임).
// 기본은 현재 평균을 보여주고, "실시간 별점 남기기"를 누르면 별을 고르는 입력 모드로 바뀐다.
export default function StarTab({ venue, moodAverage, cooldownMs, onSubmit }: {
  venue: VenueBranding | null
  moodAverage: number | null
  cooldownMs: number
  onSubmit: (value: number) => Promise<{ error?: string }>
}) {
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const onCooldown = cooldownMs > 0

  const handleSend = async () => {
    if (picked === 0 || sending) return
    setSending(true)
    setError('')
    try {
      const res = await onSubmit(picked)
      if (res?.error) { setError(res.error); return }
      setDone(true)
      setEditing(false)
      setPicked(0)
    } catch {
      setError('별점을 보내지 못했어요. 잠시 후 다시 시도해주세요')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', minHeight: 380 }}>
      <p style={{ fontSize: 22, fontWeight: 800 }}>{venue?.name ?? '매장'}</p>
      <p style={{ fontSize: 13, color: 'var(--muted2)', marginTop: 2, marginBottom: 20 }}>
        {CATEGORY_LABELS[venue?.category ?? ''] ?? venue?.category ?? ''}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: 'var(--muted2)', display: 'flex' }}><Icon name="storefront" size={ICON.row} /></span>
        <span style={{ fontSize: 16, fontWeight: 800 }}>실시간 매장 별점</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', alignSelf: 'flex-start', marginTop: 4 }} />
        <StarRow
          value={editing ? picked : (moodAverage ?? 0)}
          size={34}
          dim={editing && picked === 0}
          onSelect={editing ? setPicked : undefined}
        />
      </div>

      {!editing && moodAverage !== null && (
        <p style={{ fontSize: 13, color: 'var(--muted2)', marginLeft: 14 }}>
          지금 손님들의 평균 {moodAverage.toFixed(1)}점
        </p>
      )}
      {!editing && moodAverage === null && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 14 }}>아직 별점이 없어요</p>
      )}

      {error && <div style={{ marginTop: 16 }}><InlineMessage type="error">{error}</InlineMessage></div>}
      {done && !editing && (
        <div style={{ marginTop: 16 }}><InlineMessage type="success">별점을 남겼어요. 30분 뒤에 다시 남길 수 있어요</InlineMessage></div>
      )}

      {/* 버튼 — 디자인상 화면 중앙 아래쪽에 크게 놓인다 */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 0' }}>
        {editing ? (
          <button className="btn btn-primary" onClick={handleSend}
            disabled={picked === 0 || sending}
            style={{ borderRadius: 999, maxWidth: 320, opacity: picked === 0 || sending ? 0.45 : 1 }}>
            {sending ? '보내는 중...' : '보내기'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => { setEditing(true); setDone(false); setError('') }}
            disabled={onCooldown}
            style={{ borderRadius: 999, maxWidth: 320, opacity: onCooldown ? 0.45 : 1 }}>
            {onCooldown ? `${formatCooldown(cooldownMs)} 후 다시 남길 수 있어요` : '실시간 별점 남기기'}
          </button>
        )}
      </div>
    </div>
  )
}
