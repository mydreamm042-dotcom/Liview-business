export type RoomStatus = 'active' | 'ended'
export type ReactionType = 'heart' | 'warning' | 'star' | 'hot'

export interface Room {
  id: string
  code: string
  name: string
  status: RoomStatus
  created_at: string
  ended_at?: string | null
}

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

