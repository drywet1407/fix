/**
 * assets/js/loader-pegawai.js
 * E-SPPD Dinas Kesehatan Kota Tangerang Selatan
 * Modul Khusus Master Data Pegawai: Ambil Langsung dari Database API GAS & Paginasi 50 Baris Data
 */

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// State Master Data Pegawai (Murni dari Database API tanpa cache/dummy)
var statePegawai = [];
window.statePegawai = statePegawai;
let pegawaiCurrentPage = 1;
let pegawaiRowsPerPage = 50;
let pegawaiSearchKeyword = '';
let isPegawaiLoading = false;
let searchPegawaiDebounceTimer = null;

// Bersihkan seluruh cache pegawai lama di localStorage
try {
    ['LOCAL_CACHE_PEGAWAI', 'LOCAL_CACHE_PEGAWAI_V1', 'LOCAL_CACHE_PEGAWAI_V2', 'LOCAL_CACHE_PEGAWAI_V3'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
    });
} catch (e) {}

/**
 * Normalisasi penulisan Gelar Akademik & Profesi sesuai EYD
 */
function perbaikiGelarEYD(teks) {
    if (!teks) return '';
    return teks
        .replace(/\bA\.Md\.Keb\b/gi, 'A.Md.Keb')
        .replace(/\bA\.Md\.Kep\b/gi, 'A.Md.Kep')
        .replace(/\bAmd\.Keb\b/gi, 'A.Md.Keb')
        .replace(/\bAmd\.Kep\b/gi, 'A.Md.Kep')
        .replace(/\bS\.Kep\b/gi, 'S.Kep')
        .replace(/\bM\.Kes\b/gi, 'M.Kes')
        .replace(/\bS\.Tr\.Keb\b/gi, 'S.Tr.Keb')
        .replace(/\bS\.ST\b/gi, 'S.ST')
        .replace(/\bS\.K\.M\b/gi, 'S.KM')
        .replace(/\bSKM\b/gi, 'S.KM')
        .replace(/\bdr\.\b/gi, 'dr.')
        .replace(/\bdrg\.\b/gi, 'drg.')
        .replace(/\bDr\.\b/gi, 'Dr.')
        .replace(/\bNers\b/gi, 'Ners')
        .replace(/\bNs\.\b/gi, 'Ns.')
        .replace(/\s+,/g, ',')
        .trim();
}

/**
 * Hapus Semua Gelar Akademik/Profesi untuk Output Resmi Tanpa Gelar
 */
function hapusSemuaGelar(namaLengkap) {
    if (!namaLengkap) return '';
    let bersih = namaLengkap.replace(/^(dr\.|drg\.|Dr\.|H\.|Hj\.)\s+/i, '');
    bersih = bersih.split(',')[0];
    return bersih.replace(/\s+/g, ' ').trim();
}

/**
 * AMBIL LANGSUNG DATA MASTER PEGAWAI DARI DATABASE API GAS (GOOGLE APPS SCRIPT)
 * @param {boolean} forceRefresh - jika true, paksa fetch ulang dari database
 */
async function loadPegawaiFromDatabase(forceRefresh = true) {
    const tbody = document.getElementById('tbodyPegawai');
    const countTab = document.getElementById('countPegawaiTab');

    // Jika belum ada data, tampilkan indikator loading
    if ((!statePegawai || statePegawai.length === 0) && tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-14 text-center text-slate-500"><div class="inline-flex flex-col items-center justify-center gap-2"><span class="animate-spin text-3xl text-teal-600">⏳</span><span class="font-bold text-slate-700 text-sm">Mengambil Master Data Pegawai Langsung dari Database Google Spreadsheet...</span><span class="text-xs text-slate-400">Menghubungkan ke API Google Apps Script...</span></div></td></tr>`;
    }

    isPegawaiLoading = true;
    try {
        let json = null;
        if (typeof callBackend === 'function') {
            try {
                json = await callBackend('init');
            } catch (e) {
                json = await callBackend('getPegawai');
            }
        } else {
            const res = await fetch('/api/gas?action=init', { method: 'GET', redirect: 'follow' });
            json = await res.json();
        }

        if (json && json.status === 'success') {
            const list = json.data?.pegawai || json.data || [];
            if (Array.isArray(list)) {
                statePegawai = list;
                window.statePegawai = list;
                if (countTab) countTab.textContent = statePegawai.length;
                renderPegawaiTable();
                return;
            }
        }
        throw new Error('Data pegawai tidak ditemukan dalam response server');
    } catch (err) {
        console.error('[Loader Pegawai] Gagal mengambil data dari server API:', err);
        statePegawai = [];
        window.statePegawai = [];
        if (countTab) countTab.textContent = '0';
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-rose-600"><div class="flex flex-col items-center justify-center gap-2"><span class="text-2xl">⚠️</span><span class="font-bold">Gagal mengambil data dari Database Google Apps Script.</span><span class="text-xs text-slate-500">Pastikan Environment Variable GAS_API_URL telah dikonfigurasi di Netlify.</span><button onclick="loadPegawaiFromDatabase(true)" class="mt-2 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow">🔄 Coba Lagi</button></div></td></tr>`;
        }
    } finally {
        isPegawaiLoading = false;
    }
}

/**
 * Filter data pegawai berdasarkan kata kunci pencarian
 */
function getFilteredPegawai() {
    const input = document.getElementById('searchPegawai');
    const kw = (input ? input.value : (pegawaiSearchKeyword || '')).toLowerCase().trim();
    const list = (window.statePegawai && window.statePegawai.length > 0) ? window.statePegawai : statePegawai;
    if (!kw) return list;
    return list.filter(p => {
        const str = `${p.nama || ''} ${p.nip || ''} ${p.jabatan || ''} ${p.golongan || ''} ${p.bidang || ''} ${p.unit_kerja || ''} ${p.no_rekening || ''} ${p.npwp || ''}`.toLowerCase();
        return str.includes(kw);
    });
}

/**
 * RENDER TABEL MASTER PEGAWAI DENGAN PAGINASI STRICT 50 BARIS DATA PER HALAMAN
 */
function renderPegawaiTable() {
    const tbody = document.getElementById('tbodyPegawai');
    if (!tbody) return;

    if (window.statePegawai && window.statePegawai.length > 0) {
        statePegawai = window.statePegawai;
    }

    const countTab = document.getElementById('countPegawaiTab');
    if (countTab) countTab.textContent = (statePegawai || []).length;

    const filtered = getFilteredPegawai();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pegawaiRowsPerPage));

    if (pegawaiCurrentPage > totalPages) {
        pegawaiCurrentPage = totalPages;
    }
    if (pegawaiCurrentPage < 1) {
        pegawaiCurrentPage = 1;
    }

    const startIdx = (pegawaiCurrentPage - 1) * pegawaiRowsPerPage;
    const endIdx = Math.min(startIdx + pegawaiRowsPerPage, totalItems);
    const pageItems = filtered.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
        if (statePegawai.length === 0 && isPegawaiLoading) {
            return;
        }
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400"><div class="flex flex-col items-center justify-center gap-1"><span>🔍</span><span class="font-medium text-slate-500">Pegawai tidak ditemukan.</span><span class="text-xs text-slate-400">Coba cari dengan NIP, nama lengkap, atau jabatan lain.</span></div></td></tr>`;
        renderPegawaiPagination(0, 0, 0, 1);
        return;
    }

    tbody.innerHTML = pageItems.map(p => {
        const namaEyd = perbaikiGelarEYD(p.nama);
        const namaPolos = hapusSemuaGelar(p.nama);
        return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-4 font-mono text-xs text-slate-700 align-top">${escapeHtml(p.nip)}</td>
        <td class="py-3 px-4 align-top">
          <div class="font-semibold text-slate-900 text-sm">${escapeHtml(namaEyd)}</div>
          <div class="text-[11px] text-teal-700 mt-0.5">Output Tanpa Gelar: <strong>${escapeHtml(namaPolos)}</strong></div>
        </td>
        <td class="py-3 px-4 align-top text-xs font-medium text-slate-700">${escapeHtml(p.golongan || '-')}</td>
        <td class="py-3 px-4 align-top text-xs text-slate-600">${escapeHtml(p.jabatan || '-')}</td>
        <td class="py-3 px-4 align-top text-xs text-slate-700">
          <div class="font-semibold text-teal-800">${escapeHtml(p.bidang || '-')}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(p.unit_kerja || '-')}</div>
        </td>
        <td class="py-3 px-4 font-mono text-xs align-top text-slate-700">
          <div class="font-semibold">${escapeHtml(p.no_rekening || '-')}</div>
          ${p.npwp ? `<div class="text-[10px] text-slate-400 mt-0.5">NPWP: ${escapeHtml(p.npwp)}</div>` : ''}
        </td>
        <td class="py-3 px-4 text-center align-top whitespace-nowrap">
          <div class="flex items-center justify-center space-x-1.5">
            <button type="button" onclick="editPegawai('${escapeHtml(p.nip)}')" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition" title="Edit Data Pegawai">✏️ Edit</button>
            <button type="button" onclick="hapusPegawai('${escapeHtml(p.nip)}')" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition" title="Hapus Data Pegawai">🗑️ Hapus</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    renderPegawaiPagination(totalItems, startIdx + 1, endIdx, totalPages);
}

/**
 * Render Kontrol Paginasi (Info bar, tombol nomor halaman, prev/next)
 */
function renderPegawaiPagination(totalItems, start, end, totalPages) {
    let container = document.getElementById('pegawaiPagination');
    if (!container) {
        const secPegawai = document.getElementById('sectionPegawai');
        if (secPegawai) {
            container = document.createElement('div');
            container.id = 'pegawaiPagination';
            container.className = 'px-4 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs';
            secPegawai.appendChild(container);
        } else {
            return;
        }
    }

    if (totalItems === 0) {
        container.innerHTML = `<span class="text-xs text-slate-400">Tidak ada data pegawai untuk ditampilkan.</span>`;
        return;
    }

    let pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, pegawaiCurrentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
    }

    const prevDisabled = pegawaiCurrentPage === 1 ? 'disabled' : '';
    const nextDisabled = pegawaiCurrentPage === totalPages ? 'disabled' : '';

    container.innerHTML = `
        <div class="flex items-center space-x-2 text-slate-600 text-xs font-medium">
            <span>Menampilkan <strong>${start}</strong> - <strong>${end}</strong> dari <strong>${Number(totalItems).toLocaleString('id-ID')}</strong> pegawai</span>
            <span class="text-slate-300">•</span>
            <span class="text-slate-500">Halaman <strong>${pegawaiCurrentPage}</strong> dari <strong>${totalPages}</strong></span>
        </div>

        <div class="flex items-center space-x-1 sm:space-x-1.5">
            <button type="button" onclick="setPegawaiPage(1)" class="pagination-btn" ${prevDisabled} title="Halaman Pertama">
                «
            </button>
            <button type="button" onclick="setPegawaiPage(${pegawaiCurrentPage - 1})" class="pagination-btn" ${prevDisabled} title="Halaman Sebelumnya">
                ‹
            </button>

            ${startPage > 1 ? `<button type="button" onclick="setPegawaiPage(1)" class="pagination-btn">1</button>${startPage > 2 ? '<span class="px-1 text-slate-400">...</span>' : ''}` : ''}

            ${pageNumbers.map(num => `
                <button type="button" onclick="setPegawaiPage(${num})" class="pagination-btn ${num === pegawaiCurrentPage ? 'active' : ''}">
                    ${num}
                </button>
            `).join('')}

            ${endPage < totalPages ? `${endPage < totalPages - 1 ? '<span class="px-1 text-slate-400">...</span>' : ''}<button type="button" onclick="setPegawaiPage(${totalPages})" class="pagination-btn">${totalPages}</button>` : ''}

            <button type="button" onclick="setPegawaiPage(${pegawaiCurrentPage + 1})" class="pagination-btn" ${nextDisabled} title="Halaman Berikutnya">
                ›
            </button>
            <button type="button" onclick="setPegawaiPage(${totalPages})" class="pagination-btn" ${nextDisabled} title="Halaman Terakhir">
                »
            </button>
        </div>

        <div class="flex items-center space-x-2 text-xs">
            <span class="text-slate-500">Per halaman:</span>
            <select onchange="changePegawaiRowsPerPage(this.value)" class="px-2 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 text-xs focus:ring-1 focus:ring-teal-500">
                <option value="25" ${pegawaiRowsPerPage === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${pegawaiRowsPerPage === 50 ? 'selected' : ''}>50 (Standar)</option>
                <option value="100" ${pegawaiRowsPerPage === 100 ? 'selected' : ''}>100</option>
                <option value="200" ${pegawaiRowsPerPage === 200 ? 'selected' : ''}>200</option>
            </select>
        </div>
    `;
}

/**
 * Pindah Halaman Pegawai
 */
function setPegawaiPage(page) {
    pegawaiCurrentPage = Number(page);
    renderPegawaiTable();
    const section = document.getElementById('sectionPegawai');
    if (section && typeof section.scrollIntoView === 'function') {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Ubah Jumlah Baris per Halaman
 */
function changePegawaiRowsPerPage(limit) {
    pegawaiRowsPerPage = parseInt(limit, 10) || 50;
    pegawaiCurrentPage = 1;
    renderPegawaiTable();
}

/**
 * Event Listener Pencarian Pegawai dengan Debounce
 */
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchPegawai');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchPegawaiDebounceTimer);
            searchPegawaiDebounceTimer = setTimeout(() => {
                pegawaiSearchKeyword = e.target.value;
                pegawaiCurrentPage = 1;
                renderPegawaiTable();
            }, 200);
        });
    }
    // Langsung ambil data master pegawai dari Database GAS
    loadPegawaiFromDatabase(true);
});

/**
 * Autocomplete Dropdown Pegawai di Form Modal SPPD
 */
function filterDropdownPegawai(keyword) {
    const container = document.getElementById('listDropdownPegawai');
    if (!container) return;
    const kw = (keyword || '').toLowerCase().trim();

    if (!kw) {
        container.classList.add('hidden');
        return;
    }

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
          <div onclick="pilihPegawaiItem('${escapeHtml(p.nip)}')" class="p-2.5 hover:bg-emerald-50 cursor-pointer text-xs transition border-b border-slate-100 last:border-b-0">
            <div class="font-bold text-slate-900">${escapeHtml(namaTanpaGelar)} <span class="font-normal text-slate-400">(${escapeHtml(namaEyd)})</span></div>
            <div class="text-slate-500">NIP: ${escapeHtml(p.nip)} • ${escapeHtml(p.jabatan || '-')}</div>
          </div>
        `;
    }).join('');
    container.classList.remove('hidden');
}

/**
 * Pilih Pegawai dari Dropdown Autocomplete
 */
function pilihPegawaiItem(nip) {
    const peg = statePegawai.find(p => String(p.nip) === String(nip));
    if (!peg) return;

    const namaTanpaGelar = hapusSemuaGelar(peg.nama);
    const inputCari = document.getElementById('inputCariPegawai');
    const inputNama = document.getElementById('nama');
    const inputNip = document.getElementById('nip');
    const inputJab = document.getElementById('jabatan');
    const inputGol = document.getElementById('golongan');
    const inputRek = document.getElementById('no_rekening');
    const inputBidang = document.getElementById('bidang');
    const inputUnitKerja = document.getElementById('unit_kerja');

    if (inputCari) inputCari.value = `${namaTanpaGelar} (${peg.nip})`;
    if (inputNama) inputNama.value = namaTanpaGelar;
    if (inputNip) inputNip.value = peg.nip || '';
    if (inputJab) inputJab.value = peg.jabatan || '';
    if (inputGol) inputGol.value = peg.golongan || '';
    if (inputRek) inputRek.value = peg.no_rekening || '';
    if (inputBidang) inputBidang.value = peg.bidang || '';
    if (inputUnitKerja) inputUnitKerja.value = peg.unit_kerja || '';

    const container = document.getElementById('listDropdownPegawai');
    if (container) container.classList.add('hidden');

    if (typeof cekLimitPegawaiForm === 'function') {
        cekLimitPegawaiForm();
    }
}

/**
 * Modal Master Pegawai: Buka Modal Tambah
 */
function openPegawaiModal() {
    document.getElementById('peg_edit_mode').value = 'false';
    document.getElementById('peg_old_nip').value = '';
    document.getElementById('modalPegawaiTitle').textContent = 'Tambah Master Pegawai';
    document.getElementById('peg_nip').value = '';
    document.getElementById('peg_nama').value = '';
    document.getElementById('peg_golongan').value = '';
    document.getElementById('peg_norek').value = '';
    document.getElementById('peg_jabatan').value = '';
    document.getElementById('peg_npwp').value = '';
    if (document.getElementById('peg_bidang')) document.getElementById('peg_bidang').value = '';
    if (document.getElementById('peg_unit_kerja')) document.getElementById('peg_unit_kerja').value = '';
    const modal = document.getElementById('modalPegawai');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Modal Master Pegawai: Edit Pegawai
 */
function editPegawai(nip) {
    const p = statePegawai.find(x => String(x.nip) === String(nip));
    if (!p) return;
    document.getElementById('peg_edit_mode').value = 'true';
    document.getElementById('peg_old_nip').value = p.nip;
    document.getElementById('modalPegawaiTitle').textContent = 'Edit Master Pegawai';
    document.getElementById('peg_nip').value = p.nip;
    document.getElementById('peg_nama').value = perbaikiGelarEYD(p.nama);
    document.getElementById('peg_golongan').value = p.golongan || '';
    document.getElementById('peg_norek').value = p.no_rekening || '';
    document.getElementById('peg_jabatan').value = p.jabatan || '';
    document.getElementById('peg_npwp').value = p.npwp || '';
    if (document.getElementById('peg_bidang')) document.getElementById('peg_bidang').value = p.bidang || '';
    if (document.getElementById('peg_unit_kerja')) document.getElementById('peg_unit_kerja').value = p.unit_kerja || '';
    const modal = document.getElementById('modalPegawai');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Tutup Modal Pegawai
 */
function closePegawaiModal() {
    const modal = document.getElementById('modalPegawai');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/**
 * Simpan Data Pegawai ke Database
 */
async function submitPegawaiForm(e) {
    e.preventDefault();
    const isEdit = document.getElementById('peg_edit_mode').value === 'true';
    const payload = {
        old_nip: document.getElementById('peg_old_nip').value.trim(),
        nip: document.getElementById('peg_nip').value.trim(),
        nama: perbaikiGelarEYD(document.getElementById('peg_nama').value.trim()),
        golongan: document.getElementById('peg_golongan').value.trim(),
        jabatan: document.getElementById('peg_jabatan').value.trim(),
        no_rekening: document.getElementById('peg_norek').value.trim(),
        npwp: document.getElementById('peg_npwp').value.trim(),
        bidang: document.getElementById('peg_bidang') ? document.getElementById('peg_bidang').value.trim() : '',
        unit_kerja: document.getElementById('peg_unit_kerja') ? document.getElementById('peg_unit_kerja').value.trim() : ''
    };

    const action = isEdit ? 'updatePegawai' : 'createPegawai';

    try {
        if (typeof callBackend === 'function') {
            await callBackend(action, payload);
        }
        
        if (isEdit) {
            const idx = statePegawai.findIndex(x => String(x.nip) === String(payload.old_nip));
            if (idx !== -1) statePegawai[idx] = payload;
        } else {
            statePegawai.unshift(payload);
        }
        
        closePegawaiModal();
        renderPegawaiTable();
        twAlert('Berhasil Disimpan', 'Data pegawai berhasil disimpan ke database!', 'success');
    } catch (err) {
        twAlert('Gagal Menyimpan Pegawai', err.message, 'error');
    }
}

/**
 * Hapus Pegawai dari Database
 */
async function hapusPegawai(nip) {
    const ok = await twConfirm(
        'Hapus Data Pegawai?',
        'Apakah Anda yakin ingin menghapus data pegawai dengan NIP ' + nip + '?',
        { type: 'warning', confirmText: 'Ya, Hapus', cancelText: 'Batal', danger: true }
    );
    if (!ok) return;
    try {
        if (typeof callBackend === 'function') {
            await callBackend('deletePegawai', { nip });
        }
        statePegawai = statePegawai.filter(x => String(x.nip) !== String(nip));
        renderPegawaiTable();
        twAlert('Berhasil Dihapus', 'Pegawai berhasil dihapus dari database.', 'success');
    } catch (err) {
        twAlert('Gagal Menghapus Pegawai', err.message, 'error');
    }
}

// Global Window Exports
window.statePegawai = statePegawai;
window.perbaikiGelarEYD = perbaikiGelarEYD;
window.hapusSemuaGelar = hapusSemuaGelar;
window.renderPegawaiTable = renderPegawaiTable;
window.loadPegawaiFromDatabase = loadPegawaiFromDatabase;
window.setPegawaiPage = setPegawaiPage;
window.changePegawaiRowsPerPage = changePegawaiRowsPerPage;
window.filterDropdownPegawai = filterDropdownPegawai;
window.pilihPegawaiItem = pilihPegawaiItem;
window.openPegawaiModal = openPegawaiModal;
window.editPegawai = editPegawai;
window.closePegawaiModal = closePegawaiModal;
window.submitPegawaiForm = submitPegawaiForm;
window.hapusPegawai = hapusPegawai;
window.escapeHtml = escapeHtml;
