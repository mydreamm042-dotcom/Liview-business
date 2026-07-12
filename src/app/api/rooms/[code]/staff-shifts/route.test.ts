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
  const res = await GET(new NextRequest(`http://localhost/api/rooms/${code}/staff-shifts`), { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

async function callPost(code: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}/staff-shifts`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

async function callPatch(code: string, body: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const req = new NextRequest(`http://localhost/api/rooms/${code}/staff-shifts`, { method: 'PATCH', body: JSON.stringify(body) })
  const res = await PATCH(req, { params: Promise.resolve({ code }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/rooms/[code]/staff-shifts', () => {
  it('방을 못 찾으면 404', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }]))
    const { status } = await callGet('ABC123')
    expect(status).toBe(404)
  })

  it('교대 목록을 반환한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'r1' } },
      { data: [{ id: 'sh1', staff_id: 's1', started_at: '2026-07-12T10:00:00Z', ended_at: null }] },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('ABC123')
    expect(status).toBe(200)
    expect(json.shifts).toHaveLength(1)
  })
})

describe('POST /api/rooms/[code]/staff-shifts — 교대 시작', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPost('ABC123', { staff_id: 's1' })
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'real-owner' } },
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { staff_id: 's1' })
    expect(status).toBe(403)
  })

  it('이미 근무 중이면 409', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: null, error: { code: '23505' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('ABC123', { staff_id: 's1' })
    expect(status).toBe(409)
  })

  it('소유자면 교대를 시작한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: { id: 'sh1', staff_id: 's1', started_at: '2026-07-12T10:00:00Z', ended_at: null } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('ABC123', { staff_id: 's1' })
    expect(status).toBe(200)
    expect(json.shift.staff_id).toBe('s1')
  })
})

describe('PATCH /api/rooms/[code]/staff-shifts — 교대 종료', () => {
  it('진행 중인 교대가 없으면 404', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: null, error: { message: 'no rows' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('ABC123', { staff_id: 's1' })
    expect(status).toBe(404)
  })

  it('소유자면 교대를 종료한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'r1', venue_id: 'v1' } },
        { data: { owner_id: 'u1' } },
        { data: { id: 'sh1', staff_id: 's1', started_at: '2026-07-12T10:00:00Z', ended_at: '2026-07-12T12:00:00Z' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch('ABC123', { staff_id: 's1' })
    expect(status).toBe(200)
    expect(json.shift.ended_at).not.toBeNull()
  })
})
