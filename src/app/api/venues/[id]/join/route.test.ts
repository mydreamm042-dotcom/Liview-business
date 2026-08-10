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

async function callJoin(id: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const res = await POST(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

// 매장 근처 좌표 (반경 50m 기본값 기준 안전하게 안쪽)
const VENUE_LAT = 37.5665
const VENUE_LNG = 126.978
const NEARBY = { lat: 37.5665, lng: 126.9781 } // 약 10m 이내
const FAR_AWAY = { lat: 37.6, lng: 127.05 } // 수 km 밖

describe('POST /api/venues/[id]/join — 고정 QR 입장 (BUSINESS_RULES.md §2.1~2.3)', () => {
  it('위치 정보 없이 요청하면 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([]))
    const { status } = await callJoin('v1', { nickname: '철수', session_token: 's1' })
    expect(status).toBe(400)
  })

  it('매장이 없으면 404', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }]))
    const { status } = await callJoin('v-404', { nickname: '철수', session_token: 's1', ...NEARBY })
    expect(status).toBe(404)
  })

  it('비밀번호가 켜져 있는데 틀리면 403', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', latitude: VENUE_LAT, longitude: VENUE_LNG, join_password_enabled: true, join_password: '금요일', geofence_radius_m: 50 } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callJoin('v1', { nickname: '철수', session_token: 's1', password: '틀림', ...NEARBY })
    expect(status).toBe(403)
    expect(json.error).toContain('비밀번호')
  })

  it('반경을 벗어나면 403 (비밀번호 없이도)', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', latitude: VENUE_LAT, longitude: VENUE_LNG, join_password_enabled: false, join_password: null, geofence_radius_m: 50 } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callJoin('v1', { nickname: '철수', session_token: 's1', ...FAR_AWAY })
    expect(status).toBe(403)
    expect(json.error).toContain('멀리')
  })

  it('영업 시작 전(활성 방 없음)이면 400', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', latitude: VENUE_LAT, longitude: VENUE_LNG, join_password_enabled: false, join_password: null, geofence_radius_m: 50 } },
      { data: null }, // 활성 방 없음
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callJoin('v1', { nickname: '철수', session_token: 's1', ...NEARBY })
    expect(status).toBe(400)
    expect(json.error).toContain('영업')
  })

  it('비밀번호 통과 + 반경 이내 + 영업 중이면 입장 성공, host_session은 응답에 없음', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', latitude: VENUE_LAT, longitude: VENUE_LNG, join_password_enabled: true, join_password: '금요일', geofence_radius_m: 50 } },
      { data: { id: 'room-1', host_session: 'op-1', status: 'active', venue_id: 'v1' } },
      { data: null }, // 기존 참여자 없음
      { data: { id: 'p1', room_id: 'room-1', nickname: '철수' } }, // insert
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callJoin('v1', { nickname: '철수', session_token: 's1', password: '금요일', ...NEARBY })
    expect(status).toBe(200)
    expect(json.room.host_session).toBeUndefined()
    expect(json.participant.nickname).toBe('철수')
  })

  it('위치 미등록 매장은 반경 검사를 건너뛴다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', latitude: null, longitude: null, join_password_enabled: false, join_password: null, geofence_radius_m: 50 } },
      { data: { id: 'room-1', host_session: 'op-1', status: 'active', venue_id: 'v1' } },
      { data: null },
      { data: { id: 'p1', room_id: 'room-1', nickname: '영희' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callJoin('v1', { nickname: '영희', session_token: 's2', ...FAR_AWAY })
    expect(status).toBe(200)
  })
})
