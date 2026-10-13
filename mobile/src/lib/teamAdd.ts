/**
 * PERSONEL EKLE — saf karar katmanı (2026-10-13).
 *
 * Personel sayfası "Personel eklemek bilgisayardan: Luera → Personel"
 * diyordu. Tek kişilikten ekibe geçen sahibin bilgisayarı yok; kullanıcı
 * "yap" dedi. Telefon masaüstünün "Personel ekle"sinin yazdığı satırı
 * yazıyor (`useStaff.addStaff`): ad, meslek, rol, renk; çalışma saati
 * boş (işletmenin saatleri), şifre boş (kişi Telefon bağla ile kendisi
 * belirliyor).
 *
 * Rol ve renk kuralı `start_team`in (113/115) AYNISI — tek kişilikten ekibe
 * geçerken eklenen ilk çalışan da bu kuralla açılıyor; iki kapıdan gelen
 * satır aynı görünsün.
 *
 * Saf — React ve Expo taşımıyor; Node testleri doğrudan okuyor.
 */

export type StaffRole = 'assistant' | 'doctor' | 'cashier' | 'staff';

/**
 * Rol MESLEKTEN — 058'in ve `start_team`in kuralı. Diş kliniğinde "Diş
 * hekimi" yazılan kişi hekim olmalı: tedavi planının hekim atfı (061) rolü
 * soruyor.
 */
export function staffRoleOf(specialty: string | null | undefined): StaffRole {
    const text = (specialty ?? '').toLocaleLowerCase('tr-TR');
    const has = (parts: readonly string[]) => parts.some((part) => text.includes(part));
    if (has(['asistan', 'assistant', 'yardımcı', 'yardimci'])) return 'assistant';
    if (has(['hekim', 'doktor', 'doctor', 'dentist', 'diş', 'dis'])) return 'doctor';
    if (has(['kasa', 'kasiyer', 'cashier', 'vezne', 'tahsilat'])) return 'cashier';
    return 'staff';
}

/** Masaüstünün paleti — `start_team`deki sırayla. */
export const STAFF_PALETTE = [
    '#FF5A1F', '#E8973C', '#C95A3C', '#CB5E84',
    '#8E70B2', '#3F9D9A', '#5E9C6C', '#5B7CC2',
] as const;

/**
 * Renk: salonda KULLANILMAYAN ilk palet rengi (pasif satırlar dahil —
 * sunucu da onları sayıyor). Ekip takviminde iki sütun aynı renkte olursa
 * kimin randevusu olduğu okunmaz. Palet dolarsa sonuncusu.
 */
export function staffColorOf(used: readonly (string | null | undefined)[]): string {
    const taken = new Set(used.filter((color): color is string => typeof color === 'string'));
    return STAFF_PALETTE.find((color) => !taken.has(color)) ?? STAFF_PALETTE[STAFF_PALETTE.length - 1];
}

export type AddFailure = 'offline' | 'not_allowed' | 'failed';

export const staffAdd = {
    title: 'Personel ekle',
    formHead: 'Yeni çalışan',
    action: 'Ekle',
    busy: 'Ekleniyor…',
    foot: 'Çalışan kendi telefonundan girecekse, eklendikten sonra Personel sayfasındaki Telefon bağla ile '
        + 'tek seferlik kod üretin; kişi listeden kendini seçer ve şifresini kendisi belirler.',
} as const;

/** Eklenemediğinde düğmenin üstündeki cümle — kimsenin eklenmediğini söylüyor. */
export function addProblem(reason: AddFailure): string {
    switch (reason) {
        case 'offline': return 'Bağlantı yok. Kimse eklenmedi; bağlanınca tekrar deneyin.';
        case 'not_allowed': return 'Bu işletmeye personel ekleme yetkiniz yok. Kimse eklenmedi.';
        default: return 'Eklenemedi. Kimse eklenmedi; birazdan tekrar deneyin.';
    }
}
