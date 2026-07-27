-- Phase 9 (방 화면 리디자인) — 매장 소개 + 외부 QnA 채널.
-- 디자인 근거: 방 기본 화면의 "소개" 블록, 채팅 탭의 "매장 / 외부 QnA" 2채널.

-- (1) 매장 소개 — 방 화면 하단에 노출되는 매장 한 줄 소개. 운영자 설정에서 입력한다.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS description text;

-- (2) 외부 QnA 채널 (Chat 도메인과 분리된 신규 채널).
-- 기존 messages(Chat 도메인)는 "입장한 참여자끼리"의 대화라 참여자 행이 반드시 있어야 하는데,
-- 이 채널은 매장에 입장하지 않은 외부인도 글을 쓸 수 있어야 해서 별도 테이블로 둔다.
-- (지도 매장 상세에서 질문 → 매장 안 손님이 답변하는 용도)
--
-- author_session: 브라우저 익명 세션 토큰. 쿨타임 판정과 "내 글" 표시에만 쓰고 응답에는
--   절대 포함하지 않는다 (messages.sender_session, reactions.sender_session과 같은 원칙).
-- author_participant_id: 매장 안에서 쓴 글이면 그 참여자. 외부인이면 NULL.
--   좌석 번호 아바타를 그리기 위해 참여자를 조인할 근거값이다.
CREATE TABLE IF NOT EXISTS venue_qna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- 그 영업(세션)에 귀속시킨다. 영업이 끝나면 다음 영업의 QnA와 섞이지 않는다.
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  author_session text NOT NULL,
  author_nickname text NOT NULL,
  author_participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  is_external boolean NOT NULL DEFAULT true,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_qna_room ON venue_qna(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_venue_qna_venue ON venue_qna(venue_id, created_at);
-- 쿨타임 검사(같은 세션의 최근 글 조회)를 인덱스로 받쳐준다.
CREATE INDEX IF NOT EXISTS idx_venue_qna_session ON venue_qna(author_session, created_at DESC);

ALTER TABLE venue_qna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_qna_select" ON venue_qna FOR SELECT USING (true);
CREATE POLICY "venue_qna_insert" ON venue_qna FOR INSERT WITH CHECK (true);

-- 외부인 도배 방지 쿨타임을 검사와 저장이 한 트랜잭션 안에서 이뤄지게 한다
-- (reactions의 submit_cooldown_reaction과 동일한 레이스 방지 패턴).
-- 매장 안 손님(is_external=false)은 쿨타임을 적용하지 않는다 — 이미 QR+위치 검증을 통과해
-- 실제로 그 매장에 있는 사람이라 도배 유인이 낮고, 대화가 끊기면 안 되기 때문.
CREATE OR REPLACE FUNCTION submit_venue_qna(
  p_venue_id uuid,
  p_room_id uuid,
  p_author_session text,
  p_author_nickname text,
  p_author_participant_id uuid,
  p_is_external boolean,
  p_content text,
  p_cooldown_seconds int DEFAULT 60
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_last timestamptz;
  v_row venue_qna;
BEGIN
  IF p_is_external THEN
    SELECT max(created_at) INTO v_last
    FROM venue_qna
    WHERE author_session = p_author_session AND is_external = true;

    IF v_last IS NOT NULL AND now() < v_last + (p_cooldown_seconds || ' seconds')::interval THEN
      RETURN json_build_object(
        'cooldown', true,
        'retry_after_seconds', ceil(extract(epoch FROM (v_last + (p_cooldown_seconds || ' seconds')::interval - now())))
      );
    END IF;
  END IF;

  INSERT INTO venue_qna (venue_id, room_id, author_session, author_nickname, author_participant_id, is_external, content)
  VALUES (p_venue_id, p_room_id, p_author_session, p_author_nickname, p_author_participant_id, p_is_external, p_content)
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'cooldown', false,
    'message', json_build_object(
      'id', v_row.id,
      'room_id', v_row.room_id,
      'author_nickname', v_row.author_nickname,
      'author_participant_id', v_row.author_participant_id,
      'is_external', v_row.is_external,
      'content', v_row.content,
      'created_at', v_row.created_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_venue_qna(uuid, uuid, text, text, uuid, boolean, text, int) TO anon, authenticated;
