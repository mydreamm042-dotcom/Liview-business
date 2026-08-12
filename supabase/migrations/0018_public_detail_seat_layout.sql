-- ADR-0008 — 매장 상세 바텀시트(§2.7)의 좌석 탭을 실제 자리배치도로 승격.
--
-- 기존 get_venue_public_detail은 좌석을 { label, occupied }로만 내려줘서 화면이 "3 / 12 좌석
-- 사용 중" 같은 집계 숫자밖에 그릴 수 없었다. §2.7의 원래 규칙 문구는 "어떤 좌석이 비어있는지"라
-- 배치도를 보여주는 게 맞다 — 좌표(position_x/y)와 배치 장식 요소(venue_layout_items)를 함께
-- 내려줘서 손님 화면과 동일한 SeatMap 캔버스로 렌더링할 수 있게 한다.
--
-- 비참여자도 읽는 공개 데이터라는 성격은 그대로다 — 좌석 배치는 매장에 들어가면 누구나 보는
-- 정보이고, 여기에 참여자 개인식별 정보(닉네임/세션)는 여전히 포함하지 않는다.
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
    -- id/좌표 추가 (ADR-0008). SeatMap이 참여자 배열과 seat_id로 점유 여부를 계산하지만,
    -- 여기선 참여자 정보를 공개하지 않으므로 occupied 플래그를 그대로 유지한다 — 화면이
    -- 이 플래그로 "가상의 점유자"를 만들어 SeatMap에 넘긴다.
    'seats', COALESCE((
      SELECT json_agg(json_build_object(
        'id', vs.id,
        'venue_id', vs.venue_id,
        'label', vs.label,
        'sort_order', vs.sort_order,
        'position_x', vs.position_x,
        'position_y', vs.position_y,
        'created_at', vs.created_at,
        'occupied', EXISTS (
          SELECT 1 FROM participants p
          WHERE p.seat_id = vs.id AND p.room_id = (SELECT id FROM active_room) AND p.left_at IS NULL
        )
      ) ORDER BY vs.sort_order)
      FROM venue_seats vs WHERE vs.venue_id = p_venue_id
    ), '[]'::json),
    'layout_items', COALESCE((
      SELECT json_agg(json_build_object(
        'id', li.id,
        'venue_id', li.venue_id,
        'kind', li.kind,
        'label', li.label,
        'position_x', li.position_x,
        'position_y', li.position_y,
        'width', li.width,
        'height', li.height,
        'rotation', li.rotation,
        'sort_order', li.sort_order,
        'created_at', li.created_at
      ) ORDER BY li.sort_order)
      FROM venue_layout_items li WHERE li.venue_id = p_venue_id
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
