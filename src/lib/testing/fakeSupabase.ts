import { vi } from 'vitest'

// 실제 Postgres/Supabase 없이 API 라우트 핸들러의 분기 로직만 검증하기 위한 가짜 클라이언트.
// 라우트가 호출하는 순서대로 응답을 큐에 넣어두면, .single()/.maybeSingle()/그냥 await
// 어디서 걸리든 큐에서 다음 응답을 꺼내 돌려준다 (체이닝 메서드는 전부 this를 반환).
//
// 주의: 이건 쿼리 내용(어떤 테이블/조건인지)을 검증하지 않고 "호출 순서"만 신뢰한다.
// 그래서 각 테스트는 라우트 코드가 실제로 호출하는 순서와 정확히 같은 순서로 응답을
// 큐에 넣어야 한다 (라우트 파일을 같이 읽으면서 맞추는 걸 권장).
export function makeFakeSupabase(
  responses: Array<{ data?: unknown; error?: unknown; count?: number }>,
  options: { user?: { id: string } | null } = {},
) {
  let i = 0
  const next = () => {
    if (i >= responses.length) {
      throw new Error(`fakeSupabase: 큐에 준비된 응답보다 더 많은 쿼리가 호출됐습니다 (index ${i})`)
    }
    return responses[i++]
  }

  const builder: Record<string, unknown> = {}
  const chain = () => builder
  Object.assign(builder, {
    select: chain,
    eq: chain,
    neq: chain,
    is: chain,
    gte: chain,
    order: chain,
    limit: chain,
    insert: chain,
    update: chain,
    delete: chain,
    single: () => Promise.resolve(next()),
    maybeSingle: () => Promise.resolve(next()),
    then: (resolve: (v: unknown) => unknown) => resolve(next()),
  })

  const user = options.user ?? null

  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(() => Promise.resolve(next())),
    // Operator 도메인(§2.11) 라우트가 쓰는 인증 신원. 큐를 소비하지 않는다 — 세션 확인은
    // DB 쿼리가 아니라 미들웨어가 이미 검증해둔 쿠키를 읽는 것뿐이라 응답 큐와 분리한다.
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })) },
    _remaining: () => responses.length - i,
  }
}

export type FakeSupabase = ReturnType<typeof makeFakeSupabase>
