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

async function callPost(id: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/qna`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const res = await POST(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

describe('POST /api/venues/[id]/qna — 외부 QnA 채널', () => {
  it('영업 중이 아니면 400', async () => {
    const fake = makeFakeSupabase([{ data: null }]) // active room 없음
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { session_token: 's1', nickname: '길동', content: '자리 있나요?' })
    expect(status).toBe(400)
    expect(json.error).toContain('영업')
  })

  it('입장 안 한 외부인은 닉네임이 없으면 400', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1' } },  // active room
      { data: null },          // 참여자 아님 → 외부인
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('v1', { session_token: 's1', content: '자리 있나요?' })
    expect(status).toBe(400)
  })

  it('외부인이 쿨타임에 걸리면 429와 남은 시간을 돌려준다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1' } },
      { data: null },
      { data: { cooldown: true, retry_after_seconds: 42 } }, // submit_venue_qna RPC
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { session_token: 's1', nickname: '길동', content: '자리 있나요?' })
    expect(status).toBe(429)
    expect(json.retry_after_seconds).toBe(42)
  })

  it('입장한 손님이 쓰면 쿨타임 없이 참여자로 기록된다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1' } },
      { data: { id: 'p1', nickname: '이미앉은손님' } }, // 이 방 참여자
      { data: { cooldown: false, message: { id: 'q1', content: '네 있어요', is_external: false } } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { session_token: 's1', content: '네 있어요' })
    expect(status).toBe(200)
    expect(json.message.is_external).toBe(false)
  })
})
