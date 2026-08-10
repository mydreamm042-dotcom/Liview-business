-- B2B Pivot: Venue 고정 QR + 세션(영업 시작/종료) + 입장 비밀번호 + 위치 반경 제한
-- 기존 0001/0002 적용 이후 실행. 모두 additive.
-- 설계 배경: 매장은 "매번 새 방을 만드는" 게 아니라 "한 번 등록하면 QR이 고정"되고,
-- 그 QR로는 매장의 "현재 진행 중인 세션(오늘 영업)"에 들어간다. rooms.code는 여전히
-- 내부적으로 존재하지만(URL 슬러그 용도), 참여자가 직접 입력/스캔하는 값이 아니다.
--
-- 고정 QR의 새로운 악용 경로(스캔한 QR 사진을 온라인에 유포해 원격 참여) 대응책 2가지:
--   1) 매장 운영자가 매일 자유롭게 켜고 끌 수 있는 입장 비밀번호
--   2) 참여자의 실시간 위치가 매장 반경 N미터 이내일 때만 입장 허용 (입장 후 이탈 시 자동 퇴장)

ALTER TABLE venues ADD COLUMN IF NOT EXISTS join_password_enabled boolean NOT NULL DEFAULT false;

-- 평문 저장. 낮은 위험도의 "오늘의 구두 비밀번호"(와이파이 비밀번호와 성격이 비슷함)라
-- 해시가 주는 이득보다 매일 바꾸는 운영자 UX가 더 중요하다고 판단했다. operator_owner_token과
-- 같은 원칙: 이 매장의 운영자 본인에게는 노출되지만, 공개 조회 API에는 절대 포함되지 않는다.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS join_password text;

-- 입장 허용 반경(미터). 기본값 50m은 "매장 안 + 바로 앞" 정도를 커버하도록 잡은 초기값이며,
-- 매장별로 다르게 설정 가능하도록 컬럼으로 둔다 (운영자 설정 UI는 이후 Phase에서 노출 여부 결정).
ALTER TABLE venues ADD COLUMN IF NOT EXISTS geofence_radius_m int NOT NULL DEFAULT 50;

COMMENT ON COLUMN venues.join_password IS '오늘의 입장 비밀번호. join_password_enabled=true일 때만 검사한다. 형식 제한 없음(한글/영문/특수문자 혼용 가능).';
COMMENT ON COLUMN venues.geofence_radius_m IS '참여자 위치가 이 반경(미터) 밖이면 입장 불가, 입장 후에도 벗어나면 자동 퇴장 대상이 된다.';
