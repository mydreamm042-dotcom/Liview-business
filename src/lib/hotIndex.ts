export const HOT_HOLD_MS = 5 * 60 * 1000
export const HOT_DECAY_MS = 10 * 60 * 1000
export const HOT_TOTAL_MS = HOT_HOLD_MS + HOT_DECAY_MS

// 탭 1회당 증가율은 그 탭이 발생한 순간의 참여자 수에 반비례한다 (인원이 적으면 더 크게,
// 많으면 더 작게 오른다). 기준값은 참여자 4명일 때 정확히 2%가 되도록 보정한 것.
export const HOT_BASE_INCREMENT = 4

// 탭 사이 경과 시간(elapsed)만큼 값을 감쇠시킨다: HOT_HOLD_MS 동안은 그대로 유지,
// 이후 HOT_DECAY_MS에 걸쳐 0까지 선형 감소, 그 이후는 0.
function decayValue(value: number, elapsed: number): number {
  if (elapsed < HOT_HOLD_MS) return value
  if (elapsed < HOT_TOTAL_MS) return value * (1 - (elapsed - HOT_HOLD_MS) / HOT_DECAY_MS)
  return 0
}

// 탭이 발생한 "그 순간"의 참여자 수(reaction.value에 서버가 기록해둔 값) 기준으로
// 이번 탭의 증가율을 계산한다. 이후 참여자 수가 바뀌어도 이 값은 재계산되지 않는다.
function tapIncrement(participantCountAtTap: number | null | undefined): number {
  const n = Math.max(1, participantCountAtTap ?? 1)
  return HOT_BASE_INCREMENT / Math.sqrt(n)
}

export interface HotSim {
  value: number        // 마지막 탭 직후의 지수 값
  lastTapTime: number  // 마지막 탭 시각 (탭이 없으면 -Infinity)
}

/**
 * 모든 탭을 시간순으로 시뮬레이션해 "마지막 탭 직후"의 값과 그 시각을 반환한다.
 * 탭이 하나씩 발생할 때마다, 그 시점까지 감쇠된 현재 값에 그 탭 순간의 참여자 수 기준
 * 증가율을 더해가는 방식이다. (평생 누적 탭 "개수" 기반이 아니라서, 오래 조용하다가
 * 탭 1번만 눌러도 과거 히스토리 때문에 100%로 튀지 않고, 식는 중이라면 그 시점의
 * 감쇠된 값에서 딱 한 번 오르는 만큼만 더해진다. 참여자가 나갔다 들어와도 이미
 * 누적된 값은 그대로 유지되고, 앞으로의 탭 증가율만 새 인원수를 반영한다)
 *
 * 이 계산은 탭 목록이 바뀔 때만 하면 되고(비쌈: 전체 히스토리 순회), 화면에 표시할
 * "지금 이 순간"의 값은 hotIndexAt()으로 O(1)에 구한다 — 1초마다 갱신되는 방 화면이
 * 매초 전체 히스토리를 재계산하지 않도록 하기 위한 분리다.
 */
export function simulateHotTaps(
  hotReactions: { created_at: string; value?: number | null }[],
): HotSim {
  const events = hotReactions
    .map(r => ({ t: new Date(r.created_at).getTime(), value: r.value }))
    .sort((a, b) => a.t - b.t)
  if (events.length === 0) return { value: 0, lastTapTime: -Infinity }

  let value = 0
  let lastTapTime = -Infinity
  for (const e of events) {
    const decayed = decayValue(value, e.t - lastTapTime)
    value = Math.min(100, decayed + tapIncrement(e.value))
    lastTapTime = e.t
  }

  return { value, lastTapTime }
}

// 시뮬레이션 결과를 특정 시점의 표시값(0~100 정수)으로 변환한다.
export function hotIndexAt(sim: HotSim, now: number = Date.now()): number {
  if (sim.lastTapTime === -Infinity) return 0
  return Math.max(0, Math.round(decayValue(sim.value, now - sim.lastTapTime)))
}

// 과거 임의 시점의 지수를 재구성한다 (결과 화면 시간별 차트용).
// now 이후의 탭은 계산에서 제외한다.
export function calcHotIndex(
  hotReactions: { created_at: string; value?: number | null }[],
  now: number = Date.now(),
): number {
  const past = hotReactions.filter(r => new Date(r.created_at).getTime() <= now)
  return hotIndexAt(simulateHotTaps(past), now)
}
