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

async function callGet(query: string) {
  const { GET } = await import('./route')
  const res = await GET(new NextRequest(`http://localhost/api/discover/venues${query}`))
  return { status: res.status, json: await res.json() }
}

// BUSINESS_RULES.md §2.6 — Discovery 응답에는 방 코드/QR이 없어야 하며, 위치 없이는 조회 불가
describe('GET /api/discover/venues', () => {
  it('lat/lng이 없으면 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([]))
    const { status } = await callGet('')
    expect(status).toBe(400)
  })

  it('lat/lng이 있으면 get_live_hot_venues RPC를 호출하고 결과를 반환한다', async () => {
    const fakeVenues = [
      { id: 'v1', name: '별빛포차', category: 'pocha', hot_score: 0.8, satisfaction: 4.2, distance_km: 1.2 },
    ]
    const fake = makeFakeSupabase([{ data: fakeVenues, error: null }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)

    const { status, json } = await callGet('?lat=37.5&lng=127.0')

    expect(status).toBe(200)
    expect(json.venues).toEqual(fakeVenues)
    expect(fake.rpc).toHaveBeenCalledWith('get_live_hot_venues', expect.objectContaining({
      p_lat: 37.5,
      p_lng: 127.0,
    }))
    // 응답에 방 코드/QR 관련 필드가 없는지 확인 (Discovery 무결성 규칙)
    expect(json.venues[0].code).toBeUndefined()
    expect(json.venues[0].room_id).toBeUndefined()
  })

  it('category 파라미터를 RPC에 그대로 전달한다', async () => {
    const fake = makeFakeSupabase([{ data: [], error: null }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)

    await callGet('?lat=37.5&lng=127.0&category=bar')

    expect(fake.rpc).toHaveBeenCalledWith('get_live_hot_venues', expect.objectContaining({
      p_category: 'bar',
    }))
  })
})
