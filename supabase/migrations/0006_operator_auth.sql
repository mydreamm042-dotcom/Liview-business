-- B2B Pivot Phase 4.5: 운영자 정식 회원가입/로그인
-- 기존 0001~0005 적용 이후 실행. additive이며, venues.operator_owner_token은
-- 전환 기간 동안 그대로 둔다(이번 마이그레이션에서 삭제하지 않음).
-- 설계 근거: BUSINESS_RULES.md §2.11(Operator), ROADMAP_V2.md Phase 4.5

-- 운영자 프로필. 인증(비밀번호 해시, 세션/JWT, 이메일 인증)은 Supabase Auth(auth.users)에
-- 위임하고, 이 테이블은 auth.users 각 계정에 1:1로 딸린 "사장님 프로필" 확장 정보만 갖는다.
-- role은 지금은 owner만 쓰지만, 나중에 매장 직원에게 제한된 관리자 권한을 줄 수 있도록
-- 미리 열어둔다.
CREATE TABLE IF NOT EXISTS operators (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone text,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
-- 본인 프로필만 조회/수정 가능. INSERT는 회원가입 직후 본인이 자기 id로만 만들 수 있다.
CREATE POLICY "operators_select_own" ON operators FOR SELECT USING (auth.uid() = id);
CREATE POLICY "operators_insert_own" ON operators FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "operators_update_own" ON operators FOR UPDATE USING (auth.uid() = id);

-- 매장 소유권. FK 하나로 1(운영자):N(매장) 관계가 자연히 성립 — 프랜차이즈처럼 한 사람이
-- 여러 매장을 갖는 걸 그대로 지원한다. ON DELETE RESTRICT: 운영자 계정이 삭제될 때 소유
-- 매장이 조용히 고아가 되지 않도록, 매장을 먼저 정리(양도/삭제)하게 강제한다.
-- nullable인 이유: 기존 operator_owner_token 매장들은 "매장 인증 전환" 플로우를 통해
-- 나중에 owner_id가 채워지기 전까지는 비어있는 게 정상이다.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES operators(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_venues_owner_id ON venues(owner_id);

-- 새로 등록되는 매장은 이제 owner_id로만 소유권을 가지므로, operator_owner_token을
-- 더 이상 필수로 강제하지 않는다 (기존 값이 있는 행은 그대로 유지).
ALTER TABLE venues ALTER COLUMN operator_owner_token DROP NOT NULL;

COMMENT ON COLUMN venues.operator_owner_token IS
  '전환 기간 한정 — 브라우저 임의 토큰 기반 임시 인증. owner_id로 대체되는 중이며,
   모든 매장의 전환이 끝나면 이 컬럼은 제거된다. 새로 등록되는 매장은 이 값을 갖지 않는다.';
