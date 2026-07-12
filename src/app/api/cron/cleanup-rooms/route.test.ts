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
  delete process.env.CRON_SECRET
})

async function callGet(headers: Record<string, string> = {}) {
  const { GET } = await import('./route')
  const req = new NextRequest('http://localhost/api/cron/cleanup-rooms', { headers })
  const res = await GET(req)
  return { status: res.status, json: await res.json() }
}

// Phase 5.5 — 하루 1회(새벽 5시) 배치에 PERSONAL 방 정리 + BUSINESS 방 자동 마감을 함께 묶는다
describe('GET /api/cron/cleanup-rooms', () => {
  it('CRON_SECRET이 설정돼 있는데 헤더가 다르면 401', async () => {
    process.env.CRON_SECRET = 'secret'
    const { status } = await callGet({ authorization: 'Bearer wrong' })
    expect(status).toBe(401)
  })

  it('delete_old_rooms와 close_scheduled_business_sessions을 둘 다 호출한다', async () => {
    const fake = makeFakeSupabase([{ data: null, error: null }, { data: null, error: null }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callGet()
    expect(status).toBe(200)
    expect(fake.rpc).toHaveBeenCalledWith('delete_old_rooms')
    expect(fake.rpc).toHaveBeenCalledWith('close_scheduled_business_sessions')
  })
})
