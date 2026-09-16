/**
 * Müdürün okuma reddine verdiği cevaplar — `Durumlar.html` diliyle. Saf.
 *
 * Ağ hatasının kendi bloğu zaten var (`DurumUnread`) ve personelle ortak.
 * Burada YALNIZ org reddi var, çünkü o üç şey ağ hatasından farklı: hiçbiri
 * beklemekle geçmiyor ve üçünün yapılacak işi de ayrı.
 *
 * ── Neden üç ayrı cümle ─────────────────────────────────────────────────────
 * Üçünü "salon okunamadı" diye tek cümleye indirmek, müdüre yanlış işi
 * yaptırırdı: erişimi kaldırılmış müdür bekler durur, oturumu bitmiş müdür
 * yeniden giriş yapmayı akıl etmez, iki salonlu müdür ise seçmesi gerektiğini
 * hiç bilmez.
 */

import { type DurumTone } from './durum.ts';
import { type OrgRefusal } from './managerMap.ts';

export type DurumActionKind = 'signin' | 'signout' | 'pick';

export interface DurumSpec {
    tone: DurumTone;
    title: string;
    lines: string[];
    action: { label: string; kind: DurumActionKind };
}

/**
 * Org reddinin ekran karşılığı.
 *
 * ── Ton ─────────────────────────────────────────────────────────────────────
 * Tur: "Amber — iş durmuyor demek. Kırmızı — yalnız gerçekten başarısız olan
 * işlemde."
 *
 * `no_access` KIRMIZI: beklemek bir seçenek değil, müdürün o salonu görmesi
 * bir daha kendiliğinden düzelmeyecek. Ötekiler amber — ikisinde de yapılacak
 * bir hamle var ve hamle yapılınca iş sürüyor.
 */
export function orgDurum(reason: OrgRefusal): DurumSpec {
    if (reason === 'no_access') {
        return {
            tone: 'red',
            title: 'Bu salona artık giremiyorsunuz',
            // SEBEP UYDURULMUYOR: hangisi olduğunu bilmiyoruz, ikisi de
            // mümkün ve ikisinin de sonucu aynı.
            lines: ['Yetkiniz kaldırılmış ya da salon kapatılmış olabilir.'],
            action: { label: 'Çıkış yap', kind: 'signout' },
        };
    }
    if (reason === 'ambiguous') {
        return {
            tone: 'amber',
            title: 'Hangi salon?',
            lines: ['Bu hesap birden çok salona bağlı. Birini seçin.'],
            action: { label: 'Salon seç', kind: 'pick' },
        };
    }
    return {
        tone: 'amber',
        title: 'Oturumunuz bitti',
        lines: ['Kaldığınız yerden devam etmek için yeniden girin.'],
        action: { label: 'Giriş yap', kind: 'signin' },
    };
}
