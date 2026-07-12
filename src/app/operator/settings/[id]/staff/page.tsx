'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { StaffMember } from '@/lib/supabase/types'
import BackButton from '@/components/BackButton'
import LoadingScreen from '@/components/LoadingScreen'
import ErrorScreen from '@/components/ErrorScreen'
import PageEyebrowHeader from '@/components/PageEyebrowHeader'
import InlineMessage from '@/components/InlineMessage'

// 운영자 직원 명부 관리 (Staff 도메인, BUSINESS_RULES.md §2.4 "직원 명부 관리 위치").
// 여기서는 명부 자체(이름)의 추가/삭제만 다룬다 — 교대 시작/종료(실시간 개입)는 운영자가
// 이미 보고 있는 방 화면에서 처리한다 (Guest Care와 같은 "트리거 화면 위치" 원칙).
export default function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [venueName, setVenueName] = useState('')
  const [loadError, setLoadError] = useState('')
  const [staff, setStaff] = useState<StaffMember[] | null>(null)

  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState('')

  const loadStaff = useCallback(() => {
    fetch(`/api/venues/${id}/staff`)
      .then(res => res.json())
      .then(data => setStaff(data.staff ?? []))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    fetch(`/api/venues/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue || !data.isOwner) {
          setLoadError('이 매장의 운영자만 직원을 관리할 수 있습니다')
          return
        }
        setVenueName(data.venue.name)
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))

    loadStaff()
  }, [id, loadStaff])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    setActionError('')
    try {
      const res = await fetch(`/api/venues/${id}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStaff(prev => [...(prev ?? []), data.staff])
      setNewName('')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '직원 추가에 실패했습니다')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (staffId: string) => {
    if (!confirm('이 직원을 명부에서 삭제할까요? (과거 교대/투표 기록은 유지됩니다)')) return
    setStaff(prev => (prev ?? []).filter(s => s.id !== staffId))
    const res = await fetch(`/api/venues/${id}/staff`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId }),
    })
    // 실패했으면 지웠다고 착각하지 않도록 목록을 다시 맞춘다 (성공 시엔 재조회 불필요).
    if (!res.ok) loadStaff()
  }

  if (loadError) {
    return <ErrorScreen message={loadError} />
  }

  if (!staff) {
    return <LoadingScreen />
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 60 }}>
      <BackButton onClick={() => router.back()} />

      <PageEyebrowHeader
        eyebrow="OPERATOR"
        title={`${venueName} 직원 명부`}
        subtitle="여기서 추가한 직원이 방 화면의 교대 시작 목록에 나타나요"
        marginBottom={24} titleSize={24} subtitleSize={12}
      />

      {actionError && <InlineMessage type="error" style={{ marginBottom: 16 }}>{actionError}</InlineMessage>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="예: 김민수" maxLength={20} style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={handleAdd} disabled={adding || !newName.trim()} style={{ minHeight: 'auto', padding: '0 16px' }}>추가</button>
      </div>

      {staff.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted2)', textAlign: 'center', marginTop: 24 }}>아직 등록된 직원이 없어요</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {staff.map(s => (
            <div key={s.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
              <button
                type="button"
                aria-label={`${s.name} 삭제`}
                onClick={() => handleRemove(s.id)}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--border)',
                  color: 'var(--accent)', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
