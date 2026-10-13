// 실제 GitHub Pages + 저장소 시험: 시험 기록 1개를 저장 → 방문자 화면에 보이는지 확인 → 삭제.
// 사용법: GH_TOKEN=$(gh auth token) node live.test.mjs
import { chromium } from 'playwright-core';

const SITE = 'https://pstzie-commits.github.io/photo-diary/';
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('GH_TOKEN 필요'); process.exit(2); }
let failures = 0;
const check = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failures++; };
const TITLE = `자동 시험 ${new Date().toISOString().slice(11, 19)}`;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const me = await ctx.newPage();
const errors = [];
me.on('pageerror', (e) => errors.push(e.message));

await me.goto(SITE + '#/login');
await me.fill('input[name=token]', TOKEN);
await me.click('button[type=submit]');
await me.waitForSelector('.fab', { timeout: 15000 });
check(true, '실제 GitHub 열쇠로 로그인');
const before = Number(await me.locator('.summary-total').textContent());

const b64 = await me.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
  const g = c.getContext('2d'); g.fillStyle = '#C9A27E'; g.fillRect(0, 0, 1200, 900);
  g.fillStyle = '#fff'; g.font = 'bold 200px sans-serif'; g.fillText('TEST', 360, 520);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
});
await me.click('.fab');
await me.setInputFiles('#file', [{ name: 't.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }]);
await me.waitForFunction(() => document.querySelectorAll('.thumb-img').length === 1);
await me.click('.mood-option[data-mood="3"]');
await me.fill('#title', TITLE);
const t0 = Date.now();
await me.click('[data-action=save]');
await me.waitForSelector('.detail', { timeout: 30000 });
check(true, `저장 성공 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
await me.waitForFunction(() => { const i = document.querySelector('.carousel img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
check(true, '내 화면: 방금 올린 사진 바로 보임');
const entryUrl = me.url();

// 방문자: 열쇠 없는 새 창에서 1~2분 안에 보이는지
const visitorCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const visitor = await visitorCtx.newPage();
let seenAfter = null;
for (let i = 0; i < 24 && seenAfter === null; i++) {
  await visitor.goto(`${SITE}?v=${Date.now()}#/`); // 매번 새로 불러오기
  await visitor.waitForSelector('.summary');
  const titles = await visitor.locator('.card-title').allTextContents();
  if (titles.includes(TITLE)) seenAfter = (Date.now() - t0) / 1000;
  else await new Promise((r) => setTimeout(r, 10000));
}
check(seenAfter !== null, `방문자 화면에 보임 (${seenAfter?.toFixed(0)}초 뒤)`);
if (seenAfter !== null) {
  await visitor.goto(entryUrl.replace(/^.*#/, SITE + '#'));
  await visitor.waitForFunction(() => { const i = document.querySelector('.carousel img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
  check(await visitor.locator('[data-action=delete]').count() === 0, '방문자: 사진 보이고 삭제 버튼 없음');
}
const status = await visitor.evaluate(async () => (await fetch('https://api.github.com/repos/pstzie-commits/photo-diary/git/blobs',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"content":"x"}' })).status);
check(status === 401 || status === 403 || status === 404, `방문자 직접 쓰기 요청 → GitHub가 거부 (${status})`);

// 정리: 시험 기록 삭제
await me.goto(entryUrl);
await me.waitForSelector('[data-action=delete]');
await me.click('[data-action=delete]');
await me.click('dialog button[value=ok]');
await me.waitForSelector('.summary');
check(Number(await me.locator('.summary-total').textContent()) === before, '시험 기록 삭제 → 원래 개수');
check(errors.length === 0, `페이지 오류 없음 ${errors.join(' | ')}`);

await browser.close();
console.log(failures ? `\n${failures}개 실패` : '\n모두 통과');
process.exit(failures ? 1 : 0);
