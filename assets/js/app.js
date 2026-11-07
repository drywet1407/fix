/**
 * assets/js/app.js
 * E-SPPD Dinas Kesehatan Kota Tangerang Selatan
 * Aplikasi Pengelolaan SPPD, Kontrol Pagu Anggaran, Cetak Dokumen Resmi & Rekap
 */

// Endpoint API menggunakan Netlify Serverless Proxy (/api/gas) — tanpa fallback URL GAS atau data dummy.
// Saat dijalankan di lokal (Five Server / Live Server), otomatis mengarah ke tunnel proxy Netlify produksi.
const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "https://esppddinkestangsel.netlify.app/api/gas"
  : "/api/gas";
const LOGO_TANGSEL = "https://upload.wikimedia.org/wikipedia/commons/e/e1/Lambang_Kota_Tangerang_Selatan.png";

let stateSppd = [];
var statePegawai = window.statePegawai || [];
let selectedIds = new Set();

const DEFAULT_PAGU = {
  perUp: 100000000,
  perTriwulan: 210871900,
  perTrimester: 250000000,
  maxLimitPegawaiPerUp: 106,
  maxLimitPegawaiPerTahun: 106,
  npd: {
    tol: { tw: [7500000, 7500000, 7500000, 7500000], ak: [5002500, 4529000, 7500000, 0] },
    luar: { tw: [105000000, 260000000, 162000000, 162371900], ak: [64909500, 115552152, 271300951, 0] },
    dalam: { tw: [25000000, 42000000, 42000000, 41000000], ak: [7000000, 6900000, 9200000, 0] }
  }
};

let PAGU_CONFIG = JSON.parse(localStorage.getItem('SPPD_PAGU_CONFIG_V2') || 'null') || DEFAULT_PAGU;
PAGU_CONFIG.maxLimitPegawaiPerUp = 106;
PAGU_CONFIG.maxLimitPegawaiPerTahun = 106;

window.addEventListener('DOMContentLoaded', () => {
  // Bersihkan seluruh cache lokal & URL lama agar hanya menggunakan data live dari Netlify Proxy
  localStorage.removeItem('SPPD_GAS_API_URL');
  localStorage.removeItem('LOCAL_CACHE_SPPD');
  localStorage.removeItem('LOCAL_CACHE_PEGAWAI');
  localStorage.removeItem('LOCAL_CACHE_PEGAWAI_V1');
  localStorage.removeItem('LOCAL_CACHE_PEGAWAI_V2');
  localStorage.removeItem('LOCAL_CACHE_PEGAWAI_V3');

  ensureTupOptionsInSelects();
  ensureBulkEditUI();
  setupInputHistoryAutocomplete();
  loadInitialData();

  if (window.innerWidth < 768 && localStorage.getItem('SPPD_MOBILE_DASH_COLLAPSED') === 'true') {
    toggleMobileDashboard(false);
  }
});

// Pastikan opsi "TUP" selalu tersedia di dropdown filterUp dan no_up
function ensureTupOptionsInSelects() {
  const filterUp = document.getElementById('filterUp');
  if (filterUp && !Array.from(filterUp.options).some(o => o.value === 'TUP')) {
    const opt = document.createElement('option');
    opt.value = 'TUP';
    opt.textContent = 'TUP (Tambahan Uang Persediaan)';
    filterUp.appendChild(opt);
  }

  const noUp = document.getElementById('no_up');
  if (noUp && !Array.from(noUp.options).some(o => o.value === 'TUP')) {
    const opt = document.createElement('option');
    opt.value = 'TUP';
    opt.textContent = 'TUP (Pencairan TUP)';
    noUp.appendChild(opt);
  }
}

// Buat tombol & modal Edit Massal (Bulk Edit) secara dinamis jika belum ada di index.html
function ensureBulkEditUI() {
  const batchBar = document.getElementById('batchActionBar');
  if (batchBar && !document.getElementById('btnOpenBulkEdit')) {
    const btnWrap = batchBar.querySelector('div:last-child');
    if (btnWrap) {
      const btn = document.createElement('button');
      btn.id = 'btnOpenBulkEdit';
      btn.type = 'button';
      btn.onclick = openBulkEditModal;
      btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-400 text-white transition shadow flex items-center gap-1';
      btn.innerHTML = '✏️ Edit Massal UP / Jenis';
      btnWrap.prepend(btn);
    }
  }

  if (!document.getElementById('modalBulkEdit')) {
    const upOptions = Array.from({ length: 20 }, (_, i) => `<option value="UP ${i + 1}">UP ${i + 1} (Pencairan Tahap ${i + 1})</option>`).join('') +
      `<option value="TUP">TUP (Tambahan Uang Persediaan)</option>`;

    const modalHtml = `
      <div id="modalBulkEdit" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 hidden items-center justify-center p-4 no-print">
        <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
          <div class="px-6 py-4 bg-teal-900 text-white flex justify-between items-center">
            <h3 class="font-bold text-base">✏️ Edit Massal Kelompok UP & Jenis Perjalanan</h3>
            <button type="button" onclick="closeBulkEditModal()" class="text-teal-200 hover:text-white text-xl leading-none">×</button>
          </div>
          <form onsubmit="submitBulkEdit(event)" class="p-6 space-y-4 text-xs">
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              Data yang akan diubah sekaligus: <strong id="bulkEditCountText">0 baris terpilih</strong>.
              <p class="mt-1 text-[11px] text-amber-700">Pilih bagian yang ingin diubah (biarkan "-- Tidak Diubah --" jika hanya ingin mengubah salah satu).</p>
            </div>
            <div>
              <label class="block font-bold text-slate-700 uppercase mb-1">Ubah Kelompok / No. UP Pencairan Menjadi:</label>
              <select id="bulk_no_up" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-semibold text-emerald-700">
                <option value="">-- Tidak Diubah --</option>
                ${upOptions}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 uppercase mb-1">Ubah Jenis Perjalanan Dinas Menjadi:</label>
              <select id="bulk_jenis_perjalanan" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-semibold text-slate-800">
                <option value="">-- Tidak Diubah --</option>
                <option value="Dalam Daerah">Dalam Daerah (5.1.02.04.001.00003)</option>
                <option value="Luar Daerah">Luar Daerah / Biasa (5.1.02.04.001.00001)</option>
                <option value="E-Tol">Belanja Jasa Jalan / E-Tol (5.1.02.02.01.0054)</option>
              </select>
            </div>
            <div class="flex justify-end space-x-2 pt-3 border-t border-slate-200">
              <button type="button" onclick="closeBulkEditModal()" class="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold">Batal</button>
              <button type="submit" id="btnSubmitBulkEdit" class="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold shadow">💾 Terapkan Perubahan Massal</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }
}

function openBulkEditModal() {
  const targets = getTargetItemsForDoc();
  if (targets.length === 0) {
    if (typeof twAlert === 'function') {
      twAlert('Tidak Ada Data', 'Centang minimal 1 baris data di tabel (atau tampilkan data melalui filter) untuk diedit secara massal!', 'warning');
    } else {
      alert('Centang minimal 1 baris data terlebih dahulu!');
    }
    return;
  }

  const labelMode = selectedIds.size > 0
    ? `${selectedIds.size} data yang dicentang`
    : `Seluruh ${targets.length} data yang tampil di filter saat ini`;

  document.getElementById('bulkEditCountText').textContent = labelMode;
  document.getElementById('bulk_no_up').value = '';
  document.getElementById('bulk_jenis_perjalanan').value = '';

  const modal = document.getElementById('modalBulkEdit');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeBulkEditModal() {
  const modal = document.getElementById('modalBulkEdit');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function submitBulkEdit(e) {
  e.preventDefault();
  const newUp = document.getElementById('bulk_no_up').value;
  const newJenis = document.getElementById('bulk_jenis_perjalanan').value;

  if (!newUp && !newJenis) {
    twAlert('Pilih Perubahan', 'Silakan pilih Kelompok UP atau Jenis Perjalanan yang ingin diubah terlebih dahulu.', 'warning');
    return;
  }

  const targets = getTargetItemsForDoc();
  if (targets.length === 0) return;

  const infoPerubahan = [
    newUp ? `Kelompok Pencairan ➔ ${newUp}` : null,
    newJenis ? `Jenis Perjalanan ➔ ${newJenis}` : null
  ].filter(Boolean).join('\n');

  const ok = await twConfirm(
    'Konfirmasi Edit Massal',
    `Apakah Anda yakin ingin mengubah ${targets.length} data sekaligus?\n\n${infoPerubahan}`,
    { type: 'warning', confirmText: 'Ya, Ubah Semua', cancelText: 'Batal' }
  );
  if (!ok) return;

  const btn = document.getElementById('btnSubmitBulkEdit');
  btn.disabled = true;
  const originalText = btn.textContent;

  let sukses = 0;
  let gagal = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    btn.textContent = `⏳ Memproses (${i + 1}/${targets.length})...`;

    const updatedPayload = {
      ...item,
      no_up: newUp ? newUp : (item.no_up || 'UP 1'),
      jenis_perjalanan: newJenis ? newJenis : item.jenis_perjalanan
    };

    try {
      const res = await callBackend('updateSppd', updatedPayload);
      if (res && res.status === 'success') {
        sukses++;
      } else {
        gagal++;
      }
    } catch (err) {
      console.error('Gagal update item:', item.id, err);
      gagal++;
    }
  }

  btn.disabled = false;
  btn.textContent = originalText;
  closeBulkEditModal();
  await loadInitialData();

  if (gagal === 0) {
    twAlert('Edit Massal Berhasil', `${sukses} data berhasil diperbarui secara serentak.`, 'success');
  } else {
    twAlert('Selesai dengan Catatan', `Berhasil: ${sukses} data, Gagal: ${gagal} data.`, 'warning');
  }
}

function getPaguTotals() {
  const n = PAGU_CONFIG.npd || DEFAULT_PAGU.npd;
  const totTol = n.tol.tw.reduce((a, b) => a + Number(b || 0), 0);
  const totLuar = n.luar.tw.reduce((a, b) => a + Number(b || 0), 0);
  const totDalam = n.dalam.tw.reduce((a, b) => a + Number(b || 0), 0);
  return {
    etol: totTol,
    luarDaerah: totLuar,
    dalamDaerah: totDalam,
    total: totTol + totLuar + totDalam
  };
}

async function callBackend(action, payload = null) {
  if (action === 'init' || action === 'getPegawai') {
    const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return JSON.parse(text);
  } else {
    const res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return JSON.parse(text);
  }
}

function perbaikiGelarEYD(teks) {
  if (!teks) return '';
  let s = String(teks).trim().replace(/\s+/g, ' ');
  s = s.replace(/^dr\b\.?\s*/i, (m) => m[0] === 'd' ? 'dr. ' : 'Dr. ');
  s = s.replace(/^drs\b\.?\s*/i, 'Drs. ');
  s = s.replace(/^dra\b\.?\s*/i, 'Dra. ');
  s = s.replace(/^ir\b\.?\s*/i, 'Ir. ');
  s = s.replace(/^prof\b\.?\s*/i, 'Prof. ');
  s = s.replace(/^apt\b\.?\s*/i, 'apt. ');
  s = s.replace(/^ns\b\.?\s*/i, 'Ns. ');
  s = s.replace(/^h\b\.?\s+/i, 'H. ');
  s = s.replace(/^hj\b\.?\s+/i, 'Hj. ');

  const kamusGelar = [
    { reg: /\bS\.?\s*Km\.?(?=,|$|\s)/gi, val: 'S.K.M.' },
    { reg: /\bM\.?\s*Km\.?(?=,|$|\s)/gi, val: 'M.K.M.' },
    { reg: /\bM\.?\s*Kes\.?(?=,|$|\s)/gi, val: 'M.Kes.' },
    { reg: /\bM\.?\s*Si\.?(?=,|$|\s)/gi, val: 'M.Si.' },
    { reg: /\bS\.?\s*Ip\.?(?=,|$|\s)/gi, val: 'S.I.P.' },
    { reg: /\bS\.?\s*E\.?(?=,|$|\s)/gi, val: 'S.E.' },
    { reg: /\bM\.?\s*A\.?(?=,|$|\s)/gi, val: 'M.A.' },
    { reg: /\bA\.?\s*Md\.?\s*Farm\.?(?=,|$|\s)/gi, val: 'A.Md.Farm.' }
  ];
  kamusGelar.forEach(item => { s = s.replace(item.reg, item.val); });
  return s;
}

function hapusSemuaGelar(namaLengkap) {
  if (!namaLengkap) return '';
  let bersih = String(namaLengkap).trim();
  if (bersih.includes(',')) bersih = bersih.split(',')[0].trim();
  const regexGelarDepan = /^(prof\.?|dr\.?|drs\.?|dra\.?|ir\.?|apt\.?|ns\.?|h\.?|hj\.?|st\.?|sst\.?)\s+/i;
  while (regexGelarDepan.test(bersih)) {
    bersih = bersih.replace(regexGelarDepan, '').trim();
  }
  const regexGelarTanpaKoma = /\s+(S\.?K\.?M\.?|M\.?K\.?M\.?|M\.?Kes\.?|M\.?Si\.?|S\.?I\.?P\.?|S\.?E\.?|M\.?A\.?|S\.?H\.?|S\.?Kep\.?|A\.?Md\.?(?:Farm|Keb|Kep|AK)?\.?)$/i;
  while (regexGelarTanpaKoma.test(bersih)) {
    bersih = bersih.replace(regexGelarTanpaKoma, '').trim();
  }
  return bersih;
}

function toTitleCase(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function formatTanggalIndo(dateStr) {
  if (!dateStr) return '-';
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  // Jika input berupa format string YYYY-MM-DD
  const parts = String(dateStr).trim().split(/[-/]/);
  if (parts.length === 3) {
    let y, m, d;
    if (parts[0].length === 4) {
      // Format YYYY-MM-DD
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    } else {
      // Format DD-MM-YYYY atau sejenisnya
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
    }
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 0 && m < 12) {
      const dayFormatted = String(d).padStart(2, '0');
      return `${dayFormatted}-${bulan[m]}-${y}`;
    }
  }

  const dObj = new Date(dateStr);
  if (isNaN(dObj.getTime())) return dateStr;
  const day = String(dObj.getDate()).padStart(2, '0');
  const monthName = bulan[dObj.getMonth()];
  const year = dObj.getFullYear();
  return `${day}-${monthName}-${year}`;
}

function filterDropdownPegawai(keyword) {
  const container = document.getElementById('listDropdownPegawai');
  const kw = keyword.toLowerCase().trim();
  if (!kw) { container.classList.add('hidden'); return; }

  const filtered = statePegawai.filter(p =>
    String(p.nama || '').toLowerCase().includes(kw) ||
    String(p.nip || '').toLowerCase().includes(kw)
  ).slice(0, 50);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Pegawai tidak ditemukan</div>`;
    container.classList.remove('hidden');
    return;
  }

  container.innerHTML = filtered.map(p => {
    const namaEyd = perbaikiGelarEYD(p.nama);
    const namaTanpaGelar = hapusSemuaGelar(p.nama);
    return `
      <div onclick="pilihPegawaiItem('${escapeHtml(p.nip)}')" class="p-2.5 hover:bg-emerald-50 cursor-pointer text-xs transition">
        <div class="font-bold text-slate-900">${escapeHtml(namaTanpaGelar)} <span class="font-normal text-slate-400">(${escapeHtml(namaEyd)})</span></div>
        <div class="text-slate-500">NIP: ${escapeHtml(p.nip)} • ${escapeHtml(p.jabatan || '-')}</div>
      </div>
    `;
  }).join('');
  container.classList.remove('hidden');
}

function pilihPegawaiItem(nip) {
  const peg = statePegawai.find(p => String(p.nip) === String(nip));
  if (!peg) return;

  const namaTanpaGelar = hapusSemuaGelar(peg.nama);
  document.getElementById('inputCariPegawai').value = `${namaTanpaGelar} (${peg.nip})`;
  document.getElementById('nama').value = namaTanpaGelar;
  document.getElementById('nip').value = peg.nip || '';
  document.getElementById('jabatan').value = peg.jabatan || '';
  document.getElementById('golongan').value = peg.golongan || '';
  document.getElementById('no_rekening').value = peg.no_rekening || '';
  if (document.getElementById('bidang')) document.getElementById('bidang').value = peg.bidang || '';
  if (document.getElementById('unit_kerja')) document.getElementById('unit_kerja').value = peg.unit_kerja || '';

  document.getElementById('listDropdownPegawai').classList.add('hidden');
  cekLimitPegawaiForm();
}

// Fitur Riwayat Ketikan (Autocomplete History) pada setiap field teks di Form SPPD
function setupInputHistoryAutocomplete() {
  const fields = ['no_spt', 'no_spd', 'jabatan', 'golongan', 'no_rekening', 'bidang', 'unit_kerja', 'perihal', 'tujuan', 'kota_kabupaten'];
  const historyStorageKey = 'SPPD_INPUT_HISTORY_V1';

  fields.forEach(fieldId => {
    const input = document.getElementById(fieldId);
    if (!input) return;

    const parent = input.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.classList.add('relative');
    }

    let drop = document.getElementById(`hist_drop_${fieldId}`);
    if (!drop) {
      drop = document.createElement('div');
      drop.id = `hist_drop_${fieldId}`;
      drop.className = 'hidden absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-44 overflow-y-auto z-50 divide-y divide-slate-100 text-xs';
      parent.appendChild(drop);
    }

    const renderSuggestions = () => {
      const val = String(input.value || '').toLowerCase().trim();
      const savedHist = JSON.parse(localStorage.getItem(historyStorageKey) || '{}');
      const localArr = savedHist[fieldId] || [];
      const sppdArr = stateSppd.map(x => x[fieldId]).filter(Boolean);
      const pegArr = (fieldId === 'jabatan' || fieldId === 'golongan' || fieldId === 'no_rekening')
        ? statePegawai.map(p => p[fieldId]).filter(Boolean)
        : [];

      const uniqueList = [...new Set([...localArr, ...sppdArr, ...pegArr].map(s => String(s).trim()).filter(Boolean))];
      const matched = val
        ? uniqueList.filter(item => item.toLowerCase().includes(val) && item.toLowerCase() !== val).slice(0, 15)
        : uniqueList.slice(0, 10);

      if (matched.length === 0) {
        drop.classList.add('hidden');
        return;
      }

      drop.innerHTML = matched.map(item => `
        <div onclick="pilihHistoryField('${fieldId}', '${escapeHtml(item).replace(/'/g, "\\'")}')" class="px-3 py-2 hover:bg-teal-50 cursor-pointer text-slate-700 flex items-center gap-2 transition">
          <span class="text-slate-400">🕒</span>
          <span class="truncate">${escapeHtml(item)}</span>
        </div>
      `).join('');
      drop.classList.remove('hidden');
    };

    input.addEventListener('input', renderSuggestions);
    input.addEventListener('focus', renderSuggestions);

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !drop.contains(e.target)) {
        drop.classList.add('hidden');
      }
    });
  });
}

function pilihHistoryField(fieldId, value) {
  const input = document.getElementById(fieldId);
  if (input) {
    input.value = value;
  }
  const drop = document.getElementById(`hist_drop_${fieldId}`);
  if (drop) drop.classList.add('hidden');
}

function simpanKeHistoryLokal(payload) {
  const fields = ['no_spt', 'no_spd', 'jabatan', 'golongan', 'no_rekening', 'bidang', 'unit_kerja', 'perihal', 'tujuan', 'kota_kabupaten'];
  const historyStorageKey = 'SPPD_INPUT_HISTORY_V1';
  const savedHist = JSON.parse(localStorage.getItem(historyStorageKey) || '{}');

  fields.forEach(f => {
    const val = String(payload[f] || '').trim();
    if (!val) return;
    if (!Array.isArray(savedHist[f])) savedHist[f] = [];
    savedHist[f] = [val, ...savedHist[f].filter(x => x !== val)].slice(0, 30);
  });

  localStorage.setItem(historyStorageKey, JSON.stringify(savedHist));
}

function onJenisPerjalananChange() {
  const jenisSelect = document.getElementById('jenis_perjalanan');
  const jenis = jenisSelect.value;

  if (jenis === 'Luar Daerah') {
    jenisSelect.className = 'w-full px-3 py-2 rounded-lg border-2 border-purple-500 bg-purple-50 text-purple-900 font-bold text-sm shadow-xs transition';
    document.getElementById('perihal').value = 'Perjalanan Dinas Luar Daerah';
    if (Number(document.getElementById('biaya_harian').value || 0) === 0) {
      document.getElementById('biaya_harian').value = 150000;
    }
  } else if (jenis === 'E-Tol') {
    jenisSelect.className = 'w-full px-3 py-2 rounded-lg border-2 border-amber-500 bg-amber-50 text-amber-950 font-bold text-sm shadow-xs transition';
    document.getElementById('perihal').value = 'Belanja Jasa Jalan/Tol';
    document.getElementById('biaya_harian').value = 0;
    document.getElementById('biaya_bbm').value = 0;
    document.getElementById('biaya_akomodasi').value = 0;
  } else {
    // Dalam Daerah
    jenisSelect.className = 'w-full px-3 py-2 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-900 font-bold text-sm shadow-xs transition';
    document.getElementById('perihal').value = 'Koordinasi dan Konsultasi Dalam Daerah';
    if (Number(document.getElementById('biaya_harian').value || 0) === 0) {
      document.getElementById('biaya_harian').value = 150000;
    }
  }
  hitungTotalForm();
  cekLimitPegawaiForm();
}

function cekLimitPegawaiForm() {
  const nip = document.getElementById('nip').value.trim();
  const up = document.getElementById('no_up').value;
  const jenis = document.getElementById('jenis_perjalanan').value;
  const currentId = document.getElementById('sppd_id').value;
  const infoBox = document.getElementById('infoFrekuensiPegawai');
  const pesanTolak = document.getElementById('pesanTolakLimit');
  const badgeLimit = document.getElementById('badgeLimitPegawai');

  if (!nip) { infoBox.classList.add('hidden'); return; }

  const riwayatPegawai = stateSppd.filter(x => String(x.nip).trim() === nip && String(x.id) !== String(currentId));
  const jmlDalam = riwayatPegawai.filter(x => x.jenis_perjalanan === 'Dalam Daerah').length;
  const jmlLuar = riwayatPegawai.filter(x => x.jenis_perjalanan === 'Luar Daerah').length;
  const jmlTol = riwayatPegawai.filter(x => x.jenis_perjalanan === 'E-Tol').length;

  // Hitung frekuensi perjalanan dinas (di luar klaim E-Tol)
  const riwayatDinas = riwayatPegawai.filter(x => x.jenis_perjalanan !== 'E-Tol');
  const jmlUpIni = riwayatDinas.filter(x => String(x.no_up || 'UP 1') === up).length;
  const jmlTotal = riwayatDinas.length;
  const totalUangDiterima = riwayatPegawai.reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);

  document.getElementById('txtStatJenisPegawai').textContent = `Dalam: ${jmlDalam}x | Luar: ${jmlLuar}x | E-Tol: ${jmlTol}x`;
  document.getElementById('txtStatUpPegawai').textContent = `${up}: ${jmlUpIni}x (Maks ${PAGU_CONFIG.maxLimitPegawaiPerUp}x) | Total: ${jmlTotal}x`;
  document.getElementById('txtStatUangPegawai').textContent = formatRupiah(totalUangDiterima);

  infoBox.classList.remove('hidden');

  if (jenis !== 'E-Tol' && (jmlUpIni >= PAGU_CONFIG.maxLimitPegawaiPerUp || jmlTotal >= PAGU_CONFIG.maxLimitPegawaiPerTahun)) {
    infoBox.className = 'sm:col-span-2 mt-1 p-3 rounded-xl bg-rose-50 border-2 border-rose-400 text-xs text-rose-950 space-y-1.5';
    badgeLimit.className = 'px-2 py-0.5 rounded bg-rose-600 text-white font-bold';
    badgeLimit.textContent = 'DITOLAK (MELEWATI LIMIT)';
    pesanTolak.classList.remove('hidden');
    pesanTolak.textContent = jmlUpIni >= PAGU_CONFIG.maxLimitPegawaiPerUp
      ? `⛔ SISTEM MENOLAK: Pegawai ini sudah mencapai limit maksimal ${PAGU_CONFIG.maxLimitPegawaiPerUp} kali perjalanan dinas pada pencairan ${up}!`
      : `⛔ SISTEM MENOLAK: Pegawai ini sudah mencapai limit tahunan (${PAGU_CONFIG.maxLimitPegawaiPerTahun} kali)!`;
  } else {
    infoBox.className = 'sm:col-span-2 mt-1 p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 space-y-1.5';
    badgeLimit.className = 'px-2 py-0.5 rounded bg-emerald-600 text-white font-bold';
    badgeLimit.textContent = 'Kuota Tersedia';
    pesanTolak.classList.add('hidden');
  }
}

document.addEventListener('click', function (e) {
  const input = document.getElementById('inputCariPegawai');
  const container = document.getElementById('listDropdownPegawai');
  if (input && container && !input.contains(e.target) && !container.contains(e.target)) {
    container.classList.add('hidden');
  }
});

async function loadInitialData() {
  const badge = document.getElementById('apiStatusBadge');
  try {
    const json = await callBackend('init');
    if (json && json.status === 'success') {
      stateSppd = json.data.sppd || [];
      if (json.data.pegawai && json.data.pegawai.length > 0) {
        statePegawai = json.data.pegawai;
        window.statePegawai = statePegawai;
      }
      if (badge) {
        badge.textContent = '🟢 Terhubung ke Spreadsheet';
        badge.className = 'w-full inline-flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-100 border border-emerald-300/40 shadow-sm text-center';
      }
      refreshUI();
      return;
    }
    throw new Error((json && json.message) || 'Respons server tidak valid');
  } catch (err) {
    console.error('Gagal mengambil data dari server API:', err);
    stateSppd = [];
    if (badge) {
      badge.textContent = '🔴 Koneksi API Terputus';
      badge.className = 'w-full inline-flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-950/60 text-rose-200 border border-rose-400/40 shadow-sm text-center';
    }
    refreshUI();
  }
}

function updateFilterUnitKerjaOptions() {
  const select = document.getElementById('filterUnitKerja');
  if (!select) return;

  const currentVal = select.value;
  // Kumpulkan semua unit kerja unik dari pegawai dan SPPD
  const unitList = new Set();
  (statePegawai || []).forEach(p => {
    if (p.unit_kerja && p.unit_kerja.trim()) unitList.add(p.unit_kerja.trim());
    if (p.bidang && p.bidang.trim()) unitList.add(p.bidang.trim());
  });
  (stateSppd || []).forEach(s => {
    if (s.unit_kerja && s.unit_kerja.trim()) unitList.add(s.unit_kerja.trim());
    if (s.bidang && s.bidang.trim()) unitList.add(s.bidang.trim());
  });

  const sortedUnits = Array.from(unitList).sort((a, b) => a.localeCompare(b, 'id'));
  select.innerHTML = `<option value="ALL">Semua Unit Kerja / Bidang</option>` +
    sortedUnits.map(u => `<option value="${escapeHtml(u)}" ${u === currentVal ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');
}

function getFilteredSppd() {
  const filterUp = document.getElementById('filterUp').value;
  const filterJenis = document.getElementById('filterJenis').value;
  const filterUkEl = document.getElementById('filterUnitKerja');
  const filterUk = filterUkEl ? filterUkEl.value : 'ALL';
  const keyword = document.getElementById('searchSppd').value.toLowerCase();

  return stateSppd.filter(item => {
    const matchUp = filterUp === 'ALL' || (item.no_up || 'UP 1') === filterUp;
    const matchJenis = filterJenis === 'ALL' || item.jenis_perjalanan === filterJenis;

    // Pencocokan filter Unit Kerja / Bidang
    let matchUk = true;
    if (filterUk !== 'ALL') {
      const peg = statePegawai.find(p => String(p.nip).trim() === String(item.nip).trim());
      const itemUk = String(item.unit_kerja || (peg ? peg.unit_kerja : '') || '').toLowerCase().trim();
      const itemBid = String(item.bidang || (peg ? peg.bidang : '') || '').toLowerCase().trim();
      const targetUk = filterUk.toLowerCase().trim();
      matchUk = itemUk === targetUk || itemBid === targetUk;
    }

    const text = `${item.nama} ${item.nip} ${item.no_spt} ${item.no_spd} ${item.bidang || ''} ${item.unit_kerja || ''} ${item.perihal} ${item.tujuan} ${item.kota_kabupaten}`.toLowerCase();
    return matchUp && matchJenis && matchUk && text.includes(keyword);
  });
}

function refreshUI() {
  updateFilterUnitKerjaOptions();
  renderStats();
  renderPaguAlerts();
  renderSppdTable();
  if (typeof window.renderPegawaiTable === 'function') {
    window.renderPegawaiTable();
  }
  if (document.getElementById('countPegawaiTab')) {
    document.getElementById('countPegawaiTab').textContent = (statePegawai || []).length;
  }
  updateSelectedBadge();
}

function getTriwulanFromDate(dateStr) {
  const m = new Date(dateStr || new Date()).getMonth() + 1;
  if (m <= 3) return 'TW1';
  if (m <= 6) return 'TW2';
  if (m <= 9) return 'TW3';
  return 'TW4';
}

function getTrimesterFromDate(dateStr) {
  const m = new Date(dateStr || new Date()).getMonth() + 1;
  if (m <= 4) return 'TM1';
  if (m <= 8) return 'TM2';
  return 'TM3';
}

function stylePaguBox(boxId, txtPaguId, txtSisaId, paguVal, realisasiVal) {
  const box = document.getElementById(boxId);
  const txtPagu = document.getElementById(txtPaguId);
  const txtSisa = document.getElementById(txtSisaId);
  if (!box || !txtPagu || !txtSisa) return false;

  const sisa = paguVal - realisasiVal;
  txtPagu.textContent = `Pagu: ${formatRupiah(paguVal)}`;

  if (sisa <= 0) {
    box.className = 'p-3 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white border border-rose-700 shadow-sm transition-all duration-200 flex flex-col justify-between ring-2 ring-rose-400/40';
    txtPagu.className = 'text-xs font-bold text-rose-100 mt-1';
    txtSisa.className = 'text-[11px] font-extrabold text-white mt-2 bg-white/20 px-2 py-0.5 rounded-lg border border-white/30 whitespace-nowrap';
    txtSisa.textContent = `⚠️ HABIS: ${formatRupiah(sisa)}`;
    return true;
  } else {
    box.className = 'p-3 rounded-2xl bg-white border border-slate-200 hover:border-teal-400 hover:shadow-xs transition-all duration-200 flex flex-col justify-between';
    txtPagu.className = 'text-xs font-bold text-slate-800 mt-1';
    txtSisa.className = 'text-[11px] font-bold text-emerald-700 mt-2 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/60 whitespace-nowrap';
    txtSisa.textContent = `Sisa: ${formatRupiah(sisa)}`;
    return false;
  }
}

function renderPaguAlerts() {
  const pTotals = getPaguTotals();
  const realTotal = stateSppd.reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);
  const realDalam = stateSppd.filter(x => x.jenis_perjalanan === 'Dalam Daerah').reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);
  const realLuar = stateSppd.filter(x => x.jenis_perjalanan === 'Luar Daerah').reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);
  const realEtol = stateSppd.filter(x => x.jenis_perjalanan === 'E-Tol').reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);

  const filterUpVal = document.getElementById('filterUp').value;
  const upTarget = filterUpVal === 'ALL' ? 'UP 1' : filterUpVal;
  document.getElementById('lblUpAktif').textContent = upTarget;
  const realUp = stateSppd.filter(x => String(x.no_up || 'UP 1') === upTarget).reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);

  const twTarget = document.getElementById('selectPantauTriwulan').value;
  document.getElementById('lblTriwulan').textContent = twTarget;
  const realTw = stateSppd.filter(x => getTriwulanFromDate(x.tgl_berangkat) === twTarget).reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);

  const tmTarget = document.getElementById('selectPantauTrimester').value;
  document.getElementById('lblTrimester').textContent = tmTarget;
  const realTm = stateSppd.filter(x => getTrimesterFromDate(x.tgl_berangkat) === tmTarget).reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);

  const m1 = stylePaguBox('boxPaguTotal', 'txtPaguTotal', 'txtSisaPaguTotal', pTotals.total, realTotal);
  const m2 = stylePaguBox('boxPaguDalam', 'txtPaguDalam', 'txtSisaPaguDalam', pTotals.dalamDaerah, realDalam);
  const m3 = stylePaguBox('boxPaguLuar', 'txtPaguLuar', 'txtSisaPaguLuar', pTotals.luarDaerah, realLuar);
  const m4 = stylePaguBox('boxPaguEtol', 'txtPaguEtol', 'txtSisaPaguEtol', pTotals.etol, realEtol);
  const m5 = stylePaguBox('boxPaguUp', 'txtPaguUp', 'txtSisaPaguUp', PAGU_CONFIG.perUp, realUp);
  const m6 = stylePaguBox('boxPaguTriwulan', 'txtPaguTriwulan', 'txtSisaPaguTriwulan', PAGU_CONFIG.perTriwulan, realTw);
  const m7 = stylePaguBox('boxPaguTrimester', 'txtPaguTrimester', 'txtSisaPaguTrimester', PAGU_CONFIG.perTrimester, realTm);

  const badgeGlobal = document.getElementById('badgeStatusGlobalPagu');
  const quickStatus = document.getElementById('quickSummaryStatus');
  const quickSisa = document.getElementById('quickSummarySisaPagu');
  const sisaPaguTotal = pTotals.total - realTotal;

  if (quickSisa) {
    quickSisa.textContent = formatRupiah(sisaPaguTotal);
  }

  if (m1 || m2 || m3 || m4 || m5 || m6 || m7) {
    if (badgeGlobal) {
      badgeGlobal.className = 'w-full sm:w-auto text-center justify-center sm:justify-start px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-600 text-white animate-pulse flex items-center gap-1';
      badgeGlobal.textContent = '⚠️ PERINGATAN: Ada Pagu Anggaran yang Habis / Terlampaui!';
    }
    if (quickStatus) {
      quickStatus.className = 'font-bold text-rose-600 animate-pulse';
      quickStatus.textContent = '⚠️ Pagu Habis!';
    }
  } else {
    if (badgeGlobal) {
      badgeGlobal.className = 'w-full sm:w-auto text-center justify-center sm:justify-start px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs flex items-center gap-1';
      badgeGlobal.textContent = '✅ Seluruh Pagu Anggaran Aman';
    }
    if (quickStatus) {
      quickStatus.className = 'font-bold text-emerald-700';
      quickStatus.textContent = '✅ Aman';
    }
  }
}

function renderStats() {
  const listDalam = stateSppd.filter(x => x.jenis_perjalanan === 'Dalam Daerah');
  const listLuar = stateSppd.filter(x => x.jenis_perjalanan === 'Luar Daerah');
  const listEtol = stateSppd.filter(x => x.jenis_perjalanan === 'E-Tol');

  const nominalDalam = listDalam.reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);
  const nominalLuar = listLuar.reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);
  const nominalEtol = listEtol.reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);
  const totalGabungan = nominalDalam + nominalLuar + nominalEtol;

  document.getElementById('statTotalSppd').textContent = stateSppd.length;
  document.getElementById('statSubTotalSppd').textContent = `${listDalam.length} Dalam • ${listLuar.length} Luar • ${listEtol.length} E-Tol`;

  document.getElementById('statDalamDaerah').textContent = listDalam.length;
  document.getElementById('statBiayaDalam').textContent = formatRupiah(nominalDalam);

  document.getElementById('statLuarDaerah').textContent = listLuar.length;
  document.getElementById('statBiayaLuar').textContent = formatRupiah(nominalLuar);

  document.getElementById('statEtolCount').textContent = listEtol.length;
  document.getElementById('statBiayaEtol').textContent = formatRupiah(nominalEtol);

  document.getElementById('statTotalBiaya').textContent = formatRupiah(totalGabungan);
  document.getElementById('statSubRealisasiGabungan').textContent = `Dalam (${formatRupiah(nominalDalam)}) + Luar (${formatRupiah(nominalLuar)}) + Tol (${formatRupiah(nominalEtol)})`;

  const quickRealisasi = document.getElementById('quickSummaryRealisasi');
  if (quickRealisasi) {
    quickRealisasi.textContent = formatRupiah(totalGabungan);
  }
}

function toggleMobileDashboard(forceState) {
  const paguGrid = document.getElementById('gridPaguCards');
  const statsGrid = document.getElementById('gridStatsCards');
  const quickBar = document.getElementById('mobileQuickSummaryBar');
  const headerPagu = document.getElementById('headerPaguCard');
  const txtBtn = document.getElementById('txtToggleMobileDashboard');
  const iconBtn = document.getElementById('iconToggleMobileDashboard');
  if (!paguGrid || !statsGrid) return;

  const isCurrentlyHidden = paguGrid.classList.contains('max-md:hidden');
  const shouldShow = (typeof forceState === 'boolean') ? forceState : isCurrentlyHidden;

  if (shouldShow) {
    paguGrid.classList.remove('max-md:hidden');
    statsGrid.classList.remove('max-md:hidden');
    if (quickBar) quickBar.classList.add('hidden');
    if (headerPagu) {
      headerPagu.classList.add('mb-4', 'pb-3.5', 'border-b');
    }
    if (txtBtn) txtBtn.textContent = 'Tutup';
    if (iconBtn) iconBtn.style.transform = 'rotate(0deg)';
    localStorage.setItem('SPPD_MOBILE_DASH_COLLAPSED', 'false');
  } else {
    paguGrid.classList.add('max-md:hidden');
    statsGrid.classList.add('max-md:hidden');
    if (quickBar) quickBar.classList.add('hidden');
    if (headerPagu) {
      headerPagu.classList.remove('mb-4', 'pb-3.5', 'border-b');
    }
    if (txtBtn) txtBtn.textContent = 'Buka';
    if (iconBtn) iconBtn.style.transform = 'rotate(180deg)';
    localStorage.setItem('SPPD_MOBILE_DASH_COLLAPSED', 'true');
  }
}

function renderSppdTable() {
  const tbody = document.getElementById('tbodySppd');
  const filtered = getFilteredSppd();
  document.getElementById('tableInfoText').textContent = `Menampilkan ${filtered.length} dari ${stateSppd.length} data`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-slate-400">Belum ada data SPPD / E-Tol yang sesuai filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    // Penanda warna mencolok dan kontras untuk tiap jenis perjalanan:
    // - Dalam Daerah: Biru elektrik / Azure
    // - Luar Daerah: Ungu pekat / Fuchsia-Purple
    // - E-Tol: Amber / Orange cerah
    let badgeHtml = '';
    let rowBorderClass = '';
    let iconJenis = '';

    if (item.jenis_perjalanan === 'Luar Daerah') {
      rowBorderClass = 'border-l-4 border-l-purple-600 bg-purple-50/20';
      iconJenis = '✈️';
      badgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-purple-600 text-white shadow-xs border border-purple-700">
          <span>✈️</span>
          <span>Luar Daerah</span>
        </span>
        <div class="text-[10px] font-mono font-bold text-purple-700 mt-1">5.1.02.04.001.00001</div>
      `;
    } else if (item.jenis_perjalanan === 'E-Tol') {
      rowBorderClass = 'border-l-4 border-l-amber-500 bg-amber-50/20';
      iconJenis = '🛣️';
      badgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500 text-slate-950 shadow-xs border border-amber-600">
          <span>🛣️</span>
          <span>E-Tol</span>
        </span>
        <div class="text-[10px] font-mono font-bold text-amber-800 mt-1">5.1.02.02.01.0054</div>
      `;
    } else {
      // Default: Dalam Daerah
      rowBorderClass = 'border-l-4 border-l-blue-600 bg-blue-50/20';
      iconJenis = '🏙️';
      badgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-600 text-white shadow-xs border border-blue-700">
          <span>🏙️</span>
          <span>Dalam Daerah</span>
        </span>
        <div class="text-[10px] font-mono font-bold text-blue-700 mt-1">5.1.02.04.001.00003</div>
      `;
    }

    const durasi = hitungDurasiHari(item.tgl_berangkat, item.tgl_kembali);

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${rowBorderClass}">
        <td class="py-3 px-4 align-top text-center">
          <input type="checkbox" ${selectedIds.has(String(item.id)) ? 'checked' : ''} onchange="toggleSelectOne('${item.id}', this.checked)" class="rounded border-slate-300" />
        </td>
        <td class="py-3 px-4 align-top">
          <div class="font-semibold text-slate-900">${escapeHtml(item.no_spt)}</div>
          <div class="text-xs text-slate-500">SPD/Ref: ${escapeHtml(item.no_spd)}</div>
          <div class="mt-1"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${escapeHtml(item.no_up || 'UP 1')}</span></div>
        </td>
        <td class="py-3 px-4 align-top">
          ${badgeHtml}
        </td>
        <td class="py-3 px-4 align-top">
          <div class="font-semibold text-slate-900">${escapeHtml(toTitleCase(hapusSemuaGelar(item.nama)))}</div>
          <div class="text-xs text-slate-500">NIP: ${escapeHtml(item.nip)} • ${escapeHtml(item.jabatan)}</div>
          ${(item.bidang || item.unit_kerja) ? `<div class="text-[11px] text-teal-800 font-semibold mt-0.5">🏢 ${escapeHtml([item.bidang, item.unit_kerja].filter(Boolean).join(' • '))}</div>` : ''}
          <div class="text-xs font-mono text-emerald-700">Rek BJB: ${escapeHtml(item.no_rekening || '-')}</div>
        </td>
        <td class="py-3 px-4 align-top max-w-xs">
          <div class="text-slate-800 font-medium line-clamp-2">${escapeHtml(item.perihal)}</div>
          <div class="text-xs text-slate-500 mt-0.5">📍 ${escapeHtml(item.tujuan)} (${escapeHtml(item.kota_kabupaten)})</div>
        </td>
        <td class="py-3 px-4 align-top whitespace-nowrap text-xs text-slate-600">
          <div>Tgl: <strong>${escapeHtml(formatTanggalIndo(item.tgl_berangkat))}</strong></div>
          <div>Selesai: <strong>${escapeHtml(formatTanggalIndo(item.tgl_kembali))}</strong> <span class="text-[10px] text-teal-700 font-bold">(${durasi} hr)</span></div>
        </td>
        <td class="py-3 px-4 align-top text-right font-bold text-emerald-700 whitespace-nowrap">
          ${formatRupiah(item.total_biaya)}
        </td>
        <td class="py-3 px-4 align-top text-center whitespace-nowrap">
          <div class="inline-flex space-x-1">
            <button onclick="printSppd('${item.id}')" title="Cetak Kwitansi / SPD" class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs">🖨️</button>
            <button onclick="editSppd('${item.id}')" title="Edit Data" class="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs">✏️</button>
            <button onclick="hapusSppd('${item.id}')" title="Hapus Data" class="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openPaguModal() {
  const n = PAGU_CONFIG.npd || DEFAULT_PAGU.npd;
  document.getElementById('cfgPaguUp').value = PAGU_CONFIG.perUp;
  document.getElementById('cfgPaguTriwulan').value = PAGU_CONFIG.perTriwulan;
  document.getElementById('cfgPaguTrimester').value = PAGU_CONFIG.perTrimester;
  document.getElementById('cfgLimitUp').value = PAGU_CONFIG.maxLimitPegawaiPerUp;
  document.getElementById('cfgLimitTahun').value = PAGU_CONFIG.maxLimitPegawaiPerTahun;

  ['tol', 'luar', 'dalam'].forEach(k => {
    for (let i = 0; i < 4; i++) {
      document.getElementById(`${k}_tw${i + 1}`).value = n[k].tw[i] || 0;
      document.getElementById(`${k}_ak${i + 1}`).value = n[k].ak[i] || 0;
    }
  });

  document.getElementById('modalPaguConfig').classList.remove('hidden');
  document.getElementById('modalPaguConfig').classList.add('flex');
}

function closePaguModal() {
  document.getElementById('modalPaguConfig').classList.add('hidden');
  document.getElementById('modalPaguConfig').classList.remove('flex');
}

function savePaguConfig(e) {
  e.preventDefault();
  const npd = { tol: { tw: [], ak: [] }, luar: { tw: [], ak: [] }, dalam: { tw: [], ak: [] } };
  ['tol', 'luar', 'dalam'].forEach(k => {
    for (let i = 0; i < 4; i++) {
      npd[k].tw.push(Number(document.getElementById(`${k}_tw${i + 1}`).value || 0));
      npd[k].ak.push(Number(document.getElementById(`${k}_ak${i + 1}`).value || 0));
    }
  });

  PAGU_CONFIG = {
    perUp: Number(document.getElementById('cfgPaguUp').value || 0),
    perTriwulan: Number(document.getElementById('cfgPaguTriwulan').value || 0),
    perTrimester: Number(document.getElementById('cfgPaguTrimester').value || 0),
    maxLimitPegawaiPerUp: Number(document.getElementById('cfgLimitUp').value || 106),
    maxLimitPegawaiPerTahun: Number(document.getElementById('cfgLimitTahun').value || 106),
    npd
  };
  localStorage.setItem('SPPD_PAGU_CONFIG_V2', JSON.stringify(PAGU_CONFIG));
  closePaguModal();
  renderPaguAlerts();
  twAlert('Berhasil Disimpan', 'Konfigurasi Pagu, Triwulan, dan Limit Pegawai telah diperbarui.', 'success');
}

function toggleSelectOne(id, checked) {
  if (checked) selectedIds.add(String(id));
  else selectedIds.delete(String(id));
  updateSelectedBadge();
}

function toggleSelectAll(checked) {
  const filtered = getFilteredSppd();
  filtered.forEach(item => {
    if (checked) selectedIds.add(String(item.id));
    else selectedIds.delete(String(item.id));
  });
  renderSppdTable();
  updateSelectedBadge();
}

function updateSelectedBadge() {
  document.getElementById('selectedCountBadge').textContent = `${selectedIds.size} Dipilih`;
}

function getTargetItemsForDoc() {
  if (selectedIds.size > 0) {
    return stateSppd.filter(x => selectedIds.has(String(x.id)));
  }
  return getFilteredSppd();
}

function openDocConfigModal(type) {
  const items = getTargetItemsForDoc();
  if (items.length === 0 && type !== 'NPD') {
    twAlert('Data Kosong', 'Tidak ada data SPPD / E-Tol untuk dicetak!', 'warning');
    return;
  }
  document.getElementById('docTypeInput').value = type;
  const dinasItems = items.filter(x => x.jenis_perjalanan === 'Dalam Daerah' || x.jenis_perjalanan === 'Luar Daerah');
  const countPegawaiSI = new Set(dinasItems.map(x => (x.nip && x.nip.trim()) || hapusSemuaGelar(x.nama).toLowerCase())).size;

  const titles = {
    SI: `Cetak Rekapitulasi Transfer Bank BJB (${countPegawaiSI} Penerima)`,
    NDPP: `Cetak Nota Dinas Permohonan Pembayaran - NDPP (${items.length} Baris)`,
    NPD: `Cetak Nota Pencairan Dana (NPD Review UP/TUP)`,
    TAKTIS: `Cetak Taktis Uang Harian 20% (${countPegawaiSI} Penerima)`
  };
  document.getElementById('docModalTitle').textContent = titles[type] || 'Parameter Cetak Dokumen';
  const modal = document.getElementById('modalDocConfig');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeDocConfigModal() {
  const modal = document.getElementById('modalDocConfig');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function confirmPrintDoc(e) {
  e.preventDefault();
  const type = document.getElementById('docTypeInput').value;
  const items = getTargetItemsForDoc();
  const cfg = {
    nomorSurat: document.getElementById('docNomorSurat').value,
    noDpa: document.getElementById('docNoDpa').value,
    namaRekSumber: document.getElementById('docNamaRekSumber').value,
    noRekSumber: document.getElementById('docNoRekSumber').value,
    namaKpa: document.getElementById('docNamaKpa').value,
    nipKpa: document.getElementById('docNipKpa').value,
    ktpKpa: document.getElementById('docKtpKpa').value,
    namaBpp: document.getElementById('docNamaBpp').value,
    nipBpp: document.getElementById('docNipBpp').value,
    ktpBpp: document.getElementById('docKtpBpp').value,
    namaPptk: document.getElementById('docNamaPptk').value,
    nipPptk: document.getElementById('docNipPptk').value
  };

  closeDocConfigModal();
  if (type === 'SI') renderPrintSI(items, cfg);
  else if (type === 'NDPP') renderPrintNDPP(items, cfg);
  else if (type === 'NPD') renderPrintNPDReview(items, cfg);
  else if (type === 'TAKTIS') renderPrintTaktis(items, cfg);
}

// KOP SURAT RESMI DINAS KESEHATAN KOTA TANGERANG SELATAN (PERSIS TEMPLATE)
function buildKopSuratHtml() {
  return `
    <div class="relative flex items-center justify-center border-b-4 border-double border-black pb-2 mb-2">
      <img src="${LOGO_TANGSEL}" alt="Logo Tangsel" class="w-16 h-16 object-contain absolute left-2 top-0" onerror="this.style.display='none'" />
      <div class="text-center">
        <div class="text-base font-bold uppercase tracking-wide">PEMERINTAH KOTA TANGERANG SELATAN</div>
        <div class="text-lg font-extrabold uppercase tracking-wide">DINAS KESEHATAN</div>
        <div class="text-[11px] font-semibold">Jalan Cendekia Kelurahan Ciater Kecamatan Serpong. Kota Tangerang Selatan</div>
        <div class="text-[11px] font-semibold">Telepon. 021-29307897. Fax. 021-29307989. Kode Pos : 15310</div>
      </div>
    </div>
  `;
}

// 1. CETAK SI (REKAPITULASI TRANSFER BANK BJB) — GABUNGAN PER NAMA PER TOTAL PENCAIRAN
function renderPrintSI(items, cfg) {
  // Filter hanya perjalanan dinas (Dalam Daerah dan Luar Daerah), mengecualikan E-Tol
  const dinasItems = items.filter(x => x.jenis_perjalanan === 'Dalam Daerah' || x.jenis_perjalanan === 'Luar Daerah');

  // Mengelompokkan / agregasi per nama (menggunakan NIP atau Nama sebagai kunci pengelompokan)
  const groupedMap = new Map();
  dinasItems.forEach(item => {
    const namaPolos = toTitleCase(hapusSemuaGelar(item.nama));
    const key = (item.nip && item.nip.trim() !== '') ? item.nip.trim() : namaPolos.toLowerCase();

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        nama: namaPolos,
        nip: item.nip,
        no_rekening: item.no_rekening || '',
        total_biaya: 0,
        count: 0
      });
    }

    const rec = groupedMap.get(key);
    rec.total_biaya += Number(item.total_biaya || 0);
    rec.count += 1;
    if (!rec.no_rekening && item.no_rekening) {
      rec.no_rekening = item.no_rekening;
    }
  });

  const groupedItems = Array.from(groupedMap.values());
  // Urutkan per abjad nama (A-Z)
  groupedItems.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));

  const totalNominal = groupedItems.reduce((s, x) => s + Number(x.total_biaya || 0), 0);

  const rowsHtml = groupedItems.map((item, idx) => {
    return `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td>${escapeHtml(item.nama)}</td>
        <td class="text-center">BJB</td>
        <td class="text-center font-mono">${escapeHtml(item.no_rekening || '-')}</td>
        <td class="text-right">${Number(item.total_biaya || 0).toLocaleString('id-ID')}</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right font-semibold">${Number(item.total_biaya || 0).toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  const printArea = document.getElementById('printArea');
  printArea.innerHTML = `
    <div class="leading-snug text-black">
      ${buildKopSuratHtml()}
      <div class="text-center font-bold mb-2">Rekapitulasi Transfer</div>

      <table class="w-full mb-2">
        <tr><td class="w-36 font-bold">Nomor Surat</td><td class="w-3">:</td><td>${escapeHtml(cfg.nomorSurat)}</td></tr>
        <tr><td class="font-bold">Sifat</td><td>:</td><td>PENTING</td></tr>
        <tr><td class="font-bold">Lampiran</td><td>:</td><td>-</td></tr>
        <tr>
          <td class="align-top font-bold">Hal</td>
          <td class="align-top">:</td>
          <td class="uppercase">PEMBAYARAN UANG KEGIATAN ADMINISTRASI UMUM PERANGKAT DAERAH SUB KEGIATAN PENYELENGGARAAN RAPAT KOORDINASI DAN KONSULTASI SKPD SUBBAG. UMUM DAN KEPEGAWAIAN</td>
        </tr>
      </table>

      <div class="mb-2 text-[11px]">
        <div>Kepada Yth.</div>
        <div>BJB Cabang BSD</div>
        <div>Di Tempat</div>
      </div>

      <div class="mb-1 text-[11px]">Yang bertanda tangan dibawah ini,</div>
      <table class="w-full mb-2 text-[11px]">
        <tr>
          <td class="w-44 align-top">Nama (sesuai spesimen)</td>
          <td class="w-3 align-top">:</td>
          <td>
            <div>1. ${escapeHtml(hapusSemuaGelar(cfg.namaKpa))}</div>
            <div>2. ${escapeHtml(hapusSemuaGelar(cfg.namaBpp))}</div>
          </td>
        </tr>
        <tr>
          <td class="align-top">No. KTP</td>
          <td class="align-top">:</td>
          <td>
            <div>1. ${escapeHtml(cfg.ktpKpa)}</div>
            <div>2. ${escapeHtml(cfg.ktpBpp)}</div>
          </td>
        </tr>
        <tr><td>Atas Nama Rekening</td><td>:</td><td>${escapeHtml(cfg.namaRekSumber)}</td></tr>
        <tr><td>No. Rekening</td><td>:</td><td>${escapeHtml(cfg.noRekSumber)}</td></tr>
      </table>

      <div class="mb-2 text-[11px]">Maka dengan ini kami mohon kepada Saudara untuk dapat melakukan pemindahbukuan dan mentransfer sejumlah dana sesuai dengan rincian sebagai berikut:</div>

      <table class="w-full border-collapse doc-table text-[10px] mb-2">
        <thead>
          <tr class="bg-gray-100 font-bold text-center">
            <th rowspan="2" class="w-8">NO</th>
            <th rowspan="2">ATAS NAMA REKENING</th>
            <th rowspan="2" class="w-14">NAMA BANK</th>
            <th rowspan="2" class="w-28">NO REKENING</th>
            <th rowspan="2" class="w-24">NOMINAL</th>
            <th rowspan="2" class="w-20">PAJAK DAERAH</th>
            <th colspan="4">PAJAK</th>
            <th rowspan="2" class="w-28">JUMLAH DIBAYAR</th>
          </tr>
          <tr class="bg-gray-100 font-bold text-center">
            <th class="w-14">PPN</th>
            <th class="w-14">PPH21</th>
            <th class="w-14">PPH22</th>
            <th class="w-14">PPH23</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="font-bold">
            <td colspan="4" class="text-center py-1.5">TOTAL KESELURUHAN</td>
            <td class="text-right">${totalNominal.toLocaleString('id-ID')}</td>
            <td class="text-right">-</td>
            <td class="text-right">-</td>
            <td class="text-right">-</td>
            <td class="text-right">-</td>
            <td class="text-right">-</td>
            <td class="text-right">Rp &nbsp;&nbsp;&nbsp; ${totalNominal.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>

      <div class="mb-2 font-bold text-[11px]">Terbilang : ${terbilangRupiah(totalNominal)}</div>
      <div class="mb-4 text-[10.5px]">
        Demikian Rekapitulasi Transfer kami buat untuk dipergunakan sebagaimana mestinya dan akibat apapun yang mungkin timbul dari pelaksanaan pemindah bukuan dan transfer berdasarkan Rekapitulasi Transfer ini menjadi tanggung jawab kami.
      </div>

      <div class="grid grid-cols-2 text-center mt-4 text-[11px]">
        <div>
          <div class="font-bold">DINAS KESEHATAN KOTA TANGERANG SELATAN</div>
          <div class="font-bold">MENGETAHUI</div>
          <div class="font-bold">KUASA PENGGUNA ANGGARAN</div>
          <div class="h-16"></div>
          <div class="font-bold underline">${escapeHtml(hapusSemuaGelar(cfg.namaKpa))}</div>
          <div class="font-bold">NIP ${escapeHtml(cfg.nipKpa)}</div>
        </div>
        <div>
          <div class="h-8"></div>
          <div class="font-bold">BENDAHARA PENGELUARAN PEMBANTU</div>
          <div class="h-16"></div>
          <div class="font-bold underline">${escapeHtml(hapusSemuaGelar(cfg.namaBpp))}</div>
          <div class="font-bold">NIP. ${escapeHtml(cfg.nipBpp)}</div>
        </div>
      </div>
    </div>
  `;
  triggerPrint();
}

// 2. CETAK NDPP (NOTA DINAS PERMOHONAN PEMBAYARAN) — PEMISAHAN PER NAMA PER KODRING PERJALANAN DINAS & URUT ABJAD
function renderPrintNDPP(items, cfg) {
  const groups = [
    { no: 1, kodring: '5.1.02.02.01.0054', uraian: 'Belanja Jasa Jalan/Tol', rawList: items.filter(x => x.jenis_perjalanan === 'E-Tol') },
    { no: 2, kodring: '5.1.02.04.001.00001', uraian: 'Belanja Perjalanan Dinas Biasa', rawList: items.filter(x => x.jenis_perjalanan === 'Luar Daerah') },
    { no: 3, kodring: '5.1.02.04.001.00003', uraian: 'Belanja Perjalanan Dinas Dalam Kota', rawList: items.filter(x => x.jenis_perjalanan === 'Dalam Daerah') }
  ].filter(g => g.rawList.length > 0);

  // Proses agregasi per nama untuk setiap kelompok kode rekening
  groups.forEach(g => {
    const mapNama = new Map();
    g.rawList.forEach(item => {
      const namaFormatted = toTitleCase(hapusSemuaGelar(item.nama));
      const key = (item.nip && item.nip.trim() !== '') ? item.nip.trim() : namaFormatted.toLowerCase();

      if (!mapNama.has(key)) {
        const peg = statePegawai.find(p => String(p.nip).trim() === String(item.nip).trim());
        const npwp = peg && peg.npwp ? peg.npwp : '';
        mapNama.set(key, {
          nama: namaFormatted,
          nip: item.nip || '',
          npwp: npwp,
          no_rekening: item.no_rekening || (peg ? peg.no_rekening : '') || '-',
          tgl_berangkat: item.tgl_berangkat,
          total_biaya: 0,
          count: 0
        });
      }

      const rec = mapNama.get(key);
      rec.total_biaya += Number(item.total_biaya || 0);
      rec.count += 1;
      if (!rec.no_rekening || rec.no_rekening === '-') {
        if (item.no_rekening) rec.no_rekening = item.no_rekening;
      }
      if (!rec.npwp) {
        const peg = statePegawai.find(p => String(p.nip).trim() === String(item.nip).trim());
        if (peg && peg.npwp) rec.npwp = peg.npwp;
      }
    });

    const aggregatedList = Array.from(mapNama.values());
    // Urutkan per abjad nama (A-Z)
    aggregatedList.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
    g.list = aggregatedList;
  });

  const totalNominal = groups.reduce((acc, g) => acc + g.list.reduce((s, x) => s + Number(x.total_biaya || 0), 0), 0);

  let rowsHtml = '';
  groups.forEach((g, gIdx) => {
    g.list.forEach((item, idx) => {
      rowsHtml += `
        <tr>
          <td class="text-center">${idx === 0 ? (gIdx + 1) : ''}</td>
          <td class="text-center">${idx === 0 ? g.kodring : ''}</td>
          <td>${idx === 0 ? g.uraian : ''}</td>
          <td class="text-center">${escapeHtml(formatTanggalIndo(item.tgl_berangkat))}</td>
          <td class="text-center">${escapeHtml(item.npwp || '')}</td>
          <td>${escapeHtml(item.nama)}</td>
          <td class="text-center">BJB</td>
          <td class="text-center font-mono">${escapeHtml(item.no_rekening || '-')}</td>
          <td class="text-right">Rp &nbsp; ${Number(item.total_biaya || 0).toLocaleString('id-ID')}</td>
          <td class="text-right">Rp -</td>
          <td class="text-right">Rp -</td>
          <td class="text-right">Rp -</td>
          <td class="text-right">Rp -</td>
          <td class="text-right">Rp -</td>
          <td class="text-right font-semibold">Rp &nbsp; ${Number(item.total_biaya || 0).toLocaleString('id-ID')}</td>
        </tr>
      `;
    });
  });

  const printArea = document.getElementById('printArea');
  printArea.innerHTML = `
    <div class="leading-snug text-black">
      ${buildKopSuratHtml()}
      <div class="font-bold uppercase mb-1">NOTA DINAS PERMOHONAN PEMBAYARAN</div>
      <table class="w-full mb-2">
        <tr><td class="w-32 font-bold">Kepada Yth</td><td class="w-3">:</td><td>KASUBAG KEUANGAN DINAS KESEHATAN</td></tr>
        <tr><td class="font-bold">Dari</td><td>:</td><td>PEJABAT PELAKSANA TEKNIS KEGIATAN</td></tr>
        <tr><td class="font-bold">Kegiatan</td><td>:</td><td>ADMINISTRASI UMUM PERANGKAT DAERAH</td></tr>
        <tr><td class="font-bold">Sub Kegiatan</td><td>:</td><td>PENYELENGGARAAN RAPAT KOORDINASI DAN KONSULTASI SKPD</td></tr>
        <tr><td class="font-bold">Nomor</td><td>:</td><td>${escapeHtml(cfg.nomorSurat)}</td></tr>
        <tr><td class="font-bold">Sifat</td><td>:</td><td>SEGERA</td></tr>
        <tr><td class="font-bold">Perihal</td><td>:</td><td>PERMOHONAN PEMINDAHBUKUAN DAN TRANSFER DANA</td></tr>
      </table>

      <div class="mb-1">Dengan ini mohon kepada Bendahara Pengeluaran untuk dapat melakukan pemindahbukuan dan transfer dari :</div>
      <table class="w-full mb-1.5">
        <tr><td class="w-32">Nomor Rekening</td><td class="w-3">:</td><td>${escapeHtml(cfg.noRekSumber)}</td></tr>
        <tr><td>Nama Rekening</td><td>:</td><td>${escapeHtml(cfg.namaRekSumber)}</td></tr>
      </table>
      <div class="mb-2 font-bold">Kepada pihak penerima dengan sejumlah dana sebagai berikut :</div>

      <table class="w-full border-collapse doc-table text-[9.5px] mb-3">
        <thead>
          <tr class="bg-gray-100 font-bold text-center">
            <th rowspan="2" class="w-6">NO</th>
            <th rowspan="2" class="w-28">KODRING KEGIATAN</th>
            <th rowspan="2" class="w-36">URAIAN</th>
            <th rowspan="2" class="w-28">TANGGAL KEGIATAN</th>
            <th rowspan="2" class="w-28">NO NPWP</th>
            <th rowspan="2">ATAS NAMA REKENING</th>
            <th rowspan="2" class="w-12">NAMA BANK</th>
            <th rowspan="2" class="w-24">NO REKENING</th>
            <th rowspan="2" class="w-24">NOMINAL</th>
            <th rowspan="2" class="w-16">PAJAK DAERAH</th>
            <th colspan="4">PAJAK</th>
            <th rowspan="2" class="w-24">JUMLAH DIBAYARKAN</th>
          </tr>
          <tr class="bg-gray-100 font-bold text-center">
            <th class="w-12">PPN</th>
            <th class="w-12">PPH21</th>
            <th class="w-12">PPH22</th>
            <th class="w-12">PPH23</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="font-bold">
            <td colspan="14" class="text-right py-1.5"></td>
            <td class="text-right">Rp &nbsp; ${totalNominal.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>

      <div class="grid grid-cols-2 mt-6 text-[11px]">
        <div></div>
        <div class="text-center">
          <div class="font-bold">PPTK</div>
          <div class="h-16"></div>
          <div class="font-bold underline uppercase">${escapeHtml(hapusSemuaGelar(cfg.namaPptk))}</div>
          <div>NIP.${escapeHtml(cfg.nipPptk)}</div>
        </div>
      </div>
    </div>
  `;
  triggerPrint();
}

// 3. CETAK NPD REVIEW (NOTA PENCAIRAN DANA UP/TUP) — PERSIS GAMBAR 3 BESERTA PERHITUNGANNYA
function renderPrintNPDReview(items, cfg) {
  const n = PAGU_CONFIG.npd || DEFAULT_PAGU.npd;

  // Hitung Pencairan Saat Ini dari item yang dipilih / aktif
  const cairTol = items.filter(x => x.jenis_perjalanan === 'E-Tol').reduce((s, x) => s + Number(x.total_biaya || 0), 0);
  const cairLuar = items.filter(x => x.jenis_perjalanan === 'Luar Daerah').reduce((s, x) => s + Number(x.total_biaya || 0), 0);
  const cairDalam = items.filter(x => x.jenis_perjalanan === 'Dalam Daerah').reduce((s, x) => s + Number(x.total_biaya || 0), 0);
  const totalCairSaatIni = cairTol + cairLuar + cairDalam;

  const barisData = [
    { no: 1, kode: '5.1.02.02.01.0054', uraian: 'Belanja Jasa Jalan/Tol', tw: n.tol.tw, ak: n.tol.ak, cair: cairTol },
    { no: 2, kode: '5.1.02.04.001.00001', uraian: 'Belanja Perjalanan Dinas Biasa', tw: n.luar.tw, ak: n.luar.ak, cair: cairLuar },
    { no: 3, kode: '5.1.02.04.001.00003', uraian: 'Belanja Perjalanan Dinas Dalam Kota', tw: n.dalam.tw, ak: n.dalam.ak, cair: cairDalam }
  ];

  let totAnggaran = 0;
  const totTw = [0, 0, 0, 0];
  const totAk = [0, 0, 0, 0];
  const totSisa = [0, 0, 0, 0];

  const rowsHtml = barisData.map(b => {
    const anggaran = b.tw.reduce((a, v) => a + Number(v || 0), 0);
    totAnggaran += anggaran;
    const sisa = [0, 1, 2, 3].map(i => {
      const s = Number(b.tw[i] || 0) - Number(b.ak[i] || 0);
      totTw[i] += Number(b.tw[i] || 0);
      totAk[i] += Number(b.ak[i] || 0);
      totSisa[i] += s;
      return s;
    });

    const fmt = (v) => v === 0 ? '-' : Number(v).toLocaleString('id-ID');
    return `
      <tr>
        <td class="text-center">${b.no}</td>
        <td>${b.kode}</td>
        <td>${b.uraian}</td>
        <td class="text-right">${fmt(anggaran)}</td>
        <td class="text-right">${fmt(b.tw[0])}</td>
        <td class="text-right">${fmt(b.tw[1])}</td>
        <td class="text-right">${fmt(b.tw[2])}</td>
        <td class="text-right">${fmt(b.tw[3])}</td>
        <td class="text-right">${fmt(b.ak[0])}</td>
        <td class="text-right">${fmt(b.ak[1])}</td>
        <td class="text-right">${fmt(b.ak[2])}</td>
        <td class="text-right">${fmt(b.ak[3])}</td>
        <td class="text-right">${fmt(sisa[0])}</td>
        <td class="text-right">${fmt(sisa[1])}</td>
        <td class="text-right">${fmt(sisa[2])}</td>
        <td class="text-right">${fmt(sisa[3])}</td>
        <td class="text-right font-semibold">${fmt(b.cair)}</td>
      </tr>
    `;
  }).join('');

  const fmtTot = (v) => v === 0 ? '-' : Number(v).toLocaleString('id-ID');

  const printArea = document.getElementById('printArea');
  printArea.innerHTML = `
    <div class="text-[9.5px] leading-tight text-black font-sans border border-black p-2">
      ${buildKopSuratHtml()}
      <div class="text-center font-bold uppercase leading-snug mb-2">
        <div>NOTA PENCAIRAN DANA (NPD) UP/TUP</div>
        <div>TAHUN ANGGARAN 2026</div>
        <div>Nomor : ${escapeHtml(cfg.nomorSurat)}</div>
      </div>

      <div class="border-t border-b border-black py-1 mb-1 font-semibold">
        <div>BENDAHARA PENGELUARAN</div>
        <div>SKPD : DINAS KESEHATAN KOTA TANGERANG SELATAN</div>
      </div>

      <table class="w-full mb-2 text-[9.5px]">
        <tr><td class="w-6 font-bold">A</td><td class="w-40">NO DPA/DPAP</td><td>: ${escapeHtml(cfg.noDpa)}</td></tr>
        <tr><td class="font-bold">B</td><td>PROGRAM</td><td>: PENUNJANG URUSAN PEMERINTAAN DAERAH</td></tr>
        <tr><td class="font-bold">C</td><td>KEGIATAN</td><td>: ADMINISTRASI UMUM PERANGKAT DAERAH</td></tr>
        <tr><td class="font-bold">D</td><td>JUMLAH DANA YANG DIMINTA</td><td>: Rp ${totalCairSaatIni.toLocaleString('id-ID')}</td></tr>
        <tr><td></td><td>TERBILANG</td><td class="underline italic">${terbilangRupiah(totalCairSaatIni)}</td></tr>
      </table>

      <div class="text-center font-bold border-t border-l border-r border-black py-1 bg-gray-50">Pembebanan pada Kode Rekening :</div>
      <table class="w-full border-collapse doc-table text-[8.5px] mb-1">
        <thead>
          <tr class="bg-gray-100 font-bold text-center">
            <th class="w-6">No</th>
            <th class="w-24">Kode Rekening</th>
            <th class="w-36">Uraian</th>
            <th>Anggaran</th>
            <th>TW 1</th>
            <th>TW 2</th>
            <th>TW 3</th>
            <th>TW 4</th>
            <th>Akumulasi Pencairan Sebelumnya TW 1</th>
            <th>Akumulasi Pencairan Sebelumnya TW 2</th>
            <th>Akumulasi Pencairan Sebelumnya TW 3</th>
            <th>Akumulasi Pencairan Sebelumnya TW 4</th>
            <th>Sisa TW 1</th>
            <th>Sisa TW 2</th>
            <th>Sisa TW 3</th>
            <th>Sisa TW 4</th>
            <th>Pencairan Saat ini</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="17" class="font-semibold bg-gray-50">SUB KEGIATAN 1.02.01.2.06.0009 Penyelenggaraan Rapat Koordinasi dan Konsultasi SKPD</td>
          </tr>
          ${rowsHtml}
          <tr class="font-bold bg-gray-50">
            <td colspan="3" class="text-center">Total</td>
            <td class="text-right">${fmtTot(totAnggaran)}</td>
            <td class="text-right">${fmtTot(totTw[0])}</td>
            <td class="text-right">${fmtTot(totTw[1])}</td>
            <td class="text-right">${fmtTot(totTw[2])}</td>
            <td class="text-right">${fmtTot(totTw[3])}</td>
            <td class="text-right">${fmtTot(totAk[0])}</td>
            <td class="text-right">${fmtTot(totAk[1])}</td>
            <td class="text-right">${fmtTot(totAk[2])}</td>
            <td class="text-right">${fmtTot(totAk[3])}</td>
            <td class="text-right">${fmtTot(totSisa[0])}</td>
            <td class="text-right">${fmtTot(totSisa[1])}</td>
            <td class="text-right">${fmtTot(totSisa[2])}</td>
            <td class="text-right">${fmtTot(totSisa[3])}</td>
            <td class="text-right">${fmtTot(totalCairSaatIni)}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex justify-between items-center font-bold border border-black p-1.5 mb-1">
        <span>JUMLAH DANA YANG DIMINTA : ${terbilangRupiah(totalCairSaatIni)}</span>
        <span>${totalCairSaatIni.toLocaleString('id-ID')}</span>
      </div>

      <table class="w-full border border-black text-[9.5px] mb-3">
        <tr class="border-b border-black"><td class="w-36 p-1">Jumlah yang dibayar</td><td class="w-8 p-1">Rp</td><td class="p-1 font-bold">${totalCairSaatIni.toLocaleString('id-ID')}</td></tr>
        <tr class="border-b border-black"><td class="p-1">Terbilang</td><td colspan="2" class="p-1">${terbilangRupiah(totalCairSaatIni)}</td></tr>
        <tr><td class="p-1">Koreksi</td><td colspan="2" class="p-1">:</td></tr>
      </table>

      <div class="grid grid-cols-2 text-center mt-4 text-[10px]">
        <div>
          <div>Menyetujui</div>
          <div>Kuasa Pengguna Anggaran</div>
          <div class="h-14"></div>
          <div class="font-bold underline">${escapeHtml(hapusSemuaGelar(cfg.namaKpa))}</div>
          <div>NIP ${escapeHtml(cfg.nipKpa)}</div>
        </div>
        <div>
          <div>Tangerang Selatan, Oktober 2026</div>
          <div>Pejabat Pelaksana Teknis Kegiatan</div>
          <div class="h-14"></div>
          <div class="font-bold underline">${escapeHtml(hapusSemuaGelar(cfg.namaPptk))}</div>
          <div>NIP. ${escapeHtml(cfg.nipPptk)}</div>
        </div>
      </div>
    </div>
  `;
  triggerPrint();
}

// 4. CETAK REKAPITULASI TAKTIS 20% DARI TOTAL UANG HARIAN PER PERJALANAN DINAS
function renderPrintTaktis(items, cfg) {
  // Hanya ambil perjalanan dinas Dalam Daerah dan Luar Daerah (abaikan E-Tol)
  const dinasItems = items.filter(x => x.jenis_perjalanan === 'Dalam Daerah' || x.jenis_perjalanan === 'Luar Daerah');

  const groupedMap = new Map();
  dinasItems.forEach(item => {
    const namaFormatted = toTitleCase(hapusSemuaGelar(item.nama));
    const key = (item.nip && item.nip.trim() !== '') ? item.nip.trim() : namaFormatted.toLowerCase();

    if (!groupedMap.has(key)) {
      const peg = statePegawai.find(p => String(p.nip).trim() === String(item.nip).trim());
      const unitKerja = item.unit_kerja || item.bidang || (peg ? (peg.unit_kerja || peg.bidang || '') : '') || '-';
      groupedMap.set(key, {
        nama: namaFormatted,
        nip: item.nip || '',
        no_rekening: item.no_rekening || (peg ? peg.no_rekening : '') || '-',
        unit_kerja: unitKerja,
        total_uang_harian: 0,
        taktis_20: 0,
        count: 0
      });
    }

    const rec = groupedMap.get(key);
    const uangHarianItem = Number(item.biaya_harian || 0);
    rec.total_uang_harian += uangHarianItem;
    rec.count += 1;
    if ((!rec.unit_kerja || rec.unit_kerja === '-') && (item.unit_kerja || item.bidang)) {
      rec.unit_kerja = item.unit_kerja || item.bidang;
    }
    if ((!rec.no_rekening || rec.no_rekening === '-') && item.no_rekening) {
      rec.no_rekening = item.no_rekening;
    }
  });

  const listTaktis = Array.from(groupedMap.values());
  // Hitung nilai taktis 20%
  listTaktis.forEach(x => {
    x.taktis_20 = Math.round(x.total_uang_harian * 0.20);
  });

  // Urutkan alfabetis sesuai abjad nama (A - Z)
  listTaktis.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));

  const grandTotalHarian = listTaktis.reduce((s, x) => s + x.total_uang_harian, 0);
  const grandTotalTaktis = listTaktis.reduce((s, x) => s + x.taktis_20, 0);

  const rowsHtml = listTaktis.map((item, idx) => {
    return `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td>${escapeHtml(item.nama)}</td>
        <td class="text-center font-mono">${escapeHtml(item.no_rekening || '-')}</td>
        <td class="text-right">${Number(item.total_uang_harian).toLocaleString('id-ID')}</td>
        <td>${escapeHtml(item.unit_kerja)}</td>
        <td class="text-right font-semibold">${Number(item.taktis_20).toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  const printArea = document.getElementById('printArea');
  printArea.innerHTML = `
    <div class="leading-snug text-black">
      ${buildKopSuratHtml()}
      <div class="text-center font-bold mb-1 uppercase">DAFTAR PENERIMAAN TAKTIS UANG HARIAN PERJALANAN DINAS (20%)</div>
      <div class="text-center text-xs font-semibold mb-3">DINAS KESEHATAN KOTA TANGERANG SELATAN — TAHUN ANGGARAN 2026</div>

      <table class="w-full mb-2">
        <tr><td class="w-36 font-bold">Nomor Dokumen</td><td class="w-3">:</td><td>${escapeHtml(cfg.nomorSurat)}</td></tr>
        <tr><td class="font-bold">Kegiatan</td><td class="w-3">:</td><td class="uppercase">ADMINISTRASI UMUM PERANGKAT DAERAH (SUB KEGIATAN PENYELENGGARAAN RAPAT KOORDINASI DAN KONSULTASI SKPD)</td></tr>
        <tr><td class="font-bold">Ketentuan Taktis</td><td class="w-3">:</td><td>Besaran Taktis dihitung 20% dari Total Akumulasi Uang Harian Perjalanan Dinas</td></tr>
      </table>

      <table class="w-full border-collapse doc-table text-[11px] mb-3">
        <thead>
          <tr class="bg-gray-100 font-bold text-center">
            <th class="w-10">No Urut</th>
            <th>Nama</th>
            <th class="w-32">No Rekening</th>
            <th class="w-36">Total Uang Harian (Rp)</th>
            <th class="w-48">Unit Kerja</th>
            <th class="w-36">Taktis 20% (Rp)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="font-bold bg-gray-50">
            <td colspan="3" class="text-center py-2">TOTAL KESELURUHAN</td>
            <td class="text-right">Rp ${grandTotalHarian.toLocaleString('id-ID')}</td>
            <td></td>
            <td class="text-right">Rp ${grandTotalTaktis.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>

      <div class="mb-3 text-[11px]">
        <div><strong>Terbilang Total Taktis (20%) :</strong> <em>${terbilangRupiah(grandTotalTaktis)}</em></div>
      </div>

      <div class="grid grid-cols-2 text-center mt-6 text-[11px]">
        <div>
          <div class="font-bold">MENGETAHUI</div>
          <div class="font-bold">KUASA PENGGUNA ANGGARAN</div>
          <div class="h-16"></div>
          <div class="font-bold underline">${escapeHtml(hapusSemuaGelar(cfg.namaKpa))}</div>
          <div>NIP ${escapeHtml(cfg.nipKpa)}</div>
        </div>
        <div>
          <div class="font-bold">PEJABAT PELAKSANA TEKNIS KEGIATAN</div>
          <div class="font-bold">PPTK</div>
          <div class="h-16"></div>
          <div class="font-bold underline">${escapeHtml(hapusSemuaGelar(cfg.namaPptk))}</div>
          <div>NIP. ${escapeHtml(cfg.nipPptk)}</div>
        </div>
      </div>
    </div>
  `;
  triggerPrint();
}

function buildRekapHtmlTable(items, jenisLabel) {
  let totTrans = 0, totBbm = 0, totHar = 0, totAko = 0, totAll = 0;
  const rows = items.map((x, i) => {
    totTrans += Number(x.biaya_transport || 0);
    totBbm += Number(x.biaya_bbm || 0);
    totHar += Number(x.biaya_harian || 0);
    totAko += Number(x.biaya_akomodasi || 0);
    totAll += Number(x.total_biaya || 0);
    return `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center;">${i + 1}</td>
        <td style="border:1px solid #000;padding:4px;">${escapeHtml(x.no_spt)}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">${escapeHtml(x.tgl_spt)}</td>
        <td style="border:1px solid #000;padding:4px;">${escapeHtml(x.no_spd)}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">${escapeHtml(x.tgl_spd)}</td>
        <td style="border:1px solid #000;padding:4px;">${escapeHtml(hapusSemuaGelar(x.nama))}</td>
        <td style="border:1px solid #000;padding:4px;">${escapeHtml(x.jabatan)}</td>
        <td style="border:1px solid #000;padding:4px;">${escapeHtml(x.perihal)}</td>
        <td style="border:1px solid #000;padding:4px;">${escapeHtml(x.tujuan)}</td>
        <td style="border:1px solid #000;padding:4px;">${escapeHtml(x.kota_kabupaten)}</td>
        <td style="border:1px solid #000;padding:4px;mso-number-format:'\\@';">${escapeHtml(x.no_rekening)}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">${escapeHtml(x.tgl_berangkat)}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">${escapeHtml(x.tgl_kembali)}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">${Number(x.biaya_transport || 0).toLocaleString('id-ID')}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">${Number(x.biaya_bbm || 0).toLocaleString('id-ID')}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">${Number(x.biaya_harian || 0).toLocaleString('id-ID')}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">${Number(x.biaya_akomodasi || 0).toLocaleString('id-ID')}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;font-weight:bold;">${Number(x.total_biaya || 0).toLocaleString('id-ID')}</td>
        <td style="border:1px solid #000;padding:4px;mso-number-format:'\\@';">${escapeHtml(x.nip)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family:Arial,sans-serif;font-size:10px;">
      <h3 style="margin:2px 0;font-weight:bold;">REKAPITULASI BELANJA PERJALANAN DINAS & E-TOL (${jenisLabel.toUpperCase()})</h3>
      <p style="margin:2px 0;font-weight:bold;">KEGIATAN ADMINISTRASI UMUM PERANGKAT DAERAH (1.02.01.2.06)</p>
      <p style="margin:2px 0;font-weight:bold;">SUB KEGIATAN PENYELENGGARAAN RAPAT KOORDINASI DAN KONSULTASI SKPD (1.02.01.2.06.0009)</p>
      <p style="margin:2px 0 10px 0;font-weight:bold;">TAHUN ANGGARAN 2026</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #000;font-size:9px;">
        <thead>
          <tr style="background:#f1f5f9;font-weight:bold;text-align:center;">
            <th rowspan="2" style="border:1px solid #000;padding:4px;">NO.</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">NO. SPT</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">TGL SPT</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">NO. SPD</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">TGL SPD</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">NAMA (TANPA GELAR)</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">JABATAN</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">PERIHAL</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">TUJUAN</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">KOTA/KAB</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">NO. REKENING</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">TGL BERANGKAT</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">TGL KEMBALI</th>
            <th colspan="4" style="border:1px solid #000;padding:4px;">BIAYA</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">TOTAL</th>
            <th rowspan="2" style="border:1px solid #000;padding:4px;">NIP</th>
          </tr>
          <tr style="background:#f1f5f9;font-weight:bold;text-align:center;">
            <th style="border:1px solid #000;padding:4px;">Transport / Tol</th>
            <th style="border:1px solid #000;padding:4px;">BBM</th>
            <th style="border:1px solid #000;padding:4px;">Uang Harian</th>
            <th style="border:1px solid #000;padding:4px;">Akomodasi</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="font-weight:bold;background:#f8fafc;">
            <td colspan="13" style="border:1px solid #000;padding:5px;text-align:center;">JUMLAH TOTAL</td>
            <td style="border:1px solid #000;padding:5px;text-align:right;">${totTrans.toLocaleString('id-ID')}</td>
            <td style="border:1px solid #000;padding:5px;text-align:right;">${totBbm.toLocaleString('id-ID')}</td>
            <td style="border:1px solid #000;padding:5px;text-align:right;">${totHar.toLocaleString('id-ID')}</td>
            <td style="border:1px solid #000;padding:5px;text-align:right;">${totAko.toLocaleString('id-ID')}</td>
            <td style="border:1px solid #000;padding:5px;text-align:right;">${totAll.toLocaleString('id-ID')}</td>
            <td style="border:1px solid #000;padding:5px;"></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function exportRekapExcel() {
  const items = getTargetItemsForDoc();
  if (items.length === 0) return twAlert('Data Kosong', 'Tidak ada data untuk di-export ke Excel.', 'warning');
  const filterJenis = document.getElementById('filterJenis').value;
  const label = filterJenis === 'ALL' ? 'SEMUA JENIS' : filterJenis;
  const htmlContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"></head>
    <body>${buildRekapHtmlTable(items, label)}</body></html>
  `;
  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rekap_SPPD_${label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function cetakRekapSppd() {
  const items = getTargetItemsForDoc();
  if (items.length === 0) return twAlert('Data Kosong', 'Tidak ada data untuk dicetak.', 'warning');
  const filterJenis = document.getElementById('filterJenis').value;
  const label = filterJenis === 'ALL' ? 'SEMUA JENIS' : filterJenis;
  const printArea = document.getElementById('printArea');
  printArea.innerHTML = buildRekapHtmlTable(items, label);
  triggerPrint();
}

function triggerPrint() {
  const printArea = document.getElementById('printArea');
  printArea.classList.remove('hidden');
  setTimeout(() => {
    window.print();
    printArea.classList.add('hidden');
  }, 150);
}

function terbilangSingle(n) {
  const kata = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  n = Math.floor(n);
  if (n < 12) return kata[n];
  if (n < 20) return terbilangSingle(n - 10) + " Belas";
  if (n < 100) return terbilangSingle(Math.floor(n / 10)) + " Puluh " + terbilangSingle(n % 10);
  if (n < 200) return "Seratus " + terbilangSingle(n - 100);
  if (n < 1000) return terbilangSingle(Math.floor(n / 100)) + " Ratus " + terbilangSingle(n % 100);
  if (n < 2000) return "Seribu " + terbilangSingle(n - 1000);
  if (n < 1000000) return terbilangSingle(Math.floor(n / 1000)) + " Ribu " + terbilangSingle(n % 1000);
  if (n < 1000000000) return terbilangSingle(Math.floor(n / 1000000)) + " Juta " + terbilangSingle(n % 1000000);
  if (n < 1000000000000) return terbilangSingle(Math.floor(n / 1000000000)) + " Miliar " + terbilangSingle(n % 1000000000);
  return "";
}

function terbilangRupiah(num) {
  if (!num || num <= 0) return "Nol Rupiah";
  return terbilangSingle(num).replace(/\s+/g, ' ').trim() + " Rupiah";
}

// Fungsi bantu menghitung selisih hari (inklusif: tanggal sama = 1 hari)
function hitungDurasiHari(tglMulai, tglSelesai) {
  if (!tglMulai || !tglSelesai) return 1;
  const d1 = new Date(tglMulai);
  const d2 = new Date(tglSelesai);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1;
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : 1;
}

function openSppdModal(defaultJenisOrItem = null) {
  ensureTupOptionsInSelects();
  const modal = document.getElementById('modalSppd');
  const form = document.getElementById('formSppd');
  form.reset();
  document.getElementById('inputCariPegawai').value = '';
  document.getElementById('infoFrekuensiPegawai').classList.add('hidden');
  const today = new Date().toISOString().split('T')[0];

  const editItem = (defaultJenisOrItem && typeof defaultJenisOrItem === 'object') ? defaultJenisOrItem : null;
  const presetJenis = (typeof defaultJenisOrItem === 'string') ? defaultJenisOrItem : 'Dalam Daerah';

  if (editItem) {
    document.getElementById('modalSppdTitle').textContent = 'Edit Data SPPD / E-Tol';
    document.getElementById('sppd_id').value = editItem.id;
    document.getElementById('no_up').value = editItem.no_up || 'UP 1';
    document.getElementById('jenis_perjalanan').value = editItem.jenis_perjalanan || 'Dalam Daerah';
    document.getElementById('no_spt').value = editItem.no_spt || '';
    document.getElementById('tgl_spt').value = editItem.tgl_spt || today;
    document.getElementById('no_spd').value = editItem.no_spd || '';
    document.getElementById('tgl_spd').value = editItem.tgl_spd || today;

    const namaPolos = hapusSemuaGelar(editItem.nama);
    document.getElementById('inputCariPegawai').value = `${namaPolos} (${editItem.nip})`;
    document.getElementById('nama').value = namaPolos;
    document.getElementById('nip').value = editItem.nip || '';
    document.getElementById('jabatan').value = editItem.jabatan || '';
    document.getElementById('golongan').value = editItem.golongan || '';
    document.getElementById('no_rekening').value = editItem.no_rekening || '';
    if (document.getElementById('bidang')) document.getElementById('bidang').value = editItem.bidang || '';
    if (document.getElementById('unit_kerja')) document.getElementById('unit_kerja').value = editItem.unit_kerja || '';
    document.getElementById('perihal').value = editItem.perihal || '';
    document.getElementById('tujuan').value = editItem.tujuan || '';
    document.getElementById('kota_kabupaten').value = editItem.kota_kabupaten || '';

    const tBerangkat = editItem.tgl_berangkat || today;
    const tKembali = editItem.tgl_kembali || today;
    document.getElementById('tgl_berangkat').value = tBerangkat;
    document.getElementById('tgl_kembali').value = tKembali;

    const durasi = hitungDurasiHari(tBerangkat, tKembali);
    const totalHarianTersimpan = Number(editItem.biaya_harian || 0);
    // Kembalikan ke tarif per hari di input agar ketika dikalikan durasi hasilnya tetap konsisten
    const tarifPerHari = durasi > 0 ? Math.round(totalHarianTersimpan / durasi) : totalHarianTersimpan;

    document.getElementById('biaya_transport').value = editItem.biaya_transport || 0;
    document.getElementById('biaya_bbm').value = editItem.biaya_bbm || 0;
    document.getElementById('biaya_harian').value = tarifPerHari;
    document.getElementById('biaya_akomodasi').value = editItem.biaya_akomodasi || 0;
    cekLimitPegawaiForm();
  } else {
    document.getElementById('modalSppdTitle').textContent = presetJenis === 'E-Tol' ? '🛣️ Tambah Data Belanja Jasa Jalan / E-Tol' : 'Tambah Data SPPD Baru';
    document.getElementById('sppd_id').value = '';
    document.getElementById('jenis_perjalanan').value = presetJenis;
    document.getElementById('tgl_spt').value = today;
    document.getElementById('tgl_spd').value = today;
    document.getElementById('tgl_berangkat').value = today;
    document.getElementById('tgl_kembali').value = today;
    document.getElementById('kota_kabupaten').value = 'Tangerang Selatan';
    if (document.getElementById('bidang')) document.getElementById('bidang').value = '';
    if (document.getElementById('unit_kerja')) document.getElementById('unit_kerja').value = '';
    if (presetJenis === 'E-Tol') {
      document.getElementById('perihal').value = 'Belanja Jasa Jalan/Tol';
      document.getElementById('biaya_harian').value = 0;
    } else {
      document.getElementById('biaya_harian').value = 150000;
    }
  }

  onJenisPerjalananChange();
  hitungTotalForm();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeSppdModal() {
  const modal = document.getElementById('modalSppd');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Perhitungan Komponen Biaya: Input Uang Harian diketik manual (sebagai tarif/hari), lalu dikalikan durasi hari
function hitungTotalForm() {
  const tglBerangkat = document.getElementById('tgl_berangkat').value;
  const tglKembali = document.getElementById('tgl_kembali').value;
  const durasiHari = hitungDurasiHari(tglBerangkat, tglKembali);

  const t = Number(document.getElementById('biaya_transport').value || 0);
  const b = Number(document.getElementById('biaya_bbm').value || 0);
  const hPerHari = Number(document.getElementById('biaya_harian').value || 0);
  const a = Number(document.getElementById('biaya_akomodasi').value || 0);

  const totalHarian = hPerHari * durasiHari;
  const total = t + b + totalHarian + a;

  const infoHarian = durasiHari > 1 ? ` (Uang Harian: ${formatRupiah(hPerHari)} × ${durasiHari} Hari = ${formatRupiah(totalHarian)})` : '';
  document.getElementById('formTotalDisplay').textContent = `Total (${durasiHari} Hari): ${formatRupiah(total)}${infoHarian}`;
  return total;
}

async function submitSppdForm(e) {
  e.preventDefault();

  const nip = document.getElementById('nip').value.trim();
  const nama = hapusSemuaGelar(document.getElementById('nama').value.trim());
  const jabatan = document.getElementById('jabatan').value.trim();
  const golongan = document.getElementById('golongan').value.trim();
  const no_rekening = document.getElementById('no_rekening').value.trim();
  const bidang = document.getElementById('bidang') ? document.getElementById('bidang').value.trim() : '';
  const unit_kerja = document.getElementById('unit_kerja') ? document.getElementById('unit_kerja').value.trim() : '';
  const up = document.getElementById('no_up').value;
  const jenis = document.getElementById('jenis_perjalanan').value;
  const currentId = document.getElementById('sppd_id').value;

  const tglBerangkat = document.getElementById('tgl_berangkat').value;
  const tglKembali = document.getElementById('tgl_kembali').value;
  const durasiHari = hitungDurasiHari(tglBerangkat, tglKembali);
  const hPerHari = Number(document.getElementById('biaya_harian').value || 0);
  const totalUangHarian = hPerHari * durasiHari;
  const inputTotal = hitungTotalForm();

  // 1. VALIDASI LIMIT PERJALANAN PEGAWAI (Khusus perjalanan dinas Dalam & Luar Daerah)
  if (jenis !== 'E-Tol') {
    const riwayatDinas = stateSppd.filter(x => String(x.nip).trim() === nip && String(x.id) !== String(currentId) && x.jenis_perjalanan !== 'E-Tol');
    const countUp = riwayatDinas.filter(x => String(x.no_up || 'UP 1') === up).length;
    if (countUp >= PAGU_CONFIG.maxLimitPegawaiPerUp) {
      twAlert('Sistem Menolak (Melewati Limit)', `Pegawai dengan NIP ${nip} sudah mencapai batas maksimal (${PAGU_CONFIG.maxLimitPegawaiPerUp} kali) perjalanan dinas pada pencairan ${up}!`, 'error');
      return;
    }
    if (riwayatDinas.length >= PAGU_CONFIG.maxLimitPegawaiPerTahun) {
      twAlert('Sistem Menolak (Melewati Limit)', `Pegawai dengan NIP ${nip} sudah mencapai batas maksimal tahunan (${PAGU_CONFIG.maxLimitPegawaiPerTahun} kali)!`, 'error');
      return;
    }
  }

  // 2. VALIDASI PAGU ANGGARAN
  const pTotals = getPaguTotals();
  const otherItems = stateSppd.filter(x => String(x.id) !== String(currentId));
  const realTotal = otherItems.reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);
  const realJenis = otherItems.filter(x => x.jenis_perjalanan === jenis).reduce((acc, x) => acc + Number(x.total_biaya || 0), 0);

  if ((realTotal + inputTotal) > pTotals.total) {
    twAlert('Anggaran Ditolak', `Total Realisasi akan melebihi Pagu Total Tahunan (${formatRupiah(pTotals.total)})!`, 'error');
    return;
  }
  const paguJenisMax = jenis === 'Dalam Daerah' ? pTotals.dalamDaerah : (jenis === 'Luar Daerah' ? pTotals.luarDaerah : pTotals.etol);
  if ((realJenis + inputTotal) > paguJenisMax) {
    twAlert('Anggaran Ditolak', `Realisasi ${jenis} akan melebihi Pagu ${jenis} (${formatRupiah(paguJenisMax)})!`, 'error');
    return;
  }

  const btn = document.getElementById('btnSubmitSppd');
  btn.disabled = true;
  btn.textContent = '⏳ Menyimpan...';

  // 3. OTOMATIS UPDATE / TAMBAH KE DATABASE MASTER PEGAWAI JIKA JABATAN / GOLONGAN DIISI MANUAL
  if (nip) {
    const existingPeg = statePegawai.find(p => String(p.nip).trim() === nip);
    if (!existingPeg) {
      const newPeg = { nip, nama, jabatan, golongan, no_rekening, bidang, unit_kerja, npwp: '' };
      try {
        await callBackend('createPegawai', newPeg);
        statePegawai.push(newPeg);
      } catch (e) {
        console.warn('Gagal menambahkan pegawai baru secara otomatis:', e);
      }
    } else {
      const perluUpdatePeg =
        (jabatan && existingPeg.jabatan !== jabatan) ||
        (golongan && existingPeg.golongan !== golongan) ||
        (no_rekening && existingPeg.no_rekening !== no_rekening) ||
        (bidang && existingPeg.bidang !== bidang) ||
        (unit_kerja && existingPeg.unit_kerja !== unit_kerja);

      if (perluUpdatePeg) {
        const updatedPeg = {
          ...existingPeg,
          old_nip: existingPeg.nip,
          nip: existingPeg.nip,
          nama: existingPeg.nama || nama,
          jabatan: jabatan || existingPeg.jabatan || '',
          golongan: golongan || existingPeg.golongan || '',
          no_rekening: no_rekening || existingPeg.no_rekening || '',
          bidang: bidang || existingPeg.bidang || '',
          unit_kerja: unit_kerja || existingPeg.unit_kerja || ''
        };
        try {
          await callBackend('updatePegawai', updatedPeg);
          Object.assign(existingPeg, updatedPeg);
        } catch (e) {
          console.warn('Gagal memperbarui jabatan/golongan/unit kerja pegawai otomatis:', e);
        }
      }
    }
  }

  const payload = {
    id: currentId || 'SPPD-' + Date.now(),
    no_up: up,
    jenis_perjalanan: jenis,
    no_spt: document.getElementById('no_spt').value.trim(),
    tgl_spt: document.getElementById('tgl_spt').value,
    no_spd: document.getElementById('no_spd').value.trim(),
    tgl_spd: document.getElementById('tgl_spd').value,
    status: 'Disetujui',
    nama: nama,
    nip: nip,
    jabatan: jabatan,
    golongan: golongan,
    no_rekening: no_rekening,
    bidang: bidang,
    unit_kerja: unit_kerja,
    perihal: document.getElementById('perihal').value.trim(),
    tujuan: document.getElementById('tujuan').value.trim(),
    kota_kabupaten: document.getElementById('kota_kabupaten').value.trim(),
    tgl_berangkat: tglBerangkat,
    tgl_kembali: tglKembali,
    biaya_transport: Number(document.getElementById('biaya_transport').value || 0),
    biaya_bbm: Number(document.getElementById('biaya_bbm').value || 0),
    biaya_harian: totalUangHarian, // Tersimpan hasil perkalian Uang Harian Manual × Durasi Hari
    biaya_akomodasi: Number(document.getElementById('biaya_akomodasi').value || 0),
    total_biaya: inputTotal
  };

  simpanKeHistoryLokal(payload);
  const action = currentId ? 'updateSppd' : 'createSppd';

  try {
    const json = await callBackend(action, payload);
    if (json && json.status === 'success') {
      await loadInitialData();
      closeSppdModal();
      twAlert('Berhasil Disimpan', 'Data SPPD / E-Tol berhasil disimpan ke database.', 'success');
    } else {
      twAlert('Gagal Menyimpan', json.message || 'Kesalahan server saat menyimpan data.', 'error');
    }
  } catch (err) {
    twAlert('Gagal Menyimpan ke Server', err.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = '💾 Simpan Data';
}

function editSppd(id) {
  const item = stateSppd.find(x => String(x.id) === String(id));
  if (item) openSppdModal(item);
}

async function hapusSppd(id) {
  const ok = await twConfirm(
    'Hapus Data SPPD / E-Tol?',
    'Apakah Anda yakin ingin menghapus data perjalanan dinas ini secara permanen?',
    { type: 'warning', confirmText: 'Ya, Hapus', cancelText: 'Batal', danger: true }
  );
  if (!ok) return;
  try {
    await callBackend('deleteSppd', { id });
    selectedIds.delete(String(id));
    await loadInitialData();
    twAlert('Berhasil Dihapus', 'Data SPPD / E-Tol telah dihapus dari database.', 'success');
  } catch (err) {
    twAlert('Gagal Menghapus', err.message, 'error');
  }
}

function printSppd(id) {
  const item = stateSppd.find(x => String(x.id) === String(id));
  if (!item) return;

  const namaPolos = hapusSemuaGelar(item.nama);
  const durasi = hitungDurasiHari(item.tgl_berangkat, item.tgl_kembali);
  const printArea = document.getElementById('printArea');
  printArea.innerHTML = `
    <div class="text-black font-sans text-xs">
      ${buildKopSuratHtml()}
      <h3 class="text-center font-bold underline uppercase my-3">SURAT PERJALANAN DINAS (SPD) & RINCIAN BIAYA</h3>
      <table class="w-full text-xs mb-4 border border-black border-collapse doc-table">
        <tr><td class="w-1/3 font-semibold">Nomor SPT / Tanggal</td><td>${escapeHtml(item.no_spt)} (${escapeHtml(item.tgl_spt)})</td></tr>
        <tr><td class="font-semibold">Nomor SPD / Tanggal</td><td>${escapeHtml(item.no_spd)} (${escapeHtml(item.tgl_spd)})</td></tr>
        <tr><td class="font-semibold">Kelompok UP / Jenis</td><td>${escapeHtml(item.no_up || 'UP 1')} — ${escapeHtml(item.jenis_perjalanan)}</td></tr>
        <tr><td class="font-semibold">Nama Pelaksana / NIP</td><td><strong>${escapeHtml(namaPolos)}</strong> / NIP. ${escapeHtml(item.nip)}</td></tr>
        <tr><td class="font-semibold">Jabatan / Golongan</td><td>${escapeHtml(item.jabatan)} (${escapeHtml(item.golongan || '-')})</td></tr>
        <tr><td class="font-semibold">Perihal</td><td>${escapeHtml(item.perihal)}</td></tr>
        <tr><td class="font-semibold">Tempat Tujuan</td><td>${escapeHtml(item.tujuan)} — ${escapeHtml(item.kota_kabupaten)}</td></tr>
        <tr><td class="font-semibold">Tanggal Pelaksanaan</td><td>${escapeHtml(item.tgl_berangkat)} s/d ${escapeHtml(item.tgl_kembali)} (${durasi} Hari)</td></tr>
        <tr><td class="font-semibold">Nomor Rekening BJB</td><td>${escapeHtml(item.no_rekening || '-')}</td></tr>
      </table>
      <table class="w-full text-xs border border-black border-collapse doc-table mb-3">
        <tr class="bg-gray-100"><th class="text-left">Komponen Biaya</th><th class="text-right">Jumlah (Rp)</th></tr>
        <tr><td>1. Biaya Transportasi / Jasa Jalan Tol</td><td class="text-right">${formatRupiah(item.biaya_transport)}</td></tr>
        <tr><td>2. Biaya BBM</td><td class="text-right">${formatRupiah(item.biaya_bbm)}</td></tr>
        <tr><td>3. Uang Harian (${durasi} Hari)</td><td class="text-right">${formatRupiah(item.biaya_harian)}</td></tr>
        <tr><td>4. Biaya Akomodasi / Penginapan</td><td class="text-right">${formatRupiah(item.biaya_akomodasi)}</td></tr>
        <tr class="font-bold"><td>TOTAL DITERIMA</td><td class="text-right">${formatRupiah(item.total_biaya)}</td></tr>
      </table>
      <p class="italic font-semibold mb-6">Terbilang: # ${terbilangRupiah(item.total_biaya)} #</p>
      <div class="grid grid-cols-2 text-center text-xs mt-8">
        <div>
          <p>Mengetahui,</p>
          <p class="font-semibold">Pejabat Pelaksana Teknis Kegiatan</p>
          <div class="h-16"></div>
          <p class="font-bold underline">IKHSAN PERMANA</p>
          <p>NIP. 19780108 199803 1 002</p>
        </div>
        <div>
          <p>Tangerang Selatan, ${escapeHtml(formatTanggalIndo(item.tgl_spd))}</p>
          <p class="font-semibold">Pegawai Pelaksana Dinas</p>
          <div class="h-16"></div>
          <p class="font-bold underline">${escapeHtml(namaPolos)}</p>
          <p>NIP. ${escapeHtml(item.nip)}</p>
        </div>
      </div>
    </div>
  `;
  triggerPrint();
}

function switchTab(tab) {
  const secSppd = document.getElementById('sectionSppd');
  const secPeg = document.getElementById('sectionPegawai');
  const btnSppd = document.getElementById('tabBtnSppd');
  const btnPeg = document.getElementById('tabBtnPegawai');
  const batchBar = document.getElementById('batchActionBar');
  const containerStats = document.getElementById('containerSppdStats');
  const viewTitle = document.getElementById('currentViewTitle');
  const viewDesc = document.getElementById('currentViewDesc');
  const desktopSppdActions = document.getElementById('desktopSppdActions');

  if (tab === 'sppd') {
    secSppd.classList.remove('hidden');
    secPeg.classList.add('hidden');
    batchBar.classList.remove('hidden');
    if (containerStats) containerStats.classList.remove('hidden');
    if (viewTitle) viewTitle.textContent = 'Daftar SPPD & E-Tol';
    if (viewDesc) viewDesc.textContent = 'Pemerintah Kota Tangerang Selatan • Dinas Kesehatan';
    if (desktopSppdActions) desktopSppdActions.classList.remove('hidden');
    if (btnSppd) {
      btnSppd.className = 'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-teal-600 text-white shadow-sm transition';
    }
    if (btnPeg) {
      btnPeg.className = 'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition';
    }
    if (typeof renderSppdTable === 'function') {
      renderSppdTable();
    }
  } else {
    secSppd.classList.add('hidden');
    secPeg.classList.remove('hidden');
    batchBar.classList.add('hidden');
    if (containerStats) containerStats.classList.add('hidden');
    if (viewTitle) viewTitle.textContent = 'Master Data Pegawai';
    if (viewDesc) viewDesc.textContent = 'Database pegawai, NIP, pangkat/golongan, dan rekening Bank BJB';
    if (desktopSppdActions) desktopSppdActions.classList.add('hidden');
    if (btnPeg) {
      btnPeg.className = 'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-teal-600 text-white shadow-sm transition';
    }
    if (btnSppd) {
      btnSppd.className = 'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition';
    }
    if (typeof window.renderPegawaiTable === 'function') {
      window.renderPegawaiTable();
    }
    if ((!statePegawai || statePegawai.length === 0) && typeof window.loadPegawaiFromDatabase === 'function') {
      window.loadPegawaiFromDatabase(true);
    }
  }
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebarMenu');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  const isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebarMenu');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  if (window.innerWidth < 768) {
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function formatRupiah(num) {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toggleSidebar() {
  if (window.innerWidth < 768) {
    toggleMobileSidebar();
  } else {
    toggleDesktopSidebar();
  }
}

function toggleDesktopSidebar() {
  const sidebar = document.getElementById('sidebarMenu');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('desktop-collapsed');
  document.body.classList.toggle('sidebar-collapsed', isCollapsed);
  localStorage.setItem('SPPD_SIDEBAR_STATE', isCollapsed ? 'collapsed' : 'expanded');
  updateSidebarToggleBtn(isCollapsed);
}

function updateSidebarToggleBtn(isCollapsed) {
  const label = document.getElementById('btnSidebarLabel');
  if (label) {
    label.textContent = isCollapsed ? 'Buka Menu' : 'Sembunyikan';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const savedSidebar = localStorage.getItem('SPPD_SIDEBAR_STATE');
  if (savedSidebar === 'collapsed' && window.innerWidth >= 768) {
    const sidebar = document.getElementById('sidebarMenu');
    if (sidebar) sidebar.classList.add('desktop-collapsed');
    document.body.classList.add('sidebar-collapsed');
    updateSidebarToggleBtn(true);
  }
});

// Global Window Exports for UI onclick handlers
window.toggleSidebar = toggleSidebar;
window.toggleDesktopSidebar = toggleDesktopSidebar;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.switchTab = switchTab;
window.loadInitialData = loadInitialData;
window.openSppdModal = openSppdModal;
window.closeSppdModal = closeSppdModal;
window.openPaguModal = openPaguModal;
window.closePaguModal = closePaguModal;
window.savePaguConfig = savePaguConfig;
window.exportRekapExcel = exportRekapExcel;
window.cetakRekapSppd = cetakRekapSppd;
window.formatRupiah = formatRupiah;
window.formatTanggalIndo = formatTanggalIndo;
window.escapeHtml = escapeHtml;
window.openDocConfigModal = openDocConfigModal;
window.closeDocConfigModal = closeDocConfigModal;
window.confirmPrintDoc = confirmPrintDoc;
window.triggerPrint = triggerPrint;
window.editSppd = editSppd;
window.hapusSppd = hapusSppd;
window.printSppd = printSppd;
window.submitSppdForm = submitSppdForm;
window.hitungTotalForm = hitungTotalForm;
window.onJenisPerjalananChange = onJenisPerjalananChange;
window.toggleSelectOne = toggleSelectOne;
window.toggleSelectAll = toggleSelectAll;
window.renderSppdTable = renderSppdTable;
window.renderStats = renderStats;
window.renderPaguAlerts = renderPaguAlerts;
window.toggleMobileDashboard = toggleMobileDashboard;
window.cekLimitPegawaiForm = cekLimitPegawaiForm;
window.pilihPegawaiItem = pilihPegawaiItem;
window.filterDropdownPegawai = filterDropdownPegawai;
window.pilihHistoryField = pilihHistoryField;
window.openBulkEditModal = openBulkEditModal;
window.closeBulkEditModal = closeBulkEditModal;
window.submitBulkEdit = submitBulkEdit;