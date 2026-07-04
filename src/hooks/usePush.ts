import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// Web Push aboneliği — mobil kumanda bildirimleri.
// role/staffId ile aynı hook hem personel hem yönetici modunda kullanılır.

type PushRole = 'manager' | 'staff';

function urlB64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

const isSupported = () =>
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

export function usePush(role: PushRole, staffId?: string) {
    const [supported] = useState(isSupported);
    const [enabled, setEnabled] = useState(false);
    const [busy, setBusy] = useState(false);

    // Bu cihazda, O AN açık olan kimlik (staffId) için abonelik var mı?
    // Tarayıcı aboneliği + izin ön koşul; ama abonelik başka personele aitse
    // (shared cihaz) bu kimlik için "kapalı" gösterilir → status ile doğrulanır.
    useEffect(() => {
        if (!supported) return;
        let cancel = false;
        (async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (!sub || Notification.permission !== 'granted') {
                    if (!cancel) setEnabled(false);
                    return;
                }
                const { data } = await supabase.functions.invoke('push-subscribe', {
                    body: { action: 'status', endpoint: sub.endpoint, staffId: role === 'staff' ? staffId : undefined },
                });
                if (!cancel) setEnabled(!!data?.subscribed);
            } catch { /* yoksay */ }
        })();
        return () => { cancel = true; };
    }, [supported, role, staffId]);

    const enable = useCallback(async () => {
        if (!supported) { toast.error('Bu cihaz/ tarayıcı bildirim desteklemiyor'); return false; }
        setBusy(true);
        try {
            // İzin daha önce reddedildiyse tarayıcı bir daha sormaz — kullanıcıyı
            // tarayıcı/işletim sistemi ayarına yönlendir, yoksa kısır döngüde kalır.
            if (Notification.permission === 'denied') {
                toast.error('Bildirim izni daha önce reddedilmiş. Tarayıcının site ayarlarından (adres çubuğundaki kilit simgesi) bildirimlere izin verip tekrar deneyin.', { duration: 6000 });
                return false;
            }
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') { toast('Bildirim izni verilmedi', { icon: '🔕' }); return false; }

            // VAPID public key
            const cfg = await supabase.functions.invoke('push-subscribe', { body: { action: 'config' } });
            const publicKey = cfg.data?.publicKey;
            if (cfg.error || !publicKey) { toast.error('Bildirim yapılandırması alınamadı'); return false; }

            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlB64ToUint8Array(publicKey) as BufferSource,
                });
            }

            const { error } = await supabase.functions.invoke('push-subscribe', {
                body: { action: 'subscribe', subscription: sub.toJSON(), role, staffId: role === 'staff' ? staffId : undefined },
            });
            if (error) { toast.error('Abonelik kaydedilemedi'); return false; }

            setEnabled(true);
            toast.success('Bildirimler açıldı 🔔');
            return true;
        } catch (err) {
            console.error('push enable', err);
            toast.error('Bildirim açılamadı');
            return false;
        } finally {
            setBusy(false);
        }
    }, [supported, role, staffId]);

    const disable = useCallback(async () => {
        if (!supported) return;
        setBusy(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await supabase.functions.invoke('push-subscribe', { body: { action: 'unsubscribe', endpoint: sub.endpoint } });
                await sub.unsubscribe();
            }
            setEnabled(false);
            toast('Bildirimler kapatıldı', { icon: '🔕' });
        } catch (err) {
            console.error('push disable', err);
        } finally {
            setBusy(false);
        }
    }, [supported]);

    return { supported, enabled, busy, enable, disable };
}
