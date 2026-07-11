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

async function callPost(code: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}/operator-join`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

describe('POST /api/rooms/[code]/operator-join', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPost('ABC123', { session_token: 's1' })
    expect(status).toBe(401)
  })

  it('방을 찾을 수 없으면 404', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }], { user: { id: 'u1' } }))
    const { status } = await callPost('ABC123', { session_token: 's1' })
    expect(status).toBe(404)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1', status: 'active' } },
        { data: { owner_id: 'real-op' } },
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { session_token: 's1' })
    expect(status).toBe(403)
  })

  it('영업 중이 아니면 400', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1', status: 'closed' } },
        { data: { owner_id: 'u1' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { session_token: 's1' })
    expect(status).toBe(400)
  })

  it('운영자면 "사장님" 닉네임으로 참여자 등록에 성공한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1', status: 'active' } },
        { data: { owner_id: 'u1' } },
        { data: null }, // 기존 참여자 없음 (joinOrReviveParticipant 내부)
        { data: { id: 'p1', room_id: 'r1', nickname: '사장님', session_token: 's1' } }, // insert
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('ABC123', { session_token: 's1' })
    expect(status).toBe(200)
    expect(json.participant.nickname).toBe('사장님')
    expect(json.room.host_session).toBeUndefined()
  })
})
