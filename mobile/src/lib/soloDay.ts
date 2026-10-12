/**
 * Tek kişilik Gün ekranının metin kuralları (108).
 *
 * Ekranın kendisi `app/tek/index.tsx`; burada yalnız karar veren parçalar
 * duruyor — ekrana gömülü bir cümle test edilemez ve sessizce yanlışa döner.
 */

import { awaitsApproval } from './approval.ts';
import { formatDayMonth, hhmm, toMinutes, type Appt } from './calendar.ts';
import type { OpenWindow } from './createLive.ts';
import { dayDistance, dayPosition, weekdayName, type EmptyDayCopy } from './emptyDay.ts';
import { formatMoney } from './cash.ts';
import { graceLeft, pendingTicketLine, pendingTickets, type FlowEvent } from './managerFlow.ts';
import { DEFAULT_ARRIVAL_TOLERANCE_MIN, formatFreeDuration, isNoShow, type StaffHeroPanel } from './staffDay.ts';
import { clockDative, clockLocative, upperTR } from './text.ts';

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
    counts: SoloDayCounts | SoloDayTotal | null,
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
        if (counts.total > 0) return `${day} · ${counts.total} randevu`;
        const cancelled = counts.cancelled ?? 0;
        return cancelled > 0 ? `${day} · ${cancelled} iptal` : `${day} · randevu yok`;
    }

    const noshow = counts.noshow ?? 0;
    // Gerçekten boş gün: sayı saymak yerine durumu söylüyor. "0 iş bitti,
    // 0 kaldı" teknik olarak doğru ama kimsenin kurmayacağı bir cümle.
    // Yalnız iptal kalmış gün "randevu yok" DEMİYOR: liste iptal kartlarını
    // gösterirken başlık onları yok sayardı.
    if (counts.done === 0 && noshow === 0 && counts.left === 0) {
        const cancelled = counts.cancelled ?? 0;
        return cancelled > 0 ? `${day} · ${cancelled} iptal` : `${day} · randevu yok`;
    }
    // Personel "Bugün"ünün cümlesiyle aynı: gelmeyen varsa ayrı sayılıyor.
    return `${day} · ${[
        `${counts.done} iş bitti`,
        noshow > 0 ? `${noshow} gelmedi` : null,
        `${counts.left} kaldı`,
    ].filter(Boolean).join(', ')}`;
}

/**
 * Bugün olmayan günün sayısı. İPTAL SAYILMIYOR — şeridin noktası da saymıyor
 * (`countsOf`): iptal kimsenin vaktini almıyor. Başlık "5 randevu" derken
 * şerit 4 gösteriyordu.
 */
export interface SoloDayTotal {
    total: number;
    cancelled?: number;
}

export function soloDayTotal(appointments: readonly Pick<Appt, 'status'>[]): SoloDayTotal {
    const cancelled = appointments.filter((appointment) => appointment.status === 'cancelled').length;
    return { total: appointments.length - cancelled, cancelled };
}

export interface SoloDayCounts {
    done: number;
    left: number;
    noshow?: number;
    cancelled?: number;
}

/**
 * Bugünün sayıları, KARTLARIN DAMGASIYLA AYNI kuralla (`soloApptStamp`).
 *
 * Eskiden sayılar personel durumunun kovalarından geliyordu: saati geçen
 * her şey "geçmiş" kovasındaydı ve "geçmiş" = "bitti" okunuyordu. Telefonda
 * üç gelmeyen randevulu gün "3 iş bitti, 0 kaldı" yazdı; altındaki kart
 * "0 tamamlandı · 3 gelmedi" diyordu. Aynı ekranda iki farklı gerçek.
 *
 *   bitti   — kartta "tahsil edildi / adisyon açık / tamamlandı"
 *   gelmedi — kartta "gelmedi"
 *   iptal   — hiçbir kovaya girmiyor; iş değil
 *   kaldı   — geri kalan her şey: süren iş, sıradakiler ve saati geçmiş ama
 *             geç kalma payı dolmamış randevu (müşteri hâlâ gelebilir)
 */
export function soloDayCounts(appointments: readonly Appt[], nowMinutes: number): SoloDayCounts {
    const counts = { done: 0, left: 0, noshow: 0, cancelled: 0 };
    for (const appointment of appointments) {
        const stamp = soloApptStamp(appointment, nowMinutes);
        if (appointment.status === 'cancelled') counts.cancelled += 1;
        else if (stamp?.done) counts.done += 1;
        else if (isNoShow(appointment, nowMinutes)) counts.noshow += 1;
        else counts.left += 1;
    }
    return counts;
}

// ── Randevu kartının durumu ─────────────────────────────────────────────────

export interface SoloApptStamp {
    label: string;
    tone: 'gr' | 'am' | 'rd';
    /**
     * İŞ BİTTİ — tahsil edilmiş olsun olmasın. Kartın adı soluyor
     * (`.gk.done .nm`). "Onay bekliyor" da kehribar ama bitmiş bir iş değil;
     * soluklaşma tonla değil bununla seçiliyor.
     */
    done?: true;
}

/**
 * Kartın hizmet satırının devamında yazan durum (v4 · G1, G4):
 *   tahsil edildi  — yeşil
 *   adisyon açık   — kehribar: iş bitti, para henüz alınmadı
 *
 * Ödeme hâli Gün okumasından geliyor (`is_paid`); Kasa'nın "bekleyen"
 * tanımıyla AYNI kural: tamamlanmış ve tahsil edilmemiş (`flowBuild.kindOf`).
 * Alan SORULMADIYSA (`undefined`) "tamamlandı" yazıyor: bilmediği bir şeyi
 * "adisyon açık" diye söylemek, ödenmiş bir işi borç gibi gösterirdi.
 *
 * İPTAL ile GELMEDİ ayrı kalıyor: iptali kullanıcı yazar, gelmemeyi müşteri
 * yapar. Tek rozete toplamak yarına taşınacak satırı gizlerdi.
 */
export function soloApptStamp(appointment: Appt, nowMinutes: number): SoloApptStamp | null {
    if (appointment.status === 'cancelled') return { label: 'iptal', tone: 'rd' };
    if (appointment.status === 'completed') {
        if (appointment.is_paid === true) return { label: 'tahsil edildi', tone: 'gr', done: true };
        if (appointment.is_paid === false) return { label: 'adisyon açık', tone: 'am', done: true };
        return { label: 'tamamlandı', tone: 'gr', done: true };
    }
    // İş bitti ama kayıt henüz tamamlanmadı: para sorusu daha sorulmuyor.
    if (appointment.service_ended_at) return { label: 'tamamlandı', tone: 'gr', done: true };
    /*
     * MÜŞTERİ GELDİ, iş başlamadı (randevu kartındaki "Geldi"). Damgasız
     * kart ne bitmiş ne gelmemiş görünüyordu: saati çoktan geçmiş bir kart
     * "gelmedi" demiyor ve sebebi ekranda yoktu. Kumandanın kelimesi.
     */
    if (appointment.customer_arrived_at && !appointment.arrived_at) return { label: 'bekliyor', tone: 'am' };
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
 * "Yarın 09:00’da açıksınız." — kapalı günün ikinci cümlesi (v4 · B2).
 *
 * "Yarın" yalnız BUGÜN seçiliyken ve açılış ertesi günse: başka bir güne
 * bakarken "yarın" bakılan günün değil bugünün yarını olurdu. Öteki durumda
 * gün adıyla; bir haftadan uzaksa tarihiyle.
 *
 * Açılış bilinmiyorsa (saatler okunamadı) ya da iki hafta içinde yoksa cümle
 * YAZILMIYOR — uydurulmuyor.
 */
export function openingSentence(
    selectedISO: string,
    todayISO: string,
    nextOpen: { dateISO: string; from: number } | null | undefined,
): string | null {
    if (!nextOpen) return null;
    const gap = dayDistance(nextOpen.dateISO, selectedISO);
    const name = weekdayName(nextOpen.dateISO);
    const when = selectedISO === todayISO && gap === 1
        ? 'Yarın'
        : gap <= 6 ? name : `${formatDayMonth(nextOpen.dateISO)} ${name}`;
    return `${when} ${clockLocative(hhmm(nextOpen.from))} açıksınız.`;
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
    /**
     * Seçili günden sonraki ilk açılış (v4 · B2 · "Yarın 09:00’da
     * açıksınız"). `undefined` bilinmiyor ve cümle YAZILMIYOR.
     */
    nextOpen: { dateISO: string; from: number } | null | undefined = undefined,
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
        // Geçmiş bir kapalı gün için "açıksınız" bir şey söylemiyor.
        const opens = position === 'past' ? null : openingSentence(selectedISO, todayISO, nextOpen);
        const hint = [`${weekday}, çalışma saatlerinizde kapalı gün.`, opens].filter(Boolean).join(' ');
        return {
            label: upperTR(weekday),
            dot: true,
            dotTone: 'calm',
            title,
            hint,
            action: null,
            rail: false,
            spoken: `${title} ${hint}`,
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

// ── BEKLEMEDE kartı ─────────────────────────────────────────────────────────

/**
 * Süren işin beklemesi sürüyorsa hâl kartı BEKLEMEDE (v4 · G3).
 *
 * Kart SÜRÜYOR'un yerini alıyor: o an olan şey beklemek, ve büyük sayı
 * beklemenin KALANI (`wait_ends_at`). Bekleme bitince bu fonksiyon `null`
 * veriyor ve kart kendiliğinden SÜRÜYOR'a dönüyor.
 *
 * Etiket yalnız "BEKLEMEDE". Tasarım "BEKLEMEDE · KREM" yazıyor ama kumanda
 * neyin beklendiğini bilmiyor — yalnız süre soruyor. Kullanıcı kararı
 * (2026-10-11): ad uydurulmaz.
 *
 * Bitiş saati telefonun saat diliminde yazılıyor: "bekleme 14:33’te biter".
 */
export function soloWaitPanel(
    running: Appt | null,
    wait: { endsAt: number } | null,
    nowMs: number,
): StaffHeroPanel | null {
    if (!running || !wait) return null;
    const leftMs = wait.endsAt - nowMs;
    if (!(leftMs > 0)) return null;
    const ends = new Date(wait.endsAt);
    const clock = hhmm(ends.getHours() * 60 + ends.getMinutes());
    return {
        label: 'Beklemede',
        tone: 'am',
        hasPulse: false,
        // Son dakika "0 dk" değil "1 dk": bekleme henüz bitmedi.
        heroValue: String(Math.max(1, Math.ceil(leftMs / 60_000))),
        heroUnit: 'dk',
        subText: `${running.customer_name} · ${running.service} · bekleme ${clockLocative(clock)} biter`,
    };
}

// ── ADİSYON AÇIK kartı (v4 · G4) ────────────────────────────────────────────

/**
 * Hâl kartına çıkacak AÇIK ADİSYON — bugünün, en son biteni.
 *
 * Kaynak Kasa'nın kaynağı (`useManagerDay` · `pendingTickets`): kartın
 * tutarı Kasa'nın turuncu şeridindeki tutarla AYNI hesaptan geliyor
 * (`cashBuild.ticketsOf` · `balance`) ve tahsilatın sunucuda alacağı tutar
 * da o — iki ekranın iki ayrı rakam söylemesi en pahalı ayrışma olurdu.
 *
 * Kurallar:
 *   • Dünden kalan adisyon kartın konusu DEĞİL (v4: "Başka açık adisyonlar
 *     listede amber satırla ve Kasa'nın turuncu şeridinde kalır").
 *   • Tutarı bilinmeyen ya da sıfır olan adisyon kart olmuyor: "Tahsil et"
 *     sunucuda `zero_amount` alırdı — dokunulan kontrol iş yapmazdı.
 *   • Satır Gün'ün kendi okumasında da AÇIK olmalı. İki okuma birbirinden
 *     birkaç saniye ayrı tazeleniyor; hangisi tahsilatı ÖNCE öğrenirse kart
 *     o an iner — ödenmiş bir işe "Tahsil et" denmez.
 *   • Birden çok açık adisyon varsa EN SON BİTEN: günün o anki satırı o.
 */
export function soloOpenTicket(
    events: readonly FlowEvent[],
    rows: readonly Appt[],
    dateISO: string,
): FlowEvent | null {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const open = pendingTickets(events).filter((event) => {
        if (event.carriedOver || !event.appointmentId) return false;
        if (event.dateISO && event.dateISO !== dateISO) return false;
        if (!(typeof event.amountValue === 'number' && event.amountValue > 0)) return false;
        const row = byId.get(event.appointmentId);
        return Boolean(row)
            && row!.status !== 'cancelled'
            && (row!.status === 'completed' || Boolean(row!.service_ended_at))
            && row!.is_paid !== true;
    });
    if (open.length === 0) return null;
    // `dueMinutes`: bitişten beri geçen dakika — en küçüğü en son biten.
    return [...open].sort((a, b) => (a.dueMinutes ?? Infinity) - (b.dueMinutes ?? Infinity)
        || b.time.localeCompare(a.time))[0];
}

/**
 * "ADİSYON AÇIK · ₺4.500 · Tuğçe Erden · Kalıcı Makyaj · 16:02’de bitti".
 *
 * Kehribar, nabızsız, sol kenarda şerit (`.pnl.bar`). Büyük sayı TUTAR;
 * birimi yok, para işareti rakamla bir parça.
 */
export function soloTicketPanel(ticket: FlowEvent): StaffHeroPanel {
    const name = `${ticket.firstName} ${ticket.lastName}`.trim();
    return {
        label: 'Adisyon açık',
        tone: 'am',
        bar: true,
        hasPulse: false,
        heroValue: formatMoney(ticket.amountValue ?? 0),
        subText: name ? `${name} · ${pendingTicketLine(ticket)}` : pendingTicketLine(ticket),
    };
}

// ── Sıradaki iş: başlatılabilir ilk randevu ─────────────────────────────────

/**
 * Hâl kartının ve "Başlat"ın randevusu — SAATİ GEÇMİŞ OLSA BİLE.
 *
 * Eskiden sıradaki `upcomingAppointments[0]`dı: saati henüz gelmemiş ilk
 * randevu. Telefonda görüldü (2026-10-12, 22:30 → 22:31): randevunun saati
 * bir dakika geçince "geçmiş" kovasına düştü, hap kayboldu ve kart "0 dk ·
 * Gün sonuna kadar" dedi. Geciken müşteriyi başlatmanın hiçbir yolu
 * kalmamıştı — listenin kartı randevu kartını açıyor, başlatmıyor.
 *
 * Başlatılabilir = iptal ya da tamamlanmış değil, başlamamış, bitmemiş ve
 * GELMEDİ SAYILMAMIŞ: saati gelmemiş, gecikmiş ama payı dolmamış (30 dk) ya
 * da müşterisi kapıda. Payı dolan randevu gelmedi sayılıyor ve kartın konusu
 * değil; müşteri yine de gelirse randevu kartındaki "Geldi" onu kapıya
 * alıyor ve buraya geri dönüyor (`isNoShow` kapıdakini saymaz).
 *
 * Saat sırasıyla ilki: kapıda bekleyen ya da geciken, sonrakinden önce gelir.
 */
export function soloNextToStart(appointments: readonly Appt[], nowMinutes: number): Appt | null {
    return soloStartable(appointments, nowMinutes)[0] ?? null;
}

/** Başlatılabilir randevuların HEPSİ, saat sırasıyla — kural `soloNextToStart`ta. */
export function soloStartable(appointments: readonly Appt[], nowMinutes: number): Appt[] {
    return appointments
        .filter((appointment) => appointment.status !== 'cancelled'
            && appointment.status !== 'completed'
            && !appointment.arrived_at
            && !appointment.service_ended_at
            && !isNoShow(appointment, nowMinutes))
        .sort(byStart);
}

/**
 * Sıradaki işin saati GEÇTİYSE kartın cümlesi — Akış'ın A1'iyle ve kumandanın
 * kadranıyla aynı dil:
 *   BEKLİYOR — müşteri geldi, iş başlamadı: kaç dakikadır bekliyor
 *             (kehribar). İlk adı KAPIDA'ydı; kullanıcı "beklemede" istedi.
 *             "BEKLEMEDE" DEĞİL: o kelime aynı yuvada süren işin beklemesi
 *             (G3 · boya bekliyor), yine kehribar — iki anlam karışırdı.
 *             Kumandanın kadranı bu hâlde zaten "BEKLİYOR" diyor
 *             (`visitControl`), randevu kartı "Geldi · bekliyor".
 *   GECİKTİ — müşteri gelmedi, saat geçti: kaç dakika geçti ve kaç dakika
 *             sonra gelmedi sayılacak (kırmızı; Akış'ın "N dk sonra gelmedi
 *             sayılır"ı)
 * Saati henüz gelmediyse `null`: G1'in "ŞU AN BOŞ · N dk · sıradaki" kartı
 * kalıyor. Kapıdaki müşteri saatinden ERKEN gelmişse de KAPIDA — bekleyen
 * biri var ve "şu an boş" demek onu yok saymak olurdu.
 *
 * `nowMs` sunucu saati: kapıya geliş damgası da sunucunun.
 */
export function soloNextPanel(next: Appt | null, nowMinutes: number, nowMs: number): StaffHeroPanel | null {
    if (!next) return null;
    const who = `${next.customer_name} · ${next.service}`;
    if (next.customer_arrived_at) {
        const since = Date.parse(next.customer_arrived_at);
        const waited = Number.isFinite(since) ? Math.max(0, Math.floor((nowMs - since) / 60_000)) : 0;
        // Ne zamandır beklediği büyük sayıda; satır NE ZAMAN geldiğini
        // söylüyor ("bekliyor" etikette, ikinci kez yazılmıyor).
        const came = Number.isFinite(since) ? new Date(since) : null;
        return {
            label: 'Bekliyor',
            tone: 'am',
            hasPulse: false,
            heroValue: String(waited),
            heroUnit: 'dk',
            subText: came
                ? `${who} · ${clockLocative(hhmm(came.getHours() * 60 + came.getMinutes()))} geldi`
                : who,
        };
    }
    const late = nowMinutes - toMinutes(next.start_time);
    if (late < 1) return null;
    return {
        label: 'Gecikti',
        tone: 'rd',
        hasPulse: false,
        heroValue: String(late),
        heroUnit: 'dk',
        // Pay `isNoShow`un payı (30 dk). `graceLeft`in kendi varsayılanı eski
        // 120 — Akış da payı açıkça veriyor (`flowBuild` · NO_SHOW_AFTER_MIN).
        subText: `${who} · ${graceLeft(-late, DEFAULT_ARRIVAL_TOLERANCE_MIN)} dk sonra gelmedi sayılır`,
    };
}

/**
 * Sıradaki iş YOKKEN kart (süren iş ve açık adisyon da yok).
 *
 * Eskiden personel durumunun kartı yazılıyordu ve günün sonunu 19:00
 * sayıyordu: 22:31'de, 23:55'e kadar açık bir salonda "ŞU AN BOŞ · 0 dk ·
 * Gün sonuna kadar". Tek kişilikte günün sonu çalışma saatinin kapanışı:
 *   kapanış gelmediyse → ŞU AN BOŞ · kapanışa kalan · "23:55’e kadar ·
 *                        sıradaki randevu yok"
 *   kapanış geçtiyse ya da saat bilinmiyorsa → BUGÜN · N randevu ·
 *                        "3 tamamlandı · 1 gelmedi" (başlığın sayıları)
 *
 * Yalnız boşta ve gün sonu hâllerinde (`free`, `ended`); izin ve kapalı gün
 * kartları kendi cümlelerini söylüyor.
 */
export function soloIdlePanel(
    kind: string,
    counts: SoloDayCounts,
    open: OpenWindow | null | undefined,
    nowMinutes: number,
): StaffHeroPanel | null {
    if (kind !== 'free' && kind !== 'ended') return null;
    if (open && nowMinutes < open.to) {
        const free = formatFreeDuration(open.to - nowMinutes);
        return {
            label: 'Şu an boş',
            hasPulse: false,
            heroValue: free.value,
            heroUnit: free.unit,
            subText: `${clockDative(hhmm(open.to))} kadar · sıradaki randevu yok`,
        };
    }
    const noshow = counts.noshow ?? 0;
    return {
        label: 'Bugün',
        hasPulse: false,
        heroValue: String(counts.done + noshow + counts.left),
        heroUnit: 'randevu',
        subText: `${counts.done} tamamlandı · ${noshow} gelmedi`,
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
 * Kartın sağındaki hap: kumandada yapılacak İLK İŞİN adı (v4 · G1–G4).
 *
 * ── Hap neden "başlatmıyor" ─────────────────────────────────────────────────
 * "Başlat" kumandayı BEKLENİYOR hâlinde açıyor; işi başlatan oradaki "Kaydır
 * ve başlat". Tasarım da böyle diyor ve sebebi var: başlatmak `started_at`
 * yazıyor, yani sunucuya giden geri alınamaz bir iş. Listede yanlışlıkla
 * dokunulan bir hapın bunu yapması, günün sayacını yanlış dakikadan
 * başlatırdı. Hap bir kapı, kumanda ise o işin yapıldığı yer.
 *
 * ── Sıra (v4: "süren ya da beklemedeki iş, sonra açık adisyon, sonra
 *    sıradaki randevu") ───────────────────────────────────────────────────────
 * Süren işin dakikası akıyor; açık adisyonun parası BEKLİYOR ama bekleyen
 * müşteri kapıdan çıkmadan alınmalı — sıradakinin saati ondan sonra gelir.
 * "Tahsil et" kumandayı tahsilat adımında açıyor (K3); para orada, yöntem
 * seçilerek alınıyor — hap parayı kendisi ALMIYOR.
 *
 * `null`: üzerinde iş yapılacak satır yok (boş gün ya da günün sonu). Kart
 * bilgi olarak kalıyor, hapsız.
 */
export function soloPanelAction(
    running: Appt | null,
    next: Appt | null,
    ticket: FlowEvent | null = null,
): SoloPanelAction | null {
    // Süren iş ÖNCE: o anda yapılacak tek şey o.
    if (running) return { label: 'Kumandayı aç', tone: 'calm', appointmentId: running.id };
    if (ticket?.appointmentId) return { label: 'Tahsil et', tone: 'go', appointmentId: ticket.appointmentId };
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
        // Başlıkla aynı sayı: iptal kartı listede durur ama sayılmaz.
        const { total } = soloDayTotal(rows);
        return {
            rows,
            nowIndex: null,
            title: total > 0 ? `${total} randevu` : null,
        };
    }

    if (!state) return { rows: [], nowIndex: null, title: null };

    /*
     * Süren ya da beklemedeki iş: liste yalnız SIRADAKİLER — saati geçmiş
     * olsa da başlatılabilir olanlar (`soloStartable`). Eskiden yalnız saati
     * gelmemişlerdi ve bekleyen ya da geciken müşteri iş sürerken listeden
     * kayboluyordu.
     */
    if (state.runningAppointment) {
        const rows = soloStartable(all, nowMinutes)
            .filter((row) => row.id !== state.runningAppointment?.id);
        return {
            rows,
            nowIndex: null,
            title: `Sıradaki · ${rows.length} randevu`,
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

    /*
     * "Bugün · kapandı" yalnız gerçekten iş kalmadıysa. Personel durumu günü
     * son randevunun BİTİŞ saatine göre kapatıyor; bekleyen ya da payı
     * dolmamış geciken müşteri varken telefonda "KAPANDI" yazıyordu.
     */
    const title = state.kind === 'ended' && soloStartable(all, nowMinutes).length > 0
        ? `Bugün · ${all.length} randevu`
        : state.listTitle;
    return { rows, nowIndex, title };
}
