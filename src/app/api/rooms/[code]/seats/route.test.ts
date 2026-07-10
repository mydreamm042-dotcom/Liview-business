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

async function callPatch(code: string, body: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}/seats`, { method: 'PATCH', body: JSON.stringify(body) })
  const res = await PATCH(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

describe('PATCH /api/rooms/[code]/seats — 운영자 좌석 강제 이동 (BUSINESS_RULES.md §2.8)', () => {
  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase([{ data: { id: 'r1', venue_id: 'v1', host_session: 'real-op' } }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('ABC123', { operator_token: 'impostor', participant_id: 'p1', seat_id: 's1' })
    expect(status).toBe(403)
  })

  it('이미 다른 손님이 앉아있으면 409', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', venue_id: 'v1', host_session: 'op-1' } },
      { data: { id: 's1', venue_id: 'v1' } },
      { data: { id: 'p2' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('ABC123', { operator_token: 'op-1', participant_id: 'p1', seat_id: 's1' })
    expect(status).toBe(409)
  })

  it('운영자면 좌석을 옮기고 착석 타이머를 리셋한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', venue_id: 'v1', host_session: 'op-1' } },
      { data: { id: 's1', venue_id: 'v1' } },
      { data: null }, // 빈 좌석
      { data: { id: 'p1', seat_id: 's1', seat_assigned_at: '2026-01-01T00:00:00Z' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch('ABC123', { operator_token: 'op-1', participant_id: 'p1', seat_id: 's1' })
    expect(status).toBe(200)
    expect(json.participant.seat_id).toBe('s1')
  })

  it('동시 요청으로 사전 체크를 통과해도 DB 유니크 제약(23505)이면 409', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1', venue_id: 'v1', host_session: 'op-1' } },
      { data: { id: 's1', venue_id: 'v1' } },
      { data: null }, // 사전 체크는 통과 (레이스로 인해 빈 것처럼 보임)
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch('ABC123', { operator_token: 'op-1', participant_id: 'p1', seat_id: 's1' })
    expect(status).toBe(409)
    expect(json.error).toContain('이미')
  })
})
