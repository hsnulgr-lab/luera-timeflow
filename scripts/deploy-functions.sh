#!/usr/bin/env bash
set -euo pipefail

# ── Self-hosted Supabase'e edge function deploy ──────────────────────────────
#
# `supabase functions deploy` KULLANILMAZ: o komut Supabase Cloud içindir ve bir
# project-ref ister. Bizim kurulum kendi VPS'imizde; edge function'lar
# edge-runtime konteynerine bağlı bir klasörden okunur. Deploy = dosyaları o
# klasöre kopyalamak + konteyneri yeniden başlatmak.
#
# Kullanım:
#   scripts/deploy-functions.sh remind public-booking
#   scripts/deploy-functions.sh            # _shared değişince: hepsi
#
# Ortam değişkenleri (varsayılanları aşağıda):
#   DEPLOY_HOST   sunucu (root@ip)
#   EDGE_SERVICE  edge-runtime konteynerinin adı ya da adının bir parçası
#
# ŞİFRE İSTEMEMESİ İÇİN: bir kez `ssh-copy-id root@<ip>` çalıştırıp anahtar
# kurun. Şifreyle giriş hem her seferinde elle yazmayı gerektirir hem de
# betiğin otomatikleşmesini imkânsız kılar.

HOST="${DEPLOY_HOST:-root@76.13.4.164}"
SERVICE="${EDGE_SERVICE:-supabase-t6yi63jbebvj6c7oo7yjofnt}"

cd "$(dirname "$0")/.."

FUNCTIONS=("$@")
if [ ${#FUNCTIONS[@]} -eq 0 ]; then
    # Argüman yoksa tüm fonksiyonlar (klasör adları)
    while IFS= read -r d; do FUNCTIONS+=("$(basename "$d")"); done \
        < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_*')
fi

echo "▸ Sunucu:     $HOST"
echo "▸ Servis:     $SERVICE"
echo "▸ Fonksiyon:  ${FUNCTIONS[*]}"
echo

# 1) Konteyneri ve fonksiyon klasörünün HOST üzerindeki yolunu bul.
#    Yol kuruluma göre değişir (Coolify volume'ü, bind mount, vb.), o yüzden
#    tahmin edilmez — konteynerin kendi mount bilgisinden okunur.
echo "▸ Konteyner ve mount bulunuyor…"
read -r CONTAINER HOSTPATH < <(ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
name=$(docker ps --format '{{.Names}}' | grep -iE 'edge|function' | head -1 || true)
if [ -z "$name" ]; then
    echo "HATA: edge-runtime konteyneri bulunamadı. Adaylar:" >&2
    docker ps --format '  {{.Names}}' >&2
    exit 1
fi
path=$(docker inspect "$name" \
    --format '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}')
if [ -z "$path" ]; then
    echo "HATA: $name içinde /home/deno/functions mount'u yok. Mevcut mount'lar:" >&2
    docker inspect "$name" --format '{{range .Mounts}}  {{.Destination}} <- {{.Source}}{{"\n"}}{{end}}' >&2
    exit 1
fi
echo "$name $path"
REMOTE
)

echo "  konteyner: $CONTAINER"
echo "  klasör:    $HOSTPATH"
echo

# 2) _shared her zaman gider — fonksiyonların çoğu ondan import ediyor.
echo "▸ _shared kopyalanıyor…"
rsync -az --delete supabase/functions/_shared/ "$HOST:$HOSTPATH/_shared/"

for fn in "${FUNCTIONS[@]}"; do
    if [ ! -d "supabase/functions/$fn" ]; then
        echo "  ! $fn diye bir fonksiyon yok, atlanıyor" >&2
        continue
    fi
    echo "▸ $fn kopyalanıyor…"
    rsync -az --delete "supabase/functions/$fn/" "$HOST:$HOSTPATH/$fn/"
done

# 3) Yeniden başlat. edge-runtime dosyaları başlangıçta okur; restart olmadan
#    eski sürüm çalışmaya devam eder ve "deploy ettim ama değişmedi" olur.
echo
echo "▸ $CONTAINER yeniden başlatılıyor…"
ssh "$HOST" "docker restart $CONTAINER" >/dev/null
sleep 3
ssh "$HOST" "docker ps --filter name=$CONTAINER --format '  {{.Names}}  {{.Status}}'"

echo
echo "✓ Bitti. Son loglar:"
ssh "$HOST" "docker logs --tail 20 $CONTAINER"
