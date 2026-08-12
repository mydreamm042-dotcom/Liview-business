const SESSION_KEY = 'mystar_session_token'
const ROOM_KEY = 'mystar_room_data'

export function getSessionToken(): string {
  if (typeof window === 'undefined') return ''
  let token = localStorage.getItem(SESSION_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, token)
  }
  return token
}

// 개발/테스트 전용(dev-join) — 이 브라우저가 앞으로 이 세션 토큰의 참여자로 행동하게
// 강제로 바꾼다. 일반 참여자 흐름에서는 절대 쓰지 않는다(세션 토큰은 자연 발생만 함).
export function setSessionToken(token: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, token)
}

export interface StoredRoomData {
  roomId: string
  roomCode: string
  roomName: string
  participantId: string
  nickname: string
}

export function storeRoomData(data: StoredRoomData) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ROOM_KEY, JSON.stringify(data))
}

export function getRoomData(): StoredRoomData | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(ROOM_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearRoomData() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ROOM_KEY)
}

const PREVIEW_GUEST_KEY = 'mystar_preview_as_guest'

// 개발/테스트 전용 — 운영자로 로그인한 같은 탭에서 손님 화면을 바로 미리보기 위한 플래그.
// 방 화면의 실제 권한 판정(서버의 isHost, 각 API의 requireOperator 등)은 전혀 건드리지
// 않는다 — 오직 클라이언트 렌더링(호스트 캔버스 vs 손님 캔버스 등)만 이 값으로 뒤집는다.
// sessionStorage라 이 탭에서만 켜지고, 탭을 닫으면 자동으로 꺼진다.
export function setPreviewAsGuest() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(PREVIEW_GUEST_KEY, '1')
}

export function isPreviewingAsGuest(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(PREVIEW_GUEST_KEY) === '1'
}

export function clearPreviewAsGuest() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(PREVIEW_GUEST_KEY)
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
