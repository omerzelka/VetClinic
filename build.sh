#!/bin/bash
# ============================================================================
#  VetClinic — Windows Build Script (macOS'tan çapraz derleme)
# ============================================================================
#  Kullanım:
#    chmod +x build.sh
#    ./build.sh                  # Varsayılan: portable .exe
#    ./build.sh --nsis           # NSIS installer (.exe setup)
#    ./build.sh --msi            # MSI installer
#    ./build.sh --zip            # ZIP arşivi
#    ./build.sh --all            # Hepsini birden üret
#    ./build.sh --arch ia32      # 32-bit build
#    ./build.sh --arch arm64     # ARM64 build
#    ./build.sh --clean          # Sadece temizlik yap
#    ./build.sh --no-install     # node_modules yeniden yükleme
# ============================================================================

set -euo pipefail

# ===================== RENK KODLARI =====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ===================== YARDIMCI FONKSİYONLAR =====================
info()    { echo -e "${BLUE}[BİLGİ]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}     $1"; }
warn()    { echo -e "${YELLOW}[UYARI]${NC}  $1"; }
error()   { echo -e "${RED}[HATA]${NC}   $1"; }
step()    { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }

# ===================== DEĞİŞKENLER =====================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
DIST_DIR="$PROJECT_DIR/dist"
BUILD_TARGET="portable"
BUILD_ARCH="x64"
DO_CLEAN=false
DO_INSTALL=true
BUILD_ALL=false
START_TIME=$(date +%s)

# ===================== ARGÜMAN PARSE =====================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --nsis)      BUILD_TARGET="nsis"; shift ;;
    --portable)  BUILD_TARGET="portable"; shift ;;
    --msi)       BUILD_TARGET="msi"; shift ;;
    --zip)       BUILD_TARGET="zip"; shift ;;
    --all)       BUILD_ALL=true; shift ;;
    --arch)      BUILD_ARCH="$2"; shift 2 ;;
    --clean)     DO_CLEAN=true; shift ;;
    --no-install) DO_INSTALL=false; shift ;;
    --help|-h)
      echo ""
      echo -e "${BOLD}VetClinic — Windows Build Script${NC}"
      echo ""
      echo "Kullanım: ./build.sh [SEÇENEKLER]"
      echo ""
      echo "Build Hedefleri:"
      echo "  --portable     Portable .exe (varsayılan, kurulum gerektirmez)"
      echo "  --nsis         NSIS installer (kurulum sihirbazlı .exe)"
      echo "  --msi          MSI installer (Windows Installer paketi)"
      echo "  --zip          ZIP arşivi"
      echo "  --all          Tüm hedefleri birden üret"
      echo ""
      echo "Diğer Seçenekler:"
      echo "  --arch ARCH    Hedef mimari: x64 (varsayılan), ia32, arm64"
      echo "  --clean        Sadece temizlik yap (build yapma)"
      echo "  --no-install   node_modules yeniden yükleme"
      echo "  -h, --help     Bu yardım mesajını göster"
      echo ""
      exit 0
      ;;
    *)
      error "Bilinmeyen argüman: $1"
      echo "Yardım için: ./build.sh --help"
      exit 1
      ;;
  esac
done

# ===================== BANNER =====================
echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║     🐾 VetClinic — Windows Build            ║${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ===================== ÇALIŞMA DİZİNİ =====================
cd "$PROJECT_DIR"
info "Proje dizini: $PROJECT_DIR"

# ===================== SADECE TEMİZLİK =====================
if [ "$DO_CLEAN" = true ]; then
  step "Temizlik"
  if [ -d "$DIST_DIR" ]; then
    rm -rf "$DIST_DIR"
    success "dist/ dizini silindi"
  else
    info "dist/ dizini zaten yok"
  fi
  if [ -d "node_modules" ]; then
    read -p "node_modules da silinsin mi? (e/h): " cevap
    if [[ "$cevap" =~ ^[eE]$ ]]; then
      rm -rf node_modules
      success "node_modules/ silindi"
    fi
  fi
  success "Temizlik tamamlandı"
  exit 0
fi

# ===================== ADIM 1: ÖN KOŞULLAR =====================
step "1/7 — Ön Koşullar Kontrol Ediliyor"

# Node.js
if ! command -v node &> /dev/null; then
  error "Node.js bulunamadı!"
  echo "  Kurulum: https://nodejs.org veya 'brew install node'"
  exit 1
fi
NODE_VER=$(node -v)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js $NODE_VER çok eski. Minimum v18 gerekli."
  exit 1
fi
success "Node.js $NODE_VER"

# npm
if ! command -v npm &> /dev/null; then
  error "npm bulunamadı!"
  exit 1
fi
success "npm $(npm -v)"

# Disk alanı kontrolü (en az 500MB boş alan)
AVAILABLE_KB=$(df -k "$PROJECT_DIR" | tail -1 | awk '{print $4}')
AVAILABLE_MB=$((AVAILABLE_KB / 1024))
if [ "$AVAILABLE_MB" -lt 500 ]; then
  error "Yetersiz disk alanı! En az 500MB gerekli, mevcut: ${AVAILABLE_MB}MB"
  exit 1
fi
success "Disk alanı: ${AVAILABLE_MB}MB mevcut"

# Mimari doğrulama
case "$BUILD_ARCH" in
  x64|ia32|arm64) success "Hedef mimari: $BUILD_ARCH" ;;
  *)
    error "Geçersiz mimari: $BUILD_ARCH (x64, ia32, arm64 desteklenir)"
    exit 1
    ;;
esac

# ===================== ADIM 2: PROJE DOSYALARI =====================
step "2/7 — Proje Dosyaları Kontrol Ediliyor"

REQUIRED_FILES=("package.json" "main.js" "preload.js" "index.html" "renderer.js" "styles.css")
MISSING=false

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    error "Eksik dosya: $file"
    MISSING=true
  else
    success "$file"
  fi
done

if [ "$MISSING" = true ]; then
  error "Eksik dosyalar var, build iptal edildi."
  exit 1
fi

# İkon kontrolü
if [ ! -f "logo.ico" ]; then
  warn "logo.ico bulunamadı — Windows ikonu olmadan build edilecek"
else
  # .ico dosya boyutu kontrolü (çok küçükse bozuk olabilir)
  ICO_SIZE=$(wc -c < "logo.ico" | tr -d ' ')
  if [ "$ICO_SIZE" -lt 100 ]; then
    warn "logo.ico çok küçük (${ICO_SIZE} byte) — bozuk olabilir"
  else
    success "logo.ico (${ICO_SIZE} bytes)"
  fi
fi

# package.json'daki files listesinde olup dizinde olmayan dosyaları kontrol et
info "package.json files listesi kontrol ediliyor..."
FILES_IN_PKG=$(node -e "
  const pkg = require('./package.json');
  const files = (pkg.build && pkg.build.files) || [];
  files.forEach(f => {
    if (!f.includes('*') && !f.includes('node_modules')) {
      console.log(f);
    }
  });
" 2>/dev/null || true)

PKG_FILES_OK=true
while IFS= read -r pf; do
  if [ -n "$pf" ] && [ ! -f "$pf" ]; then
    warn "package.json files listesinde var ama dizinde yok: $pf"
    PKG_FILES_OK=false
  fi
done <<< "$FILES_IN_PKG"

if [ "$PKG_FILES_OK" = false ]; then
  warn "Eksik dosyalar package.json build.files listesinden çıkarılıyor..."

  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (pkg.build && pkg.build.files) {
      const original = [...pkg.build.files];
      pkg.build.files = pkg.build.files.filter(f => {
        if (f.includes('*') || f.includes('node_modules')) return true;
        return fs.existsSync(f);
      });
      const removed = original.filter(f => !pkg.build.files.includes(f));
      if (removed.length > 0) {
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
        console.log('REMOVED:' + removed.join(','));
      }
    }
  " 2>/dev/null | while IFS= read -r line; do
    if [[ "$line" == REMOVED:* ]]; then
      success "package.json güncellendi, çıkarılan: ${line#REMOVED:}"
    fi
  done
fi

# ===================== ADIM 3: BAĞIMLILIKLAR =====================
step "3/7 — Bağımlılıklar"

if [ "$DO_INSTALL" = true ]; then
  if [ -d "node_modules" ]; then
    info "Mevcut node_modules temizleniyor..."
    rm -rf node_modules
  fi

  if [ -f "package-lock.json" ]; then
    info "npm ci ile bağımlılıklar yükleniyor (lockfile'dan)..."
    if npm ci --no-audit --no-fund 2>&1 | tail -5; then
      success "Bağımlılıklar yüklendi (npm ci)"
    else
      warn "npm ci başarısız, npm install deneniyor..."
      rm -rf node_modules
      npm install --no-audit --no-fund 2>&1 | tail -5
      success "Bağımlılıklar yüklendi (npm install)"
    fi
  else
    info "package-lock.json yok, npm install ile yükleniyor..."
    npm install --no-audit --no-fund 2>&1 | tail -5
    success "Bağımlılıklar yüklendi"
  fi
else
  if [ ! -d "node_modules" ]; then
    error "node_modules bulunamadı ve --no-install belirtilmiş!"
    exit 1
  fi
  info "node_modules yeniden yüklenmedi (--no-install)"
fi

# electron-builder kurulu mu?
if ! npx electron-builder --version &> /dev/null; then
  error "electron-builder bulunamadı!"
  info "Çözüm: npm install --save-dev electron-builder"
  exit 1
fi
EB_VER=$(npx electron-builder --version 2>/dev/null)
success "electron-builder $EB_VER"

# ===================== ADIM 4: ÖNCEKİ BUILD TEMİZLİĞİ =====================
step "4/7 — Önceki Build Temizleniyor"

if [ -d "$DIST_DIR" ]; then
  rm -rf "$DIST_DIR"
  success "dist/ dizini temizlendi"
else
  info "dist/ dizini zaten temiz"
fi

# ===================== ADIM 5: BUILD KONFİGÜRASYONU =====================
step "5/7 — Build Konfigürasyonu"

# Build hedeflerini belirle
if [ "$BUILD_ALL" = true ]; then
  TARGETS=("portable" "nsis" "zip")
  info "Tüm hedefler build edilecek: portable, nsis, zip"
else
  TARGETS=("$BUILD_TARGET")
  info "Build hedefi: $BUILD_TARGET"
fi

info "Mimari: $BUILD_ARCH"
info "Platform: Windows (win)"

# ===================== ADIM 6: BUILD =====================
step "6/7 — Build Ediliyor"

for target in "${TARGETS[@]}"; do
  echo ""
  info "▸ Windows $target ($BUILD_ARCH) build ediliyor..."
  echo ""

  BUILD_CMD="npx electron-builder --win --${BUILD_ARCH}"

  # Hedef tipine göre config override
  case "$target" in
    portable)
      BUILD_CMD="$BUILD_CMD --config.win.target=portable"
      ;;
    nsis)
      BUILD_CMD="$BUILD_CMD --config.win.target=nsis"
      # NSIS için ek ayarlar
      BUILD_CMD="$BUILD_CMD --config.nsis.oneClick=false"
      BUILD_CMD="$BUILD_CMD --config.nsis.allowToChangeInstallationDirectory=true"
      BUILD_CMD="$BUILD_CMD --config.nsis.installerIcon=logo.ico"
      BUILD_CMD="$BUILD_CMD --config.nsis.uninstallerIcon=logo.ico"
      BUILD_CMD="$BUILD_CMD --config.nsis.installerHeaderIcon=logo.ico"
      ;;
    msi)
      BUILD_CMD="$BUILD_CMD --config.win.target=msi"
      ;;
    zip)
      BUILD_CMD="$BUILD_CMD --config.win.target=zip"
      ;;
  esac

  info "Komut: $BUILD_CMD"
  echo ""

  if eval "$BUILD_CMD"; then
    success "✅ $target build başarılı!"
  else
    error "❌ $target build başarısız!"

    # Yaygın hata çözüm önerileri
    echo ""
    warn "Olası çözümler:"
    echo "  1. Node.js güncelleyin: nvm install --lts"
    echo "  2. Temiz kurulum: rm -rf node_modules && npm install"
    echo "  3. Cache temizle: npx electron-builder install-app-deps"
    echo "  4. Wine gerekebilir (code signing için): brew install --cask wine-stable"
    echo "  5. Yetki sorunu: chmod -R 755 node_modules"
    echo ""

    # Diğer hedefler varsa devam etsin mi
    if [ "${#TARGETS[@]}" -gt 1 ]; then
      warn "Diğer hedeflerle devam ediliyor..."
      continue
    else
      exit 1
    fi
  fi
done

# ===================== ADIM 7: SONUÇ =====================
step "7/7 — Build Sonucu"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

echo ""
if [ -d "$DIST_DIR" ]; then
  info "Çıktı dosyaları (dist/):"
  echo ""

  # Üretilen dosyaları listele
  find "$DIST_DIR" -maxdepth 1 \( -name "*.exe" -o -name "*.msi" -o -name "*.zip" -o -name "*.blockmap" -o -name "*.yml" \) -exec sh -c '
    for f do
      size=$(du -sh "$f" | cut -f1)
      name=$(basename "$f")
      echo -e "  📦 \033[1m$name\033[0m ($size)"
    done
  ' sh {} +

  # Dosya bulunamazsa alt dizinlere bak
  if [ -z "$(find "$DIST_DIR" -maxdepth 1 \( -name "*.exe" -o -name "*.msi" -o -name "*.zip" \) 2>/dev/null)" ]; then
    find "$DIST_DIR" -name "*.exe" -o -name "*.msi" -o -name "*.zip" | while read -r f; do
      size=$(du -sh "$f" | cut -f1)
      echo -e "  📦 ${BOLD}$(basename "$f")${NC} ($size)"
    done
  fi

  echo ""
  success "Build tamamlandı! (${MINUTES}dk ${SECONDS}sn)"
  echo ""
  echo -e "  ${BOLD}Çıktı dizini:${NC} $DIST_DIR"
  echo -e "  ${BOLD}Finder'da aç:${NC} open $DIST_DIR"
  echo ""

  # Finder'da aç
  if command -v open &> /dev/null; then
    read -p "dist/ klasörünü Finder'da açmak ister misiniz? (e/h): " ac
    if [[ "$ac" =~ ^[eE]$ ]]; then
      open "$DIST_DIR"
    fi
  fi
else
  error "dist/ dizini oluşturulamadı — build başarısız!"
  exit 1
fi

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║     ✅ İşlem tamamlandı!                     ║${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
