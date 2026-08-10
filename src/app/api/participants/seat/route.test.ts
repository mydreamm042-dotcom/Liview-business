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

async function callPatch(body: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const req = new NextRequest('http://localhost/api/participants/seat', { method: 'PATCH', body: JSON.stringify(body) })
  const res = await PATCH(req)
  return { status: res.status, json: await res.json() }
}

describe('PATCH /api/participants/seat — 참여자 좌석 선택 (BUSINESS_RULES.md §2.8)', () => {
  it('참여자를 찾을 수 없으면 404', async () => {
    const fake = makeFakeSupabase([{ data: null }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch({ participant_id: 'p1', session_token: 's1', seat_id: 'seat1' })
    expect(status).toBe(404)
  })

  it('매장이 없는 방(venue_id null)이면 400', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1', venue_id: null } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch({ participant_id: 'p1', session_token: 's1', seat_id: 'seat1' })
    expect(status).toBe(400)
    expect(json.error).toContain('좌석')
  })

  it('다른 매장의 좌석이면 400', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1', venue_id: 'v1' } },
      { data: { id: 'seat1', venue_id: 'v2' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch({ participant_id: 'p1', session_token: 's1', seat_id: 'seat1' })
    expect(status).toBe(400)
  })

  it('이미 다른 손님이 앉아있으면 409', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1', venue_id: 'v1' } },
      { data: { id: 'seat1', venue_id: 'v1' } },
      { data: { id: 'p2' } }, // 이미 앉은 사람
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch({ participant_id: 'p1', session_token: 's1', seat_id: 'seat1' })
    expect(status).toBe(409)
  })

  it('빈 좌석이면 배정에 성공한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1', venue_id: 'v1' } },
      { data: { id: 'seat1', venue_id: 'v1' } },
      { data: null }, // 빈 좌석
      { data: { id: 'p1', seat_id: 'seat1' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch({ participant_id: 'p1', session_token: 's1', seat_id: 'seat1' })
    expect(status).toBe(200)
    expect(json.participant.seat_id).toBe('seat1')
  })

  // 사전 occupant 체크는 동시 요청 사이의 틈을 못 막는다 — 두 참여자가 거의 동시에 같은
  // 좌석을 선택해 사전 체크를 둘 다 통과해도, DB 유니크 인덱스(23505)가 최종 방어선이 된다.
  it('동시 요청으로 사전 체크를 통과해도 DB 유니크 제약(23505)이면 409', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1', venue_id: 'v1' } },
      { data: { id: 'seat1', venue_id: 'v1' } },
      { data: null }, // 사전 체크는 통과 (레이스로 인해 빈 것처럼 보임)
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch({ participant_id: 'p1', session_token: 's1', seat_id: 'seat1' })
    expect(status).toBe(409)
    expect(json.error).toContain('이미')
  })
})
