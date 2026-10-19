/**
 * Giriş v4 · K4 — "Zaten işletmeniz var" bildirimi.
 *
 * Kişi KAYIT kapısından girdi ama hesabı zaten vardı (Apple/Google ile ya da
 * e-postası ve şifresi tuttu). Bir şey kaybetmedi; içeri alınıyor ve İÇERİDE,
 * ekranın üstünde kısa bir cam plaka bunu söylüyor (`LoginNotice.tsx`).
 *
 * Not GİRİŞ ANINDA değil KABUĞA VARINCA gösteriliyor: arada "Hangi işletme?"
 * ya da Face ID teklifi olabilir (karar 4) ve plaka o ekranların üstünde
 * görünüp kaybolursa kişi onu hiç okumamış olur. Bu yüzden sıra:
 * `queueLoginNotice` → … → `enterShell` → `releaseLoginNotice`.
 *
 * Saf modül: React ve React Native yok — testler doğrudan içe aktarır.
 */

export type LoginNoticeKind = 'social' | 'email';

/** Metinler — K4 (Apple/Google) ve karar 2 (e-posta + şifre tuttu). */
export const LOGIN_NOTICE_TEXT: Record<LoginNoticeKind, string> = {
    social: 'Bu hesapla zaten işletmeniz var — giriş yaptınız.',
    email: 'Bu e-postayla zaten hesabınız var — giriş yaptınız.',
};

type Listener = (text: string) => void;

let queued: string | null = null;
const listeners = new Set<Listener>();

/** Kayıttan gelen kişi içeri alınacak; not kabuğa varınca gösterilsin. */
export function queueLoginNotice(kind: LoginNoticeKind): void {
    queued = LOGIN_NOTICE_TEXT[kind];
}

/** Kabuğa varıldı — sırada not varsa göster. Not bir kez gösterilir. */
export function releaseLoginNotice(): void {
    const text = queued;
    queued = null;
    if (!text) return;
    for (const listener of listeners) listener(text);
}

/** Vazgeçildi (kişi geri döndü, oturum kapandı): bekleyen not düşer. */
export function dropLoginNotice(): void {
    queued = null;
}

export function onLoginNotice(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
