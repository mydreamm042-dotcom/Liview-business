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

async function callGet(participantId: string, sessionToken: string) {
  const { GET } = await import('./route')
  const req = new NextRequest(`http://localhost/api/participants/alerts?participant_id=${participantId}&session_token=${sessionToken}`)
  const res = await GET(req)
  return { status: res.status, json: await res.json() }
}

async function callPatch(body: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const req = new NextRequest('http://localhost/api/participants/alerts', { method: 'PATCH', body: JSON.stringify(body) })
  const res = await PATCH(req)
  return { status: res.status, json: await res.json() }
}

describe('GET /api/participants/alerts', () => {
  it('참여자를 찾을 수 없으면 404', async () => {
    const fake = makeFakeSupabase([{ data: null }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callGet('p1', 's1')
    expect(status).toBe(404)
  })

  it('확인 안 된 메시지가 없으면 alert: null', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1' } },
      { data: null },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('p1', 's1')
    expect(status).toBe(200)
    expect(json.alert).toBeNull()
  })

  it('확인 안 된 메시지가 있으면 반환한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1' } },
      { data: { id: 'a1', message: '조용히 해주세요', created_at: 't' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('p1', 's1')
    expect(json.alert.message).toBe('조용히 해주세요')
  })
})

describe('PATCH /api/participants/alerts — 확인 처리', () => {
  it('참여자를 찾을 수 없으면 404', async () => {
    const fake = makeFakeSupabase([{ data: null }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch({ alert_id: 'a1', participant_id: 'p1', session_token: 's1' })
    expect(status).toBe(404)
  })

  it('확인 처리에 성공한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1' } },
      { data: null, error: null },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch({ alert_id: 'a1', participant_id: 'p1', session_token: 's1' })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })
})
