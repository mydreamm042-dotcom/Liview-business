'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureOperatorProfile } from '@/lib/operatorProfile'

// 운영자 회원가입 (Operator 도메인, BUSINESS_RULES.md §2.11). 비밀번호 해시/이메일 인증은
// Supabase Auth가 전담하고, 이 화면은 auth.signUp 호출 + operators 프로필 생성만 담당한다.
export default function OperatorSignupPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false)

  const handleSignup = async () => {
    if (!email.trim() || password.length < 6) {
      setError('이메일과 6자 이상의 비밀번호를 입력해주세요')
      return
    }
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (signUpError) throw new Error(signUpError.message)

      // 이메일 인증이 꺼져있으면 가입 즉시 세션이 생긴다 — 그 자리에서 프로필을 만들고 넘어간다.
      // 켜져있으면 세션이 없어 여기선 프로필을 못 만들고, 로그인 화면에서 첫 로그인 시 만든다.
      if (data.session && data.user) {
        await ensureOperatorProfile(supabase, data.user, displayName.trim() || undefined)
        router.push('/create')
      } else {
        setNeedsEmailConfirm(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '회원가입에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (needsEmailConfirm) {
    return (
      <main className="flex flex-col min-h-dvh px-6 items-center justify-center" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>이메일을 확인해주세요</h1>
        <p style={{ fontSize: 14, color: 'var(--muted2)', marginBottom: 24 }}>{email}로 보낸 인증 메일의 링크를 눌러야 로그인할 수 있어요</p>
        <button className="btn btn-secondary" onClick={() => router.push('/operator/login')}>로그인 화면으로</button>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>OPERATOR</p>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>사장님 회원가입</h1>
        <p style={{ color: 'var(--muted2)', fontSize: 14, marginTop: 6 }}>매장을 관리하려면 계정이 필요해요</p>
      </div>

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>이름 (선택)</label>
      <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="홍길동" style={{ marginBottom: 20 }} />

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>이메일</label>
      <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={{ marginBottom: 20 }} />

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>비밀번호</label>
      <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSignup()}
        placeholder="6자 이상" autoComplete="new-password" />

      {error && <p style={{ marginTop: 12, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}

      <button className="btn btn-primary" onClick={handleSignup} disabled={loading}
        style={{ marginTop: 24, opacity: loading ? 0.5 : 1, fontSize: 17 }}>
        {loading ? '가입 중...' : '가입하기'}
      </button>

      <button className="btn btn-ghost" onClick={() => router.push('/operator/login')} style={{ marginTop: 12, fontSize: 14 }}>
        이미 계정이 있어요
      </button>

      <button className="btn btn-ghost" onClick={() => router.push('/operator/claim')} style={{ marginTop: 4, fontSize: 13, color: 'var(--muted2)' }}>
        기존 매장이 있으신가요? · 매장 가져오기
      </button>
    </main>
  )
}
