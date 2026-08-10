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

async function callPost(id: string, body: Record<string, unknown> = {}) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/dev-join`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

describe('POST /api/venues/[id]/dev-join — 개발/테스트 전용 손님 입장', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPost('v1')
    expect(status).toBe(401)
  })

  it('본인 매장이 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', owner_id: 'real-owner' } }],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('v1')
    expect(status).toBe(403)
  })

  it('영업 중이 아니면 400', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } }, // verifyVenueOwner
        { data: null },                          // active room 없음
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1')
    expect(status).toBe(400)
    expect(json.error).toContain('영업')
  })

  it('성공하면 is_operator=false인 새 참여자 + 새 session_token을 반환한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: { id: 'r1', code: 'ABC123', name: '오늘 영업', status: 'active' } },
        { data: null }, // 기존 참여자 없음
        { data: { id: 'p1', nickname: '테스트손님', is_operator: false } }, // insert
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { nickname: '테스트손님' })
    expect(status).toBe(200)
    expect(json.participant.is_operator).toBe(false)
    expect(json.room.code).toBe('ABC123')
    expect(typeof json.session_token).toBe('string')
    expect(json.session_token.length).toBeGreaterThan(0)
  })
})
