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
    counts: { done: number; left: number } | null,
): string {
    const day = formatDayMonth(dateISO);
    if (!counts) return day;
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
        // Saat BİLİNMİYORSA yazılmıyor; yerine her koşulda doğru olan yol.
        const hint = open
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
