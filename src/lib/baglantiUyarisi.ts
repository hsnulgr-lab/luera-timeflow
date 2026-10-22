// Bağlantı koptuğunda tek uyarı + bağlantı dönünce açık sayfanın verisini
// yeniden çekme. Kurallar baglantiKurallari.ts'te (saf, testli); burası onları
// sonner'a, tarayıcının online/offline olaylarına ve sunucu yoklamasına bağlar.
//
// Kullanım (veri kancasında):
//   if (error) { loadFailed('Personel listesi yüklenemedi', error); … }
//   useOnReconnect(() => { if (orgId) void fetchStaff(orgId); });
import { createElement, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { WifiOff } from 'lucide-react';
import { BAGLANTI_METNI, createBekci, isNetworkError } from '@/lib/baglantiKurallari';

// Her kopma kendi kimliğiyle açılır: sonner'da kapanma animasyonu süren bir
// uyarıya aynı kimlikle yazılan güncelleme yutulur (ve onDismiss'i susturma
// sanılırdı). Kopma içinde metin değişince aynı uyarı güncellenir.
const TOAST_ID = 'baglanti-yok';
let toastSeq = 0;
let currentToast = '';

// no-cors: cevap okunmaz, gelmesi yeter (401 de "sunucu ayakta" demektir).
const PROBE_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/auth/v1/health`;

const subscribers = new Set<{ current: () => void }>();

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const bekci = createBekci({
    isOnline,
    probe: async () => {
        try {
            await fetch(PROBE_URL, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
            return true;
        } catch {
            return false;
        }
    },
    show: (durum) => {
        if (!currentToast) currentToast = `${TOAST_ID}-${++toastSeq}`;
        const id = currentToast;
        toast(BAGLANTI_METNI[durum], {
            id,
            duration: Infinity,
            icon: createElement(WifiOff, { size: 16 }),
            // sonner programla kaldırılan uyarı için de çağırır; o zaman currentToast boştur
            onDismiss: () => { if (id === currentToast) bekci.userDismissed(); },
        });
    },
    hide: () => {
        if (currentToast) toast.dismiss(currentToast);
        currentToast = '';
    },
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    cancel: (handle) => window.clearTimeout(handle as number),
    now: () => Date.now(),
    recovered: () => {
        for (const ref of [...subscribers]) {
            try { ref.current(); } catch (err) { console.error(err); }
        }
    },
});

// Giriş ekranı kendi "internet yok" bandını gösteriyor: tarayıcının offline
// olayı yalnız veri gösteren bir sayfa açıkken uyarıya dönüşür.
const onOffline = () => { if (subscribers.size > 0) bekci.wentOffline(); };
const onOnline = () => bekci.cameOnline();

let installed = false;
function install() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
        bekci.reset();
    });
}

/**
 * Sayfa-yükleme (okuma) hatası. İstek ağ yüzünden düştüyse tek "bağlantı yok"
 * uyarısına katılır; sunucu cevap verdiyse eskisi gibi kendi bildirimini verir.
 * Yazma hataları (kaydedilemedi, silinemedi …) buradan geçmez: kullanıcı
 * işleminin olmadığını her zaman ayrıca görmeli.
 */
export function loadFailed(message: string, error: unknown): void {
    if (isNetworkError(error, isOnline())) {
        install();
        bekci.networkError();
        return;
    }
    toast.error(message);
}

/** Bağlantı dönünce (uyarı kalkarken) bir kez çalışır — açık sayfanın verisini yeniden çeker. */
export function useOnReconnect(refetch: () => void): void {
    const ref = useRef(refetch);
    useEffect(() => { ref.current = refetch; });
    useEffect(() => {
        install();
        subscribers.add(ref);
        return () => {
            subscribers.delete(ref);
            if (subscribers.size === 0) bekci.reset();
        };
    }, []);
}
