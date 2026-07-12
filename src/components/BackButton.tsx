'use client'

// 화면 상단의 "←" 뒤로가기 버튼. 페이지 26개 중 7개에 픽셀 단위로 동일한 인라인 스타일이
// 중복돼있던 것을 뽑았다 — 나중에 디자인을 바꿀 때 여기 한 곳만 고치면 되게 하기 위함
// (동작/스타일 변경 없는 순수 추출 리팩토링).
export default function BackButton({ onClick, marginBottom = 24 }: { onClick: () => void; marginBottom?: number }) {
  return (
    <button onClick={onClick} aria-label="뒤로가기"
      style={{
        width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)',
        color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', marginBottom,
      }}>
      ←
    </button>
  )
}
