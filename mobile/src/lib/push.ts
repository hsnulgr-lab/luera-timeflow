import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '../api/staff';
import { supabase } from './supabase';
import { deviceIdOnce } from './pushDevice.ts';
import { stateOf, type PushState } from './pushPermission.ts';
import { shouldRegister, shouldUnregister } from './pushRegistration.ts';

/**
 * Bildirim jetonunun CİHAZ tarafı — izin, jeton, sunucuya bağlama.
 *
 * Kararların hepsi saf dosyalarda (`pushPermission`, `pushRegistration`) ve
 * testten gerçekten çağrılıyor. Burada yalnız o kararların uygulanması var:
 * OS'a sormak, jetonu istemek, sunucuya yazmak.
 *
 * ── Hiçbir hata kullanıcıya düşmüyor ────────────────────────────────────────
 * Bildirim bir HIZLANDIRICI, bir garanti değil. Kayıt başarısız olursa telefon
 * çalışmaya devam ediyor; personel randevusunu Bugün'de zaten görüyor. Ama
 * sessizce ölmesin diye her başarısızlık günlüğe yazılıyor — "sessizce ölen
 * bir hızlandırıcı, hiç olmayanından kötü".
 */

/** Son BAŞARILI kaydın izi: neyi, kimin için, ne zaman yazdık. */
const K_LAST = 'tf.push.last';
/** Ağ yokken tamamlanamayan silme işi. */
const K_PENDING_OFF = 'tf.push.pendingUnregister';

interface LastRegistration {
    token: string | null;
    staffId: string | null;
    at: number;
}

const NO_LAST: LastRegistration = { token: null, staffId: null, at: 0 };

/**
 * Müdür kaydının "kimlik"i. Gerçek bir `staff.id` değil — müdür aboneliği
 * kişiye değil role yazılıyor. Sabit bir işaret olması, aynı telefonda müdür
 * çıkıp personel girdiğinde kaydın yeniden yazılmasını sağlıyor.
 */
const MANAGER_MARK = 'manager';

async function readLast(): Promise<LastRegistration> {
    try {
        const raw = await AsyncStorage.getItem(K_LAST);
        if (!raw) return NO_LAST;
        const parsed = JSON.parse(raw) as Partial<LastRegistration>;
        return {
            token: typeof parsed.token === 'string' ? parsed.token : null,
            staffId: typeof parsed.staffId === 'string' ? parsed.staffId : null,
            at: typeof parsed.at === 'number' ? parsed.at : 0,
        };
    } catch {
        return NO_LAST;
    }
}

/** `app.json` → `extra.eas.projectId`. Yoksa Expo jetonu ÜRETİLEMEZ. */
export function projectId(): string | null {
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
    const found = extra?.eas?.projectId;
    return typeof found === 'string' && found.length > 0 ? found : null;
}

/** Şu anki izin hâli — OS'a sormadan, yalnız okuyarak. */
export async function readPushState(): Promise<PushState> {
    try {
        const permission = await Notifications.getPermissionsAsync();
        return stateOf({
            isDevice: Device.isDevice,
            status: permission.status,
            canAskAgain: permission.canAskAgain,
            hasProjectId: projectId() !== null,
        });
    } catch (cause) {
        console.warn('bildirim izni okunamadı', String(cause));
        return 'error';
    }
}

/**
 * OS diyaloğunu AÇAR. Yalnız `shouldAsk` doğruyken çağrılmalı — iOS bu soruyu
 * ömründe bir kez soruyor ve "izin verme" kalıcı.
 */
export async function askPushPermission(): Promise<PushState> {
    try {
        const permission = await Notifications.requestPermissionsAsync();
        return stateOf({
            isDevice: Device.isDevice,
            status: permission.status,
            canAskAgain: permission.canAskAgain,
            hasProjectId: projectId() !== null,
        });
    } catch (cause) {
        console.warn('bildirim izni istenemedi', String(cause));
        return 'error';
    }
}

async function currentToken(): Promise<string | null> {
    const id = projectId();
    if (!id) return null;
    try {
        const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
        return typeof data === 'string' ? data : null;
    } catch (cause) {
        console.warn('expo jetonu alınamadı', String(cause));
        return null;
    }
}

/**
 * Jetonu sunucuyla EŞİTLE — öne dönüşte, giriş sonrasında, izin verildiğinde.
 *
 * Kendi kendini iyileştiriyor: başarısız olursa `tf.push.last` yazılmıyor ve
 * bir sonraki çağrıda yeniden deneniyor. Kuyruğa (`write()`) girmiyor — kuyruk
 * bu iş için bir açık olurdu: saatler sonra boşalan bir kayıt, o arada çıkış
 * yapmış personelin jetonunu diriltir ve bildirimleri YANLIŞ KİŞİYE gönderir.
 */
export async function syncPush(staffId: string | null): Promise<PushState> {
    // Önce bekleyen silme: sırası gelmeden yeni kayıt yazmak, az önce
    // koparmak istediğimiz satırı geri getirebilirdi.
    await flushPendingUnregister();

    const state = await readPushState();
    const last = await readLast();

    if (shouldUnregister({ granted: state === 'granted', lastToken: last.token })) {
        // İzin geri alınmış: satır dursa bildirim gitmeye devam eder ve
        // "abone var" gibi sayılır. FCM her zaman haber vermiyor.
        await unregisterPush();
        return state;
    }

    if (state !== 'granted' || !staffId) return state;

    const token = await currentToken();
    const now = Date.now();
    if (!shouldRegister({
        granted: true,
        token,
        staffId,
        lastToken: last.token,
        lastStaffId: last.staffId,
        lastAt: last.at,
        now,
    })) return state;

    try {
        const deviceId = await deviceIdOnce();
        await api.pushRegister(token!, Platform.OS === 'ios' ? 'ios' : 'android', deviceId);
        await AsyncStorage.setItem(K_LAST, JSON.stringify({ token, staffId, at: now }));
    } catch (cause) {
        // `tf.push.last` YAZILMADI → bir sonraki öne dönüşte yeniden denenir.
        console.warn('bildirim jetonu bağlanamadı', String(cause));
    }
    return state;
}

/**
 * MÜDÜRÜN jetonunu sunucuyla eşitle (106).
 *
 * Personelinkinden ayrı bir yol, çünkü iki kimlik sistemi var: müdürün
 * Supabase oturumu VAR ve `push-subscribe` tam onu bekliyor; personelin YOK ve
 * o `staff-api`den geçiyor. Tek fonksiyona sıkıştırmak, iki kimlik sistemini
 * tek koşula bağlamak olurdu.
 *
 * Abonelik kişiye değil ROLE yazılıyor (`staff_id: null`, `role: 'manager'`):
 * `send-push` müdür olaylarını `role='manager'` ile hedefliyor ve salonda
 * birden çok yönetici olabilir.
 */
export async function syncManagerPush(): Promise<PushState> {
    const state = await readPushState();
    const last = await readLast();

    if (shouldUnregister({ granted: state === 'granted', lastToken: last.token })) {
        await unregisterManagerPush();
        return state;
    }
    if (state !== 'granted') return state;

    const token = await currentToken();
    const now = Date.now();
    // `staffId` yerine sabit bir işaret: müdür kaydı kişiye bağlı değil, ama
    // "kim için yazdık" karşılaştırması yine de gerekli (aynı telefonda müdür
    // çıkıp personel girebiliyor).
    if (!shouldRegister({
        granted: true,
        token,
        staffId: MANAGER_MARK,
        lastToken: last.token,
        lastStaffId: last.staffId,
        lastAt: last.at,
        now,
    })) return state;

    try {
        const deviceId = await deviceIdOnce();
        const { error } = await supabase.functions.invoke('push-subscribe', {
            body: {
                action: 'subscribe',
                kind: 'expo',
                token,
                platform: Platform.OS === 'ios' ? 'ios' : 'android',
                deviceId,
                role: 'manager',
            },
        });
        if (error) throw error;
        await AsyncStorage.setItem(K_LAST, JSON.stringify({ token, staffId: MANAGER_MARK, at: now }));
    } catch (cause) {
        // İz YAZILMADI → bir sonraki öne dönüşte yeniden denenir.
        console.warn('müdür bildirim jetonu bağlanamadı', String(cause));
    }
    return state;
}

/** Müdürün aboneliğini koparır — çıkışta ve izin geri alınınca. */
export async function unregisterManagerPush(): Promise<void> {
    const deviceId = await deviceIdOnce();
    try {
        const { error } = await supabase.functions.invoke('push-subscribe', {
            body: { action: 'unsubscribe', deviceId },
        });
        if (error) throw error;
        await AsyncStorage.multiRemove([K_LAST]);
    } catch (cause) {
        console.warn('müdür bildirim aboneliği koparılamadı', String(cause));
        await AsyncStorage.multiRemove([K_LAST]);
    }
}

/**
 * Bu cihazın aboneliğini KOPAR — çıkışta, cihaz koparmada, izin geri alınınca.
 *
 * Başarısız olursa iş BEKLETİLİYOR: ortak telefonda ayrılan personelin
 * bildirimlerinin yeni personelin elinde çalması, kabul edilebilir bir sonuç
 * değil. Bekleyen iş cihaz token'ıyla tamamlanabiliyor (bkz. `staff-api` ·
 * `push.unregister`), yani personel token'ı silindikten sonra da denenebiliyor.
 */
export async function unregisterPush(): Promise<void> {
    const deviceId = await deviceIdOnce();
    try {
        await api.pushUnregister(deviceId);
        await AsyncStorage.multiRemove([K_LAST, K_PENDING_OFF]);
    } catch (cause) {
        console.warn('bildirim aboneliği koparılamadı — bekliyor', String(cause));
        // `tf.push.last` de siliniyor: elimizdeki kayıt artık doğru değil.
        await AsyncStorage.multiRemove([K_LAST]);
        await AsyncStorage.setItem(K_PENDING_OFF, deviceId);
    }
}

/** Bekleyen silme işini dener. Başarısızsa sessizce bekler. */
export async function flushPendingUnregister(): Promise<void> {
    let deviceId: string | null = null;
    try {
        deviceId = await AsyncStorage.getItem(K_PENDING_OFF);
    } catch {
        return;
    }
    if (!deviceId) return;
    try {
        await api.pushUnregister(deviceId);
        await AsyncStorage.removeItem(K_PENDING_OFF);
    } catch {
        // Bir sonraki turda.
    }
}
