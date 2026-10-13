// 1단계 데모 저장소: 이 브라우저의 IndexedDB에 기록과 사진을 저장한다.
// Supabase 저장소(3단계)와 같은 함수 모양을 갖는다.

const DB_NAME = 'photo-diary-demo';
const AUTH_KEY = 'photo-diary-demo-user';

let dbPromise;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('entries', { keyPath: 'id' });
      req.result.createObjectStore('photos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 사진 주소: 저장된 Blob마다 object URL을 한 번만 만들어 재사용한다.
const urlCache = new Map();
async function photoUrls(paths) {
  const missing = paths.filter((p) => !urlCache.has(p));
  if (missing.length) {
    const blobs = await tx('photos', 'readonly', (t) => {
      const out = {};
      missing.forEach((p) => { t.objectStore('photos').get(p).onsuccess = (e) => { out[p] = e.target.result; }; });
      return out;
    });
    missing.forEach((p) => { if (blobs[p]) urlCache.set(p, URL.createObjectURL(blobs[p])); });
  }
  return paths.map((p) => urlCache.get(p) || '');
}

async function withUrls(entry) {
  return { ...entry, photoUrls: await photoUrls(entry.photos) };
}

async function allEntries() {
  const list = await tx('entries', 'readonly', (t) => t.objectStore('entries').getAll());
  // 날짜 최신순, 같은 날짜는 나중에 작성한 기록이 위
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

export async function listEntries(offset, limit) {
  const all = await allEntries();
  const page = all.slice(offset, offset + limit);
  return { items: await Promise.all(page.map(withUrls)), hasMore: offset + limit < all.length };
}

export async function getSummary() {
  const all = await allEntries();
  const byMood = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  all.forEach((e) => { byMood[e.mood] += 1; });
  return { total: all.length, byMood };
}

export async function getEntry(id) {
  const entry = await tx('entries', 'readonly', (t) => t.objectStore('entries').get(id));
  return entry ? withUrls(entry) : null;
}

// photos: [{ path } | { blob }] — 화면에 보이는 순서 그대로. 새 사진은 blob으로 넘긴다.
async function savePhotos(photos) {
  const added = [];
  const paths = photos.map((p) => {
    if (p.path) return p.path;
    const path = `${newId()}.jpg`;
    added.push([path, p.blob]);
    return path;
  });
  return { paths, added };
}

export async function createEntry({ date, title, mood, memo, photos }) {
  const now = new Date().toISOString();
  const { paths, added } = await savePhotos(photos);
  const entry = { id: newId(), date, title, mood, memo, photos: paths, created_at: now, updated_at: now };
  await tx(['entries', 'photos'], 'readwrite', (t) => {
    added.forEach(([path, blob]) => t.objectStore('photos').put(blob, path));
    t.objectStore('entries').put(entry);
  });
  return entry.id;
}

export async function updateEntry(id, { date, title, mood, memo, photos }) {
  const old = await tx('entries', 'readonly', (t) => t.objectStore('entries').get(id));
  if (!old) throw new Error('not_found');
  const { paths, added } = await savePhotos(photos);
  const removed = old.photos.filter((p) => !paths.includes(p));
  const entry = { ...old, date, title, mood, memo, photos: paths, updated_at: new Date().toISOString() };
  await tx(['entries', 'photos'], 'readwrite', (t) => {
    added.forEach(([path, blob]) => t.objectStore('photos').put(blob, path));
    removed.forEach((p) => t.objectStore('photos').delete(p));
    t.objectStore('entries').put(entry);
  });
  removed.forEach(forgetUrl);
  return id;
}

export async function deleteEntry(id) {
  const old = await tx('entries', 'readonly', (t) => t.objectStore('entries').get(id));
  if (!old) return;
  await tx(['entries', 'photos'], 'readwrite', (t) => {
    old.photos.forEach((p) => t.objectStore('photos').delete(p));
    t.objectStore('entries').delete(id);
  });
  old.photos.forEach(forgetUrl);
}

function forgetUrl(path) {
  const url = urlCache.get(path);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(path);
}

// 데모 로그인: 이메일·비밀번호가 비어 있지 않으면 통과한다.
export async function getUser() {
  const email = localStorage.getItem(AUTH_KEY);
  return email ? { email } : null;
}

export async function signIn({ email, password }) {
  if (!email || !password) throw new Error('invalid_credentials');
  localStorage.setItem(AUTH_KEY, email);
}

export async function signOut() {
  localStorage.removeItem(AUTH_KEY);
}

export const isDemo = true;
