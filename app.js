import { firebaseConfig, DOMAIN } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s) => document.querySelector(s);
const STATUS = { dihuni: 'Dihuni pemilik', kontrak: 'Dikontrakkan', kosong: 'Kosong' };

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore(auth.app);

let profile = null, houses = [], unsubs = [], loaded = false;
const filter = { q: '', blok: '', status: '' };

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
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400); }
const normStatus = (s) => { s = String(s || '').toLowerCase(); return s.includes('kontrak') ? 'kontrak' : s.includes('kosong') ? 'kosong' : 'dihuni'; };
const mount = (...nodes) => { const a = $('#app'); a.textContent = ''; a.append(...nodes); };
function fbError(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'Username atau password salah.';
  if (c === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  if (c === 'auth/weak-password') return 'Password baru terlalu pendek. Pakai minimal 6 karakter.';
  if (c === 'auth/network-request-failed') return 'Tidak ada koneksi internet. Coba lagi setelah tersambung.';
  return 'Terjadi kesalahan (' + (c || 'tidak dikenal') + '). Coba lagi.';
}

/* ---------- Login ---------- */
function showLogin() {
  const msg = h('div', { class: 'msg', role: 'status' });
  const u = h('input', { class: 'field', id: 'l-user', autocomplete: 'username', autocapitalize: 'none', required: true });
  const p = h('input', { class: 'field', id: 'l-pass', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Masuk');
  const form = h('form', { class: 'login' },
    h('div', null, h('div', { class: 'eyebrow' }, 'Perumahan ADIBA 3'), h('h1', null, 'Paguyuban ADIBA 3'), h('div', { class: 'sub' }, 'Masuk dengan username dan password dari pengurus.')),
    h('label', { class: 'f', for: 'l-user' }, 'Username', u),
    h('label', { class: 'f', for: 'l-pass' }, 'Password', p),
    msg, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Masuk…';
    try { await signInWithEmailAndPassword(auth, u.value.trim().toLowerCase() + '@' + DOMAIN, p.value); }
    catch (e) { msg.className = 'msg err'; msg.textContent = fbError(e); btn.disabled = false; }
  });
  mount(form); u.focus();
}
function showBlocked(text) {
  mount(h('div', { class: 'login' }, h('h1', null, 'Paguyuban ADIBA 3'), h('div', { class: 'note err' }, text),
    h('button', { class: 'btn', type: 'button', onclick: () => signOut(auth) }, 'Keluar')));
}

/* ---------- Data (hanya baca) ---------- */
function stopAll() { unsubs.forEach((f) => f()); unsubs = []; houses = []; loaded = false; }

onAuthStateChanged(auth, (user) => {
  stopAll(); profile = null;
  if (!user) { showLogin(); return; }
  mount(h('div', { class: 'note' }, 'Memuat data…'));
  let started = false;
  unsubs.push(onSnapshot(doc(db, 'users', user.uid), (snap) => {
    if (!snap.exists()) { showBlocked('Akun ini belum terdaftar di paguyuban atau sudah dihapus. Hubungi pengurus.'); return; }
    profile = { uid: user.uid, ...snap.data() };
    if (!profile.aktif) { showBlocked('Akun ini dinonaktifkan. Hubungi pengurus.'); return; }
    if (!started) {
      started = true;
      unsubs.push(onSnapshot(collection(db, 'rumah'), (s) => {
        houses = s.docs.map((d) => { const v = d.data(); return {
          id: d.id, blok: String(v.blok || ''), nomor: String(v.nomor || ''), kepala: v.kepala || '', telepon: v.telepon || '',
          jumlah: Number(v.jumlah) || 0, status: normStatus(v.status), jabatan: v.jabatan || '', catatan: v.catatan || '' }; });
        loaded = true; render();
      }, () => showBlocked('Data warga tidak bisa dimuat. Periksa koneksi lalu muat ulang halaman.')));
    }
    if (loaded) render();
  }, () => showBlocked('Data tidak bisa dimuat. Periksa koneksi lalu muat ulang halaman.')));
});

/* ---------- Tampilan ---------- */
function render() {
  const active = document.activeElement;
  const keepSearch = active && active.id === 'q';
  const caret = keepSearch ? active.selectionStart : 0;

  const c = { dihuni: 0, kontrak: 0, kosong: 0 }; let jiwa = 0;
  houses.forEach((x) => { c[x.status]++; jiwa += x.jumlah; });
  const stat = (n, l) => h('div', { class: 'stat' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l));
  const bloks = [...new Set(houses.map((x) => x.blok))].sort((a, b) => a.localeCompare(b, 'id'));

  const q = h('input', { class: 'field', id: 'q', type: 'search', placeholder: 'Cari nama, blok, nomor rumah, atau telepon', 'aria-label': 'Cari' });
  q.value = filter.q;
  q.addEventListener('input', () => { filter.q = q.value; render(); });
  const fb = h('select', { class: 'field', 'aria-label': 'Filter blok', onchange: (e) => { filter.blok = e.target.value; render(); } },
    h('option', { value: '' }, 'Semua blok'), bloks.map((b) => h('option', { value: b }, 'Blok ' + b)));
  fb.value = bloks.includes(filter.blok) ? filter.blok : '';
  const fs = h('select', { class: 'field', 'aria-label': 'Filter status', onchange: (e) => { filter.status = e.target.value; render(); } },
    h('option', { value: '' }, 'Semua status'), Object.entries(STATUS).map(([v, l]) => h('option', { value: v }, l)));
  fs.value = filter.status;

  const needle = filter.q.trim().toLowerCase();
  const all = houses.slice().sort((a, b) => a.blok.localeCompare(b.blok, 'id') || a.nomor.localeCompare(b.nomor, 'id', { numeric: true }));
  const shown = all.filter((x) => {
    if (filter.blok && x.blok !== filter.blok) return false;
    if (filter.status && x.status !== filter.status) return false;
    if (!needle) return true;
    return [x.blok + '-' + x.nomor, x.blok + ' ' + x.nomor, x.kepala, x.telepon, x.jabatan, x.catatan].join(' ').toLowerCase().includes(needle);
  });
  const mine = profile.rumahId ? houses.find((x) => x.id === profile.rumahId) : null;

  const rows = shown.map((x) => h('li', { class: 'row cols-warga' + (x.id === profile.rumahId ? ' me-row' : '') },
    h('span', { class: 'plate' }, x.blok + '-' + x.nomor),
    h('div', { class: 'who' }, h('div', { class: 'nama' }, x.kepala || 'Belum diisi'), x.jabatan ? h('div', { class: 'sub' }, x.jabatan) : null, x.catatan ? h('div', { class: 'sub' }, x.catatan) : null),
    h('div', null, x.telepon ? h('span', { class: 'mono' }, x.telepon) : h('span', { class: 'sub' }, 'Tanpa nomor')),
    h('div', null, h('span', { class: 'pill ' + x.status }, STATUS[x.status])),
    h('div', { class: 'sub' }, x.jumlah ? x.jumlah + ' jiwa' : '–')));

  mount(
    h('header', { class: 'top' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Perumahan ADIBA 3'), h('h1', null, 'Paguyuban ADIBA 3'), h('div', { class: 'sub' }, 'Masuk sebagai ' + (profile.nama || profile.username))),
      h('div', { class: 'me' },
        h('button', { class: 'btn small', type: 'button', onclick: openPassword }, 'Ganti password'),
        h('button', { class: 'btn small', type: 'button', onclick: () => signOut(auth) }, 'Keluar'))),
    h('section', { class: 'stats' }, stat(houses.length, 'Rumah terdata'), stat(c.dihuni, 'Dihuni pemilik'), stat(c.kontrak, 'Dikontrakkan'), stat(c.kosong, 'Kosong'), stat(jiwa, 'Jiwa tercatat')),
    mine ? h('div', { class: 'mine' }, h('span', { class: 'plate' }, mine.blok + '-' + mine.nomor), h('strong', null, 'Rumah Anda'), h('span', { class: 'sub' }, STATUS[mine.status] + (mine.jumlah ? ', ' + mine.jumlah + ' jiwa' : ''))) : null,
    h('section', { class: 'tools' }, h('div', { class: 'grow' }, q), fb, fs),
    all.length
      ? h('section', { class: 'list' },
          h('div', { class: 'thead cols-warga', 'aria-hidden': 'true' }, h('span', null, 'Rumah'), h('span', null, 'Kepala keluarga'), h('span', null, 'Telepon'), h('span', null, 'Status'), h('span', null, 'Penghuni')),
          h('ul', { class: 'rows' }, rows.length ? rows : h('li', { class: 'row' }, h('div', { class: 'sub' }, 'Tidak ada rumah yang cocok dengan pencarian.'))))
      : h('section', { class: 'list' }, h('div', { class: 'empty' }, h('span', { class: 'plate' }, 'A-1'), h('h2', null, 'Belum ada data'), h('p', null, 'Pengurus belum memasukkan data warga.'))),
    all.length ? h('div', { class: 'sub' }, 'Menampilkan ' + shown.length + ' dari ' + all.length + ' rumah') : null);
  if (keepSearch) { const el = $('#q'); if (el) { el.focus(); el.setSelectionRange(caret, caret); } }
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
    h('label', { class: 'f', for: 'p-baru' }, 'Password baru', h('span', { class: 'hint' }, ' (minimal 6 karakter)'), baru),
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
