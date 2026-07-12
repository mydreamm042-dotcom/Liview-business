// 폼 하단에 붙는 한 줄짜리 에러/성공 안내문. 색상만 다르고 나머지 스타일은 거의 항상
// 동일한 패턴이 이 앱 전체에 30곳 넘게 반복되고 있어 뽑았다 (순수 추출 리팩토링).
export default function InlineMessage({
  type, children, fontSize = 12, style,
}: {
  type: 'error' | 'success'
  children: React.ReactNode
  fontSize?: number
  style?: React.CSSProperties
}) {
  return (
    <p style={{ fontSize, color: type === 'error' ? '#ff6b6b' : '#10b981', ...style }}>
      {children}
    </p>
  )
}
