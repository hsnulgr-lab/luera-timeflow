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

/** "Şifresini belirledi" satırı bu kadar süre öne çıkar — bir vardiya (tasarım §M1). */
export const FRESH_PIN_HOURS = 12;

export function isFreshPin(member: TeamMember, nowMs: number): boolean {
    if (!member.hasPin || !member.pinSetAt) return false;
    const at = Date.parse(member.pinSetAt);
    return Number.isFinite(at) && nowMs - at < FRESH_PIN_HOURS * 60 * 60_000;
}

export function lockMinutesLeft(member: TeamMember, nowMs: number): number {
    const until = member.lockedUntil ? Date.parse(member.lockedUntil) : Number.NaN;
    return Number.isFinite(until) && until > nowMs ? Math.ceil((until - nowMs) / 60_000) : 0;
}

export type LineTone = 'quiet' | 'ok' | 'error';

/**
 * Personel satırının alt yazısı — müdürün bilmesi gereken TEK şey:
 * bu kişi girebilir mi, girdiyse ne zaman. Renkler tasarımdan:
 *   yeşil + nokta  · şifresini yeni belirledi (12 saat)
 *   kırmızı + nokta · kilitli (dakika hassasiyetinde)
 *   nötr            · diğerleri — "henüz girmedi" bir uyarı değil
 */
export function memberLine(member: TeamMember, nowMs: number): { text: string; tone: LineTone; dot: boolean } {
    const lock = lockMinutesLeft(member, nowMs);
    if (lock > 0) return { text: `Çok yanlış deneme · ${lock} dk kilitli`, tone: 'error', dot: true };
    if (!member.hasPin) return { text: 'Henüz girmedi · ilk girişte şifresini belirleyecek', tone: 'quiet', dot: false };
    if (isFreshPin(member, nowMs)) {
        return { text: `Şifresini belirledi · ${when(member.pinSetAt as string, nowMs)}`, tone: 'ok', dot: true };
    }
    if (member.lastLoginAt) return { text: `Son giriş · ${when(member.lastLoginAt, nowMs)}`, tone: 'quiet', dot: false };
    return { text: 'Şifresi var · telefondan henüz girmedi', tone: 'quiet', dot: false };
}

/** Yeni şifre belirleyen öne; geri kalanı alfabetik (Türkçe). */
export function sortTeam(members: readonly TeamMember[], nowMs: number): TeamMember[] {
    return [...members].sort((a, b) => {
        const fa = isFreshPin(a, nowMs) ? 0 : 1;
        const fb = isFreshPin(b, nowMs) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return a.name.localeCompare(b.name, 'tr');
    });
}

/**
 * Grup başlığının sağındaki TEK özet — iki bilgi taşıyan başlık sıfır bilgi
 * taşıyor. Öncelik: kilitli → henüz girmedi → hepsi girdi.
 */
export function teamHeadline(members: readonly TeamMember[], nowMs: number): string {
    const locked = members.filter((m) => lockMinutesLeft(m, nowMs) > 0).length;
    if (locked > 0) return `${locked} kişi kilitli`;
    const waiting = members.filter((m) => !m.hasPin).length;
    if (waiting > 0) return `${waiting} kişi henüz girmedi`;
    return members.length > 0 ? 'hepsi girdi' : '';
}

/**
 * Müdür Profil'deki "Personel" satırının alt yazısı (tasarım §M2) — tek bilgi.
 * Kod açıksa kodun KENDİSİ değil yalnız süresi yazılır.
 */
export function profileTeamLine(
    members: readonly TeamMember[] | null,
    codeSecondsLeft: number,
    nowMs: number,
): { text: string; accent: boolean } | null {
    if (codeSecondsLeft > 0) return { text: `Kod açık · ${countdown(codeSecondsLeft)}`, accent: true };
    if (!members) return null;
    const head = teamHeadline(members, nowMs);
    if (head === 'hepsi girdi') return { text: `${members.length} kişi · hepsi girdi`, accent: false };
    return head ? { text: head, accent: false } : null;
}
