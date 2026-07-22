'use client'

// 지도 화면 전용 하단 탭바 (Phase 9). 전역 네비게이션이 아니라 홈 지도 화면 로컬 컴포넌트다.
// 탐색: 지도 보기(바텀시트 내림) / HOT: 랭킹 펼치기(바텀시트 올림) / 입장: 매장 QR 안내 /
// 더보기: 사장님 진입 등 부가 메뉴.
export type MapTab = 'explore' | 'hot' | 'enter' | 'more'

const TABS: { key: MapTab; icon: string; label: string }[] = [
  { key: 'explore', icon: '🗺️', label: '탐색' },
  { key: 'hot', icon: '🔥', label: 'HOT' },
  { key: 'enter', icon: '🚪', label: '입장' },
  { key: 'more', icon: '⋯', label: '더보기' },
]

export default function MapBottomTabBar({ active, onSelect }: {
  active: MapTab
  onSelect: (tab: MapTab) => void
}) {
  return (
    <nav style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40,
      display: 'flex', background: 'var(--bg)', borderTop: '1px solid var(--border)',
      padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
    }}>
      {TABS.map(t => {
        const on = active === t.key
        return (
          <button key={t.key} onClick={() => onSelect(t.key)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
            }}>
            <span style={{ fontSize: 20, filter: on ? 'none' : 'grayscale(0.6) opacity(0.6)' }}>{t.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--muted2)' }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
