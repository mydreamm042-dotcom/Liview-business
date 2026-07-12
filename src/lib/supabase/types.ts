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

// 운영자 프로필 (Operator 도메인, BUSINESS_RULES.md §2.11). auth.users(Supabase Auth)와
// 1:1이며, 비밀번호/세션 자체는 여기 없다 — Supabase Auth가 전담한다.
export interface Operator {
  id: string
  display_name: string | null
  phone: string | null
  role: 'owner' | 'manager'
  created_at: string
  updated_at: string
}

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
  // 정식 운영자 인증(Operator 도메인, §2.11). 전환 기간 동안 null일 수 있다 —
  // operator_owner_token 기반으로 만들어졌지만 아직 "매장 인증 전환"을 안 한 매장.
  owner_id: string | null
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

// 요일별 영업시간 (Venue 도메인 확장, BUSINESS_RULES.md §2.2 "요일별 영업시간", Phase 5.5).
// weekday: 0=일요일 ... 6=토요일 (Postgres extract(dow)와 동일). 매장당 정확히 7행.
export interface VenueBusinessHours {
  weekday: number
  is_closed: boolean
  is_24h: boolean
  open_time: string  // 'HH:MM' 또는 'HH:MM:SS'
  close_time: string
  last_order_time: string | null
}

// 매장 좌석 마스터 (Seating 도메인). 세션(오늘 영업)이 바뀌어도 유지되는 Venue 소유 데이터.
// position_x/position_y: 자리배치도 캔버스 대비 0~100 퍼센트 좌표 (§2.8 "좌석 배치 자유 구성").
export interface VenueSeat {
  id: string
  venue_id: string
  label: string
  sort_order: number
  position_x: number
  position_y: number
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

// get_operator_dashboard() RPC 응답 (Operator Analytics 도메인, BUSINESS_RULES.md §2.10
// "Phase 5"). hot_density는 방 화면의 실시간 HOT %와 다른, 지난 영업일 비교 전용 파생값
// (그 영업일의 HOT 탭 수 / 손님 수)이다.
export interface DashboardDailySession {
  room_id: string
  name: string
  date: string
  duration_seconds: number | null
  guest_count: number
  avg_star: number
  hot_taps: number
  hot_density: number
  heart_count: number
  alert_count: number
}

export interface DashboardBestDay {
  room_id: string
  name: string
  date: string
  hot_density?: number
  avg_star?: number
  guest_count?: number
}

export interface DashboardWeekdayPattern {
  weekday: number // 0=일 ... 6=토 (Postgres extract(dow))
  avg_guests: number
}

export interface OperatorDashboard {
  total_sessions: number
  total_guest_visits: number
  unique_guests: number
  returning_guest_count: number
  avg_guests_per_session: number | null
  avg_star: number | null
  avg_hot_density: number | null
  daily: DashboardDailySession[]
  best_by_hot_density: DashboardBestDay[]
  best_by_star: DashboardBestDay[]
  best_by_guests: DashboardBestDay[]
  weekday_pattern: DashboardWeekdayPattern[]
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

