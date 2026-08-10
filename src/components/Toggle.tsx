// on/off 스위치. 2개 화면(비밀번호 사용 여부, 영업시간 전체 적용)에 동일한 마크업이
// 중복돼있던 것을 뽑았다 (순수 추출 리팩토링).
export default function Toggle({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (next: boolean) => void; ariaLabel?: string }) {
  return (
    <button onClick={() => onChange(!checked)} aria-label={ariaLabel} aria-pressed={checked}
      style={{
        width: 44, height: 26, borderRadius: 999, cursor: 'pointer', position: 'relative', flexShrink: 0,
        background: checked ? 'var(--accent)' : 'var(--card2)', border: '1px solid var(--border)',
      }}>
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s',
      }} />
    </button>
  )
}
