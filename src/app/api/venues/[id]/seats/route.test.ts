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

async function callGet(id: string) {
  const { GET } = await import('./route')
  const res = await GET(new NextRequest(`http://localhost/api/venues/${id}/seats`), { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callPost(id: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/seats`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callDelete(id: string, body: Record<string, unknown>) {
  const { DELETE } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/seats`, { method: 'DELETE', body: JSON.stringify(body) })
  const res = await DELETE(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/venues/[id]/seats', () => {
  it('좌석 목록을 정렬 순서대로 반환한다', async () => {
    const fake = makeFakeSupabase([{ data: [{ id: 's1', label: '1번', sort_order: 0 }] }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('v1')
    expect(status).toBe(200)
    expect(json.seats).toHaveLength(1)
  })
})

describe('POST /api/venues/[id]/seats — 좌석 추가', () => {
  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase([{ data: { id: 'v1', operator_owner_token: 'real-owner' } }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('v1', { operator_token: 'impostor', label: '1번' })
    expect(status).toBe(403)
  })

  it('소유자면 좌석을 추가하고 다음 순번을 부여한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', operator_owner_token: 'op-1' } },
      { count: 2 }, // 기존 좌석 수
      { data: { id: 's3', venue_id: 'v1', label: '3번', sort_order: 2 } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { operator_token: 'op-1', label: '3번' })
    expect(status).toBe(200)
    expect(json.seat.sort_order).toBe(2)
  })
})

describe('DELETE /api/venues/[id]/seats — 좌석 삭제', () => {
  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase([{ data: { id: 'v1', operator_owner_token: 'real-owner' } }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callDelete('v1', { operator_token: 'impostor', seat_id: 's1' })
    expect(status).toBe(403)
  })

  it('소유자면 좌석을 삭제한다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', operator_owner_token: 'op-1' } },
      { data: null, error: null },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callDelete('v1', { operator_token: 'op-1', seat_id: 's1' })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })
})
