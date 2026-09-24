#!/usr/bin/env bash
#
# SSH ŞİFRE GİRİŞİNİ KAPAT — VPS'in üstünde çalışır.
#
# 2026-09-24: root şifresinin ifşa olduğu biliniyordu ve alınan önlem
# "anahtarla bağlan" olmuştu. Bu bir önlem DEĞİL: sunucuda
# `PasswordAuthentication yes` açık kaldığı sürece ifşa şifre çalışmaya devam
# eder. `sshd -T` ile doğrulandı — açıktı. `lastb` aynı gün bot taraması
# gösteriyordu (203.150.180.188 · pi/ubuntu/baikal).
#
# ── Kendini kilitlememek ────────────────────────────────────────────────────
# Şifre girişini kapatmak, anahtar girişi çalışmıyorsa sunucuyu ERİŞİLMEZ
# yapar. Bu yüzden betik önce root'un yetkili anahtarı olduğunu doğruluyor ve
# olmadan hiçbir şeye dokunmuyor. `restart` değil `reload` kullanılıyor: açık
# oturumlar düşmüyor, yanlış giderse aynı oturumdan geri alınabiliyor.
#
# Son çare olarak Hostinger'ın web konsolu var (girişlerde 169.254.0.1 olarak
# görünen yol); o sshd'den geçmiyor, yani SSH tamamen bozulsa da erişim kalır.
set -euo pipefail

CONF="/etc/ssh/sshd_config.d/99-luera-hardening.conf"

log() { echo "[$(date '+%F %T')] $*"; }

# ── 1 · Anahtar gerçekten duruyor mu ────────────────────────────────────────
KEYS="/root/.ssh/authorized_keys"
if [ ! -s "$KEYS" ]; then
    echo "DURDURULDU: $KEYS yok ya da boş." >&2
    echo "Şifre girişi kapatılırsa sunucuya SSH ile hiç girilemez." >&2
    exit 1
fi
COUNT="$(grep -cE '^(ssh-|ecdsa-|sk-)' "$KEYS" || true)"
if [ "$COUNT" -lt 1 ]; then
    echo "DURDURULDU: $KEYS içinde geçerli bir açık anahtar satırı yok." >&2
    exit 1
fi
log "root için $COUNT yetkili anahtar bulundu"

# ── 2 · Mevcut etkin ayar ───────────────────────────────────────────────────
log "şu anki etkin ayar:"
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication)' | sed 's/^/    /'

# ── 3 · Sıkılaştırma ────────────────────────────────────────────────────────
# Dosya adı `99-` ile başlıyor: `sshd_config.d` sayı sırasıyla okunuyor ve
# OpenSSH'ta İLK değer kazanıyor... ama `Include` satırı dosyanın başındaysa
# son eklenen dosya en geç okunur ve öncekiler kazanır. Bu yüzden ÇAKIŞAN
# eski satırlar ayrıca etkisizleştiriliyor (aşağıda) — yalnız yeni dosya
# koymak yetmez.
cat > "$CONF" <<'EOF'
# Luera TimeFlow · SSH sıkılaştırma (2026-09-24)
# Root şifresi ifşa olduğu için şifreyle giriş tamamen kapalı.
# Root YALNIZ anahtarla girebilir.
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
EOF
chmod 644 "$CONF"
log "yazıldı: $CONF"

# Çakışan ESKİ satırları yorum satırına çevir — yoksa sayıca önde olan dosya
# kazanmaya devam eder.
for f in /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; do
    [ "$f" = "$CONF" ] && continue
    [ -f "$f" ] || continue
    if grep -qEi '^ *(PasswordAuthentication|PermitRootLogin) ' "$f"; then
        cp -n "$f" "${f}.yedek.2026-09-24" 2>/dev/null || true
        sed -i -E 's/^( *)(PasswordAuthentication|PermitRootLogin) /\1# [luera 2026-09-24 devre dışı] \2 /I' "$f"
        log "eski satırlar etkisizleştirildi: $f (yedek: ${f}.yedek.2026-09-24)"
    fi
done

# ── 4 · Doğrula, sonra uygula ───────────────────────────────────────────────
if ! sshd -t; then
    echo "HATA: sshd yapılandırması geçersiz — RELOAD YAPILMADI." >&2
    echo "      $CONF dosyasını silip yedekleri geri koyun." >&2
    exit 1
fi
log "yapılandırma geçerli"

systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || service ssh reload

log "yeni etkin ayar:"
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication)' | sed 's/^/    /'

echo
echo "⚠️  BU OTURUMU KAPATMA. Yeni bir terminalde şunu dene:"
echo "    ssh -i ~/.ssh/luera_vps root@76.13.4.164 'echo giriş tamam'"
echo
echo "Çalışıyorsa bitti. Çalışmıyorsa BU oturumdan geri al:"
echo "    rm $CONF && systemctl reload ssh"
