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
  const req = new NextRequest(`http://localhost/api/venues/${id}/layout`, { method: 'POST', body: JSON.stringify(body) })
  const res = await POST(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callPatch(id: string, body: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/layout`, { method: 'PATCH', body: JSON.stringify(body) })
  const res = await PATCH(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

describe('POST /api/venues/[id]/layout — 배치 요소 추가', () => {
  it('유효하지 않은 종류는 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: { id: 'u1' } }))
    const { status } = await callPost('v1', { kind: 'chair' })
    expect(status).toBe(400)
  })

  // ADR-0008: table 폐지(box와 기능 중복), line 신설
  it('폐지된 table 종류는 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: { id: 'u1' } }))
    const { status } = await callPost('v1', { kind: 'table' })
    expect(status).toBe(400)
  })

  it('신설된 line 종류는 허용된다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { count: 0 },
        { data: { id: 'l1', kind: 'line' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { kind: 'line' })
    expect(status).toBe(200)
    expect(json.item.kind).toBe('line')
  })

  it('텍스트는 내용이 비어있으면 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: { id: 'u1' } }))
    const { status } = await callPost('v1', { kind: 'text', label: '  ' })
    expect(status).toBe(400)
  })

  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPost('v1', { kind: 'box' })
    expect(status).toBe(401)
  })

  it('본인 매장이 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'real-owner' } }, // verifyVenueOwner
        { count: 0 },                                    // 기존 개수(병렬 호출)
      ],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPost('v1', { kind: 'box' })
    expect(status).toBe(403)
  })

  it('성공하면 종류별 기본 크기로 만들어진다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { count: 2 },
        { data: { id: 'l1', kind: 'door', label: '출입문', width: 18, height: 6 } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPost('v1', { kind: 'door', label: '출입문' })
    expect(status).toBe(200)
    expect(json.item.kind).toBe('door')
  })
})

describe('PATCH /api/venues/[id]/layout — 위치/크기/라벨 수정', () => {
  it('바꿀 항목이 하나도 없으면 400', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: { id: 'u1' } }))
    const { status } = await callPatch('v1', { item_id: 'l1' })
    expect(status).toBe(400)
  })

  // ADR-0008로 최소/최대 크기 제한을 폐지했다 — 넓거나 다층인 매장에서 확대해 아주 작게
  // 배치하는 걸 막지 않기 위함. 아주 작은 값도 그대로 저장돼야 한다.
  it('아주 작은 크기도 그대로 저장된다 (크기 제한 폐지, ADR-0008)', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } }, // verifyVenueOwner
        { data: { id: 'l1', width: 0.5 } },     // update 결과
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('v1', { item_id: 'l1', width: 0.5 })
    expect(status).toBe(200)
    expect(fake._updated[0]).toEqual({ width: 0.5 })
  })

  it('0 이하 크기는 무시한다 (요소가 사라져 다시 못 고치는 상태 방지)', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: { id: 'l1' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('v1', { item_id: 'l1', width: 0, height: 12 })
    expect(status).toBe(200)
    expect(fake._updated[0]).toEqual({ height: 12 })
  })

  it('선 회전각을 저장한다 (line 신설, ADR-0008)', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: { id: 'l1', rotation: 45 } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPatch('v1', { item_id: 'l1', rotation: 45 })
    expect(status).toBe(200)
    expect(fake._updated[0]).toEqual({ rotation: 45 })
  })

  it('위치는 캔버스 밖으로 못 나간다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: { id: 'l1' } },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    await callPatch('v1', { item_id: 'l1', position_x: 140, position_y: -20 })
    expect(fake._updated[0]).toEqual({ position_x: 100, position_y: 0 })
  })
})
