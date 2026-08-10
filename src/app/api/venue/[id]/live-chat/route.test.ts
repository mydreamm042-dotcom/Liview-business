import { describe, it, expect, vi, beforeEach } from 'vitest'
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

async function callGet(id: string) {
  const { GET } = await import('./route')
  const req = new (await import('next/server')).NextRequest(`http://localhost/api/venue/${id}/live-chat`)
  const res = await GET(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

// BUSINESS_RULES.md §2.5 — 기본 비활성화, opt-in 매장만 공개, active 방만 노출
describe('GET /api/venue/[id]/live-chat', () => {
  it('매장이 없으면 404', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }]))
    const { status } = await callGet('v-404')
    expect(status).toBe(404)
  })

  it('public_chat_enabled가 false면 403', async () => {
    const fake = makeFakeSupabase([{ data: { id: 'v1', public_chat_enabled: false } }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callGet('v1')
    expect(status).toBe(403)
  })

  it('opt-in 매장인데 active 방이 없으면 빈 배열', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', public_chat_enabled: true } },
      { data: null }, // active room 없음
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('v1')
    expect(status).toBe(200)
    expect(json.messages).toEqual([])
  })

  it('opt-in 매장 + active 방이면 메시지를 반환하고 개인 식별 정보는 없다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', public_chat_enabled: true } },
      { data: { id: 'room-1' } },
      { data: [{ sender_nickname: '철수', content: '분위기 좋다', created_at: '2026-01-01T00:00:00Z' }], error: null },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('v1')
    expect(status).toBe(200)
    expect(json.messages[0].sender_nickname).toBe('철수')
    expect(json.messages[0].phone_number).toBeUndefined()
  })
})
