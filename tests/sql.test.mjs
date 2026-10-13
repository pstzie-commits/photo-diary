import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const sql = readFileSync(process.argv[2], 'utf8').replaceAll('me@example.com', 'owner@test.com');
const db = new PGlite();
let fails = 0;
const check = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };

// Supabase 환경 흉내: auth/storage 스키마, anon/authenticated 역할, auth.uid()
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, storage, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);

// 계정 없이 실행하면 멈춰야 함
try { await db.exec(sql); check(false, '계정 없을 때 멈춤'); }
catch (e) { check(/계정을 찾을 수 없어요/.test(e.message), '계정 없을 때 안내 메시지로 멈춤'); }

const owner = (await db.query(`insert into auth.users (email) values ('owner@test.com') returning id`)).rows[0].id;
const other = (await db.query(`insert into auth.users (email) values ('other@test.com') returning id`)).rows[0].id;

const res = await db.exec(sql);
const last = res.at(-1).rows[0];
check(last && last['일기_주인'] === 'owner@test.com', `설정 완료 메시지: ${JSON.stringify(last)}`);
await db.exec(sql); // 다시 실행해도 안전한지
check(true, '두 번 실행해도 오류 없음');

await db.exec(`
  grant select, insert, update, delete on public.entries to anon, authenticated;
  grant select, insert, delete on storage.objects to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
`);

async function as(role, uid, q) {
  await db.exec(`reset role; select set_config('request.jwt.sub', '${uid ?? ''}', false); set role ${role};`);
  try { return await db.query(q); } finally { await db.exec('reset role'); }
}
async function rejected(role, uid, q) {
  try { const r = await as(role, uid, q); return r.affectedRows === 0; } catch { return true; }
}

const ins = `insert into public.entries (date, title, mood, photos) values ('2026-10-13', '테스트', 1, array['a.jpg']) returning id`;
check(await rejected('anon', null, ins), '방문자: 기록 작성 거부');
check(await rejected('authenticated', other, ins), '다른 계정: 기록 작성 거부');
const id = (await as('authenticated', owner, ins)).rows[0].id;
check(!!id, '주인: 기록 작성 성공');

const readAnon = await as('anon', null, 'select * from public.entries');
check(readAnon.rows.length === 1, '방문자: 기록 읽기 가능');
check(await rejected('anon', null, `update public.entries set title='해킹' where id='${id}'`), '방문자: 수정 거부');
check(await rejected('authenticated', other, `delete from public.entries where id='${id}'`), '다른 계정: 삭제 거부');

const before = (await db.query(`select updated_at from public.entries`)).rows[0].updated_at;
await new Promise((r) => setTimeout(r, 20));
const upd = await as('authenticated', owner, `update public.entries set title='수정됨' where id='${id}'`);
check(upd.affectedRows === 1, '주인: 수정 성공');
const after = (await db.query(`select updated_at from public.entries`)).rows[0].updated_at;
check(after > before, '수정 시각 자동 갱신');

check(await rejected('authenticated', owner, `insert into public.entries (date, title, mood, photos) values ('2026-10-13','x',6,array['a'])`), '기분 6 거부');
check(await rejected('authenticated', owner, `insert into public.entries (date, title, mood, photos) values ('2026-10-13','x',1,array['1','2','3','4','5','6'])`), '사진 6장 거부');
check(await rejected('authenticated', owner, `insert into public.entries (date, title, mood, photos) values ('2026-10-13','x',1,array[]::text[])`), '사진 0장 거부');
check(await rejected('authenticated', owner, `insert into public.entries (date, title, mood, photos) values ('2026-10-13',repeat('가',51),1,array['a'])`), '제목 51자 거부');

const sum = (await as('anon', null, 'select public.entry_summary() as s')).rows[0].s;
check(sum.total === 1 && sum.byMood['1'] === 1, `방문자: 요약 읽기 ${JSON.stringify(sum)}`);

const objIns = `insert into storage.objects (bucket_id, name) values ('photos', 'a.jpg') returning id`;
check(await rejected('anon', null, objIns), '방문자: 사진 올리기 거부');
check(await rejected('authenticated', other, objIns), '다른 계정: 사진 올리기 거부');
check((await as('authenticated', owner, objIns)).rows.length === 1, '주인: 사진 올리기 성공');
check(await rejected('anon', null, `delete from storage.objects`), '방문자: 사진 삭제 거부');
check((await as('authenticated', owner, `delete from storage.objects where bucket_id='photos'`)).affectedRows === 1, '주인: 사진 삭제 성공');

const bucket = (await db.query(`select * from storage.buckets`)).rows[0];
check(bucket.public === true && bucket.allowed_mime_types[0] === 'image/jpeg', '사진 저장소: 공개 읽기, JPEG만');
check(await rejected('anon', null, 'select * from public.diary_owner') || (await as('anon', null, 'select * from public.diary_owner')).rows.length === 0, '방문자: 주인 목록 볼 수 없음');

const ok = await as('authenticated', owner, `delete from public.entries where id='${id}'`);
check(ok.affectedRows === 1, '주인: 삭제 성공');

console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
