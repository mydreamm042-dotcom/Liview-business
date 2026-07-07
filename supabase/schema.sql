-- mySTAR 술자리 피드백 앱 스키마

-- 방 테이블
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(6) UNIQUE NOT NULL,
  name text NOT NULL,
  host_session text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 참여자 테이블. (room_id, session_token) 유니크 제약은 같은 사람이 동시에 두 번
-- 입장 요청을 보내는 레이스에서 중복 참여자가 생기는 것을 DB 차원에서 막는다
-- (API의 "이미 있는지 확인 후 insert"만으로는 동시 요청 틈을 막을 수 없음).
--
-- "나가기"는 행을 삭제하지 않고 left_at만 채운다 (soft leave). 삭제하면 받은 하트,
-- HOT 탭, 별점, 투표가 연쇄 삭제되어 재입장 시 전부 초기화되기 때문. 같은 기기로
-- 재입장하면 left_at을 비워 같은 참여자로 복귀한다.
--
-- result_viewed_at / chat_opened_at: 베타 참여도 분석용. 클릭은 했지만 다른 테이블엔
-- 흔적이 안 남는 행동(결과 화면 열람, 채팅창 열람)을 최초 1회만 기록한다 (이미 값이
-- 있으면 갱신하지 않음 — "몇 번 열었나"가 아니라 "열어봤는가/언제 처음"만 필요하므로).
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  session_token text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  result_viewed_at timestamptz,
  chat_opened_at timestamptz,
  UNIQUE(room_id, session_token)
);

-- 리액션 테이블 (하트, 자제 시그널, 별점, HOT 탭)
CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_session text NOT NULL,
  sender_participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  receiver_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('heart', 'warning', 'star', 'hot')),
  value int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 방 종료 투표. (room_id, voter_session) 유니크 = 한 사람당 한 표.
-- 이전에는 (room_id, voter_session, voted_for_id) 유니크여서 "같은 사람에게 두 번"만
-- 막고 "다른 사람에게 또 투표"는 막지 못했다.
CREATE TABLE IF NOT EXISTS end_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  voter_session text NOT NULL,
  voted_for_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, voter_session)
);

-- 공용 채팅 메시지 테이블. 다른 테이블과 달리 sender_participant_id는
-- ON DELETE CASCADE가 아닌 SET NULL로 걸어, 참여자가 나가기(하드 삭제)를 해도
-- 채팅 기록 자체는 남도록 한다 (sender_nickname에 전송 당시 닉네임을 스냅샷으로
-- 저장해두므로, 참여자 행이 사라져도 누가 보낸 메시지인지 표시는 그대로 유지된다).
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  sender_nickname text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE end_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_select" ON rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms_update" ON rooms FOR UPDATE USING (true);
CREATE POLICY "participants_select" ON participants FOR SELECT USING (true);
CREATE POLICY "participants_insert" ON participants FOR INSERT WITH CHECK (true);
CREATE POLICY "participants_update" ON participants FOR UPDATE USING (true);
CREATE POLICY "reactions_select" ON reactions FOR SELECT USING (true);
CREATE POLICY "reactions_insert" ON reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "end_votes_select" ON end_votes FOR SELECT USING (true);
CREATE POLICY "end_votes_insert" ON end_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "messages_select" ON messages FOR SELECT USING (true);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_reactions_room_id ON reactions(room_id);
CREATE INDEX IF NOT EXISTS idx_reactions_receiver_id ON reactions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_end_votes_room_id ON end_votes(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id, created_at);

-- 종료된 지 24시간 지난 방과, 종료 안 된 채로 2일 지난 방(방치된 방)을 정리한다.
-- participants/reactions/end_votes/messages는 rooms에 ON DELETE CASCADE로 걸려 있어 함께 삭제된다.
-- /api/cron/cleanup-rooms 에서 주기적으로 호출한다 (vercel.json cron 설정 참고).
CREATE OR REPLACE FUNCTION delete_old_rooms()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM rooms
  WHERE status = 'ended'
    AND created_at < now() - INTERVAL '24 hours';

  DELETE FROM rooms
  WHERE status = 'active'
    AND created_at < now() - INTERVAL '2 days';
END;
$$;

GRANT EXECUTE ON FUNCTION delete_old_rooms() TO anon, authenticated, service_role;

-- 하트/경고/별점 집계를 DB에서 미리 계산해서 반환한다 (클라이언트가 매번 원본
-- reactions 전체를 내려받아 직접 세지 않도록 하기 위함. 3초마다 도는 재조회 폴링이
-- 파티가 길어질수록 느려지는 걸 막는 용도).
CREATE OR REPLACE FUNCTION get_reaction_summary(p_room_id uuid)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'heart_counts', (
      SELECT coalesce(json_object_agg(receiver_id, cnt), '{}'::json)
      FROM (
        SELECT receiver_id, count(*) AS cnt
        FROM reactions
        WHERE room_id = p_room_id AND type = 'heart'
        GROUP BY receiver_id
      ) h
    ),
    'warning_counts', (
      SELECT coalesce(json_object_agg(receiver_id, cnt), '{}'::json)
      FROM (
        SELECT receiver_id, count(*) AS cnt
        FROM reactions
        WHERE room_id = p_room_id AND type = 'warning'
        GROUP BY receiver_id
      ) w
    ),
    'mood_average', (
      SELECT avg(value) FROM reactions WHERE room_id = p_room_id AND type = 'star' AND value IS NOT NULL
    ),
    'total_reactions', (
      SELECT count(*) FROM reactions WHERE room_id = p_room_id AND type != 'hot'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_reaction_summary(uuid) TO anon, authenticated;

-- 자제 시그널/별점 쿨타임 체크와 저장을 하나의 원자적 작업으로 묶는다.
-- 기존에는 "최근 기록 확인" -> "저장"이 API 서버에서 별도의 두 요청으로 분리되어 있어서,
-- 그 사이 틈에 같은 사람이 거의 동시에 또 요청을 보내면 둘 다 통과해 쿨타임이 뚫릴 수 있었다.
-- pg_advisory_xact_lock으로 "같은 발신자 + 같은 리액션 종류" 요청끼리만 순서대로 처리되도록
-- 잠그고, 그 안에서 확인과 저장을 함께 수행해 경쟁 상태를 없앤다. 다른 발신자나 다른 종류의
-- 요청은 서로 전혀 대기하지 않는다.
CREATE OR REPLACE FUNCTION submit_cooldown_reaction(
  p_room_id uuid,
  p_sender_session text,
  p_sender_participant_id uuid,
  p_receiver_id uuid,
  p_type text,
  p_value int,
  p_cooldown_seconds int
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_existing timestamptz;
  v_row reactions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_sender_session || p_type)::bigint);

  SELECT created_at INTO v_existing
  FROM reactions
  WHERE room_id = p_room_id
    AND sender_session = p_sender_session
    AND type = p_type
    AND created_at >= now() - (p_cooldown_seconds || ' seconds')::interval
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('cooldown', true);
  END IF;

  INSERT INTO reactions (room_id, sender_session, sender_participant_id, receiver_id, type, value)
  VALUES (p_room_id, p_sender_session, p_sender_participant_id, p_receiver_id, p_type, p_value)
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'cooldown', false,
    'id', v_row.id,
    'room_id', v_row.room_id,
    'receiver_id', v_row.receiver_id,
    'sender_participant_id', v_row.sender_participant_id,
    'type', v_row.type,
    'value', v_row.value,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_cooldown_reaction(uuid, text, uuid, uuid, text, int, int) TO anon, authenticated;
