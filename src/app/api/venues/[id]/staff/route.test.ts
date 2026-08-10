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
  const res = await GET(new NextRequest(`http://localhost/api/venues/${id}/staff`), { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callPost(id: string, body: Record<string, unknown>) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/staff`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callDelete(id: string, body: Record<string, unknown>) {
  const { DELETE } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/staff`, { method: 'DELETE', body: JSON.stringify(body) })
  const res = await DELETE(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/venues/[id]/staff', () => {
  it('활성 직원 목록을 반환한다', async () => {
    const fake = makeFakeSupabase([{ data: [{ id: 's1', name: '김민수', is_active: true }] }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('v1')
    expect(status).toBe(200)
    expect(json.staff).toHaveLength(1)
  })
})

describe('POST /api/venues/[id]/staff — 직원 추가', () => {
  it('이름이 없으면 400', async () => {
    const { status } = await callPost('v1', { name: '  ' })
    expect(status).toBe(400)
  })

  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPost('v1', { name: '김민수' })
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', owner_id: 'real-owner' } }],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('v1', { name: '김민수' })
    expect(status).toBe(403)
  })

  it('소유자면 직원을 추가한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: { id: 's1', venue_id: 'v1', name: '김민수', is_active: true } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { name: '김민수' })
    expect(status).toBe(200)
    expect(json.staff.name).toBe('김민수')
  })
})

describe('DELETE /api/venues/[id]/staff — 직원 소프트 삭제', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callDelete('v1', { staff_id: 's1' })
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', owner_id: 'real-owner' } }],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callDelete('v1', { staff_id: 's1' })
    expect(status).toBe(403)
  })

  it('소유자면 is_active를 false로 바꾼다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: null, error: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callDelete('v1', { staff_id: 's1' })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })
})
