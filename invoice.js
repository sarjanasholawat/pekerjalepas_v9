// ============================================================
//  PEKERJA LEPAS — invoice.js
//  Menu Cetak Pembayaran: Invoice, Status Bayar, Rangkuman Pendapatan
//  Data: localStorage (siap diganti ke Apps Script)
// ============================================================

const INV_KEY  = 'pl_invoices';
const PAY_KEY  = 'pl_payments';

// ── STATE ──
let invoices       = JSON.parse(localStorage.getItem(INV_KEY) || '[]');
let payments       = JSON.parse(localStorage.getItem(PAY_KEY) || '[]');
let invTab         = 'list';
let invFilterStatus= 'all';
let bayarFilterStatus = 'all';
let rangkumanTahun = new Date().getFullYear();
let invItemCounter = 0;
let editInvoiceId  = null;
let bayarTargetId  = null;
let hapusInvTargetId = null;
let rangkumanChartInstance = null;

// ── SAVE ──
function saveInv() { localStorage.setItem(INV_KEY, JSON.stringify(invoices)); }
function savePay() { localStorage.setItem(PAY_KEY, JSON.stringify(payments)); }

// ── UTILS ──
function invUid() { return 'INV_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function payUid() { return 'PAY_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

function fmtRupiah(n) {
  n = Math.round(n || 0);
  return 'Rp ' + n.toLocaleString('id-ID');
}

function fmtTglID(tgl) {
  if (!tgl) return '—';
  const d = new Date(tgl);
  if (isNaN(d)) return tgl;
  const BLN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`;
}

function nomorInvoiceBaru() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const countThisMonth = invoices.filter(i => {
    const d = new Date(i.tglTerbit);
    return d.getFullYear()===y && d.getMonth()===now.getMonth();
  }).length + 1;
  return `INV/${y}${m}/${String(countThisMonth).padStart(3,'0')}`;
}

// ── STATUS ──
const INV_STATUS_LABEL = { belum:'Belum Dibayar', sebagian:'Dibayar Sebagian', lunas:'Lunas' };
const INV_STATUS_COLOR = {
  belum:    { bg:'#FCEBEB', text:'#A32D2D', bdr:'#E8A8A8' },
  sebagian: { bg:'#FFF8E6', text:'#A05A00', bdr:'#F5C842' },
  lunas:    { bg:'#E1F5EE', text:'#085041', bdr:'#5DCAA5' },
};

function getInvoiceStatus(inv) {
  const dibayar = getTotalDibayar(inv.id);
  const total   = getInvoiceTotal(inv);
  if (dibayar <= 0) return 'belum';
  if (dibayar >= total) return 'lunas';
  return 'sebagian';
}

function getInvoiceTotal(inv) {
  return (inv.items || []).reduce((sum, it) => sum + (it.qty * it.harga), 0);
}

function getTotalDibayar(invoiceId) {
  return payments
    .filter(p => p.invoiceId === invoiceId)
    .reduce((sum, p) => sum + (p.jumlah || 0), 0);
}

function statusBadgeInv(status) {
  const c = INV_STATUS_COLOR[status] || INV_STATUS_COLOR.belum;
  return `<span style="display:inline-block;font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:${c.bg};color:${c.text};border:1px solid ${c.bdr}">${INV_STATUS_LABEL[status]}</span>`;
}

// ══════════════════════════════════════════════
//  TAB SWITCHING
// ══════════════════════════════════════════════

function setInvTab(tab) {
  invTab = tab;
  ['list','bayar','rangkuman'].forEach(t => {
    document.getElementById('inv-tab-'+t)?.classList.toggle('active', t===tab);
    document.getElementById('invpane-'+t)?.classList.toggle('active', t===tab);
  });
  if (tab === 'list')      renderInvoiceList();
  if (tab === 'bayar')     renderStatusPembayaran();
  if (tab === 'rangkuman') renderRangkuman();
}

function initInvoicePage() {
  populateProyekDropdownInvoice();
  setInvTab(invTab);
}

// ══════════════════════════════════════════════
//  TAB 1: DAFTAR INVOICE
// ══════════════════════════════════════════════

function renderInvoiceList() {
  // Filter status
  let fr = `<button class="fbtn ${invFilterStatus==='all'?'active':''}" onclick="setInvFilterStatus('all')">Semua</button>`;
  fr += `<button class="fbtn ${invFilterStatus==='belum'?'active':''}" onclick="setInvFilterStatus('belum')">Belum Dibayar</button>`;
  fr += `<button class="fbtn ${invFilterStatus==='sebagian'?'active':''}" onclick="setInvFilterStatus('sebagian')">Sebagian</button>`;
  fr += `<button class="fbtn ${invFilterStatus==='lunas'?'active':''}" onclick="setInvFilterStatus('lunas')">Lunas</button>`;
  document.getElementById('inv-filter-status').innerHTML = fr;

  let fl = [...invoices].sort((a,b) => new Date(b.tglTerbit) - new Date(a.tglTerbit));
  if (invFilterStatus !== 'all') {
    fl = fl.filter(inv => getInvoiceStatus(inv) === invFilterStatus);
  }

  const grid = document.getElementById('inv-grid');
  if (!fl.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:3rem">Belum ada invoice. Klik "Buat Invoice" untuk memulai.</div>`;
    return;
  }

  grid.innerHTML = fl.map(inv => {
    const total   = getInvoiceTotal(inv);
    const dibayar = getTotalDibayar(inv.id);
    const status  = getInvoiceStatus(inv);
    const sisa    = total - dibayar;
    const pct     = total ? Math.min(100, Math.round(dibayar/total*100)) : 0;

    return `
    <div class="inv-card">
      <div class="inv-card-header">
        <div>
          <div class="inv-card-nomor">${inv.nomor}</div>
          <div class="inv-card-klien">${inv.klien}</div>
        </div>
        ${statusBadgeInv(status)}
      </div>
      <div class="inv-card-meta">
        <div><span>Terbit</span><b>${fmtTglID(inv.tglTerbit)}</b></div>
        <div><span>Jatuh Tempo</span><b>${fmtTglID(inv.jatuhTempo)}</b></div>
      </div>
      <div class="inv-card-total">
        <span>Total Tagihan</span>
        <b>${fmtRupiah(total)}</b>
      </div>
      ${status !== 'belum' ? `
      <div class="inv-progress">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-400);margin-bottom:5px">
          <span>Terbayar ${fmtRupiah(dibayar)}</span><span>${pct}%</span>
        </div>
        <div style="height:5px;background:var(--gray-100);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#1D9E75,#5DCAA5);border-radius:99px"></div>
        </div>
      </div>` : ''}
      <div class="inv-card-actions">
        <button class="btn-icon" onclick="previewInvoice('${inv.id}')" title="Lihat / Cetak">
          <svg viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/></svg>
        </button>
        ${status !== 'lunas' ? `
        <button class="btn-icon" style="color:#085041" onclick="openModalBayar('${inv.id}')" title="Catat Pembayaran">
          <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3l2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>` : ''}
        <button class="btn-icon" onclick="openEditInvoice('${inv.id}')" title="Edit">
          <svg viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
        </button>
        <button class="btn-icon danger" onclick="hapusInvoice('${inv.id}')" title="Hapus">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 5h10M6 5V3h4v2M6 8v5M10 8v5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function setInvFilterStatus(v) { invFilterStatus = v; renderInvoiceList(); }

// ── Dropdown proyek di form invoice ──
function populateProyekDropdownInvoice() {
  const sel = document.getElementById('inv-inp-proyek');
  if (!sel) return;
  const prjs = JSON.parse(localStorage.getItem('pl_projects') || '[]');
  const cur  = sel.value;
  sel.innerHTML = '<option value="">— Tanpa Proyek —</option>';
  prjs.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.nama;
    sel.appendChild(o);
  });
  if ([...sel.options].find(o=>o.value===cur)) sel.value = cur;
}

// ── Modal Buat/Edit Invoice ──
function openModalInvoice() {
  editInvoiceId = null;
  document.getElementById('modal-invoice-title').textContent = 'Buat Invoice Baru';
  document.getElementById('inv-inp-klien').value   = '';
  document.getElementById('inv-inp-email').value   = '';
  document.getElementById('inv-inp-catatan').value = '';

  const today = new Date();
  const due   = new Date(today); due.setDate(due.getDate()+14);
  document.getElementById('inv-inp-tgl-terbit').value   = today.toISOString().slice(0,10);
  document.getElementById('inv-inp-jatuh-tempo').value  = due.toISOString().slice(0,10);

  populateProyekDropdownInvoice();
  document.getElementById('inv-inp-proyek').value = '';

  document.getElementById('inv-items-wrap').innerHTML = '';
  invItemCounter = 0;
  tambahInvItem(); // mulai dengan 1 item kosong

  document.getElementById('modal-invoice').classList.add('show');
  document.getElementById('inv-inp-klien').focus();
}

function openEditInvoice(id) {
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;
  editInvoiceId = id;
  document.getElementById('modal-invoice-title').textContent = 'Edit Invoice';
  document.getElementById('inv-inp-klien').value    = inv.klien;
  document.getElementById('inv-inp-email').value    = inv.email || '';
  document.getElementById('inv-inp-catatan').value  = inv.catatan || '';
  document.getElementById('inv-inp-tgl-terbit').value  = inv.tglTerbit;
  document.getElementById('inv-inp-jatuh-tempo').value = inv.jatuhTempo;

  populateProyekDropdownInvoice();
  document.getElementById('inv-inp-proyek').value = inv.projectId || '';

  document.getElementById('inv-items-wrap').innerHTML = '';
  invItemCounter = 0;
  (inv.items || []).forEach(it => tambahInvItem(it.nama, it.qty, it.harga));
  if (!inv.items || !inv.items.length) tambahInvItem();

  hitungTotalInvoice();
  document.getElementById('modal-invoice').classList.add('show');
}

function tambahInvItem(nama='', qty=1, harga=0) {
  const id = 'item_' + (invItemCounter++);
  const wrap = document.getElementById('inv-items-wrap');
  const row = document.createElement('div');
  row.className = 'inv-item-row';
  row.id = id;
  row.innerHTML = `
    <input type="text" placeholder="Nama item / jasa" value="${nama.replace(/"/g,'&quot;')}" class="inv-item-nama" oninput="hitungTotalInvoice()">
    <input type="number" placeholder="Qty" value="${qty}" min="1" class="inv-item-qty" oninput="hitungTotalInvoice()">
    <input type="number" placeholder="Harga satuan" value="${harga}" min="0" class="inv-item-harga" oninput="hitungTotalInvoice()">
    <span class="inv-item-subtotal">${fmtRupiah(qty*harga)}</span>
    <button type="button" class="inv-item-del" onclick="hapusInvItem('${id}')" title="Hapus item">✕</button>
  `;
  wrap.appendChild(row);
  hitungTotalInvoice();
}

function hapusInvItem(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
  hitungTotalInvoice();
}

function hitungTotalInvoice() {
  let total = 0;
  document.querySelectorAll('.inv-item-row').forEach(row => {
    const qty   = parseFloat(row.querySelector('.inv-item-qty').value) || 0;
    const harga = parseFloat(row.querySelector('.inv-item-harga').value) || 0;
    const sub   = qty * harga;
    row.querySelector('.inv-item-subtotal').textContent = fmtRupiah(sub);
    total += sub;
  });
  const totalEl = document.getElementById('inv-total-display');
  if (totalEl) totalEl.textContent = fmtRupiah(total);
}

function simpanInvoice() {
  const klien = document.getElementById('inv-inp-klien').value.trim();
  if (!klien) { showToast('Nama klien wajib diisi','error'); return; }

  const items = [];
  document.querySelectorAll('.inv-item-row').forEach(row => {
    const nama  = row.querySelector('.inv-item-nama').value.trim();
    const qty   = parseFloat(row.querySelector('.inv-item-qty').value) || 0;
    const harga = parseFloat(row.querySelector('.inv-item-harga').value) || 0;
    if (nama && qty > 0) items.push({ nama, qty, harga });
  });
  if (!items.length) { showToast('Tambahkan minimal 1 item','error'); return; }

  const selPrj = document.getElementById('inv-inp-proyek');
  const projectId   = selPrj.value;
  const projectName = selPrj.options[selPrj.selectedIndex]?.text || '';

  const data = {
    klien,
    email: document.getElementById('inv-inp-email').value.trim(),
    tglTerbit:   document.getElementById('inv-inp-tgl-terbit').value,
    jatuhTempo:  document.getElementById('inv-inp-jatuh-tempo').value,
    catatan: document.getElementById('inv-inp-catatan').value.trim(),
    items,
    projectId: projectId || '',
    projectName: projectId ? projectName : '',
  };

  if (editInvoiceId) {
    const idx = invoices.findIndex(i => i.id === editInvoiceId);
    if (idx > -1) invoices[idx] = { ...invoices[idx], ...data };
  } else {
    invoices.unshift({
      id: invUid(),
      nomor: nomorInvoiceBaru(),
      ...data,
      createdAt: Date.now(),
    });
  }
  saveInv();
  closeModal('modal-invoice');
  renderInvoiceList();
  showToast(editInvoiceId ? 'Invoice diperbarui!' : 'Invoice berhasil dibuat!');
}

function hapusInvoice(id) {
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;
  hapusInvTargetId = id;
  document.getElementById('hapus-inv-nomor').textContent = inv.nomor;
  document.getElementById('modal-hapus-invoice').classList.add('show');
}

function confirmHapusInvoice() {
  invoices = invoices.filter(i => i.id !== hapusInvTargetId);
  payments = payments.filter(p => p.invoiceId !== hapusInvTargetId);
  saveInv(); savePay();
  closeModal('modal-hapus-invoice');
  renderInvoiceList();
  renderStatusPembayaran();
  showToast('Invoice dihapus');
}

// ══════════════════════════════════════════════
//  TAB 2: STATUS PEMBAYARAN
// ══════════════════════════════════════════════

function renderStatusPembayaran() {
  let fr = `<button class="fbtn ${bayarFilterStatus==='all'?'active':''}" onclick="setBayarFilter('all')">Semua</button>`;
  fr += `<button class="fbtn ${bayarFilterStatus==='belum'?'active':''}" onclick="setBayarFilter('belum')">Belum Dibayar</button>`;
  fr += `<button class="fbtn ${bayarFilterStatus==='sebagian'?'active':''}" onclick="setBayarFilter('sebagian')">Sebagian</button>`;
  fr += `<button class="fbtn ${bayarFilterStatus==='lunas'?'active':''}" onclick="setBayarFilter('lunas')">Lunas</button>`;
  document.getElementById('bayar-filter-status').innerHTML = fr;

  let fl = [...invoices].sort((a,b) => new Date(a.jatuhTempo) - new Date(b.jatuhTempo));
  if (bayarFilterStatus !== 'all') {
    fl = fl.filter(inv => getInvoiceStatus(inv) === bayarFilterStatus);
  }

  const tbody = document.getElementById('bayar-tbody');
  if (!fl.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Tidak ada invoice</td></tr>`;
    return;
  }

  const now = new Date();
  tbody.innerHTML = fl.map(inv => {
    const total  = getInvoiceTotal(inv);
    const status = getInvoiceStatus(inv);
    const isOverdue = status !== 'lunas' && new Date(inv.jatuhTempo) < now;
    return `<tr>
      <td><b>${inv.nomor}</b></td>
      <td title="${inv.klien}">${inv.klien}</td>
      <td>${fmtTglID(inv.tglTerbit)}</td>
      <td style="${isOverdue?'color:#A32D2D;font-weight:600':''}">${fmtTglID(inv.jatuhTempo)}${isOverdue?' ⚠':''}</td>
      <td><b>${fmtRupiah(total)}</b></td>
      <td>${statusBadgeInv(status)}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn-icon" onclick="previewInvoice('${inv.id}')" title="Lihat"><svg viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/></svg></button>
          ${status!=='lunas'?`<button class="btn-icon" style="color:#085041" onclick="openModalBayar('${inv.id}')" title="Catat Bayar"><svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3l2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function setBayarFilter(v) { bayarFilterStatus = v; renderStatusPembayaran(); }

// ── Modal Catat Pembayaran ──
function openModalBayar(invoiceId) {
  const inv = invoices.find(i => i.id === invoiceId);
  if (!inv) return;
  bayarTargetId = invoiceId;

  const total   = getInvoiceTotal(inv);
  const dibayar = getTotalDibayar(invoiceId);
  const sisa    = total - dibayar;

  document.getElementById('bayar-info-box').innerHTML = `
    <div style="background:var(--blue-light);border:1px solid var(--blue-border);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12.5px">
      <div style="font-weight:700;color:var(--blue-dark);margin-bottom:4px">${inv.nomor} — ${inv.klien}</div>
      <div style="display:flex;justify-content:space-between;color:var(--gray-600)">
        <span>Total Tagihan</span><b>${fmtRupiah(total)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;color:var(--gray-600)">
        <span>Sudah Dibayar</span><b>${fmtRupiah(dibayar)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;color:#A32D2D;margin-top:4px;padding-top:4px;border-top:1px dashed var(--blue-border)">
        <span>Sisa Tagihan</span><b>${fmtRupiah(sisa)}</b>
      </div>
    </div>`;

  document.getElementById('bayar-inp-tgl').value     = new Date().toISOString().slice(0,10);
  document.getElementById('bayar-inp-jumlah').value  = sisa > 0 ? sisa : '';
  document.getElementById('bayar-inp-metode').value  = 'Transfer Bank';
  document.getElementById('bayar-inp-catatan').value = '';

  document.getElementById('modal-bayar').classList.add('show');
}

function simpanPembayaran() {
  const jumlah = parseFloat(document.getElementById('bayar-inp-jumlah').value) || 0;
  if (jumlah <= 0) { showToast('Jumlah pembayaran harus lebih dari 0','error'); return; }

  const inv = invoices.find(i => i.id === bayarTargetId);
  payments.unshift({
    id: payUid(),
    invoiceId: bayarTargetId,
    invoiceNomor: inv?.nomor || '',
    klien: inv?.klien || '',
    tgl: document.getElementById('bayar-inp-tgl').value,
    jumlah,
    metode: document.getElementById('bayar-inp-metode').value,
    catatan: document.getElementById('bayar-inp-catatan').value.trim(),
    createdAt: Date.now(),
  });
  savePay();
  closeModal('modal-bayar');
  renderInvoiceList();
  renderStatusPembayaran();
  showToast('Pembayaran berhasil dicatat!');
}

// ══════════════════════════════════════════════
//  TAB 3: RANGKUMAN PENDAPATAN
// ══════════════════════════════════════════════

function renderRangkuman() {
  // Filter tahun
  const years = [...new Set(payments.map(p => new Date(p.tgl).getFullYear()))];
  const thisYear = new Date().getFullYear();
  if (!years.includes(thisYear)) years.push(thisYear);
  years.sort((a,b)=>b-a);

  let fr = years.map(y => `<button class="fbtn ${rangkumanTahun===y?'active':''}" onclick="setRangkumanTahun(${y})">${y}</button>`).join('');
  document.getElementById('rangkuman-filter-tahun').innerHTML = fr;

  const payThisYear = payments.filter(p => new Date(p.tgl).getFullYear() === rangkumanTahun);
  const totalMasuk  = payThisYear.reduce((s,p)=>s+p.jumlah,0);

  const invThisYear = invoices.filter(i => new Date(i.tglTerbit).getFullYear() === rangkumanTahun);
  const totalTagihan= invThisYear.reduce((s,i)=>s+getInvoiceTotal(i),0);
  const totalBelumBayar = invThisYear.reduce((s,i)=>{
    const status = getInvoiceStatus(i);
    if (status==='lunas') return s;
    return s + (getInvoiceTotal(i) - getTotalDibayar(i.id));
  },0);

  const jumlahLunas = invThisYear.filter(i=>getInvoiceStatus(i)==='lunas').length;

  document.getElementById('rangkuman-stat-grid').innerHTML = `
    <div class="stat">
      <div class="stat-label">💰 Total Pendapatan Masuk</div>
      <div class="stat-val" style="font-size:18px;color:#085041">${fmtRupiah(totalMasuk)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">📄 Total Tagihan Diterbitkan</div>
      <div class="stat-val" style="font-size:18px">${fmtRupiah(totalTagihan)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">⏳ Belum Dibayar</div>
      <div class="stat-val" style="font-size:18px;color:#A32D2D">${fmtRupiah(totalBelumBayar)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">✅ Invoice Lunas</div>
      <div class="stat-val">${jumlahLunas} / ${invThisYear.length}</div>
    </div>`;

  renderRangkumanChart(payThisYear);
  renderRiwayatPembayaran(payThisYear);
}

function setRangkumanTahun(y) { rangkumanTahun = y; renderRangkuman(); }

function renderRangkumanChart(payList) {
  const canvas  = document.getElementById('rangkuman-chart');
  const emptyEl = document.getElementById('rangkuman-chart-empty');
  if (!canvas) return;

  const BULAN_SHORT_LOCAL = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const monthly = new Array(12).fill(0);
  payList.forEach(p => {
    const m = new Date(p.tgl).getMonth();
    monthly[m] += p.jumlah;
  });

  const hasData = monthly.some(v => v > 0);
  emptyEl.style.display = hasData ? 'none' : 'flex';
  canvas.style.display  = hasData ? 'block' : 'none';
  if (!hasData) return;

  if (rangkumanChartInstance) { rangkumanChartInstance.destroy(); rangkumanChartInstance = null; }

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,260);
  grad.addColorStop(0,'rgba(29,158,117,0.25)');
  grad.addColorStop(0.6,'rgba(29,158,117,0.05)');
  grad.addColorStop(1,'rgba(29,158,117,0)');

  rangkumanChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: BULAN_SHORT_LOCAL,
      datasets: [{
        label: 'Pendapatan',
        data: monthly,
        borderColor: '#1D9E75',
        backgroundColor: grad,
        borderWidth: 2.5,
        fill: true,
        tension: 0.45,
        pointBackgroundColor: '#1D9E75',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(12,44,80,0.92)',
          titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.85)',
          padding: 12, cornerRadius: 10,
          callbacks: { label: c => '  ' + fmtRupiah(c.raw) }
        }
      },
      scales: {
        x: { grid: { color:'rgba(0,0,0,0.04)' }, ticks: { font:{size:11,family:'Plus Jakarta Sans'}, color:'#8BA5C4' } },
        y: { beginAtZero:true, grid:{ color:'rgba(0,0,0,0.05)' }, ticks: { font:{size:10,family:'Plus Jakarta Sans'}, color:'#1D9E75', callback: v => 'Rp'+(v/1000)+'rb' } }
      }
    }
  });
}

function renderRiwayatPembayaran(payList) {
  const tbody = document.getElementById('riwayat-bayar-tbody');
  if (!tbody) return;
  const sorted = [...payList].sort((a,b) => new Date(b.tgl) - new Date(a.tgl));
  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Belum ada pembayaran masuk tahun ini</td></tr>`;
    return;
  }
  const METODE_ICON = {'Transfer Bank':'🏦','Tunai':'💵','E-Wallet':'📱','Lainnya':'📋'};
  tbody.innerHTML = sorted.map(p => `
    <tr>
      <td>${fmtTglID(p.tgl)}</td>
      <td><b>${p.invoiceNomor}</b></td>
      <td title="${p.klien}">${p.klien}</td>
      <td style="font-weight:700;color:#085041">${fmtRupiah(p.jumlah)}</td>
      <td>${METODE_ICON[p.metode]||''} ${p.metode}</td>
      <td style="font-size:12px;color:var(--gray-400)">${p.catatan||'—'}</td>
    </tr>`).join('');
}

// ══════════════════════════════════════════════
//  PREVIEW & CETAK INVOICE
// ══════════════════════════════════════════════

function previewInvoice(id) {
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;

  const total   = getInvoiceTotal(inv);
  const dibayar = getTotalDibayar(id);
  const sisa    = total - dibayar;
  const status  = getInvoiceStatus(inv);

  const kop = JSON.parse(localStorage.getItem('pl_kop_surat') || 'null') || {};
  const namaStudio = kop.nama || 'Nama Studio / Perusahaan';
  const alamat     = kop.alamat || '';

  const itemRows = (inv.items||[]).map((it,i) => `
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td>${it.nama}</td>
      <td style="text-align:center">${it.qty}</td>
      <td style="text-align:right">${fmtRupiah(it.harga)}</td>
      <td style="text-align:right">${fmtRupiah(it.qty*it.harga)}</td>
    </tr>`).join('');

  document.getElementById('invoice-preview-content').innerHTML = `
    <div class="inv-print-header">
      <div>
        <div class="inv-print-studio">${namaStudio}</div>
        <div class="inv-print-alamat">${alamat}</div>
      </div>
      <div class="inv-print-badge">
        <div class="inv-print-nomor">${inv.nomor}</div>
        ${statusBadgeInv(status)}
      </div>
    </div>
    <div class="inv-print-meta">
      <div>
        <div class="inv-print-label">Ditagihkan Kepada</div>
        <div class="inv-print-klien">${inv.klien}</div>
        ${inv.email ? `<div class="inv-print-email">${inv.email}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div><span class="inv-print-label">Tanggal Terbit</span> <b>${fmtTglID(inv.tglTerbit)}</b></div>
        <div><span class="inv-print-label">Jatuh Tempo</span> <b>${fmtTglID(inv.jatuhTempo)}</b></div>
        ${inv.projectName ? `<div><span class="inv-print-label">Proyek</span> <b>${inv.projectName}</b></div>` : ''}
      </div>
    </div>
    <table class="inv-print-table">
      <thead><tr>
        <th style="width:6%">No</th><th>Item</th><th style="width:10%">Qty</th>
        <th style="width:20%">Harga</th><th style="width:20%">Subtotal</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="inv-print-summary">
      <div><span>Total Tagihan</span><b>${fmtRupiah(total)}</b></div>
      <div><span>Sudah Dibayar</span><b>${fmtRupiah(dibayar)}</b></div>
      <div class="inv-print-sisa"><span>Sisa Tagihan</span><b>${fmtRupiah(sisa)}</b></div>
    </div>
    ${inv.catatan ? `<div class="inv-print-catatan"><b>Catatan:</b> ${inv.catatan}</div>` : ''}
  `;

  document.getElementById('modal-preview-invoice').dataset.invoiceId = id;
  document.getElementById('modal-preview-invoice').classList.add('show');
}

function kirimInvoiceEmail() {
  const id  = document.getElementById('modal-preview-invoice').dataset.invoiceId;
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;
  if (!inv.email) { showToast('Klien belum punya alamat email. Edit invoice untuk menambahkan.','error'); return; }

  const total = getInvoiceTotal(inv);
  const subject = encodeURIComponent(`Invoice ${inv.nomor} — ${inv.klien}`);
  const body = encodeURIComponent(
    `Yth. ${inv.klien},\n\nBerikut kami lampirkan invoice ${inv.nomor} dengan total tagihan ${fmtRupiah(total)}.\nJatuh tempo pembayaran: ${fmtTglID(inv.jatuhTempo)}.\n\nTerima kasih.`
  );
  window.location.href = `mailto:${inv.email}?subject=${subject}&body=${body}`;
  showToast('Membuka aplikasi email...');
}

function cetakInvoicePDF() {
  const content = document.getElementById('invoice-preview-content').innerHTML;
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Cetak Invoice</title>
    <style>
      body{font-family:'Plus Jakarta Sans',Arial,sans-serif;padding:32px;color:#1C2D40;max-width:760px;margin:0 auto}
      .inv-print-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a6fca;padding-bottom:16px;margin-bottom:20px}
      .inv-print-studio{font-size:18px;font-weight:800;color:#0C447C}
      .inv-print-alamat{font-size:12px;color:#8BA5C4;margin-top:3px}
      .inv-print-nomor{font-size:16px;font-weight:700;color:#1a6fca;margin-bottom:6px;text-align:right}
      .inv-print-meta{display:flex;justify-content:space-between;margin-bottom:20px;font-size:13px}
      .inv-print-label{font-size:10.5px;color:#8BA5C4;text-transform:uppercase;letter-spacing:0.4px}
      .inv-print-klien{font-size:15px;font-weight:700;margin-top:3px}
      .inv-print-email{font-size:12px;color:#8BA5C4}
      .inv-print-table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12.5px}
      .inv-print-table th{background:linear-gradient(135deg,#0C447C,#1a6fca);color:#fff;padding:9px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;text-align:left}
      .inv-print-table td{padding:8px 10px;border-bottom:1px solid #E2EDF8}
      .inv-print-summary{margin-left:auto;width:280px;font-size:13px}
      .inv-print-summary > div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #EEF2F8}
      .inv-print-sisa{font-size:15px;font-weight:800;color:#0C447C;border-top:2px solid #1a6fca!important;margin-top:4px;padding-top:10px!important}
      .inv-print-catatan{margin-top:24px;padding:12px 14px;background:#F7FAFF;border-radius:8px;font-size:12.5px;color:#4A6280}
      @media print{ body{padding:0} }
    </style></head>
    <body>${content}</body></html>
  `);
  w.document.close();
  setTimeout(() => { w.print(); }, 300);
}
