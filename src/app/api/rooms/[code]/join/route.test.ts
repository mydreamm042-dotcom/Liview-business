import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeSupabase } from '@/lib/testing/fakeSupabase'

const { mockCreateServerSupabaseClient } = vi.hoisted(() => ({
  mockCreateServerSupabaseClient: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

beforeEach(() => {
  mockCreateServerSupabaseClient.mockReset()
})

async function callJoin(code: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const res = await POST(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

// BUSINESS_RULES.md 2.1 — active가 아닌 방은 입장 불가 (ended/closed 둘 다)
describe('POST /api/rooms/[code]/join — 상태별 입장 차단', () => {
  it('active 방은 정상 입장된다 (회귀 확인)', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', host_session: 'h1', status: 'active' } },
      { data: null }, // 기존 참여자 없음
      { data: { id: 'p1', room_id: 'r1', nickname: '철수' } }, // insert
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callJoin('ABC123', { nickname: '철수', session_token: 's1' })
    expect(status).toBe(200)
  })

  it('ended(PERSONAL 종료) 방은 400 + "종료" 메시지', async () => {
    const fake = makeFakeSupabase([{ data: { id: 'r1', status: 'ended' } }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callJoin('ABC123', { nickname: '철수', session_token: 's1' })
    expect(status).toBe(400)
    expect(json.error).toContain('종료')
  })

  it('closed(BUSINESS 마감) 방은 400 + "마감" 메시지 (ended와 다른 문구)', async () => {
    const fake = makeFakeSupabase([{ data: { id: 'r1', status: 'closed' } }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callJoin('ABC123', { nickname: '철수', session_token: 's1' })
    expect(status).toBe(400)
    expect(json.error).toContain('마감')
  })
})

// BUSINESS_RULES.md §2.1 — BUSINESS 방은 고정 QR(`/v/[id]`) 전용 입장만 허용된다. 이 경로로
// 직접 들어오면 입장 비밀번호/위치 반경 검사(§2.2~2.3)를 통째로 우회하게 되므로 막아야 한다.
describe('POST /api/rooms/[code]/join — BUSINESS 방 코드 입장 차단', () => {
  it('BUSINESS 방은 active 상태여도 코드 입장을 거부한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', room_type: 'BUSINESS', venue_id: 'v1', status: 'active' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callJoin('ABC123', { nickname: '손님', session_token: 's1' })
    expect(status).toBe(400)
    expect(json.error).toMatch(/QR/)
  })
})
