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
#   scripts/deploy-functions.sh --kuru gateway   # denetle + sunucudaki sürümü göster, YÜKLEME
#
# Emniyet kemeri (scripts/deploy-guard.sh): yalnız main, supabase/functions
# temiz, GitHub'ın gerisinde değil. Bilerek aşmak: ZORLA=1 scripts/deploy-functions.sh …
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

KURU=0
FUNCTIONS=()
for a in "$@"; do
    if [ "$a" = "--kuru" ]; then KURU=1; else FUNCTIONS+=("$a"); fi
done

# 0) Emniyet kemeri — SSH'tan ÖNCE: yanlış koddan yüklemeye hiç başlanmasın.
# shellcheck source=deploy-guard.sh
. scripts/deploy-guard.sh
echo "▸ Denetim…"
deploy_guard || exit 1
VERSION=$(deploy_version)
echo "  ✓ yüklenecek: $VERSION"
echo

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

# Sunucuda şu an hangi sürüm var? (`_shared/.surum`, her yüklemede yazılır.)
REMOTE_VERSION=$(ssh "${SSH_OPTS[@]}" "$HOST" "cat '$HOSTPATH/_shared/.surum' 2>/dev/null" || true)
echo "  sunucuda:  ${REMOTE_VERSION:-bilinmiyor (bu korumadan önceki yükleme)}"
echo "  yeni:      $VERSION"
echo

if [ "$KURU" = "1" ]; then
    echo "✓ Kuru koşu: hiçbir şey yüklenmedi."
    exit 0
fi

# 2) _shared her zaman gider — fonksiyonların çoğu ondan import ediyor.
echo "▸ _shared kopyalanıyor…"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" supabase/functions/_shared/ "$HOST:$HOSTPATH/_shared/"
# Sürüm izi: bir sonraki yükleme "sunucuda ne var" diye buradan okur.
ssh "${SSH_OPTS[@]}" "$HOST" "printf '%s\n' '$VERSION' > '$HOSTPATH/_shared/.surum'"

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
