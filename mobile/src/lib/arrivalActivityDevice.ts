import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo';
import type { LiveActivity, LiveActivityFactory, PushToStartTokenEvent, PushTokenEvent } from 'expo-widgets';

import { api } from '../api/staff';
import { onTenantReset } from './tenantReset';
import { deviceIdOnce } from './pushDevice.ts';
import {
    apnsEnvironmentOf, arrivalActivityUrl, planArrivalActivities, shouldRegisterStart, waitingOf,
    type ArrivalActivityProps, type ArrivalRecord, type ArrivalRow, type StartRegistration, type Waiting,
} from './arrivalActivity.ts';

/**
 * "MÜŞTERİ BEKLİYOR"un CİHAZ tarafı — jetonları sunucuya yaz, uzaktan açılan
 * etkinliği randevusuyla eşle, iş başlayınca / kalkınca bitir (göç 144).
 *
 * Kararlar `arrivalActivity.ts`te, görünüm `arrivalActivityView.tsx`te.
 * Hiçbir hata kullanıcıya düşmüyor: etkinlik olmasa da "Müşterin geldi"
 * bildirimi gidiyor (sunucu, etkinliği açamadığı cihaza onu gönderiyor).
 *
 * ── YALNIZ iOS, yerel modül VARSA ve PERSONEL kabuğunda ────────────────────
 * Bekleme sayacıyla (`waitActivityDevice.ts`) aynı kapı: `expo-widgets` ve
 * `@expo/ui` yalnız TİP olarak içe aktarılıyor; modülün varlığı
 * `requireOptionalNativeModule` ile soruluyor, varsa görünüm dosyası
 * EŞZAMANLI `require` ile try/catch içinde yükleniyor. Dinamik `import()`
 * YASAK (2026-09-25 mağaza paketi dersi). Expo Go, Android ve eski iOS'ta her
 * fonksiyon sessizce boş döner. Başlatma jetonu iOS 17.2+'da geliyor;
 * altında hiç gelmez ve sunucu o telefona bildirim göndermeye devam eder.
 *
 * Tek kişilik kabuk bu dosyanın hiçbir işini çağırmıyor (resepsiyon ile
 * personel aynı kişi); jeton yalnız personel oturumunda yazılıyor.
 */

/** iOS 16.2: ActivityKit'in içerik/bitiş API'si. Uzaktan başlatma 17.2'de — onu iOS kendisi ayırıyor. */
const MIN_IOS = 16.2;
const STORE_KEY = 'musteri-bekliyor.v1';
const START_KEY = 'musteri-bekliyor.start.v1';
/** Uzaktan başlatmayla aynı bayatlama (sunucu `STALE_AFTER_MS`). */
const STALE_AFTER_MS = 45 * 60 * 1000;

interface ViewModule {
    default: LiveActivityFactory<ArrivalActivityProps>;
    addPushToStartTokenListener: (listener: (event: PushToStartTokenEvent) => void) => EventSubscription;
}

function loadView(): ViewModule | null {
    if (Platform.OS !== 'ios') return null;
    if (Number.parseFloat(String(Platform.Version)) < MIN_IOS) return null;
    try {
        if (!requireOptionalNativeModule('ExpoWidgets') || !requireOptionalNativeModule('ExpoUI')) return null;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const view = require('./arrivalActivityView') as ViewModule;
        return view.default ? view : null;
    } catch (cause) {
        console.warn('müşteri bekliyor yüklenemedi', String(cause));
        return null;
    }
}

const view = loadView();
const factory = view?.default ?? null;

/** Etkinlik bu telefonda açılabiliyor mu (Expo Go, Android, eski iOS: hayır). */
export const arrivalActivitySupported = factory !== null;

const environment = apnsEnvironmentOf(typeof __DEV__ !== 'undefined' && __DEV__);

let records: ArrivalRecord[] = [];
let loaded = false;
/** En son gelen başlatma jetonu (bellekte; sunucuya yazılanın izi depoda). */
let startToken: string | null = null;
/** Eşlenmeden gelen güncelleme jetonları — eşlenince yazılıyor. */
const pendingTokens = new Map<string, string>();
/** Jeton dinleyicisi kurulmuş etkinlikler. */
const listening = new Map<string, EventSubscription>();
let queue: Promise<void> = Promise.resolve();

function enqueue(job: (f: LiveActivityFactory<ArrivalActivityProps>) => Promise<void>): Promise<void> {
    if (!factory) return Promise.resolve();
    const f = factory;
    queue = queue.then(async () => {
        try {
            await load();
            await job(f);
        } catch (cause) {
            console.warn('müşteri bekliyor', String(cause));
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
            ? parsed.filter((r): r is ArrivalRecord => Boolean(r && typeof r.activityId === 'string'
                && typeof r.reservationId === 'string' && typeof r.arrivedAt === 'number'))
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
        // kayıt bir kolaylık: kaybolursa etkinlik bilinmeyen sayılıp yeniden eşleniyor
    }
}

/** Güncelleme jetonunu randevusuyla sunucuya yaz. Başarısızsa bir sonraki mutabakatta yeniden. */
async function registerUpdate(record: ArrivalRecord, token: string): Promise<void> {
    if (record.token === token) return;
    try {
        await api.laRegister({
            kind: 'update', token, deviceId: await deviceIdOnce(), environment,
            reservationId: record.reservationId, activityId: record.activityId,
        });
        record.token = token;
        await save();
    } catch (cause) {
        console.warn('müşteri bekliyor: etkinlik jetonu yazılamadı', String(cause));
    }
}

function onUpdateToken(event: PushTokenEvent): void {
    void enqueue(async () => {
        const record = records.find((r) => r.activityId === event.activityId);
        if (record) await registerUpdate(record, event.pushToken);
        else pendingTokens.set(event.activityId, event.pushToken);
    });
}

/** Etkin etkinlikler; her birine jeton dinleyicisi (bir kez). Kaydı olup artık olmayanlar düşüyor. */
function liveInstances(f: LiveActivityFactory<ArrivalActivityProps>): Map<string, LiveActivity<ArrivalActivityProps>> {
    const map = new Map<string, LiveActivity<ArrivalActivityProps>>();
    for (const instance of f.getInstances()) {
        const id = instance.getId();
        map.set(id, instance);
        if (!listening.has(id)) listening.set(id, instance.addPushTokenListener(onUpdateToken));
    }
    for (const [id, sub] of listening) {
        if (!map.has(id)) { sub.remove(); listening.delete(id); }
    }
    records = records.filter((record) => map.has(record.activityId));
    return map;
}

async function endIds(instances: Map<string, LiveActivity<ArrivalActivityProps>>, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const deviceId = await deviceIdOnce();
    for (const id of ids) {
        await instances.get(id)?.end('immediate').catch((cause: unknown) => console.warn('müşteri bekliyor bitirilemedi', String(cause)));
        // Sunucudaki jetonu da: artık işe yaramaz. Düşerse 12 saatlik süre siliyor.
        if (records.some((r) => r.activityId === id && r.token)) {
            void api.laUnregister(deviceId, id).catch(() => undefined);
        }
        pendingTokens.delete(id);
    }
    records = records.filter((record) => !ids.includes(record.activityId));
}

/** Eşlenmiş her etkinliğin jetonu sunucuda mı — değilse sor ve yaz. */
async function ensureTokens(instances: Map<string, LiveActivity<ArrivalActivityProps>>): Promise<void> {
    for (const record of records) {
        if (record.token) continue;
        const token = pendingTokens.get(record.activityId)
            ?? await instances.get(record.activityId)?.getPushToken().catch(() => null)
            ?? null;
        if (token) {
            pendingTokens.delete(record.activityId);
            await registerUpdate(record, token);
        }
    }
}

function start(f: LiveActivityFactory<ArrivalActivityProps>, waiting: Waiting): void {
    const instance = f.start(
        waiting.props,
        arrivalActivityUrl(waiting.reservationId, waiting.dateISO),
        new Date(waiting.props.arrivedAt + STALE_AFTER_MS),
    );
    const id = instance.getId();
    if (!listening.has(id)) listening.set(id, instance.addPushTokenListener(onUpdateToken));
    records.push({ activityId: id, reservationId: waiting.reservationId, arrivedAt: waiting.props.arrivedAt });
}

/**
 * MUTABAKAT. `rows` günün OKUNMUŞ listesi (yalnız `ok` okuma, bugün) ve
 * `myStaffId`; ikisi de yoksa liste yok sayılıyor — yalnız iki saati geçmiş
 * kayıtlar bitiyor, uzaktan yeni açılmış etkinliğe dokunulmuyor.
 */
export function reconcileArrivalActivities(rows: readonly ArrivalRow[] | null, myStaffId: string | null): Promise<void> {
    return enqueue(async (f) => {
        const instances = liveInstances(f);
        const now = Date.now();
        const waiting = rows && myStaffId ? waitingOf(rows, myStaffId, now) : null;
        const plan = planArrivalActivities([...instances.keys()], records, waiting, now);
        await endIds(instances, plan.end);
        for (const { activityId, waiting: w } of plan.adopt) {
            // İçerik o müşteriyle yeniden yazılıyor: yanlış ad asla görünmesin.
            await instances.get(activityId)?.update(w.props, new Date(w.props.arrivedAt + STALE_AFTER_MS));
            records.push({ activityId, reservationId: w.reservationId, arrivedAt: w.props.arrivedAt });
        }
        for (const w of plan.start) start(f, w);
        await save();
        await ensureTokens(liveInstances(f));
    });
}

/** Personel işi başlattı (kumanda) — o randevunun etkinliği hemen kalksın. */
export function endArrivalActivity(reservationId: string): Promise<void> {
    return enqueue(async (f) => {
        const instances = liveInstances(f);
        await endIds(instances, records.filter((r) => r.reservationId === reservationId).map((r) => r.activityId));
        await save();
    });
}

// ── Başlatma jetonu ─────────────────────────────────────────────────────────

async function readStart(): Promise<StartRegistration> {
    try {
        const raw = await AsyncStorage.getItem(START_KEY);
        const parsed = raw ? JSON.parse(raw) as Partial<StartRegistration> : {};
        return {
            token: typeof parsed.token === 'string' ? parsed.token : null,
            staffId: typeof parsed.staffId === 'string' ? parsed.staffId : null,
            at: typeof parsed.at === 'number' ? parsed.at : 0,
        };
    } catch {
        return { token: null, staffId: null, at: 0 };
    }
}

/**
 * Başlatma jetonunu sunucuyla eşitle — öne dönüşte (`backgroundSync`), yalnız
 * personel oturumunda. Jeton yoksa (iOS 17.2 altı, izin yok) hiçbir şey
 * yazılmıyor ve sunucu o telefona bildirim göndermeye devam ediyor.
 */
export async function syncArrivalStart(staffId: string | null): Promise<void> {
    if (!factory || !staffId) return;
    const token = startToken;
    const now = Date.now();
    if (!shouldRegisterStart({ token, staffId, last: await readStart(), now })) return;
    try {
        await api.laRegister({ kind: 'start', token: token!, deviceId: await deviceIdOnce(), environment });
        await AsyncStorage.setItem(START_KEY, JSON.stringify({ token, staffId, at: now }));
    } catch (cause) {
        console.warn('müşteri bekliyor: başlatma jetonu yazılamadı', String(cause));
    }
}

/**
 * Kiracı sınırı: çıkış, işletme değişimi, telefon koparma. Bütün etkinlikler
 * bitiyor ve sunucudaki jetonlar siliniyor — ayrılan personelin müşterisi
 * sonraki kişinin kilit ekranında açılmasın.
 */
export function endAllArrivalActivities(): Promise<void> {
    if (!factory) return Promise.resolve();
    void AsyncStorage.removeItem(START_KEY).catch(() => undefined);
    void deviceIdOnce()
        .then((deviceId) => api.laUnregister(deviceId))
        .catch(() => undefined);
    return enqueue(async (f) => {
        const instances = liveInstances(f);
        await endIds(instances, [...instances.keys()]);
        records = [];
        pendingTokens.clear();
        await save();
    });
}

if (view && factory) {
    try {
        view.addPushToStartTokenListener((event) => { startToken = event.activityPushToStartToken; });
    } catch (cause) {
        console.warn('müşteri bekliyor: başlatma jetonu dinlenemedi', String(cause));
    }
    // Öne dönüş: iki saati geçmiş sayaç kalkıyor, uzaktan açılanların jeton
    // dinleyicisi kuruluyor. Asıl eşleme Bugün ekranının okumasıyla.
    AppState.addEventListener('change', (next) => {
        if (next === 'active') void reconcileArrivalActivities(null, null);
    });
    void reconcileArrivalActivities(null, null);
}

onTenantReset(() => { void endAllArrivalActivities(); });

/**
 * Sunucudaki "Müşteri bekliyor" jetonlarını sil — çıkışta ve telefonu
 * işletmeden çıkarırken, `unregisterPush` ile AYNI anda ve aynı sırayla
 * (personel token'ı silinmeden, cihaz kimliği unutulmadan). Düşerse sessiz:
 * personel pasife alınınca ya da telefon koparılınca sunucu da siliyor.
 */
export async function unregisterArrivalTokens(): Promise<void> {
    if (!factory) return;
    try {
        await AsyncStorage.removeItem(START_KEY);
        await api.laUnregister(await deviceIdOnce());
    } catch (cause) {
        console.warn('müşteri bekliyor: jetonlar silinemedi', String(cause));
    }
}
