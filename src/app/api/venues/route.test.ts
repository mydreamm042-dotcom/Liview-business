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

async function callPost(body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest('http://localhost/api/venues', { method: 'POST', body: JSON.stringify(body) })
  return POST(req)
}

async function callGet() {
  const { GET } = await import('./route')
  return GET()
}

describe('POST /api/venues — 매장 등록', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const res = await callPost({ name: '별빛포차' })
    expect(res.status).toBe(401)
  })

  it('로그인했으면 owner_id로 등록된다', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', name: '별빛포차', owner_id: 'u1', operator_owner_token: null } }],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const res = await callPost({ name: '별빛포차' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.venue.owner_id).toBe('u1')
    expect(json.venue.operator_owner_token).toBeUndefined()
  })
})

describe('GET /api/venues — 내 매장 목록', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const res = await callGet()
    expect(res.status).toBe(401)
  })

  it('로그인한 계정 소유 매장만 반환한다', async () => {
    const fake = makeFakeSupabase(
      [{ data: [{ id: 'v1', name: '별빛포차', owner_id: 'u1' }] }],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const res = await callGet()
    const json = await res.json()
    expect(json.venues).toHaveLength(1)
  })
})
