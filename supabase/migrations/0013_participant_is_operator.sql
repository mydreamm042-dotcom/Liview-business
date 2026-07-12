-- 버그 수정: 방 화면 참여자 목록의 HOST 표시가 "먼저 입장한 참여자"(도착 순서) 기준이라,
-- 운영자가 "방 화면 보기"를 누르기 전에 손님이 먼저 입장하면 그 손님이 HOST로 잘못
-- 표시되는 문제가 있었다. 지금까지는 운영자의 참여자 행을 닉네임 '사장님' 문자열로만
-- 구분했는데(0009_operator_dashboard_rpc.sql 등), 이건 손님이 우연히 같은 닉네임을 쓰면
-- 구분이 무너지는 취약한 방식이다. 대신 participants에 실제 플래그를 추가한다 — 이 값은
-- operator-join API(Supabase Auth + venues.owner_id로 이미 운영자 신원을 검증한 경로)만
-- true로 설정하며, 손님이 거치는 어떤 입장 경로도 이 값을 true로 만들 수 없다.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS is_operator boolean NOT NULL DEFAULT false;

-- 기존에 이미 생성된 운영자 참여자 행(닉네임 '사장님')을 소급 반영한다.
UPDATE participants SET is_operator = true WHERE nickname = '사장님' AND is_operator = false;

-- 대시보드의 손님 지표 집계도 같은 이유로 nickname 문자열 비교 대신 이 플래그를 쓰도록
-- 갱신한다 (0009/0012에서 쓰던 "p.nickname != '사장님'"을 대체) — Operator Analytics
-- 도메인, BUSINESS_RULES.md §2.10 "운영자 참여 제외".
CREATE OR REPLACE FUNCTION get_operator_dashboard(p_venue_id uuid, p_days int DEFAULT 90)
RETURNS json LANGUAGE sql STABLE AS $$
  WITH sessions AS (
    SELECT
      r.id AS room_id,
      r.name,
      r.created_at::date AS session_date,
      EXTRACT(EPOCH FROM (r.ended_at - r.created_at))::bigint AS duration_seconds
    FROM rooms r
    WHERE r.venue_id = p_venue_id
      AND r.room_type = 'BUSINESS'
      AND r.status = 'closed'
  ),
  guests AS (
    SELECT p.room_id, p.session_token
    FROM participants p
    WHERE p.room_id IN (SELECT room_id FROM sessions)
      AND p.is_operator = false
  ),
  per_session_guests AS (
    SELECT room_id, count(*) AS guest_count
    FROM guests GROUP BY room_id
  ),
  per_session_stars AS (
    SELECT room_id, avg(value) AS avg_star
    FROM reactions
    WHERE room_id IN (SELECT room_id FROM sessions) AND type = 'star' AND value IS NOT NULL
    GROUP BY room_id
  ),
  per_session_hot AS (
    SELECT room_id, count(*) AS hot_taps
    FROM reactions
    WHERE room_id IN (SELECT room_id FROM sessions) AND type = 'hot'
    GROUP BY room_id
  ),
  per_session_hearts AS (
    SELECT room_id, count(*) AS heart_count
    FROM reactions
    WHERE room_id IN (SELECT room_id FROM sessions) AND type = 'heart'
    GROUP BY room_id
  ),
  per_session_alerts AS (
    SELECT room_id, count(*) AS alert_count
    FROM operator_alerts
    WHERE room_id IN (SELECT room_id FROM sessions)
    GROUP BY room_id
  ),
  per_session_events AS (
    SELECT room_id, json_agg(json_build_object('content', content, 'created_at', created_at) ORDER BY created_at) AS events
    FROM operation_events
    WHERE room_id IN (SELECT room_id FROM sessions)
    GROUP BY room_id
  ),
  daily_all AS (
    SELECT
      s.room_id,
      s.name,
      s.session_date,
      s.duration_seconds,
      coalesce(g.guest_count, 0) AS guest_count,
      round(coalesce(st.avg_star, 0)::numeric, 2) AS avg_star,
      coalesce(h.hot_taps, 0) AS hot_taps,
      CASE WHEN coalesce(g.guest_count, 0) > 0
        THEN round((coalesce(h.hot_taps, 0)::numeric / g.guest_count), 2)
        ELSE 0 END AS hot_density,
      coalesce(he.heart_count, 0) AS heart_count,
      coalesce(a.alert_count, 0) AS alert_count,
      coalesce(ev.events, '[]'::json) AS events
    FROM sessions s
    LEFT JOIN per_session_guests g ON g.room_id = s.room_id
    LEFT JOIN per_session_stars st ON st.room_id = s.room_id
    LEFT JOIN per_session_hot h ON h.room_id = s.room_id
    LEFT JOIN per_session_hearts he ON he.room_id = s.room_id
    LEFT JOIN per_session_alerts a ON a.room_id = s.room_id
    LEFT JOIN per_session_events ev ON ev.room_id = s.room_id
  ),
  daily_recent AS (
    SELECT * FROM daily_all WHERE session_date >= current_date - p_days
  ),
  returning_guests AS (
    SELECT session_token
    FROM guests
    GROUP BY session_token
    HAVING count(DISTINCT room_id) >= 2
  ),
  visits AS (
    SELECT count(*) AS total_visits, count(DISTINCT session_token) AS unique_guests
    FROM guests
  )
  SELECT json_build_object(
    'total_sessions', (SELECT count(*) FROM sessions),
    'total_guest_visits', (SELECT total_visits FROM visits),
    'unique_guests', (SELECT unique_guests FROM visits),
    'returning_guest_count', (SELECT count(*) FROM returning_guests),
    'avg_guests_per_session', (SELECT round(avg(guest_count), 1) FROM daily_all),
    'avg_star', (SELECT round(avg(avg_star), 2) FROM daily_all WHERE avg_star > 0),
    'avg_hot_density', (SELECT round(avg(hot_density), 2) FROM daily_all),
    'daily', (
      SELECT coalesce(json_agg(json_build_object(
        'room_id', room_id, 'name', name, 'date', session_date,
        'duration_seconds', duration_seconds, 'guest_count', guest_count,
        'avg_star', avg_star, 'hot_taps', hot_taps, 'hot_density', hot_density,
        'heart_count', heart_count, 'alert_count', alert_count, 'events', events
      ) ORDER BY session_date), '[]'::json)
      FROM daily_recent
    ),
    'best_by_hot_density', (
      SELECT coalesce(json_agg(json_build_object('room_id', room_id, 'name', name, 'date', session_date, 'hot_density', hot_density)), '[]'::json)
      FROM (SELECT * FROM daily_all WHERE hot_density > 0 ORDER BY hot_density DESC, session_date DESC LIMIT 3) t
    ),
    'best_by_star', (
      SELECT coalesce(json_agg(json_build_object('room_id', room_id, 'name', name, 'date', session_date, 'avg_star', avg_star)), '[]'::json)
      FROM (SELECT * FROM daily_all WHERE avg_star > 0 ORDER BY avg_star DESC, session_date DESC LIMIT 3) t
    ),
    'best_by_guests', (
      SELECT coalesce(json_agg(json_build_object('room_id', room_id, 'name', name, 'date', session_date, 'guest_count', guest_count)), '[]'::json)
      FROM (SELECT * FROM daily_all WHERE guest_count > 0 ORDER BY guest_count DESC, session_date DESC LIMIT 3) t
    ),
    'weekday_pattern', (
      SELECT coalesce(json_agg(json_build_object('weekday', dow, 'avg_guests', avg_guests) ORDER BY dow), '[]'::json)
      FROM (
        SELECT extract(dow FROM session_date)::int AS dow, round(avg(guest_count), 1) AS avg_guests
        FROM daily_all
        GROUP BY dow
      ) w
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_operator_dashboard(uuid, int) TO anon, authenticated;
