export const MOODS = [
  { value: 1, name: '최고', mouth: 'M8 13.5c1.2 2.2 6.8 2.2 8 0', eyes: 'happy' },
  { value: 2, name: '좋음', mouth: 'M8.5 14c1.4 1.3 5.6 1.3 7 0', eyes: 'dot' },
  { value: 3, name: '보통', mouth: 'M8.5 14.5h7', eyes: 'dot' },
  { value: 4, name: '별로', mouth: 'M8.5 15.5c1.4-1.3 5.6-1.3 7 0', eyes: 'dot' },
  { value: 5, name: '최악', mouth: 'M8 16c1.2-2.2 6.8-2.2 8 0', eyes: 'sad' },
];

export function moodOf(value) {
  return MOODS.find((m) => m.value === value) || MOODS[2];
}

export function moodFace(value, size = 24) {
  const m = moodOf(value);
  const eyes = {
    happy: '<path d="M7.5 10c.6-1 1.9-1 2.5 0M14 10c.6-1 1.9-1 2.5 0"/>',
    dot: '<circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none"/>',
    sad: '<path d="M7.5 9.5l2.5 1M16.5 9.5l-2.5 1"/>',
  }[m.eyes];
  return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/>${eyes}<path d="${m.mouth}"/></svg>`;
}

const ICON_PATHS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  book: '<path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6zM12 6v14.5"/>',
  photos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
};

export function icon(name, size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 날짜는 'YYYY-MM-DD' 문자열로 다룬다(시간대 영향 없음).
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d, dow: '일월화수목금토'[new Date(y, m - 1, d).getDay()] };
}

export function formatDate(dateStr, withYear = false) {
  const { y, m, d, dow } = parts(dateStr);
  const thisYear = new Date().getFullYear();
  return `${withYear || y !== thisYear ? `${y}년 ` : ''}${m}월 ${d}일 (${dow})`;
}

export function defaultTitle(dateStr) {
  const { m, d } = parts(dateStr);
  return `${m}월 ${d}일의 기록`;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// 확인 창. 확인을 누르면 true.
export function confirmDialog({ message, ok = '확인', cancel = '취소', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `<p>${esc(message)}</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" value="cancel">${esc(cancel)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${esc(ok)}</button>
      </div>`;
    const done = (result) => { dlg.close(); dlg.remove(); resolve(result); };
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) done(false); // 바깥 영역
      else if (e.target.value) done(e.target.value === 'ok');
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); }); // Esc
    document.body.append(dlg);
    dlg.showModal();
  });
}
