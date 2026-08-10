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
  const res = await GET(new NextRequest(`http://localhost/api/venues/${id}`), { params: Promise.resolve({ id }) })
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
describe('GET /api/venues/[id] — 로그인 세션 기반 소유권 (Operator 도메인 §2.11)', () => {
  it('본인 소유 매장이면 전체 필드를 반환하되 토큰 필드는 없다', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', name: '별빛포차', owner_id: 'u1', operator_owner_token: 'legacy', public_chat_enabled: false } }],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1')
    expect(json.isOwner).toBe(true)
    expect(json.venue.operator_owner_token).toBeUndefined()
    expect(json.venue.name).toBe('별빛포차')
  })

  it('로그인 안 했으면 공개 필드만 반환한다', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', name: '별빛포차' } }], // 공개 필드 조회
      { user: null },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1')
    expect(json.isOwner).toBe(false)
    expect(json.venue.operator_owner_token).toBeUndefined()
  })

  it('로그인했지만 남의 매장이면 공개 필드만 반환한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: null }, // 소유권 불일치로 조회 안됨
        { data: { id: 'v1', name: '별빛포차' } }, // 공개 필드 조회
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { json } = await callGet('v1')
    expect(json.isOwner).toBe(false)
  })
})

describe('PATCH /api/venues/[id] — 소유자 검증 + 필드 화이트리스트', () => {
  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPatch('v1', { name: '해킹당한이름' })
    expect(status).toBe(401)
  })

  it('소유자가 아니면 403이고 아무것도 바뀌지 않는다', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', owner_id: 'real-owner' } }],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('v1', { name: '해킹당한이름' })
    expect(status).toBe(403)
  })

  it('화이트리스트에 없는 필드(operator_owner_token, name 등)는 무시된다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: { id: 'v1', name: '기존이름', address: '새주소', operator_owner_token: 'op-1' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPatch('v1', {
      address: '새주소',
      name: '해킹당한이름', // 화이트리스트 밖(매장명 변경 금지, §2.2) — 무시돼야 함
      operator_owner_token: 'STOLEN', // 화이트리스트 밖 — 무시돼야 함
    })
    expect(status).toBe(200)
    expect(json.venue.operator_owner_token).toBeUndefined()
    expect(json.venue.name).toBe('기존이름')
  })
})
