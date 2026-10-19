#!/usr/bin/env bash
# ============================================================
# VPS 2 (187.124.161.110) — LUERA Core'un KEŞFİ
# ============================================================
# SALT OKUNUR. Hiçbir şey yazmaz, hiçbir kabı başlatmaz/durdurmaz.
# Sır BASMAZ: alan adı kuralları, tablo adları, durumlar ve olay türleri.
#
# Ne öğrenilecek:
#   §1 bu sunucuda hangi Supabase yığınları var, ayakta mı
#   §2 hangi yığın hangi alan adına bağlı (core.lueratech.com / supabase.lueratech.com)
#   §3 Core tabloları hangi veritabanında; TimeFlow abonelikleri ve son Dodo olayları
#   §4 bellek / disk (2026-09-11'de bu sunucu bellek tükenmesinden donmuştu)
#
# Çalıştırma (kullanıcı):
#   ssh -i ~/.ssh/luera_vps root@187.124.161.110 'bash -s' < ~/Projects/luera-timeflow/ops/abonelik/core-kesif.sh
# Anahtar bu sunucuda geçmezse: Coolify'da VPS 2'nin terminalinden aynı içerik.
# ============================================================
set -u

echo "== §1 · Supabase kapları (ad · durum)"
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -E 'supabase-(db|kong|rest|auth|edge)' | sort | sed 's/^/  /'

echo
echo "== §2 · Hangi yığın hangi alan adında (Kong'un yönlendirme kuralı)"
for k in $(docker ps -a --format '{{.Names}}' | grep -E '^supabase-kong'); do
    hosts=$(docker inspect -f '{{json .Config.Labels}}' "$k" 2>/dev/null | grep -oE 'Host\(`[^`]+`\)' | sort -u | tr '\n' ' ')
    state=$(docker inspect -f '{{.State.Status}}' "$k" 2>/dev/null)
    echo "  $k [$state] → ${hosts:-(kural yok)}"
done

for db in $(docker ps --format '{{.Names}}' | grep -E '^supabase-db'); do
    echo
    echo "== §3 · $db"
    core=$(docker exec -u postgres "$db" psql -U supabase_admin -d postgres -At \
        -c "select to_regclass('public.billing_events') is not null and to_regclass('public.subscriptions') is not null")
    if [ "$core" != "t" ]; then
        echo "  (subscriptions / billing_events yok — Core DEĞİL)"
        continue
    fi
    echo "  ★ CORE TABLOLARI BURADA"
    docker exec -i -u postgres "$db" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=0 -P pager=off <<'SQL'
\echo '  -- has_active_subscription var mı'
select count(*) as fonksiyon from pg_proc where proname = 'has_active_subscription';
\echo '  -- TimeFlow abonelikleri (kısaltılmış org kimliği)'
select left(organization_id::text, 8) as org, status, plan_tier,
       to_char(expires_at, 'YYYY-MM-DD') as bitis,
       to_char(created_at, 'YYYY-MM-DD') as acildi,
       metadata->>'cancel_at_period_end' as donem_sonu_iptal
from subscriptions where module_name = 'timeflow'
order by created_at desc limit 20;
\echo '  -- Son 20 Dodo olayı'
select to_char(occurred_at, 'YYYY-MM-DD HH24:MI') as zaman, event_type,
       left(organization_id::text, 8) as org, amount, currency
from billing_events order by occurred_at desc limit 20;
\echo '  -- TimeFlow için aynalanmış organizasyonlar (tf-…)'
select count(*) as tf_org from organizations where slug like 'tf-%';
SQL
done

echo
echo "== §4 · Bellek / disk / açık kalma süresi"
free -m | head -2 | sed 's/^/  /'
df -h / | tail -1 | sed 's/^/  /'
uptime | sed 's/^/  /'
