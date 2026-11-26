let editId = null;
let tarihSort = null;
let otoRandevuAcik = false;
try { otoRandevuAcik = localStorage.getItem('otoRandevu') === 'true'; } catch (_) {}

// ===== AYARLAR & DİL / SETTINGS & LANGUAGE =====
let ayarlar = { dil: 'tr', klinik_adi: '', ulke_kodu: '', para_birimi: '' };

function t(anahtar, params) {
  return I18N.cevir(ayarlar.dil, anahtar, params);
}

function locale() {
  return I18N.LOCALE[ayarlar.dil] || 'tr-TR';
}

function paraFormat(n) {
  const deger = (Number(n) || 0).toLocaleString(locale());
  return ayarlar.para_birimi ? deger + ' ' + ayarlar.para_birimi : deger;
}

function secinizOption() {
  return `<option value="">${esc(t('common.select'))}</option>`;
}

function metinleriUygula() {
  document.documentElement.lang = ayarlar.dil;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === ayarlar.dil));

  const baslik = ayarlar.klinik_adi || t('app.name');
  document.getElementById('header-title').textContent = baslik;
  document.title = baslik;
  document.getElementById('f-ucret-label').textContent = ayarlar.para_birimi
    ? t('islem.ucretLabel', { currency: ayarlar.para_birimi })
    : t('col.ucret');
  otoToggleBaslat();
}

function aktifSekmeyiYenile() {
  const aktif = document.querySelector('.tab.active');
  const sekme = aktif ? aktif.dataset.tab : 'islemler';
  if (sekme === 'islemler') yukle();
  if (sekme === 'randevular') randevulariYukle();
  if (sekme === 'bildirimler') bildirimSayfasiYukle();
  bildirimleriYukle();
}

async function dilDegistir(dil) {
  if (dil === ayarlar.dil) return;
  ayarlar.dil = dil;
  await window.api.ayarKaydet({ dil });
  metinleriUygula();
  aktifSekmeyiYenile();
}

function ayarlarAc() {
  document.getElementById('a-dil').value = ayarlar.dil;
  document.getElementById('a-klinik').value = ayarlar.klinik_adi;
  document.getElementById('a-ulke').value = ayarlar.ulke_kodu;
  document.getElementById('a-para').value = ayarlar.para_birimi;
  document.getElementById('ayar-overlay').classList.add('show');
}

function ayarlarKapat() {
  document.getElementById('ayar-overlay').classList.remove('show');
}

async function ayarlarKaydet(e) {
  e.preventDefault();
  const yeni = {
    dil: document.getElementById('a-dil').value,
    klinik_adi: document.getElementById('a-klinik').value.trim(),
    ulke_kodu: document.getElementById('a-ulke').value.replace(/\D/g, ''),
    para_birimi: document.getElementById('a-para').value.trim(),
  };
  await window.api.ayarKaydet(yeni);
  ayarlar = Object.assign(ayarlar, yeni);
  ayarlarKapat();
  metinleriUygula();
  aktifSekmeyiYenile();
}

function otoToggleBaslat() {
  const toggle = document.getElementById('oto-randevu-toggle');
  const label = document.getElementById('oto-randevu-label');
  toggle.checked = otoRandevuAcik;
  label.textContent = otoRandevuAcik ? t('islem.otoOn') : t('islem.otoOff');
  label.style.color = otoRandevuAcik ? '#2a7b88' : '';
}

function otoToggleDegistir() {
  otoRandevuAcik = document.getElementById('oto-randevu-toggle').checked;
  try { localStorage.setItem('otoRandevu', otoRandevuAcik); } catch (_) {}
  otoToggleBaslat();
}

// Notification titles are stored as codes ('bugun'/'yarin'/'yaklasan');
// older databases stored Turkish text, so map those too.
function bildirimTuru(baslik) {
  const b = String(baslik || '');
  if (b === 'bugun' || b.includes('Bugün')) return 'bugun';
  if (b === 'yarin' || b.includes('Yarın')) return 'yarin';
  return 'yaklasan';
}

function bildirimBasligi(baslik) {
  return t('bildirim.title.' + bildirimTuru(baslik));
}

function whatsappMesaji(r) {
  const satirlar = [
    t('wa.greeting', { name: r.sahip_ad || '' }).replace(' ,', ','),
    '',
    ayarlar.klinik_adi ? t('wa.introClinic', { clinic: ayarlar.klinik_adi }) : t('wa.introPlain'),
    '',
    t('wa.body', { date: r.tarih, time: r.saat, desc: r.aciklama || t('wa.defaultDesc') }),
    '',
    t('wa.closing'),
  ];
  return satirlar.join('\n');
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ===== BİLDİRİMLER (Header Panel) =====
async function bildirimleriYukle() {
  const bildirimler = await window.api.bildirimlerGetir('aktif');
  const panel = document.getElementById('bildirim-panel');

  if (!bildirimler.length) {
    panel.classList.remove('show');
    return;
  }

  let html = `<div class="bildirim-baslik">
    <span>${esc(t('bildirim.panelTitle', { count: bildirimler.length }))}</span>
    <button class="bildirim-tumu-kapat" onclick="bildirimleriKapat()">${esc(t('bildirim.closeAll'))}</button>
  </div>`;

  html += bildirimler.map(b => {
    const tur = bildirimTuru(b.baslik);
    const sinif = tur === 'yaklasan' ? '' : tur;

    return `<div class="bildirim ${sinif}" id="bildirim-${b.id}">
      <div class="bildirim-icerik">
        <span class="bildirim-ikon">&#128276;</span>
        <span class="bildirim-tarih">${esc(bildirimBasligi(b.baslik))}</span>
        <span class="bildirim-detay">${esc(b.mesaj)}</span>
      </div>
      <button class="bildirim-kapat" onclick="panelBildirimKapat(${b.id})">&times;</button>
    </div>`;
  }).join('');

  panel.innerHTML = html;
  panel.classList.add('show');
}

async function panelBildirimKapat(id) {
  await window.api.bildirimOkundu(id);
  const el = document.getElementById('bildirim-' + id);
  if (el) el.remove();
  const panel = document.getElementById('bildirim-panel');
  if (!panel.querySelector('.bildirim')) panel.classList.remove('show');
  bildirimBadgeGuncelle();
}

async function bildirimleriKapat() {
  await window.api.bildirimTumunuOkundu();
  const panel = document.getElementById('bildirim-panel');
  panel.innerHTML = '';
  panel.classList.remove('show');
  bildirimBadgeGuncelle();
}

// ===== SEKMELER =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'randevular') randevulariYukle();
    if (tab.dataset.tab === 'islemler') yukle();
    if (tab.dataset.tab === 'bildirimler') bildirimSayfasiYukle();
  });
});

// ===== İŞLEMLER =====
function renderRows(rows) {
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  if (!rows.length) {
    tbody.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');
  tbody.innerHTML = rows.map(r => `<tr>
    <td>${esc(r.tarih)}</td>
    <td><strong>${esc(r.sahip_ad)}</strong></td>
    <td>${esc(r.sahip_tel)}</td>
    <td>${esc(r.hayvan_ad)}</td>
    <td>${esc(r.hayvan_tur)}</td>
    <td>${esc(r.hastalik)}</td>
    <td>${esc(r.islem)}</td>
    <td class="ucret">${esc(paraFormat(r.ucret))}</td>
    <td>
      <div class="action-btns">
        <button class="btn" onclick="duzenle(${r.id})">&#9998;</button>
        <button class="btn btn-danger" onclick="silOnay(${r.id})">&#128465;</button>
      </div>
    </td>
  </tr>`).join('');
}

async function yukle() {
  renderRows(await window.api.listele(tarihSort));
}

document.getElementById('th-tarih').addEventListener('click', () => {
  if (tarihSort === 'tarih_desc') tarihSort = 'tarih_asc';
  else tarihSort = 'tarih_desc';
  yukle();
});

let sahipListesi = [];

async function formAc(data) {
  editId = data ? data.id : null;
  document.getElementById('modal-title').textContent = data ? t('islem.modalEdit') : t('islem.modalNew');
  document.getElementById('f-sahip').value = data ? data.sahip_ad : '';
  document.getElementById('f-tel').value = data ? data.sahip_tel : '';
  document.getElementById('f-hayvan').value = data ? data.hayvan_ad : '';
  document.getElementById('f-tur').value = data ? data.hayvan_tur : '';
  document.getElementById('f-tarih').value = data ? data.tarih : localToday();
  document.getElementById('f-ucret').value = data ? data.ucret : '';

  sahipListesi = await window.api.sahipler();
  document.getElementById('sahip-liste').innerHTML =
    sahipListesi.map(s => `<option value="${esc(s.sahip_ad)}">`).join('');

  const hastaliklar = await window.api.hastaliklar();
  const hSelect = document.getElementById('f-hastalik');
  hSelect.innerHTML = secinizOption() +
    hastaliklar.map(h => `<option value="${esc(h.ad)}" ${data && data.hastalik === h.ad ? 'selected' : ''}>${esc(h.ad)}</option>`).join('');

  const turler = await window.api.turler();
  const select = document.getElementById('f-islem');
  select.innerHTML = secinizOption() +
    turler.map(t => `<option value="${esc(t.ad)}" ${data && data.islem === t.ad ? 'selected' : ''}>${esc(t.ad)}</option>`).join('');

  document.getElementById('overlay').classList.add('show');
}

document.getElementById('f-sahip').addEventListener('input', (e) => {
  const val = e.target.value.trim();
  const match = sahipListesi.find(s => s.sahip_ad === val);
  if (match) {
    document.getElementById('f-tel').value = match.sahip_tel || '';
  }
});

let miniDialogCallback = null;

function miniDialogAc(baslik, label) {
  return new Promise(resolve => {
    miniDialogCallback = resolve;
    document.getElementById('mini-dialog-baslik').textContent = baslik;
    document.getElementById('mini-dialog-label').textContent = label;
    document.getElementById('mini-dialog-input').value = '';
    document.getElementById('mini-dialog-overlay').classList.add('show');
    setTimeout(() => document.getElementById('mini-dialog-input').focus(), 100);
  });
}

function miniDialogKapat() {
  document.getElementById('mini-dialog-overlay').classList.remove('show');
  if (miniDialogCallback) { miniDialogCallback(null); miniDialogCallback = null; }
}

function miniDialogOnayla() {
  const val = document.getElementById('mini-dialog-input').value.trim();
  document.getElementById('mini-dialog-overlay').classList.remove('show');
  if (miniDialogCallback) { miniDialogCallback(val || null); miniDialogCallback = null; }
}

document.getElementById('mini-dialog-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') miniDialogOnayla();
});

async function yeniHastalikEkle() {
  const ad = await miniDialogAc(t('islem.newDisease'), t('islem.diseaseName'));
  if (!ad) return;
  await window.api.hastalikEkle(ad);
  const hastaliklar = await window.api.hastaliklar();
  const select = document.getElementById('f-hastalik');
  select.innerHTML = secinizOption() +
    hastaliklar.map(h => `<option value="${esc(h.ad)}">${esc(h.ad)}</option>`).join('');
  select.value = ad;
}

async function hastalikSil() {
  const select = document.getElementById('f-hastalik');
  const secili = select.value;
  if (!secili) { alert(t('islem.selectDiseaseToDelete')); return; }
  const hastaliklar = await window.api.hastaliklar();
  const h = hastaliklar.find(function(x) { return x.ad === secili; });
  if (!h) return;
  await window.api.hastalikSil(h.id);
  const yeniListe = await window.api.hastaliklar();
  select.innerHTML = secinizOption() +
    yeniListe.map(function(x) { return '<option value="' + esc(x.ad) + '">' + esc(x.ad) + '</option>'; }).join('');
}

async function yeniTurEkle() {
  const ad = await miniDialogAc(t('islem.newType'), t('islem.typeName'));
  if (!ad) return;
  await window.api.turEkle(ad);
  const turler = await window.api.turler();
  const select = document.getElementById('f-islem');
  select.innerHTML = secinizOption() +
    turler.map(t => `<option value="${esc(t.ad)}">${esc(t.ad)}</option>`).join('');
  select.value = ad;
}

async function turSil() {
  const select = document.getElementById('f-islem');
  const secili = select.value;
  if (!secili) { alert(t('islem.selectTypeToDelete')); return; }
  const turler = await window.api.turler();
  const t = turler.find(function(x) { return x.ad === secili; });
  if (!t) return;
  await window.api.turSil(t.id);
  const yeniListe = await window.api.turler();
  select.innerHTML = secinizOption() +
    yeniListe.map(function(x) { return '<option value="' + esc(x.ad) + '">' + esc(x.ad) + '</option>'; }).join('');
}

function kapat() {
  document.getElementById('overlay').classList.remove('show');
  editId = null;
}

async function kaydet(e) {
  e.preventDefault();
  const data = {
    sahip_ad: document.getElementById('f-sahip').value.trim(),
    sahip_tel: document.getElementById('f-tel').value.trim(),
    hayvan_ad: document.getElementById('f-hayvan').value.trim(),
    hayvan_tur: document.getElementById('f-tur').value.trim(),
    hastalik: document.getElementById('f-hastalik').value,
    islem: document.getElementById('f-islem').value.trim(),
    tarih: document.getElementById('f-tarih').value,
    ucret: parseFloat(document.getElementById('f-ucret').value) || 0,
  };
  try {
    if (editId) {
      await window.api.guncelle(editId, data);
    } else {
      const sonuc = await window.api.ekle(data);
      if (sonuc && sonuc.oneri && otoRandevuAcik) {
        await window.api.otomatikRandevuOnayla(sonuc);
      }
    }
    kapat();
    yukle();
  } catch (err) {
    alert(t('islem.saveError', { msg: err.message }));
  }
}

async function duzenle(id) {
  const rows = await window.api.listele(tarihSort);
  const row = rows.find(r => r.id === id);
  if (row) formAc(row);
}

function silOnay(id) {
  if (confirm(t('islem.deleteConfirm'))) {
    window.api.sil(id).then(() => yukle());
  }
}

let timer;
document.getElementById('ara').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const q = e.target.value.trim();
    const rows = q ? await window.api.ara(q) : await window.api.listele(tarihSort);
    renderRows(rows);
  }, 300);
});

// ===== RANDEVULAR =====
let randevuEditId = null;
let randevuSort = 'tarih_asc';

function randevuDurum(tarih, saat, durum) {
  const rozet = (k) => `<span class="badge badge-${k}">${esc(t('randevu.status.' + k))}</span>`;
  if (durum === 'tamamlandi') return rozet('tamamlandi');
  if (durum === 'iptal') return rozet('iptal');
  const now = new Date();
  const randevuZaman = new Date(tarih + 'T' + saat);
  if (randevuZaman < now) return rozet('gecmis');
  return rozet('bekliyor');
}

async function randevulariYukle() {
  const filtre = document.getElementById('randevu-filtre') ? document.getElementById('randevu-filtre').value : 'tumu';
  const rows = await window.api.randevularFiltreli(filtre, randevuSort);
  const tbody = document.getElementById('randevu-tbody');
  const empty = document.getElementById('randevu-empty');

  if (!rows.length) {
    tbody.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');
  tbody.innerHTML = rows.map(r => `<tr>
    <td>${esc(r.tarih)}</td>
    <td>${esc(r.saat)}</td>
    <td><strong>${esc(r.sahip_ad)}</strong></td>
    <td>${esc(r.sahip_tel)}</td>
    <td>${esc(r.hayvan_ad)}</td>
    <td>${esc(r.aciklama)}</td>
    <td>${randevuDurum(r.tarih, r.saat, r.durum)}</td>
    <td>
      <div class="action-btns">
        ${r.sahip_tel ? `<button class="btn btn-whatsapp" title="${esc(t('randevu.waRemind'))}" onclick="whatsappHatirlat(${r.id})">&#128172;</button>` : ''}
        ${r.durum === 'bekliyor' ? `<button class="btn btn-success" title="${esc(t('randevu.complete'))}" onclick="randevuDurumDegistir(${r.id},'tamamlandi')">&#10003;</button>` : ''}
        ${r.durum === 'bekliyor' ? `<button class="btn btn-danger" title="${esc(t('randevu.cancel'))}" onclick="randevuDurumDegistir(${r.id},'iptal')">&#10007;</button>` : ''}
        <button class="btn" title="${esc(t('randevu.edit'))}" onclick="randevuDuzenle(${r.id})">&#9998;</button>
        <button class="btn btn-danger" title="${esc(t('common.delete'))}" onclick="randevuSilOnay(${r.id})">&#128465;</button>
      </div>
    </td>
  </tr>`).join('');
}

function randevuSiralaToggle() {
  randevuSort = randevuSort === 'tarih_asc' ? 'tarih_desc' : 'tarih_asc';
  randevulariYukle();
}

async function topluHatirlatmaGonder() {
  const randevular = await window.api.topluWhatsappHatirlatma();
  if (!randevular.length) {
    alert(t('randevu.noBulk'));
    return;
  }
  const isimler = randevular.map(r => `${r.tarih} ${r.saat} - ${r.sahip_ad || ''} (${r.hayvan_ad || ''})`).join('\n');
  if (!confirm(t('randevu.bulkConfirm', { count: randevular.length, list: isimler }))) return;
  for (const r of randevular) {
    if (!r.sahip_tel) continue;
    const mesaj = whatsappMesaji(r);
    await window.api.whatsappGonder(r.sahip_tel, mesaj);
    await new Promise(res => setTimeout(res, 1500));
  }
}

async function randevuFormAc(data) {
  randevuEditId = data ? data.id : null;
  document.getElementById('randevu-modal-title').textContent = data ? t('randevu.modalEdit') : t('randevu.modalNew');
  document.getElementById('r-sahip').value = data ? data.sahip_ad : '';
  document.getElementById('r-tel').value = data ? data.sahip_tel : '';
  document.getElementById('r-hayvan').value = data ? data.hayvan_ad : '';
  document.getElementById('r-tarih').value = data ? data.tarih : localToday();
  document.getElementById('r-saat').value = data ? data.saat : '';
  document.getElementById('r-aciklama').value = data ? data.aciklama : '';

  sahipListesi = await window.api.sahipler();
  document.getElementById('r-sahip-liste').innerHTML =
    sahipListesi.map(s => `<option value="${esc(s.sahip_ad)}">`).join('');

  document.getElementById('randevu-overlay').classList.add('show');
}

document.getElementById('r-sahip').addEventListener('input', (e) => {
  const val = e.target.value.trim();
  const match = sahipListesi.find(s => s.sahip_ad === val);
  if (match) {
    document.getElementById('r-tel').value = match.sahip_tel || '';
  }
});

function randevuKapat() {
  document.getElementById('randevu-overlay').classList.remove('show');
  randevuEditId = null;
}

async function randevuKaydet(e) {
  e.preventDefault();
  const data = {
    sahip_ad: document.getElementById('r-sahip').value.trim(),
    sahip_tel: document.getElementById('r-tel').value.trim(),
    hayvan_ad: document.getElementById('r-hayvan').value.trim(),
    tarih: document.getElementById('r-tarih').value,
    saat: document.getElementById('r-saat').value,
    aciklama: document.getElementById('r-aciklama').value.trim(),
    durum: 'bekliyor',
  };
  try {
    if (randevuEditId) {
      const rows = await window.api.randevular();
      const old = rows.find(r => r.id === randevuEditId);
      data.durum = old ? old.durum : 'bekliyor';
      await window.api.randevuGuncelle(randevuEditId, data);
    } else {
      await window.api.randevuEkle(data);
    }
    randevuKapat();
    randevulariYukle();
  } catch (err) {
    alert(t('randevu.saveError', { msg: err.message }));
  }
}

async function randevuDuzenle(id) {
  const rows = await window.api.randevular();
  const row = rows.find(r => r.id === id);
  if (row) randevuFormAc(row);
}

async function randevuDurumDegistir(id, durum) {
  const rows = await window.api.randevular();
  const row = rows.find(r => r.id === id);
  if (row) {
    row.durum = durum;
    await window.api.randevuGuncelle(id, row);
    randevulariYukle();
  }
}

async function whatsappHatirlat(id) {
  try {
    const rows = await window.api.randevular();
    const r = rows.find(row => row.id === id);
    if (!r) { alert(t('randevu.notFound')); return; }
    if (!r.sahip_tel) { alert(t('randevu.noPhone')); return; }
    const mesaj = whatsappMesaji(r);
    const sonuc = await window.api.whatsappGonder(r.sahip_tel, mesaj);
    if (sonuc && !sonuc.success) {
      alert(t('randevu.waFailed', { msg: sonuc.message || t('randevu.unknownError') }));
    }
  } catch (err) {
    alert(t('randevu.waError', { msg: err.message }));
  }
}

function randevuSilOnay(id) {
  if (confirm(t('randevu.deleteConfirm'))) {
    window.api.randevuSil(id).then(() => randevulariYukle());
  }
}

// ===== OTOMATİK RANDEVU KURALLARI =====
async function kurallariGoster() {
  const kurallar = await window.api.kurallar();
  const turler = await window.api.turler();
  const liste = document.getElementById('kural-liste');

  if (!kurallar.length) {
    liste.innerHTML = `<p style="color:#94a3b8;text-align:center;padding:12px">${esc(t('kural.empty'))}</p>`;
  } else {
    liste.innerHTML = `<table style="width:100%;margin-bottom:0"><thead><tr><th>${esc(t('kural.colIslem'))}</th><th>${esc(t('kural.colGun'))}</th><th>${esc(t('col.aciklama'))}</th><th></th></tr></thead><tbody>` +
      kurallar.map(k => `<tr>
        <td><strong>${esc(k.islem_adi)}</strong></td>
        <td>${esc(t('kural.days', { n: k.gun }))}</td>
        <td>${esc(k.aciklama)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="kuralSil(${k.id})">${esc(t('common.delete'))}</button></td>
      </tr>`).join('') + '</tbody></table>';
  }

  const select = document.getElementById('k-islem');
  select.innerHTML = secinizOption() +
    turler.map(t => `<option value="${esc(t.ad)}">${esc(t.ad)}</option>`).join('');

  document.getElementById('kural-overlay').classList.add('show');
}

function kuralKapat() {
  document.getElementById('kural-overlay').classList.remove('show');
}

async function kuralEkle() {
  const islem = document.getElementById('k-islem').value.trim();
  const gun = parseInt(document.getElementById('k-gun').value);
  const aciklama = document.getElementById('k-aciklama').value.trim();
  if (!islem || !gun) { alert(t('kural.required')); return; }
  await window.api.kuralEkle({ islem_adi: islem, gun, aciklama: aciklama || t('kural.defaultDesc', { islem }) });
  document.getElementById('k-islem').value = '';
  document.getElementById('k-gun').value = '';
  document.getElementById('k-aciklama').value = '';
  kurallariGoster();
}

async function kuralSil(id) {
  if (confirm(t('kural.deleteConfirm'))) {
    await window.api.kuralSil(id);
    kurallariGoster();
  }
}

async function wordAktar() {
  const result = await window.api.wordAktar();
  if (result.success) {
    alert(t('export.saved', { path: result.path }));
  } else if (result.message) {
    alert(result.message);
  }
}

// ===== BİLDİRİM SAYFASI =====
async function bildirimSayfasiYukle() {
  const filtre = document.getElementById('bildirim-filtre').value;
  const bildirimler = await window.api.bildirimlerGetir(filtre);
  const liste = document.getElementById('bildirim-liste-sayfa');
  const empty = document.getElementById('bildirim-empty');

  if (!bildirimler.length) {
    liste.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  liste.innerHTML = bildirimler.map(b => {
    let sinif = b.okundu ? 'okunmus' : '';
    const tur = bildirimTuru(b.baslik);
    if (tur === 'bugun') sinif += ' bugun-kart';
    else if (tur === 'yarin') sinif += ' yarin-kart';

    return `<div class="bildirim-kart ${sinif}" id="bk-${b.id}">
      <div class="bildirim-kart-icerik">
        <div class="bildirim-kart-baslik">${esc(bildirimBasligi(b.baslik))}</div>
        <div class="bildirim-kart-mesaj">${esc(b.mesaj)}</div>
        <div class="bildirim-kart-zaman">${esc(b.created_at)}</div>
      </div>
      <div class="bildirim-kart-aksiyonlar">
        ${!b.okundu ? `<button class="btn btn-sm btn-primary" onclick="bildirimOkunduIsaretle(${b.id})">${esc(t('bildirim.markRead'))}</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function bildirimleriFiltrele() {
  bildirimSayfasiYukle();
}

async function bildirimOkunduIsaretle(id) {
  await window.api.bildirimOkundu(id);
  bildirimSayfasiYukle();
  bildirimBadgeGuncelle();
}

async function tumunuOkunduIsaretle() {
  await window.api.bildirimTumunuOkundu();
  bildirimSayfasiYukle();
  bildirimBadgeGuncelle();
  const panel = document.getElementById('bildirim-panel');
  panel.innerHTML = '';
  panel.classList.remove('show');
}

async function okunmuslariTemizle() {
  if (!confirm(t('bildirim.clearConfirm'))) return;
  await window.api.bildirimOkunmuslariSil();
  bildirimSayfasiYukle();
}

async function bildirimBadgeGuncelle() {
  const sayi = await window.api.bildirimSayisi();
  document.getElementById('bildirim-sayisi').textContent = sayi > 0 ? sayi : '';
}

// Uygulama açılışı
async function baslat() {
  ayarlar = Object.assign(ayarlar, await window.api.ayarlar());
  metinleriUygula();
  await window.api.bildirimOlustur();
  yukle();
  bildirimleriYukle();
  bildirimBadgeGuncelle();
  // Her 5 dakikada bildirimleri yenile
  setInterval(async () => {
    await window.api.bildirimOlustur();
    bildirimBadgeGuncelle();
  }, 300000);
}
baslat();
