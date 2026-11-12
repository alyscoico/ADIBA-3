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
(function () { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'fitur.css'; document.head.append(l); })();
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const VIEWS = [
  { id: 'beranda', label: 'Beranda', icon: 'home' },
  { id: 'info', label: 'Info', icon: 'bell' },
  { id: 'keuangan', label: 'Keuangan', icon: 'coin' },
  { id: 'arisan', label: 'Arisan', icon: 'cycle' },
  { id: 'warga', label: 'Warga', icon: 'users' }
];
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 9.5c0-1.1 1.3-2 3-2s3 .9 3 2-1.3 2-3 2-3 .9-3 2 1.3 2 3 2 3-.9 3-2M12 6v1.5M12 16.5V18"/>',
  cycle: '<path d="M20 11a8 8 0 0 0-14-4M4 13a8 8 0 0 0 14 4"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2.3.6 3.5 2.4 3.5 5.8"/>'
};

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore(auth.app);

let profile = null, unsubs = [], shell = false, menuOpen = false;
let view = 'beranda';
const COLS = ['rumah', 'pengumuman', 'agenda', 'arisan', 'pbbTahun'];
const DOCS = ['pengIuran', 'iuranSaya', 'pbbSaya', 'rIuran', 'rPbb'];
const data = {}, ready = {}, err = {};
[...COLS, ...DOCS].forEach((k) => { data[k] = COLS.includes(k) ? [] : null; ready[k] = false; err[k] = null; });
const info = { tab: 'pengumuman' };
const nd = new Date();
const keu = { tab: 'iuran', tahun: String(nd.getFullYear()) };
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
const toInt = (s) => parseInt(String(s == null ? '' : s).replace(/[^\d]/g, ''), 10) || 0;
const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const ymNow = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const bkey = (ym) => 'b' + ym.replace('-', '_');
const ykey = (y) => 'y' + y;
const ymLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return BULAN_PANJANG[m - 1] + ' ' + y; };
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const fmtDate = (s) => { const d = parseD(s); return isNaN(d) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); };
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
    ? 'Data belum bisa dibuka. Pengurus perlu melakukan registrasi ke Database'
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
    h('div', { class: 'hero' }, h('img', { class: 'logo logo-lg', src: 'logo.png', alt: 'Logo Warga ADIBA 3', width: '96', height: '96' }), h('h1', { style: 'margin-top:10px' }, 'Paguyuban ADIBA 3'),
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
  [...COLS, ...DOCS].forEach((k) => { data[k] = COLS.includes(k) ? [] : null; ready[k] = false; err[k] = null; });
}
function subscribe(name) {
  unsubs.push(onSnapshot(collection(db, name), (snap) => {
    data[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    ready[name] = true; err[name] = null; renderPage();
  }, (e) => { ready[name] = true; err[name] = (e && e.code) || 'error'; renderPage(); }));
}

function subscribeDoc(key, ref) {
  unsubs.push(onSnapshot(ref, (snap) => {
    data[key] = snap.exists() ? snap.data() : null; ready[key] = true; err[key] = null; renderPage();
  }, (e) => { ready[key] = true; err[key] = (e && e.code) || 'error'; renderPage(); }));
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
    if (!started) {
      started = true; COLS.forEach(subscribe);
      subscribeDoc('pengIuran', doc(db, 'pengaturan', 'iuran'));
      subscribeDoc('rIuran', doc(db, 'ringkasan', 'iuran'));
      subscribeDoc('rPbb', doc(db, 'ringkasan', 'pbb'));
      if (profile.rumahId) { subscribeDoc('iuranSaya', doc(db, 'iuran', profile.rumahId)); subscribeDoc('pbbSaya', doc(db, 'pbb', profile.rumahId)); }
      else { ready.iuranSaya = true; ready.pbbSaya = true; }
    }
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
      h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'logo.png', alt: 'Logo Warga ADIBA 3', width: '44', height: '44' }), h('div', { class: 'brand-text' }, h('div', { class: 'eyebrow' }, 'Perumahan'), h('b', null, 'ADIBA 3'), h('div', { class: 'addr' }, 'Kelurahan Jungke, Kecamatan Karanganyar, Kabupaten Karanganyar'), h('a', { class: 'maplink', href: 'https://maps.app.goo.gl/vCXrAwGvA3D9S2md8', target: '_blank', rel: 'noopener' }, 'Buka lokasi di Google Maps'))),
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
  if (id === 'pengumuman' || id === 'agenda') { info.tab = id; view = 'info'; return; }
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
  main.append(view === 'info' ? infoView() : view === 'keuangan' ? keuanganView() : view === 'arisan' ? arisanView() : view === 'warga' ? wargaView() : berandaView());
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
    tagihanKartu(),
    arisanKartu(),
    h('div', { class: 'cols' },
      h('section', { class: 'stack' }, head('Pengumuman terbaru', 'pengumuman'),
        peng.length ? peng.map((p) => pengCard(p, true)) : state('pengumuman', 'Belum ada pengumuman', 'Pengumuman dari pengurus akan tampil di sini.')),
      h('section', { class: 'stack' }, head('Agenda terdekat', 'agenda'),
        ag.length ? agList(ag) : state('agenda', 'Belum ada agenda', 'Jadwal rapat dan kegiatan warga akan tampil di sini.'))),
    ready.rumah && !err.rumah ? h('section', { class: 'card stats', 'aria-label': 'Ringkasan' }, stat(hs.length, 'Rumah terdata'), stat(hs.filter((x) => x.status === 'dihuni').length, 'Dihuni pemilik'), stat(jiwa, 'Jiwa tercatat')) : null);
}

const seg = (items, cur, pick) => h('div', { class: 'chips', role: 'group' },
  items.map(([v, l]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(cur === v), onclick: () => { pick(v); renderPage(); } }, l)));
const stepper = (label, prev, next) => h('div', { class: 'stepper' },
  h('button', { class: 'btn small', type: 'button', 'aria-label': 'Sebelumnya', onclick: () => { prev(); renderPage(); } }, '‹'),
  h('strong', null, label),
  h('button', { class: 'btn small', type: 'button', 'aria-label': 'Berikutnya', onclick: () => { next(); renderPage(); } }, '›'));
const meter = (pct) => h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('span', { style: 'width:' + pct + '%' }));
const sumItem = (n, l, good) => h('div', null, h('div', { class: 'n' + (good ? ' good' : '') }, n), h('div', { class: 'l' }, l));

function infoView() {
  return h('div', { style: 'display:contents' }, h('h1', null, 'Info warga'),
    seg([['pengumuman', 'Pengumuman'], ['agenda', 'Agenda']], info.tab, (v) => { info.tab = v; }),
    info.tab === 'agenda' ? agendaView(true) : pengumumanView(true));
}

/* ---------- Keuangan (hanya data rumah sendiri dan total) ---------- */
function tunggakan() {
  const set = data.pengIuran, nominal = Number(set && set.nominal) || 0;
  if (!nominal || !set.mulai) return null;
  const bayar = (data.iuranSaya && data.iuranSaya.bayar) || {};
  const now = ymNow(), late = [];
  for (let ym = set.mulai; ym <= now && late.length < 120; ym = ymAdd(ym, 1)) if (!bayar[bkey(ym)]) late.push(ym);
  return { nominal, late, bayar, now };
}
function pbbSaya(th) { const r = data.pbbSaya && data.pbbSaya.tahun && data.pbbSaya.tahun[ykey(th)]; return r && Number(r.tagihan) > 0 ? r : null; }

function tagihanKartu() {
  if (!profile.rumahId) return null;
  const t = tunggakan(), cards = [];
  if (t) {
    const cur = t.late.includes(t.now), nunggak = t.late.filter((m) => m !== t.now);
    cards.push(h('a', { class: 'card bill ' + (nunggak.length ? 'warn' : 'ok'), href: '#keuangan', style: 'text-decoration:none;color:inherit' },
      h('div', { class: 'eyebrow' }, 'Iuran bulanan'),
      nunggak.length ? h('h3', null, 'Tunggakan ' + nunggak.length + ' bulan, ' + rp(nunggak.length * t.nominal))
        : cur ? h('h3', null, ymLabel(t.now) + ' belum dibayar, ' + rp(t.nominal)) : h('h3', null, 'Iuran ' + ymLabel(t.now) + ' sudah lunas')));
  }
  const r = pbbSaya(keu.tahun) ;
  if (r && (Number(r.dibayar) || 0) < Number(r.tagihan)) {
    const td = data.pbbTahun.find((d) => d.id === keu.tahun);
    cards.push(h('a', { class: 'card bill warn', href: '#keuangan', style: 'text-decoration:none;color:inherit', onclick: () => { keu.tab = 'pbb'; } },
      h('div', { class: 'eyebrow' }, 'PBB ' + keu.tahun),
      h('h3', null, 'Sisa tagihan ' + rp(Number(r.tagihan) - (Number(r.dibayar) || 0))),
      td && td.jatuhTempo ? h('div', { class: 'sub' }, 'Jatuh tempo ' + fmtDate(td.jatuhTempo)) : null));
  }
  return cards.length ? h('section', { class: 'stack' }, cards) : null;
}

function keuanganView() {
  return h('div', { style: 'display:contents' }, h('h1', null, 'Keuangan'),
    seg([['iuran', 'Iuran bulanan'], ['pbb', 'PBB kolektif']], keu.tab, (v) => { keu.tab = v; }),
    keu.tab === 'pbb' ? pbbView() : iuranView());
}
function iuranView() {
  if (err.pengIuran || err.iuranSaya) return h('div', { class: 'note err' }, loadErr(err.pengIuran || err.iuranSaya));
  if (!ready.pengIuran || !ready.iuranSaya) return h('div', { class: 'note' }, 'Memuat…');
  const set = data.pengIuran;
  if (!set || !set.nominal) return h('div', { class: 'card empty' }, h('h2', null, 'Iuran belum diatur'), h('p', null, 'Pengurus belum mengisi nominal iuran bulanan.'));
  const t = tunggakan();
  const sum = data.rIuran && data.rIuran.perBulan && data.rIuran.perBulan[bkey(t.now)];
  const rumah = (data.rIuran && data.rIuran.rumah) || 0, lunas = sum ? sum.lunas : 0;
  const nunggak = t.late.filter((m) => m !== t.now);
  const rows = [];
  for (let ym = t.now, n = 0; ym >= set.mulai && n < 24; ym = ymAdd(ym, -1), n++) {
    const r = t.bayar[bkey(ym)];
    const late = !r && ym !== t.now;
    rows.push(h('li', { class: 'mrow' + (late ? ' late' : '') },
      h('div', null, h('div', { class: 'nm' }, ymLabel(ym)), r && r.tgl ? h('div', { class: 'sub' }, 'Dibayar ' + fmtDate(r.tgl)) : null),
      r ? h('span', { class: 'pill info' }, 'Lunas ' + rp(r.jumlah)) : h('span', { class: 'pill ' + (late ? 'darurat' : 'lainnya') }, late ? 'Belum bayar' : 'Belum dibayar')));
  }
  return h('div', { style: 'display:contents' },
    profile.rumahId ? h('div', { class: 'card bill ' + (nunggak.length ? 'warn' : 'ok') },
      h('div', { class: 'eyebrow' }, 'Rumah Anda'),
      h('h3', null, nunggak.length ? 'Tunggakan ' + nunggak.length + ' bulan: ' + rp(nunggak.length * t.nominal) : 'Tidak ada tunggakan'),
      h('div', { class: 'sub' }, rp(t.nominal) + ' per bulan' + (set.keterangan ? ' · ' + set.keterangan : '') + ' · dihitung sejak ' + ymLabel(set.mulai)))
      : h('div', { class: 'note' }, 'Akun ini tidak terkait dengan rumah, jadi status pribadi tidak tersedia.'),
    data.rIuran ? h('div', { class: 'card sum' },
      h('div', { class: 'eyebrow' }, 'Seluruh perumahan, ' + ymLabel(t.now)),
      h('div', { class: 'sum-grid three' }, sumItem(rp(sum ? sum.total : 0), 'Terkumpul bulan ini', true), sumItem(lunas + ' dari ' + rumah, 'Rumah sudah bayar'), sumItem(rumah ? Math.round(lunas * 100 / rumah) + '%' : '0%', 'Tingkat pembayaran')),
      meter(rumah ? Math.round(lunas * 100 / rumah) : 0)) : null,
    profile.rumahId ? h('section', { class: 'stack' }, h('h2', null, 'Riwayat pembayaran'), h('ul', { class: 'rows-m' }, rows)) : null);
}
function pbbView() {
  if (err.pbbTahun || err.pbbSaya) return h('div', { class: 'note err' }, loadErr(err.pbbTahun || err.pbbSaya));
  if (!ready.pbbTahun || !ready.pbbSaya) return h('div', { class: 'note' }, 'Memuat…');
  const th = keu.tahun, td = data.pbbTahun.find((d) => d.id === th) || {};
  const r = pbbSaya(th), sum = data.rPbb && data.rPbb.perTahun && data.rPbb.perTahun[ykey(th)];
  const sisa = r ? Math.max(0, Number(r.tagihan) - (Number(r.dibayar) || 0)) : 0;
  return h('div', { style: 'display:contents' },
    stepper('PBB ' + th, () => { keu.tahun = String(Number(keu.tahun) - 1); }, () => { keu.tahun = String(Number(keu.tahun) + 1); }),
    profile.rumahId ? (r ? h('div', { class: 'card bill ' + (sisa ? 'warn' : 'ok') },
        h('div', { class: 'eyebrow' }, 'Rumah Anda'),
        h('h3', null, sisa ? 'Sisa ' + rp(sisa) : 'PBB sudah lunas'),
        h('div', { class: 'sub' }, 'Tagihan ' + rp(r.tagihan) + ' · dibayar ' + rp(r.dibayar) + (r.tgl ? ' · terakhir ' + fmtDate(r.tgl) : '')),
        r.catatan ? h('div', { class: 'sub' }, r.catatan) : null)
      : h('div', { class: 'card empty' }, h('h2', null, 'Belum ada tagihan'), h('p', null, 'Pengurus belum memasukkan tagihan PBB ' + th + ' untuk rumah Anda.')))
      : h('div', { class: 'note' }, 'Akun ini tidak terkait dengan rumah, jadi status pribadi tidak tersedia.'),
    h('div', { class: 'card bill' },
      h('div', { class: 'eyebrow' }, 'Info PBB kolektif ' + th),
      h('div', null, td.jatuhTempo ? 'Jatuh tempo ' + fmtDate(td.jatuhTempo) : 'Jatuh tempo belum diumumkan'),
      h('div', { class: 'sub' }, td.disetor ? 'Sudah disetor pengurus ke kelurahan' + (td.tglSetor ? ' pada ' + fmtDate(td.tglSetor) : '') : 'Belum disetor ke kelurahan'),
      td.catatan ? h('div', { class: 'sub' }, td.catatan) : null),
    sum ? h('div', { class: 'card sum' },
      h('div', { class: 'eyebrow' }, 'Seluruh perumahan'),
      h('div', { class: 'sum-grid three' }, sumItem(rp(sum.tagihan), 'Total tagihan'), sumItem(rp(sum.terkumpul), 'Terkumpul', true), sumItem(sum.lunas + ' dari ' + sum.rumah, 'Rumah lunas')),
      meter(sum.tagihan ? Math.min(100, Math.round(sum.terkumpul * 100 / sum.tagihan)) : 0)) : null);
}

/* ---------- Arisan ---------- */
function arisanList() { return data.arisan.slice().sort((a, b) => a.id.localeCompare(b.id)); }
function tuan(a) { const x = data.rumah.map(normHouse).find((r) => r.id === a.rumahId); return x; }
function arisanKartu() {
  const now = ymNow(), a = arisanList().find((d) => d.id >= now);
  if (!a) return null;
  const x = tuan(a), meta = [a.tanggal ? fmtDate(a.tanggal) : '', a.jam ? 'Pukul ' + a.jam : ''].filter(Boolean).join(' · ');
  const mine = x && x.id === profile.rumahId;
  return h('a', { class: 'card bill' + (mine ? ' ok' : ''), href: '#arisan', style: 'text-decoration:none;color:inherit' },
    h('div', { class: 'eyebrow' }, 'Arisan ' + ymLabel(a.id)),
    h('h3', null, mine ? 'Giliran rumah Anda jadi tuan rumah' : 'Tuan rumah: ' + (x ? x.blok + '-' + x.nomor + (x.kepala ? ' (' + x.kepala + ')' : '') : a.rumahId)),
    meta ? h('div', { class: 'sub' }, meta) : null);
}
function arisanView() {
  const now = ymNow(), list = arisanList(), next = list.find((a) => a.id >= now);
  const item = (a) => {
    const [y, m] = a.id.split('-').map(Number), x = tuan(a), isNow = a.id === now, isNext = next && a.id === next.id && !isNow, past = a.id < now;
    const meta = [a.tanggal ? fmtDate(a.tanggal) : '', a.jam ? 'Pukul ' + a.jam : ''].filter(Boolean).join(' · ');
    return h('li', { class: 'card ag' + (isNow ? ' today' : '') + (x && x.id === profile.rumahId ? ' me-row' : ''), style: 'list-style:none' + (past ? ';opacity:.72' : '') },
      h('div', { class: 'dateplate' }, h('b', null, BULAN[m - 1]), h('span', null, y)),
      h('div', { class: 'ag-body' },
        h('div', { class: 'post-top' }, isNow ? h('span', { class: 'pill baru' }, 'Bulan ini') : null, isNext ? h('span', { class: 'pill baru' }, 'Berikutnya') : null,
          past ? h('span', { class: 'pill lainnya' }, 'Selesai') : null, x && x.id === profile.rumahId ? h('span', { class: 'pill info' }, 'Rumah Anda') : null),
        h('div', { class: 'turn-name' }, h('span', { class: 'plate' }, x ? x.blok + '-' + x.nomor : a.rumahId), h('span', { class: 'ag-title' }, x && x.kepala ? x.kepala : '')),
        meta ? h('div', { class: 'ag-meta' }, meta) : null, a.catatan ? h('div', { class: 'ag-note' }, a.catatan) : null));
  };
  return h('div', { style: 'display:contents' }, h('h1', null, 'Giliran arisan'),
    err.arisan || !ready.arisan || !ready.rumah ? state('arisan', '', '')
      : list.length ? h('ul', { class: 'grid-houses stack', style: 'margin:0;padding:0' }, list.map(item))
      : state('arisan', 'Belum ada jadwal arisan', 'Pengurus belum menyusun giliran tempat arisan.'));
}

/* ---------- Pengumuman ---------- */
function pengumumanView(embedded) {
  const all = pengSorted();
  const shown = all.filter((p) => filt.kat === 'semua' || (KAT_PENG[p.kategori] ? p.kategori : 'info') === filt.kat);
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter kategori' },
    [['semua', 'Semua']].concat(Object.entries(KAT_PENG)).map(([v, l]) =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filt.kat === v), onclick: () => { filt.kat = v; renderPage(); } }, l)));
  return h('div', { style: 'display:contents' },
    embedded ? null : h('h1', null, 'Pengumuman'), chips,
    shown.length ? h('div', { class: 'stack' }, shown.map((p) => pengCard(p, false)))
      : all.length ? h('div', { class: 'note' }, 'Tidak ada pengumuman di kategori ini.')
      : state('pengumuman', 'Belum ada pengumuman', 'Pengumuman dari pengurus akan tampil di sini.'));
}

/* ---------- Agenda ---------- */
function agendaView(embedded) {
  const up = upcoming(), past = pastAg();
  const today = up.filter((a) => a.tanggal === ymd(new Date())), later = up.filter((a) => a.tanggal !== ymd(new Date()));
  return h('div', { style: 'display:contents' },
    embedded ? null : h('h1', null, 'Agenda'),
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
