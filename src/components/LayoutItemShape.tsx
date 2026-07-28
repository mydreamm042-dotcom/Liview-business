'use client'

import { CSSProperties } from 'react'
import { LayoutItemKind, VenueLayoutItem } from '@/lib/supabase/types'

// 배치 요소 종류별 생김새 — 손님 방 화면과 운영자 배치 에디터가 같은 모양을 그려야 하므로
// (에디터에서 본 그대로 손님에게 보여야 함) 스타일을 여기 한 곳에 모아둔다.
export function shapeStyle(kind: LayoutItemKind): CSSProperties {
  switch (kind) {
    case 'table':
      return { background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8 }
    case 'box':
      return { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }
    case 'door':
      return { background: 'transparent', border: '1.5px solid var(--accent)', borderRadius: 4 }
    case 'text':
      return { background: 'transparent', border: 'none' }
  }
}

export function labelStyle(kind: LayoutItemKind): CSSProperties {
  const base: CSSProperties = {
    fontSize: 12, fontWeight: 700, textAlign: 'center', padding: '0 4px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
  if (kind === 'door') return { ...base, color: 'var(--accent)', fontSize: 11 }
  if (kind === 'text') return { ...base, color: 'var(--text2)' }
  return { ...base, color: 'var(--muted2)' }
}

// 자리배치도의 배치 요소 하나(테이블/구역/출입문/텍스트). 좌표는 캔버스 대비 %이고
// position은 중심 기준이라 translate(-50%,-50%)로 맞춘다 (좌석과 동일한 좌표 규칙).
export default function LayoutItemShape({ item }: { item: VenueLayoutItem }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${item.position_x}%`,
        top: `${item.position_y}%`,
        width: `${item.width}%`,
        height: `${item.height}%`,
        transform: 'translate(-50%, -50%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...shapeStyle(item.kind),
      }}
    >
      {item.label && <span style={labelStyle(item.kind)}>{item.label}</span>}
    </div>
  )
}
