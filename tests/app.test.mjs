import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8765/';
const SHOTS = process.argv[2];
const log = (...a) => console.log(...a);
let failures = 0;
const check = (cond, msg) => { log(cond ? 'PASS' : 'FAIL', msg); if (!cond) failures++; };

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
// 데모 모드로 시험: 저장소 설정을 비운다
await ctx.route('**/js/config.js', async (route) => {
  const res = await route.fetch();
  route.fulfill({ response: res, body: (await res.text()).replace(/GITHUB_REPO = '[^']*'/, "GITHUB_REPO = ''") });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 큰 테스트 사진 만들기 (3000x2000, 색 다르게)
async function makePhotos(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate((i) => {
      const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
      const g = c.getContext('2d');
      const hues = [20, 90, 200, 300, 45, 160, 260];
      const grad = g.createLinearGradient(0, 0, 3000, 2000);
      grad.addColorStop(0, `hsl(${hues[i % 7]},60%,70%)`); grad.addColorStop(1, `hsl(${hues[i % 7] + 40},50%,40%)`);
      g.fillStyle = grad; g.fillRect(0, 0, 3000, 2000);
      g.fillStyle = '#fff'; g.font = 'bold 400px sans-serif'; g.fillText(`#${i + 1}`, 1100, 1200);
      return c.toDataURL('image/jpeg', 0.95).split(',')[1];
    }, i);
    out.push({ name: `p${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  return out;
}

await page.goto(BASE);
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('photo-diary-demo'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.goto(BASE);
await page.waitForSelector('.summary');
check(await page.locator('.summary-total').textContent() === '0', '빈 홈: 총 0개');
check(await page.locator('.empty').isVisible(), '빈 상태 안내 표시');
check(await page.locator('.fab').count() === 0, '방문자: + 버튼 없음');
await page.screenshot({ path: `${SHOTS}/1-home-empty-visitor.png` });

// 방문자가 작성 화면 주소로 바로 가면 로그인으로
await page.goto(BASE + '#/new');
await page.waitForSelector('#login-form');
check(page.url().endsWith('#/login'), '방문자 #/new → 로그인 화면');

// 로그인
await page.fill('input[name=email]', 'me@example.com');
await page.fill('input[name=password]', 'pw');
await page.click('button[type=submit]');
await page.waitForSelector('.fab');
check(true, '로그인 후 + 버튼 표시');

// 기록 1: 사진 7장 선택 → 5장만
const photos = await makePhotos(7);
await page.click('.fab');
await page.waitForSelector('#photo-strip');
check(await page.locator('[data-action=save]').isDisabled(), '처음엔 저장 버튼 비활성');
await page.setInputFiles('#file', photos);
await page.waitForFunction(() => document.querySelectorAll('.thumb-img').length === 5 && !document.querySelector('.thumb-loading'));
check(await page.locator('.thumb-img').count() === 5, '7장 선택 → 5장만 들어감');
check(await page.locator('.thumb-add').count() === 0, '5장이면 추가 버튼 숨김');
check(await page.locator('[data-action=save]').isDisabled(), '기분 없으면 저장 비활성');
// 줄인 크기 확인
const dims = await page.evaluate(() => { const i = document.querySelector('.thumb-img img'); return [i.naturalWidth, i.naturalHeight]; });
check(dims[0] === 1600 && dims[1] === 1067, `사진 줄이기 3000x2000 → ${dims.join('x')}`);
await page.click('.mood-option[data-mood="1"]');
await page.fill('#memo', '오늘은 공원에 다녀왔다.\n날씨가 정말 좋았다.');
await page.screenshot({ path: `${SHOTS}/2-editor.png`, fullPage: true });
check(!(await page.locator('[data-action=save]').isDisabled()), '사진+기분 → 저장 활성');
await page.click('[data-action=save]');
await page.waitForSelector('.detail');
const title1 = await page.locator('.detail-title').textContent();
check(/^\d+월 \d+일의 기록$/.test(title1), `제목 비우면 자동 제목: ${title1}`);
check(await page.locator('#dots span').count() === 5, '상세: 점 5개');
await page.screenshot({ path: `${SHOTS}/3-detail.png`, fullPage: true });
// 뒤로 가면 홈 (작성 화면 아님)
await page.goBack();
await page.waitForSelector('.summary');
check(page.url().endsWith('#/') , '상세에서 뒤로 → 홈');

// 기록 2: 이전 날짜, 제목, 기분 4
await page.click('.fab');
await page.setInputFiles('#file', photos.slice(5, 6));
await page.waitForFunction(() => document.querySelectorAll('.thumb-img').length === 1);
await page.fill('#title', '비 오는 날의 카페');
await page.fill('#date', '2026-10-01');
await page.click('.mood-option[data-mood="4"]');
await page.click('[data-action=save]');
await page.waitForSelector('.detail');
await page.click('a[aria-label=뒤로]');
await page.waitForSelector('.card');
const titles = await page.locator('.card-title').allTextContents();
check(titles.length === 2 && titles[1] === '비 오는 날의 카페', `최신순 정렬: ${titles.join(' / ')}`);
check(await page.locator('.summary-total').textContent() === '2', '요약: 총 2개');
const moodCounts = await page.locator('.mood-stat strong').allTextContents();
check(moodCounts.join(',') === '1,0,0,1,0', `기분별 개수: ${moodCounts.join(',')}`);
await page.screenshot({ path: `${SHOTS}/4-home.png`, fullPage: true });

// 작성 중 닫기 확인 창
await page.click('.fab');
await page.click('.mood-option[data-mood="2"]');
await page.click('[data-action=close]');
await page.waitForSelector('dialog[open]');
check(true, '입력 후 닫기 → 확인 창');
await page.screenshot({ path: `${SHOTS}/5-close-confirm.png` });
await page.click('dialog button[value=cancel]');
check(await page.locator('.editor').isVisible() && page.url().endsWith('#/new'), '취소 → 작성 화면 유지');
await page.click('[data-action=close]');
await page.click('dialog button[value=ok]');
await page.waitForSelector('.summary');
check(true, '닫기 확인 → 홈');
// 아무것도 안 쓰고 닫으면 확인 창 없음
await page.click('.fab');
await page.waitForSelector('.editor');
await page.click('[data-action=close]');
await page.waitForSelector('.summary');
check(await page.locator('dialog[open]').count() === 0, '빈 작성 화면 닫기 → 확인 창 없음');

// 수정: 기록1에서 사진 하나 빼고 3번째를 대표로
await page.locator('.card').first().click();
await page.waitForSelector('.detail');
const entryUrl = page.url();
await page.click('a[aria-label=수정]');
await page.waitForSelector('.thumb-img');
check(await page.locator('#title').inputValue() === '', '수정: 자동 제목은 빈칸으로 표시');
await page.click('[data-remove="1"]');
await page.click('[data-front="2"]');
await page.fill('#title', '공원 산책');
await page.click('[data-action=save]');
await page.waitForSelector('.detail');
check(page.url() === entryUrl, '수정 후 같은 상세로');
check(await page.locator('#dots span').count() === 4, '수정: 사진 4장');
check(await page.locator('.detail-title').textContent() === '공원 산책', '수정: 제목 반영');
const photoCount = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('photo-diary-demo'); q.onsuccess = () => { const c = q.result.transaction('photos').objectStore('photos').count(); c.onsuccess = () => r(c.result); }; }));
check(photoCount === 5, `뺀 사진 파일 삭제됨 (저장된 사진 ${photoCount}개 = 4+1)`);

// 로그아웃 상태에서 상세: 수정·삭제 없음
await page.goto(BASE + '#/');
await page.click('[data-action=logout]');
await page.waitForSelector('a[aria-label=로그인]');
await page.goto(entryUrl);
await page.waitForSelector('.detail');
check(await page.locator('[data-action=delete]').count() === 0, '방문자: 삭제 버튼 없음');
await page.screenshot({ path: `${SHOTS}/6-detail-visitor.png` });

// 다시 로그인 후 삭제
await page.goto(BASE + '#/login');
await page.fill('input[name=email]', 'me@example.com');
await page.fill('input[name=password]', 'pw');
await page.click('button[type=submit]');
await page.waitForSelector('.fab');
await page.goto(entryUrl);
await page.waitForSelector('[data-action=delete]');
await page.click('[data-action=delete]');
await page.click('dialog button[value=ok]');
await page.waitForSelector('.summary');
check(await page.locator('.summary-total').textContent() === '1', '삭제 후 총 1개');
const photoCount2 = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('photo-diary-demo'); q.onsuccess = () => { const c = q.result.transaction('photos').objectStore('photos').count(); c.onsuccess = () => r(c.result); }; }));
check(photoCount2 === 1, `삭제 시 사진도 삭제 (남은 사진 ${photoCount2}개)`);

// 페이지 넘기기: 기록 23개 → 처음 20개, 스크롤하면 23개
await page.evaluate(async () => {
  const s = await import('./js/store.js');
  const blob = await (await fetch(document.querySelector('.card img').src)).blob();
  for (let i = 0; i < 22; i++) await s.createEntry({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, title: `테스트 ${i + 1}`, mood: (i % 5) + 1, memo: '', photos: [{ blob }] });
});
await page.reload();
await page.waitForSelector('.card');
check(await page.locator('.card').count() === 20, '첫 화면 20개');
await page.locator('#more').scrollIntoViewIfNeeded();
await page.waitForFunction(() => document.querySelectorAll('.card').length === 23);
check(true, '스크롤 → 23개 모두');

// PC 폭
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(BASE + '#/');
await page.waitForSelector('.card');
await page.screenshot({ path: `${SHOTS}/7-desktop.png` });

check(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
await browser.close();
log(failures ? `\n${failures}개 실패` : '\n모두 통과');
process.exit(failures ? 1 : 0);
