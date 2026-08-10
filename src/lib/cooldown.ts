export const WARNING_COOLDOWN_MS = 5 * 60 * 1000
export const STAR_COOLDOWN_MS = 30 * 60 * 1000
// 외부 QnA 도배 방지 — 매장에 입장하지 않은 외부인에게만 적용된다(입장 손님은 면제).
export const QNA_EXTERNAL_COOLDOWN_MS = 60 * 1000

export function formatCooldown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
