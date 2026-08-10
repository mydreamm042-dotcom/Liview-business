-- 좌석 배치 자유 구성 (Seating 도메인 확장, BUSINESS_RULES.md §2.8 "좌석 배치 자유 구성").
-- 좌석이 label 하나로 목록 순서대로 추가되던 것을, 운영자가 드래그로 실제 매장 구조와
-- 유사하게 배치할 수 있도록 좌표를 추가한다. 캔버스 크기에 관계없이 반응형으로 렌더링할
-- 수 있도록 절대 픽셀이 아니라 0~100 사이의 퍼센트 좌표로 저장한다.
alter table venue_seats
  add column if not exists position_x double precision not null default 50,
  add column if not exists position_y double precision not null default 50;

comment on column venue_seats.position_x is '자리배치도 캔버스 내 좌석 위치 X (0~100, 퍼센트)';
comment on column venue_seats.position_y is '자리배치도 캔버스 내 좌석 위치 Y (0~100, 퍼센트)';
