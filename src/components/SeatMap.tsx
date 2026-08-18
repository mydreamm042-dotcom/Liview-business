'use client'

import { ReactNode } from 'react'
import { Participant, Reaction, VenueLayoutItem, VenueSeat } from '@/lib/supabase/types'
import { isOccupantHot } from '@/lib/seatDisplay'
import LayoutItemShape from './LayoutItemShape'
import CanvasMiniMap, { miniMapHeight } from './CanvasMiniMap'
import { useZoomPan } from '@/hooks/useZoomPan'
import Icon from './Icon'
import { seatSizePx } from '@/lib/seatSize'

const MINIMAP_WIDTH = 104

// 자리배치 캔버스 (Phase 9 리디자인 + ADR-0007/0008). 좌석을 "번호 원형"으로 그린다 — 선택
// 가능한 빈 좌석은 밝게(빨간 테두리), 이미 누가 앉은 좌석은 어둡게, 지금 HOT을 누르고 있는
// 좌석에는 불꽃을 얹는다. 좌표는 운영자가 배치 편집 화면에서 지정한 position_x/position_y
// (0~100%)를 그대로 절대 위치로 쓴다 (BUSINESS_RULES.md §2.8).
//
// 확대/이동(두 손가락 핀치·드래그, 버튼 없음)과 미니맵이 이 컴포넌트에 내장되어 있어서, 이걸
// 쓰는 세 화면(참여자 좌석 선택 / 방 화면 / 매장 상세 바텀시트 좌석 탭)에 동일하게 적용된다
// (ADR-0008 "다른 화면으로의 동일 적용").
export default function SeatMap({
  seats, participants, hotReactions, now, myParticipantId, height = 320,
  layoutItems = [], onSeatClick, seatDisabled, selectedSeatId,
  armedSeatId, onSeatPressStart, onSeatPressEnd, onSeatContextMenu, renderSeatCaption,
}: {
  seats: VenueSeat[]
  participants: Participant[]
  hotReactions: Reaction[]
  now: number
  myParticipantId?: string
  // 숫자(px)뿐 아니라 '100%' 같은 CSS 길이도 받는다 — 전용 좌석 선택 화면은 남은 공간을
  // 전부 캔버스로 쓴다.
  height?: number | string
  // 구역/출입문/텍스트/선 — 좌석 뒤 배경으로 먼저 그린다.
  layoutItems?: VenueLayoutItem[]
  onSeatClick?: (seat: VenueSeat, occupant: Participant | undefined) => void
  seatDisabled?: (seat: VenueSeat, occupant: Participant | undefined) => boolean
  // 아직 서버에 확정되지 않은 가선택 좌석 (ADR-0007 2단계 선택 흐름). 점유자 여부와 무관하게
  // "내 좌석"과 같은 강조 스타일로 하이라이트만 한다.
  selectedSeatId?: string | null
  // ---- 아래는 방 화면의 운영자 좌석 이동 뷰 전용 (Guest Care §2.9) ----
  // 이동 대기(무장) 상태인 좌석 — 흰 테두리로 구분한다.
  armedSeatId?: string | null
  onSeatPressStart?: (seat: VenueSeat, occupant: Participant | undefined) => void
  // 화면을 끌어 이동한 제스처였다면 호출되지 않는다(이동하려던 것이지 좌석을 누른 게 아님).
  onSeatPressEnd?: (seat: VenueSeat, occupant: Participant | undefined) => void
  onSeatContextMenu?: (seat: VenueSeat, occupant: Participant | undefined) => void
  // 좌석 아래 덧붙일 설명(운영자 뷰의 닉네임/착석 경과시간 등)
  renderSeatCaption?: (seat: VenueSeat, occupant: Participant | undefined) => ReactNode
}) {
  const { setContainer, handlers, contentWidth, contentHeight, viewport, zoom, isPanning, wasDragged } = useZoomPan()

  // 확대 배율이 반영된 실제 콘텐츠 크기를 넘겨, 확대해도 배경 배치 요소와 같은 비율로 커지게
  // 한다. 크기 자체는 이 매장 네모들의 평균에서 파생된다 (ADR-0008).
  const seatPx = seatSizePx(layoutItems, contentWidth, contentHeight)
  const isEmpty = seats.length === 0 && layoutItems.length === 0

  return (
    <div style={{ position: 'relative', width: '100%', height, background: 'var(--bg2)', overflow: 'hidden' }}>
      <div
        ref={setContainer}
        {...handlers}
        style={{
          width: '100%', height: '100%', overflow: 'hidden', position: 'relative',
          touchAction: 'none', cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
        }}
      >
        <div style={{ position: 'relative', width: contentWidth || '100%', height: contentHeight || '100%' }}>
          {/* 배치 요소는 항상 좌석보다 뒤에 (좌석이 그 위에 놓인 것처럼 보이게) */}
          {layoutItems.map(item => <LayoutItemShape key={item.id} item={item} />)}

          {isEmpty && (
            <p style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, color: 'var(--muted2)',
            }}>
              등록된 좌석이 없습니다
            </p>
          )}

          {seats.map(seat => {
            const occupant = participants.find(p => p.seat_id === seat.id)
            const isMe = occupant?.id === myParticipantId
            const isPending = selectedSeatId === seat.id
            const isArmed = armedSeatId === seat.id
            const occupantHot = occupant ? isOccupantHot(occupant.id, hotReactions, now) : false
            const disabled = seatDisabled ? seatDisabled(seat, occupant) : false
            const clickable = !!onSeatClick && !disabled

            // 착석 여부에 따라 명암을 나눈다 — 빈 좌석(선택 가능)은 밝은 빨간 테두리, 이미 앉은
            // 좌석은 어둡게 눌러 대비를 준다. 내 좌석/가선택 좌석은 채워서 확실히 구분.
            const highlighted = isMe || isPending
            const border = isArmed ? '#fff' : highlighted ? 'var(--accent)' : occupant ? 'var(--muted)' : 'var(--accent)'
            const bg = highlighted ? 'var(--accent)' : occupant ? 'var(--card)' : 'transparent'
            const fg = highlighted ? '#fff' : occupant ? 'var(--muted)' : 'var(--accent)'
            const caption = renderSeatCaption?.(seat, occupant)

            return (
              <div
                key={seat.id}
                onPointerDown={onSeatPressStart ? () => onSeatPressStart(seat, occupant) : undefined}
                onPointerUp={onSeatPressEnd ? () => { if (!wasDragged()) onSeatPressEnd(seat, occupant) } : undefined}
                onContextMenu={onSeatContextMenu ? e => { e.preventDefault(); onSeatContextMenu(seat, occupant) } : undefined}
                style={{
                  position: 'absolute',
                  left: `${seat.position_x}%`,
                  top: `${seat.position_y}%`,
                  transform: 'translate(-50%, -50%)',
                  userSelect: 'none',
                }}
              >
                {/* HOT 불꽃 — 좌석 원 뒤에 겹쳐 타오르는 느낌을 준다 */}
                {occupantHot && (
                  // 이모지 🔥를 Icon으로 교체 (ADR-0009). 좌석 원의 크기에 비례해야 해서
                  // size를 seatPx에서 계산한다 — 이모지였을 땐 fontSize로 줬는데, 이모지는
                  // 글리프가 자기 박스를 다 채우지 않아 실제로 보이는 크기가 기기마다 달랐다.
                  <span style={{
                    position: 'absolute', left: '50%', top: -seatPx * 0.34, transform: 'translateX(-50%)',
                    lineHeight: 1, pointerEvents: 'none', zIndex: 0, color: '#f97316',
                  }} className="fire-pulse">
                    <Icon name="local_fire_department" size={seatPx * 0.62} />
                  </span>
                )}
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onSeatClick!(seat, occupant) : undefined}
                  aria-label={`${seat.label}번 좌석${occupant ? ' (사용 중)' : isPending ? ' (선택됨)' : ''}`}
                  style={{
                    position: 'relative', zIndex: 1,
                    width: seatPx, height: seatPx, borderRadius: 999,
                    border: `2px solid ${border}`,
                    background: bg,
                    color: fg,
                    fontSize: Math.max(9, seatPx * 0.34), fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: clickable || onSeatPressEnd ? 'pointer' : 'default',
                    opacity: occupant && !isMe ? 0.5 : 1,
                    padding: 0,
                  }}
                >
                  {seat.label}
                </button>
                {caption && (
                  <div style={{
                    position: 'absolute', top: seatPx + 2, left: '50%', transform: 'translateX(-50%)',
                    textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
                  }}>
                    {caption}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 미니맵 — 배치 규모와 무관하게 항상 표시 (ADR-0007) */}
      {!isEmpty && (
        <div style={{ position: 'absolute', top: 10, right: 10, pointerEvents: 'none' }}>
          <CanvasMiniMap
            seats={seats}
            layoutItems={layoutItems}
            participants={participants}
            highlightSeatId={selectedSeatId ?? armedSeatId}
            viewport={viewport}
            width={MINIMAP_WIDTH}
            height={miniMapHeight(MINIMAP_WIDTH, contentWidth / zoom, contentHeight / zoom)}
          />
        </div>
      )}
    </div>
  )
}
