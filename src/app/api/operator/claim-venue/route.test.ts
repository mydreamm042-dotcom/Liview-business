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
  const req = new NextRequest('http://localhost/api/operator/claim-venue', { method: 'POST', body: JSON.stringify(body) })
  return POST(req)
}

describe('POST /api/operator/claim-venue', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const res = await callPost({ operator_owner_token: 'old-token' })
    expect(res.status).toBe(401)
  })

  it('토큰이 없으면 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: { id: 'u1' } }))
    const res = await callPost({})
    expect(res.status).toBe(400)
  })

  it('일치하는 매장을 owner_id로 연결한다', async () => {
    const fake = makeFakeSupabase(
      [{ data: [{ id: 'v1', name: '별빛포차' }] }],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const res = await callPost({ operator_owner_token: 'old-token' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.venues).toEqual([{ id: 'v1', name: '별빛포차' }])
  })
})
