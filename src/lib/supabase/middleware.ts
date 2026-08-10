import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// @supabase/ssr 필수 패턴: 매 요청마다 세션 쿠키를 갱신해줘야 로그인이 access token
// 만료 시각에 조용히 끊기지 않는다 (Operator 도메인, BUSINESS_RULES.md §2.11).
// PERSONAL 방의 host_session(익명 토큰)과는 무관 — 여긴 Supabase Auth 세션만 다룬다.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 반환값은 안 쓰지만, 이 호출 자체가 만료된 토큰을 갱신하고 위 setAll을 트리거한다.
  await supabase.auth.getUser()

  return supabaseResponse
}
