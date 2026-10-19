# Giriş servisinde Apple + Google'ı açar (devir 11 · §D). SUNUCUDA çalışır.
#
# Kullanım (Mac'te, ~ içinde) — Google'ın gizli anahtarı yerel dosyadan okunur,
# akışın İLK SATIRI olarak gider; komut satırına, ekrana ve geçmişe düşmez:
#
#   { printf 'GOOGLE_SECRET=$(echo %s | base64 -d)\n' "$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.luera-google/web.json")))["web"]["client_secret"])' | base64)"; cat ~/Projects/luera-timeflow/ops/giris/giris-ayari-uygula.sh; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'bash -s'
#
# Yaptığı: (1) auth servisi .env'i okuyor mu — okumuyorsa DURUR, (2) .env yedeği,
# (3) ayarları yazar (eski satırlar silinir), (4) YALNIZ auth kabını yeniden
# oluşturur (Coolify Restart YOK), (5) sağlık + açılan sağlayıcıları gösterir.
# Sır basılmaz.
set -euo pipefail

D=/data/coolify/services/t6yi63jbebvj6c7oo7yjofnt
C=supabase-auth-t6yi63jbebvj6c7oo7yjofnt
cd "$D"

if [ -z "${GOOGLE_SECRET:-}" ]; then
    echo "HATA: Google gizli anahtarı gelmedi — hiçbir şey değişmedi."; exit 1
fi

# 1) auth servisi .env'i okuyor mu? (compose'ta Apple/Google satırı yok; .env yeterli olmalı)
if ! awk '/^  supabase-auth:/{f=1;next} f&&/^  [a-z]/{f=0} f' docker-compose.yml | grep -q -- '- .env'; then
    echo "HATA: supabase-auth .env dosyasını okumuyor (env_file yok). Compose'a satır eklemek gerekir — DURDUM, hiçbir şey değişmedi."; exit 1
fi
echo "1/5 · auth servisi .env'i okuyor"

# 2) yedek
Y=".env.yedek-$(date +%Y%m%d-%H%M%S)-giris"
cp -p .env "$Y"
echo "2/5 · yedek: $D/$Y"

# 3) ayarlar
KEYS='GOTRUE_EXTERNAL_APPLE_ENABLED|GOTRUE_EXTERNAL_APPLE_CLIENT_ID|GOTRUE_EXTERNAL_GOOGLE_ENABLED|GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID|GOTRUE_EXTERNAL_GOOGLE_SECRET|GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI|GOTRUE_EXTERNAL_GOOGLE_SKIP_NONCE_CHECK|ADDITIONAL_REDIRECT_URLS'
grep -v -E "^(${KEYS})=" .env > .env.yeni || true
cat >> .env.yeni <<'EOF'
GOTRUE_EXTERNAL_APPLE_ENABLED=true
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=ai.luera.timeflow.web,ai.luera.timeflow
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=477665756267-956h1cq5dn5kbghh52p1lmmgpeqd19vc.apps.googleusercontent.com,477665756267-s0ffn786degg21i01uidr3pnoth7j5e7.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.timeflow.lueratech.com/auth/v1/callback
GOTRUE_EXTERNAL_GOOGLE_SKIP_NONCE_CHECK=true
ADDITIONAL_REDIRECT_URLS=https://timeflow.lueratech.com/**,http://localhost:5173/**
EOF
printf 'GOTRUE_EXTERNAL_GOOGLE_SECRET=%s\n' "$GOOGLE_SECRET" >> .env.yeni
chmod --reference=.env .env.yeni
mv .env.yeni .env
echo "3/5 · ayarlar yazıldı"

# 4) yalnız auth kabı
P=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$C")
F=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$C")
test -n "$P"; test -f "$F"
docker compose -p "$P" -f "$F" up -d --no-deps --pull never supabase-auth
echo "4/5 · auth kabı yeniden oluşturuldu"

# 5) sağlık + sağlayıcılar
s=unknown
for _ in $(seq 1 30); do
    s=$(docker inspect -f '{{.State.Health.Status}}' "$C" 2>/dev/null || echo yok)
    [ "$s" = healthy ] && break
    sleep 2
done
echo "5/5 · sağlık: $s"
docker exec "$C" wget -qO- http://127.0.0.1:9999/settings | tr ',{' '\n\n' | grep -E '"(apple|google|email)":' || true
docker exec "$C" env | grep -E '^GOTRUE_(EXTERNAL_(APPLE|GOOGLE)_(ENABLED|CLIENT_ID|REDIRECT_URI|SKIP_NONCE_CHECK)|URI_ALLOW_LIST)=' | sort
echo "GOTRUE_EXTERNAL_GOOGLE_SECRET dolu mu: $(docker exec "$C" sh -c 'test -n "$GOTRUE_EXTERNAL_GOOGLE_SECRET" && echo evet || echo HAYIR')"
