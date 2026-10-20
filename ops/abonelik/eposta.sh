#!/usr/bin/env bash
#
# Abonelik e-postaları — BU BİLGİSAYARDAN çalışır, işi VPS 1'de yapar.
# Ayrıntı: supabase/functions/abonelik-eposta/index.ts başlığı · devir 13.
#
#   ops/abonelik/eposta.sh durum                  anahtarlar, cron satırı, son 30 gün
#   ops/abonelik/eposta.sh anahtar                ~/.luera-resend.env → app_secrets.RESEND_API_KEY
#   ops/abonelik/eposta.sh cron                   15 dk'lık crontab satırı (önce bir kez dener)
#   ops/abonelik/eposta.sh kuru                   kime ne gidecek (adresler maskeli)
#   ops/abonelik/eposta.sh dene <e-posta> <tür>   tür: hosgeldin uc_gun bitti son odeme
#   ops/abonelik/eposta.sh ac [zorla] | kapa      gerçek gönderimi aç / kapat
#
# Hiçbir sır ekrana ya da komut satırına çıkmaz: Resend anahtarı psql'in
# girdisinden gider, cron sırrı VPS'te veritabanından okunur ve curl'e
# başlık dosyasıyla verilir. 2026-09-24'te bir `crontab -l` ekran görüntüsü
# sırrı açığa çıkarmıştı — bu betik crontab'ı yalnız maskeli basar.
set -euo pipefail

ISLEM="${1:-durum}"
ARG1="${2:-}"
ARG2="${3:-}"

kullanim() {
    sed -n '6,11p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 1
}

DB="supabase-db-t6yi63jbebvj6c7oo7yjofnt"
SSH=(ssh -i "$HOME/.ssh/luera_vps" -o BatchMode=yes root@76.13.4.164)

# Uzak betiklerin ortak başı. Uzak betik `bash -s` ile STDIN'den okunur:
# stdin okuyan her komut (docker exec -i, curl -d @-) betiğin kalanını yutar.
# Bu yüzden -i yalnız kendi here-doc'uyla, öteki komutlar </dev/null ile.
# Değişken değil fonksiyon: macOS'un bash 3.2'si `$( … )` içindeki here-doc'u
# kesme işaretinde yanlış ayrıştırıyor.
ortak() {
    cat <<'UZAK'
set -euo pipefail
DB=supabase-db-t6yi63jbebvj6c7oo7yjofnt
URL=https://supabase.timeflow.lueratech.com/functions/v1/abonelik-eposta
LOG=/var/log/abonelik-eposta.log
q()  { docker exec -u postgres "$DB" psql -U supabase_admin -d postgres -X -qtA -v ON_ERROR_STOP=1 -c "$1" </dev/null; }
tb() { docker exec -u postgres "$DB" psql -U supabase_admin -d postgres -X -q  -v ON_ERROR_STOP=1 -c "$1" </dev/null; }
maske() { sed -E 's/x-cron-secret: [A-Za-z0-9]+/x-cron-secret: ***/'; }
sir() { q "select value from app_secrets where key = 'CRON_TRIGGER_SECRET'"; }
# Fonksiyonu zamanlayıcı kimliğiyle çağırır; sır argv'ye değil başlık dosyasına.
cagir() {
    local s
    s="$(sir)"
    [ "${#s}" -ge 16 ] || { echo "HATA: CRON_TRIGGER_SECRET yok" >&2; exit 1; }
    curl -sS -m 120 -X POST -H @<(printf 'x-cron-secret: %s\n' "$s") \
        -H 'Content-Type: application/json' -d "$1" "$URL" </dev/null
    echo
}
UZAK
}

# Uzak betik gövdesi STDIN'den (here-doc), argümanlar uzak betiğe.
uzak() {
    { ortak; cat; } | "${SSH[@]}" bash -s -- "$@"
}

# JSON'u okunur basar (Node bu Mac'te var); JSON olmayan satır olduğu gibi.
guzel() {
    if command -v node >/dev/null 2>&1; then
        node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.split("\n").filter(Boolean)){try{console.log(JSON.stringify(JSON.parse(l),null,2))}catch{console.log(l)}}})'
    else
        cat
    fi
}

case "$ISLEM" in
durum)
    uzak <<'UZAK'
echo "── Anahtarlar (yalnız ABONELIK_EPOSTA ve ENTITLEMENT_ENFORCE değeri basılır)"
tb "select key,
           case when key in ('ABONELIK_EPOSTA', 'ENTITLEMENT_ENFORCE') then value
                else length(value)::text || ' karakter' end as deger
    from app_secrets
    where key in ('ABONELIK_EPOSTA', 'ENTITLEMENT_ENFORCE', 'RESEND_API_KEY', 'CRON_TRIGGER_SECRET')
    order by key"
echo "── Dodo kipi"
q "select case when value like '%test%' then 'TEST' else 'CANLI' end from app_secrets where key = 'DODO_API_BASE'" || true
echo "── Crontab satırı"
crontab -l 2>/dev/null | grep 'functions/v1/abonelik-eposta' | maske || echo "(satır yok)"
echo "── Defter · son 30 gün"
tb "select tur, durum, count(*) as adet from abonelik_eposta
    where created_at > now() - interval '30 days' group by 1, 2 order by 1, 2" \
    || echo "(defter yok — göç 125 uygulanmadı mı?)"
echo "── Son 3 tarama"
tail -n 3 "$LOG" 2>/dev/null || echo "(günlük yok)"
UZAK
    ;;

anahtar)
    DOSYA="$HOME/.luera-resend.env"
    [ -r "$DOSYA" ] || { echo "HATA: $DOSYA okunamadı" >&2; exit 1; }
    KEY="$(sed -n 's/^RESEND_API_KEY=//p' "$DOSYA" | tail -n 1)"
    KEY="${KEY%\"}"; KEY="${KEY#\"}"; KEY="${KEY%\'}"; KEY="${KEY#\'}"
    [[ "$KEY" =~ ^re_[A-Za-z0-9_]+$ ]] || { echo "HATA: $DOSYA içinde RESEND_API_KEY=re_… satırı yok" >&2; exit 1; }
    # printf kabuğun kendi komutu: değer süreç listesine de düşmez; SQL
    # psql'in girdisinden gider, ekrana yalnız uzunluk döner.
    printf "insert into app_secrets (key, value) values ('RESEND_API_KEY', '%s') on conflict (key) do update set value = excluded.value;\nselect 'RESEND_API_KEY yazıldı: ' || length(value) || ' karakter' from app_secrets where key = 'RESEND_API_KEY';\n" "$KEY" \
        | "${SSH[@]}" "docker exec -i -u postgres $DB psql -U supabase_admin -d postgres -X -qtA -v ON_ERROR_STOP=1 -f -"
    unset KEY
    ;;

cron)
    uzak <<'UZAK'
s="$(sir)"
[ "${#s}" -ge 16 ] || { echo "HATA: CRON_TRIGGER_SECRET yok" >&2; exit 1; }
# Crontab'da % yeni satır demek: tarih yüzdesiz yazılır (date -Iseconds).
# Başlık "x-cron-secret: <sır>" biçiminde — scripts/rotate-cron-secret.sh bu
# satırı da remind'inkiyle birlikte kendiliğinden döndürür.
KOMUT="{ date -u -Iseconds | tr '\n' ' '; curl -sS -m 60 -X POST -H 'x-cron-secret: ${s}' ${URL}; echo; } >> ${LOG} 2>&1"
unset s

# Satırın doğru GÖRÜNMESİ çalışacağı anlamına gelmiyor (demo tohumu dersi):
# önce cron'un çıplak ortamında bir kez koştur. Anahtar kapalıysa KURU.
echo "▸ Cron ortamında bir kez deneniyor (anahtar kapalıysa kuru — e-posta gitmez)…"
env -i PATH=/usr/bin:/bin SHELL=/bin/sh /bin/sh -c "$KOMUT" </dev/null
SON="$(grep -v '^[[:space:]]*$' "$LOG" | tail -n 1)"
echo "  $SON"
case "$SON" in
    *'"mod"'*) ;;
    *) echo "HATA: deneme beklenen cevabı vermedi; crontab DEĞİŞMEDİ" >&2; exit 1 ;;
esac

# Mevcut satırlar (remind, yedek, demo tohumu…) ÖNCE okunur, sonra yazılır:
# aynı borudan okuyup yazmak bir gün remind satırını silebilirdi.
MEVCUT="$(crontab -l 2>/dev/null || true)"
printf '%s\n' "$MEVCUT" > "/root/crontab.yedek.$(date +%Y%m%d_%H%M)"
ONCE="$(printf '%s\n' "$MEVCUT" | grep -v '^[[:space:]]*$' | grep -vc 'functions/v1/abonelik-eposta' || true)"
{
    [ -z "$MEVCUT" ] || printf '%s\n' "$MEVCUT" | grep -v 'functions/v1/abonelik-eposta' || true
    echo "*/15 * * * * $KOMUT"
} | crontab -
unset KOMUT MEVCUT
SONRA="$(crontab -l | grep -v '^[[:space:]]*$' | grep -vc 'functions/v1/abonelik-eposta' || true)"
[ "$ONCE" = "$SONRA" ] || echo "UYARI: öteki satır sayısı değişti ($ONCE → $SONRA); /root/crontab.yedek.* dosyasına bak" >&2
echo "▸ Kuruldu (öteki $SONRA satıra dokunulmadı):"
crontab -l | grep 'functions/v1/abonelik-eposta' | maske
UZAK
    ;;

kuru)
    uzak <<'UZAK' | guzel
cagir '{"ayrinti":true}'
UZAK
    ;;

dene)
    [ -n "$ARG1" ] && [ -n "$ARG2" ] || kullanim
    [[ "$ARG1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "HATA: e-posta biçimi geçersiz: $ARG1" >&2; exit 1; }
    [[ "$ARG2" =~ ^(hosgeldin|uc_gun|bitti|son|odeme)$ ]] || { echo "HATA: tür hosgeldin | uc_gun | bitti | son | odeme olmalı" >&2; exit 1; }
    uzak "$ARG1" "$ARG2" <<'UZAK' | guzel
EPOSTA="$1"; TUR="$2"
# Adres psql değişkeniyle gider (:'email' kaçırır); SQL kendi here-doc'undan.
SATIR="$(docker exec -i -u postgres "$DB" psql -U supabase_admin -d postgres -X -qtA -v ON_ERROR_STOP=1 -v email="$EPOSTA" -f - <<'SQL'
select o.id || '|' || count(*) over ()
from organizations o join auth.users u on u.id = o.owner_id
where lower(u.email) = lower(:'email')
order by o.created_at
limit 1;
SQL
)"
[ -n "$SATIR" ] || { echo "HATA: bu adresin SAHİBİ olduğu işletme yok" >&2; exit 1; }
ORG="${SATIR%%|*}"; ADET="${SATIR##*|}"
[ "$ADET" = "1" ] || echo "Not: bu adresin $ADET işletmesi var; en eskisi kullanılıyor."
echo "▸ $TUR deneme e-postası gönderiliyor (işletme ${ORG:0:8}…)"
cagir "{\"dene\":{\"org\":\"$ORG\",\"tur\":\"$TUR\"}}"
UZAK
    ;;

ac)
    uzak "$ARG1" <<'UZAK'
case "$(q "select value from app_secrets where key = 'DODO_API_BASE'")" in
    *test*)
        if [ "${1:-}" != "zorla" ]; then
            echo "DURDU: Dodo hâlâ TEST kipinde. E-postadaki ödeme sayfası gerçek kartı almaz;" >&2
            echo "       anahtar Dodo Live ile birlikte açılır (devir 13 §4 madde 8)." >&2
            echo "       Yine de açmak için: ops/abonelik/eposta.sh ac zorla" >&2
            exit 1
        fi ;;
esac
q "insert into app_secrets (key, value) values ('ABONELIK_EPOSTA', 'true')
   on conflict (key) do update set value = excluded.value" >/dev/null
echo "ABONELIK_EPOSTA = $(q "select value from app_secrets where key = 'ABONELIK_EPOSTA'") — en geç 15 dk içinde gerçek gönderim başlar."
UZAK
    ;;

kapa)
    uzak <<'UZAK'
q "insert into app_secrets (key, value) values ('ABONELIK_EPOSTA', 'false')
   on conflict (key) do update set value = excluded.value" >/dev/null
echo "ABONELIK_EPOSTA = $(q "select value from app_secrets where key = 'ABONELIK_EPOSTA'") — taramalar KURU koşar, e-posta gitmez."
UZAK
    ;;

*)
    kullanim
    ;;
esac
