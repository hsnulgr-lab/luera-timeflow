import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { LiveActivity, LiveActivityFactory } from 'expo-widgets';

import { onTenantReset } from './tenantReset';
import {
    waitActivitiesToEnd, waitActivityProps, waitActivityStep, waitActivityUrl,
    type DayWait, type WaitActivityActor, type WaitActivityProps, type WaitActivityRecord,
} from './waitActivity.ts';

/**
 * Bekleme sayacının CİHAZ tarafı — Live Activity'yi başlat, güncelle, bitir.
 *
 * Kararlar `waitActivity.ts`te, görünüm `waitActivityView.tsx`te. Hiçbir hata
 * kullanıcıya düşmüyor: bekleme bitti bildirimi ve kumandanın halkası zaten
 * var; etkinlik açılamazsa (kullanıcı Ayarlar'dan kapattı, sistem reddetti)
 * yalnız `console.warn`.
 *
 * ── YALNIZ iOS ve yerel modül VARSA ────────────────────────────────────────
 * `expo-widgets` (`ExpoWidgets.native.js`) ve `@expo/ui`'nin değiştiricileri
 * modül YÜKLENİRKEN `requireNativeModule` çağırıyor: modül yoksa fırlatıyor.
 * Expo Go'da yok, Android derlemesinde de bu özellik için yok. O yüzden:
 *   1. bu dosya `expo-widgets`'ten yalnız TİP alıyor (`import type` — pakete
 *      girmiyor),
 *   2. önce `requireOptionalNativeModule` ile modülün varlığına bakılıyor
 *      (fırlatmıyor, yoksa `null`),
 *   3. varsa görünüm dosyası EŞZAMANLI `require` ile, try/catch içinde
 *      yükleniyor.
 * Dinamik `import()` YASAK: 2026-09-25'te mağaza paketini açılmaz yapmıştı.
 * Koşul tutmazsa her fonksiyon sessizce hiçbir şey yapmıyor.
 *
 * ── Hangi etkinlik hangi randevunun ────────────────────────────────────────
 * iOS etkinliğin props'unu geri vermiyor, yalnız kimliğini. Kayıt telefonda
 * (`AsyncStorage`, uygulama kapanıp açılınca da bilinsin); kaydı olmayan
 * etkinlik sahipsiz sayılıp bitiriliyor (`waitActivitiesToEnd`).
 */

/** iOS 16.2: ActivityKit'in içerik/bitiş API'sinin tabanı. Uygulamanın tabanı zaten 16.4. */
const MIN_IOS = 16.2;
const STORE_KEY = 'bekleme-sayaci.v1';

function loadFactory(): LiveActivityFactory<WaitActivityProps> | null {
    if (Platform.OS !== 'ios') return null;
    if (Number.parseFloat(String(Platform.Version)) < MIN_IOS) return null;
    try {
        if (!requireOptionalNativeModule('ExpoWidgets') || !requireOptionalNativeModule('ExpoUI')) return null;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const view = require('./waitActivityView') as { default: LiveActivityFactory<WaitActivityProps> };
        return view.default ?? null;
    } catch (cause) {
        console.warn('bekleme sayacı yüklenemedi', String(cause));
        return null;
    }
}

const factory = loadFactory();

/** Etkinlik bu telefonda kurulabiliyor mu (Expo Go, Android, eski iOS: hayır). */
export const waitActivitySupported = factory !== null;

let records: WaitActivityRecord[] = [];
let loaded = false;
/** İşler sırayla: aynı randevuya iki "başlat" yarışıp iki etkinlik açmasın. */
let queue: Promise<void> = Promise.resolve();

function enqueue(job: (f: LiveActivityFactory<WaitActivityProps>) => Promise<void>): Promise<void> {
    if (!factory) return Promise.resolve();
    const f = factory;
    queue = queue.then(async () => {
        try {
            await load();
            await job(f);
        } catch (cause) {
            console.warn('bekleme sayacı', String(cause));
        }
    });
    return queue;
}

async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        records = Array.isArray(parsed)
            ? parsed.filter((r): r is WaitActivityRecord => Boolean(r && typeof r.activityId === 'string'
                && typeof r.reservationId === 'string' && r.props && typeof r.props.endsAt === 'number'))
            : [];
    } catch {
        records = [];
    }
}

async function save(): Promise<void> {
    try {
        if (records.length === 0) await AsyncStorage.removeItem(STORE_KEY);
        else await AsyncStorage.setItem(STORE_KEY, JSON.stringify(records));
    } catch {
        // kayıt bir kolaylık: kaybolursa etkinlik sahipsiz sayılıp bitiriliyor
    }
}

/** Etkin etkinlikler; kaydı olup iOS'ta artık olmayanlar kayıttan düşüyor. */
function liveInstances(f: LiveActivityFactory<WaitActivityProps>): Map<string, LiveActivity<WaitActivityProps>> {
    const map = new Map<string, LiveActivity<WaitActivityProps>>();
    for (const instance of f.getInstances()) map.set(instance.getId(), instance);
    records = records.filter((record) => map.has(record.activityId));
    return map;
}

async function endIds(instances: Map<string, LiveActivity<WaitActivityProps>>, ids: readonly string[]): Promise<void> {
    for (const id of ids) {
        // `immediate`: kilit ekranından HEMEN kalksın — süresi geçmiş ya da
        // kaldırılmış bir sayaç orada asılı durmasın.
        await instances.get(id)?.end('immediate').catch((cause: unknown) => console.warn('bekleme sayacı bitirilemedi', String(cause)));
    }
    if (ids.length > 0) records = records.filter((record) => !ids.includes(record.activityId));
}

/**
 * Bekleme kuruldu ya da bitişi değişti (sunucunun saati benimsendi): randevu
 * başına TEK etkinlik — varsa güncelleniyor, yoksa başlatılıyor; süre
 * geçmişse bitiriliyor.
 */
export function startWaitActivity(input: {
    reservationId: string;
    /** Randevunun günü — dokununca kumanda o günün okumasıyla açılıyor. */
    dateISO: string;
    /** Dokununca dönülecek kabuk: personel ya da tek kişilik. */
    actor: WaitActivityActor;
    customerName: string;
    service: string;
    endsAt: number;
    minutes: number;
}): Promise<void> {
    return enqueue(async (f) => {
        const instances = liveInstances(f);
        const props = waitActivityProps(input);
        const current = records.find((record) => record.reservationId === input.reservationId) ?? null;
        const step = waitActivityStep(current, props, Date.now());
        if (step === 'end' && current) {
            await endIds(instances, [current.activityId]);
        } else if (step === 'start') {
            const instance = f.start(props, waitActivityUrl(input.reservationId, input.dateISO, input.actor), new Date(props.endsAt));
            records.push({ activityId: instance.getId(), reservationId: input.reservationId, props });
        } else if (step === 'update' && current) {
            await instances.get(current.activityId)?.update(props, new Date(props.endsAt));
            current.props = props;
        }
        await save();
    });
}

/** Aynı kapı: güncelleme de randevu başına tek etkinliğe gidiyor. */
export const updateWaitActivity = startWaitActivity;

/** Bekleme kaldırıldı ya da iş bitti. */
export function endWaitActivity(reservationId: string): Promise<void> {
    return enqueue(async (f) => {
        const instances = liveInstances(f);
        const ids = records.filter((record) => record.reservationId === reservationId).map((record) => record.activityId);
        await endIds(instances, ids);
        await save();
    });
}

/** Kiracı sınırı: çıkış, işletme değişimi, hesap silme — hepsi gidiyor, kayıt da. */
export function endAllWaitActivities(): Promise<void> {
    return enqueue(async (f) => {
        const instances = liveInstances(f);
        await endIds(instances, [...instances.keys()]);
        records = [];
        await save();
    });
}

/**
 * Mutabakat. `waits` günün OKUNMUŞ beklemeleri (yalnız `ok` okuma, bugün);
 * `null` = liste yok — yalnız sahipsiz ve süresi geçmiş olanlar bitiyor.
 */
export function reconcileWaitActivities(waits: readonly DayWait[] | null): Promise<void> {
    return enqueue(async (f) => {
        const instances = liveInstances(f);
        await endIds(instances, waitActivitiesToEnd([...instances.keys()], records, waits, Date.now()));
        await save();
    });
}

if (factory) {
    // Öne dönüş: süresi dolmuş sayaç kilit ekranında 0:00'da asılı kalmasın.
    AppState.addEventListener('change', (next) => {
        if (next === 'active') void reconcileWaitActivities(null);
    });
    void reconcileWaitActivities(null);
}

// Kiracı sınırı: önceki salonun müşteri adı kilit ekranında kalmasın.
onTenantReset(() => { void endAllWaitActivities(); });
