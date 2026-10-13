import * as store from './store.js';
import { MAX_PHOTOS, PAGE_SIZE, TITLE_MAX, MEMO_MAX } from './config.js';
import { resizeImage } from './image.js';
import {
  MOODS, moodOf, moodFace, icon, esc, todayStr, formatDate, defaultTitle, toast, confirmDialog,
} from './ui.js';

const app = document.getElementById('app');
let user = null;
let renderId = 0;          // 화면이 바뀌면 이전 화면의 늦은 비동기 작업을 무시한다
let leaveGuard = null;     // 작성 중일 때 다른 화면으로 가기 전에 확인한다
let cleanup = null;        // 화면을 떠날 때 정리할 작업
let currentHash = location.hash;
let movedInApp = false;    // 앱 안에서 이동한 적이 있으면 '닫기'를 뒤로 가기로 처리한다

// ---------- 화면 이동 ----------

function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  let m;
  if (path === '/') return renderHome();
  if ((m = path.match(/^\/entry\/([\w-]+)$/))) return renderDetail(m[1]);
  if (path === '/new') return renderEditor(null);
  if ((m = path.match(/^\/edit\/([\w-]+)$/))) return renderEditor(m[1]);
  if (path === '/login') return renderLogin();
  location.replace('#/');
}

async function onHashChange() {
  movedInApp = true;
  if (leaveGuard && leaveGuard()) {
    const ok = await confirmDialog({ message: '작성 중인 내용이 사라져요. 닫을까요?', ok: '닫기', danger: true });
    if (!ok) {
      history.pushState(null, '', currentHash); // 뒤로 가기를 되돌려 작성 화면에 그대로 머문다
      return;
    }
  }
  show();
}

function show() {
  currentHash = location.hash;
  leaveGuard = null;
  if (cleanup) { cleanup(); cleanup = null; }
  renderId += 1;
  window.scrollTo(0, 0);
  route();
}

function go(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    show();
  } else {
    location.hash = hash;
  }
}

window.addEventListener('hashchange', onHashChange);
window.addEventListener('beforeunload', (e) => {
  if (leaveGuard && leaveGuard()) e.preventDefault();
});

// ---------- 오류 안내 ----------

function errorMessage(e, action) {
  if (e?.code === 'unauthorized') return '열쇠가 만료됐거나 맞지 않아요. 로그아웃 후 다시 로그인해주세요.';
  if (e?.code === 'forbidden') return '열쇠에 쓰기 권한이 없어요. 열쇠 설정을 확인해주세요.';
  return `${action}하지 못했어요. 다시 시도해주세요.`;
}

function showLoadError(id) {
  if (id !== renderId) return;
  app.innerHTML = `
    <header class="topbar">
      <span class="topbar-side"></span><h1 class="topbar-title">사진 일기</h1><span class="topbar-side right"></span>
    </header>
    <div class="empty">${icon('book', 36)}<p>기록을 불러오지 못했어요.<br>인터넷 연결을 확인해주세요.</p>
      <button class="btn btn-primary" data-action="retry">다시 시도</button></div>`;
  app.querySelector('[data-action="retry"]').addEventListener('click', show);
}

// ---------- 1. 홈 ----------

async function renderHome() {
  const id = renderId;
  let summary;
  let page;
  try {
    [summary, page] = await Promise.all([store.getSummary(), store.listEntries(0, PAGE_SIZE)]);
  } catch {
    showLoadError(id);
    return;
  }
  if (id !== renderId) return;

  const moodRow = MOODS.map((m) => `
    <li class="mood-stat" style="--mood: var(--mood-${m.value})">
      ${moodFace(m.value, 28)}
      <strong>${summary.byMood[m.value]}</strong>
      <span>${m.name}</span>
    </li>`).join('');

  const empty = user
    ? `<div class="empty">${icon('camera', 36)}<p>첫 기록을 남겨보세요</p>
         <a class="btn btn-primary" href="#/new">기록하기</a></div>`
    : `<div class="empty">${icon('camera', 36)}<p>아직 기록이 없어요</p></div>`;

  app.innerHTML = `
    <header class="topbar">
      <span class="topbar-side">${store.isDemo ? '<span class="badge">데모</span>' : ''}</span>
      <h1 class="topbar-title">사진 일기</h1>
      <span class="topbar-side right">
        ${user
          ? `<button class="icon-btn" data-action="logout" aria-label="로그아웃">${icon('logout')}</button>`
          : `<a class="icon-btn" href="#/login" aria-label="로그인">${icon('user')}</a>`}
      </span>
    </header>
    <main class="home">
      <section class="summary">
        <span class="summary-icon">${icon('book', 26)}</span>
        <p class="summary-total">${summary.total}</p>
        <p class="summary-label">전체 기록</p>
        <ul class="mood-stats">${moodRow}</ul>
      </section>
      ${summary.total === 0 ? empty : '<ul class="timeline" id="timeline"></ul><div id="more" class="more"></div>'}
    </main>
    ${user ? `<a class="fab" href="#/new" aria-label="새 기록">${icon('plus', 28)}</a>` : ''}`;

  app.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
    await store.signOut();
    user = null;
    toast('로그아웃했어요');
    show();
  });

  if (summary.total === 0) return;

  const list = app.querySelector('#timeline');
  const more = app.querySelector('#more');
  list.insertAdjacentHTML('beforeend', page.items.map(cardHtml).join(''));
  let offset = page.items.length;
  let hasMore = page.hasMore;
  let loading = false;

  if (!hasMore) return;
  more.textContent = '불러오는 중…';
  const observer = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || loading || !hasMore) return;
    loading = true;
    let next;
    try {
      next = await store.listEntries(offset, PAGE_SIZE);
    } catch {
      loading = false;
      return; // 다음 스크롤 때 다시 시도
    }
    if (id !== renderId) return;
    list.insertAdjacentHTML('beforeend', next.items.map(cardHtml).join(''));
    offset += next.items.length;
    hasMore = next.hasMore;
    loading = false;
    if (!hasMore) { observer.disconnect(); more.remove(); }
  }, { rootMargin: '400px' });
  observer.observe(more);
  cleanup = () => observer.disconnect();
}

function cardHtml(e) {
  const m = moodOf(e.mood);
  return `
    <li>
      <a class="card" href="#/entry/${e.id}">
        <div class="card-photo">
          <img src="${e.photoUrls[0]}" alt="" loading="lazy">
          ${e.photos.length > 1 ? `<span class="photo-count">${icon('photos', 14)} ${e.photos.length}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="card-text">
            <h2 class="card-title">${esc(e.title)}</h2>
            <p class="card-date">${formatDate(e.date)}</p>
          </div>
          <span class="mood-chip" style="--mood: var(--mood-${m.value})" title="${m.name}">${moodFace(m.value, 26)}</span>
        </div>
      </a>
    </li>`;
}

// ---------- 2. 기록 상세 ----------

async function renderDetail(entryId) {
  const id = renderId;
  let e;
  try {
    e = await store.getEntry(entryId);
  } catch {
    showLoadError(id);
    return;
  }
  if (id !== renderId) return;
  if (!e) {
    toast('기록을 찾을 수 없어요');
    go('#/', { replace: true });
    return;
  }
  const m = moodOf(e.mood);
  const many = e.photos.length > 1;

  app.innerHTML = `
    <header class="topbar">
      <span class="topbar-side"><a class="icon-btn" href="#/" aria-label="뒤로">${icon('back')}</a></span>
      <h1 class="topbar-title">기록</h1>
      <span class="topbar-side right">
        ${user ? `
          <a class="icon-btn" href="#/edit/${e.id}" aria-label="수정">${icon('edit')}</a>
          <button class="icon-btn" data-action="delete" aria-label="삭제">${icon('trash')}</button>` : ''}
      </span>
    </header>
    <main class="detail">
      <div class="carousel" id="carousel">
        ${e.photoUrls.map((url, i) => `<img src="${url}" alt="사진 ${i + 1}">`).join('')}
      </div>
      ${many ? `<div class="dots" id="dots">${e.photos.map((_, i) => `<span class="${i === 0 ? 'on' : ''}"></span>`).join('')}</div>` : ''}
      <article class="detail-body">
        <p class="detail-date">${formatDate(e.date, true)}</p>
        <h2 class="detail-title">${esc(e.title)}</h2>
        <p class="mood-pill" style="--mood: var(--mood-${m.value})">${moodFace(m.value, 20)} ${m.name}</p>
        ${e.memo ? `<p class="memo">${esc(e.memo)}</p>` : ''}
      </article>
    </main>`;

  if (many) {
    const carousel = app.querySelector('#carousel');
    const dots = [...app.querySelectorAll('#dots span')];
    carousel.addEventListener('scroll', () => {
      const i = Math.round(carousel.scrollLeft / carousel.clientWidth);
      dots.forEach((d, j) => d.classList.toggle('on', i === j));
    }, { passive: true });
  }

  app.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ message: '이 기록을 삭제할까요? 되돌릴 수 없어요.', ok: '삭제', danger: true });
    if (!ok) return;
    try {
      await store.deleteEntry(e.id);
      toast('삭제했어요');
      go('#/', { replace: true });
    } catch (err) {
      toast(errorMessage(err, '삭제'));
    }
  });
}

// ---------- 3. 기록 작성 / 수정 ----------

async function renderEditor(entryId) {
  if (!user) {
    toast('로그인이 필요해요');
    go('#/login', { replace: true });
    return;
  }
  const id = renderId;
  let entry = null;
  if (entryId) {
    try {
      entry = await store.getEntry(entryId);
    } catch {
      showLoadError(id);
      return;
    }
    if (id !== renderId) return;
    if (!entry) {
      toast('기록을 찾을 수 없어요');
      go('#/', { replace: true });
      return;
    }
  }

  // photos: [{ path, url }] 기존 사진 / [{ blob, url }] 새로 추가한 사진
  const state = {
    date: entry?.date ?? todayStr(),
    title: entry?.title ?? '',
    mood: entry?.mood ?? null,
    memo: entry?.memo ?? '',
    photos: entry ? entry.photos.map((path, i) => ({ path, url: entry.photoUrls[i] })) : [],
  };
  // 수정 화면에서 제목이 자동 제목과 같으면 빈칸으로 보여준다(날짜를 바꾸면 따라 바뀌도록)
  if (entry && state.title === defaultTitle(state.date)) state.title = '';

  let preparing = 0;
  let saving = false;
  const snapshot = () => JSON.stringify([state.date, state.title.trim(), state.mood, state.memo, state.photos.map((p) => p.url)]);
  const initial = snapshot();
  leaveGuard = () => !saving && snapshot() !== initial;

  const newUrls = new Set();
  cleanup = () => newUrls.forEach((u) => URL.revokeObjectURL(u));

  app.innerHTML = `
    <header class="topbar">
      <span class="topbar-side"><button class="icon-btn" data-action="close" aria-label="닫기">${icon('close')}</button></span>
      <h1 class="topbar-title">${entry ? '기록 수정' : '새 기록'}</h1>
      <span class="topbar-side right"><button class="btn btn-primary btn-sm" data-action="save" disabled>저장</button></span>
    </header>
    <main class="editor">
      <section class="field">
        <div class="field-head"><span class="label">사진 <em>*</em></span><span class="hint" id="photo-count"></span></div>
        <div class="photo-strip" id="photo-strip"></div>
        <p class="hint">첫 번째 사진이 대표 사진이에요. 다른 사진을 누르면 대표로 바뀌어요.</p>
      </section>

      <section class="field">
        <span class="label">기분 <em>*</em></span>
        <div class="mood-picker" role="radiogroup" aria-label="기분">
          ${MOODS.map((m) => `
            <button type="button" class="mood-option" role="radio" data-mood="${m.value}" style="--mood: var(--mood-${m.value})"
              aria-checked="${state.mood === m.value}">
              ${moodFace(m.value, 34)}<span>${m.name}</span>
            </button>`).join('')}
        </div>
      </section>

      <label class="field">
        <span class="label">날짜</span>
        <input type="date" id="date" value="${state.date}" max="${todayStr()}" required>
      </label>

      <label class="field">
        <span class="label">제목</span>
        <input type="text" id="title" maxlength="${TITLE_MAX}" value="${esc(state.title)}" placeholder="${esc(defaultTitle(state.date))}">
      </label>

      <label class="field">
        <div class="field-head"><span class="label">메모</span><span class="hint" id="memo-count"></span></div>
        <textarea id="memo" rows="6" maxlength="${MEMO_MAX}" placeholder="오늘 어떤 하루였나요?">${esc(state.memo)}</textarea>
      </label>
      <input type="file" id="file" accept="image/*" multiple hidden>
    </main>`;

  const $ = (sel) => app.querySelector(sel);
  const saveBtn = $('[data-action="save"]');
  const strip = $('#photo-strip');
  const fileInput = $('#file');

  function refresh() {
    saveBtn.disabled = saving || preparing > 0 || state.photos.length === 0 || !state.mood;
    saveBtn.textContent = saving ? '저장 중…' : '저장';
    $('#photo-count').textContent = `${state.photos.length} / ${MAX_PHOTOS}`;
    $('#memo-count').textContent = `${state.memo.length} / ${MEMO_MAX}`;
  }

  function drawPhotos() {
    strip.innerHTML = state.photos.map((p, i) => `
      <div class="thumb">
        <button type="button" class="thumb-img" data-front="${i}" aria-label="${i === 0 ? '대표 사진' : '대표 사진으로 지정'}">
          <img src="${p.url}" alt="">
          ${i === 0 ? '<span class="thumb-badge">대표</span>' : ''}
        </button>
        <button type="button" class="thumb-remove" data-remove="${i}" aria-label="사진 빼기">${icon('close', 14)}</button>
      </div>`).join('')
      + (preparing ? '<div class="thumb thumb-loading"><span class="spinner"></span></div>' : '')
      + (state.photos.length + preparing < MAX_PHOTOS
        ? `<button type="button" class="thumb thumb-add" data-action="add">${icon('plus', 26)}<span>사진 추가</span></button>`
        : '');
    refresh();
  }

  strip.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action === 'add') fileInput.click();
    else if (btn.dataset.remove) {
      const [removed] = state.photos.splice(Number(btn.dataset.remove), 1);
      if (removed.blob) { URL.revokeObjectURL(removed.url); newUrls.delete(removed.url); }
      drawPhotos();
    } else if (btn.dataset.front && btn.dataset.front !== '0') {
      const [moved] = state.photos.splice(Number(btn.dataset.front), 1);
      state.photos.unshift(moved);
      drawPhotos();
    }
  });

  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    const room = MAX_PHOTOS - state.photos.length - preparing;
    if (files.length > room) toast(`사진은 최대 ${MAX_PHOTOS}장까지예요`);
    const picked = files.slice(0, room);
    preparing += picked.length;
    drawPhotos();
    // 고른 순서를 지키며 하나씩 줄인다(휴대폰 메모리 부담을 줄이기 위해 순차 처리)
    let failed = 0;
    for (const file of picked) {
      try {
        const blob = await resizeImage(file);
        if (id !== renderId) return;
        const url = URL.createObjectURL(blob);
        newUrls.add(url);
        state.photos.push({ blob, url });
      } catch {
        failed += 1;
      }
      preparing -= 1;
      drawPhotos();
    }
    if (failed) toast('열 수 없는 사진이 있어 제외했어요');
  });

  app.querySelector('.mood-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mood]');
    if (!btn) return;
    state.mood = Number(btn.dataset.mood);
    app.querySelectorAll('.mood-option').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    refresh();
  });

  $('#date').addEventListener('change', (e) => {
    state.date = e.target.value || todayStr();
    $('#title').placeholder = defaultTitle(state.date);
  });
  $('#title').addEventListener('input', (e) => { state.title = e.target.value; });
  $('#memo').addEventListener('input', (e) => { state.memo = e.target.value; refresh(); });

  $('[data-action="close"]').addEventListener('click', async () => {
    if (leaveGuard()) {
      const ok = await confirmDialog({ message: '작성 중인 내용이 사라져요. 닫을까요?', ok: '닫기', danger: true });
      if (!ok) return;
    }
    leaveGuard = null;
    if (movedInApp) history.back();
    else go(entry ? `#/entry/${entry.id}` : '#/');
  });

  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    saving = true;
    refresh();
    const data = {
      date: state.date,
      title: state.title.trim() || defaultTitle(state.date),
      mood: state.mood,
      memo: state.memo.trim(),
      photos: state.photos.map((p) => (p.blob ? { blob: p.blob } : { path: p.path })),
    };
    try {
      const savedId = entry ? await store.updateEntry(entry.id, data) : await store.createEntry(data);
      toast('저장했어요');
      // 상세 화면에서 뒤로 가면 작성 화면이 아니라 홈으로 가도록 기록을 교체한다
      go(`#/entry/${savedId}`, { replace: true });
    } catch (err) {
      saving = false;
      refresh();
      toast(errorMessage(err, '저장'));
    }
  });

  drawPhotos();
}

// ---------- 4. 로그인 ----------

function renderLogin() {
  if (user) { go('#/', { replace: true }); return; }
  app.innerHTML = `
    <header class="topbar">
      <span class="topbar-side"><a class="icon-btn" href="#/" aria-label="뒤로">${icon('back')}</a></span>
      <h1 class="topbar-title">로그인</h1>
      <span class="topbar-side right"></span>
    </header>
    <main class="login">
      <span class="summary-icon">${icon('book', 28)}</span>
      <p class="login-lead">사진 일기를 쓰려면 로그인하세요.</p>
      ${store.isDemo ? `
      <p class="hint center">데모 모드: 아무 이메일·비밀번호로 로그인돼요.</p>
      <form id="login-form" class="login-form">
        <label class="field"><span class="label">이메일</span>
          <input type="email" name="email" autocomplete="username" required></label>
        <label class="field"><span class="label">비밀번호</span>
          <input type="password" name="password" autocomplete="current-password" required></label>
        <p class="error" id="login-error" hidden>이메일 또는 비밀번호가 맞지 않아요.</p>
        <button class="btn btn-primary btn-block" type="submit">로그인</button>
      </form>` : `
      <form id="login-form" class="login-form">
        <label class="field"><span class="label">GitHub 열쇠 (토큰)</span>
          <input type="password" name="token" autocomplete="off" spellcheck="false" placeholder="github_pat_..." required></label>
        <p class="hint">열쇠는 이 기기에만 보관되고, 로그아웃하면 지워져요.</p>
        <p class="error" id="login-error" hidden>열쇠가 맞지 않거나 만료됐어요.</p>
        <button class="btn btn-primary btn-block" type="submit">로그인</button>
      </form>`}
    </main>`;

  const form = app.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    app.querySelector('#login-error').hidden = true;
    try {
      await store.signIn(store.isDemo
        ? { email: form.email.value.trim(), password: form.password.value }
        : { token: form.token.value });
      user = await store.getUser();
      toast('로그인했어요');
      go('#/', { replace: true });
    } catch {
      app.querySelector('#login-error').hidden = false;
      btn.disabled = false;
    }
  });
}

// ---------- 시작 ----------

user = await store.getUser();
show();
