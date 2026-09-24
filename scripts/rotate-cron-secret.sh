#!/usr/bin/env bash
#
# CRON_TRIGGER_SECRET döndürme — VPS'in ÜSTÜNDE çalışır.
#
# Sır burada üretiliyor, burada yazılıyor ve hiçbir zaman ekrana basılmıyor:
# bu dosyanın tamamı "değeri kimse görmesin" ilkesi üzerine kurulu. 2026-09-24'te
# eski sır bir `crontab -l` çıktısının ekran görüntüsünde açığa çıktı.
#
# Sırrın işi: `remind` ucunu dışarıdan tetiklenmeye karşı korumak
# (`_shared/auth.ts` · identify → kind: 'cron'). Bilen biri hatırlatma
# gönderimini istediği an çalıştırabilir — müşterilere istenmeyen mesaj gider.
#
# İKİ YERİ BİRDEN değiştirmek zorunda: veritabanındaki `app_secrets` satırı ve
# crontab'daki başlık. Biri güncellenip öteki kalırsa cron 401 alır ve
# hatırlatmalar SESSİZCE durur.
set -euo pipefail

DB_CONTAINER="supabase-db-t6yi63jbebvj6c7oo7yjofnt"

psql_exec() {
    docker exec -i -u postgres "$DB_CONTAINER" psql -U supabase_admin -d postgres -qtA "$@"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    echo "HATA: veritabanı konteyneri bulunamadı: $DB_CONTAINER" >&2
    exit 1
fi

# Crontab'da sırrı taşıyan satır var mı — yoksa güncellenecek bir şey yok
# ve yalnız veritabanını değiştirmek hatırlatmaları kırardı.
if ! crontab -l 2>/dev/null | grep -q 'x-cron-secret:'; then
    echo "HATA: crontab'da x-cron-secret taşıyan satır yok; iptal edildi" >&2
    exit 1
fi

NEW="$(openssl rand -hex 32)"

# ── 1 · Veritabanı ──────────────────────────────────────────────────────────
# Satır yoksa ekleniyor: `remind` sırrı bulamazsa çağrıyı reddediyor.
psql_exec -c "insert into app_secrets (key, value) values ('CRON_TRIGGER_SECRET', '${NEW}')
              on conflict (key) do update set value = excluded.value;" > /dev/null

WROTE="$(psql_exec -c "select length(value) from app_secrets where key = 'CRON_TRIGGER_SECRET';")"
if [ "$WROTE" != "64" ]; then
    echo "HATA: veritabanına yazılamadı (uzunluk: ${WROTE:-yok}); crontab'a DOKUNULMADI" >&2
    exit 1
fi

# ── 2 · Crontab ─────────────────────────────────────────────────────────────
# Yedeği önce alınıyor: sed tutmazsa eski hâl geri konabilsin.
crontab -l > "/root/crontab.yedek.$(date +%Y%m%d_%H%M)" 2>/dev/null || true
crontab -l 2>/dev/null | sed "s/x-cron-secret: [A-Za-z0-9]\{16,\}/x-cron-secret: ${NEW}/" | crontab -

if ! crontab -l | grep -q "x-cron-secret: ${NEW}"; then
    echo "HATA: crontab güncellenmedi. Veritabanı YENİ sırrı taşıyor," >&2
    echo "      yani hatırlatmalar şu an ÇALIŞMIYOR. /root/crontab.yedek.* dosyasına bak." >&2
    exit 1
fi

unset NEW
echo "✓ CRON_TRIGGER_SECRET döndürüldü — veritabanı ve crontab birlikte güncellendi"
echo "  (değer hiçbir yerde basılmadı; crontab yedeği /root/crontab.yedek.* altında)"
echo
echo "Doğrulama: aşağıdaki komut 200 dönmeli."
echo '  SECRET=$(docker exec -i -u postgres '"$DB_CONTAINER"' psql -U supabase_admin -d postgres -qtA -c "select value from app_secrets where key='"'"'CRON_TRIGGER_SECRET'"'"';")'
echo '  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://supabase.timeflow.lueratech.com/functions/v1/remind -H "x-cron-secret: $SECRET" -H "Content-Type: application/json" -d "{}"'
