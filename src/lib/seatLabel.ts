// 좌석 복제 시 새 라벨을 정하는 규칙 (ADR-0008 "좌석 복제 기능" — 구현 시점 결정 사항).
//
// 규칙: 원본 라벨 끝의 숫자를 1씩 올려가며 아직 안 쓰인 라벨을 찾는다("A1"→"A2", "5"→"6").
// 끝에 숫자가 없으면 " 2"부터 붙인다("창가"→"창가 2"). 좌석 라벨은 손님이 실제 자리를 찾는
// 단서라("3번 좌석") 원본과의 연관이 보이는 게 중요해서, 새 좌석 추가처럼 그냥 최대번호+1을
// 주는 방식은 쓰지 않는다 — "A1"을 복제했는데 "7"이 나오면 어느 자리인지 알 수 없다.
export function nextDuplicateLabel(source: string, existing: string[]): string {
  const used = new Set(existing)
  const match = source.match(/^(.*?)(\d+)$/)

  if (match) {
    const [, prefix, digits] = match
    let n = Number(digits)
    // 자리수를 맞춰 붙여둔 라벨("01")은 그 모양을 유지한다
    const pad = digits.length
    for (let i = 0; i < 1000; i++) {
      n += 1
      const candidate = `${prefix}${String(n).padStart(pad, '0')}`
      if (!used.has(candidate)) return candidate
    }
    return `${prefix}${n}`
  }

  for (let n = 2; n < 1000; n++) {
    const candidate = `${source} ${n}`
    if (!used.has(candidate)) return candidate
  }
  return `${source} 사본`
}
