'use client'

import { ReactElement } from 'react'

// 지도 화면 전용 하단 탭바 (Phase 9). 전역 네비게이션이 아니라 홈 지도 화면 로컬 컴포넌트다.
// 탐색: 지도 보기(바텀시트 내림) / HOT: 실시간 핫한 가게(바텀시트 펼침) / 입장: QR 카메라 /
// 더보기: 사장님 진입 등 부가 메뉴. 아이콘은 디자인의 라인/솔리드 아이콘(SVG)이다.
export type MapTab = 'explore' | 'hot' | 'enter' | 'more'

function PinIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill={color} />
      <circle cx="12" cy="9" r="2.5" fill="#000" />
    </svg>
  )
}

function FlameIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2c1 3-1.5 4.5-1.5 7 0 1.4 1 2.5 2.3 2.5 1.2 0 2-.8 2.2-1.7 1 1.2 1.5 2.6 1.5 4.2 0 3.6-2.9 6-6.5 6S3.5 17.6 3.5 14c0-4 3-6.5 4.2-9C8.8 3.4 10.5 2.6 12 2z"
        fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function EnterIcon({ color }: { color: string }) {
  // QR 스캔 프레임 모양 (입장 = QR 카메라)
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" />
      <path d="M4 12h16" />
    </svg>
  )
}

function MoreIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={color}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

const TABS: { key: MapTab; label: string; Icon: (p: { color: string }) => React.JSX.Element }[] = [
  { key: 'explore', label: '탐색', Icon: PinIcon },
  { key: 'hot', label: 'HOT', Icon: FlameIcon },
  { key: 'enter', label: '입장', Icon: EnterIcon },
  { key: 'more', label: '더보기', Icon: MoreIcon },
]

export default function MapBottomTabBar({ active, onSelect }: {
  active: MapTab
  onSelect: (tab: MapTab) => void
}) {
  return (
    <nav style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40,
      display: 'flex', background: 'var(--bg)', borderTop: '1px solid var(--border)',
      padding: '10px 0 max(10px, env(safe-area-inset-bottom))',
    }}>
      {TABS.map(({ key, label, Icon }) => {
        const on = active === key
        const color = on ? 'var(--accent)' : 'var(--muted2)'
        return (
          <button key={key} onClick={() => onSelect(key)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            }}>
            <Icon color={color} />
            <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
