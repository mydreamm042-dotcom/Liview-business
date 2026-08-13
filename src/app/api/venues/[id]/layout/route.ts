import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator, verifyVenueOwner } from '@/lib/server/venueAuth'
import { LayoutItemKind } from '@/lib/supabase/types'

// 자리배치도의 좌석 외 배치 요소 (Seating 도메인 §2.8, Phase 9) — 구역 네모/출입문/텍스트/선.
// 좌석(venue_seats)과 달리 순수 표시용이라 참여자와 연결되지 않는다.
// 조회는 공개(손님 방 화면도 같은 배치를 그려야 함), 쓰기는 매장 소유자만.
// 2026-08-12(ADR-0008): `table` 폐지(box와 기능 중복), `line` 신설, 크기 제한 폐지.

const VALID_KINDS: LayoutItemKind[] = ['box', 'door', 'text', 'line']

// 종류별 기본 크기(캔버스 대비 %) — 운영자가 추가하자마자 드래그/리사이즈로 바꾸므로
// 정교할 필요는 없고, 각 요소가 무엇인지 한눈에 구분되는 정도면 충분하다.
// line의 height는 쓰이지 않는다(두께는 렌더링 상수 LINE_THICKNESS_PX 고정).
const DEFAULT_SIZE: Record<LayoutItemKind, { width: number; height: number }> = {
  box: { width: 24, height: 22 },
  door: { width: 18, height: 6 },
  text: { width: 20, height: 6 },
  line: { width: 40, height: 1 },
}

function clampPct(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// 크기는 하한/상한 없이 받는다 (ADR-0008 "장식 요소 크기 제한 전면 폐지") — 넓거나 다층인
// 매장에서 확대해 아주 작게 배치하는 걸 막지 않기 위함. 음수/NaN만 걸러낸다.
function sanitizeSize(v: number) {
  return Number.isFinite(v) && v > 0 ? v : undefined
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('venue_layout_items')
    .select('id, venue_id, kind, label, position_x, position_y, width, height, rotation, sort_order, created_at')
    .eq('venue_id', id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { kind, label, position_x, position_y, width, height, rotation } = await req.json()

  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: '유효하지 않은 요소 종류입니다' }, { status: 400 })
  }
  // 텍스트는 글자가 곧 내용이라 라벨이 반드시 있어야 한다(빈 텍스트는 화면에서 찾을 수 없음).
  if (kind === 'text' && !String(label ?? '').trim()) {
    return NextResponse.json({ error: '텍스트 내용을 입력해주세요' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const [owner, countResult] = await Promise.all([
    verifyVenueOwner(supabase, id, auth.user.id, '배치를 관리할 수 있습니다'),
    supabase.from('venue_layout_items').select('id', { count: 'exact', head: true }).eq('venue_id', id),
  ])
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const size = DEFAULT_SIZE[kind as LayoutItemKind]

  const { data, error } = await supabase
    .from('venue_layout_items')
    .insert({
      venue_id: id,
      kind,
      label: String(label ?? '').trim().slice(0, 30) || null,
      position_x: typeof position_x === 'number' ? clampPct(position_x, 0, 100) : 50,
      position_y: typeof position_y === 'number' ? clampPct(position_y, 0, 100) : 50,
      width: sanitizeSize(width) ?? size.width,
      height: sanitizeSize(height) ?? size.height,
      rotation: Number.isFinite(rotation) ? rotation : 0,
      sort_order: countResult.count ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// 위치/크기/라벨을 각각 독립적으로 보낼 수 있다 — 드래그 중엔 좌표만, 리사이즈 중엔
// 크기만 보내 왕복을 최소화하기 위함(venue_seats PATCH와 같은 방식).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { item_id, label, position_x, position_y, width, height, rotation } = await req.json()

  if (!item_id) return NextResponse.json({ error: '요소 id가 필요합니다' }, { status: 400 })

  const payload: Record<string, unknown> = {}
  if (typeof label === 'string') payload.label = label.trim().slice(0, 30) || null
  if (typeof position_x === 'number') payload.position_x = clampPct(position_x, 0, 100)
  if (typeof position_y === 'number') payload.position_y = clampPct(position_y, 0, 100)
  if (sanitizeSize(width) !== undefined) payload.width = width
  if (sanitizeSize(height) !== undefined) payload.height = height
  if (Number.isFinite(rotation)) payload.rotation = rotation

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '배치를 관리할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data, error } = await supabase
    .from('venue_layout_items')
    .update(payload)
    .eq('id', item_id)
    .eq('venue_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { item_id } = await req.json()

  if (!item_id) return NextResponse.json({ error: '요소 id가 필요합니다' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '배치를 관리할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { error } = await supabase
    .from('venue_layout_items')
    .delete()
    .eq('id', item_id)
    .eq('venue_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
