// 두 좌표 사이의 거리(미터). Venue Discovery 도메인의 DB 함수(get_live_hot_venues)가 쓰는
// 하버사인 공식과 동일한 계산을, 참여 반경 체크처럼 서버 API에서 JS로 해야 할 때 쓴다.
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
