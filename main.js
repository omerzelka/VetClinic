const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');
const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle } = require('docx');
const { VARSAYILANLAR, DILLER, LOCALE, cevir } = require('./i18n');

let mainWindow;
let db;
let dbPath;

async function initDB() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  dbPath = portableDir
    ? path.join(portableDir, 'veteriner.db')
    : path.join(app.getPath('userData'), 'veteriner.db');
  const SQL = await initSqlJs();
  const mevcutDB = fs.existsSync(dbPath);
  if (mevcutDB) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS ayarlar (
    anahtar TEXT PRIMARY KEY,
    deger TEXT
  )`);

  // First run: pick defaults from the OS locale. A database created by an
  // older version (no settings yet) keeps its original Turkish defaults.
  if (ayarGetir('dil') === null) {
    const turkce = mevcutDB || String(app.getLocale() || '').toLowerCase().startsWith('tr');
    ayarYaz('dil', turkce ? 'tr' : 'en');
    ayarYaz('klinik_adi', '');
    ayarYaz('ulke_kodu', turkce ? '90' : '');
    ayarYaz('para_birimi', turkce ? 'TL' : 'USD');
  }
  const seedDil = ayarGetir('dil');
  const seed = VARSAYILANLAR[seedDil] || VARSAYILANLAR.tr;
  const ilkKurulum = ayarGetir('varsayilanlar_yuklendi') === null;

  db.run(`CREATE TABLE IF NOT EXISTS islem_turleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS hastaliklar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS islemler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sahip_ad TEXT,
    sahip_tel TEXT NOT NULL,
    hayvan_ad TEXT,
    hayvan_tur TEXT,
    hastalik TEXT,
    islem TEXT NOT NULL,
    tarih TEXT NOT NULL,
    ucret REAL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS oto_randevu_kurallari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    islem_adi TEXT NOT NULL UNIQUE,
    gun INTEGER NOT NULL,
    aciklama TEXT
  )`);

  // Default lists are seeded only once, so entries the user deletes stay deleted.
  if (ilkKurulum) {
    const insertTur = db.prepare('INSERT OR IGNORE INTO islem_turleri (ad) VALUES (?)');
    seed.turler.forEach(t => { insertTur.bind([t]); insertTur.step(); insertTur.reset(); });
    insertTur.free();

    const insertH = db.prepare('INSERT OR IGNORE INTO hastaliklar (ad) VALUES (?)');
    seed.hastaliklar.forEach(h => { insertH.bind([h]); insertH.step(); insertH.reset(); });
    insertH.free();

    const insertKural = db.prepare('INSERT OR IGNORE INTO oto_randevu_kurallari (islem_adi, gun, aciklama) VALUES (?,?,?)');
    seed.kurallar.forEach(k => { insertKural.bind(k); insertKural.step(); insertKural.reset(); });
    insertKural.free();

    ayarYaz('varsayilanlar_yuklendi', '1');
  }

  db.run(`CREATE TABLE IF NOT EXISTS bildirimler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baslik TEXT NOT NULL,
    mesaj TEXT NOT NULL,
    tip TEXT DEFAULT 'randevu',
    randevu_id INTEGER,
    tarih TEXT NOT NULL,
    okundu INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS randevular (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sahip_ad TEXT,
    sahip_tel TEXT NOT NULL,
    hayvan_ad TEXT,
    tarih TEXT NOT NULL,
    saat TEXT NOT NULL,
    aciklama TEXT,
    durum TEXT DEFAULT 'bekliyor'
  )`);
  save();
}

function ayarGetir(anahtar) {
  const r = all('SELECT deger FROM ayarlar WHERE anahtar = ?', [anahtar]);
  return r.length ? r[0].deger : null;
}

function ayarYaz(anahtar, deger) {
  db.run('INSERT INTO ayarlar (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger',
    [anahtar, deger == null ? '' : String(deger)]);
}

function dil() {
  const d = ayarGetir('dil');
  return DILLER.includes(d) ? d : 'tr';
}

function save() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(async () => {
  await initDB();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (db) { save(); db.close(); db = null; }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- Ayarlar / Settings ---
const AYAR_ANAHTARLARI = ['dil', 'klinik_adi', 'ulke_kodu', 'para_birimi'];

ipcMain.handle('ayarlar', () => {
  const sonuc = {};
  AYAR_ANAHTARLARI.forEach(k => { sonuc[k] = ayarGetir(k) || ''; });
  if (!DILLER.includes(sonuc.dil)) sonuc.dil = 'tr';
  return sonuc;
});

ipcMain.handle('ayar-kaydet', (_, veri) => {
  AYAR_ANAHTARLARI.forEach(k => {
    if (veri && veri[k] !== undefined) {
      let v = String(veri[k]).trim();
      if (k === 'dil' && !DILLER.includes(v)) return;
      if (k === 'ulke_kodu') v = v.replace(/\D/g, '');
      ayarYaz(k, v);
    }
  });
  save();
});

ipcMain.handle('ekle', (_, data) => {
  db.run('INSERT INTO islemler (sahip_ad, sahip_tel, hayvan_ad, hayvan_tur, hastalik, islem, tarih, ucret) VALUES (?,?,?,?,?,?,?,?)',
    [data.sahip_ad, data.sahip_tel, data.hayvan_ad, data.hayvan_tur, data.hastalik, data.islem, data.tarih, data.ucret]);
  save();
  return otomatikRandevuOlustur(data);
});

ipcMain.handle('guncelle', (_, id, data) => {
  db.run('UPDATE islemler SET sahip_ad=?, sahip_tel=?, hayvan_ad=?, hayvan_tur=?, hastalik=?, islem=?, tarih=?, ucret=? WHERE id=?',
    [data.sahip_ad, data.sahip_tel, data.hayvan_ad, data.hayvan_tur, data.hastalik, data.islem, data.tarih, data.ucret, id]);
  save();
});

ipcMain.handle('sil', (_, id) => {
  db.run('DELETE FROM islemler WHERE id=?', [id]);
  save();
});

ipcMain.handle('listele', (_, sort) => {
  if (sort === 'tarih_asc') return all('SELECT * FROM islemler ORDER BY tarih ASC');
  if (sort === 'tarih_desc') return all('SELECT * FROM islemler ORDER BY tarih DESC');
  return all('SELECT * FROM islemler ORDER BY sahip_ad, tarih DESC');
});

ipcMain.handle('ara', (_, q) => {
  const s = `%${q}%`;
  return all('SELECT * FROM islemler WHERE sahip_ad LIKE ? OR sahip_tel LIKE ? OR hayvan_ad LIKE ? OR hayvan_tur LIKE ? OR hastalik LIKE ? OR islem LIKE ? ORDER BY sahip_ad, tarih DESC', [s, s, s, s, s, s]);
});

ipcMain.handle('sahipler', () => all('SELECT DISTINCT sahip_ad, sahip_tel FROM islemler WHERE sahip_ad IS NOT NULL AND sahip_ad != "" ORDER BY sahip_ad'));

ipcMain.handle('turler', () => all('SELECT * FROM islem_turleri ORDER BY ad'));

ipcMain.handle('tur-ekle', (_, ad) => {
  db.run('INSERT OR IGNORE INTO islem_turleri (ad) VALUES (?)', [ad]);
  save();
});

ipcMain.handle('tur-sil', (_, id) => {
  db.run('DELETE FROM islem_turleri WHERE id=?', [id]);
  save();
});

// --- Hastalık ---
ipcMain.handle('hastaliklar', () => all('SELECT * FROM hastaliklar ORDER BY ad'));

ipcMain.handle('hastalik-ekle', (_, ad) => {
  db.run('INSERT OR IGNORE INTO hastaliklar (ad) VALUES (?)', [ad]);
  save();
});

ipcMain.handle('hastalik-sil', (_, id) => {
  db.run('DELETE FROM hastaliklar WHERE id=?', [id]);
  save();
});

// --- Otomatik Randevu ---
function otomatikRandevuOlustur(data) {
  const kurallar = all('SELECT * FROM oto_randevu_kurallari');
  const eslesenler = kurallar.filter(k =>
    data.islem && data.islem.toLowerCase().includes(k.islem_adi.toLowerCase())
  );
  if (!eslesenler.length) return null;

  const kural = eslesenler[0];
  const islemTarih = new Date(data.tarih);
  islemTarih.setDate(islemTarih.getDate() + kural.gun);
  const yeniTarih = localDateStr(islemTarih);

  return {
    oneri: true,
    tarih: yeniTarih,
    aciklama: kural.aciklama,
    gun: kural.gun,
    sahip_ad: data.sahip_ad,
    sahip_tel: data.sahip_tel,
    hayvan_ad: data.hayvan_ad
  };
}

ipcMain.handle('otomatik-randevu-onayla', (_, data) => {
  db.run('INSERT INTO randevular (sahip_ad, sahip_tel, hayvan_ad, tarih, saat, aciklama, durum) VALUES (?,?,?,?,?,?,?)',
    [data.sahip_ad, data.sahip_tel, data.hayvan_ad, data.tarih, '09:00', data.aciklama + ' (' + (data.hayvan_ad || '') + ')', 'bekliyor']);
  save();
});

ipcMain.handle('kurallar', () => all('SELECT * FROM oto_randevu_kurallari ORDER BY islem_adi'));

ipcMain.handle('kural-ekle', (_, data) => {
  const mevcut = all('SELECT id FROM oto_randevu_kurallari WHERE islem_adi = ?', [data.islem_adi]);
  if (mevcut.length) {
    db.run('UPDATE oto_randevu_kurallari SET gun = ?, aciklama = ? WHERE islem_adi = ?',
      [data.gun, data.aciklama, data.islem_adi]);
  } else {
    db.run('INSERT INTO oto_randevu_kurallari (islem_adi, gun, aciklama) VALUES (?,?,?)',
      [data.islem_adi, data.gun, data.aciklama]);
  }
  save();
});

ipcMain.handle('kural-sil', (_, id) => {
  db.run('DELETE FROM oto_randevu_kurallari WHERE id=?', [id]);
  save();
});

// --- Randevu ---
ipcMain.handle('randevu-ekle', (_, data) => {
  db.run('INSERT INTO randevular (sahip_ad, sahip_tel, hayvan_ad, tarih, saat, aciklama, durum) VALUES (?,?,?,?,?,?,?)',
    [data.sahip_ad, data.sahip_tel, data.hayvan_ad, data.tarih, data.saat, data.aciklama, data.durum || 'bekliyor']);
  save();
});

ipcMain.handle('randevu-guncelle', (_, id, data) => {
  db.run('UPDATE randevular SET sahip_ad=?, sahip_tel=?, hayvan_ad=?, tarih=?, saat=?, aciklama=?, durum=? WHERE id=?',
    [data.sahip_ad, data.sahip_tel, data.hayvan_ad, data.tarih, data.saat, data.aciklama, data.durum, id]);
  save();
});

ipcMain.handle('randevu-sil', (_, id) => {
  db.run('DELETE FROM randevular WHERE id=?', [id]);
  save();
});

ipcMain.handle('randevular', () => all('SELECT * FROM randevular ORDER BY tarih ASC, saat ASC'));

ipcMain.handle('randevular-filtreli', (_, filtre, siralama) => {
  let sql = 'SELECT * FROM randevular';
  const params = [];
  if (filtre && filtre !== 'tumu') {
    if (filtre === 'gecmis') {
      sql += ' WHERE durum = ? AND tarih < ?';
      params.push('bekliyor', localDateStr(new Date()));
    } else {
      sql += ' WHERE durum = ?';
      params.push(filtre);
    }
  }
  if (siralama === 'tarih_desc') {
    sql += ' ORDER BY tarih DESC, saat DESC';
  } else {
    sql += ' ORDER BY tarih ASC, saat ASC';
  }
  return all(sql, params);
});

// --- Bildirimler ---
ipcMain.handle('bildirim-olustur', () => {
  const bugun = new Date();
  const ucGunSonra = new Date();
  ucGunSonra.setDate(bugun.getDate() + 3);
  const bugunStr = localDateStr(bugun);
  const ucGunStr = localDateStr(ucGunSonra);

  const randevular = all('SELECT * FROM randevular WHERE durum = ? AND tarih >= ? AND tarih <= ? ORDER BY tarih ASC, saat ASC',
    ['bekliyor', bugunStr, ucGunStr]);

  randevular.forEach(r => {
    const mevcut = all('SELECT id FROM bildirimler WHERE randevu_id = ? AND tarih = ?', [r.id, bugunStr]);
    if (mevcut.length) return;

    // Stored as a code; the renderer translates it to the active language.
    let baslik = 'yaklasan';
    if (r.tarih === bugunStr) baslik = 'bugun';
    const yarin = new Date(); yarin.setDate(yarin.getDate() + 1);
    if (r.tarih === localDateStr(yarin)) baslik = 'yarin';

    const mesaj = `${r.saat} - ${r.sahip_ad || ''} - ${r.hayvan_ad || ''} - ${r.aciklama || ''}`;
    db.run('INSERT INTO bildirimler (baslik, mesaj, tip, randevu_id, tarih) VALUES (?,?,?,?,?)',
      [baslik, mesaj, 'randevu', r.id, bugunStr]);
  });
  save();
});

ipcMain.handle('bildirimler-getir', (_, filtre) => {
  if (filtre === 'okunmus') return all('SELECT * FROM bildirimler WHERE okundu = 1 ORDER BY created_at DESC');
  if (filtre === 'tumu') return all('SELECT * FROM bildirimler ORDER BY created_at DESC');
  if (filtre === 'aktif') return all('SELECT * FROM bildirimler WHERE okundu = 0 ORDER BY created_at DESC');
  return all('SELECT * FROM bildirimler WHERE okundu = 0 ORDER BY created_at DESC');
});

ipcMain.handle('bildirim-okundu', (_, id) => {
  db.run('UPDATE bildirimler SET okundu = 1 WHERE id = ?', [id]);
  save();
});

ipcMain.handle('bildirim-tumunu-okundu', () => {
  db.run('UPDATE bildirimler SET okundu = 1 WHERE okundu = 0');
  save();
});

ipcMain.handle('bildirim-okunmuslari-sil', () => {
  db.run('DELETE FROM bildirimler WHERE okundu = 1');
  save();
});

ipcMain.handle('bildirim-sayisi', () => {
  const r = all('SELECT COUNT(*) as sayi FROM bildirimler WHERE okundu = 0');
  return (r[0] && r[0].sayi) || 0;
});

ipcMain.handle('yaklasan-randevular', () => {
  const bugun = new Date();
  const ucGunSonra = new Date();
  ucGunSonra.setDate(bugun.getDate() + 3);
  const bugunStr = localDateStr(bugun);
  const ucGunStr = localDateStr(ucGunSonra);
  return all('SELECT * FROM randevular WHERE durum = ? AND tarih >= ? AND tarih <= ? ORDER BY tarih ASC, saat ASC',
    ['bekliyor', bugunStr, ucGunStr]);
});

// --- WhatsApp ---
ipcMain.handle('whatsapp-gonder', async (_, tel, mesaj) => {
  const ham = String(tel || '').trim();
  let numara = ham.replace(/\D/g, '');
  if (ham.startsWith('+')) {
    // already international
  } else if (numara.startsWith('00')) {
    numara = numara.slice(2);
  } else {
    const ulkeKodu = (ayarGetir('ulke_kodu') || '').replace(/\D/g, '');
    numara = numara.replace(/^0+/, '');
    if (ulkeKodu && !numara.startsWith(ulkeKodu)) numara = ulkeKodu + numara;
  }
  const url = `https://web.whatsapp.com/send?phone=${numara}&text=${encodeURIComponent(mesaj)}`;

  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    console.error('WhatsApp open error:', err);
    // FALLBACK: if the OS refuses to open the external browser, open an in-app window
    try {
      const waWin = new BrowserWindow({
        width: 1000,
        height: 700,
        title: 'WhatsApp Web',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      waWin.setMenuBarVisibility(false);
      // Standart bir tarayıcı gibi davranması için User-Agent ayarlanır
      waWin.webContents.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      waWin.loadURL(url);
      return { success: true };
    } catch (winErr) {
      return { success: false, message: cevir(dil(), 'export.browserFailed', { msg: winErr.message }) };
    }
  }
});

ipcMain.handle('toplu-whatsapp-hatirlatma', () => {
  const bugun = localDateStr(new Date());
  const yarin = new Date();
  yarin.setDate(yarin.getDate() + 1);
  const yarinStr = localDateStr(yarin);
  return all('SELECT * FROM randevular WHERE durum = ? AND (tarih = ? OR tarih = ?) ORDER BY tarih ASC, saat ASC',
    ['bekliyor', bugun, yarinStr]);
});

// --- Word Dışa Aktarma ---
ipcMain.handle('word-aktar', async () => {
  const d = dil();
  const t = (k, p) => cevir(d, k, p);
  const klinikAdi = (ayarGetir('klinik_adi') || '').trim();
  const paraBirimi = (ayarGetir('para_birimi') || '').trim();

  const rows = all('SELECT * FROM islemler ORDER BY sahip_ad, tarih DESC');
  if (!rows.length) return { success: false, message: t('export.noRecords') };

  const dosyaAdi = (klinikAdi ? klinikAdi.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') + '_' : '') + t('export.fileName') + '.docx';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: t('export.saveTitle'),
    defaultPath: path.join(app.getPath('desktop'), dosyaAdi),
    filters: [{ name: t('export.fileFilter'), extensions: ['docx'] }]
  });

  if (result.canceled) return { success: false };

  const basliklar = ['col.sahip', 'col.telefon', 'col.hayvan', 'col.tur', 'col.hastalik', 'col.islem', 'col.tarih', 'col.ucret'].map(k => t(k));
  const colWidths = [1700, 1400, 1200, 900, 1300, 1500, 1200, 1200];
  const border = { style: BorderStyle.SINGLE, size: 6, color: '999999' };
  const borders = { top: border, bottom: border, left: border, right: border };

  function makeCell(text, opts = {}) {
    const cellOpts = {
      borders,
      width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
      children: [new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [new TextRun({
          text: String(text),
          bold: opts.bold || false,
          color: opts.color || '000000',
          size: 20,
          font: 'Segoe UI'
        })]
      })]
    };
    if (opts.fill) cellOpts.shading = { fill: opts.fill };
    return new TableCell(cellOpts);
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: basliklar.map((b, i) => makeCell(b, {
      width: colWidths[i], bold: true, color: 'FFFFFF', fill: '2a7b88', align: AlignmentType.CENTER
    }))
  });

  const dataRows = rows.map((r, idx) => {
    const vals = [r.sahip_ad, r.sahip_tel, r.hayvan_ad, r.hayvan_tur, r.hastalik, r.islem, r.tarih, (Number(r.ucret) || 0).toLocaleString(LOCALE[d]) + (paraBirimi ? ' ' + paraBirimi : '')];
    const fill = idx % 2 === 0 ? 'FFFFFF' : 'F0F7F8';
    return new TableRow({
      children: vals.map((v, i) => makeCell(v || '', {
        width: colWidths[i], fill, align: i === 7 ? AlignmentType.RIGHT : AlignmentType.LEFT
      }))
    });
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { orientation: 'landscape' } }
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({ text: (klinikAdi ? klinikAdi + ' - ' : '') + t('export.title'), bold: true, size: 32, font: 'Segoe UI', color: '2a7b88' })]
        }),
        new Table({
          width: { size: 10400, type: WidthType.DXA },
          columnWidths: colWidths,
          rows: [headerRow, ...dataRows]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(result.filePath, buffer);
  return { success: true, path: result.filePath };
});
