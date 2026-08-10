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

async function callGet(id: string, query = '') {
  const { GET } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/dashboard${query}`)
  const res = await GET(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

// Operator Analytics 도메인(BUSINESS_RULES.md §2.10 "Phase 5") — 운영자 본인 매장만 조회 가능
describe('GET /api/venues/[id]/dashboard', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callGet('v1')
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', owner_id: 'real-owner' } }],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callGet('v1')
    expect(status).toBe(403)
  })

  it('소유자면 RPC 결과를 반환한다', async () => {
    const dashboard = {
      total_sessions: 3, total_guest_visits: 30, unique_guests: 25, returning_guest_count: 5,
      avg_guests_per_session: 10, avg_star: 4.2, avg_hot_density: 1.5,
      daily: [], best_by_hot_density: [], best_by_star: [], best_by_guests: [], weekday_pattern: [],
    }
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: dashboard, error: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('v1')
    expect(status).toBe(200)
    expect(json.dashboard.total_sessions).toBe(3)
    expect(fake.rpc).toHaveBeenCalledWith('get_operator_dashboard', { p_venue_id: 'v1', p_days: 90 })
  })

  it('days 쿼리 파라미터를 RPC에 전달한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: {}, error: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    await callGet('v1', '?days=30')
    expect(fake.rpc).toHaveBeenCalledWith('get_operator_dashboard', { p_venue_id: 'v1', p_days: 30 })
  })
})
