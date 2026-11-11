/**
 * PERSONEL JETONUNUN SAHİBİ — hangi salon, hangi kişi (2026-11-12).
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Telefonda kişiye bağlı üç şey yalnız "o an elde hangi jeton varsa"
 * ona güveniyordu: günün çevrimdışı kopyası, bekleyen yazma kuyruğu ve tek
 * kişilik jetonun kendisi. Ortak telefonda personel değişince ya da müdür
 * başka salona geçince öncekinin listesi gösteriliyor, öncekinin işi yenisinin
 * kimliğiyle gönderiliyordu.
 *
 * Jeton zaten kimin olduğunu SÖYLÜYOR: sunucu (`_shared/staffToken.ts`)
 * `sub` = staff.id ve `org` = organization_id yazıyor. Burada yalnız OKUNUYOR
 * — imza doğrulanmıyor, doğrulamak sunucunun işi. Bu bir yetki kararı değil,
 * "bu kopya bu kişinin mi" sorusunun cevabı.
 *
 * Saf: React yok, react-native yok, depolama yok.
 */

export interface StaffIdentity {
    orgId: string;
    staffId: string;
}

/** base64url → metin. `atob` Hermes'te ve Node 16+'da var. */
function decodeSegment(segment: string): string | null {
    try {
        const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const binary = atob(padded);
        // UTF-8: kimlikler ASCII ama çözücü dar kalmasın.
        let out = '';
        for (let i = 0; i < binary.length; i++) out += `%${binary.charCodeAt(i).toString(16).padStart(2, '0')}`;
        return decodeURIComponent(out);
    } catch {
        return null;
    }
}

/**
 * Jetonun sahibi — ya da `null`, okunamıyorsa.
 *
 * Kapı DAR: üç parçalı değilse, gövde JSON değilse, `sub`/`org` dolu metin
 * değilse `null`. Okunamayan jeton "kimse" sayılıyor; çağıran onu hiçbir
 * kopyayla eşleştirmez.
 */
export function identityOf(token: string | null | undefined): StaffIdentity | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const text = decodeSegment(parts[1]);
    if (!text) return null;
    let claims: unknown;
    try {
        claims = JSON.parse(text);
    } catch {
        return null;
    }
    const body = claims as { sub?: unknown; org?: unknown } | null;
    if (!body || typeof body !== 'object') return null;
    if (typeof body.sub !== 'string' || !body.sub) return null;
    if (typeof body.org !== 'string' || !body.org) return null;
    return { orgId: body.org, staffId: body.sub };
}

/** Kimliğin tek metinlik hâli — önbellek ve kuyruk bunu taşıyor. */
export function ownerKey(identity: StaffIdentity | null): string | null {
    return identity ? `${identity.orgId}:${identity.staffId}` : null;
}

/**
 * Kuyruktaki iş BU kişinin mi?
 *
 * Sahibi yazılmamış iş (1.0.1'den kalan, alan yokken kuyruğa girmiş) eskisi
 * gibi gönderiliyor: güncellemeden önce kuyruğa giren işi atmak, kullanıcının
 * yaptığı bir işi sessizce silmek olurdu; o telefonda o an girişli olan da
 * neredeyse her zaman aynı kişi.
 */
export function jobBelongs(jobOwner: string | null | undefined, current: string | null): boolean {
    if (!jobOwner) return true;
    return current !== null && jobOwner === current;
}

/**
 * Sunucunun cevabı oturumu mu öldürdü, aboneliği mi kapattı?
 *
 * Bu iki hâlde ekranın önbelleğe düşmesi YANLIŞ: "Çevrimdışı liste" yazısı
 * kişiye sinyal beklemesini söylüyor, oysa sinyal gelince de açılmayacak.
 * Yönlendirme var (PIN ya da kapalı kapı); kuyruk da saklanıyor, düşmüyor.
 */
export type SessionStop = 'revoked' | 'locked';

export function sessionStopOf(input: { status?: number | null; code?: string | null }): SessionStop | null {
    if (input.status === 401 && (input.code === 'revoked' || input.code === 'invalid_token')) return 'revoked';
    if (input.status === 403 && input.code === 'subscription_inactive') return 'locked';
    return null;
}
