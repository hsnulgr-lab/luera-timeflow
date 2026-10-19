// Girişten sonra uygulamanın üstünde bir kez görünen not (M11 · "Bu e-postayla
// zaten hesabınız var — giriş yaptınız."). Giriş sayfası kapanırken gönderir,
// App düzeyindeki <LoginNotice /> gösterir.
export const LOGIN_NOTICE_EVENT = 'luera:giris-notu';

export function showLoginNotice(text: string): void {
    window.dispatchEvent(new CustomEvent<string>(LOGIN_NOTICE_EVENT, { detail: text }));
}
