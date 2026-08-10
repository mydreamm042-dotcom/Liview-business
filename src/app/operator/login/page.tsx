'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureOperatorProfile } from '@/lib/operatorProfile'
import PageEyebrowHeader from '@/components/PageEyebrowHeader'

// 운영자 로그인 (Operator 도메인, BUSINESS_RULES.md §2.11).
export default function OperatorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해주세요')
      return
    }
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다')
      if (data.user) await ensureOperatorProfile(supabase, data.user)
      router.push('/create')
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <PageEyebrowHeader eyebrow="OPERATOR" title="사장님 로그인" />

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>이메일</label>
      <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={{ marginBottom: 20 }} />

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>비밀번호</label>
      <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleLogin()}
        placeholder="비밀번호" autoComplete="current-password" />

      {error && <p style={{ marginTop: 12, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}

      <button className="btn btn-primary" onClick={handleLogin} disabled={loading}
        style={{ marginTop: 24, opacity: loading ? 0.5 : 1, fontSize: 17 }}>
        {loading ? '로그인 중...' : '로그인'}
      </button>

      <button className="btn btn-ghost" onClick={() => router.push('/operator/signup')} style={{ marginTop: 12, fontSize: 14 }}>
        계정이 없어요 · 회원가입
      </button>

      <button className="btn btn-ghost" onClick={() => router.push('/operator/claim')} style={{ marginTop: 4, fontSize: 13, color: 'var(--muted2)' }}>
        기존 매장이 있으신가요? · 매장 가져오기
      </button>
    </main>
  )
}
