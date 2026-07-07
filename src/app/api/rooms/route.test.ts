import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeSupabase } from '@/lib/testing/fakeSupabase'

const { mockCreateServerSupabaseClient } = vi.hoisted(() => ({
  mockCreateServerSupabaseClient: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

async function callPost(body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest('http://localhost/api/rooms', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  mockCreateServerSupabaseClient.mockReset()
})

// BUSINESS_RULES.md 2.1 — room_type 미지정은 PERSONAL로 간주 (하위 호환)
describe('POST /api/rooms — room_type 기본값 (PERSONAL 회귀 확인)', () => {
  it('room_type을 보내지 않으면 매장 조회 없이 PERSONAL 방이 만들어진다', async () => {
    const fake = makeFakeSupabase([
      { data: null }, // 코드 중복 확인 (없음 -> 통과)
      { data: { id: 'room-1', code: 'ABC123', name: '회식', host_session: 'host-1', status: 'active', room_type: 'PERSONAL', venue_id: null } },
      { data: { id: 'p-1', room_id: 'room-1', nickname: '호스트' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)

    const { status, json } = await callPost({ name: '회식', host_session: 'host-1' })

    expect(status).toBe(200)
    expect(json.room.room_type).toBe('PERSONAL')
    expect(json.room.venue_id).toBeNull()
    // host_session은 응답에 절대 포함되지 않아야 한다 (기존 원칙)
    expect(json.room.host_session).toBeUndefined()
    expect(fake.from).not.toHaveBeenCalledWith('venues')
  })
})

describe('POST /api/rooms — BUSINESS 방 매장 소유 검증', () => {
  it('venue_id 없이 BUSINESS를 요청하면 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([]))
    const { status, json } = await callPost({ name: '금요일 밤', host_session: 'op-1', room_type: 'BUSINESS' })
    expect(status).toBe(400)
    expect(json.error).toContain('매장')
  })

  it('존재하지 않는 venue_id면 404', async () => {
    const fake = makeFakeSupabase([{ data: null }]) // venue 조회 결과 없음
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost({ name: '금요일 밤', host_session: 'op-1', room_type: 'BUSINESS', venue_id: 'v-404' })
    expect(status).toBe(404)
  })

  it('매장 운영자 토큰이 host_session과 다르면 403 (타인이 남의 매장에 방을 못 만듦)', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v-1', operator_owner_token: 'real-owner' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost({ name: '금요일 밤', host_session: 'impostor', room_type: 'BUSINESS', venue_id: 'v-1' })
    expect(status).toBe(403)
    expect(json.error).toContain('운영자')
  })

  it('정당한 운영자면 BUSINESS 방이 venue_id와 함께 생성된다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v-1', operator_owner_token: 'op-1' } }, // venue 조회
      { data: null }, // 코드 중복 확인
      { data: { id: 'room-1', code: 'XYZ789', name: '금요일 밤', host_session: 'op-1', status: 'active', room_type: 'BUSINESS', venue_id: 'v-1' } },
      { data: { id: 'p-1', room_id: 'room-1', nickname: '호스트' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost({ name: '금요일 밤', host_session: 'op-1', room_type: 'BUSINESS', venue_id: 'v-1' })
    expect(status).toBe(200)
    expect(json.room.room_type).toBe('BUSINESS')
    expect(json.room.venue_id).toBe('v-1')
  })

  it('room_type이 PERSONAL/BUSINESS 이외면 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([]))
    const { status } = await callPost({ name: 'x', host_session: 'h', room_type: 'ENTERPRISE' })
    expect(status).toBe(400)
  })
})
