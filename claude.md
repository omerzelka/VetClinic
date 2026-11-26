# VetClinic - Veteriner Klinik Yönetim Sistemi

## Proje Özeti

VetClinic, küçük ölçekli veteriner kliniklerinin günlük operasyonlarını yönetmek için geliştirilmiş bir **Electron masaüstü uygulamasıdır**. Hasta kayıtları, randevu takibi, otomatik randevu kuralları, bildirim sistemi ve WhatsApp entegrasyonu sunar. Herhangi bir kliniğe özel değildir: klinik adı, para birimi ve WhatsApp ülke kodu Ayarlar'dan girilir. Arayüz Türkçe ve İngilizce destekler.

## Teknoloji Yığını

| Katman | Teknoloji | Versiyon |
|--------|-----------|----------|
| Framework | Electron | ^42.5.1 |
| Veritabanı | sql.js (SQLite in-memory → dosya) | ^1.14.1 |
| Doküman | docx (Word dışa aktarma) | ^9.7.1 |
| Build | electron-builder | ^26.15.3 |
| UI | Vanilla HTML/CSS/JS | - |
| Arayüz dili | Türkçe / İngilizce (`i18n.js`) | - |

## Dizin Yapısı

```
VetClinic/
├── main.js           # Electron ana süreç (backend): DB, IPC handler'lar
├── preload.js        # contextBridge ile renderer'a sunulan API
├── index.html        # Tek sayfa HTML (3 sekme: İşlemler, Randevular, Bildirimler)
├── renderer.js       # Renderer süreç mantığı (DOM, event'ler, UI state)
├── i18n.js           # TR/EN sözlük + dile göre varsayılan veriler (main ve renderer ortak)
├── styles.css        # Tüm stiller (CSS custom properties, modal, tablo, bildirim)
├── logo.ico          # Windows ikonu
├── package.json      # Proje konfigürasyonu ve build ayarları
└── node_modules/     # Bağımlılıklar
```

## Mimari

### Süreç Ayrımı (Electron)

```
┌─────────────────────────────────────────────────┐
│  Main Process (main.js)                         │
│  ├─ SQLite DB yönetimi (sql.js)                 │
│  ├─ IPC handler'lar (ipcMain.handle)            │
│  ├─ Word dışa aktarma (docx)                    │
│  └─ WhatsApp deep link (shell.openExternal)     │
├─────────────────────────────────────────────────┤
│  Preload (preload.js)                           │
│  └─ contextBridge.exposeInMainWorld('api', ...) │
├─────────────────────────────────────────────────┤
│  Renderer Process (renderer.js + index.html)    │
│  ├─ DOM manipülasyonu                           │
│  ├─ window.api.* üzerinden IPC çağrıları        │
│  └─ Tüm UI state'i                             │
└─────────────────────────────────────────────────┘
```

- **contextIsolation: true**, **nodeIntegration: false** → güvenli yapı
- Tüm DB erişimi main process'te, renderer sadece `window.api.*` kullanır

### Veritabanı

SQLite dosyası `sql.js` ile in-memory yüklenir, her değişiklikte `fs.writeFileSync` ile diske yazılır.

**DB Konumu:**
- Portable mod: `PORTABLE_EXECUTABLE_DIR/veteriner.db`
- Normal mod: `app.getPath('userData')/veteriner.db`

## Ayarlar ve Dil Desteği

- `ayarlar` tablosu (anahtar/değer): `dil` (`tr`/`en`), `klinik_adi`, `ulke_kodu`, `para_birimi`, `varsayilanlar_yuklendi`
- İlk açılışta dil, `app.getLocale()`'a göre seçilir (tr → Türkçe, 90, TL; diğer → İngilizce, ülke kodu boş, USD). Ayarları olmayan eski bir veritabanı Türkçe varsayılanlarla devam eder.
- Varsayılan işlem türleri / hastalıklar / kurallar sadece bir kez (ilk kurulumda, seçilen dilde) eklenir; kullanıcının sildikleri geri gelmez.
- Renderer'da tüm metinler `t('anahtar', {param})` ile gelir; HTML'de `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` attribute'ları kullanılır. Yeni metin eklerken `i18n.js`'te hem `tr` hem `en` anahtarını ekle.
- Bildirim başlıkları DB'de kod olarak saklanır (`bugun` / `yarin` / `yaklasan`) ve gösterimde çevrilir.
- Header'daki TR/EN düğmesi dili anında değiştirir; ⚙ düğmesi Ayarlar modalını açar.

## Veritabanı Şeması

### `islemler` — Ana hasta/işlem kayıtları
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK AUTO | Birincil anahtar |
| sahip_ad | TEXT | Hayvan sahibinin adı |
| sahip_tel | TEXT NOT NULL | Telefon numarası (zorunlu) |
| hayvan_ad | TEXT | Hayvan adı |
| hayvan_tur | TEXT | Tür (Köpek, Kedi vb.) |
| hastalik | TEXT | Tanı/hastalık |
| islem | TEXT NOT NULL | Yapılan işlem türü |
| tarih | TEXT NOT NULL | İşlem tarihi (YYYY-MM-DD) |
| ucret | REAL DEFAULT 0 | Ücret (Ayarlar'daki para birimi) |

### `randevular` — Randevu takibi
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK AUTO | Birincil anahtar |
| sahip_ad | TEXT | Hasta sahibi |
| sahip_tel | TEXT NOT NULL | Telefon |
| hayvan_ad | TEXT | Hayvan adı |
| tarih | TEXT NOT NULL | Tarih (YYYY-MM-DD) |
| saat | TEXT NOT NULL | Saat (HH:MM) |
| aciklama | TEXT | Randevu açıklaması |
| durum | TEXT DEFAULT 'bekliyor' | 'bekliyor' / 'tamamlandi' / 'iptal' |

### `islem_turleri` — Dinamik işlem türü listesi
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK AUTO | Birincil anahtar |
| ad | TEXT NOT NULL UNIQUE | İşlem adı |

Varsayılan türler: Muayene, Aşı, Ameliyat, Diş Temizliği, Tırnak Kesimi, Kulak Temizliği, Parazit Tedavisi, Röntgen, Ultrason, Kan Tahlili, Kısırlaştırma, Yara Bakımı, Banyo, Traslama

### `hastaliklar` — Dinamik hastalık listesi
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK AUTO | Birincil anahtar |
| ad | TEXT NOT NULL UNIQUE | Hastalık adı |

Varsayılan hastalıklar: Parazit, Mantar, Kulak Enfeksiyonu, Göz Enfeksiyonu, İshal, Kusma, Alerji, Kırık, Çıkık, Diş Hastalığı, Deri Hastalığı, Tümör, Böbrek Yetmezliği, Karaciğer Hastalığı, Kalp Hastalığı, Şeker Hastalığı, Kuduz, Parvo, Distemper, Leptospiroz

### `oto_randevu_kurallari` — Otomatik randevu kuralları
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK AUTO | Birincil anahtar |
| islem_adi | TEXT NOT NULL UNIQUE | Tetikleyen işlem adı |
| gun | INTEGER NOT NULL | Kaç gün sonra randevu oluşturulsun |
| aciklama | TEXT | Randevu açıklaması |

Varsayılan kurallar: Kuduz Aşısı→180 gün, Karma Aşı→365, İç Parazit→90, Dış Parazit→30, Kuduz→180, Aşı→365, Parazit Tedavisi→90, Diş Temizliği→180, Kan Tahlili→180

### `bildirimler` — Yaklaşan randevu bildirimleri
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK AUTO | Birincil anahtar |
| baslik | TEXT NOT NULL | Bildirim başlığı |
| mesaj | TEXT NOT NULL | Bildirim mesajı |
| tip | TEXT DEFAULT 'randevu' | Bildirim tipi |
| randevu_id | INTEGER | İlişkili randevu ID |
| tarih | TEXT NOT NULL | Oluşturulma tarihi |
| okundu | INTEGER DEFAULT 0 | 0=okunmamış, 1=okunmuş |
| created_at | TEXT | datetime('now','localtime') |

## IPC API Referansı

Tüm IPC çağrıları `ipcMain.handle` / `ipcRenderer.invoke` pattern'i ile çalışır.

### İşlem CRUD
| Kanal | Parametreler | Dönüş | Açıklama |
|-------|-------------|-------|----------|
| `ekle` | data objesi | randevu önerisi veya null | Yeni işlem ekler, otomatik randevu kontrolü yapar |
| `guncelle` | id, data | void | İşlem günceller |
| `sil` | id | void | İşlem siler |
| `listele` | sort ('tarih_asc'/'tarih_desc'/null) | rows[] | Tüm işlemleri listeler |
| `ara` | q (string) | rows[] | Tüm alanlarda LIKE araması |
| `sahipler` | - | [{sahip_ad, sahip_tel}] | Benzersiz sahip listesi (autocomplete için) |

### İşlem Türleri & Hastalıklar
| Kanal | Parametreler | Dönüş |
|-------|-------------|-------|
| `turler` | - | [{id, ad}] |
| `tur-ekle` | ad | void |
| `tur-sil` | id | void |
| `hastaliklar` | - | [{id, ad}] |
| `hastalik-ekle` | ad | void |
| `hastalik-sil` | id | void |

### Randevular
| Kanal | Parametreler | Dönüş |
|-------|-------------|-------|
| `randevu-ekle` | data | void |
| `randevu-guncelle` | id, data | void |
| `randevu-sil` | id | void |
| `randevular` | - | rows[] (tarih ASC, saat ASC) |
| `yaklasan-randevular` | - | bugün-3 gün arası bekleyen randevular |

### Otomatik Randevu
| Kanal | Parametreler | Dönüş |
|-------|-------------|-------|
| `kurallar` | - | [{id, islem_adi, gun, aciklama}] |
| `kural-ekle` | {islem_adi, gun, aciklama} | void (upsert) |
| `kural-sil` | id | void |
| `otomatik-randevu-onayla` | data | void |

### Bildirimler
| Kanal | Parametreler | Dönüş |
|-------|-------------|-------|
| `bildirim-olustur` | - | void (3 gün içi randevular için bildirim üretir) |
| `bildirimler-getir` | filtre ('aktif'/'okunmus'/'tumu') | rows[] |
| `bildirim-okundu` | id | void |
| `bildirim-tumunu-okundu` | - | void |
| `bildirim-okunmuslari-sil` | - | void |
| `bildirim-sayisi` | - | number |

### Diğer
| Kanal | Parametreler | Dönüş |
|-------|-------------|-------|
| `whatsapp-gonder` | tel, mesaj | {success, message?} (WhatsApp Web linki açar) |
| `ayarlar` | - | {dil, klinik_adi, ulke_kodu, para_birimi} |
| `ayar-kaydet` | kısmi ayar objesi | void |
| `word-aktar` | - | {success, path?} (tüm kayıtları .docx'e aktarır) |

## UI Yapısı

### 3 Ana Sekme
1. **İşlemler** — Tablo görünümünde CRUD, arama, tarih sıralaması, Word dışa aktarma
2. **Randevular** — Randevu listesi, durum yönetimi, WhatsApp hatırlatma, otomatik randevu kuralları
3. **Bildirimler** — Aktif/okunmuş bildirim filtreleme, toplu işlemler

### Modallar
- **İşlem Modal** — Yeni/düzenle formu, sahip autocomplete, hastalık/işlem türü select + dinamik ekleme/silme, otomatik randevu toggle
- **Randevu Modal** — Yeni/düzenle formu, sahip autocomplete
- **Kural Modal** — Otomatik randevu kuralları yönetimi
- **Mini Dialog** — Yeni hastalık/işlem türü eklemek için küçük input dialog

### Bildirim Paneli (Header altı)
- Sayfa yüklendiğinde 3 gün içi bekleyen randevular otomatik gösterilir
- Bugün → kırmızı, Yarın → turuncu, Diğer → altın sarısı vurgulu

## Stil Sistemi

CSS custom properties ile merkezi tema:

```css
--teal: #2a7b88      /* Ana renk */
--teal-dark: #1f6570  /* Koyu varyant */
--gold: #e8b731       /* Vurgu / CTA rengi */
--green: #16a34a      /* Başarı / ücret */
--red: #dc2626        /* Tehlike / silme */
```

Tasarım özellikleri: rounded corners (8-14px), gradient header, backdrop blur modaller, hover efektleri, toggle switch, durum badge'leri

## İş Kuralları

### Otomatik Randevu Sistemi
1. Kullanıcı "Otomatik Randevu" toggle'ını açar (localStorage'da saklanır)
2. Bir işlem kaydedildiğinde, işlem adı `oto_randevu_kurallari.islem_adi` ile karşılaştırılır (case-insensitive `includes` kontrolü)
3. Eşleşme varsa, işlem tarihine `gun` eklenerek yeni randevu önerilir
4. Toggle açıksa otomatik onaylanır ve randevulara eklenir

### Bildirim Sistemi
1. Uygulama açılışında `bildirim-olustur` çağrılır
2. Bugün ile +3 gün arası "bekliyor" durumundaki randevular taranır
3. Her randevu için günde bir kez bildirim oluşturulur (duplikasyon kontrolü: randevu_id + tarih)
4. `bugun` / `yarin` / `yaklasan` başlık kodları atanır (renderer aktif dile çevirir)

### WhatsApp Entegrasyonu
- Telefon numarası temizlenir (rakam dışı karakterler kaldırılır)
- Numara `+` ile başlıyorsa olduğu gibi, `00` ile başlıyorsa `00` atılarak kullanılır; aksi halde baştaki 0'lar silinir ve Ayarlar'daki ülke kodu (varsa) eklenir
- `wa.me` deep link ile mesaj hazır pencere açılır

### Word Dışa Aktarma
- Tüm işlem kayıtları landscape formatta Word tablosu olarak dışa aktarılır
- Segoe UI fontu, teal header rengi, zebra satır renklendirme

## Geliştirme

```bash
# Bağımlılıkları yükle
npm install

# Uygulamayı başlat
npm start

# Windows portable build
npm run build

# macOS DMG build
npm run build:mac
```

## Kodlama Kuralları

- **Dil**: Değişken ve fonksiyon adları Türkçedir; UI metinleri `i18n.js` üzerinden TR/EN çevrilir (koda sabit metin yazma)
- **DB Kaydetme**: Her veritabanı değişikliğinden sonra `save()` çağrılmalıdır
- **Tarih Formatı**: Her yerde `YYYY-MM-DD` string formatı kullanılır (`localDateStr()` / `localToday()`)
- **XSS Koruması**: Renderer'da tüm kullanıcı verileri `esc()` fonksiyonu ile escape edilir
- **IPC Pattern**: Main'de `ipcMain.handle`, preload'da `contextBridge.exposeInMainWorld`, renderer'da `window.api.*`
- **State Yönetimi**: Global değişkenler (editId, randevuEditId, tarihSort, otoRandevuAcik) ile basit state
- **Modal Pattern**: `.overlay.show` CSS class toggle ile açılıp kapanır
