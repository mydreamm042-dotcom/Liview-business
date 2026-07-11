-- 참여자가 운영자 경고 메시지를 확인 처리하는 API가 "이 세션이 진짜 이 참여자인지 확인"
-- (participants SELECT)과 "확인 처리"(operator_alerts UPDATE)를 별도의 두 왕복으로 순차
-- 실행하고 있었다. operator_alerts에는 session_token이 없어 participants와 조인 없이는
-- UPDATE 필터 하나로 합칠 수 없으므로(Supabase JS 클라이언트는 update() 필터에서 조인을
-- 지원하지 않음), 이 검증+처리를 하나의 원자적 DB 호출로 묶어 왕복을 절반으로 줄인다
-- (참여자가 "확인" 버튼을 눌렀을 때 눈에 띄게 오래 "처리 중..."으로 남아있던 원인).
CREATE OR REPLACE FUNCTION acknowledge_operator_alert(
  p_alert_id uuid,
  p_participant_id uuid,
  p_session_token text
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM participants
    WHERE id = p_participant_id AND session_token = p_session_token
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'participant_not_found');
  END IF;

  UPDATE operator_alerts
  SET acknowledged_at = now()
  WHERE id = p_alert_id AND participant_id = p_participant_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'alert_not_found');
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_operator_alert(uuid, uuid, text) TO anon, authenticated;
