/**
 * Apple Eşiği · D — bulunamadı ekranının metni ve tek çıkışı.
 *
 * `manager` / `staff` yalnız İÇERİDEYKEN (geri yığını var, oturum biliniyor);
 * soğuk açılan bir bağlantı `outside` sayılıyor ve ilk ekrana gidiyor —
 * oturum kapısı (Face ID / şifre) orada.
 */
export type NotFoundRole = 'manager' | 'staff' | 'outside';

export interface NotFoundCopy {
    title: string;
    body: string;
    action: string;
    href: '/mudur' | '/personel' | '/';
}

const TITLE = 'Burada bir şey yok';
const LEAD = 'Açtığınız bağlantı eski olabilir ya da o kayıt kaldırılmış.';

export function notFoundCopy(role: NotFoundRole): NotFoundCopy {
    if (role === 'manager') {
        return {
            title: TITLE,
            body: `${LEAD} Akışa dönüp aradığınızı oradan bulabilirsiniz.`,
            action: 'Akışa dön',
            href: '/mudur',
        };
    }
    if (role === 'staff') {
        return {
            title: TITLE,
            body: `${LEAD} Bugün ekranına dönüp aradığınızı oradan bulabilirsiniz.`,
            action: 'Bugün’e dön',
            href: '/personel',
        };
    }
    return {
        title: TITLE,
        body: `${LEAD} Girişe dönüp hesabınızla devam edebilirsiniz.`,
        action: 'Girişe dön',
        href: '/',
    };
}
