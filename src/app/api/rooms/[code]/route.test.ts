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

async function callGet(code: string, sessionToken?: string) {
  const { GET } = await import('./route')
  const url = sessionToken
    ? `http://localhost/api/rooms/${code}?session_token=${sessionToken}`
    : `http://localhost/api/rooms/${code}`
  const req = new NextRequest(url)
  const res = await GET(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

async function callPatch(code: string, body: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  const res = await PATCH(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/rooms/[code] — 매장 브랜딩 동봉', () => {
  it('PERSONAL 방은 venue가 null이고 venues 테이블을 조회하지 않는다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', host_session: 'h1', room_type: 'PERSONAL', venue_id: null }, error: null },
      { data: [] }, // participants
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('ABC123')
    expect(status).toBe(200)
    expect(json.venue).toBeNull()
    expect(fake.from).not.toHaveBeenCalledWith('venues')
  })

  it('BUSINESS 방은 매장 브랜딩을 함께 반환한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', host_session: 'h1', room_type: 'BUSINESS', venue_id: 'v1' }, error: null },
      { data: [] }, // participants
      { data: { id: 'v1', name: '별빛포차', primary_color: '#111' } }, // venue
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('ABC123')
    expect(json.venue).toEqual({ id: 'v1', name: '별빛포차', primary_color: '#111' })
  })
})

// BUSINESS_RULES.md 2.1 — BUSINESS 방은 ended가 아니라 closed로 전이, 절대 삭제되지 않음
describe('PATCH /api/rooms/[code] — 마감(closed) 매핑', () => {
  it('PERSONAL 방은 기존과 동일하게 ended로 전이한다 (회귀 확인)', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', host_session: 'host-1', room_type: 'PERSONAL' } },
      { data: { id: 'r1', status: 'ended', room_type: 'PERSONAL' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch('ABC123', { host_session: 'host-1', status: 'ended' })
    expect(status).toBe(200)
    expect(json.room.status).toBe('ended')
  })

  it('BUSINESS 방에 ended를 보내면 서버가 closed로 매핑한다 (클라이언트 수정 불필요)', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', host_session: 'op-1', room_type: 'BUSINESS' } },
      { data: { id: 'r1', status: 'closed', room_type: 'BUSINESS' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callPatch('ABC123', { host_session: 'op-1', status: 'ended' })
    expect(json.room.status).toBe('closed')
  })

  it('호스트가 아니면 403이고 상태는 바뀌지 않는다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', host_session: 'real-host', room_type: 'PERSONAL' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('ABC123', { host_session: 'impostor', status: 'ended' })
    expect(status).toBe(403)
  })
})
