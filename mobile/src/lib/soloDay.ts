/**
 * Tek kişilik Gün ekranının metin kuralları (108).
 *
 * Ekranın kendisi `app/tek/index.tsx`; burada yalnız karar veren parçalar
 * duruyor — ekrana gömülü bir cümle test edilemez ve sessizce yanlışa döner.
 */

import { awaitsApproval } from './approval.ts';
import { formatDayMonth, toMinutes, type Appt } from './calendar.ts';
import type { OpenWindow } from './createLive.ts';
import { dayDistance, dayPosition, weekdayName, type EmptyDayCopy } from './emptyDay.ts';
import { isNoShow } from './staffDay.ts';
import { upperTR } from './text.ts';

/**
 * Başlığın altındaki satır: "9 Ekim · 2 iş bitti, 3 kaldı".
 *
 * Sayılar personel "Bugün" ekranının dilinde, müdürün "6 randevu · 3
 * personel"i değil. Gerekçe: bu modda ekrana bakan kişi işi YAPAN kişi; kaç
 * personel olduğu onun sorusu değil, kaçının bittiği onun sorusu.
 *
 * `counts` null ise gün HENÜZ OKUNMADI ve yalnız tarih yazılıyor. Okunmamış
 * bir günü "0 iş bitti" diye göstermek, boş olduğunu söylemek olurdu —
 * saniyeler sonra kendini yalanlayan bir cümle.
 */
export function soloDaySubtitle(
    dateISO: string,
    counts: { done: number; left: number } | { total: number } | null,
): string {
    const day = formatDayMonth(dateISO);
    if (!counts) return day;

    /*
     * BUGÜN OLMAYAN GÜN yalnız SAYAR (2026-10-11 düzeltmesi).
     *
     * "2 iş bitti, 3 kaldı" ŞU ANIN cümlesi. Dün seçiliyken telefonda
     * "1 iş bitti, 7 kaldı" yazıyordu: o gün çoktan bitti ve "kaldı" diye
     * bir şeyi yok. İleriki günde de yanlış — hiçbiri daha olmadı.
     */
    if ('total' in counts) {
        return counts.total === 0 ? `${day} · randevu yok` : `${day} · ${counts.total} randevu`;
    }

    // Gerçekten boş gün: sayı saymak yerine durumu söylüyor. "0 iş bitti,
    // 0 kaldı" teknik olarak doğru ama kimsenin kurmayacağı bir cümle.
    if (counts.done === 0 && counts.left === 0) return `${day} · randevu yok`;
    return `${day} · ${counts.done} iş bitti, ${counts.left} kaldı`;
}

// ── Randevu kartının durumu ─────────────────────────────────────────────────

export interface SoloApptStamp {
    label: string;
    tone: 'gr' | 'am' | 'rd';
}

/**
 * Kartın hizmet satırının devamında yazan durum: "● tamamlandı".
 *
 * ── Neden "tahsil edildi" DEĞİL ─────────────────────────────────────────────
 * Tasarım (v4 · G1, G4) bu yuvada "tahsil edildi" ve "adisyon açık" yazıyor.
 * Yazılmadı, çünkü randevu satırında ödeme diye bir alan YOK: `Appt` içinde
 * `status`, `arrived_at` ve `service_ended_at` var; para kaydı ayrı bir
 * yerde (`cash.ts`) ve bu ekran onu okumuyor.
 *
 * "İş bitti"yi "para alındı" diye yazmak ekranı yalancı yapardı — hem de en
 * pahalı yerde: kullanıcı tahsil ettiğini sanıp günü kapatır. Yuvanın yeri,
 * rengi ve kenar şeridi tasarımın ta kendisi; içindeki kelime verinin
 * bildiği kadarını söylüyor.
 *
 * Ödeme durumu bu ekrana geldiğinde (Faz 3 · tahsilat) kelime "tahsil
 * edildi"ye döner ve açık adisyon amber "adisyon açık" olur.
 *
 * İPTAL ile GELMEDİ ayrı kalıyor: iptali kullanıcı yazar, gelmemeyi müşteri
 * yapar. Tek rozete toplamak yarına taşınacak satırı gizlerdi.
 */
export function soloApptStamp(appointment: Appt, nowMinutes: number): SoloApptStamp | null {
    if (appointment.status === 'cancelled') return { label: 'iptal', tone: 'rd' };
    if (appointment.status === 'completed' || Boolean(appointment.service_ended_at)) {
        return { label: 'tamamlandı', tone: 'gr' };
    }
    if (awaitsApproval(appointment.status)) return { label: 'onay bekliyor', tone: 'am' };
    if (isNoShow(appointment, nowMinutes)) return { label: 'gelmedi', tone: 'rd' };
    return null;
}

/** Kartın sağ üstündeki süre: "120 dk". Hesaplanamıyorsa yazılmıyor. */
export function soloApptDuration(appointment: Appt): string | null {
    const minutes = toMinutes(appointment.end_time) - toMinutes(appointment.start_time);
    return minutes > 0 ? `${minutes} dk` : null;
}

// ── Boş hâlin cümlesi ───────────────────────────────────────────────────────

/** "09:00 – 19:00" */
function windowText(open: OpenWindow): string {
    const clock = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    return `${clock(open.from)} – ${clock(open.to)}`;
}

/**
 * Boş günün cümlesi — müdürünki DEĞİL.
 *
 * `emptyDayCopy` salonu dışarıdan anlatıyor: "Salon 09:00'da açıldı · ilk
 * kayıt bekleniyor." Tek kişilik modda cümlenin muhatabı salonun kendisi;
 * aynı cümle üçüncü şahıstan konuşur ve kullanıcıya kendi salonunu haber
 * verirdi. Burada ikinci şahıs: "Çalışma saatiniz 09:00 – 19:00."
 *
 * `open`: `null` KAPALI GÜN, `undefined` BİLİNMİYOR. İkisi ayrı cümle —
 * bilinmeyen bir günü "kapalısınız" diye yazmak uydurmak olurdu.
 *
 * Tasarım: v4 · B1 (gerçekten boş) ve B2 (kapalı gün).
 */
export function soloEmptyCopy(
    selectedISO: string,
    todayISO: string,
    open: OpenWindow | null | undefined,
    /**
     * Salonun hizmet sayısı — `null` BİLİNMİYOR (v4 · S2).
     *
     * Yalnız sıfırken cümleyi değiştiriyor: yeni hesabın ilk gününde
     * "çalışma saatiniz şu" demek doğru ama işe yaramaz; o kişinin önündeki
     * ilk adım hizmetini tanımlamak. Bilinmiyorsa normal cümle yazılıyor —
     * okunamayan bir sayıya dayanıp "hizmetiniz yok" demek, hizmetleri olan
     * birine onları yokmuş gibi göstermekti.
     */
    serviceCount: number | null = null,
): EmptyDayCopy {
    const position = dayPosition(selectedISO, todayISO);
    const distance = dayDistance(selectedISO, todayISO);
    const day = formatDayMonth(selectedISO);
    const weekday = weekdayName(selectedISO);
    const isToday = position === 'today';

    // KAPALI GÜN, boş günden ayrı cümle: kapalı gün boş gün değil. Kapalı
    // olduğu çalışma saatlerinden okunuyor; ekran kendi başına "kapalı" demez.
    if (open === null) {
        const title = isToday ? 'Bugün kapalısınız.' : `${day} kapalı gün.`;
        return {
            label: upperTR(weekday),
            dot: true,
            dotTone: 'calm',
            title,
            hint: `${weekday}, çalışma saatlerinizde kapalı gün.`,
            action: null,
            rail: false,
            spoken: `${title} ${weekday}, çalışma saatlerinizde kapalı gün.`,
        };
    }

    if (isToday) {
        const title = 'Bugün randevunuz yok.';
        /*
         * Üç cümle, üç ayrı durum:
         *   hizmet yok   → önündeki ilk adım o (v4 · S2)
         *   saat biliniyor → günün çerçevesi
         *   saat bilinmiyor → her koşulda doğru olan yol
         *
         * "Hizmetlerinizi orada da ekleyebilirsiniz" artık DOĞRU bir cümle:
         * randevu kurma ekranındaki "Yeni hizmet ekle" satırı (v4 · R1) o
         * yolu açtı. Satır yokken bu cümle kullanıcıyı olmayan bir yere
         * yollardı.
         */
        const hint = serviceCount === 0
            ? 'İlk randevuyu alttaki Randevu’dan kurun. Hizmetlerinizi orada da ekleyebilirsiniz.'
            : open
                ? `Çalışma saatiniz ${windowText(open)}.`
                : 'İlk randevuyu alttaki Randevu’dan kurabilirsiniz.';
        return {
            label: upperTR(`Bugün · ${weekday}`),
            dot: true,
            title,
            hint,
            action: null,
            spoken: `${title} ${hint}`,
        };
    }

    if (position === 'future') {
        const title = `${day} ${weekday} boş.`;
        const hint = 'O güne henüz randevu kurmadınız.';
        return {
            label: upperTR(`İlerideki gün · ${distance} gün sonra`),
            dot: false,
            title,
            hint,
            action: null,
            spoken: `${title} ${hint}`,
        };
    }

    const title = `${weekday}, ${day} boş geçti.`;
    const hint = 'O gün randevu, işlem ve tahsilat kaydınız yok.';
    return {
        label: upperTR(`Geçmiş gün · ${distance} gün önce`),
        dot: false,
        title,
        hint,
        action: null,
        spoken: `${title} ${hint}`,
    };
}

// ── Hâl kartının eylem hapı ─────────────────────────────────────────────────

export interface SoloPanelAction {
    label: string;
    /** `go` sunucuya yazan işe götürür, `calm` yalnız ekranı açar. */
    tone: 'go' | 'calm';
    /** Kumandanın açılacağı randevu. */
    appointmentId: string;
}

/**
 * Kartın sağındaki hap: kumandada yapılacak İLK İŞİN adı (v4 · G1–G3).
 *
 * ── Hap neden "başlatmıyor" ─────────────────────────────────────────────────
 * "Başlat" kumandayı BEKLENİYOR hâlinde açıyor; işi başlatan oradaki "Kaydır
 * ve başlat". Tasarım da böyle diyor ve sebebi var: başlatmak `started_at`
 * yazıyor, yani sunucuya giden geri alınamaz bir iş. Listede yanlışlıkla
 * dokunulan bir hapın bunu yapması, günün sayacını yanlış dakikadan
 * başlatırdı. Hap bir kapı, kumanda ise o işin yapıldığı yer.
 *
 * ── Üçüncü hâl neden yok ────────────────────────────────────────────────────
 * v4'te dördüncü bir kart var: ADİSYON AÇIK → "Tahsil et". O hâl bu ekranda
 * hiç oluşmuyor, çünkü `buildStaffDayState` ödeme diye bir şey bilmiyor —
 * randevu satırında öyle bir alan yok. Tahsilat Faz 3; o geldiğinde buraya
 * üçüncü bir dal eklenir.
 *
 * `null`: üzerinde iş yapılacak satır yok (boş gün ya da günün sonu). Kart
 * bilgi olarak kalıyor, hapsız.
 */
export function soloPanelAction(
    running: Appt | null,
    next: Appt | null,
): SoloPanelAction | null {
    // Süren iş ÖNCE: o anda yapılacak tek şey o.
    if (running) return { label: 'Kumandayı aç', tone: 'calm', appointmentId: running.id };
    if (next) return { label: 'Başlat', tone: 'go', appointmentId: next.id };
    return null;
}

/**
 * OKUNAMADI (v4 · B4) — boş günün değil, bilinmeyenin cümlesi.
 *
 * Dört boş hâl (gerçekten boş, kapalı gün, yükleniyor, okunamadı) aynı
 * çerçevede duruyor: tasarımın kendi başlığı "dört ayrı cümle". Müdürün
 * `DurumUnread`u sola yaslı ve kendi cümle kalıbı var; burada dördü yan yana
 * görülüyor ve biri ötekilere benzemezse ekran hata ânında başka bir
 * uygulamaya dönüşüyor.
 *
 * "Kendiliğinden yenilenir" bir SÖZ ve tutuluyor: `useManagerCalendarDay`
 * yoklamayı açık bırakıyor (`poll` varsayılan), bağlantı gelince okuma
 * kendisi başarıya dönüyor. Tutulamayacak olsaydı cümle yazılmazdı.
 */
export const SOLO_UNREAD_COPY: EmptyDayCopy = {
    label: upperTR('Okunamadı'),
    dot: false,
    title: 'Gününüz şu an gösterilemiyor.',
    hint: 'Randevularınız yerinde. Bağlantı gelince bu ekran kendiliğinden yenilenir.',
    action: null,
    // Ray çalışma saatlerinin cetveli; günü okuyamadıysak onu da bilmiyoruz.
    rail: false,
    spoken: 'Gününüz şu an gösterilemiyor. Randevularınız yerinde. Bağlantı gelince bu ekran kendiliğinden yenilenir.',
};

// ── Gün listesinin kuruluşu ─────────────────────────────────────────────────

export interface SoloDayList {
    /** Çizilecek kartlar, SAAT SIRASINDA. */
    rows: Appt[];
    /** Şimdi hapının hangi kartın ÜSTÜNE gireceği; `null` çizilmiyor. */
    nowIndex: number | null;
    /** Liste başlığı; `null` başlık yok. */
    title: string | null;
}

const byStart = (a: Appt, b: Appt) => toMinutes(a.start_time) - toMinutes(b.start_time);

/**
 * Gün listesi — v4'ün iki ayrı kuralı, artı bugün olmayan gün.
 *
 * ── Telefonda görülen iki kusur (2026-10-11) ────────────────────────────────
 * 1. İPTAL EDİLEN RANDEVU LİSTENİN BAŞINA ÇIKIYORDU. `buildStaffDayState`
 *    iptali saatine bakmadan "geçmiş" kovasına atıyor (Müdür 24'te doğru: o
 *    ekran "olmuş/olacak" diye ikiye ayırıyor) ve ekran geçmiş kovasını önce
 *    çiziyordu. Sonuç: 11:15 iptal, 09:30'un üstünde.
 *
 * 2. BUGÜN OLMAYAN GÜNDE "ŞU AN" HESABI YAPILIYORDU. Dün seçiliyken kart
 *    "ŞU AN BOŞ · 9 sa 16 dk · 09:30'a kadar" diyordu — o gün çoktan yaşandı
 *    ve "şu an" diye bir şeyi yok.
 *
 * ── v4'ün kuralı ────────────────────────────────────────────────────────────
 * Tasarımda iki liste var ve ikisi de SAAT SIRASINDA:
 *
 *   müsait (G1, G4) → "BUGÜN · 5 RANDEVU", günün TAMAMI, şimdi hapı araya
 *   süren iş (G2, G3) → "SIRADAKİ · 2 RANDEVU", yalnız bekleyenler, hap yok
 *
 * İkincisinde bitenler listede YOK: süren iş kartta duruyor ve ekranın
 * cevaplaması gereken soru "sırada ne var".
 *
 * Bugün olmayan günde ikisi de geçerli değil: tek liste, saat sırasında,
 * hapsız. Başlık sayıyı söylüyor çünkü "BUGÜN" yazamaz.
 */
export function soloDayList(
    state: {
        kind: string;
        listTitle: string | null;
        showNowLine: boolean;
        runningAppointment: Appt | null;
        pastAppointments: readonly Appt[];
        upcomingAppointments: readonly Appt[];
    } | null,
    all: readonly Appt[],
    isToday: boolean,
    nowMinutes: number,
): SoloDayList {
    if (!isToday) {
        const rows = [...all].sort(byStart);
        return {
            rows,
            nowIndex: null,
            title: rows.length > 0 ? `${rows.length} randevu` : null,
        };
    }

    if (!state) return { rows: [], nowIndex: null, title: null };

    // Süren ya da beklemedeki iş: liste yalnız SIRADAKİLER.
    if (state.runningAppointment) {
        return {
            rows: [...state.upcomingAppointments].sort(byStart),
            nowIndex: null,
            title: state.listTitle,
        };
    }

    const rows = [...state.pastAppointments, ...state.upcomingAppointments].sort(byStart);
    /*
     * Hap, saati ŞİMDİDEN SONRA olan ilk kartın üstüne giriyor. Kovaya göre
     * değil saate göre: iptal edilen bir randevu "geçmiş" kovasında ama
     * saati ileride olabilir ve hap onun altına düşerse liste yalan söyler.
     */
    const firstAhead = rows.findIndex((row) => toMinutes(row.start_time) >= nowMinutes);
    const nowIndex = state.showNowLine && firstAhead > 0 ? firstAhead : null;

    return { rows, nowIndex, title: state.listTitle };
}
