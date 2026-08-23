import { auth as live } from './auth';
import { authStub } from './authStub';

/**
 * Ekranların kimlikle konuştuğu TEK yer.
 *
 * İki uygulama var ve ikisi de eksiksiz değil:
 *
 *   authStub — hepsi sahte ama TAMAM. Sunucu olmadan bütün akış gezilebiliyor;
 *              tasarım turları bunun üstünde yapıldı.
 *   auth     — gerçek. Müdür Supabase oturumu, personel cihaz kodu + PIN.
 *              Kayıt ve hesap silme YOK: ikisinin de sunucu tarafı yazılmadı
 *              (mobilden org açacak uç yok, hesap silecek uç yok).
 *
 * Bu yüzden karışık bir yüzey sunuluyor: gerçeği olan gerçekten, olmayan
 * stub'dan. Hangi parçanın sahte olduğu aşağıda tek tek yazılı — "çalışıyor
 * göründü ama sahteymiş" sürprizi olmasın.
 *
 * ── Anahtar ──────────────────────────────────────────────────────────────────
 * `EXPO_PUBLIC_AUTH_MODE=live` verilene kadar HER ŞEY stub'dır. Sunucu henüz
 * dağıtılmadığı için varsayılan bilerek stub: canlıya geçmeden anahtarı
 * çevirmek, uygulamayı hiç açılmaz hâle getirirdi.
 */
export const LIVE_AUTH = process.env.EXPO_PUBLIC_AUTH_MODE === 'live';

/** Gerçek sunucuya bağlı olan parçalar. */
export const LIVE_PARTS = ['manager', 'staff', 'biometric', 'resume', 'getLaunchState'] as const;
/** Hâlâ sahte olan parçalar — sunucu tarafı yazılmadı. */
export const STUB_PARTS = ['signup', 'account', 'subscription'] as const;

export const authApi = LIVE_AUTH
    ? {
        ...authStub,
        getLaunchState: live.getLaunchState,
        manager: { ...authStub.manager, ...live.manager },
        staff: { ...authStub.staff, ...live.staff },
        biometric: { ...authStub.biometric, ...live.biometric },
        resume: { ...authStub.resume, ...live.resume },
    }
    : authStub;

// Tipler stub'da tanımlı ve gerçek uygulama da onlara uyuyor: tek sözleşme.
export * from './authStub';
