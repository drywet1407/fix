const SHEET_SPPD = 'data_sppd';
const SHEET_PEGAWAI = 'master_pegawai';

const HEADERS_SPPD = [
  'id', 'no_up', 'jenis_perjalanan', 'no_spt', 'tgl_spt', 'no_spd', 'tgl_spd',
  'nip', 'nama', 'jabatan', 'unit_kerja', 'golongan', 'no_rekening', 'perihal',
  'tujuan', 'kota_kabupaten', 'tgl_berangkat', 'tgl_kembali', 'lama_hari',
  'biaya_transport', 'biaya_bbm', 'biaya_harian', 'biaya_akomodasi',
  'total_biaya', 'status', 'created_at', 'updated_at'
];

// Kolom A..H pada sheet master_pegawai (Kolom H = unit_kerja)
const HEADERS_PEGAWAI = [
  'nip', 'nama', 'golongan', 'jabatan', 'no_rekening', 'nik', 'npwp', 'unit_kerja'
];

const FALLBACK_PEGAWAI = [
  ["'197610152007012007", "dr. Allin Hendalin Mahdaniar, M.K.M.", "IV/b", "Kepala Dinas", "'0008780201101", "", "77.439.979.4-411.000", "Dinas Kesehatan"],
  ["'197710202001121005", "Indra Gunawan, S.K.M., M.Si.", "IV/a", "Sekretaris", "'0087301273102", "", "", "Dinas Kesehatan"],
  ["'197006042005011007", "dr. Tulus Muladiyono", "IV/b", "Direktur RSUD Serpong Utara", "'0009355367101", "", "", "RSUD Serpong Utara"],
  ["'197705142006041019", "dr. Adhy Purnawan, M.Kes.", "IV/a", "Direktur RSUD Pondok Aren", "'0012621752100", "", "", "RSUD Pondok Aren"],
  ["'197205191992032005", "Lilis Suryani, S.K.M., M.Kes.", "IV/a", "Kabid Kesmas", "'0008778833101", "", "", "Dinas Kesehatan"],
  ["'197011242005022002", "dr. Eliwedi Erni", "IV/a", "Kabid P2P", "'0014070524101", "", "", "Dinas Kesehatan"],
  ["'196707131988031008", "Ridwan, S.I.P.", "III/d", "Kabid SDK", "'0008780773102", "", "", "Dinas Kesehatan"],
  ["'198405202010011009", "Syahlan King Syahnan Siregar, S.E., M.A.", "IV/a", "Kabag TU", "'0009475753100", "3674042005840006", "", "Dinas Kesehatan"],
  ["'196610141990032006", "Dedeh Ruhtika, S.I.P., M.A.", "IV/a", "Kasubbag Keuangan", "'0008780463101", "", "", "Dinas Kesehatan"],
  ["'197801081998031002", "Ikhsan Permana, A.Md.Farm.", "III/c", "Kasubbag Umum Dan Kepegawaian", "'0008779457101", "", "", "Dinas Kesehatan"]
];

function doGet(e) {
  if (e && e.parameter && (e.parameter.action === 'init' || e.parameter.action === 'getPegawai')) {
    const res = getInitialDataServer();
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('E-SPPD — Dinas Kesehatan Kota Tangerang Selatan')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const res = saveSppdServer(body.action, body.payload);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getInitialDataServer() {
  ensureSheetsExist();
  let pegawaiList = getSheetDataSafe(SHEET_PEGAWAI);

  if (pegawaiList.length <= 10) {
    importRibuanPegawai();
    pegawaiList = getSheetDataSafe(SHEET_PEGAWAI);
  }

  const sppdList = getSheetDataSafe(SHEET_SPPD);
  return {
    status: 'success',
    data: {
      sppd: sppdList,
      pegawai: pegawaiList
    }
  };
}

function importRibuanPegawai() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetPegawai = ss.getSheetByName(SHEET_PEGAWAI);
  if (!sheetPegawai) {
    sheetPegawai = ss.insertSheet(SHEET_PEGAWAI);
  } else {
    sheetPegawai.clearContents();
  }

  sheetPegawai.appendRow(HEADERS_PEGAWAI);
  sheetPegawai.getRange(1, 1, 1, HEADERS_PEGAWAI.length)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#ffffff');
  sheetPegawai.setFrozenRows(1);

  let legacySheet = ss.getSheetByName('MasterDataPegawai') || ss.getSheetByName('MasteDataPegawai');
  
  if (!legacySheet) {
    const allSheets = ss.getSheets();
    for (let s of allSheets) {
      if (s.getName() !== SHEET_PEGAWAI && s.getName() !== SHEET_SPPD && s.getLastRow() > 20) {
        legacySheet = s;
        break;
      }
    }
  }

  const cleanRows = [];
  const seenKey = new Set();

  if (legacySheet && legacySheet.getLastRow() >= 2) {
    const lastRow = legacySheet.getLastRow();
    const maxCols = Math.min(legacySheet.getLastColumn(), 12);
    const rawData = legacySheet.getRange(1, 1, lastRow, maxCols).getDisplayValues();

    let colNama = 1, colNip = 2, colNorek = 3, colGol = 4, colJab = 5, colUnit = -1, startRow = 1;
    
    for (let rIdx = 0; rIdx < Math.min(5, rawData.length); rIdx++) {
      const rowStr = rawData[rIdx].join(' ').toLowerCase();
      if (rowStr.includes('nama') || rowStr.includes('nip')) {
        startRow = rIdx + 1;
        rawData[rIdx].forEach((h, cIdx) => {
          const hLow = h.toLowerCase().trim();
          if (hLow.includes('nama') && !hLow.includes('bank') && !hLow.includes('rek')) colNama = cIdx;
          else if (hLow.includes('nip') || hLow.includes('nik')) colNip = cIdx;
          else if (hLow.includes('rek')) colNorek = cIdx;
          else if (hLow.includes('gol') || hLow.includes('pangkat')) colGol = cIdx;
          else if (hLow.includes('jabatan')) colJab = cIdx;
          else if (hLow.includes('unit') || hLow.includes('kerja') || hLow.includes('instansi') || hLow.includes('upt') || hLow.includes('puskesmas')) colUnit = cIdx;
        });
        break;
      }
    }

    for (let i = startRow; i < rawData.length; i++) {
      const r = rawData[i];
      const nama = String(r[colNama] || '').trim();
      let nip = String(r[colNip] || '').trim().replace(/^'/, '');
      const norek = String(r[colNorek] || '').trim().replace(/^'/, '');
      const gol = String(r[colGol] || '').trim();
      const jab = String(r[colJab] || '').trim();
      const unitKerja = colUnit >= 0 ? String(r[colUnit] || '').trim() : (r[7] ? String(r[7]).trim() : '');

      if (!nama || nama.toLowerCase() === 'nama' || nama.toLowerCase() === 'no') continue;
      if (!nip || nip === '-') nip = 'PEG-' + (i + 1);

      const key = nip + '_' + nama;
      if (!seenKey.has(key)) {
        seenKey.add(key);
        cleanRows.push([`'${nip}`, nama, gol, jab, `'${norek}`, '', '', unitKerja]);
      }
    }
  }

  const finalRows = cleanRows.length > 0 ? cleanRows : FALLBACK_PEGAWAI;
  sheetPegawai.getRange(2, 1, finalRows.length, HEADERS_PEGAWAI.length).setValues(finalRows);
}

function ensureSheetsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sSppd = ss.getSheetByName(SHEET_SPPD);
  if (!sSppd) {
    sSppd = ss.insertSheet(SHEET_SPPD);
    sSppd.appendRow(HEADERS_SPPD);
    sSppd.setFrozenRows(1);
  } else if (sSppd.getLastRow() >= 1) {
    let currentHeaders = sSppd.getRange(1, 1, 1, sSppd.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim().toLowerCase());
    if (!currentHeaders.includes('no_up')) {
      sSppd.insertColumnAfter(1);
      sSppd.getRange(1, 2).setValue('no_up');
      currentHeaders = sSppd.getRange(1, 1, 1, sSppd.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim().toLowerCase());
    }
    if (!currentHeaders.includes('unit_kerja')) {
      const jabIdx = currentHeaders.indexOf('jabatan');
      if (jabIdx !== -1) {
        sSppd.insertColumnAfter(jabIdx + 1);
        sSppd.getRange(1, jabIdx + 2).setValue('unit_kerja');
      } else {
        sSppd.getRange(1, sSppd.getLastColumn() + 1).setValue('unit_kerja');
      }
    }
  }

  let sPeg = ss.getSheetByName(SHEET_PEGAWAI);
  if (!sPeg || sPeg.getLastRow() <= 10) {
    importRibuanPegawai();
  } else {
    // Pastikan Kolom H (kolom ke-8) pada master_pegawai memiliki header 'unit_kerja'
    const hVal = String(sPeg.getRange(1, 8).getDisplayValue() || '').trim();
    if (!hVal) {
      sPeg.getRange(1, 8)
        .setValue('unit_kerja')
        .setFontWeight('bold')
        .setBackground('#0f172a')
        .setFontColor('#ffffff');
    }
  }
}

function getSheetDataSafe(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getDisplayValues();
  const rawHeaders = values[0].map(h => String(h).trim());
  const headers = rawHeaders.map((h, idx) => {
    const low = h.toLowerCase().replace(/\s+/g, '_');
    // Jika sheet master_pegawai dan berada di Kolom H (index 7), normalkan key menjadi 'unit_kerja'
    if (sheetName === SHEET_PEGAWAI && idx === 7) return 'unit_kerja';
    if (low === 'unit_kerja' || low === 'unitkerja' || low === 'unit') return 'unit_kerja';
    return h || ('col_' + idx);
  });

  const result = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.join('').trim() === '') continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = String(row[j] || '').replace(/^'/, '').trim();
      if (['biaya_transport', 'biaya_bbm', 'biaya_harian', 'biaya_akomodasi', 'total_biaya', 'lama_hari'].includes(headers[j])) {
        val = Number(val.replace(/[^0-9.-]+/g, '')) || 0;
      }
      obj[headers[j]] = val;
    }
    if (sheetName === SHEET_PEGAWAI && obj.unit_kerja === undefined) {
      obj.unit_kerja = String(row[7] || '').replace(/^'/, '').trim();
    }
    result.push(obj);
  }
  return result;
}

function saveSppdServer(action, payload) {
  ensureSheetsExist();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'createSppd') {
    const sheet = ss.getSheetByName(SHEET_SPPD);
    const sheetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
    const now = new Date().toISOString();
    payload.id = payload.id || ('SPPD-' + Date.now());
    payload.no_up = payload.no_up || 'UP 1';
    payload.nip = `'${String(payload.nip || '').replace(/^'/, '')}`;
    payload.no_rekening = `'${String(payload.no_rekening || '').replace(/^'/, '')}`;
    payload.unit_kerja = payload.unit_kerja || '';
    payload.created_at = now;
    payload.updated_at = now;

    const row = sheetHeaders.map(h => payload[h] !== undefined ? payload[h] : '');
    sheet.appendRow(row);
    syncToRekapSheet(payload);
    return { status: 'success', data: payload };
  }

  if (action === 'updateSppd') {
    const sheet = ss.getSheetByName(SHEET_SPPD);
    const data = sheet.getDataRange().getDisplayValues();
    const sheetHeaders = data[0].map(h => String(h).trim());
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) {
        payload.updated_at = new Date().toISOString();
        payload.nip = `'${String(payload.nip || '').replace(/^'/, '')}`;
        payload.no_rekening = `'${String(payload.no_rekening || '').replace(/^'/, '')}`;
        const row = sheetHeaders.map((h, idx) => payload[h] !== undefined ? payload[h] : data[i][idx]);
        sheet.getRange(i + 1, 1, 1, sheetHeaders.length).setValues([row]);
        break;
      }
    }
    return { status: 'success', data: payload };
  }

  if (action === 'deleteSppd') {
    const sheet = ss.getSheetByName(SHEET_SPPD);
    const idToDelete = typeof payload === 'object' ? payload.id : payload;
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idToDelete)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return { status: 'success' };
  }

  if (action === 'createPegawai') {
    const sheet = ss.getSheetByName(SHEET_PEGAWAI);
    // Kolom A..H (Kolom H = unit_kerja)
    sheet.appendRow([
      `'${String(payload.nip || '').replace(/^'/, '')}`,
      payload.nama || '',
      payload.golongan || '',
      payload.jabatan || '',
      `'${String(payload.no_rekening || '').replace(/^'/, '')}`,
      payload.nik || '',
      payload.npwp || '',
      payload.unit_kerja || ''
    ]);
    return { status: 'success', data: payload };
  }

  if (action === 'updatePegawai') {
    const sheet = ss.getSheetByName(SHEET_PEGAWAI);
    const data = sheet.getDataRange().getDisplayValues();
    const targetNip = String(payload.old_nip || payload.nip).replace(/^'/, '').trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).replace(/^'/, '').trim() === targetNip) {
        const row = [
          `'${String(payload.nip || '').replace(/^'/, '')}`,
          payload.nama || '',
          payload.golongan || '',
          payload.jabatan || '',
          `'${String(payload.no_rekening || '').replace(/^'/, '')}`,
          data[i][5] || '',
          payload.npwp !== undefined ? payload.npwp : (data[i][6] || ''),
          payload.unit_kerja !== undefined ? payload.unit_kerja : (data[i][7] || '')
        ];
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        break;
      }
    }
    return { status: 'success', data: payload };
  }

  if (action === 'deletePegawai') {
    const sheet = ss.getSheetByName(SHEET_PEGAWAI);
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).replace(/^'/, '').trim() === String(payload.nip).replace(/^'/, '').trim()) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return { status: 'success' };
  }
}

function syncToRekapSheet(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let targetName = 'Dalam Daerah ';
  if (p.jenis_perjalanan === 'Luar Daerah') targetName = 'Luar Daerah ';
  else if (p.jenis_perjalanan === 'E-Tol') targetName = 'E-Tol';

  const sheet = ss.getSheetByName(targetName) || ss.getSheetByName(targetName.trim());
  if (!sheet) return;

  const nextNo = Math.max(1, sheet.getLastRow() - 6);
  sheet.appendRow([
    nextNo, p.no_spt, p.tgl_spt, p.no_spd, p.tgl_spd, p.nama, p.jabatan,
    p.perihal, p.tujuan, p.kota_kabupaten, `'${String(p.no_rekening).replace(/^'/, '')}`,
    p.tgl_berangkat, p.tgl_kembali, p.biaya_transport, p.biaya_bbm,
    p.biaya_harian, p.biaya_akomodasi, p.total_biaya, `'${String(p.nip).replace(/^'/, '')}`
  ]);
}
