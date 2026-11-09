import { firebaseConfig, DOMAIN } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s) => document.querySelector(s);
const STATUS = { dihuni: 'Dihuni pemilik', kontrak: 'Dikontrakkan', kosong: 'Kosong' };
const KAT_PENG = { info: 'Info', penting: 'Penting', darurat: 'Darurat' };
const KAT_AG = { rapat: 'Rapat', kegiatan: 'Kegiatan', lainnya: 'Lainnya' };
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const VIEWS = [
  { id: 'beranda', label: 'Beranda', icon: 'home' },
  { id: 'pengumuman', label: 'Pengumuman', icon: 'bell' },
  { id: 'agenda', label: 'Agenda', icon: 'cal' },
  { id: 'warga', label: 'Warga', icon: 'users' }
];
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2.3.6 3.5 2.4 3.5 5.8"/>'
};

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore(auth.app);

let profile = null, unsubs = [], shell = false, menuOpen = false;
let view = 'beranda';
const data = { rumah: [], pengumuman: [], agenda: [] };
const ready = { rumah: false, pengumuman: false, agenda: false };
const err = { rumah: null, pengumuman: null, agenda: null };
const expanded = new Set();
const filt = { q: '', blok: '', status: '', kat: 'semua' };

/* ---------- Util ---------- */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICONS[name];
  return s;
}
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400); }
const mount = (...nodes) => { const a = $('#app'); a.textContent = ''; a.append(...nodes); };
const normStatus = (s) => { s = String(s || '').toLowerCase(); return s.includes('kontrak') ? 'kontrak' : s.includes('kosong') ? 'kosong' : 'dihuni'; };
const normHouse = (d) => ({ id: d.id, blok: String(d.blok || ''), nomor: String(d.nomor || ''), kepala: d.kepala || '', telepon: d.telepon || '',
  jumlah: Number(d.jumlah) || 0, status: normStatus(d.status), jabatan: d.jabatan || '', catatan: d.catatan || '' });

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function parseD(s) { s = String(s || ''); return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s); }
function daysAgo(s) {
  const d = parseD(s); if (isNaN(d)) return null;
  const t = new Date();
  return Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
}
function rel(s) {
  const n = daysAgo(s); if (n === null) return '';
  if (n === 0) return 'Hari ini'; if (n === 1) return 'Kemarin'; if (n > 1 && n < 7) return n + ' hari lalu';
  return parseD(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
const longDate = (d) => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function fbError(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'Username atau password salah.';
  if (c === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  if (c === 'auth/weak-password') return 'Password baru terlalu pendek. Pakai minimal 6 karakter.';
  if (c === 'auth/network-request-failed') return 'Tidak ada koneksi internet. Coba lagi setelah tersambung.';
  return 'Terjadi kesalahan (' + (c || 'tidak dikenal') + '). Coba lagi.';
}
function loadErr(code) {
  return code === 'permission-denied'
    ? 'Data belum bisa dibuka. Pengurus perlu memasang aturan keamanan terbaru di Firebase. (permission-denied)'
    : 'Data tidak bisa dimuat. Periksa koneksi lalu muat ulang halaman. (' + code + ')';
}

/* ---------- Masuk ---------- */
function showLogin() {
  shell = false;
  const msg = h('div', { class: 'msg', role: 'status' });
  const u = h('input', { class: 'field', id: 'l-user', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const p = h('input', { class: 'field', id: 'l-pass', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Masuk');
  const form = h('form', { class: 'login' },
    h('div', { class: 'hero' }, h('span', { class: 'plate', style: 'align-self:flex-start' }, 'ADIBA 3'), h('h1', { style: 'margin-top:10px' }, 'Paguyuban ADIBA 3'),
      h('div', { class: 'sub' }, 'Masuk dengan username dan password dari pengurus.')),
    h('label', { class: 'f', for: 'l-user' }, 'Username', u),
    h('label', { class: 'f', for: 'l-pass' }, 'Password', p),
    msg, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Masuk…';
    try { await signInWithEmailAndPassword(auth, u.value.trim().toLowerCase() + '@' + DOMAIN, p.value); }
    catch (e) { msg.className = 'msg err'; msg.textContent = fbError(e); btn.disabled = false; }
  });
  mount(h('div', { class: 'login-wrap' }, form));
  u.focus();
}
function showBlocked(text) {
  shell = false;
  mount(h('div', { class: 'login-wrap' }, h('div', { class: 'login' }, h('h1', null, 'Paguyuban ADIBA 3'), h('div', { class: 'note err' }, text),
    h('button', { class: 'btn', type: 'button', onclick: () => signOut(auth) }, 'Keluar'))));
}

/* ---------- Data (hanya baca) ---------- */
function stopAll() {
  unsubs.forEach((f) => f()); unsubs = [];
  data.rumah = []; data.pengumuman = []; data.agenda = [];
  for (const k in ready) { ready[k] = false; err[k] = null; }
}
function subscribe(name) {
  unsubs.push(onSnapshot(collection(db, name), (snap) => {
    data[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    ready[name] = true; err[name] = null; renderPage();
  }, (e) => { ready[name] = true; err[name] = (e && e.code) || 'error'; renderPage(); }));
}

onAuthStateChanged(auth, (user) => {
  stopAll(); profile = null; shell = false;
  if (!user) { showLogin(); return; }
  mount(h('div', { class: 'login-wrap' }, h('div', { class: 'note' }, 'Memuat data…')));
  let started = false;
  unsubs.push(onSnapshot(doc(db, 'users', user.uid), (snap) => {
    if (!snap.exists()) { showBlocked('Akun ini belum terdaftar di paguyuban atau sudah dihapus. Hubungi pengurus.'); return; }
    profile = { uid: user.uid, ...snap.data() };
    if (!profile.aktif) { showBlocked('Akun ini dinonaktifkan. Hubungi pengurus.'); return; }
    if (!started) { started = true; ['rumah', 'pengumuman', 'agenda'].forEach(subscribe); }
    renderPage();
  }, (e) => showBlocked(loadErr((e && e.code) || 'error'))));
});

/* ---------- Kerangka halaman ---------- */
function buildShell() {
  shell = true;
  const name = profile.nama || profile.username || '';
  const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
    h('div', { class: 'who' }, h('div', { class: 'nama' }, name), h('div', { class: 'sub' }, '@' + (profile.username || ''))),
    h('button', { type: 'button', role: 'menuitem', onclick: () => { toggleMenu(false); openPassword(); } }, 'Ganti password'),
    h('button', { type: 'button', role: 'menuitem', onclick: () => signOut(auth) }, 'Keluar'));
  const avatar = h('button', { class: 'avatar', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Menu akun', id: 'avatar',
    onclick: (e) => { e.stopPropagation(); toggleMenu(!menuOpen); } }, (name.trim()[0] || '?').toUpperCase());
  const nav = h('nav', { class: 'nav', 'aria-label': 'Menu utama' },
    VIEWS.map((v) => h('a', { href: '#' + v.id, 'data-v': v.id }, icon(v.icon), h('span', null, v.label))));
  mount(
    h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
      h('div', { class: 'brand' }, h('span', { class: 'plate' }, 'A3'), h('div', null, h('div', { class: 'eyebrow' }, 'Perumahan'), h('b', null, 'ADIBA 3'))),
      nav, h('div', { class: 'acct' }, avatar, menu))),
    h('main', { class: 'page', id: 'main' }));
}
function toggleMenu(open) {
  menuOpen = open;
  const m = $('.menu'), a = $('#avatar');
  if (m) m.hidden = !open;
  if (a) a.setAttribute('aria-expanded', String(open));
}
document.addEventListener('click', (e) => { if (menuOpen && !e.target.closest('.acct')) toggleMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) toggleMenu(false); });

function syncRoute() {
  const id = location.hash.replace('#', '');
  view = VIEWS.some((v) => v.id === id) ? id : 'beranda';
}
window.addEventListener('hashchange', () => { syncRoute(); window.scrollTo(0, 0); renderPage(); });
syncRoute();

function renderPage() {
  if (!profile || !profile.aktif) return;
  if (!shell) buildShell();
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.v === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const active = document.activeElement;
  const keep = active && active.id === 'q';
  const caret = keep ? active.selectionStart : 0;
  const main = $('#main');
  main.textContent = '';
  main.append(view === 'pengumuman' ? pengumumanView() : view === 'agenda' ? agendaView() : view === 'warga' ? wargaView() : berandaView());
  if (keep) { const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(caret, caret); } }
}

/* ---------- Bagian-bagian ---------- */
const pengSorted = () => data.pengumuman.slice().sort((a, b) =>
  (b.disematkan ? 1 : 0) - (a.disematkan ? 1 : 0) || String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
const agKey = (a) => String(a.tanggal || '') + ' ' + String(a.jam || '00:00');
const upcoming = () => { const t = ymd(new Date()); return data.agenda.filter((a) => String(a.tanggal || '') >= t).sort((a, b) => agKey(a).localeCompare(agKey(b))); };
const pastAg = () => { const t = ymd(new Date()); return data.agenda.filter((a) => String(a.tanggal || '') < t).sort((a, b) => agKey(b).localeCompare(agKey(a))); };

function state(name, emptyTitle, emptyText) {
  if (err[name]) return h('div', { class: 'note err' }, loadErr(err[name]));
  if (!ready[name]) return h('div', { class: 'note' }, 'Memuat…');
  return h('div', { class: 'card empty' }, h('h2', null, emptyTitle), h('p', null, emptyText));
}

function pengCard(p, compact) {
  const kat = KAT_PENG[p.kategori] ? p.kategori : 'info';
  const isi = String(p.isi || '');
  const long = isi.length > 160;
  const open = !compact && expanded.has(p.id);
  const n = daysAgo(p.tanggal);
  return h('article', { class: 'card post' + (p.disematkan ? ' pinned' : '') },
    h('div', { class: 'post-top' },
      p.disematkan ? h('span', { class: 'pill baru' }, 'Disematkan') : null,
      h('span', { class: 'pill ' + kat }, KAT_PENG[kat]),
      n !== null && n >= 0 && n <= 3 ? h('span', { class: 'pill baru' }, 'Baru') : null,
      h('span', { class: 'sub' }, rel(p.tanggal))),
    h('h3', null, p.judul || '(tanpa judul)'),
    isi ? h('p', { class: long && !open ? 'clamp' : '' }, isi) : null,
    !compact && long ? h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': String(open),
      onclick: () => { if (expanded.has(p.id)) expanded.delete(p.id); else expanded.add(p.id); renderPage(); } }, open ? 'Tutup' : 'Baca selengkapnya') : null,
    compact && long ? h('a', { class: 'linkbtn', href: '#pengumuman', style: 'text-decoration:none' }, 'Baca selengkapnya') : null,
    p.penulis ? h('div', { class: 'sub' }, 'Oleh ' + p.penulis) : null);
}

function agItem(a) {
  const d = parseD(a.tanggal), valid = !isNaN(d);
  const kat = KAT_AG[a.kategori] ? a.kategori : 'lainnya';
  const isToday = a.tanggal === ymd(new Date());
  const meta = [a.jam ? 'Pukul ' + a.jam : '', a.lokasi || ''].filter(Boolean).join(' · ');
  return h('li', { class: 'card ag' + (isToday ? ' today' : ''), style: 'list-style:none' },
    h('div', { class: 'dateplate' }, h('b', null, valid ? d.getDate() : '–'), h('span', null, valid ? BULAN[d.getMonth()] : '')),
    h('div', { class: 'ag-body' },
      h('div', { class: 'post-top' }, h('span', { class: 'pill ' + kat }, KAT_AG[kat]), isToday ? h('span', { class: 'pill baru' }, 'Hari ini') : null,
        valid ? h('span', { class: 'sub' }, d.toLocaleDateString('id-ID', { weekday: 'long' })) : null),
      h('div', { class: 'ag-title' }, a.judul || '(tanpa judul)'),
      meta ? h('div', { class: 'ag-meta' }, meta) : null,
      a.keterangan ? h('div', { class: 'ag-note' }, a.keterangan) : null));
}
const agList = (items) => h('ul', { class: 'stack', style: 'margin:0;padding:0' }, items.map(agItem));

/* ---------- Beranda ---------- */
function berandaView() {
  const hs = data.rumah.map(normHouse);
  const mine = profile.rumahId ? hs.find((x) => x.id === profile.rumahId) : null;
  const first = String(profile.nama || profile.username || '').trim().split(/\s+/)[0];
  const peng = pengSorted().slice(0, 3), ag = upcoming().slice(0, 3);
  let jiwa = 0; hs.forEach((x) => { jiwa += x.jumlah; });
  const stat = (n, l) => h('div', { class: 'stat' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l));
  const head = (t, hash) => h('div', { class: 'sec-head' }, h('h2', null, t), h('a', { href: '#' + hash }, 'Lihat semua'));
  return h('div', { style: 'display:contents' },
    h('div', { class: 'hero' }, h('div', { class: 'sub' }, longDate(new Date())), h('h1', null, 'Halo, ' + first)),
    mine ? h('div', { class: 'mine' }, h('span', { class: 'plate' }, mine.blok + '-' + mine.nomor), h('strong', null, 'Rumah Anda'),
      h('span', { class: 'sub' }, STATUS[mine.status] + (mine.jumlah ? ', ' + mine.jumlah + ' jiwa' : ''))) : null,
    h('div', { class: 'cols' },
      h('section', { class: 'stack' }, head('Pengumuman terbaru', 'pengumuman'),
        peng.length ? peng.map((p) => pengCard(p, true)) : state('pengumuman', 'Belum ada pengumuman', 'Pengumuman dari pengurus akan tampil di sini.')),
      h('section', { class: 'stack' }, head('Agenda terdekat', 'agenda'),
        ag.length ? agList(ag) : state('agenda', 'Belum ada agenda', 'Jadwal rapat dan kegiatan warga akan tampil di sini.'))),
    ready.rumah && !err.rumah ? h('section', { class: 'card stats', 'aria-label': 'Ringkasan' }, stat(hs.length, 'Rumah terdata'), stat(hs.filter((x) => x.status === 'dihuni').length, 'Dihuni pemilik'), stat(jiwa, 'Jiwa tercatat')) : null);
}

/* ---------- Pengumuman ---------- */
function pengumumanView() {
  const all = pengSorted();
  const shown = all.filter((p) => filt.kat === 'semua' || (KAT_PENG[p.kategori] ? p.kategori : 'info') === filt.kat);
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter kategori' },
    [['semua', 'Semua']].concat(Object.entries(KAT_PENG)).map(([v, l]) =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filt.kat === v), onclick: () => { filt.kat = v; renderPage(); } }, l)));
  return h('div', { style: 'display:contents' },
    h('h1', null, 'Pengumuman'), chips,
    shown.length ? h('div', { class: 'stack' }, shown.map((p) => pengCard(p, false)))
      : all.length ? h('div', { class: 'note' }, 'Tidak ada pengumuman di kategori ini.')
      : state('pengumuman', 'Belum ada pengumuman', 'Pengumuman dari pengurus akan tampil di sini.'));
}

/* ---------- Agenda ---------- */
function agendaView() {
  const up = upcoming(), past = pastAg();
  const today = up.filter((a) => a.tanggal === ymd(new Date())), later = up.filter((a) => a.tanggal !== ymd(new Date()));
  return h('div', { style: 'display:contents' },
    h('h1', null, 'Agenda'),
    !up.length && !past.length ? state('agenda', 'Belum ada agenda', 'Jadwal rapat dan kegiatan warga akan tampil di sini.') : null,
    today.length ? h('section', { class: 'stack' }, h('h2', null, 'Hari ini'), agList(today)) : null,
    later.length ? h('section', { class: 'stack' }, h('h2', null, 'Akan datang'), agList(later)) : null,
    !up.length && past.length ? h('div', { class: 'note' }, 'Tidak ada agenda yang akan datang.') : null,
    past.length ? h('details', { class: 'past' }, h('summary', null, 'Sudah lewat (' + past.length + ')'), h('div', { class: 'stack', style: 'margin-top:8px' }, agList(past.slice(0, 20)))) : null);
}

/* ---------- Warga ---------- */
function wargaView() {
  const hs = data.rumah.map(normHouse);
  const bloks = [...new Set(hs.map((x) => x.blok))].sort((a, b) => a.localeCompare(b, 'id'));
  const q = h('input', { class: 'field', id: 'q', type: 'search', placeholder: 'Cari nama, blok, atau telepon', 'aria-label': 'Cari warga', enterkeyhint: 'search' });
  q.value = filt.q;
  q.addEventListener('input', () => { filt.q = q.value; renderPage(); });
  const fb = h('select', { class: 'field', 'aria-label': 'Filter blok', onchange: (e) => { filt.blok = e.target.value; renderPage(); } },
    h('option', { value: '' }, 'Semua blok'), bloks.map((b) => h('option', { value: b }, 'Blok ' + b)));
  fb.value = bloks.includes(filt.blok) ? filt.blok : '';
  const fs = h('select', { class: 'field', 'aria-label': 'Filter status', onchange: (e) => { filt.status = e.target.value; renderPage(); } },
    h('option', { value: '' }, 'Semua status'), Object.entries(STATUS).map(([v, l]) => h('option', { value: v }, l)));
  fs.value = filt.status;

  const needle = filt.q.trim().toLowerCase();
  const all = hs.sort((a, b) => a.blok.localeCompare(b.blok, 'id') || a.nomor.localeCompare(b.nomor, 'id', { numeric: true }));
  const shown = all.filter((x) => {
    if (filt.blok && x.blok !== filt.blok) return false;
    if (filt.status && x.status !== filt.status) return false;
    if (!needle) return true;
    return [x.blok + '-' + x.nomor, x.blok + ' ' + x.nomor, x.kepala, x.telepon, x.jabatan, x.catatan].join(' ').toLowerCase().includes(needle);
  });

  const card = (x) => h('article', { class: 'card house' + (x.id === profile.rumahId ? ' me-row' : '') },
    h('span', { class: 'plate' }, x.blok + '-' + x.nomor),
    h('div', { class: 'nama' }, x.kepala || 'Belum diisi'),
    h('div', { class: 'line' }, h('span', { class: 'pill ' + x.status }, STATUS[x.status]), x.jumlah ? h('span', { class: 'sub' }, x.jumlah + ' jiwa') : null,
      x.jabatan ? h('span', { class: 'sub' }, x.jabatan) : null),
    h('div', { class: 'line' },
      x.telepon ? [h('span', { class: 'mono' }, x.telepon), h('button', { class: 'copy', type: 'button', 'aria-label': 'Salin nomor ' + x.telepon, onclick: () => {
        try { navigator.clipboard.writeText(x.telepon).then(() => toast('Nomor disalin'), () => toast('Salin manual: tekan lama nomornya')); }
        catch (e) { toast('Salin manual: tekan lama nomornya'); }
      } }, 'Salin')] : h('span', { class: 'sub' }, 'Tanpa nomor telepon')),
    x.catatan ? h('div', { class: 'sub', style: 'grid-column:2' }, x.catatan) : null);

  return h('div', { style: 'display:contents' },
    h('h1', null, 'Warga'),
    h('div', { class: 'tools' }, q, h('div', { class: 'row2' }, fb, fs)),
    err.rumah || !ready.rumah ? state('rumah', '', '')
      : all.length ? h('div', { class: 'stack' },
          h('div', { class: 'sub' }, 'Menampilkan ' + shown.length + ' dari ' + all.length + ' rumah'),
          shown.length ? h('div', { class: 'grid-houses stack' }, shown.map(card)) : h('div', { class: 'note' }, 'Tidak ada rumah yang cocok dengan pencarian.'))
      : state('rumah', 'Belum ada data', 'Pengurus belum memasukkan data warga.'));
}

/* ---------- Ganti password sendiri ---------- */
function openPassword() {
  const msg = h('div', { class: 'msg', role: 'status' });
  const lama = h('input', { class: 'field', id: 'p-lama', type: 'password', autocomplete: 'current-password', required: true });
  const baru = h('input', { class: 'field', id: 'p-baru', type: 'password', autocomplete: 'new-password', maxlength: 60, required: true });
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Simpan');
  const close = () => ov.remove();
  const form = h('form', { class: 'panel' },
    h('h2', null, 'Ganti password'),
    h('label', { class: 'f', for: 'p-lama' }, 'Password sekarang', lama),
    h('label', { class: 'f', for: 'p-baru' }, 'Password baru', h('span', { class: 'hint' }, 'Minimal 6 karakter'), baru),
    msg, h('div', { class: 'form-actions' }, save, h('button', { class: 'btn', type: 'button', onclick: close }, 'Batal')));
  const ov = h('div', { class: 'overlay' }, form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (baru.value.length < 6) { msg.className = 'msg err'; msg.textContent = 'Password baru minimal 6 karakter.'; return; }
    save.disabled = true; msg.className = 'msg'; msg.textContent = 'Menyimpan…';
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, lama.value));
      await updatePassword(user, baru.value);
      close(); toast('Password diganti');
    } catch (e) { msg.className = 'msg err'; msg.textContent = fbError(e); save.disabled = false; }
  });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(ov); lama.focus();
}
