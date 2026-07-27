'use client'

import { ReactElement } from 'react'

// 방 화면 하단 탭바 (Phase 9). 인스타그램 스타일 — 활성 탭만 빨간 알약 배경으로 강조한다.
// 매장(기본 정보) / 별점(실시간 만족도) / 채팅(매장·외부 QnA) / 직원(친절 직원 투표).
export type RoomTab = 'venue' | 'star' | 'chat' | 'staff'

function StoreIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={color}>
      <path d="M4 4h16l1.2 4.2A2.2 2.2 0 0 1 19.1 11H19v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8h-.1A2.2 2.2 0 0 1 2.8 8.2L4 4z" opacity="0.95" />
      <rect x="8.5" y="13" width="3" height="4" rx="0.5" fill="#000" opacity="0.55" />
      <rect x="12.5" y="13" width="3" height="4" rx="0.5" fill="#000" opacity="0.55" />
    </svg>
  )
}

function StarIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45 6.19 20.5 7.3 14.03 2.6 9.45l6.5-.95L12 2.6z" />
    </svg>
  )
}

function ChatIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={color}>
      <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.5L5 20.5V17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  )
}

function SmileIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9">
      <circle cx="12" cy="12" r="9.2" />
      <circle cx="9" cy="10" r="1.1" fill={color} stroke="none" />
      <circle cx="15" cy="10" r="1.1" fill={color} stroke="none" />
      <path d="M8.2 14.2a4.6 4.6 0 0 0 7.6 0" strokeLinecap="round" />
    </svg>
  )
}

const TABS: { key: RoomTab; label: string; Icon: (p: { color: string }) => ReactElement }[] = [
  { key: 'venue', label: '매장', Icon: StoreIcon },
  { key: 'star', label: '별점', Icon: StarIcon },
  { key: 'chat', label: '채팅', Icon: ChatIcon },
  { key: 'staff', label: '직원', Icon: SmileIcon },
]

export default function RoomTabBar({ active, onSelect, chatBadge = 0 }: {
  active: RoomTab
  onSelect: (tab: RoomTab) => void
  chatBadge?: number
}) {
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
      padding: '10px 16px max(14px, env(safe-area-inset-bottom))',
      background: 'var(--bg)', borderTop: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        background: 'var(--card2)', borderRadius: 999, padding: 6,
      }}>
        {TABS.map(({ key, label, Icon }) => {
          const on = active === key
          return (
            <button key={key} onClick={() => onSelect(key)} aria-label={label}
              style={{
                position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '10px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: on ? 'var(--accent)' : 'transparent',
                transition: 'background 0.15s ease',
              }}>
              <Icon color={on ? '#fff' : 'var(--muted2)'} />
              {key === 'chat' && chatBadge > 0 && !on && (
                <span style={{
                  position: 'absolute', top: 4, right: '28%', minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {chatBadge > 99 ? '99+' : chatBadge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
