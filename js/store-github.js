// GitHub 저장소: 기록은 data/entries.json 한 파일, 사진은 data/photos/ 폴더.
// 읽기는 누구나(공개 저장소), 쓰기는 열쇠(토큰)를 가진 사람만 — GitHub가 강제한다.
// 저장 1번 = 커밋 1개. 사진과 기록 파일을 함께 올려 반쯤 저장되는 일이 없다.
import { GITHUB_OWNER as OWNER, GITHUB_REPO as REPO, GITHUB_BRANCH as BRANCH } from './config.js';

const API = 'https://api.github.com';
const REPO_API = `${API}/repos/${OWNER}/${REPO}`;
const TOKEN_KEY = 'photo-diary-token';
const ENTRIES_PATH = 'data/entries.json';
const PHOTO_DIR = 'data/photos/';
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;
// GitHub Pages에서는 같은 사이트의 파일을 읽고, 그 밖(내 PC 등)에서는 저장소 원본을 읽는다.
const PUBLIC_BASE = location.hostname.endsWith('github.io') ? '' : RAW_BASE;

export const isDemo = false;

function token() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function fail(code, status) {
  return Object.assign(new Error(code), { code, status });
}

async function gh(url, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url.startsWith('http') ? url : REPO_API + url, {
    method, headers, body: body && JSON.stringify(body), cache: 'no-store',
  });
  if (res.status === 401) throw fail('unauthorized', 401);
  if (res.status === 403) throw fail('forbidden', 403);
  if (!res.ok) throw fail('github_error', res.status);
  return accept.includes('raw') ? res.text() : res.json();
}

// ---------- 읽기 ----------

function parseEntries(text) {
  const data = JSON.parse(text);
  return Array.isArray(data.entries) ? data.entries : [];
}

// 주인: GitHub API로 최신 상태를 바로 읽는다. ref는 브랜치 이름 또는 커밋.
async function readEntriesAt(ref) {
  try {
    return parseEntries(await gh(`/contents/${ENTRIES_PATH}?ref=${ref}`, { accept: 'application/vnd.github.raw+json' }));
  } catch (e) {
    if (e.status === 404) return []; // 아직 기록이 없음
    throw e;
  }
}

// 방문자: 공개 파일을 읽는다(새 기록은 1~2분 뒤 반영).
async function readPublicEntries() {
  const res = await fetch(`${PUBLIC_BASE}${ENTRIES_PATH}?t=${Date.now()}`, { cache: 'no-store' });
  if (res.status === 404) return [];
  if (!res.ok) throw fail('load_failed', res.status);
  return parseEntries(await res.text());
}

let cache = null; // { at, promise } — 홈의 요약·목록이 같은 파일을 두 번 받지 않도록 잠깐 재사용
function loadAll() {
  if (!cache || Date.now() - cache.at > 3000) {
    const promise = (token() ? readEntriesAt(BRANCH) : readPublicEntries()).then(sortEntries);
    promise.catch(() => { cache = null; });
    cache = { at: Date.now(), promise };
  }
  return cache.promise;
}

function sortEntries(list) {
  // 날짜 최신순, 같은 날짜는 나중에 작성한 기록이 위
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

function withUrls(entry) {
  // 주인은 방금 올린 사진도 바로 보이도록 저장소 원본을 쓴다
  const base = token() ? RAW_BASE : PUBLIC_BASE;
  return { ...entry, photoUrls: entry.photos.map((name) => `${base}${PHOTO_DIR}${name}`) };
}

export async function listEntries(offset, limit) {
  const all = await loadAll();
  return { items: all.slice(offset, offset + limit).map(withUrls), hasMore: offset + limit < all.length };
}

export async function getSummary() {
  const all = await loadAll();
  const byMood = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  all.forEach((e) => { byMood[e.mood] += 1; });
  return { total: all.length, byMood };
}

export async function getEntry(id) {
  const entry = (await loadAll()).find((e) => e.id === id);
  return entry ? withUrls(entry) : null;
}

// ---------- 쓰기 ----------

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// 새 사진을 먼저 올리고(blob), 최신 기록 파일에 change를 적용해 커밋 하나로 묶는다.
// 다른 기기가 그 사이에 저장했으면 최신 상태에서 다시 적용한다.
async function commit(message, newPhotos, change) {
  const uploaded = await Promise.all(newPhotos.map(async ({ name, blob }) => {
    const { sha } = await gh('/git/blobs', { method: 'POST', body: { content: await toBase64(blob), encoding: 'base64' } });
    return { path: PHOTO_DIR + name, mode: '100644', type: 'blob', sha };
  }));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ref = await gh(`/git/ref/heads/${BRANCH}`);
    const headSha = ref.object.sha;
    const head = await gh(`/git/commits/${headSha}`);
    const { entries, removedPhotos } = change(await readEntriesAt(headSha));

    const tree = [
      ...uploaded,
      ...removedPhotos.map((name) => ({ path: PHOTO_DIR + name, mode: '100644', type: 'blob', sha: null })),
      { path: ENTRIES_PATH, mode: '100644', type: 'blob', content: `${JSON.stringify({ version: 1, entries }, null, 1)}\n` },
    ];
    const newTree = await gh('/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree } });
    const newCommit = await gh('/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [headSha] } });
    try {
      await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: newCommit.sha, force: false } });
      cache = { at: Date.now(), promise: Promise.resolve(sortEntries(entries)) };
      return;
    } catch (e) {
      if (e.status !== 422) throw e; // 422 = 그 사이 다른 저장이 있었음 → 다시 시도
    }
  }
  throw fail('conflict');
}

// photos: [{ path } | { blob }] — 화면 순서 그대로. 기존 사진은 path(파일 이름), 새 사진은 blob.
function splitPhotos(photos) {
  const added = [];
  const names = photos.map((p) => {
    if (p.path) return p.path;
    const name = `${newId()}.jpg`;
    added.push({ name, blob: p.blob });
    return name;
  });
  return { names, added };
}

export async function createEntry({ date, title, mood, memo, photos }) {
  const { names, added } = splitPhotos(photos);
  const now = new Date().toISOString();
  const entry = { id: newId(), date, title, mood, memo, photos: names, created_at: now, updated_at: now };
  await commit(`기록 추가: ${title}`, added, (list) => ({ entries: [...list, entry], removedPhotos: [] }));
  return entry.id;
}

export async function updateEntry(id, { date, title, mood, memo, photos }) {
  const { names, added } = splitPhotos(photos);
  await commit(`기록 수정: ${title}`, added, (list) => {
    const old = list.find((e) => e.id === id);
    if (!old) throw fail('not_found');
    const entry = { ...old, date, title, mood, memo, photos: names, updated_at: new Date().toISOString() };
    return {
      entries: list.map((e) => (e.id === id ? entry : e)),
      removedPhotos: old.photos.filter((n) => !names.includes(n)),
    };
  });
  return id;
}

export async function deleteEntry(id) {
  await commit('기록 삭제', [], (list) => {
    const old = list.find((e) => e.id === id);
    return { entries: list.filter((e) => e.id !== id), removedPhotos: old ? old.photos : [] };
  });
}

// ---------- 로그인 (열쇠) ----------

export async function getUser() {
  return token() ? { name: OWNER } : null;
}

// 열쇠로 저장소 정보를 읽어, 이 저장소에 쓸 수 있는 열쇠인지 확인한 뒤 기기에 보관한다.
export async function signIn({ token: t }) {
  t = (t || '').trim();
  if (!t) throw fail('invalid_credentials');
  const res = await fetch(REPO_API, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${t}` },
    cache: 'no-store',
  });
  if (!res.ok) throw fail('invalid_credentials', res.status);
  const repo = await res.json();
  if (!repo.permissions?.push) throw fail('invalid_credentials');
  localStorage.setItem(TOKEN_KEY, t);
  cache = null;
}

export async function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  cache = null;
}
