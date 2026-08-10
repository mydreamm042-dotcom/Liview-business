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
  const req = new NextRequest(`http://localhost/api/rooms/${code}/alerts`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

describe('POST /api/rooms/[code]/alerts — 운영자 경고 메시지 (BUSINESS_RULES.md §2.9)', () => {
  it('message가 문자열이 아니면 400 (500이 아님)', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([]))
    const { status } = await callPost('ABC123', { participant_id: 'p1', message: 123 })
    expect(status).toBe(400)
  })

  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPost('ABC123', { participant_id: 'p1', message: '조용히 해주세요' })
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'real-op' } },
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { participant_id: 'p1', message: '조용히 해주세요' })
    expect(status).toBe(403)
  })

  it('이 방 손님이 아니면 404', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { participant_id: 'p1', message: '조용히 해주세요' })
    expect(status).toBe(404)
  })

  it('운영자면 메시지를 보낸다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: { id: 'p1' } },
        { data: { id: 'a1', room_id: 'r1', participant_id: 'p1', message: '조용히 해주세요' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('ABC123', { participant_id: 'p1', message: '조용히 해주세요' })
    expect(status).toBe(200)
    expect(json.alert.message).toBe('조용히 해주세요')
  })
})
