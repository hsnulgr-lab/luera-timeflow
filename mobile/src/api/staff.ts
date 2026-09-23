import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { VisitFormula } from '../lib/formula';
import {
    backoffMs, fateOf, shouldRetry, QUEUE_LIMIT,
} from '../lib/retry';
import { mergeFailures, type WriteFailure } from '../lib/writeFailure';

// staff-api istemcisi.
//
// Personel cihazında Supabase oturumu YOKTUR. Elindeki tek şey iki token:
//   cihaz token'ı  — org sahibi kurulumda bir kez verir, 90 gün
//   personel token'ı — PIN girişinden sonra, 12 saat
// Sunucu her istekte kimliği kendi çözer; gövdeden gelen kimliğe güvenilmez.
//
// ÇEVRİMDIŞI: salonun bodrumunda sinyal yok. Yazma istekleri düşerse veri
// KAYBOLMAZ — yerel kuyruğa alınır, bağlantı gelince sırayla gönderilir.
// Her isteğin bir idempotency anahtarı var; tekrar gönderim çift kayıt
// oluşturmaz (sunucu tarafında visit.finish zaten idempotent).

const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ENDPOINT = `${BASE}/functions/v1/staff-api`;

const K_DEVICE = 'tf.device.token';
const K_STAFF = 'tf.staff.token';
const K_QUEUE = 'tf.queue';
/** Kalıcı olarak reddedilip ATILAN işler — kullanıcıya söylenene kadar durur. */
const K_FAILED = 'tf.queue.failed';

export interface StaffMe { id: string; name: string; color: string | null; role: string }

export interface Appointment {
    id: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    date: string;
    start_time: string;
    end_time: string;
    service: string;
    service_color: string | null;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    staff_id: string | null;
    notes: string | null;
    /**
     * Müşteri SALONA GELDİ. `arrived_at` ile karıştırılmamalı: o, hizmetin
     * başladığı an. Kartın "kapıda" hâli yalnız bu alandan çıkar.
     */
    customer_arrived_at: string | null;
    arrived_at: string | null;
    service_ended_at: string | null;
    adisyon_items: AdisyonItem[] | null;
    is_paid: boolean;
    /**
     * Ziyaretin renk formülü. Sunucu (`RES_COLS`) bunu HER okumada
     * gönderiyordu ama tip bilmiyordu: kumanda formülü kendi yerel
     * durumunda tutup randevudan hiç okumuyordu.
     */
    formula: VisitFormula | null;
    /**
     * Sürüm damgası — `visit.items` iyimser kilidinin dayanağı (092).
     * İstemci en son gördüğü damgayı `expectedUpdatedAt` olarak geri
     * gönderdiğinde, arada başkası yazmışsa yazma reddediliyor.
     */
    updated_at: string | null;
}

/**
 * Takvimdeki bir blok. `Appointment`'ın DAR hâli, ayrı bir tip olması
 * bilinçli: burada telefon, not, adisyon ve tahsilat YOK — sunucu da
 * döndürmüyor. Aynı tipi paylaşsalardı, bir gün biri bu veriyle yazma ucu
 * çağırır ve eksik alanları boş sanırdı.
 */
export interface CalendarBlock {
    id: string;
    customer_name: string;
    date: string;
    start_time: string;
    end_time: string;
    service: string;
    service_color: string | null;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    staff_id: string | null;
    arrived_at: string | null;
    service_ended_at: string | null;
    /** Bu randevu BENİM mi? Kumandayı yalnız kendi randevusu açar. */
    mine: boolean;
}

/**
 * Defter listesindeki bir müşteri. `phoneTail` yalnız ARAMA için —
 * numaranın kendisi listede dönmüyor, kartta dönüyor.
 */
export interface BookRow {
    id: string;
    name: string;
    lastVisitDate: string | null;
    lastService: string | null;
    hasFormula: boolean;
    mine: boolean;
    lastStaffInitials: string;
    phoneTail: string;
}

/**
 * Telefonun GÖNDERDİĞİ kalem — okuduğundan DAR.
 *
 * Sunucu adı ve fiyatı kendi kataloğundan çözüyor; istemciden yalnız katalog
 * kimliği ve miktar alıyor. Tipi `AdisyonItem`la aynı tutmak, gönderilmeyen
 * (ve gönderilse bile yok sayılan) alanları zorunlu kılardı.
 */
export interface AdisyonItemRequest {
    kind: 'product' | 'material' | 'extra';
    productId?: string;
    serviceId?: string;
    qty: number;
}

export interface AdisyonItem {
    id: string;
    name: string;
    price: number;
    kind: 'product' | 'material' | 'extra';
    productId?: string;
    serviceId?: string;
    qty?: number;
}

/**
 * Sunucunun hayırı.
 *
 * Gövde de TAŞINIYOR. Eskiden yalnız `code` ve `status` alınıyordu; oysa
 * sunucu "kaç hakkın kaldı" (`remaining`), "kaç dakika kilitli" (`minutes`)
 * ve "ne zamana kadar" (`until`) bilgisini gönderiyor. Onları atmak,
 * yazılmış "3 hakkınız kaldı" ekranını ölü koda çeviriyordu.
 */
export class ApiError extends Error {
    constructor(
        public code: string,
        public status: number,
        public body: Record<string, unknown> = {},
    ) {
        super(code);
    }

    get remaining(): number | null {
        return typeof this.body.remaining === 'number' ? this.body.remaining : null;
    }

    get minutes(): number | null {
        return typeof this.body.minutes === 'number' ? this.body.minutes : null;
    }

    get until(): string | null {
        return typeof this.body.until === 'string' ? this.body.until : null;
    }
}

/**
 * Bir isteğin en fazla bekleyeceği süre.
 *
 * Zaman aşımı OLMADAN, zayıf sinyalde istek ne kuyruğa giriyor ne hata
 * veriyordu: ekran sonsuza kadar "gönderiliyor" diyordu. 15 saniye, kötü
 * bağlantıda geçen ama umutsuz olmayan bir istek için üst sınır.
 */
const REQUEST_TIMEOUT_MS = 15_000;

async function raw(action: string, body: Record<string, unknown> = {}, token?: string | null) {
    // `AbortSignal.timeout()` KULLANILMIYOR: React Native `AbortSignal`i
    // `abort-controller` paketiyle polyfill ediyor (Libraries/Core/setUpXHR)
    // ve o pakette bu statik metot YOK. Çağırmak telefonda her istekte
    // "AbortSignal.timeout is not a function" demekti — tarayıcıda ve
    // Node'da çalıştığı için kolayca gözden kaçar.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'x-staff-token': token } : {}),
            },
            body: JSON.stringify({ action, ...body }),
            // Zaman aşımı bir AĞ hatası gibi düşüyor (`ApiError` değil) ve bu
            // doğru: sunucuya ulaşılamadı, iş kuyruğa girmeli.
            signal: controller.signal,
        });
    } finally {
        // İstek bittiğinde sayaç mutlaka söner; yoksa 15 saniye boyunca
        // sönmeyen bir zamanlayıcı her istek için birikirdi.
        clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(
            String(data?.error ?? 'server_error'),
            res.status,
            (data && typeof data === 'object') ? data as Record<string, unknown> : {},
        );
    }
    return data;
}

/**
 * Token'lar Keychain'de (SecureStore), AsyncStorage'da DEĞİL.
 *
 * İkisi de "cihazda saklama" ama aynı şey değil: AsyncStorage düz metin bir
 * dosyadır. Cihaz token'ı 90 gün geçerli bir taşıyıcı belgedir — onu düz metin
 * tutmak, yedeği ya da dosya sistemini okuyabilen birine salonun personel
 * listesini ve PIN deneme hakkını vermek olurdu.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: telefon kilitliyken okunamaz ve YEDEKLE
 * BAŞKA CİHAZA GEÇMEZ. Eski telefonun yedeğinden kurulan yeni bir telefon,
 * eşleşmeyi devralmamalı; yeniden kod istemeli.
 */
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function readSecure(key: string): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(key, secureOptions);
    } catch {
        return null;
    }
}

export const tokens = {
    device: () => readSecure(K_DEVICE),
    staff: () => readSecure(K_STAFF),
    setDevice: (t: string) => SecureStore.setItemAsync(K_DEVICE, t, secureOptions),
    setStaff: (t: string) => SecureStore.setItemAsync(K_STAFF, t, secureOptions),
    /** Çıkış: personel oturumu düşer, CİHAZ EŞLEŞMESİ KALIR. Aksi hâlde her
     *  vardiya değişiminde org sahibinin gelip cihazı yeniden eşlemesi
     *  gerekirdi. */
    clearStaff: () => SecureStore.deleteItemAsync(K_STAFF, secureOptions),
    /**
     * Telefonu işletmeden çıkarır: yeniden bağlamak için yeni kod gerekir.
     *
     * YALNIZ "Bu telefonu işletmeden çıkar" çağırır (099). Oturumu kapatmak
     * bunu ÇAĞIRMAZ: personel çıkınca telefon bağlı kalır, sonraki girişte
     * yalnız şifre sorulur — müdür kararı.
     */
    clearDevice: () => SecureStore.deleteItemAsync(K_DEVICE, secureOptions),
};

/** Kimlik gerektirmeyen çağrılar (giriş akışı). */
export const auth = {
    /** Eşleştirme kodunu cihaz token'ına çevirir (091 + device.code.redeem). */
    redeem: (code: string) => raw('device.code.redeem', { code }),
    roster: (deviceToken: string) => raw('roster', {}, deviceToken),
    start: (deviceToken: string, staffId: string, pin: string) =>
        raw('session.start', { staffId, pin }, deviceToken),
    /** Şifresi olmayan personel İLK şifresini belirler ve girer (099). */
    pinSetup: (deviceToken: string, staffId: string, pin: string) =>
        raw('pin.setup', { staffId, pin }, deviceToken),
    /**
     * Kapalı kapının bilgisi (Apple Eşiği · C): salonun adı, erişimin bittiği
     * an, açık mı. Sunucuda abonelik kapısından ÖNCE — kapı kapalıyken de
     * cevap veriyor. Personel ya da cihaz token'ı kabul ediyor.
     */
    access: (token: string) => raw('access', {}, token),
};

/** Kimlikli çağrı: personel token'ı ile. */
async function call(action: string, body: Record<string, unknown> = {}) {
    const t = await tokens.staff();
    if (!t) throw new ApiError('no_session', 401);
    return raw(action, body, t);
}

export const api = {
    me: () => call('me'),
    /**
     * ZİL JETONU (100) — "salonda bir şey değişti" kanalının anahtarı.
     *
     * Jeton VERİYE AÇILMIYOR: rolü `staff_rt` ve o rolün hiçbir tabloda
     * yetkisi yok. Telefon zili duyunca veriyi yine buradan, personel
     * token'ıyla çekiyor.
     *
     * Sunucuda sır tanımlı değilse 503 `realtime_unavailable` dönüyor ve
     * telefon sessizce yoklamaya devam ediyor — zil bir hızlandırıcı, uygulama
     * onsuz da çalışır.
     */
    realtimeToken: () => call('realtime.token'),
    /**
     * BİLDİRİM JETONU (103) — bu cihazı personelin aboneliğine bağlar.
     *
     * `write()` DEĞİL `call()`: çevrimdışı kuyruğa giren bir kayıt saatler
     * sonra boşalırsa, o arada ÇIKIŞ YAPMIŞ personelin jetonunu diriltir ve
     * bildirimler yanlış kişiye gider. Kayıt zaten kendi kendini iyileştiriyor
     * — başarısız olursa bir sonraki öne dönüşte yeniden deneniyor.
     *
     * Kimlik gövdeden gitmiyor: sunucu `staff_id`yi token'dan çözüyor.
     */
    pushRegister: (token: string, platform: 'ios' | 'android', deviceId: string) =>
        call('push.register', { token, platform, deviceId }),
    /**
     * Aboneliği koparır. PERSONEL token'ı yoksa CİHAZ token'ıyla deneniyor:
     * çıkışta personel token'ı siliniyor ve bekleyen bir silme işi ancak böyle
     * tamamlanabiliyor. Ortak telefonda ayrılan personelin bildirimlerinin
     * yenisinin elinde çalması, kabul edilebilir bir sonuç değil.
     */
    pushUnregister: async (deviceId: string) => {
        const t = (await tokens.staff()) ?? (await tokens.device());
        if (!t) throw new ApiError('no_session', 401);
        return raw('push.unregister', { deviceId }, t);
    },
    /** Kendi şifresini değiştirir; cevap YENİ kuşakla basılmış token taşır (099). */
    pinChange: (currentPin: string, pin: string) => call('pin.change', { currentPin, pin }),
    /**
     * Personel token'ını tazeler.
     *
     * DOLMADAN ÖNCE çağrılmalı: `session.refresh` ucu da geçerli bir token
     * istiyor (sunucuda kimlik doğrulamasından SONRA geliyor), yani süresi
     * dolmuş bir token kendini yenileyemez. Token 12 saat yaşıyor; uygulama
     * öne her dönüşünde saatte bir tazeleniyor (`backgroundSync`).
     *
     * Yenilenemezse personel token'ı SİLİNİYOR ve kullanıcı PIN ekranına
     * düşüyor. Cihaz eşleşmesi ayrı bir belge ve duruyor — aksi hâlde
     * vardiya başında işletme sahibinin gelip telefonu yeniden eşlemesi
     * gerekirdi.
     */
    refresh: async (): Promise<boolean> => {
        try {
            const data = await call('session.refresh');
            const fresh = (data as { token?: unknown })?.token;
            if (typeof fresh === 'string' && fresh) {
                await tokens.setStaff(fresh);
                return true;
            }
            return false;
        } catch (e) {
            if (e instanceof ApiError && e.status === 401) await tokens.clearStaff();
            return false;
        }
    },
    agenda: (date?: string) => call('agenda', date ? { date } : {}),
    /** Salonun günü — okuma amaçlı. Personel bakar, dokunmaz. */
    calendar: (date?: string) => call('calendar', date ? { date } : {}),
    /** Müşteri defterinin listesi — salonun tamamı, dar kolonlar. */
    customers: () => call('customers'),
    catalog: () => call('catalog'),
    customer: (customerId: string) => call('customer', { customerId }),
    /**
     * Kendi vardiyası ve izinleri.
     *
     * Kadronun DEĞİL: uç yalnız token'ın sahibini okuyor. Başkasının izin
     * takvimi personelin bilmesi gereken bir şey değil.
     */
    shift: () => call('shift'),
    performance: () => call('performance'),
    // Yazma uçları kuyruğa düşebilir — aşağıya bakın.
    visitStart: (reservationId: string) => write('visit.start', { reservationId }),
    /**
     * Adisyonun kalemleri.
     *
     * `expected` son GÖRÜLEN `updated_at`. Sunucu yazmayı ona bağlıyor
     * (`.eq('updated_at', expected)`); arada başka bir cihaz yazmışsa
     * `409 items_stale` dönüyor ve GÜNCEL listeyi veriyor. Bu alan
     * gönderilmezse kilit hiç kurulmuyor ve son yazan kazanıyor — masaüstüyle
     * telefon aynı adisyonda çalışırken biri ötekinin kalemini yok ederdi.
     */
    // Alan adı SUNUCUNUN okuduğu ad: `expectedUpdatedAt`. `null` göndermek
    // göndermemekle aynı: sunucu dizge olmayanı kilitsiz sayıyor.
    visitItems: (reservationId: string, items: AdisyonItemRequest[], expected?: string | null) =>
        write('visit.items', { reservationId, items, expectedUpdatedAt: expected ?? null }),
    visitFinish: (reservationId: string) => write('visit.finish', { reservationId }),
    /**
     * Randevunun serbest notu — müşteri görmez. Aynı sütunu masaüstü ve
     * müdür telefonu da yazıyor (`reservations.notes`), üçü de TAM
     * DEĞİŞTİRİR, ekleme yapmaz — kaydeden son kazanır. İkinci bir "kumanda
     * notu" sütunu açılmadı: aynı gerçeğin iki kaydı olurdu.
     */
    visitNote: (reservationId: string, note: string) => write('visit.note', { reservationId, note }),
    /**
     * Ziyaretin formülü. Malzeme yarısı SUNUCUDA adisyondan türüyor — burada
     * gönderilmiyor, çünkü istemcinin listesine güvenmek adisyonla formülün
     * ayrışması demek.
     */
    visitFormula: (reservationId: string, patch: {
        ratio?: string | null;
        waitMinutes?: number | null;
        waitSource?: 'timer' | 'manual';
        result?: string | null;
        /**
         * Sonucun ikinci ekseni (`formula.TONES`). Ekran bunu üretiyordu ve
         * sunucu 092'den beri kabul ediyor, ama BURADA yoktu: istek gövdesine
         * hiç girmiyordu. Uç bağlandığında personelin seçtiği etiket sessizce
         * kaybolacaktı.
         */
        tags?: string[];
        note?: string | null;
    }) => write('visit.formula', { reservationId, ...patch }),
};

// ── Çevrimdışı kuyruk ───────────────────────────────────────────────────────

interface QueuedJob {
    key: string;
    action: string;
    body: Record<string, unknown>;
    at: number;
    /** Kaç kez denendi. Üssel beklemenin ve pes etmenin girdisi. */
    attempts: number;
    /** Bu zamandan önce yeniden denenmiyor (üssel bekleme). */
    nextAt: number;
    /** Son hatanın kodu — "gönderilemedi" listesinde gösterilecek. */
    lastError?: string;
}

async function readQueue(): Promise<QueuedJob[]> {
    try {
        const list = JSON.parse((await AsyncStorage.getItem(K_QUEUE)) || '[]');
        if (!Array.isArray(list)) return [];
        // Eski sürümden kalan işlerde sayaçlar yok; okurken tamamlanıyorlar.
        return list.map((job: QueuedJob) => ({
            ...job,
            attempts: typeof job.attempts === 'number' ? job.attempts : 0,
            nextAt: typeof job.nextAt === 'number' ? job.nextAt : 0,
        }));
    } catch {
        return [];
    }
}

async function writeQueue(queue: QueuedJob[]) {
    await AsyncStorage.setItem(K_QUEUE, JSON.stringify(queue));
}

/**
 * Kuyruk yazımı TEK SIRADA.
 *
 * Oku-değiştir-yaz üç ayrı `await`; iki `write()` aynı anda çalışırsa ikincisi
 * birincinin eklediği işi görmeden yazıyor ve o iş KAYBOLUYORDU. Kilit yerine
 * söz zinciri: her iş bir öncekinin bitmesini bekliyor.
 */
let queueChain: Promise<unknown> = Promise.resolve();

function inQueueOrder<T>(work: () => Promise<T>): Promise<T> {
    const next = queueChain.then(work, work);
    // Zincir HATAYLA kırılmamalı: bir iş patlarsa sonrakiler yine sıraya girer.
    queueChain = next.then(() => undefined, () => undefined);
    return next;
}

/** Kuyruğa alınamayan iş oldu mu — kullanıcıya söylenecek. */
export interface QueueOutcome {
    queued: boolean;
    /** Kuyruk doldu ve iş HİÇ alınamadı. Sessiz kırpma yapılmıyor. */
    overflow?: boolean;
}

async function enqueue(job: QueuedJob): Promise<QueueOutcome> {
    return inQueueOrder(async () => {
        const queue = await readQueue();
        // Sınır aşıldığında ESKİLERİ ATMIYORUZ: eski iş, yenisinden daha az
        // değerli değil ve sessizce kırpmak veri kaybının ta kendisi.
        // Yenisi alınmıyor ve çağıran bunu öğreniyor.
        if (queue.length >= QUEUE_LIMIT) return { queued: false, overflow: true };
        queue.push(job);
        await writeQueue(queue);
        return { queued: true };
    });
}

/**
 * Yazma isteği.
 *
 * KADER `retry.fateOf` ile veriliyor. Eski kural "sunucu konuştuysa kuyruğa
 * girme" idi; 403 için doğru ama 500 de sunucunun konuşmasıdır ve o tekrar
 * denenmeli. O kuralla sunucunun bir dakikalık aksaması, personelin yazdığı
 * adisyonu kaybettiriyordu.
 */
async function write(action: string, body: Record<string, unknown>) {
    const key = `${action}:${body.reservationId}:${Date.now()}`;
    try {
        return await call(action, { ...body, idempotencyKey: key });
    } catch (e) {
        const status = e instanceof ApiError ? e.status : null;
        if (fateOf({ status }) === 'permanent') throw e;
        const outcome = await enqueue({
            key,
            action,
            body,
            at: Date.now(),
            attempts: 0,
            nextAt: 0,
            ...(e instanceof ApiError ? { lastError: e.code } : {}),
        });
        return { ok: false, ...outcome };
    }
}

/** `flushQueue` sonucunda kullanıcıya söylenecek olanlar. */
export interface FlushResult {
    sent: number;
    left: number;
    /**
     * Kalıcı olarak başarısız olup ATILAN işler. Sessizce kaybolmuyorlar:
     * aynı liste diske de yazılıyor (`readFailures`), çünkü bu sonucu okuyan
     * tek yer arka plan turu ve o sırada ekranda kimse olmayabilir.
     */
    dropped: { key: string; action: string; error: string; reservationId: string | null }[];
}

/** Kuyruk işinin hangi ziyarete ait olduğu — yazma gövdelerinin ortak alanı. */
function reservationOf(body: Record<string, unknown>): string | null {
    return typeof body.reservationId === 'string' ? body.reservationId : null;
}

/**
 * Kuyruğu boşaltır. Bağlantı gelince ve uygulama öne dönünce çağrılıyor.
 *
 * ESKİ HÂLİ VERİ KAYBEDİYORDU: her `ApiError`ü kalıcı sayıp işi siliyordu,
 * yani sunucudan 500 alan bir adisyon kuyruktan atılıyordu. Artık yalnız
 * KALICI hata atıyor ve atılan iş sessizce kaybolmuyor — çağırana bildiriliyor.
 */
export async function flushQueue(): Promise<FlushResult> {
    return inQueueOrder(async () => {
        const queue = await readQueue();
        const dropped: FlushResult['dropped'] = [];
        const now = Date.now();
        let sent = 0;

        /*
         * OTURUM YOKSA KUYRUĞA HİÇ DOKUNULMUYOR.
         *
         * `call()` token olmadan `no_session` (401) fırlatıyor ve `fateOf`
         * 401'i KALICI sayıyor. Yani token ölmüşken bir tur, kuyruğu
         * boşaltmıyor SİLİYORDU — hem de topluca. Token da kolayca ölüyor:
         * `api.refresh` 401 alınca onu kendisi temizliyor ve `syncNow`
         * hemen ardından buraya giriyor.
         *
         * İşler duruyor. Personel PIN'iyle geri girince kuyruk olduğu gibi
         * orada ve bir sonraki turda gidiyor.
         */
        if (queue.length > 0 && !(await tokens.staff())) {
            return { sent: 0, left: queue.length, dropped: [] };
        }

        while (queue.length > 0) {
            const job = queue[0];
            // Üssel bekleme dolmadıysa sıra BEKLİYOR: sıradaki iş de aynı
            // sunucuya gidecek, atlayıp denemek onu da yakmak olurdu.
            if (job.nextAt > now) break;

            try {
                await call(job.action, { ...job.body, idempotencyKey: job.key });
                queue.shift();
                sent++;
                continue;
            } catch (e) {
                const status = e instanceof ApiError ? e.status : null;
                const code = e instanceof ApiError ? e.code : 'network';

                if (fateOf({ status }) === 'permanent') {
                    queue.shift();
                    dropped.push({ key: job.key, action: job.action, error: code, reservationId: reservationOf(job.body) });
                    continue;
                }

                job.attempts += 1;
                job.lastError = code;
                if (!shouldRetry(job.attempts)) {
                    queue.shift();
                    dropped.push({ key: job.key, action: job.action, error: code, reservationId: reservationOf(job.body) });
                    continue;
                }
                job.nextAt = now + backoffMs(job.attempts, Math.random());
                // Ağ hâlâ yoksa sıradakini denemenin anlamı yok.
                break;
            }
        }

        await writeQueue(queue);
        // Kayıp DİSKE yazılıyor: çağıran okumasa bile duruyor, ve uygulama
        // kapanıp açılınca hâlâ orada.
        if (dropped.length > 0) {
            const failures: WriteFailure[] = dropped.map((job) => ({
                key: job.key,
                action: job.action,
                error: job.error,
                at: Date.now(),
                reservationId: job.reservationId,
            }));
            const merged = mergeFailures(await readFailures(), failures);
            await AsyncStorage.setItem(K_FAILED, JSON.stringify(merged));
        }
        return { sent, left: queue.length, dropped };
    });
}

export async function queueLength(): Promise<number> {
    return (await readQueue()).length;
}

// ── Gönderilemeyenler ───────────────────────────────────────────────────────
//
// Atılan iş SESSİZCE kaybolmuyordu — `flushQueue` onu `dropped` ile
// bildiriyordu. Ama tek çağıran o listeyi hiç okumuyordu, yani pratikte
// kayboluyordu. Liste artık DİSKTE: kayıp, personel ekranı açana kadar
// beklemek zorunda ve uygulama kapanınca unutulmamalı.

export async function readFailures(): Promise<WriteFailure[]> {
    try {
        const raw = await AsyncStorage.getItem(K_FAILED);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list as WriteFailure[] : [];
    } catch {
        return [];
    }
}

/** Kullanıcı gördü ve kabul etti. */
export async function clearFailures(): Promise<void> {
    await AsyncStorage.removeItem(K_FAILED);
}
