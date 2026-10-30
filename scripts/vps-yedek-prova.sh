#!/usr/bin/env bash
#
# TimeFlow — yedekten GERİ YÜKLEME PROVASI (ve felakette geri yükleme yolu).
#
# Bir yedeğin işe yaradığını ancak geri yüklemek kanıtlar. Bu betik son
# (ya da verilen) yedeği GEÇİCİ, AĞSIZ, sınırlı bir kapta kurar, ana
# tabloların satır sayılarını canlıyla karşılaştırır ve kabı siler.
# Canlı veritabanına yalnız sayım için salt okunur sorgu atar.
#
# Kullanım (VPS'te, root):  bash vps-yedek-prova.sh [/root/yedek/timeflow/X.sql.gz]
# R2'deki şifreli kopyadan: Mac'te `age -d -i ~/LueraYedek/yedek-anahtari.txt
# X.sql.gz.age > X.sql.gz`, sunucuya kopyala, bu betiğe ver.
#
# ── Geri yüklemenin iki şartı (2026-10-30 provasında bulundu) ───────────────
# 1. ROLLER: pg_dump rolleri almaz. 2026-10-30'dan sonraki yedeklerin başında
#    CREATE ROLE satırları var (vps-backup.sh). Daha eski bir yedekse rolleri
#    önce elle kur (en az `staff_rt`), yoksa ona bağlı izinler kurulmaz.
# 2. auth/storage ŞEMALARI: supabase/postgres imajı bu şemaları ESKİ biçimde
#    hazır getirir; yedekteki auth.users kurulamaz, kullanıcıya bağlı her şey
#    yabancı anahtar hatası verir. Yüklemeden ÖNCE ikisi kaldırılır, yedek
#    kendi biçimini kurar. Kalan ~20 "already exists" uyarısı zararsız.
#
# Bellek tavanı 768 MB, yarım çekirdek: canlı aynı makinede çalışıyor.
set -u

C=yedek-prova
IMG=supabase/postgres:15.8.1.085
LIVE=supabase-db-t6yi63jbebvj6c7oo7yjofnt
F="${1:-$(ls -1t /root/yedek/timeflow/timeflow_*.sql.gz | head -1)}"
[ -f "$F" ] || { echo "yedek yok: $F"; exit 1; }
echo "yedek: $F"

PW="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
docker rm -f "$C" >/dev/null 2>&1
trap 'docker rm -f "$C" >/dev/null 2>&1; rm -f /tmp/prova.err /tmp/prova.a /tmp/prova.b' EXIT
docker run -d --name "$C" --network none --memory 768m --cpus 0.5 \
    -e POSTGRES_PASSWORD="$PW" "$IMG" >/dev/null || exit 1
for _ in $(seq 1 60); do docker exec -u postgres "$C" pg_isready -q 2>/dev/null && break; sleep 2; done
sleep 5

# -i stdin'i okur: komut verilmeyen çağrılarda </dev/null şart, yoksa
# betik stdin'den okunuyorsa geri kalanını yutar.
P() { docker exec -i -e PGPASSWORD="$PW" -u postgres "$C" psql -U supabase_admin -d postgres -X -q "$@"; }

P -c "drop schema if exists auth cascade; drop schema if exists storage cascade;" </dev/null >/dev/null 2>&1
T0=$(date +%s)
gunzip -c "$F" | P >/dev/null 2>/tmp/prova.err
echo "süre: $(( $(date +%s) - T0 )) sn · hata: $(grep -c ERROR /tmp/prova.err) (already exists hariç: $(grep ERROR /tmp/prova.err | grep -vc 'already exists'))"
grep ERROR /tmp/prova.err | grep -v 'already exists' | sed 's/ERROR: *//' | cut -c1-100 | sort | uniq -c | sort -rn | head -10

Q="select 'organizations',count(*) from public.organizations
 union all select 'auth.users',count(*) from auth.users
 union all select 'customers',count(*) from public.customers
 union all select 'reservations',count(*) from public.reservations
 union all select 'services',count(*) from public.services
 union all select 'staff',count(*) from public.staff
 union all select 'payments',count(*) from public.payments
 union all select 'org_entitlement',count(*) from public.org_entitlement
 union all select 'public_tablo',count(*) from information_schema.tables where table_schema='public'"
P -tA -F ' ' -c "$Q" </dev/null > /tmp/prova.a
docker exec -u postgres "$LIVE" psql -U supabase_admin -d postgres -X -qtA -F ' ' -c "$Q" </dev/null > /tmp/prova.b 2>/dev/null
echo "tablo            prova    canlı"
paste -d' ' /tmp/prova.a /tmp/prova.b | awk '{ m = ($2==$4) ? "eşit" : "FARK"; if (m=="FARK") bad=1; printf "%-16s %6s %8s  %s\n", $1, $2, $4, m } END { exit bad }'
RC=$?
[ "$RC" = 0 ] && echo "SONUÇ: yedek eksiksiz geri yüklendi" || echo "SONUÇ: FARK VAR (yedek canlıdan eskiyse küçük farklar normaldir)"
exit "$RC"
