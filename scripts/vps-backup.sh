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
# Yedek önce VPS'in kendisinde tutulur (30 gün). 2026-10-30'dan beri her
# yedeğin ŞİFRELİ bir kopyası Cloudflare R2'ye de gider (`luera-yedek`
# kovası, `timeflow/` öneki): sunucu tamamen giderse yedek gitmesin.
#   · Şifreleme `age` ile, ALICI anahtarıyla: sunucu yalnız şifreleyebilir,
#     açamaz. Gizli anahtar kullanıcıda (Mac ~/LueraYedek + Şifreler).
#   · R2 bilgileri /root/.r2-yedek.env (600, kullanıcı yazdı); bu betikte
#     ve depoda sır yok. Anahtar yalnız bu kovaya ve bu sunucunun IP'sine.
#   · R2 yüklemesi başarısız olursa yerel yedek KORUNUR, betik 2 ile çıkar.
#
# Cron yedeklerini görmek: docs/devir/07-GERI-ALMA.md. Geri yükleme yolu ve provası:
# scripts/vps-yedek-prova.sh (geçici, ağsız kapta; canlıya dokunmaz).
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
# Roller pg_dump'a GİRMEZ (küme düzeyinde): kendi rolümüz `staff_rt` yoksa
# ona bağlı izinler kurulamıyordu (geri yükleme provası, 2026-10-30). Bu
# yüzden dosyanın başına CREATE ROLE satırları eklenir — parolasız; Supabase
# rollerinin parolasını yeni kurulum kendisi verir.
if ! { docker exec -u postgres "$DB_CONTAINER" \
          pg_dumpall -U supabase_admin --roles-only --no-role-passwords 2>/dev/null | grep '^CREATE ROLE' \
       && docker exec -u postgres "$DB_CONTAINER" \
          pg_dump -U supabase_admin -d postgres --no-owner 2>/dev/null; } | gzip > "$TMP"; then
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

# ── Dış kopya: şifrele → R2 ─────────────────────────────────────────────────
R2_ENV="/root/.r2-yedek.env"
AGE_RECIPIENT="/root/.yedek-age.pub"
if [ ! -f "$R2_ENV" ] || [ ! -f "$AGE_RECIPIENT" ] || ! command -v age >/dev/null; then
    log "UYARI: dış kopya kurulu değil (R2 bilgisi, age ya da alıcı anahtarı yok) — yalnız yerel yedek"
    exit 0
fi
set -a; . "$R2_ENV"; set +a
ENC="${OUT}.age"
if ! age -R "$AGE_RECIPIENT" -o "$ENC" "$OUT"; then
    log "HATA: şifreleme başarısız; yerel yedek duruyor"
    rm -f "$ENC"
    exit 2
fi
KEY="timeflow/$(basename "$ENC")"
# -4: R2 anahtarı yalnız sunucunun IPv4'üne izinli; IPv6'dan giden istek 403 alır.
CODE="$(curl -4 -sS -o /dev/null -w '%{http_code}' --max-time 300 \
    --aws-sigv4 "aws:amz:auto:s3" --user "${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}" \
    -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
    -T "$ENC" "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${KEY}" || echo 000)"
rm -f "$ENC"
if [ "$CODE" != "200" ]; then
    log "HATA: R2 yüklemesi başarısız (HTTP $CODE); yerel yedek duruyor"
    exit 2
fi
date '+%F %T' > "${DEST}/r2-son-yukleme.txt"
log "dış kopya tamam → r2://${R2_BUCKET}/${KEY}"
