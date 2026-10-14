/**
 * Personel 15 · sade adisyonun mürekkebi ve yazısı (iki kabukta, 2026-10-15).
 *
 * Kumandanın üst yarısı (plaka, sayaç, plan, Bekleme kur, BİTİR) ESKİ
 * hâlinde (kullanıcı kararı, 2026-10-15); bu dosya yalnız adisyon parçalarını
 * çiziyor.
 *
 * Tema jetonları DEĞİŞMİYOR: masaüstüyle eşleşme testi onları kilitliyor ve
 * öteki ekranlar kendi onaylı tasarımlarıyla duruyor. Koyulaşan `tx2`
 * (açıkta .52 → .66, koyuda .58 → .62) ve "renk işarette, yazı mürekkepte"
 * kuralı yalnız bu ekranlarda (kullanıcı kararı, 2026-10-15).
 *
 * Ayrı dosya, çünkü bileşen dosyası yalnız bileşen dışa aktarmalı (anında
 * yenileme kuralı).
 */

import { useTheme } from '../theme';

/** Maskenin açık kalma süresi — 6 sn (bugünkü kural, kullanıcı kararı). */
export const SADE_MS = 6000;

/**
 * Yazı tipi: telefonun KENDİ yazı tipi (SF), yalnız ağırlık.
 *
 * Tasarım Hanken Grotesk istiyordu; telefonda denendi ve kullanıcı eski
 * kumandanın yazısını "keskin ve güzel" buldu (2026-10-15). Kumandanın geri
 * kalanı da sistem yazısıyla çiziliyor — adisyon ayrı bir yazı tipiyle
 * ekranın içinde yabancı dururdu.
 */
export function sadeFont(weight: 500 | 600 | 700 | 800) {
    return { fontWeight: String(weight) as '500' | '600' | '700' | '800' };
}

export function useSadeInk() {
    const { c, dark, small, reduceMotion } = useTheme();
    return {
        c, dark, small, reduceMotion,
        tx2: dark ? 'rgba(243,237,227,0.62)' : 'rgba(14,14,14,0.66)',
        orT: dark ? '#FF7A45' : c.tx,
        amT: dark ? '#D9A43B' : c.tx,
        grT: dark ? '#5FBF64' : c.tx,
        rdT: dark ? '#E07272' : c.tx,
        orbg: dark ? 'rgba(255,90,31,0.13)' : 'rgba(255,90,31,0.10)',
        grbg: dark ? 'rgba(95,191,100,0.10)' : 'rgba(45,143,50,0.09)',
        ambg: dark ? 'rgba(217,164,59,0.10)' : 'rgba(184,122,0,0.10)',
        rdbg: dark ? 'rgba(224,114,114,0.10)' : 'rgba(201,64,64,0.08)',
        mask: dark ? 'rgba(243,237,227,0.28)' : 'rgba(14,14,14,0.24)',
    };
}
