-- Phase 9 (홈 지도/Discovery 리디자인) — BUSINESS_RULES.md §2.7 "v4 갱신" 반영.
-- (1) 지도에 세션 유무와 무관하게 등록된 전체 매장을 표시(LEFT JOIN),
-- (2) 구독 상태 컬럼 신설(Subscription 도메인 §2.14, Phase 9.5 게이트의 근거값),
-- (3) 매장 상세 바텀시트용 공개 상세 RPC,
-- (4) 지역별 TOP10 랭킹(HOT/별점/헌팅) RPC.

-- (2) 구독 상태 — Phase 9.5(결제 연동) 전까지는 관리자가 수동 세팅한다(§2.14 "임시 운영 방안").
-- 기존 매장이 리디자인 직후에도 기능/배지가 정상 동작하도록 기본값은 'active'로 둔다.
-- 실제 결제 게이트(reactions/chat/seats 쓰기 차단)는 이 컬럼을 읽어 Phase 9.5에서 붙인다.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active'
  CHECK (subscription_status IN ('active', 'inactive'));

-- (1) 지도/목록용 실시간 HOT 매장. v4 변경점: rooms를 LEFT JOIN으로 바꿔 현재 열려있는 방이
-- 없는 매장도 포함한다(그 경우 hot_score/satisfaction/heart는 0, is_open=false). 구독 배지
-- 표시를 위해 subscription_status를, 헌팅 랭킹을 위해 heart_count를 추가로 내려준다.
-- 방 코드/QR은 여전히 어떤 형태로도 포함하지 않는다(§2.6 무결성 규칙).
CREATE OR REPLACE FUNCTION get_live_hot_venues(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 10,
  p_window_minutes int DEFAULT 15,
  p_category text DEFAULT NULL
)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(v ORDER BY v.hot_score DESC), '[]'::json)
  FROM (
    SELECT
      venues.id,
      venues.name,
      venues.category,
      venues.logo_url,
      venues.hero_image_url,
      venues.latitude,
      venues.longitude,
      venues.public_chat_enabled,
      venues.geofence_radius_m,
      venues.subscription_status,
      (active_room.id IS NOT NULL) AS is_open,
      COALESCE(hot_recent.cnt, 0)::float / GREATEST(active_participants.cnt, 1) AS hot_score,
      COALESCE(mood.avg_mood, 0) AS satisfaction,
      COALESCE(hearts.cnt, 0) AS heart_count,
      (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_lat)) * cos(radians(venues.latitude)) *
            cos(radians(venues.longitude) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(venues.latitude))
          ))
        )
      ) AS distance_km
    FROM venues
    LEFT JOIN LATERAL (
      SELECT id FROM rooms
      WHERE rooms.venue_id = venues.id AND rooms.status = 'active'
      ORDER BY rooms.created_at DESC LIMIT 1
    ) active_room ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM reactions
      WHERE reactions.room_id = active_room.id AND reactions.type = 'hot'
        AND reactions.created_at >= now() - (p_window_minutes || ' minutes')::interval
    ) hot_recent ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM participants
      WHERE participants.room_id = active_room.id AND participants.left_at IS NULL
    ) active_participants ON true
    LEFT JOIN LATERAL (
      SELECT AVG(value) AS avg_mood FROM reactions
      WHERE reactions.room_id = active_room.id AND reactions.type = 'star' AND reactions.value IS NOT NULL
    ) mood ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM reactions
      WHERE reactions.room_id = active_room.id AND reactions.type = 'heart'
    ) hearts ON true
    WHERE venues.latitude IS NOT NULL AND venues.longitude IS NOT NULL
      AND (p_category IS NULL OR venues.category = p_category)
  ) v
  WHERE v.distance_km <= p_radius_km
$$;

GRANT EXECUTE ON FUNCTION get_live_hot_venues(double precision, double precision, double precision, int, text) TO anon, authenticated;

-- (3) 매장 상세 바텀시트(§2.7 "매장 상세 화면 v4"). 지도 마커/랭킹/검색 어느 경로로 들어와도
-- 이 하나의 RPC로 상세를 채운다. 비참여자도 읽는 공개 데이터라 sender/개인식별 정보는 넣지 않고,
-- HOT 지수 원천값(집계)·평균 별점·하트 수·좌석 점유 현황·HOT 탭 10분 버킷 타임라인만 반환한다.
CREATE OR REPLACE FUNCTION get_venue_public_detail(p_venue_id uuid)
RETURNS json LANGUAGE sql STABLE AS $$
  WITH v AS (
    SELECT id, name, category, logo_url, hero_image_url,
           public_chat_enabled, subscription_status, geofence_radius_m, latitude, longitude
    FROM venues WHERE id = p_venue_id
  ),
  active_room AS (
    SELECT id, created_at FROM rooms
    WHERE venue_id = p_venue_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  )
  SELECT json_build_object(
    'venue', (SELECT row_to_json(v) FROM v),
    'is_open', EXISTS (SELECT 1 FROM active_room),
    'opened_at', (SELECT created_at FROM active_room),
    'hot_score', COALESCE((
      SELECT COUNT(*)::float / GREATEST((
        SELECT COUNT(*) FROM participants WHERE room_id = (SELECT id FROM active_room) AND left_at IS NULL
      ), 1)
      FROM reactions
      WHERE room_id = (SELECT id FROM active_room) AND type = 'hot'
        AND created_at >= now() - interval '15 minutes'
    ), 0),
    'satisfaction', COALESCE((
      SELECT ROUND(AVG(value)::numeric, 1) FROM reactions
      WHERE room_id = (SELECT id FROM active_room) AND type = 'star' AND value IS NOT NULL
    ), 0),
    'heart_count', COALESCE((
      SELECT COUNT(*) FROM reactions
      WHERE room_id = (SELECT id FROM active_room) AND type = 'heart'
    ), 0),
    'participant_count', COALESCE((
      SELECT COUNT(*) FROM participants
      WHERE room_id = (SELECT id FROM active_room) AND left_at IS NULL
    ), 0),
    'seats', COALESCE((
      SELECT json_agg(json_build_object(
        'label', vs.label,
        'occupied', EXISTS (
          SELECT 1 FROM participants p
          WHERE p.seat_id = vs.id AND p.room_id = (SELECT id FROM active_room) AND p.left_at IS NULL
        )
      ) ORDER BY vs.sort_order)
      FROM venue_seats vs WHERE vs.venue_id = p_venue_id
    ), '[]'::json),
    'hot_timeline', COALESCE((
      SELECT json_agg(json_build_object('t', bucket, 'count', cnt) ORDER BY bucket)
      FROM (
        SELECT to_timestamp(floor(extract(epoch FROM created_at) / 600) * 600) AS bucket, COUNT(*) AS cnt
        FROM reactions
        WHERE room_id = (SELECT id FROM active_room) AND type = 'hot'
        GROUP BY bucket
      ) buckets
    ), '[]'::json)
  )
$$;

GRANT EXECUTE ON FUNCTION get_venue_public_detail(uuid) TO anon, authenticated;

-- (4) 지역별 TOP10 랭킹(§2.7 "지역별 TOP10 랭킹"). 손님 전용 화면 데이터. 현재 열려있는 방을
-- 가진 매장만 랭킹 대상(닫힌 매장을 "지금 핫한 랭킹"에 넣는 건 의미 없음). 같은 반경 내 매장을
-- 세 지표(HOT 밀도 / 평균 별점 / 하트 수)로 각각 정렬해 상위 10개씩 반환한다.
CREATE OR REPLACE FUNCTION get_regional_rankings(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 10
)
RETURNS json LANGUAGE sql STABLE AS $$
  WITH ranked AS (
    SELECT
      venues.id, venues.name, venues.category, venues.logo_url,
      venues.subscription_status,
      COALESCE(hot_recent.cnt, 0)::float / GREATEST(active_participants.cnt, 1) AS hot_score,
      COALESCE(mood.avg_mood, 0) AS satisfaction,
      COALESCE(hearts.cnt, 0) AS heart_count,
      (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_lat)) * cos(radians(venues.latitude)) *
            cos(radians(venues.longitude) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(venues.latitude))
          ))
        )
      ) AS distance_km
    FROM venues
    JOIN LATERAL (
      SELECT id FROM rooms
      WHERE rooms.venue_id = venues.id AND rooms.status = 'active'
      ORDER BY rooms.created_at DESC LIMIT 1
    ) active_room ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM reactions
      WHERE reactions.room_id = active_room.id AND reactions.type = 'hot'
        AND reactions.created_at >= now() - interval '15 minutes'
    ) hot_recent ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM participants
      WHERE participants.room_id = active_room.id AND participants.left_at IS NULL
    ) active_participants ON true
    LEFT JOIN LATERAL (
      SELECT AVG(value) AS avg_mood FROM reactions
      WHERE reactions.room_id = active_room.id AND reactions.type = 'star' AND reactions.value IS NOT NULL
    ) mood ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM reactions
      WHERE reactions.room_id = active_room.id AND reactions.type = 'heart'
    ) hearts ON true
    WHERE venues.latitude IS NOT NULL AND venues.longitude IS NOT NULL
  ),
  in_radius AS (
    SELECT * FROM ranked WHERE distance_km <= p_radius_km
  )
  SELECT json_build_object(
    'hot', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id, 'name', name, 'category', category, 'logo_url', logo_url,
        'subscription_status', subscription_status, 'hot_score', hot_score
      )), '[]'::json)
      FROM (SELECT * FROM in_radius WHERE hot_score > 0 ORDER BY hot_score DESC LIMIT 10) t
    ),
    'star', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id, 'name', name, 'category', category, 'logo_url', logo_url,
        'subscription_status', subscription_status, 'satisfaction', satisfaction
      )), '[]'::json)
      FROM (SELECT * FROM in_radius WHERE satisfaction > 0 ORDER BY satisfaction DESC LIMIT 10) t
    ),
    'heart', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id, 'name', name, 'category', category, 'logo_url', logo_url,
        'subscription_status', subscription_status, 'heart_count', heart_count
      )), '[]'::json)
      FROM (SELECT * FROM in_radius WHERE heart_count > 0 ORDER BY heart_count DESC LIMIT 10) t
    )
  )
$$;

GRANT EXECUTE ON FUNCTION get_regional_rankings(double precision, double precision, double precision) TO anon, authenticated;
