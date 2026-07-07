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

async function callGet(id: string, operatorToken?: string) {
  const { GET } = await import('./route')
  const url = operatorToken
    ? `http://localhost/api/venues/${id}?operator_token=${operatorToken}`
    : `http://localhost/api/venues/${id}`
  const res = await GET(new NextRequest(url), { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callPatch(id: string, body: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  const res = await PATCH(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

// host_session과 동일한 원칙: operator_owner_token은 어떤 응답에도 노출되면 안 된다
describe('GET /api/venues/[id] — 운영자 토큰 비노출', () => {
  it('운영자 본인 조회는 전체 필드를 반환하되 토큰 필드는 없다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', name: '별빛포차', operator_owner_token: 'op-1', public_chat_enabled: false } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1', 'op-1')
    expect(json.isOwner).toBe(true)
    expect(json.venue.operator_owner_token).toBeUndefined()
    expect(json.venue.name).toBe('별빛포차')
  })

  it('틀린 토큰이면 공개 필드만 반환한다 (운영자 아님)', async () => {
    const fake = makeFakeSupabase([
      { data: null }, // 소유권 불일치로 조회 안됨
      { data: { id: 'v1', name: '별빛포차' } }, // 공개 필드 조회
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1', 'wrong-token')
    expect(json.isOwner).toBe(false)
    expect(json.venue.operator_owner_token).toBeUndefined()
  })
})

describe('PATCH /api/venues/[id] — 소유자 검증 + 필드 화이트리스트', () => {
  it('소유자 토큰이 다르면 403이고 아무것도 바뀌지 않는다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', operator_owner_token: 'real-owner' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('v1', { operator_token: 'impostor', name: '해킹당한이름' })
    expect(status).toBe(403)
  })

  it('화이트리스트에 없는 필드(operator_owner_token 등)는 무시된다', async () => {
    const fake = makeFakeSupabase([
      { data: { id: 'v1', operator_owner_token: 'op-1' } },
      { data: { id: 'v1', name: '새이름', operator_owner_token: 'op-1' } },
    ])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch('v1', {
      operator_token: 'op-1',
      name: '새이름',
      operator_owner_token: 'STOLEN', // 화이트리스트 밖 — 무시돼야 함
    })
    expect(status).toBe(200)
    expect(json.venue.operator_owner_token).toBeUndefined()
  })
})
