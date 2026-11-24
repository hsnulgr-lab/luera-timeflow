#!/usr/bin/env bash
# ── Fonksiyon yüklemesinden ÖNCE emniyet kemeri (denetim 2026-11-24 · B7) ─────
#
# deploy-functions.sh çalıştığı klasörün `_shared`'ını sunucuya `--delete` ile
# basıyor. Yanlış daldan ya da geride kalmış koddan yükleme WhatsApp'ı bozar
# (2026-11-10 dersi); kaydedilmemiş kod yüklenirse canlıda ne olduğu geçmişte
# görünmez (2026-11-24'te gateway böyle yüklendi).
#
# Kurallar:
#   1. Dal `main` olmalı.
#   2. supabase/functions altında kaydedilmemiş değişiklik olmamalı.
#   3. Kod GitHub'daki main'in GERİSİNDE olmamalı (önde olması serbest —
#      bu projede yükleme push'tan önce yapılabiliyor; yalnız uyarılır).
#
# ZORLA=1 ile kurallar uyarıya döner (bilerek, istisnai durumda).
# Bu dosya `source` edilir; tek başına da çalıştırılabilir (testler böyle).
#
# macOS'taki bash 3.2 ile uyumlu: mapfile / ilişkisel dizi yok.

deploy_guard() {
    local fail=0
    local msg

    _guard_fail() {
        if [ "${ZORLA:-}" = "1" ]; then
            echo "  ! (ZORLA) $1" >&2
        else
            echo "  ✗ $1" >&2
            fail=1
        fi
    }

    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "  ✗ Burası bir git deposu değil." >&2
        return 1
    fi

    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ "$branch" != "main" ]; then
        _guard_fail "Dal '$branch' — yükleme yalnız main'den yapılır. Önce: git switch main"
    fi

    local dirty
    dirty=$(git status --porcelain -- supabase/functions 2>/dev/null)
    if [ -n "$dirty" ]; then
        msg="supabase/functions altında kaydedilmemiş değişiklik var — önce commit edin:"
        _guard_fail "$msg"
        echo "$dirty" | sed 's/^/      /' >&2
    fi

    # GitHub'la karşılaştırma. İnternet yoksa engellemez, yalnız uyarır.
    if git remote get-url origin >/dev/null 2>&1; then
        if git fetch -q origin main 2>/dev/null; then
            if git rev-parse --verify -q origin/main >/dev/null; then
                if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
                    _guard_fail "Kod GitHub'daki main'in gerisinde ya da ondan ayrılmış — önce: git pull --rebase"
                else
                    local ahead
                    ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
                    if [ "$ahead" -gt 0 ]; then
                        echo "  · Uyarı: $ahead commit henüz GitHub'a gönderilmedi (yükleme yine yapılır)." >&2
                    fi
                fi
            fi
        else
            echo "  · Uyarı: GitHub'a ulaşılamadı; geride kalma denetlenemedi." >&2
        fi
    fi

    if [ "$fail" -ne 0 ]; then
        echo "" >&2
        echo "Yükleme DURDURULDU. Bilerek aşmak için: ZORLA=1 scripts/deploy-functions.sh …" >&2
        return 1
    fi
    return 0
}

# Kaynak gösterilen sürüm: kısa commit + kirli işareti. Sunucuya yazılır.
deploy_version() {
    local sha
    sha=$(git rev-parse --short HEAD 2>/dev/null || echo "bilinmiyor")
    if [ -n "$(git status --porcelain -- supabase/functions 2>/dev/null)" ]; then
        sha="$sha+kaydedilmemiş"
    fi
    echo "$sha $(git rev-parse --abbrev-ref HEAD 2>/dev/null) $(date -u +%Y-%m-%dT%H:%MZ)"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    deploy_guard
fi
