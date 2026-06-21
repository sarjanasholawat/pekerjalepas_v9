// ============================================================
//  PEKERJA LEPAS — app.js v3
//  Fitur: kategori proyek, mode stopwatch/WIB, tahun dropdown,
//         kop surat dari admin (read-only user), edit & hapus
// ============================================================

// ==================== SESSION ====================
const plSession = JSON.parse(sessionStorage.getItem('pl_session') || 'null');
if (!plSession) { window.location.href = 'login.html'; }
else if (plSession.role === 'admin') { window.location.href = 'admin.html'; }

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar & topbar user info
  function initials(n){ return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
  if (plSession) {
    const av = initials(plSession.nama);
    ['sb-avatar','topbar-avatar'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=av; });
    ['sb-user-name','topbar-name','user-display-name'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=plSession.nama; });
  }

  // Init form dan data
  initForm();
  loadJobs();
  populateProyekDropdown();
});
function doLogout() { sessionStorage.removeItem('pl_session'); window.location.href = 'login.html'; }

// ==================== KONSTANTA ====================
const HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const KOP_KEY = 'pl_kop_surat';
const TEMPAT_ICON  = { 'Dirumah':'🏠', 'DiKantor':'🏢' };
const TEMPAT_LABEL = { 'Dirumah':'Di Rumah', 'DiKantor':'Di Kantor' };

// ==================== STATE ====================
let jobs = [], filterMonth = 'all', laporanFilter = 'all', laporanFilterKat = 'all', laporanFilterProyek = 'all';
let editJobId = null, hapusTargetId = null;
let timerMode = 'stopwatch'; // 'stopwatch' | 'wib'

// Stopwatch
let swInterval = null, swSec = 0, swRunning = false;
// WIB live clock
let wibClockInterval = null, wibCalcInterval = null;

// ==================== UTILS ====================
const fmtSec = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60; return [h,m,sc].map(v=>String(v).padStart(2,'0')).join(':'); };
const fmtTgl = t => { const d=new Date(t); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
const todayStr = () => new Date().toISOString().slice(0,10);
const parseDurasi = str => { const p=str.split(':').map(Number); return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:parseInt(str)||0; };

// ==================== COMBOBOX NAMA DARI PAPAN TUGAS ====================
function getNamaDropdownItems(filter) {
  const taskList = JSON.parse(localStorage.getItem('pl_tasks') || '[]');
  return taskList
    .filter(t => !filter || t.judul.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 15); // max 15 item
}

function renderNamaDropdown(filter) {
  const list  = document.getElementById('nama-dd-list');
  if (!list) return;
  const items = getNamaDropdownItems(filter);
  if (!items.length) {
    list.innerHTML = `<div class="nama-dd-empty">${filter ? 'Tidak ada tugas yang cocok' : 'Belum ada tugas di Papan Tugas'}</div>`;
    return;
  }

  const STATUS_BADGE = {
    planning: `<span class="nama-dd-status planning">To Do</span>`,
    proses:   `<span class="nama-dd-status proses">In Progress</span>`,
    done:     `<span class="nama-dd-status done">Done</span>`,
  };

  list.innerHTML = items.map(t => `
    <div class="nama-dd-item" onclick="pilihNamaDariTugas('${t.id}')">
      <div class="nama-dd-item-title">${t.judul}</div>
      <div class="nama-dd-item-meta">
        ${STATUS_BADGE[t.status] || ''}
        ${t.projectName ? `<span class="nama-dd-meta-tag">${t.projectName}</span>` : ''}
        ${t.assigneeName ? `<span class="nama-dd-meta-tag">👤 ${t.assigneeName}</span>` : ''}
      </div>
    </div>`).join('');
}

function pilihNamaDariTugas(taskId) {
  const taskList = JSON.parse(localStorage.getItem('pl_tasks') || '[]');
  const t = taskList.find(t => String(t.id) === String(taskId));
  if (!t) return;

  document.getElementById('inp-nama').value = t.judul;

  // Auto-isi proyek jika ada
  if (t.projectName) {
    const sel = document.getElementById('inp-kategori');
    if (sel) {
      const opt = [...sel.options].find(o => o.value === t.projectName);
      if (opt) sel.value = t.projectName;
    }
  }

  hideNamaDropdown();
}

function onNamaInput(val) {
  if (val.trim()) {
    showNamaDropdown();
    renderNamaDropdown(val);
  } else {
    renderNamaDropdown('');
  }
}

function showNamaDropdown() {
  const dd   = document.getElementById('nama-dropdown');
  const list = document.getElementById('nama-dd-list');
  if (!dd || !list) return;
  const val = document.getElementById('inp-nama')?.value || '';
  renderNamaDropdown(val);
  dd.style.display = 'block';
}

function hideNamaDropdown() {
  const dd = document.getElementById('nama-dropdown');
  if (dd) dd.style.display = 'none';
}

function toggleNamaDropdown() {
  const dd = document.getElementById('nama-dropdown');
  if (!dd) return;
  if (dd.style.display === 'none' || dd.style.display === '') {
    showNamaDropdown();
  } else {
    hideNamaDropdown();
  }
}

// Tutup dropdown saat klik di luar — pakai lazy check saat event terjadi
document.addEventListener('click', e => {
  const wrap = document.querySelector('.nama-combo-wrap');
  if (!wrap) return;
  if (!wrap.contains(e.target)) hideNamaDropdown();
}, true); // capture phase agar tidak konflik dengan onclick button
function initForm() {
  const now      = new Date();
  const tglInput = document.getElementById('inp-tgl');
  tglInput.value = now.toISOString().slice(0,10);
  document.getElementById('inp-hari').value = HARI[now.getDay()];

  tglInput.addEventListener('change', function() {
    const d = new Date(this.value);
    document.getElementById('inp-hari').value = HARI[d.getDay()];
  });

  // Populate proyek dropdown dari data proyek yang tersimpan
  populateProyekDropdown();
}

// Isi dropdown proyek di form pekerjaan dari data projects
function populateProyekDropdown() {
  const sel = document.getElementById('inp-kategori');
  if (!sel) return;
  const prjs = JSON.parse(localStorage.getItem('pl_projects') || '[]');
  const cur  = sel.value;
  sel.innerHTML = '<option value="">— Pilih Proyek —</option>';
  prjs.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.nama; opt.textContent = p.nama;
    sel.appendChild(opt);
  });
  // Tambah opsi tanpa proyek
  const noProj = document.createElement('option');
  noProj.value = 'Umum'; noProj.textContent = '📁 Umum / Tanpa Proyek';
  sel.appendChild(noProj);
  if ([...sel.options].find(o=>o.value===cur)) sel.value = cur;
}

// ==================== MODE TIMER ====================
function setMode(mode) {
  timerMode = mode;
  document.getElementById('mode-sw').classList.toggle('active', mode==='stopwatch');
  document.getElementById('mode-wib').classList.toggle('active', mode==='wib');
  document.getElementById('sw-block').style.display  = mode==='stopwatch' ? 'block' : 'none';
  document.getElementById('wib-block').style.display = mode==='wib'       ? 'block' : 'none';

  if (mode === 'wib') {
    startWIBClock();
    // Reset tombol ke state awal
    const btnM = document.getElementById('wib-btn-mulai');
    const btnS = document.getElementById('wib-btn-selesai');
    if (btnM) btnM.disabled = false;
    if (btnS) btnS.disabled = false;
  } else {
    stopWIBClock();
  }
}

// ── Clock WIB live ──
function startWIBClock() {
  stopWIBClock();
  function tick() {
    const now    = new Date();
    const jamStr = wibStr(now) + ':' + String(new Date(now.getTime() + 7*3600000).getUTCSeconds()).padStart(2,'0');
    const el = document.getElementById('jam-wib-live');
    if (el) el.textContent = jamStr;
    const selesai = document.getElementById('wib-selesai')?.value;
    if (!selesai) hitungDurasiWIB();
  }
  tick();
  wibClockInterval = setInterval(tick, 1000);
}

function stopWIBClock() {
  if (wibClockInterval) { clearInterval(wibClockInterval); wibClockInterval = null; }
}

// ── Ambil jam WIB sekarang ──
function getWIBNow() {
  return new Date(); // raw Date — konversi ke WIB dilakukan di wibStr
}

function wibStr(d) {
  // WIB = UTC + 7 jam
  // Tambah 7h ke timestamp, lalu baca getUTCHours — benar untuk semua timezone browser
  const wibMs   = d.getTime() + 7 * 3600000;
  const wibDate = new Date(wibMs);
  return String(wibDate.getUTCHours()).padStart(2,'0') + ':' + String(wibDate.getUTCMinutes()).padStart(2,'0');
}

// Sinkronkan semua elemen WIB (hidden input, time input, durasi)
function wibSyncUI() {
  const mulai   = document.getElementById('wib-mulai')?.value   || '';
  const selesai = document.getElementById('wib-selesai')?.value || '';

  const mulaiTime   = document.getElementById('wib-mulai-time');
  const selesaiTime = document.getElementById('wib-selesai-time');
  if (mulaiTime   && mulaiTime.value   !== mulai)   mulaiTime.value   = mulai;
  if (selesaiTime && selesaiTime.value !== selesai) selesaiTime.value = selesai;

  hitungDurasiWIB();
}

// Input manual dari time picker
function wibManualInput(jenis, val) {
  if (!val) return;
  const hiddenId = jenis === 'mulai' ? 'wib-mulai' : 'wib-selesai';
  const hidden   = document.getElementById(hiddenId);
  if (hidden) hidden.value = val;
  hitungDurasiWIB();
}

// Tombol "Sekarang" — catat jam WIB saat ini ke mulai
function wibCatatMulai() {
  const wib = getWIBNow();
  const jam  = wibStr(wib);
  const hiddenMulai  = document.getElementById('wib-mulai');
  const timeMulai    = document.getElementById('wib-mulai-time');
  const hiddenSelesai= document.getElementById('wib-selesai');
  const timeSelesai  = document.getElementById('wib-selesai-time');

  if (hiddenMulai)  hiddenMulai.value  = jam;
  if (timeMulai)    timeMulai.value    = jam;
  // Reset selesai
  if (hiddenSelesai) hiddenSelesai.value = '';
  if (timeSelesai)   timeSelesai.value   = '';
  document.getElementById('wib-durasi-display').textContent = '00:00:00';

  document.getElementById('wib-btn-mulai').disabled  = true;
  document.getElementById('wib-btn-selesai').disabled = false;
  showToast('Jam mulai: ' + jam);
}

// Tombol "Sekarang" — catat jam WIB saat ini ke selesai
function wibCatatSelesai() {
  const mulai = document.getElementById('wib-mulai')?.value;
  if (!mulai) { showToast('Isi jam mulai terlebih dahulu', 'error'); return; }
  const wib  = getWIBNow();
  const jam  = wibStr(wib);
  const hiddenSelesai = document.getElementById('wib-selesai');
  const timeSelesai   = document.getElementById('wib-selesai-time');
  if (hiddenSelesai) hiddenSelesai.value = jam;
  if (timeSelesai)   timeSelesai.value   = jam;
  hitungDurasiWIB();
  document.getElementById('wib-btn-selesai').disabled = true;
  showToast('Jam selesai: ' + jam);
}

function wibReset() {
  ['wib-mulai','wib-selesai'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['wib-mulai-time','wib-selesai-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dur = document.getElementById('wib-durasi-display');
  if (dur) dur.textContent = '00:00:00';
  const btnM = document.getElementById('wib-btn-mulai');
  const btnS = document.getElementById('wib-btn-selesai');
  if (btnM) btnM.disabled = false;
  if (btnS) btnS.disabled = false;
}

function hitungDurasiWIB() {
  const mulai   = document.getElementById('wib-mulai')?.value   || '';
  const selesai = document.getElementById('wib-selesai')?.value || '';
  if (!mulai) return;
  const [mh, mm] = mulai.split(':').map(Number);
  let totalSec;
  if (selesai) {
    const [sh, sm] = selesai.split(':').map(Number);
    let diff = (sh * 60 + sm) - (mh * 60 + mm);
    if (diff < 0) diff += 24 * 60;
    totalSec = diff * 60;
  } else {
    // Hitung sampai sekarang dalam WIB
    const now    = new Date();
    const wibMs  = now.getTime() + 7 * 3600000;
    const wibNow = new Date(wibMs);
    let diff = (wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()) - (mh * 60 + mm);
    if (diff < 0) diff = 0;
    totalSec = diff * 60 + wibNow.getUTCSeconds();
  }
  const dur = document.getElementById('wib-durasi-display');
  if (dur) dur.textContent = fmtSec(Math.max(0, totalSec));
}

function getDurasi() {
  // Edit mode: ambil dari hidden input yang diisi editHitungDurasi
  const editWrap = document.getElementById('edit-durasi-wrap');
  const isEditing = editJobId || (editWrap && editWrap.style.display === 'block');
  if (isEditing) {
    const hidden = document.getElementById('inp-durasi-edit');
    const val    = hidden ? hidden.value.trim() : '';
    // Nilai bisa berupa angka detik (dari editHitungDurasi) atau format HH:MM:SS lama
    const asInt = parseInt(val);
    if (!isNaN(asInt) && String(asInt) === val) return asInt; // angka detik
    return parseDurasi(val); // format HH:MM:SS
  }
  // Stopwatch mode: ambil swSec (bisa running, paused, atau stopped)
  if (timerMode === 'stopwatch') return swSec;
  // WIB mode: hitung dari hidden input (terisi oleh tombol atau input manual)
  const mulai   = document.getElementById('wib-mulai')?.value   || '';
  const selesai = document.getElementById('wib-selesai')?.value || '';
  if (!mulai) return 0;
  const [mh, mm] = mulai.split(':').map(Number);
  if (selesai) {
    const [sh, sm] = selesai.split(':').map(Number);
    let diff = (sh * 60 + sm) - (mh * 60 + mm);
    if (diff < 0) diff += 24 * 60;
    return diff * 60;
  }
  const dispEl = document.getElementById('wib-durasi-display');
  return dispEl ? parseDurasi(dispEl.textContent) : 0;
}

// ==================== STOPWATCH ====================
// State: idle | running | paused | stopped
let swState = 'idle'; // idle | running | paused | stopped

function swUpdateUI() {
  const btnMulai = document.getElementById('btn-mulai');
  const btnPause = document.getElementById('btn-pause');
  const badge    = document.getElementById('sw-state-badge');
  if (!btnMulai) return; // elemen belum ada di DOM

  switch (swState) {
    case 'idle':
      btnMulai.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><polygon points="4,2 14,8 4,14" fill="currentColor"/></svg> Mulai`;
      btnMulai.className = 'sw-btn btn-mulai';
      btnMulai.disabled  = false;
      if (btnPause) btnPause.disabled = true;
      if (badge)  { badge.style.display = 'none'; }
      break;

    case 'running':
      btnMulai.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><polygon points="4,2 14,8 4,14" fill="currentColor"/></svg> Berjalan...`;
      btnMulai.className = 'sw-btn btn-mulai';
      btnMulai.disabled  = true;
      if (btnPause) btnPause.disabled = false;
      if (badge)  { badge.textContent = '⏱ Sedang berjalan'; badge.className = 'sw-state-badge sw-running'; badge.style.display = 'block'; }
      break;

    case 'paused':
      btnMulai.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><polygon points="4,2 14,8 4,14" fill="currentColor"/></svg> Lanjut`;
      btnMulai.className = 'sw-btn btn-mulai';
      btnMulai.disabled  = false;
      if (btnPause) btnPause.disabled = true;
      if (badge)  { badge.textContent = '⏸ Dijeda — ' + fmtSec(swSec); badge.className = 'sw-state-badge sw-paused'; badge.style.display = 'block'; }
      break;

    case 'stopped':
      btnMulai.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><polygon points="4,2 14,8 4,14" fill="currentColor"/></svg> Mulai Ulang`;
      btnMulai.className = 'sw-btn btn-mulai';
      btnMulai.disabled  = false;
      if (btnPause) btnPause.disabled = true;
      if (badge)  { badge.textContent = `⏹ Selesai — ${fmtSec(swSec)}`; badge.className = 'sw-state-badge sw-stopped'; badge.style.display = 'block'; }
      break;
  }
}

function swMulai() {
  if (swState === 'running') return;
  swState   = 'running';
  swRunning = true;
  swInterval = setInterval(() => {
    swSec++;
    document.getElementById('sw-display').textContent = fmtSec(swSec);
  }, 1000);
  swUpdateUI();
}

function swPause() {
  if (swState !== 'running') return;
  clearInterval(swInterval);
  swRunning = false;
  swState   = 'paused';
  swUpdateUI();
}

function swStop() {
  if (swState === 'idle') return;
  clearInterval(swInterval);
  swRunning = false;
  swState   = 'stopped';
  swUpdateUI();
}

function swReset() {
  clearInterval(swInterval);
  swRunning = false;
  swState   = 'idle';
  swSec     = 0;
  const disp = document.getElementById('sw-display');
  if (disp) disp.textContent = '00:00:00';
  swUpdateUI();
}

// Tetap ada swToggle untuk kompatibilitas (tidak dipakai langsung)
function swToggle() { swState === 'running' ? swPause() : swMulai(); }

// ==================== PROYEK / KATEGORI ====================
function onKategoriChange(val) {} // tidak dipakai, dibiarkan agar tidak error
function konfirmasiKategori() {}
function getKategori() {
  const sel = document.getElementById('inp-kategori');
  return sel ? (sel.value || '—') : '—';
}

// ==================== LOAD DATA ====================
// ── KEY localStorage per user ──
const LOCAL_JOBS_KEY = () => `pl_jobs_u${plSession?.id || 'x'}`;

// ── Simpan jobs ke localStorage TANPA migrasi (data sudah benar) ──
function saveJobsLocal(jobsList) {
  localStorage.setItem(LOCAL_JOBS_KEY(), JSON.stringify(jobsList));
}

// ── Migrasi HANYA untuk data lama yang belum punya field baru ──
function migrasiJam(jobsList) {
  const tempatValid = ['Dirumah', 'DiKantor'];
  return jobsList.map(j => {
    const rawTempat = j.tempat || j.tahun || '';
    let tempat = String(rawTempat).trim();
    if (!tempatValid.includes(tempat)) tempat = 'Dirumah';
    // Normalisasi wibMulai/wibSelesai: konversi ISO string ke HH:MM
    const wibMulai   = parseJam(j.wibMulai);
    const wibSelesai = parseJam(j.wibSelesai);
    return { ...j, tempat, wibMulai, wibSelesai };
  });
}

// ── Load jobs ──
async function loadJobs() {
  const apiReady = typeof API_URL !== 'undefined' && !API_URL.includes('GANTI_DENGAN');

  if (apiReady) {
    try {
      const res = await API.getJobs(plSession.id);
      if (res.success && res.data) {
        const local    = JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY()) || '[]');
        const localMap = {};
        local.forEach(j => { localMap[String(j.id)] = j; });
        jobs = migrasiJam(res.data.map(j => {
          const loc = localMap[String(j.id)] || {};
          return {
            ...j,
            wibMulai:   j.wibMulai   || loc.wibMulai   || '',
            wibSelesai: j.wibSelesai || loc.wibSelesai || '',
            tempat:     j.tempat      || loc.tempat      || 'Dirumah',
            kategori:   j.kategori   || loc.kategori   || '',
          };
        }));
        saveJobsLocal(jobs);
        renderDash(); renderPekList(); updateKategoriFilter();
        return;
      }
    } catch(_) {}
  }

  // Fallback localStorage — baca langsung, hanya normalisasi tempat
  const raw = JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY()) || '[]');

  jobs = raw.map(j => {
    const rawTempat = j.tempat || j.tahun || '';
    const tempat = ['Dirumah', 'DiKantor'].includes(String(rawTempat).trim())
      ? String(rawTempat).trim()
      : 'Dirumah';
    // Normalisasi wibMulai/wibSelesai ke HH:MM (handle ISO string lama)
    const wibMulai   = parseJam(j.wibMulai);
    const wibSelesai = parseJam(j.wibSelesai);
    return { ...j, tempat, wibMulai, wibSelesai };
  });

  renderDash();
  renderPekList();
  updateKategoriFilter();
}

function updateKategoriFilter() {
  const sel = document.getElementById('laporan-filter-kategori');
  if (!sel) return;
  const kats = [...new Set(jobs.map(j => j.kategori).filter(Boolean))];
  const cur  = sel.value;
  sel.innerHTML = '<option value="all">Semua Kategori</option>';
  kats.forEach(k => {
    const o = document.createElement('option');
    o.value = k; o.textContent = k;
    sel.appendChild(o);
  });
  if ([...sel.options].find(o => o.value === cur)) sel.value = cur;
}

// ==================== NAVIGASI ====================
function showPage(p) {
  // Update sidebar active state
  document.querySelectorAll('.sb-nav-item').forEach(b => b.classList.remove('active'));
  const nb = document.getElementById('nav-' + p);
  if (nb) nb.classList.add('active');

  // Update topbar title
  const titles = {
    dashboard : 'Dashboard',
    pekerjaan : 'Pekerjaan',
    laporan   : 'Laporan PDF',
    proyek    : 'Proyek',
    kanban    : 'Papan Tugas',
    invoice   : 'Cetak Pembayaran'
  };
  if (window._setTopbarTitle) window._setTopbarTitle(titles[p] || p);

  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById(p).classList.add('active');

  if (p === 'dashboard') renderDash();
  if (p === 'pekerjaan') { cancelEdit(); renderPekList(); populateProyekDropdown(); swUpdateUI(); }
  if (p === 'laporan')   renderLaporan();
  if (p === 'proyek')    { if (typeof initProjectsPage !== 'undefined') initProjectsPage(); }
  if (p === 'kanban')    { if (typeof initKanbanPage   !== 'undefined') initKanbanPage(); }
  if (p === 'invoice')   { if (typeof initInvoicePage  !== 'undefined') initInvoicePage(); }
  if (p !== 'pekerjaan') stopWIBClock();
}

// ==================== SIMPAN / UPDATE ====================
async function savePekerjaan() {
  // Capture editJobId di awal — sebelum apapun bisa mengubahnya saat proses async
  const currentEditId = editJobId;

  const nama = document.getElementById('inp-nama').value.trim();
  const tgl  = document.getElementById('inp-tgl').value;
  const hari = document.getElementById('inp-hari').value;
  const selTempat = document.getElementById('inp-tempat');
  const tempat    = (selTempat ? (selTempat.options[selTempat.selectedIndex]?.value || selTempat.value) : 'Dirumah').trim();
  const kat  = getKategori();

  if (!nama) { showToast('Nama pekerjaan wajib diisi','error'); return; }

  const durasi = getDurasi();
  if (durasi === null || durasi === undefined || isNaN(durasi)) {
    showToast('Durasi tidak valid. Gunakan format HH:MM:SS', 'error');
    return;
  }

  // Hentikan stopwatch otomatis saat simpan jika masih running/paused
  if (timerMode === 'stopwatch' && (swState === 'running' || swState === 'paused')) {
    swStop();
  }

  // ── Jam mulai & selesai ──
  let wibMulai = '', wibSelesai = '';

  if (currentEditId) {
    // Edit: ambil dari input jam mulai/selesai yang baru (bisa diubah user)
    wibMulai   = document.getElementById('edit-wib-mulai')?.value   || '';
    wibSelesai = document.getElementById('edit-wib-selesai')?.value || '';
  } else if (timerMode === 'wib') {
    // Mode WIB: ambil dari hidden input yang diisi tombol/input manual
    wibMulai   = document.getElementById('wib-mulai')?.value   || '';
    wibSelesai = document.getElementById('wib-selesai')?.value || '';
  }
  // Mode stopwatch: biarkan wibMulai/wibSelesai kosong,
  // tampilkan durasi saja di laporan (lebih akurat dari rekayasa jam)
  const job = {
    id: currentEditId || ('JOB_' + Date.now()),
    userId: plSession.id,
    nama, tgl, hari,
    tempat,       // tempat kerja: 'Dirumah' | 'DiKantor'
    durasi,
    status: 'selesai',
    kategori: kat,
    wibMulai,
    wibSelesai,
    createdAt: new Date().toISOString()
  };

  const btn = document.getElementById('btn-simpan');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  try {
    // ── Simpan ke localStorage (utama — semua field tersimpan) ──
    let localJobs = JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY()) || '[]');
    if (currentEditId) {
      localJobs = localJobs.filter(j => String(j.id) !== String(currentEditId));
    }
    localJobs.unshift(job);
    saveJobsLocal(localJobs);

    // ── Kirim ke API jika tersedia ──
    try {
      if (currentEditId) await API.deleteJob(plSession.id, currentEditId).catch(()=>{});
      await API.saveJob(plSession.id, { ...job }).catch(()=>{});
    } catch(_) { /* API tidak tersedia — data sudah aman di localStorage */ }

    showToast(currentEditId ? 'Pekerjaan diperbarui!' : 'Pekerjaan disimpan!');
    cancelEdit();
    document.getElementById('inp-nama').value     = '';
    document.getElementById('inp-kategori').value = '';
    swReset();
    await loadJobs();
  } catch(err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px"><path d="M13 5l-6 6-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Simpan Pekerjaan`;
  }
}

// Hitung durasi otomatis saat edit jam mulai/selesai diubah
function editHitungDurasi() {
  const mulai   = document.getElementById('edit-wib-mulai')?.value   || '';
  const selesai = document.getElementById('edit-wib-selesai')?.value || '';
  const display = document.getElementById('edit-durasi-display');
  const hidden  = document.getElementById('inp-durasi-edit');

  if (!mulai || !selesai) {
    if (display) display.textContent = '00:00:00';
    if (hidden)  hidden.value = '0';
    return;
  }

  const [mh, mm] = mulai.split(':').map(Number);
  const [sh, sm] = selesai.split(':').map(Number);
  let diff = (sh * 60 + sm) - (mh * 60 + mm);
  if (diff < 0) diff += 24 * 60;
  const totalSec = diff * 60;

  if (display) display.textContent = fmtSec(totalSec);
  if (hidden)  hidden.value = String(totalSec); // simpan dalam detik
}

// ==================== EDIT ====================
function openEdit(id) {
  const j = jobs.find(j => String(j.id) === String(id));
  if (!j) return;
  editJobId = id;

  // Pindah ke halaman pekerjaan dulu (akan trigger cancelEdit → reset form)
  showPage('pekerjaan');

  // Set nilai form di tick berikutnya agar tidak tertimpa reset dari cancelEdit
  setTimeout(() => {
    // PENTING: restore editJobId karena cancelEdit() sudah mereset ke null
    editJobId = id;

    document.getElementById('inp-nama').value = j.nama;
    document.getElementById('inp-tgl').value  = j.tgl;
    document.getElementById('inp-hari').value = j.hari;

    const twEl = document.getElementById('inp-tempat');
    if (twEl) {
      twEl.value = j.tempat || 'Dirumah';
      // Force DOM update
      twEl.dispatchEvent(new Event('change'));
    }

    const selKat = document.getElementById('inp-kategori');
    if (selKat) {
      const ex = [...selKat.options].find(o => o.value === j.kategori);
      if (!ex && j.kategori && j.kategori !== '—') {
        const o = document.createElement('option');
        o.value = j.kategori; o.textContent = j.kategori;
        selKat.appendChild(o);
      }
      selKat.value = j.kategori || '';
    }

    // Nonaktifkan mode toggle
    const mg = document.querySelector('.mode-toggle')?.closest('.form-group');
    if (mg) { mg.style.opacity = '0.4'; mg.style.pointerEvents = 'none'; }
    document.getElementById('sw-block').style.display  = 'none';
    document.getElementById('wib-block').style.display = 'none';

    document.getElementById('edit-durasi-wrap').style.display = 'block';

    // Isi jam mulai & selesai jika ada
    const editMulai   = document.getElementById('edit-wib-mulai');
    const editSelesai = document.getElementById('edit-wib-selesai');
    const editHidden  = document.getElementById('inp-durasi-edit');
    const editDisplay = document.getElementById('edit-durasi-display');

    if (editMulai)   editMulai.value   = j.wibMulai   || '';
    if (editSelesai) editSelesai.value = j.wibSelesai || '';
    if (editHidden)  editHidden.value  = String(j.durasi || 0);
    if (editDisplay) editDisplay.textContent = fmtSec(j.durasi || 0);

    document.getElementById('btn-batal-edit').style.display = 'inline-flex';
    document.getElementById('form-title-label').textContent  = '✏️ Edit Pekerjaan';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 50); // 50ms cukup untuk DOM selesai render
}

function cancelEdit() {
  editJobId = null;

  // Aktifkan kembali mode toggle
  const modeGroup = document.querySelector('.mode-toggle')?.closest('.form-group');
  if (modeGroup) {
    modeGroup.style.opacity       = '';
    modeGroup.style.pointerEvents = '';
    modeGroup.title = '';
  }

  document.getElementById('sw-block').style.display  = timerMode === 'stopwatch' ? 'block' : 'none';
  document.getElementById('wib-block').style.display = timerMode === 'wib'        ? 'block' : 'none';

  // Bersihkan field edit jam
  const editMulai   = document.getElementById('edit-wib-mulai');
  const editSelesai = document.getElementById('edit-wib-selesai');
  const editDisplay = document.getElementById('edit-durasi-display');
  const editHidden  = document.getElementById('inp-durasi-edit');
  if (editMulai)   editMulai.value   = '';
  if (editSelesai) editSelesai.value = '';
  if (editDisplay) editDisplay.textContent = '00:00:00';
  if (editHidden)  editHidden.value  = '';

  document.getElementById('edit-durasi-wrap').style.display = 'none';
  document.getElementById('btn-batal-edit').style.display   = 'none';
  document.getElementById('form-title-label').textContent   = 'Input Pekerjaan Baru';

  if (timerMode === 'wib') wibReset();
}

// ==================== HAPUS ====================
function openHapus(id) {
  const j=jobs.find(j=>String(j.id)===String(id));
  hapusTargetId=id;
  document.getElementById('hapus-target-nama').textContent=j?j.nama:'';
  document.getElementById('modal-hapus').classList.add('show');
}
async function confirmHapus() {
  try {
    // Hapus dari localStorage dulu
    let localJobs = JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY()) || '[]');
    localJobs = localJobs.filter(j => String(j.id) !== String(hapusTargetId));
    saveJobsLocal(localJobs);
    // Coba hapus dari API juga
    await API.deleteJob(plSession.id, hapusTargetId).catch(()=>{});
    closeModal('modal-hapus');
    showToast('Pekerjaan dihapus');
    await loadJobs();
  } catch(err) { showToast('Error: '+err.message,'error'); }
}

// ==================== RENDER ROW ====================
function katBadge(k) {
  return `<span class="badge badge-done" style="font-size:10.5px;white-space:nowrap">${k||'—'}</span>`;
}
function actionBtns(id) {
  return `<div style="display:flex;gap:4px">
    <button class="btn-icon" onclick="openEdit('${id}')" title="Edit"><svg viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg></button>
    <button class="btn-icon danger" onclick="openHapus('${id}')" title="Hapus"><svg viewBox="0 0 16 16" fill="none"><path d="M3 5h10M6 5V3h4v2M6 8v5M10 8v5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
  </div>`;
}
// Normalize jam ke format HH:MM — HANYA terima format HH:MM/HH:MM:SS yang valid
// Data lama yang tersimpan sebagai ISO string (dari bug versi sebelumnya) sudah korup
// dan tidak bisa direkonstruksi dengan benar — lebih baik dianggap kosong daripada
// menampilkan jam yang salah dengan percaya diri.
function parseJam(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  return ''; // format tidak dikenali (misal ISO string lama) — kosongkan
}

function renderRow(j) {
  const icon      = TEMPAT_ICON[j.tempat]  || '';
  const label     = TEMPAT_LABEL[j.tempat] || j.tempat || '—';
  const tempatStr = `${icon} ${label}`.trim();

  // Jam kerja: prioritaskan jam WIB, fallback ke durasi
  const mulaiStr   = parseJam(j.wibMulai);
  const selesaiStr = parseJam(j.wibSelesai);
  let jamStr, jamStyle = '', jamTitle = '';
  if (mulaiStr && selesaiStr) {
    jamStr = `${mulaiStr} – ${selesaiStr}`;
  } else if (mulaiStr) {
    jamStr = `${mulaiStr} – (belum)`;
  } else {
    jamStr   = fmtSec(j.durasi || 0);
    jamStyle = 'color:var(--gray-400);font-size:11px';
    jamTitle = 'title="Jam belum tercatat — klik Edit untuk mengisi Jam Mulai/Selesai"';
  }

  return `<tr>
    <td title="${j.nama}">${j.nama}</td>
    <td>${katBadge(j.kategori)}</td>
    <td>${fmtTgl(j.tgl)}</td>
    <td style="font-family:var(--mono);font-size:12px;white-space:nowrap;${jamStyle}" ${jamTitle}>${jamStr}</td>
    <td style="font-family:var(--mono);font-size:12px">${fmtSec(j.durasi)}</td>
    <td style="font-size:12px;white-space:nowrap">${tempatStr}</td>
    <td>${actionBtns(j.id)}</td>
  </tr>`;
}


// ============================================================
//  GRAFIK DASHBOARD — Chart.js
// ============================================================

let chartInstance = null;
let chartPeriod   = 'mingguan';

const CHART_COLORS = ['#1a6fca','#1D9E75','#F5C842','#E05C3A','#8B5CF6'];

function setChartPeriod(p) {
  chartPeriod = p;
  ['mingguan','bulanan','tahunan'].forEach(x => {
    document.getElementById('tab-'+x)?.classList.toggle('active', x===p);
  });
  renderChart();
}
function setChartType() { renderChart(); } // kompatibilitas

function initChartYearSelector() {
  const sel = document.getElementById('chart-year-sel');
  if (!sel) return;
  const now   = new Date().getFullYear();
  const years = [...new Set(jobs.map(j => new Date(j.tgl).getFullYear()))].sort((a,b)=>b-a);
  if (!years.includes(now)) years.unshift(now);
  const cur = sel.value || String(now);
  sel.innerHTML = years.map(y => `<option value="${y}" ${String(y)===cur?'selected':''}>${y}</option>`).join('');
}

function renderChart() {
  const canvas  = document.getElementById('main-chart');
  const emptyEl = document.getElementById('chart-empty');
  const legendEl= document.getElementById('chart-legend');
  if (!canvas) return;

  const year = parseInt(document.getElementById('chart-year-sel')?.value) || new Date().getFullYear();

  let labels = [], counts = [], durations = [];

  if (chartPeriod === 'tahunan') {
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 4; y <= thisYear; y++) {
      labels.push(String(y));
      const jj = jobs.filter(j => new Date(j.tgl).getFullYear() === y);
      counts.push(jj.length);
      durations.push(+(jj.reduce((a,b)=>a+b.durasi,0)/3600).toFixed(1));
    }
  } else if (chartPeriod === 'bulanan') {
    for (let m = 0; m < 12; m++) {
      labels.push(BULAN_SHORT[m]);
      const jj = jobs.filter(j => { const d=new Date(j.tgl); return d.getFullYear()===year && d.getMonth()===m; });
      counts.push(jj.length);
      durations.push(+(jj.reduce((a,b)=>a+b.durasi,0)/3600).toFixed(1));
    }
  } else {
    const now = new Date();
    for (let w = 7; w >= 0; w--) {
      const ws = new Date(now); ws.setDate(now.getDate()-w*7-now.getDay()); ws.setHours(0,0,0,0);
      const we = new Date(ws); we.setDate(ws.getDate()+6); we.setHours(23,59,59,999);
      labels.push(`${ws.getDate()}/${ws.getMonth()+1}`);
      const jj = jobs.filter(j => { const d=new Date(j.tgl); return d>=ws && d<=we; });
      counts.push(jj.length);
      durations.push(+(jj.reduce((a,b)=>a+b.durasi,0)/3600).toFixed(1));
    }
  }

  const hasData = counts.some(c=>c>0);
  if (emptyEl) { emptyEl.style.display = hasData?'none':'flex'; }
  if (canvas)  { canvas.style.display  = hasData?'block':'none'; }
  if (!hasData) { if(legendEl) legendEl.innerHTML=''; return; }

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  const ctx = canvas.getContext('2d');

  // Gradient biru untuk pekerjaan
  const gradBlue = ctx.createLinearGradient(0, 0, 0, 280);
  gradBlue.addColorStop(0,   'rgba(26,111,202,0.25)');
  gradBlue.addColorStop(0.6, 'rgba(26,111,202,0.05)');
  gradBlue.addColorStop(1,   'rgba(26,111,202,0)');

  // Gradient hijau untuk durasi
  const gradGreen = ctx.createLinearGradient(0, 0, 0, 280);
  gradGreen.addColorStop(0,   'rgba(29,158,117,0.2)');
  gradGreen.addColorStop(0.6, 'rgba(29,158,117,0.04)');
  gradGreen.addColorStop(1,   'rgba(29,158,117,0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Jumlah Pekerjaan',
          data: counts,
          borderColor: '#1a6fca',
          backgroundColor: gradBlue,
          borderWidth: 2.5,
          fill: true,
          tension: 0.45,
          pointBackgroundColor: '#1a6fca',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: '#1a6fca',
          yAxisID: 'y',
        },
        {
          label: 'Durasi (jam)',
          data: durations,
          borderColor: '#1D9E75',
          backgroundColor: gradGreen,
          borderWidth: 2.5,
          fill: true,
          tension: 0.45,
          pointBackgroundColor: '#1D9E75',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: '#1D9E75',
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(12,44,80,0.92)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          padding: 12,
          cornerRadius: 10,
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: c => c.datasetIndex===0
              ? `  📋 ${c.raw} pekerjaan`
              : `  ⏱ ${c.raw} jam kerja`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
          ticks: { font: { size: 11, family: 'Plus Jakarta Sans' }, color: '#8BA5C4', maxRotation: 0 }
        },
        y: {
          type: 'linear', position: 'left',
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
          ticks: {
            stepSize: 1,
            font: { size: 11, family: 'Plus Jakarta Sans' },
            color: '#1a6fca',
            callback: v => v + ' pek'
          }
        },
        y1: {
          type: 'linear', position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: {
            font: { size: 11, family: 'Plus Jakarta Sans' },
            color: '#1D9E75',
            callback: v => v + ' jam'
          }
        }
      }
    }
  });

  if (legendEl) {
    legendEl.innerHTML = `
      <div class="legend-item"><div class="legend-dot" style="background:#1a6fca"></div> Jumlah Pekerjaan</div>
      <div class="legend-item"><div class="legend-dot" style="background:#1D9E75"></div> Durasi (jam)</div>`;
  }
}



// ==================== DASHBOARD ====================
function renderDash() {
  const fl=filterMonth==='all'?jobs:jobs.filter(j=>new Date(j.tgl).getMonth()===parseInt(filterMonth));
  const totalSec=fl.reduce((a,b)=>a+b.durasi,0);
  const today=todayStr();
  document.getElementById('stat-grid').innerHTML=`
    <div class="stat"><div class="stat-label">Total Pekerjaan</div><div class="stat-val">${fl.length}</div></div>
    <div class="stat"><div class="stat-label">Total Durasi</div><div class="stat-val" style="font-size:18px">${fmtSec(totalSec)}</div></div>
    <div class="stat"><div class="stat-label">Hari Ini</div><div class="stat-val">${jobs.filter(j=>j.tgl===today).length}</div></div>
  `;
  const months=[...new Set(jobs.map(j=>new Date(j.tgl).getMonth()))].sort((a,b)=>a-b);
  let fr=`<button class="fbtn ${filterMonth==='all'?'active':''}" onclick="setFilter('all')">Semua</button>`;
  months.forEach(m=>{fr+=`<button class="fbtn ${filterMonth==m?'active':''}" onclick="setFilter(${m})">${BULAN[m]}</button>`;});
  document.getElementById('filter-row').innerHTML=fr;
  document.getElementById('dash-tbody').innerHTML=fl.length?fl.map(renderRow).join(''):`<tr><td colspan="7" class="empty">Belum ada data</td></tr>`;

  // Render grafik
  initChartYearSelector();
  renderChart();
}
function setFilter(m){filterMonth=m;renderDash();}

// ==================== DAFTAR PEKERJAAN ====================
function renderPekList(){
  document.getElementById('pek-tbody').innerHTML=jobs.length?jobs.map(renderRow).join(''):`<tr><td colspan="7" class="empty">Belum ada data</td></tr>`;
}

// ==================== KOP SURAT DARI ADMIN ====================
function loadKopFromAdmin() {
  const kop = JSON.parse(localStorage.getItem(KOP_KEY) || 'null');
  if (!kop) return;
  const set = (id, val) => { const el=document.getElementById(id); if(el && val) el.textContent=val; };
  set('rpt-nama',  kop.nama);
  set('rpt-alamat',kop.alamat);
  set('rpt-judul', kop.judul);
  set('rpt-kota1', kop.kota1);
  set('rpt-kota2', kop.kota2);
  set('rpt-ttd1',  kop.ttd1);
  set('rpt-ttd2',  kop.ttd2);
  set('rpt-jab1',  kop.jab1);
  set('rpt-jab2',  kop.jab2);
  if (kop.logo) document.getElementById('logo-display').innerHTML = `<img src="${kop.logo}" alt="logo">`;
  // Tampilkan gambar tanda tangan
  ['ttd1','ttd2'].forEach((id, idx) => {
    const spaceEl = document.getElementById(idx===0 ? 'rpt-ttd-space1' : 'rpt-ttd-space2');
    if (spaceEl && kop[id+'Img']) {
      spaceEl.innerHTML = `<img src="${kop[id+'Img']}" style="max-height:58px;max-width:140px;object-fit:contain;margin:4px auto;display:block" alt="ttd">`;
      spaceEl.style.borderBottom = 'none';
    } else if (spaceEl) {
      spaceEl.innerHTML = '';
      spaceEl.style.borderBottom = '1px solid var(--gray-200)';
    }
  });
}

// ==================== LAPORAN ====================
function renderLaporan() {
  loadKopFromAdmin();
  const now=new Date();
  const tglStr=`${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
  ['ttd-tgl-1','ttd-tgl-2'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=tglStr;});

  // Filter bulan
  const months=[...new Set(jobs.map(j=>new Date(j.tgl).getMonth()))].sort((a,b)=>a-b);
  let fr=`<button class="fbtn ${laporanFilter==='all'?'active':''}" onclick="setLaporanFilter('all')">Semua</button>`;
  months.forEach(m=>{fr+=`<button class="fbtn ${laporanFilter==m?'active':''}" onclick="setLaporanFilter(${m})">${BULAN[m]}</button>`;});
  document.getElementById('laporan-filter').innerHTML=fr;

  updateKategoriFilter();

  let fl = laporanFilter === 'all' ? jobs : jobs.filter(j => new Date(j.tgl).getMonth() === parseInt(laporanFilter));
  if (laporanFilterProyek !== 'all') fl = fl.filter(j => (j.kategori || '—') === laporanFilterProyek);
  if (laporanFilterKat    !== 'all') fl = fl.filter(j => (j.kategori || '—') === laporanFilterKat);

  // Populate dropdown proyek dari semua kategori/proyek yang ada di data
  const selPrj = document.getElementById('laporan-filter-proyek');
  if (selPrj) {
    const proyeks = [...new Set(jobs.map(j => j.kategori).filter(v => v && v !== '—'))];
    const curPrj  = laporanFilterProyek;
    selPrj.innerHTML = '<option value="all">Semua Proyek</option>';
    proyeks.forEach(k => {
      const o = document.createElement('option');
      o.value = k; o.textContent = k;
      if (k === curPrj) o.selected = true;
      selPrj.appendChild(o);
    });
  }

  const periodeLabel = laporanFilter === 'all'
    ? 'Semua Periode'
    : `${BULAN[parseInt(laporanFilter)]} ${now.getFullYear()}`;
  const proyekLabel  = laporanFilterProyek !== 'all' ? ` | Proyek: ${laporanFilterProyek}` : '';
  document.getElementById('report-period').textContent = 'Periode: ' + periodeLabel + proyekLabel;
  document.getElementById('report-no').textContent='LAP/'+now.getFullYear()+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+String(fl.length||1).padStart(3,'0');
  const totalSec=fl.reduce((a,b)=>a+b.durasi,0);
  const today=todayStr();
  document.getElementById('rstat-grid').innerHTML=`
    <div class="rstat"><div class="rstat-label">Total Pekerjaan</div><div class="rstat-val">${fl.length}</div></div>
    <div class="rstat"><div class="rstat-label">Total Durasi</div><div class="rstat-val" style="font-size:14px">${fmtSec(totalSec)}</div></div>
    <div class="rstat"><div class="rstat-label">Hari Ini</div><div class="rstat-val">${jobs.filter(j=>j.tgl===today).length}</div></div>
  `;
  document.getElementById('print-tbody').innerHTML = fl.length
    ? fl.map((j, i) => {
        const durSec     = j.durasi || 0;
        const jamMulai   = parseJam(j.wibMulai);
        const jamSelesai = parseJam(j.wibSelesai);
        const jamStr     = (jamMulai && jamSelesai)
          ? `${jamMulai} – ${jamSelesai}`
          : jamMulai ? `${jamMulai} – ...` : fmtSec(durSec);
        const tIcon      = TEMPAT_ICON[j.tempat]  || '';
        const tLabel     = TEMPAT_LABEL[j.tempat] || j.tempat || '—';
        return `<tr>
          <td>${i + 1}</td>
          <td title="${j.nama}">${j.nama}</td>
          <td>${katBadge(j.kategori)}</td>
          <td>${fmtTgl(j.tgl)}</td>
          <td style="font-family:var(--mono);font-size:12px;white-space:nowrap">${jamStr}</td>
          <td style="font-family:var(--mono);font-size:12px">${fmtSec(durSec)}</td>
          <td style="font-size:12px;white-space:nowrap">${tIcon} ${tLabel}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7" class="empty">Belum ada data</td></tr>`;
}
function setLaporanFilter(m)         { laporanFilter       = m; renderLaporan(); }
function setLaporanFilterKategori(v) { laporanFilterKat    = v; renderLaporan(); }
function setLaporanFilterProyek(v)   { laporanFilterProyek = v; renderLaporan(); }

// ==================== PRINT PDF ====================
function doPrint(){
  const content=document.getElementById('report-wrap').innerHTML;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="id"><head>
<meta charset="UTF-8"><title>Laporan Pekerja Lepas</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#fff;color:#1C2D40;padding:18px}
.report-wrap{border:1px solid #D8E4F2;border-radius:12px;overflow:hidden}
.kop{background:linear-gradient(135deg,#0C447C 0%,#1a6fca 60%,#2a8ef0 100%);padding:18px 22px;display:flex;align-items:center;gap:14px}
.kop-logo-box{width:60px;height:60px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
.kop-logo-box img{width:100%;height:100%;object-fit:contain}
.logo-placeholder{display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px}
.logo-placeholder svg{width:22px;height:22px}
.logo-placeholder span{font-size:8.5px;color:#185FA5;text-align:center}
.kop-name{font-size:17px;font-weight:700;color:#fff;margin-bottom:3px}
.kop-sub{font-size:11px;color:rgba(255,255,255,0.7)}
.kop-stripe{height:3px;background:linear-gradient(90deg,#B5D4F4,#E6F1FB,#B5D4F4)}
.report-body{padding:18px 22px}
.report-meta{display:flex;justify-content:space-between;margin-bottom:14px;gap:10px}
.report-title{font-size:15px;font-weight:700;color:#0C447C;margin-bottom:3px}
.report-period{font-size:11.5px;color:#8BA5C4}
.report-no-wrap{text-align:right;flex-shrink:0}
.report-no-label{font-size:10px;color:#8BA5C4;text-transform:uppercase;margin-bottom:2px}
.report-no-val{font-size:12.5px;font-weight:600;color:#0C447C;font-family:'JetBrains Mono',monospace}
.rstat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.rstat{background:#E6F1FB;border:1px solid #B5D4F4;border-radius:6px;padding:9px 11px}
.rstat-label{font-size:10px;color:#185FA5;font-weight:600;text-transform:uppercase;margin-bottom:3px}
.rstat-val{font-size:15px;font-weight:700;color:#0C447C;font-family:'JetBrains Mono',monospace}
table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:18px;border-radius:8px;overflow:hidden}
th{text-align:left;padding:9px 11px;background:linear-gradient(135deg,#0C447C,#1a6fca);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:none}
td{padding:8px 11px;font-size:11.5px;color:#1C2D40;border-bottom:1px solid #E2EDF8}
tr:nth-child(odd) td{background:#F7FAFF}
tr:nth-child(even) td{background:#FFFFFF}
tr:last-child td{border-bottom:none}
.mono{font-family:'JetBrains Mono',monospace}
.nowrap{white-space:nowrap}
.badge{display:inline-block;font-size:10px;padding:2px 8px;border-radius:99px;background:#E6F1FB;color:#0C447C;font-weight:700}
.ttd-section{display:grid;grid-template-columns:1fr 1fr;gap:2rem;padding-top:14px;border-top:1px solid #D8E4F2}
.ttd-box{text-align:center}
.ttd-label{font-size:11px;color:#8BA5C4;margin-bottom:3px}
.ttd-city{font-size:12px;color:#4A6280;margin-bottom:10px}
.ttd-space{height:60px;border-bottom:1px solid #D8E4F2;margin-bottom:7px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.ttd-space img{max-height:56px;max-width:140px;object-fit:contain}
.ttd-name{font-size:12.5px;font-weight:700;color:#1C2D40}
.ttd-role{font-size:11px;color:#8BA5C4;margin-top:2px}
@media print{body{padding:0}.report-wrap{border:none;border-radius:0}}
</style>
</head><body><div class="report-wrap">${content}</div></body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

// ==================== MODAL & TOAST ====================
function closeModal(id){document.getElementById(id).classList.remove('show');}
document.querySelectorAll('.modal-overlay').forEach(o=>{o.addEventListener('click',function(e){if(e.target===this)this.classList.remove('show');});});

function showToast(msg,type='success'){
  const ex=document.getElementById('pl-toast');if(ex)ex.remove();
  const t=document.createElement('div');t.id='pl-toast';t.textContent=msg;
  Object.assign(t.style,{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',
    background:type==='error'?'#A32D2D':'#085041',color:'#fff',padding:'11px 22px',
    borderRadius:'10px',fontSize:'13.5px',fontWeight:'600',zIndex:'9999',
    boxShadow:'0 4px 20px rgba(0,0,0,0.2)',fontFamily:'var(--font-body)',whiteSpace:'nowrap'});
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// ==================== INIT ====================
// (dipanggil dari DOMContentLoaded di atas)
