#!/usr/bin/env bash
# ============================================================
# VPS 1 (TimeFlow, 76.13.4.164) — Dodo bildirimi Core'a ULAŞABİLİYOR MU?
# ============================================================
# SALT OKUNUR. Hiçbir şey yazmaz, hiçbir kabı yeniden başlatmaz.
# Sır BASMAZ: adreslerin yalnız host kısmı, anahtarın yalnız uzunluğu.
#
# Ne yapar: `dodo-webhook`in kullandığı Core adresi + anahtarıyla Core'un üç
# tablosuna birer okuma isteği atar ve yalnız HTTP kodunu yazar. Aynı anahtarı
# `core.lueratech.com`'a da dener — adres mi yanlış, anahtar mı, anlaşılsın.
#
# Çalıştırma (kullanıcı):
#   ssh -i ~/.ssh/luera_vps root@76.13.4.164 'bash -s' < ~/Projects/luera-timeflow/ops/abonelik/core-baglanti.sh
# ============================================================
set -u

DB=supabase-db-t6yi63jbebvj6c7oo7yjofnt
FN=supabase-edge-functions-t6yi63jbebvj6c7oo7yjofnt

q()    { docker exec -u postgres "$DB" psql -U supabase_admin -d postgres -At -c "$1"; }
host() { printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*#\1#'; }

# $1 etiket · $2 adres · $3 anahtar
try() {
    for t in subscriptions billing_events organizations; do
        code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' \
            "$2/rest/v1/$t?select=id&limit=1" -H "apikey: $3" -H "Authorization: Bearer $3")
        printf '  %-22s · %-15s → %s\n' "$1" "$t" "$code"
    done
}

echo "== §1 · Fonksiyon kabında ortam değişkeni (yalnız ADI) — varsa app_secrets'ı EZER"
names=$(docker exec "$FN" printenv 2>/dev/null | grep -oE '^(CORE_[A-Z_]+|DODO_[A-Z_]+|ENTITLEMENT_ENFORCE)=' | sed 's/=$//')
if [ -n "$names" ]; then echo "$names" | sed 's/^/  /'; else echo "  (yok — sırlar app_secrets'tan okunuyor)"; fi

ENV_URL=$(docker exec "$FN" printenv CORE_SUPABASE_URL 2>/dev/null || true)
ENV_KEY=$(docker exec "$FN" printenv CORE_SERVICE_KEY 2>/dev/null || true)

echo
echo "== §2 · app_secrets'taki Core adresi"
URL=$(q "select value from app_secrets where key='CORE_SUPABASE_URL'")
KEY=$(q "select value from app_secrets where key='CORE_SERVICE_KEY'")
echo "  host: $(host "$URL")  · anahtar: ${#KEY} karakter"
[ -n "$ENV_URL" ] && echo "  ORTAMDAKİ host: $(host "$ENV_URL")  · anahtar: ${#ENV_KEY} karakter  ← webhook BUNU kullanır"

echo
echo "== §3 · Okuma denemesi (yalnız HTTP kodu)"
EFF_URL=${ENV_URL:-$URL}
EFF_KEY=${ENV_KEY:-$KEY}
if [ -n "$EFF_URL" ] && [ -n "$EFF_KEY" ]; then
    try "webhook'un adresi" "$EFF_URL" "$EFF_KEY"
    try "core.lueratech.com" "https://core.lueratech.com" "$EFF_KEY"
else
    echo "  Core adresi ya da anahtarı TANIMSIZ — webhook her olayda 'not_configured' 500 döner."
fi
echo
echo "  200 = adres + anahtar çalışıyor · 401 = anahtar bu yığının değil"
echo "  503 / 000 = yığın ayakta değil ya da ulaşılamıyor · 404 = tablo yok"

echo
echo "== §4 · Son 3 gün webhook izleri (fonksiyon kabının günlüğü, yalnız ilgili satırlar)"
docker logs --since 72h "$FN" 2>&1 | grep -E 'dodo-webhook|org mirror|core_write_failed|no available server|mirrorEntitlement' | tail -n 20 | cut -c1-200
echo "  (boşsa son 3 günde Dodo bildirimi gelmemiş ya da günlük daha kısa tutuluyor)"
