// Müdür · Profil → Personel (099) — SAF katman.
//
// React, react-native ve Supabase import ETMEZ: Node testleri doğrudan okur.

export interface TeamMember {
    id: string;
    name: string;
    role: string | null;
    hasPin: boolean;
    lastLoginAt: string | null;
    /** Personelin kendi şifresini belirlediği an — müdürün "doğru kişi mi" kontrolü. */
    pinSetAt: string | null;
    lockedUntil: string | null;
}

export interface TeamCode {
    code: string;
    expiresAt: number;
}

/** "482 913" — altı hane üçerli: sesli okunurken de yazılırken de karışmıyor. */
export function spacedCode(code: string): string {
    const digits = code.replace(/\D/g, '');
    return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Kalan süre — "14:32". Negatif yok. */
export function countdown(secondsLeft: number): string {
    const s = Math.max(0, Math.floor(secondsLeft));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "bugün 23:31" · "dün 09:05" · "12 Eyl 18:40". Telefonun saatiyle. */
export function when(iso: string, nowMs: number): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const now = new Date(nowMs);
    const yesterday = new Date(nowMs - 24 * 60 * 60_000);
    if (day(at) === day(now)) return `bugün ${clock}`;
    if (day(at) === day(yesterday)) return `dün ${clock}`;
    return `${at.getDate()} ${TR_MONTHS[at.getMonth()]} ${clock}`;
}

/**
 * Personel satırının alt yazısı — müdürün bilmesi gereken TEK şey:
 * bu kişi girebilir mi, girdiyse ne zaman.
 */
export function memberLine(member: TeamMember, nowMs: number): { text: string; tone: 'quiet' | 'warn' | 'ok' } {
    if (member.lockedUntil && Date.parse(member.lockedUntil) > nowMs) {
        return { text: 'Çok yanlış deneme · kilitli', tone: 'warn' };
    }
    if (!member.hasPin) return { text: 'Henüz girmedi · ilk girişte şifresini belirleyecek', tone: 'quiet' };
    if (member.pinSetAt && (!member.lastLoginAt || Date.parse(member.pinSetAt) >= Date.parse(member.lastLoginAt) - 60_000)) {
        return { text: `Şifresini belirledi · ${when(member.pinSetAt, nowMs)}`, tone: 'ok' };
    }
    if (member.lastLoginAt) return { text: `Son giriş · ${when(member.lastLoginAt, nowMs)}`, tone: 'quiet' };
    return { text: 'Şifresi var · telefondan henüz girmedi', tone: 'quiet' };
}

/** Grup başlığının altındaki özet — "8 kişi · 3'ü henüz girmedi". */
export function teamSummary(members: readonly TeamMember[]): string {
    const waiting = members.filter((m) => !m.hasPin).length;
    const head = `${members.length} kişi`;
    return waiting > 0 ? `${head} · ${waiting} kişi henüz girmedi` : head;
}
