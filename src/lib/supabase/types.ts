// 'closed'는 BUSINESS 방 전용 마감 상태. ended와 달리 cleanup 삭제 대상이 아니며
// 매장(venue) 이력으로 영구 보존된다. PERSONAL 방은 기존처럼 active → ended만 오간다.
export type RoomStatus = 'active' | 'ended' | 'closed'
export type RoomType = 'PERSONAL' | 'BUSINESS'
export type ReactionType = 'heart' | 'warning' | 'star' | 'hot'

export interface Room {
  id: string
  code: string
  name: string
  status: RoomStatus
  room_type: RoomType
  venue_id?: string | null
  created_at: string
  ended_at?: string | null
}

export type VenueCategory = 'bar' | 'pub' | 'pocha' | 'wine_bar' | 'cafe' | 'event_hall' | 'etc'

// 매장 마스터. 방(세션)이 여러 번 열려도 유지되는 브랜딩/위치/설정의 소유자.
// operator_owner_token은 절대 클라이언트 응답에 포함하지 않는다 (host_session과 동일 원칙).
export interface Venue {
  id: string
  name: string
  category: VenueCategory | null
  address: string | null
  latitude: number | null
  longitude: number | null
  logo_url: string | null
  hero_image_url: string | null
  primary_color: string | null
  secondary_color: string | null
  naver_review_url: string | null
  google_review_url: string | null
  kakao_review_url: string | null
  public_chat_enabled: boolean
  // 고정 QR 입장 보호 장치 (BUSINESS_RULES.md §2.2) — join_password는 운영자 본인 조회에만
  // 포함되고, 공개 조회/참여자 응답에는 절대 내려가지 않는다.
  join_password_enabled: boolean
  join_password: string | null
  geofence_radius_m: number
  created_at: string
  updated_at: string
}

// 참여자 화면에 내려도 되는 매장 브랜딩 필드만 추린 것 (리뷰 URL 포함 — 리뷰 유도 화면에서 사용).
// latitude/longitude/geofence_radius_m은 브랜딩이 아니라 "입장 후 지속 위치 체크"(BUSINESS_RULES.md
// §2.3)를 클라이언트가 스스로 판정하기 위한 값 — 이미 매장에 있는 참여자에게는 민감하지 않다.
export type VenueBranding = Pick<
  Venue,
  'id' | 'name' | 'category' | 'logo_url' | 'hero_image_url' | 'primary_color' | 'secondary_color'
  | 'naver_review_url' | 'google_review_url' | 'kakao_review_url'
  | 'latitude' | 'longitude' | 'geofence_radius_m'
>

export interface Participant {
  id: string
  room_id: string
  nickname: string
  session_token: string
  joined_at: string
  // 나가기 시각. null이면 현재 참여 중. 행을 삭제하지 않고 이 값만 채우는 이유:
  // 삭제하면 받은 하트/HOT 탭/별점/투표가 연쇄 삭제되어 재입장 시 전부 초기화되기 때문.
  left_at: string | null
  // 베타 참여도 분석용: 결과 화면/채팅창을 최초로 연 시각 (없으면 아직 안 열어봄)
  result_viewed_at?: string | null
  chat_opened_at?: string | null
  // Seating 도메인 (BUSINESS_RULES.md §2.8) — BUSINESS 방만 사용, PERSONAL은 항상 null
  seat_id?: string | null
  seat_assigned_at?: string | null
}

// 매장 좌석 마스터 (Seating 도메인). 세션(오늘 영업)이 바뀌어도 유지되는 Venue 소유 데이터.
export interface VenueSeat {
  id: string
  venue_id: string
  label: string
  sort_order: number
  created_at: string
}

// 운영자가 특정 손님에게 보내는 경고 메시지 (Guest Care 도메인, BUSINESS_RULES.md §2.9).
// reactions.warning(참여자 간 익명 자제 시그널)과는 별개 개념.
export interface OperatorAlert {
  id: string
  room_id: string
  participant_id: string
  message: string
  created_at: string
  acknowledged_at: string | null
}

export interface Reaction {
  id: string
  room_id: string
  // sender_session은 절대 클라이언트에 포함하지 않음
  receiver_id: string
  sender_participant_id: string | null
  type: ReactionType
  value: number | null
  created_at: string
}

export interface EndVote {
  id: string
  room_id: string
  voter_session: string
  voted_for_id: string
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  sender_participant_id: string | null
  sender_nickname: string
  content: string
  created_at: string
}

// get_live_hot_venues() RPC 응답 1건. 의도적으로 room_id/code를 포함하지 않는다 —
// Discovery 화면은 방 코드/QR을 절대 노출하지 않는다 (BUSINESS_RULES.md §2.6).
export interface DiscoverVenue {
  id: string
  name: string
  category: VenueCategory | null
  logo_url: string | null
  hero_image_url: string | null
  latitude: number
  longitude: number
  public_chat_enabled: boolean
  // 입장하기 버튼의 "반경 밖" UX 힌트에만 쓴다 — 실제 판정은 join 시점 서버 체크가 최종 근거
  geofence_radius_m: number
  hot_score: number
  satisfaction: number
  distance_km: number
}

