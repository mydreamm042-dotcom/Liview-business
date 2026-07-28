'use client'

import { useEffect, useState, useCallback, useRef, use, PointerEvent as ReactPointerEvent } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutItemKind, VenueLayoutItem, VenueSeat } from '@/lib/supabase/types'
import { shapeStyle, labelStyle } from '@/components/LayoutItemShape'
import BackButton from '@/components/BackButton'
import ErrorScreen from '@/components/ErrorScreen'
import PageEyebrowHeader from '@/components/PageEyebrowHeader'
import InlineMessage from '@/components/InlineMessage'

const CANVAS_HEIGHT = 460
const MIN_SIZE_PCT = 4

// 선택 대상은 좌석이거나 배치 요소다. 둘은 저장 API가 달라서 종류를 함께 들고 다닌다.
type Selection = { type: 'seat'; id: string } | { type: 'item'; id: string } | null

const TOOL_LABELS: { kind: LayoutItemKind; label: string; icon: string; defaultLabel: string }[] = [
  { kind: 'table', label: '테이블', icon: '▭', defaultLabel: '' },
  { kind: 'box', label: '네모', icon: '⬜', defaultLabel: '주방' },
  { kind: 'door', label: '출입문', icon: '🚪', defaultLabel: '출입문' },
  { kind: 'text', label: '텍스트', icon: 'T', defaultLabel: '안내' },
]

function clampPct(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}

// 운영자의 자리배치 설계 화면 (Seating 도메인, BUSINESS_RULES.md §2.8 "좌석 배치 자유 구성").
// 디자인 툴처럼 좌석/테이블/구역 네모/출입문/텍스트를 추가하고, 드래그로 옮기고, 모서리
// 핸들로 크기를 조절한다. 좌석만 실제 기능 데이터(참여자가 앉음)이고 나머지는 표시용이다.
// 실시간 손님 케어(경고 메시지/좌석 강제 이동)는 여기가 아니라 방 화면 소관이다(§2.9).
export default function OperatorSeatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [venueName, setVenueName] = useState('')
  const [loadError, setLoadError] = useState('')
  const [seats, setSeats] = useState<VenueSeat[]>([])
  const [items, setItems] = useState<VenueLayoutItem[]>([])
  const [actionError, setActionError] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [labelDraft, setLabelDraft] = useState('')

  const canvasRef = useRef<HTMLDivElement>(null)
  // 드래그/리사이즈 상태. 포인터를 뗄 때 딱 한 번만 서버에 저장한다(이동 중엔 로컬만 갱신).
  const dragRef = useRef<
    | { mode: 'move'; type: 'seat' | 'item'; id: string; offsetX: number; offsetY: number }
    | { mode: 'resize'; id: string; startX: number; startY: number; startW: number; startH: number }
    | null
  >(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const loadAll = useCallback(() => {
    fetch(`/api/venues/${id}/seats`).then(r => r.json()).then(d => setSeats(d.seats ?? [])).catch(() => {})
    fetch(`/api/venues/${id}/layout`).then(r => r.json()).then(d => setItems(d.items ?? [])).catch(() => {})
  }, [id])

  useEffect(() => {
    fetch(`/api/venues/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue || !data.isOwner) {
          setLoadError('이 매장의 운영자만 좌석을 관리할 수 있습니다')
          return
        }
        setVenueName(data.venue.name)
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))
    loadAll()
  }, [id, loadAll])

  // 선택이 바뀌면 라벨 편집칸을 현재 값으로 맞춘다.
  useEffect(() => {
    if (!selection) { setLabelDraft(''); return }
    if (selection.type === 'seat') setLabelDraft(seats.find(s => s.id === selection.id)?.label ?? '')
    else setLabelDraft(items.find(i => i.id === selection.id)?.label ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  // ---------- 추가 ----------
  const handleAddSeat = async () => {
    setActionError('')
    // 좌석 이름은 디자인처럼 번호가 기본 — 기존에 쓰인 숫자 다음 번호를 자동으로 붙인다.
    const usedNumbers = seats.map(s => Number(s.label)).filter(n => Number.isFinite(n))
    const nextLabel = String((usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0) + 1)
    try {
      const res = await fetch(`/api/venues/${id}/seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: nextLabel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSeats(prev => [...prev, data.seat])
      setSelection({ type: 'seat', id: data.seat.id })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '좌석 추가에 실패했습니다')
    }
  }

  const handleAddItem = async (kind: LayoutItemKind, defaultLabel: string) => {
    setActionError('')
    try {
      const res = await fetch(`/api/venues/${id}/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, label: defaultLabel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(prev => [...prev, data.item])
      setSelection({ type: 'item', id: data.item.id })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '요소 추가에 실패했습니다')
    }
  }

  // ---------- 저장 ----------
  const saveSeat = async (seat: VenueSeat, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/venues/${id}/seats`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seat_id: seat.id, ...payload }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setActionError('저장에 실패했습니다')
      loadAll()
    }
  }

  const saveItem = async (itemId: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/venues/${id}/layout`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, ...payload }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setActionError('저장에 실패했습니다')
      loadAll()
    }
  }

  // ---------- 삭제 ----------
  const handleDelete = async () => {
    if (!selection) return
    const target = selection
    setSelection(null)
    if (target.type === 'seat') {
      if (!confirm('이 좌석을 삭제할까요? 앉아있던 손님은 좌석 미배정 상태가 됩니다')) return
      setSeats(prev => prev.filter(s => s.id !== target.id))
      const res = await fetch(`/api/venues/${id}/seats`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seat_id: target.id }),
      })
      if (!res.ok) { setActionError('삭제에 실패했습니다'); loadAll() }
    } else {
      setItems(prev => prev.filter(i => i.id !== target.id))
      const res = await fetch(`/api/venues/${id}/layout`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: target.id }),
      })
      if (!res.ok) { setActionError('삭제에 실패했습니다'); loadAll() }
    }
  }

  const handleLabelCommit = async () => {
    if (!selection) return
    const text = labelDraft.trim()
    if (selection.type === 'seat') {
      if (!text) { setActionError('좌석 이름은 비울 수 없습니다'); return }
      setSeats(prev => prev.map(s => (s.id === selection.id ? { ...s, label: text } : s)))
      const seat = seats.find(s => s.id === selection.id)
      if (seat) await saveSeat(seat, { label: text })
    } else {
      setItems(prev => prev.map(i => (i.id === selection.id ? { ...i, label: text || null } : i)))
      await saveItem(selection.id, { label: text })
    }
  }

  // ---------- 드래그 / 리사이즈 ----------
  const pctFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  const startMove = (e: ReactPointerEvent, type: 'seat' | 'item', id: string, cx: number, cy: number) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    const p = pctFromEvent(e)
    // 잡은 지점과 요소 중심의 차이를 기억해, 드래그 중 요소가 손가락 밑으로 순간이동하지 않게 한다.
    dragRef.current = { mode: 'move', type, id, offsetX: cx - p.x, offsetY: cy - p.y }
    setActiveId(id)
    setSelection(type === 'seat' ? { type: 'seat', id } : { type: 'item', id })
  }

  const startResize = (e: ReactPointerEvent, item: VenueLayoutItem) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    const p = pctFromEvent(e)
    dragRef.current = { mode: 'resize', id: item.id, startX: p.x, startY: p.y, startW: item.width, startH: item.height }
    setActiveId(item.id)
    setSelection({ type: 'item', id: item.id })
  }

  const handlePointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag || !canvasRef.current) return
    const p = pctFromEvent(e)

    if (drag.mode === 'move') {
      const x = clampPct(p.x + drag.offsetX, 1, 99)
      const y = clampPct(p.y + drag.offsetY, 1, 99)
      if (drag.type === 'seat') {
        setSeats(prev => prev.map(s => (s.id === drag.id ? { ...s, position_x: x, position_y: y } : s)))
      } else {
        setItems(prev => prev.map(i => (i.id === drag.id ? { ...i, position_x: x, position_y: y } : i)))
      }
    } else {
      // 모서리를 끄는 만큼 중심 기준 양쪽으로 늘어나므로 이동량의 2배가 크기 변화다.
      const w = clampPct(drag.startW + (p.x - drag.startX) * 2, MIN_SIZE_PCT, 100)
      const h = clampPct(drag.startH + (p.y - drag.startY) * 2, MIN_SIZE_PCT, 100)
      setItems(prev => prev.map(i => (i.id === drag.id ? { ...i, width: w, height: h } : i)))
    }
  }

  const handlePointerUp = async () => {
    const drag = dragRef.current
    dragRef.current = null
    setActiveId(null)
    if (!drag) return

    if (drag.mode === 'move' && drag.type === 'seat') {
      const seat = seats.find(s => s.id === drag.id)
      if (seat) await saveSeat(seat, { position_x: seat.position_x, position_y: seat.position_y })
      return
    }
    const item = items.find(i => i.id === drag.id)
    if (!item) return
    await saveItem(item.id, drag.mode === 'move'
      ? { position_x: item.position_x, position_y: item.position_y }
      : { width: item.width, height: item.height })
  }

  if (loadError) return <ErrorScreen message={loadError} />

  const selectedItem = selection?.type === 'item' ? items.find(i => i.id === selection.id) : undefined
  const selectedSeat = selection?.type === 'seat' ? seats.find(s => s.id === selection.id) : undefined

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 60 }}>
      <BackButton onClick={() => router.back()} />

      <PageEyebrowHeader
        eyebrow="OPERATOR"
        title={`${venueName} 자리배치`}
        subtitle="요소를 추가하고 드래그로 옮기세요. 선택하면 이름 변경·크기 조절·삭제할 수 있어요"
        marginBottom={20} titleSize={24} subtitleSize={12}
      />

      {actionError && <InlineMessage type="error" style={{ marginBottom: 12 }}>{actionError}</InlineMessage>}

      {/* 툴바 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        <button onClick={handleAddSeat}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999,
            background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>
          <span style={{ fontSize: 15 }}>◯</span> 좌석
        </button>
        {TOOL_LABELS.map(t => (
          <button key={t.kind} onClick={() => handleAddItem(t.kind, t.defaultLabel)}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999,
              background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* 캔버스 — 빈 곳을 누르면 선택 해제 */}
      <div
        ref={canvasRef}
        onPointerDown={() => setSelection(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'relative', width: '100%', height: CANVAS_HEIGHT, borderRadius: 16,
          background: 'var(--bg2)', border: '1px solid var(--border)', overflow: 'hidden',
          marginBottom: 14, touchAction: 'none', userSelect: 'none',
        }}
      >
        {seats.length === 0 && items.length === 0 && (
          <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--muted2)' }}>
            위 버튼으로 좌석과 테이블을 추가해보세요
          </p>
        )}

        {/* 배치 요소 — 좌석보다 뒤 */}
        {items.map(item => {
          const selected = selection?.type === 'item' && selection.id === item.id
          return (
            <div
              key={item.id}
              onPointerDown={e => startMove(e, 'item', item.id, item.position_x, item.position_y)}
              style={{
                position: 'absolute',
                left: `${item.position_x}%`, top: `${item.position_y}%`,
                width: `${item.width}%`, height: `${item.height}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: activeId === item.id ? 'grabbing' : 'grab',
                zIndex: selected ? 5 : 1,
                ...shapeStyle(item.kind),
                ...(selected ? { outline: '2px solid var(--accent)', outlineOffset: 2 } : null),
              }}
            >
              {item.label && <span style={labelStyle(item.kind)}>{item.label}</span>}

              {/* 리사이즈 핸들 — 선택했을 때만 오른쪽 아래 모서리에 */}
              {selected && (
                <div
                  onPointerDown={e => startResize(e, item)}
                  aria-label="크기 조절"
                  style={{
                    position: 'absolute', right: -7, bottom: -7, width: 16, height: 16, borderRadius: 4,
                    background: 'var(--accent)', border: '2px solid var(--bg)', cursor: 'nwse-resize',
                  }}
                />
              )}
            </div>
          )
        })}

        {/* 좌석 — 항상 배치 요소 위 */}
        {seats.map(seat => {
          const selected = selection?.type === 'seat' && selection.id === seat.id
          return (
            <div
              key={seat.id}
              onPointerDown={e => startMove(e, 'seat', seat.id, seat.position_x, seat.position_y)}
              style={{
                position: 'absolute',
                left: `${seat.position_x}%`, top: `${seat.position_y}%`,
                transform: 'translate(-50%, -50%)',
                width: 38, height: 38, borderRadius: 999,
                border: `2px solid var(--accent)`,
                background: selected ? 'var(--accent)' : 'transparent',
                color: selected ? '#fff' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
                cursor: activeId === seat.id ? 'grabbing' : 'grab',
                zIndex: selected ? 6 : 2,
                outline: selected ? '2px solid var(--accent)' : undefined,
                outlineOffset: 3,
              }}
            >
              {seat.label}
            </div>
          )
        })}
      </div>

      {/* 선택 항목 속성 */}
      {selection ? (
        <div className="card" style={{ padding: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted2)', marginBottom: 10 }}>
            {selection.type === 'seat'
              ? '좌석'
              : TOOL_LABELS.find(t => t.kind === selectedItem?.kind)?.label ?? '요소'}
            {' 편집'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              value={labelDraft}
              onChange={e => setLabelDraft(e.target.value.slice(0, 30))}
              onBlur={handleLabelCommit}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder={selection.type === 'seat' ? '좌석 번호' : '표시할 이름 (비워도 됨)'}
              style={{ flex: 1, padding: '10px 14px', fontSize: 13 }}
            />
            <button className="btn btn-secondary" onClick={handleDelete}
              style={{ width: 'auto', minHeight: 'auto', padding: '0 16px', fontSize: 13, color: 'var(--accent)' }}>
              삭제
            </button>
          </div>
          {selectedItem && (
            <p style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 8 }}>
              오른쪽 아래 빨간 핸들을 끌어 크기를 조절하세요 ({Math.round(selectedItem.width)}% × {Math.round(selectedItem.height)}%)
            </p>
          )}
          {selectedSeat && (
            <p style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 8 }}>
              손님이 이 번호를 보고 자리를 고릅니다
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--muted2)' }}>
          좌석 {seats.length}개 · 배치 요소 {items.length}개 — 편집할 요소를 눌러 선택하세요
        </p>
      )}
    </main>
  )
}
