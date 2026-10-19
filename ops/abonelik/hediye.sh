#!/usr/bin/env bash
#
# Hediye üyelik — BU BİLGİSAYARDAN çalışır, hediye.sql'i VPS 1'deki
# veritabanına gönderir. Ayrıntı ve korumalar: hediye.sql başlığı.
#
#   ops/abonelik/hediye.sh liste
#   ops/abonelik/hediye.sh ver <e-posta> <gün | 0 = süresiz> [baslangic | pro | isletme]
#   ops/abonelik/hediye.sh al  <e-posta>
#
# Örnek: ops/abonelik/hediye.sh ver ayse@ornek.com 90 pro
set -euo pipefail

ISLEM="${1:-liste}"
EMAIL="${2:-}"
GUN="${3:-0}"
PLAN="${4:-pro}"

kullanim() {
    sed -n '6,9p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 1
}

case "$ISLEM" in
    liste) ;;
    ver | al) [ -n "$EMAIL" ] || kullanim ;;
    *) kullanim ;;
esac
# Değerler uzak komut satırına gider: yalnız güvenli karakterler.
[[ -z "$EMAIL" || "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "HATA: e-posta biçimi geçersiz: $EMAIL" >&2; exit 1; }
[[ "$GUN" =~ ^[0-9]{1,4}$ ]] || { echo "HATA: gün bir sayı olmalı (0 = süresiz)" >&2; exit 1; }
[[ "$PLAN" =~ ^(baslangic|pro|isletme)$ ]] || { echo "HATA: plan baslangic | pro | isletme olmalı" >&2; exit 1; }

DB="supabase-db-t6yi63jbebvj6c7oo7yjofnt"
DIR="$(cd "$(dirname "$0")" && pwd)"

ssh -i "$HOME/.ssh/luera_vps" -o BatchMode=yes root@76.13.4.164 \
    "docker exec -i -u postgres $DB psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -v islem=$ISLEM -v email=$EMAIL -v gun=$GUN -v plan=$PLAN -f -" \
    < "$DIR/hediye.sql"
