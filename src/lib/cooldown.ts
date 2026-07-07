export const WARNING_COOLDOWN_MS = 5 * 60 * 1000
export const STAR_COOLDOWN_MS = 30 * 60 * 1000

export function formatCooldown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
