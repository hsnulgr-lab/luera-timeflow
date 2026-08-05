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
#   DEPLOY_KEY    SSH özel anahtarı (bu makinede ~/.ssh/luera_vps)
#
# Anahtar varsayılan adda olmadığı için (~/.ssh/id_rsa değil) açıkça verilir;
# `ssh-copy-id` da bu yüzden "No identities found" diyordu.
#
# NOT: sunucuda İKİ Supabase yığını var (TimeFlow + LeadFlow). Konteyner adının
# sonundaki kimlik TimeFlow'unkidir — yanlış yığına deploy etmemek için servis
# adı tam yazılır, desen aramasına bırakılmaz.

HOST="${DEPLOY_HOST:-root@76.13.4.164}"
SERVICE="${EDGE_SERVICE:-supabase-edge-functions-t6yi63jbebvj6c7oo7yjofnt}"
# Bu VPS için anahtar varsayılan adda değil (id_rsa/id_ed25519), açıkça verilir.
SSH_KEY="${DEPLOY_KEY:-$HOME/.ssh/luera_vps}"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes)

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

# Konteyner TAM ADIYLA aranır. Desenle arayıp ilkini almak tehlikeli: bu VPS'te
# iki Supabase yığını var (TimeFlow + LeadFlow) ve ikisinin de edge-functions
# konteyneri "edge" desenine uyuyor — yanlış yığına deploy etmek işten değil.
LOOKUP_SCRIPT='
set -euo pipefail
want="$1"
name=$(docker ps --format "{{.Names}}" | grep -Fx "$want" || true)
if [ -z "$name" ]; then
    echo "HATA: $want adli calisan konteyner yok. Adaylar:" >&2
    docker ps --format "  {{.Names}}" | grep -iE "edge|function" >&2
    exit 1
fi
path=$(docker inspect "$name" --format "{{range .Mounts}}{{if eq .Destination \"/home/deno/functions\"}}{{.Source}}{{end}}{{end}}")
if [ -z "$path" ]; then
    echo "HATA: $name icinde /home/deno/functions mount edilmemis." >&2
    exit 1
fi
echo "$name $path"
'
LOOKUP=$(ssh "${SSH_OPTS[@]}" "$HOST" bash -s -- "$SERVICE" <<< "$LOOKUP_SCRIPT")
CONTAINER="${LOOKUP%% *}"
HOSTPATH="${LOOKUP#* }"

echo "  konteyner: $CONTAINER"
echo "  klasör:    $HOSTPATH"
echo

# 2) _shared her zaman gider — fonksiyonların çoğu ondan import ediyor.
echo "▸ _shared kopyalanıyor…"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" supabase/functions/_shared/ "$HOST:$HOSTPATH/_shared/"

for fn in "${FUNCTIONS[@]}"; do
    if [ ! -d "supabase/functions/$fn" ]; then
        echo "  ! $fn diye bir fonksiyon yok, atlanıyor" >&2
        continue
    fi
    echo "▸ $fn kopyalanıyor…"
    rsync -az --delete -e "ssh ${SSH_OPTS[*]}" "supabase/functions/$fn/" "$HOST:$HOSTPATH/$fn/"
done

# 3) Yeniden başlat. edge-runtime dosyaları başlangıçta okur; restart olmadan
#    eski sürüm çalışmaya devam eder ve "deploy ettim ama değişmedi" olur.
echo
echo "▸ $CONTAINER yeniden başlatılıyor…"
ssh "${SSH_OPTS[@]}" "$HOST" "docker restart $CONTAINER" >/dev/null
sleep 3
ssh "${SSH_OPTS[@]}" "$HOST" "docker ps --filter name=$CONTAINER --format '  {{.Names}}  {{.Status}}'"

echo
echo "✓ Bitti. Son loglar:"
ssh "${SSH_OPTS[@]}" "$HOST" "docker logs --tail 20 $CONTAINER"
