#!/usr/bin/env bash
#
# TimeFlow — günlük veritabanı yedeği.
#
# VPS'te cron ile çalışır. 2026-09-24'e kadar bu projenin DÜZENLİ yedeği
# hiç olmadı: o gün elle alınan tek dosya dışında geri dönülecek bir nokta
# yoktu ve VPS bir kez bellek tükenmesinden donmuştu.
#
# ── Neden "yedek aldım" demek yetmiyor ──────────────────────────────────────
# Bozuk bir yedek, yedek olmadığını ancak ihtiyaç anında söyler. Bu yüzden
# dosya ÖNCE geçici ada yazılıyor, sonra DOĞRULANIYOR, ancak ondan sonra
# yerine konuyor. Doğrulama geçmezse eski yedek KORUNUYOR — kötü bir dosya
# iyi bir dosyanın üstüne yazılmıyor.
#
# ── Kapsamı ────────────────────────────────────────────────────────────────
# Yedek VPS'İN KENDİSİNDE duruyor. Sunucu tamamen giderse yedek de gider.
# Bu, hiç yedek olmamasından çok daha iyi ama tam bir felaket kurtarma
# değil; dışarı kopyalama ayrı bir iş (bkz. README notu).
#
# Kurulum ve geri yükleme: docs/devir/05-KOMUTLAR.md
set -euo pipefail

DB_CONTAINER="supabase-db-t6yi63jbebvj6c7oo7yjofnt"
DEST="/root/yedek/timeflow"
KEEP_DAYS=30
# Bu boyutun altındaki bir dump gerçek olamaz: şema tek başına ~300 KB.
MIN_BYTES=100000

STAMP="$(date +%Y-%m-%d_%H%M)"
TMP="${DEST}/.gecici_${STAMP}.sql.gz"
OUT="${DEST}/timeflow_${STAMP}.sql.gz"

log() { echo "[$(date '+%F %T')] $*"; }

mkdir -p "$DEST"

# Konteyner ayakta mı — adı Coolify yeniden dağıtımında değişebilir.
if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    log "HATA: konteyner bulunamadı: $DB_CONTAINER"
    log "Ayakta olanlar: $(docker ps --format '{{.Names}}' | grep -i supabase-db | tr '\n' ' ')"
    exit 1
fi

log "yedek alınıyor → $OUT"
# `--no-owner`: geri yüklerken rol adları tutmayabilir; veri ve şema önemli.
if ! docker exec -u postgres "$DB_CONTAINER" \
        pg_dump -U supabase_admin -d postgres --no-owner 2>/dev/null | gzip > "$TMP"; then
    log "HATA: pg_dump başarısız; eski yedekler korundu"
    rm -f "$TMP"
    exit 1
fi

# ── Doğrulama ───────────────────────────────────────────────────────────────
SIZE="$(stat -c%s "$TMP" 2>/dev/null || stat -f%z "$TMP")"
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
    log "HATA: dosya çok küçük ($SIZE bayt) — yedek sayılmaz, atılıyor"
    rm -f "$TMP"
    exit 1
fi
if ! gzip -t "$TMP" 2>/dev/null; then
    log "HATA: arşiv bozuk, atılıyor"
    rm -f "$TMP"
    exit 1
fi
# İçinde gerçekten tablo var mı — boş bir veritabanını yedeklemiş olmayalım.
TABLES="$(gunzip -c "$TMP" | grep -c '^CREATE TABLE' || true)"
if [ "$TABLES" -lt 10 ]; then
    log "HATA: yalnız $TABLES tablo bulundu — şema eksik, atılıyor"
    rm -f "$TMP"
    exit 1
fi

mv "$TMP" "$OUT"
log "tamam: $(du -h "$OUT" | cut -f1) · $TABLES tablo"

# ── Rotasyon ────────────────────────────────────────────────────────────────
# Silmeden ÖNCE elde kaç yedek kaldığına bakılıyor: temizlik, son kopyayı
# da silecek duruma gelmemeli.
REMAINING="$(find "$DEST" -name 'timeflow_*.sql.gz' -mtime -"$KEEP_DAYS" | wc -l)"
if [ "$REMAINING" -ge 1 ]; then
    DELETED="$(find "$DEST" -name 'timeflow_*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
    [ "$DELETED" -gt 0 ] && log "$DELETED eski yedek silindi (${KEEP_DAYS} günden eski)"
fi
# Geçici dosya artıkları (çöken bir koşudan kalmış olabilir).
find "$DEST" -name '.gecici_*' -mtime +1 -delete 2>/dev/null || true

log "toplam: $(find "$DEST" -name 'timeflow_*.sql.gz' | wc -l) yedek · $(du -sh "$DEST" | cut -f1)"
