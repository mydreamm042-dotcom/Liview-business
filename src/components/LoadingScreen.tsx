// 데이터 로딩 중 전체 화면 중앙에 뜨는 안내문. 5개 화면에 동일한 마크업이 중복돼있던 것을
// 뽑았다 (순수 추출 리팩토링 — 스타일/동작 변경 없음).
export default function LoadingScreen({ label = '불러오는 중...' }: { label?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p style={{ color: 'var(--muted2)' }}>{label}</p>
    </main>
  )
}
