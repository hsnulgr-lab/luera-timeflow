import { auth as live } from './auth';
import { authStub } from './authStub';

/**
 * Ekranların kimlikle konuştuğu TEK yer.
 *
 * İki uygulama var ve ikisi de eksiksiz değil:
 *
 *   authStub — hepsi sahte ama TAMAM. Sunucu olmadan bütün akış gezilebiliyor;
 *              tasarım turları bunun üstünde yapıldı.
 *   auth     — gerçek. Müdür Supabase oturumu, personel cihaz kodu + PIN,
 *              yeni salon kaydı, hesap silme. Abonelik YOK ve olmayacak:
 *              uygulamada fiyat ya da satın alma çağrısı geçmiyor.
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
export const LIVE_PARTS = ['manager', 'staff', 'biometric', 'resume', 'account', 'signup', 'getLaunchState'] as const;
/**
 * Hâlâ sahte olan parçalar — sunucu tarafı yazılmadı.
 *
 * `account` 2026-09-16'da, `signup` 2026-09-18'de çıktı. Kayıt stub'da
 * kaldığı sürece telefondan "kaydol" diyen kişi bütün ekranları geziyor,
 * "hazır" yazısını görüyor ve hiçbir şey oluşmuyordu.
 */
export const STUB_PARTS = ['subscription'] as const;

export const authApi = LIVE_AUTH
    ? {
        ...authStub,
        getLaunchState: live.getLaunchState,
        manager: { ...authStub.manager, ...live.manager },
        staff: { ...authStub.staff, ...live.staff },
        biometric: { ...authStub.biometric, ...live.biometric },
        resume: { ...authStub.resume, ...live.resume },
        account: { ...authStub.account, ...live.account },
        signup: { ...authStub.signup, ...live.signup },
    }
    : authStub;

// Tipler stub'da tanımlı ve gerçek uygulama da onlara uyuyor: tek sözleşme.
export * from './authStub';
