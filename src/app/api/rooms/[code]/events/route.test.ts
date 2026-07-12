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
  const res = await GET(new NextRequest(`http://localhost/api/rooms/${code}/events`), { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

async function callPost(code: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}/events`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/rooms/[code]/events', () => {
  it('방을 못 찾으면 404', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }]))
    const { status } = await callGet('ABC123')
    expect(status).toBe(404)
  })

  it('메모 목록을 시간순으로 반환한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1' } },
      { data: [{ id: 'e1', content: '게임 시작', created_at: '2026-07-12T10:00:00Z' }] },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('ABC123')
    expect(status).toBe(200)
    expect(json.events).toHaveLength(1)
  })
})

describe('POST /api/rooms/[code]/events — 메모 추가', () => {
  it('내용이 없으면 400', async () => {
    const { status } = await callPost('ABC123', { content: '  ' })
    expect(status).toBe(400)
  })

  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPost('ABC123', { content: '음악 변경' })
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'real-owner' } },
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { content: '음악 변경' })
    expect(status).toBe(403)
  })

  it('소유자면 메모를 남긴다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: { id: 'e1', room_id: 'r1', content: '음악 변경', created_at: '2026-07-12T10:00:00Z' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('ABC123', { content: '음악 변경' })
    expect(status).toBe(200)
    expect(json.event.content).toBe('음악 변경')
  })
})
