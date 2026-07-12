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

async function callGet(code: string) {
  const { GET } = await import('./route')
  const res = await GET(new NextRequest(`http://localhost/api/rooms/${code}/staff-evaluations`), { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

async function callPost(code: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}/staff-evaluations`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/rooms/[code]/staff-evaluations', () => {
  it('방을 못 찾으면 404', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }]))
    const { status } = await callGet('ABC123')
    expect(status).toBe(404)
  })

  it('그 방에서 근무한 적 없으면 빈 후보 목록', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1' } },
      { data: [] },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('ABC123')
    expect(status).toBe(200)
    expect(json.candidates).toEqual([])
  })

  it('교대 기록이 있는 직원만 후보로 반환한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1' } },
      { data: [{ staff_id: 's1' }, { staff_id: 's1' }, { staff_id: 's2' }] },
      { data: [{ id: 's1', name: '김민수' }, { id: 's2', name: '이영희' }] },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('ABC123')
    expect(status).toBe(200)
    expect(json.candidates).toHaveLength(2)
  })
})

describe('POST /api/rooms/[code]/staff-evaluations — 투표', () => {
  it('참여자를 못 찾으면 404', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }]))
    const { status } = await callPost('ABC123', { participant_id: 'p1', session_token: 'tok', staff_id: 's1' })
    expect(status).toBe(404)
  })

  it('그 방 참여자가 아니면 403', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'other-room' } },
      { data: { id: 'r1' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { participant_id: 'p1', session_token: 'tok', staff_id: 's1' })
    expect(status).toBe(403)
  })

  it('그 영업일에 근무하지 않은 직원이면 400', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1' } },
      { data: null },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { participant_id: 'p1', session_token: 'tok', staff_id: 's1' })
    expect(status).toBe(400)
  })

  it('이미 투표했으면 409', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1' } },
      { data: { id: 'sh1' } },
      { data: null, error: { code: '23505' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { participant_id: 'p1', session_token: 'tok', staff_id: 's1' })
    expect(status).toBe(409)
  })

  it('정상 투표는 200', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'p1', room_id: 'r1' } },
      { data: { id: 'r1' } },
      { data: { id: 'sh1' } },
      { data: { id: 'ev1', room_id: 'r1', participant_id: 'p1', staff_id: 's1' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('ABC123', { participant_id: 'p1', session_token: 'tok', staff_id: 's1' })
    expect(status).toBe(200)
    expect(json.evaluation.staff_id).toBe('s1')
  })
})
