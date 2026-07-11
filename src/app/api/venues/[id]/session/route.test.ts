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
  const res = await GET(new NextRequest(`http://localhost/api/venues/${id}/session`), { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callStart(id: string) {
  const { POST } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/session`, { method: 'POST', body: '{}' })
  const res = await POST(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callEnd(id: string) {
  const { DELETE } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/session`, { method: 'DELETE' })
  const res = await DELETE(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/venues/[id]/session', () => {
  it('영업 중이 아니면 session: null', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([{ data: null }]))
    const { status, json } = await callGet('v1')
    expect(status).toBe(200)
    expect(json.session).toBeNull()
  })

  it('로그인 안 했으면 code가 포함되지 않는다', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'room-1', name: '별빛포차 세션', status: 'active', created_at: 't' } }],
      { user: null },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1')
    expect(json.session.code).toBeUndefined()
  })

  it('소유자로 로그인해서 조회하면 code가 포함된다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { owner_id: 'u1' } }, // venue 소유자 확인
        { data: { id: 'room-1', code: 'ABC123', name: '별빛포차 세션', status: 'active', created_at: 't' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1')
    expect(json.session.code).toBe('ABC123')
  })

  it('소유자가 아닌 계정으로 로그인해서 조회하면 code가 빠진다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { owner_id: 'u1' } },
        { data: { id: 'room-1', name: '별빛포차 세션', status: 'active', created_at: 't' } },
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1')
    expect(json.session.code).toBeUndefined()
  })
})

describe('POST /api/venues/[id]/session — 영업 시작', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callStart('v1')
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', name: '별빛포차', owner_id: 'real-owner' } }],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callStart('v1')
    expect(status).toBe(403)
  })

  it('이미 영업 중이면 새로 만들지 않고 기존 세션 반환', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', name: '별빛포차', owner_id: 'u1' } },
        { data: { id: 'room-1', name: '별빛포차 세션', status: 'active' } }, // 이미 있는 active 방
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callStart('v1')
    expect(status).toBe(200)
    expect(json.alreadyOpen).toBe(true)
    expect(json.session.id).toBe('room-1')
  })

  it('영업 중이 아니면 새 BUSINESS 방을 생성한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', name: '별빛포차', owner_id: 'u1' } },
        { data: null }, // 기존 active 세션 없음
        { data: null }, // 방 코드 중복 확인 (없음)
        { data: { id: 'room-2', name: '별빛포차 세션', status: 'active' } }, // insert 결과
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callStart('v1')
    expect(status).toBe(200)
    expect(json.alreadyOpen).toBe(false)
    expect(json.session.status).toBe('active')
  })
})

describe('DELETE /api/venues/[id]/session — 영업 종료', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callEnd('v1')
    expect(status).toBe(401)
  })

  it('진행 중인 영업이 없으면 400', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callEnd('v1')
    expect(status).toBe(400)
  })

  it('영업 중이면 closed로 전이한다 (ended가 아님)', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: { id: 'room-1' } },
        { data: { id: 'room-1', status: 'closed' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callEnd('v1')
    expect(status).toBe(200)
    expect(json.session.status).toBe('closed')
  })
})
