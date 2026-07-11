'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSessionToken } from '@/lib/session'

interface ClaimedVenue { id: string; name: string }

// 전환 기간 한정 화면 (Operator 도메인, BUSINESS_RULES.md §2.11). operator_owner_token
// 방식으로 만들어졌던 이 브라우저의 매장을, 방금 로그인한 계정 소유로 가져온다.
export default function ClaimVenuePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [claimed, setClaimed] = useState<ClaimedVenue[] | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/operator/login')
      else setCheckingAuth(false)
    })
  }, [router])

  const handleClaim = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/operator/claim-venue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_owner_token: getSessionToken() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setClaimed(data.venues ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '가져오기에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return <main className="flex min-h-dvh items-center justify-center"><p style={{ color: 'var(--muted2)' }}>확인 중...</p></main>
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>OPERATOR</p>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>기존 매장 가져오기</h1>
        <p style={{ color: 'var(--muted2)', fontSize: 14, marginTop: 6 }}>
          로그인 계정 없이 이 브라우저에서 등록했던 매장이 있다면, 지금 로그인한 계정으로 연결할 수 있어요
        </p>
      </div>

      {claimed === null ? (
        <>
          {error && <p style={{ fontSize: 13, color: '#ff6b6b', marginBottom: 16 }}>{error}</p>}
          <button className="btn btn-primary" onClick={handleClaim} disabled={loading} style={{ opacity: loading ? 0.5 : 1, fontSize: 16 }}>
            {loading ? '확인 중...' : '이 브라우저의 매장 가져오기'}
          </button>
        </>
      ) : claimed.length > 0 ? (
        <div>
          <p style={{ fontSize: 14, color: '#10b981', marginBottom: 16 }}>✓ {claimed.length}개 매장을 연결했어요</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {claimed.map(v => (
              <div key={v.id} className="card" style={{ padding: '12px 16px' }}>{v.name}</div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => router.push('/create')} style={{ fontSize: 16 }}>내 매장으로 이동</button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 14, color: 'var(--muted2)', marginBottom: 24 }}>이 브라우저에 연결된 매장을 찾지 못했어요 (이미 다른 계정으로 가져갔거나, 이 브라우저에서 등록한 적이 없는 경우)</p>
          <button className="btn btn-secondary" onClick={() => router.push('/create')} style={{ fontSize: 16 }}>새 매장 등록하러 가기</button>
        </div>
      )}
    </main>
  )
}
