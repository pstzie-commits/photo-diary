-- 사진 일기 — Supabase 설정 SQL
-- 사용법: 아래 'me@example.com'을 내 계정 이메일로 바꾼 뒤, SQL Editor에 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하다.

-- 0. 내 계정이 먼저 만들어져 있는지 확인 (없으면 여기서 멈춘다)
do $$
begin
  if not exists (select 1 from auth.users where email = 'me@example.com') then
    raise exception '계정을 찾을 수 없어요. 안내서 3단계에서 계정을 만들고, 이 파일의 이메일을 내 이메일로 바꿔주세요.';
  end if;
end $$;

-- 1. 일기 주인 (쓰기 권한을 가진 계정 1개)
create table if not exists public.diary_owner (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.diary_owner enable row level security; -- 정책 없음 = 앱에서 읽기·쓰기 불가

insert into public.diary_owner (user_id)
select id from auth.users where email = 'me@example.com'
on conflict do nothing;

create or replace function public.is_diary_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.diary_owner where user_id = auth.uid());
$$;

-- 2. 기록 테이블
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  title       text not null check (char_length(title) between 1 and 50),
  mood        smallint not null check (mood between 1 and 5),   -- 1 최고 · 2 좋음 · 3 보통 · 4 별로 · 5 최악
  memo        text not null default '' check (char_length(memo) <= 2000),
  photos      text[] not null check (cardinality(photos) between 1 and 5), -- 사진 파일 경로, 첫 장이 대표
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists entries_timeline_idx on public.entries (date desc, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- 3. 권한 규칙: 누구나 읽기, 일기 주인만 쓰기·수정·삭제
alter table public.entries enable row level security;

drop policy if exists "누구나 읽기" on public.entries;
create policy "누구나 읽기" on public.entries
  for select to anon, authenticated using (true);

drop policy if exists "주인만 작성" on public.entries;
create policy "주인만 작성" on public.entries
  for insert to authenticated with check (public.is_diary_owner());

drop policy if exists "주인만 수정" on public.entries;
create policy "주인만 수정" on public.entries
  for update to authenticated using (public.is_diary_owner()) with check (public.is_diary_owner());

drop policy if exists "주인만 삭제" on public.entries;
create policy "주인만 삭제" on public.entries
  for delete to authenticated using (public.is_diary_owner());

-- 4. 홈 요약 (총 기록 수, 기분별 개수)
create or replace function public.entry_summary()
returns json
language sql stable
set search_path = ''
as $$
  select json_build_object(
    'total', count(*),
    'byMood', json_build_object(
      '1', count(*) filter (where mood = 1),
      '2', count(*) filter (where mood = 2),
      '3', count(*) filter (where mood = 3),
      '4', count(*) filter (where mood = 4),
      '5', count(*) filter (where mood = 5)))
  from public.entries;
$$;

-- 5. 사진 저장소: 공개 읽기, JPEG만, 장당 5MB 이하
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "사진 주인만 조회" on storage.objects;
create policy "사진 주인만 조회" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and public.is_diary_owner());

drop policy if exists "사진 주인만 올리기" on storage.objects;
create policy "사진 주인만 올리기" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_diary_owner());

drop policy if exists "사진 주인만 삭제" on storage.objects;
create policy "사진 주인만 삭제" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_diary_owner());

-- 6. 확인: 아래 결과가 '설정 완료'와 내 이메일로 나오면 성공
select '설정 완료' as 결과, u.email as 일기_주인
from public.diary_owner o join auth.users u on u.id = o.user_id;
