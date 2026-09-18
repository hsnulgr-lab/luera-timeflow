/**
 * Apple Eşiği · B — "Hesabınız silindi" plakası.
 *
 * Ayrı bir "silindi" ekranı YOK: silme bitince kişinin hesabı yok, ona ait bir
 * ekranda tutmak sahte olurdu. Karşılamaya düşüyor ve olan biteni cam plaka
 * söylüyor. Bilgi silme ekranından rota parametresiyle geliyor — yazılan tek
 * şey işletmenin adı ve kimin gittiği; hiçbir yerde saklanmıyor.
 *
 * Plaka YALNIZ sunucu silmeyi onayladıktan sonra çiziliyor: silme ekranı
 * yönlendirmeyi `result.ok` dalında yapıyor.
 */

/** Rota parametresi: `s:<ad>` işletme de gitti, `m:<ad>` yalnız kişisel hesap. */
export function goneParam(soleManager: boolean, businessName: string): string {
    return `${soleManager ? 's' : 'm'}:${businessName.trim()}`;
}

export interface DeletedNotice {
    title: string;
    body: string;
}

export function deletedNotice(param: string | string[] | undefined): DeletedNotice | null {
    const raw = Array.isArray(param) ? param[0] : param;
    if (!raw || raw.length < 2 || raw[1] !== ':') return null;
    const kind = raw[0];
    const name = raw.slice(2).trim();
    if (kind === 's') {
        return {
            title: 'Hesabınız silindi',
            // Giriş kaydı da gitti (account-delete · deleteUser); aynı adres
            // yeniden kullanılabiliyor.
            body: name
                ? `${name} ve kayıtları kaldırıldı. Aynı e-posta ile yeni bir işletme oluşturabilirsiniz.`
                : 'İşletmeniz ve kayıtları kaldırıldı. Aynı e-posta ile yeni bir işletme oluşturabilirsiniz.',
        };
    }
    if (kind === 'm') {
        return {
            title: 'Hesabınız silindi',
            body: name
                ? `${name} ve kayıtları yerinde duruyor; yalnız sizin hesabınız kaldırıldı.`
                : 'İşletme ve kayıtları yerinde duruyor; yalnız sizin hesabınız kaldırıldı.',
        };
    }
    return null;
}

/** Plakanın ekranda kaldığı süre — ya da dokununca kapanır. */
export const DELETED_NOTICE_MS = 6000;
