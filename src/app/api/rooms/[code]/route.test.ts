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

async function callGet(code: string) {
  const { GET } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}`)
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

describe('GET /api/rooms/[code] — 매장 브랜딩 동봉 + isHost 판정', () => {
  it('매장 브랜딩과 좌석 목록을 함께 반환하고, owner_id는 응답에서 빠진다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', host_session: 'u1', venue_id: 'v1', created_at: '2026-07-23T10:00:00Z' }, error: null },
        { data: [] }, // participants
        { data: { id: 'v1', name: '별빛포차', primary_color: '#111', owner_id: 'u1' } }, // venue
        { data: [{ id: 's1', venue_id: 'v1', label: '1번 테이블', sort_order: 0 }] }, // seats
        { data: { weekday: 4, is_closed: false, is_24h: false, open_time: '18:00', close_time: '02:00', last_order_time: '01:00' } }, // 오늘 영업시간
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('ABC123')
    expect(json.venue).toEqual({ id: 'v1', name: '별빛포차', primary_color: '#111' })
    expect(json.seats).toEqual([{ id: 's1', venue_id: 'v1', label: '1번 테이블', sort_order: 0 }])
    expect(json.isHost).toBe(true)
    // 방 화면의 "마감 시간 · 라스트오더" 표시용으로 그 영업일의 영업시간을 함께 내려준다
    expect(json.businessHours.last_order_time).toBe('01:00')
  })

  it('로그인 안 했으면 isHost는 false다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', host_session: 'u1', venue_id: 'v1', created_at: '2026-07-23T10:00:00Z' }, error: null },
        { data: [] },
        { data: { id: 'v1', name: '별빛포차', owner_id: 'u1' } },
        { data: [] },
        { data: null }, // 영업시간 미설정 매장
      ],
      { user: null },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('ABC123')
    expect(json.isHost).toBe(false)
  })
})

// BUSINESS_RULES.md §2.1 — BUSINESS 방은 ended가 아니라 closed로 전이, 절대 삭제되지 않음
describe('PATCH /api/rooms/[code] — 마감(closed) 매핑', () => {
  it('ended를 보내면 서버가 closed로 매핑한다 (로그인 세션으로 소유자 확인)', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', host_session: 'u1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: { id: 'r1', status: 'closed' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callPatch('ABC123', { status: 'ended' })
    expect(json.room.status).toBe('closed')
  })

  it('로그인 계정이 소유자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', host_session: 'u1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('ABC123', { status: 'ended' })
    expect(status).toBe(403)
  })

  it('로그인 안 했으면 403', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', host_session: 'u1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
      ],
      { user: null },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('ABC123', { status: 'ended' })
    expect(status).toBe(403)
  })
})
