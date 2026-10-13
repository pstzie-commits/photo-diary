// GitHub 저장 방식 시험: api.github.com / raw.githubusercontent.com 을 가짜 Git 저장소로 대신한다.
// 사용법: (앱 폴더에서 python -m http.server 8765 실행 후) node github.test.mjs ./shots
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';

const BASE = 'http://127.0.0.1:8765/';
const SHOTS = process.argv[2] || '.';
const GOOD = 'github_pat_GOOD';
const READONLY = 'github_pat_READONLY';
let failures = 0;
const check = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failures++; };

// ---------- 가짜 Git 저장소 ----------
const objects = new Map(); // sha → Buffer(blob) | Map(tree) | {tree,parents}(commit)
const sha = (x) => createHash('sha1').update(x).digest('hex');
function putBlob(buf) { const s = sha(Buffer.concat([Buffer.from('blob'), buf])); objects.set(s, buf); return s; }
function putTree(map) { const s = sha('tree' + JSON.stringify([...map].sort())); objects.set(s, map); return s; }
function putCommit(tree, parents) { const s = sha('commit' + tree + parents.join() + Math.random()); objects.set(s, { tree, parents }); return s; }
let head = putCommit(putTree(new Map([['index.html', putBlob(Buffer.from('app'))]])), []);
const stats = { commits: 0, writesRejected: 0, conflictsInjected: 0 };
let injectConflict = false;

function fileAt(ref, path) {
  const c = objects.get(ref === 'main' ? head : ref);
  const blobSha = c && objects.get(c.tree).get(path);
  return blobSha ? objects.get(blobSha) : null;
}
const entriesAtHead = () => { const b = fileAt('main', 'data/entries.json'); return b ? JSON.parse(b).entries : []; };
const photosAtHead = () => [...objects.get(objects.get(head).tree).keys()].filter((p) => p.startsWith('data/photos/'));

async function handleApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const auth = req.headers().authorization || '';
  const tok = auth.replace('Bearer ', '');
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
    headers: { 'access-control-allow-origin': '*' } });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (tok && tok !== GOOD && tok !== READONLY) return json(401, { message: 'Bad credentials' });

  const p = url.pathname.replace('/repos/me/diary', '');
  const write = req.method() !== 'GET';
  if (write && tok !== GOOD) { stats.writesRejected++; return json(tok ? 403 : 401, { message: 'denied' }); }

  if (p === '' && req.method() === 'GET') return json(200, { permissions: { push: tok === GOOD || tok === READONLY } });
  if (p.startsWith('/contents/')) {
    const buf = fileAt(url.searchParams.get('ref') || 'main', decodeURIComponent(p.slice(10)));
    return buf ? route.fulfill({ status: 200, body: buf, headers: { 'access-control-allow-origin': '*' } }) : json(404, {});
  }
  if (p === '/git/ref/heads/main') return json(200, { object: { sha: head } });
  if (p.startsWith('/git/commits/')) return json(200, { tree: { sha: objects.get(p.slice(13)).tree } });
  const body = req.postDataJSON();
  if (p === '/git/blobs') return json(201, { sha: putBlob(Buffer.from(body.content, 'base64')) });
  if (p === '/git/trees') {
    const map = new Map(objects.get(body.base_tree));
    for (const t of body.tree) {
      if (t.sha === null) { if (!map.has(t.path)) return json(422, { message: 'no such path' }); map.delete(t.path); }
      else map.set(t.path, t.sha ?? putBlob(Buffer.from(t.content)));
    }
    return json(201, { sha: putTree(map) });
  }
  if (p === '/git/commits') return json(201, { sha: putCommit(body.tree, body.parents) });
  if (p === '/git/refs/heads/main') {
    if (injectConflict) { // 다른 기기가 먼저 저장한 상황 흉내
      injectConflict = false; stats.conflictsInjected++;
      const other = entriesAtHead().concat([{ id: 'other-device', date: '2026-01-01', title: '다른 기기', mood: 3, memo: '', photos: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]);
      const map = new Map(objects.get(objects.get(head).tree));
      map.set('data/entries.json', putBlob(Buffer.from(JSON.stringify({ version: 1, entries: other }))));
      head = putCommit(putTree(map), [head]);
    }
    if (objects.get(body.sha).parents[0] !== head) return json(422, { message: 'not a fast forward' });
    head = body.sha; stats.commits++;
    return json(200, {});
  }
  return json(404, { message: `mock: ${req.method()} ${p}` });
}

async function handleRaw(route) {
  const path = new URL(route.request().url()).pathname.replace('/me/diary/main/', '');
  const buf = fileAt('main', path);
  return buf
    ? route.fulfill({ status: 200, body: buf, headers: { 'access-control-allow-origin': '*', 'content-type': path.endsWith('.jpg') ? 'image/jpeg' : 'text/plain' } })
    : route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
}

// ---------- 브라우저 ----------
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('https://api.github.com/**', handleApi);
  await ctx.route('https://raw.githubusercontent.com/**', handleRaw);
  await ctx.route('**/js/config.js', async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/GITHUB_OWNER = '[^']*'/, "GITHUB_OWNER = 'me'").replace(/GITHUB_REPO = '[^']*'/, "GITHUB_REPO = 'diary'");
    route.fulfill({ response: res, body });
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return page;
}
async function makePhotos(page, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate((i) => {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 3200;
      const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 70},55%,60%)`; g.fillRect(0, 0, 2400, 3200);
      g.fillStyle = '#fff'; g.font = 'bold 500px sans-serif'; g.fillText(`#${i + 1}`, 800, 1800);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, i);
    out.push({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  return out;
}

const me = await newPage();
const visitor = await newPage();

// 빈 저장소
await visitor.goto(BASE);
await visitor.waitForSelector('.summary');
check(await visitor.locator('.summary-total').textContent() === '0', '방문자: 빈 저장소 → 0개');
check(await visitor.locator('.badge').count() === 0, '데모 표시 없음');

// 로그인: 틀린 열쇠 / 읽기 전용 열쇠 / 맞는 열쇠
await me.goto(BASE + '#/login');
await me.fill('input[name=token]', 'github_pat_WRONG');
await me.click('button[type=submit]');
await me.waitForSelector('#login-error:not([hidden])');
check(true, '틀린 열쇠 → 안내 문구');
await me.screenshot({ path: `${SHOTS}/g1-login.png` });
await me.fill('input[name=token]', GOOD);
await me.click('button[type=submit]');
await me.waitForSelector('.fab');
check(true, '맞는 열쇠 → 로그인');

// 작성: 사진 3장
const photos = await makePhotos(me, 3);
await me.click('.fab');
await me.setInputFiles('#file', photos);
await me.waitForFunction(() => document.querySelectorAll('.thumb-img').length === 3);
await me.click('.mood-option[data-mood="2"]');
await me.fill('#title', '첫 GitHub 기록');
await me.fill('#memo', '<script>alert(1)</script> 안전하게 보여야 함');
await me.click('[data-action=save]');
await me.waitForSelector('.detail');
check(stats.commits === 1, `저장 1번 = 커밋 1개 (커밋 ${stats.commits})`);
check(photosAtHead().length === 3, `사진 3장 저장소에 올라감 (${photosAtHead().length})`);
const e1 = entriesAtHead()[0];
check(e1?.title === '첫 GitHub 기록' && e1.mood === 2 && e1.photos.length === 3, 'entries.json 내용 정확');
const loaded = await me.evaluate(() => [...document.querySelectorAll('.carousel img')].every((i) => i.complete && i.naturalWidth === 1200));
check(loaded, '상세: 사진 3장 표시 (2400x3200 → 1200x1600)');
check((await me.locator('.memo').textContent()).includes('<script>'), '메모의 코드가 실행되지 않고 글자로 보임');

// 방문자: 열쇠 없이 보기
await visitor.reload();
await visitor.waitForSelector('.card');
check(await visitor.locator('.card').count() === 1, '방문자: 기록 보임');
check(await visitor.locator('.fab').count() === 0, '방문자: + 버튼 없음');
await visitor.locator('.card').click();
await visitor.waitForSelector('.detail');
check(await visitor.locator('[data-action=delete]').count() === 0, '방문자: 삭제 버튼 없음');
await visitor.screenshot({ path: `${SHOTS}/g2-visitor-detail.png` });

// 방문자가 직접 쓰기 요청 → 거부
const before = stats.writesRejected;
const status = await visitor.evaluate(async () => (await fetch('https://api.github.com/repos/me/diary/git/blobs', { method: 'POST', body: '{"content":"x"}' })).status);
check(status === 401 && stats.writesRejected === before + 1, '방문자 직접 쓰기 요청 → 거부');

// 수정: 사진 1장 빼기 + 동시에 다른 기기 저장(충돌) → 다시 시도해 둘 다 남아야 함
await me.click('a[aria-label=수정]');
await me.waitForSelector('.thumb-img');
await me.click('[data-remove="0"]');
await me.fill('#title', '수정한 기록');
injectConflict = true;
await me.click('[data-action=save]');
await me.waitForSelector('.detail');
const titles = entriesAtHead().map((e) => e.title).sort();
check(stats.conflictsInjected === 1 && titles.join() === '다른 기기,수정한 기록', `충돌 후 다시 시도: 두 기록 모두 보존 (${titles.join(', ')})`);
check(photosAtHead().length === 2, `뺀 사진 파일 삭제 (남은 사진 ${photosAtHead().length})`);

// 삭제
await me.click('[data-action=delete]');
await me.click('dialog button[value=ok]');
await me.waitForSelector('.summary');
check(entriesAtHead().length === 1 && photosAtHead().length === 0, '삭제: 기록과 사진 파일 함께 삭제');
check(await me.locator('.summary-total').textContent() === '1', '삭제 후 요약 1개');

// 읽기 전용 열쇠 → 저장 시 안내
await me.click('[data-action=logout]');
await me.goto(BASE + '#/login');
await me.fill('input[name=token]', READONLY);
await me.click('button[type=submit]');
await me.waitForSelector('.fab');
await me.click('.fab');
await me.setInputFiles('#file', photos.slice(0, 1));
await me.waitForFunction(() => document.querySelectorAll('.thumb-img').length === 1);
await me.click('.mood-option[data-mood="1"]');
await me.click('[data-action=save]');
await me.waitForFunction(() => document.getElementById('toast').textContent.includes('쓰기 권한'));
check(await me.locator('.editor').isVisible(), '쓰기 권한 없는 열쇠 → 안내 후 작성 내용 유지');

// 인터넷 끊김 → 불러오기 실패 화면
const offline = await newPage();
await offline.context().route('https://raw.githubusercontent.com/**', (r) => r.abort());
await offline.goto(BASE);
await offline.waitForSelector('[data-action=retry]');
check(true, '불러오기 실패 → 다시 시도 화면');
await offline.screenshot({ path: `${SHOTS}/g3-load-error.png` });

check(me.errors.length + visitor.errors.length === 0, `페이지 오류 없음 ${[...me.errors, ...visitor.errors].join(' | ')}`);
await browser.close();
console.log(failures ? `\n${failures}개 실패` : '\n모두 통과');
process.exit(failures ? 1 : 0);
