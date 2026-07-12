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

function dayFor(weekday: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    weekday,
    is_closed: false,
    is_24h: false,
    open_time: '18:00',
    close_time: '02:00',
    last_order_time: null,
    ...overrides,
  }
}

function allSevenDays(overrides: Partial<Record<string, unknown>> = {}) {
  return Array.from({ length: 7 }, (_, weekday) => dayFor(weekday, overrides))
}

async function callGet(id: string) {
  const { GET } = await import('./route')
  const res = await GET(new NextRequest(`http://localhost/api/venues/${id}/business-hours`), { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

async function callPut(id: string, body: Record<string, unknown>) {
  const { PUT } = await import('./route')
  const req = new NextRequest(`http://localhost/api/venues/${id}/business-hours`, { method: 'PUT', body: JSON.stringify(body) })
  const res = await PUT(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/venues/[id]/business-hours', () => {
  it('설정 안 된 매장은 빈 배열을 반환한다', async () => {
    const fake = makeFakeSupabase([{ data: [] }])
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callGet('v1')
    expect(status).toBe(200)
    expect(json.hours).toEqual([])
  })
})

describe('PUT /api/venues/[id]/business-hours — 저장/유효성 검사', () => {
  it('7일이 아니면 400', async () => {
    const { status } = await callPut('v1', { hours: allSevenDays().slice(0, 6) })
    expect(status).toBe(400)
  })

  it('요일 값이 중복되면 400', async () => {
    const hours = allSevenDays()
    hours[1] = { ...hours[1], weekday: 0 }
    const { status } = await callPut('v1', { hours })
    expect(status).toBe(400)
  })

  it('시작/종료 시간이 같으면 400', async () => {
    const hours = allSevenDays({ open_time: '18:00', close_time: '18:00' })
    const { status, json } = await callPut('v1', { hours })
    expect(status).toBe(400)
    expect(json.error).toContain('같을 수 없습니다')
  })

  it('자정을 넘는 영업에서 라스트오더가 시간 밖이면 400', async () => {
    // 18:00~02:00 영업인데 라스트오더가 10:00 (영업시간 밖)
    const hours = allSevenDays({ open_time: '18:00', close_time: '02:00', last_order_time: '10:00' })
    const { status, json } = await callPut('v1', { hours })
    expect(status).toBe(400)
    expect(json.error).toContain('라스트 오더')
  })

  it('자정을 넘는 영업에서 라스트오더가 시간 안이면(익일 새벽) 통과한다', async () => {
    const hours = allSevenDays({ open_time: '14:00', close_time: '04:00', last_order_time: '03:00' })
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: null, error: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPut('v1', { hours })
    expect(status).toBe(200)
  })

  it('로그인 안 했으면 401', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(makeFakeSupabase([], { user: null }))
    const { status } = await callPut('v1', { hours: allSevenDays() })
    expect(status).toBe(401)
  })

  it('운영자가 아니면 403', async () => {
    const fake = makeFakeSupabase(
      [{ data: { id: 'v1', owner_id: 'real-owner' } }],
      { user: { id: 'impostor' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPut('v1', { hours: allSevenDays() })
    expect(status).toBe(403)
  })

  it('정기휴무 요일은 시간 필드를 무시하고 저장된다', async () => {
    const hours = allSevenDays({ is_closed: true, open_time: '', close_time: '' })
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: null, error: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status } = await callPut('v1', { hours })
    expect(status).toBe(200)
  })

  it('소유자면 저장에 성공한다', async () => {
    const fake = makeFakeSupabase(
      [
        { data: { id: 'v1', owner_id: 'u1' } },
        { data: null, error: null },
      ],
      { user: { id: 'u1' } },
    )
    mockCreateServerSupabaseClient.mockResolvedValue(fake)
    const { status, json } = await callPut('v1', { hours: allSevenDays() })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })
})
