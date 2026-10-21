// Masaüstü giriş — "Işık alanı" (tasarım: Luera Masaustu - Giris v2.1).
//
// Ekranlar (tasarımdaki kare adlarıyla):
//   M1/M2  login           Hesabınıza girin (+ hâller: hatalı, kilit, internet yok)
//   M4     signup          Hesabınızı açalım
//   M5     code            Kodu girin (kayıt)
//   M8     reset-email     Yeni şifre belirleyin
//   M9     reset-code      Kodu girin (şifre)
//   M10    reset-password  Yeni şifreniz
//   M3     bridge          Bu hesapla bir işletme bulamadık (Apple/Google)
//
// Kararlar (docs/giris-kararlar.md):
//   · Masaüstünde kayıt hesapla biter; işletme bilgileri Kurulum sihirbazında
//     (14 sektör). Tasarımdaki M6/M7 ve "Adım 1/3" çubuğu bu yüzden YOK.
//   · Kayıtta zaten kayıtlı e-posta: şifre uyuyorsa içeri + not (M11);
//     uymuyorsa kod ekranı — ekran hiçbir zaman hesabın varlığını söylemez.
//   · Apple/Google AÇIK (2026-10-19); acil kapatma `VITE_SOCIAL_LOGIN=0` (sosyalGiris.ts).
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SplashScreen } from '@/components/SplashScreen';
import { planById } from '@/lib/plans';
import { showLoginNotice } from '@/lib/loginNotice';
import {
    Band, Brand, EmailInput, IconBack, IconTag, LightField, OtpBox, PasswordInput,
    PasswordRule, PrivacyLink, Resend, SsoButtons, Wait, type BandState,
} from './login/parcalar';
import {
    classifyAuthError, emailLooksValid, passwordOk, ssoFailedText,
    LOCK_SECONDS, METIN, RESEND_SECONDS, type AuthErrorLike,
} from './login/girisKurallari';
import {
    SOCIAL_ENABLED, businessCount, createOwnBusiness, signInWithApple, startGoogle, takeIntent,
    type Intent, type Provider,
} from './login/sosyalGiris';
import './login/giris.css';

type Screen =
    | { name: 'login' }
    | { name: 'signup' }
    | { name: 'code'; email: string }
    | { name: 'reset-email' }
    | { name: 'reset-code'; email: string }
    | { name: 'reset-password'; email: string }
    | { name: 'bridge'; provider: Provider; email: string };

type Entry = 'login' | 'signup' | 'existing' | 'reset';

// Google dönüşünde hata adres satırında gelir; istemci adresi temizlemeden
// önce, modül yüklenirken okunur.
const INITIAL_URL = typeof window === 'undefined' ? '' : `${window.location.search}&${window.location.hash.replace(/^#/, '')}`;
function oauthErrorInUrl(): boolean {
    return /(?:^|[?&])error(?:_description)?=/.test(INITIAL_URL);
}

const narrowViewport = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Giriş ↔ kayıt: plaka içeriği saydamlıkla değişir, plakanın ÜST kenarı sabit
 * kalır, yalnız alt kenar 200 ms'de yeni yüksekliğe iner/çıkar.
 */
function usePlateMorph(key: string) {
    const plateRef = useRef<HTMLDivElement>(null);
    const lastHeight = useRef(0);
    const mounted = useRef(false);

    useEffect(() => {
        const el = plateRef.current;
        if (!el) return;
        lastHeight.current = el.getBoundingClientRect().height;
        const ro = new ResizeObserver(() => {
            if (!el.style.height) lastHeight.current = el.getBoundingClientRect().height;
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useLayoutEffect(() => {
        const el = plateRef.current;
        if (!el) return;
        if (!mounted.current) { mounted.current = true; return; }
        const from = lastHeight.current;
        el.style.height = '';
        const to = el.getBoundingClientRect().height;
        if (!from || Math.abs(from - to) < 1 || reducedMotion()) { lastHeight.current = to; return; }
        el.style.overflow = 'hidden';
        el.style.height = `${from}px`;
        void el.offsetHeight;
        el.style.transition = 'height 200ms ease-in-out';
        el.style.height = `${to}px`;
        const done = () => {
            el.style.height = '';
            el.style.transition = '';
            el.style.overflow = '';
            lastHeight.current = el.getBoundingClientRect().height;
        };
        const t = window.setTimeout(done, 220);
        return () => { window.clearTimeout(t); done(); };
    }, [key]);

    return plateRef;
}

/** Sayaçlar için saniyelik saat — yalnız gerektiğinde çalışır. */
function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const first = window.setTimeout(() => setNow(Date.now()), 0);
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => { window.clearTimeout(first); window.clearInterval(id); };
    }, [active]);
    return now;
}

export const LoginPage = () => {
    const { user, isLoading, refreshOrg } = useAuth();
    const { dark } = useTheme();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    // /fiyatlar'dan gelen seçim: ?mode=signup&plan=pro&cycle=yearly — kayıt
    // ya da giriş biter bitmez o planın abonelik sayfası açılır.
    const plan = planById(params.get('plan'));
    const cycle = params.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
    const planDest = plan ? `/abonelik?plan=${plan.id}&cycle=${cycle}` : null;
    // Abonelik e-postasından gelen (?sonra=abonelik): girişten sonra paket
    // ekranı. BEYAZ LİSTE — adres parametreden okunmaz, açık yönlendirme
    // olmaz. Yeni kayıtta geçmez: yeni işletmenin yeri kurulum. E-posta
    // kipinde açılır: paket ekranı kişiyi uygulamaya atmaz (PaywallPage).
    const afterDest = planDest ?? (params.get('sonra') === 'abonelik' ? '/abonelik?kaynak=eposta' : null);

    const [screen, setScreen] = useState<Screen>(() => (params.get('mode') === 'signup' ? { name: 'signup' } : { name: 'login' }));
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [code, setCode] = useState('');
    const [band, setBand] = useState<BandState | null>(null);
    const [ssoBand, setSsoBand] = useState<BandState | null>(null);
    const [errEmail, setErrEmail] = useState(false);
    const [errPassword, setErrPassword] = useState(false);
    const [errCode, setErrCode] = useState(false);
    const [busy, setBusy] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [waiting, setWaiting] = useState<Provider | null>(null);
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [codeLockedUntil, setCodeLockedUntil] = useState<number | null>(null);
    const [codeSentAt, setCodeSentAt] = useState(0);
    const [splash, setSplash] = useState<{ dest: string; notice?: string } | null>(null);

    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const codeRef = useRef<HTMLInputElement>(null);
    // Kullanıcı bir ekran değiştirdi mi? Telefonda sayfa açılır açılmaz klavye
    // çıkmasın; ama kişi bir bağlantıya bastıysa sonraki alan odak alsın.
    const navigated = useRef(false);
    const started = useRef(false);

    const onCodeScreen = screen.name === 'code' || screen.name === 'reset-code';
    const now = useNow(onCodeScreen || lockedUntil !== null || codeLockedUntil !== null);
    const locked = lockedUntil !== null && now < lockedUntil;
    const codeLocked = codeLockedUntil !== null && now < codeLockedUntil;
    const resendLeft = Math.min(RESEND_SECONDS, Math.max(0, RESEND_SECONDS - (now - codeSentAt) / 1000));

    const plateRef = usePlateMorph(screen.name);
    const [swapped, setSwapped] = useState(false);

    // ── Ekran geçişi ────────────────────────────────────────────────────────
    const go = (next: Screen) => {
        navigated.current = true;
        setBand(null);
        setSsoBand(null);
        setErrEmail(false);
        setErrPassword(false);
        setErrCode(false);
        setSwapped(true);
        setScreen(next);
        if (next.name === 'login' || next.name === 'signup') {
            const p = new URLSearchParams(params);
            if (next.name === 'signup') p.set('mode', 'signup'); else p.delete('mode');
            setParams(p, { replace: true });
        }
    };

    const openCode = (address: string, kind: 'code' | 'reset-code') => {
        setCode('');
        setCodeSentAt(Date.now());
        setCodeLockedUntil(null);
        go({ name: kind, email: address });
    };

    /** İçeri: açılış animasyonu, sonra hedef. Plan seçildiyse önce abonelik. */
    const enter = (kind: Entry) => {
        const dest = planDest ?? (kind === 'signup' ? '/kurulum' : afterDest ?? '/');
        setSplash({ dest, notice: kind === 'existing' ? METIN.existingAccount : undefined });
    };

    // ── İlk yükleme: açık oturum ya da Google dönüşü ────────────────────────
    useEffect(() => {
        if (isLoading || started.current) return;
        started.current = true;
        const pending = takeIntent();
        if (pending && oauthErrorInUrl()) {
            setScreen(pending.intent === 'signup' ? { name: 'signup' } : { name: 'login' });
            setSsoBand({ kind: 'e', text: ssoFailedText(pending.provider, pending.intent) });
            return;
        }
        if (!user) return;
        if (pending) {
            setWaiting(pending.provider);
            void supabase.auth.getUser().then(({ data }) => finishSocial(pending.provider, pending.intent, data.user));
            return;
        }
        navigate(afterDest ?? '/', { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, user]);

    // ── Odak: ekran değişince ilk alan ──────────────────────────────────────
    useEffect(() => {
        const initial = !navigated.current;
        if (initial && narrowViewport()) return; // telefonda sayfa açılır açılmaz klavye çıkmasın
        const target = screen.name === 'code' || screen.name === 'reset-code' ? codeRef.current
            : screen.name === 'reset-password' ? passwordRef.current
                : emailRef.current;
        target?.focus({ preventScroll: initial });
    }, [screen.name]);

    // ── Kilit bitince bant kalkar, düğme açılır ─────────────────────────────
    useEffect(() => {
        if (lockedUntil !== null && now >= lockedUntil) {
            setLockedUntil(null);
            setBand((b) => (b?.text === METIN.tooMany ? null : b));
        }
        if (codeLockedUntil !== null && now >= codeLockedUntil) {
            setCodeLockedUntil(null);
            setBand((b) => (b?.text === METIN.tooMany ? null : b));
        }
    }, [now, lockedUntil, codeLockedUntil]);

    // ── Bağlantı gelince "internet yok" bandı kendiliğinden kalkar ─────────
    useEffect(() => {
        const onOnline = () => {
            setBand((b) => (b?.kind === 'n' ? null : b));
            setSsoBand((b) => (b?.kind === 'n' ? null : b));
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, []);

    const offlineBand: BandState = { kind: 'n', text: METIN.offline };
    const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

    const lock = (target: 'form' | 'code') => {
        const until = Date.now() + LOCK_SECONDS * 1000;
        if (target === 'form') setLockedUntil(until); else setCodeLockedUntil(until);
        setBand({ kind: 'w', text: METIN.tooMany });
    };

    // ── Apple / Google ──────────────────────────────────────────────────────
    async function finishSocial(provider: Provider, intent: Intent, signedIn: User | null) {
        if (!signedIn) {
            setWaiting(null);
            setSsoBand({ kind: 'e', text: ssoFailedText(provider, intent) });
            return;
        }
        const count = await businessCount(signedIn.id);
        if (count === null) {
            setWaiting(null);
            setSsoBand({ kind: 'e', text: ssoFailedText(provider, intent) });
            return;
        }
        if (count > 0) {
            enter(intent === 'login' ? 'login' : 'existing');
            return;
        }
        if (intent === 'signup') {
            if (await createOwnBusiness()) { await refreshOrg(); enter('signup'); return; }
            setWaiting(null);
            setSsoBand({ kind: 'e', text: ssoFailedText(provider, intent) });
            return;
        }
        // Girişten geldi, işletmesi yok: sessizce boş işletme açılmaz, sorulur.
        setWaiting(null);
        go({ name: 'bridge', provider, email: signedIn.email ?? '' });
    }

    const onApple = async (intent: Intent) => {
        setSsoBand(null);
        if (isOffline()) { setSsoBand(offlineBand); return; }
        setWaiting('apple');
        const result = await signInWithApple();
        if (result === 'cancelled') { setWaiting(null); return; }
        if (result === 'failed') {
            setWaiting(null);
            setSsoBand({ kind: 'e', text: ssoFailedText('apple', intent) });
            return;
        }
        const { data } = await supabase.auth.getUser();
        await finishSocial('apple', intent, data.user);
    };

    const onGoogle = async (intent: Intent) => {
        setSsoBand(null);
        if (isOffline()) { setSsoBand(offlineBand); return; }
        setWaiting('google');
        const left = await startGoogle(intent, window.location.search);
        if (!left) {
            setWaiting(null);
            setSsoBand({ kind: 'e', text: ssoFailedText('google', intent) });
        }
    };

    // ── M1 · Giriş ──────────────────────────────────────────────────────────
    const submitLogin = async (e: FormEvent) => {
        e.preventDefault();
        if (busy || locked) return;
        const address = email.trim();
        if (!address || !password) {
            setErrEmail(!address);
            setErrPassword(!password);
            setBand({ kind: 'e', text: METIN.fillLogin });
            return;
        }
        if (!emailLooksValid(address)) {
            setErrEmail(true);
            setBand({ kind: 'e', text: METIN.badEmail });
            return;
        }
        if (isOffline()) { setBand(offlineBand); return; }
        setBusy(true);
        setBand(null);
        setErrEmail(false);
        setErrPassword(false);
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (!error) { enter('login'); return; }
        const failure = classifyAuthError(error as AuthErrorLike);
        if (failure === 'not_confirmed') {
            // Hesap açılmış ama e-posta doğrulanmamış: kodu yeniden gönder, kod ekranına geç.
            await supabase.auth.resend({ type: 'signup', email: address });
            setBusy(false);
            openCode(address, 'code');
            return;
        }
        setBusy(false);
        if (failure === 'invalid_credentials') {
            setErrPassword(true);
            setBand({ kind: 'e', text: METIN.wrongCredentials });
        } else if (failure === 'rate_limited') {
            lock('form');
        } else if (failure === 'offline') {
            setBand(offlineBand);
        } else {
            setBand({ kind: 'e', text: METIN.loginFailed });
        }
    };

    // ── M4 · Kayıt ──────────────────────────────────────────────────────────
    const submitSignup = async (e: FormEvent) => {
        e.preventDefault();
        if (busy || locked) return;
        const address = email.trim();
        if (!emailLooksValid(address)) {
            setErrEmail(true);
            setErrPassword(false);
            setBand({ kind: 'e', text: METIN.badEmail });
            return;
        }
        if (!passwordOk(password)) {
            setErrEmail(false);
            setErrPassword(true);
            setBand({ kind: 'e', text: METIN.weakPassword });
            return;
        }
        if (isOffline()) { setBand(offlineBand); return; }
        setBusy(true);
        setBand(null);
        setErrEmail(false);
        setErrPassword(false);
        // `kaynak: 'web'` (göç 124): masaüstü kaydı kartsız telefon denemesi
        // almaz; deneme kurulumun sonunda kartla başlar.
        const { data, error } = await supabase.auth.signUp({ email: address, password, options: { data: { kaynak: 'web' } } });
        if (!error && data.session) { enter('signup'); return; }

        const failure = error ? classifyAuthError(error as AuthErrorLike) : null;
        // Kayıtlı e-posta: otomatik onay açıkken sunucu "already registered"
        // der, kapalıyken kimliksiz sahte bir kullanıcı döner. İkisinde de
        // şifre uyuyorsa kişi içeri girer; uymuyorsa kod ekranı — sızdırmama.
        const existing = failure === 'exists' || (!error && !data.session && (data.user?.identities?.length ?? 0) === 0);
        if (existing) {
            const again = await supabase.auth.signInWithPassword({ email: address, password });
            setBusy(false);
            if (!again.error) { enter('existing'); return; }
            openCode(address, 'code');
            return;
        }
        setBusy(false);
        if (!error) { openCode(address, 'code'); return; }
        if (failure === 'weak_password') {
            setErrPassword(true);
            setBand({ kind: 'e', text: METIN.weakPassword });
        } else if (failure === 'invalid_email') {
            setErrEmail(true);
            setBand({ kind: 'e', text: METIN.badEmail });
        } else if (failure === 'rate_limited' || failure === 'email_rate_limited') {
            lock('form');
        } else if (failure === 'offline') {
            setBand(offlineBand);
        } else {
            setBand({ kind: 'e', text: METIN.signupFailed });
        }
    };

    // ── M5 / M9 · Kod ───────────────────────────────────────────────────────
    const codeFailed = (error: AuthErrorLike) => {
        const failure = classifyAuthError(error);
        if (failure === 'otp_invalid') {
            setErrCode(true);
            setBand({ kind: 'e', text: METIN.codeWrong });
            // Rakamlar silinmez; ilk tuşla seçili olanların yerine yazılır.
            window.setTimeout(() => { codeRef.current?.focus(); codeRef.current?.select(); }, 0);
        } else if (failure === 'rate_limited') {
            lock('code');
        } else if (failure === 'offline') {
            setBand(offlineBand);
        } else {
            setErrCode(true);
            setBand({ kind: 'e', text: METIN.codeWrong });
        }
    };

    const verifyCode = async (value: string) => {
        if (verifying || codeLocked || value.length !== 6) return;
        if (screen.name !== 'code' && screen.name !== 'reset-code') return;
        if (isOffline()) { setBand(offlineBand); return; }
        setVerifying(true);
        setBand(null);
        setErrCode(false);
        const address = screen.email;
        const { error } = await supabase.auth.verifyOtp({
            email: address,
            token: value,
            type: screen.name === 'code' ? 'signup' : 'recovery',
        });
        setVerifying(false);
        if (error) { codeFailed(error as AuthErrorLike); return; }
        if (screen.name === 'code') { enter('signup'); return; }
        setNewPassword('');
        go({ name: 'reset-password', email: address });
    };

    const onCodeChange = (value: string) => {
        setCode(value);
        if (errCode) { setErrCode(false); setBand((b) => (b?.text === METIN.codeWrong ? null : b)); }
        // 6. hanede kendiliğinden doğrular; Doğrula düğmesi Enter ve yarım yapıştırma için yedek.
        if (value.length === 6) void verifyCode(value);
    };

    const resendCode = async () => {
        if (screen.name !== 'code' && screen.name !== 'reset-code') return;
        if (isOffline()) { setBand(offlineBand); return; }
        const address = screen.email;
        const { error } = screen.name === 'code'
            ? await supabase.auth.resend({ type: 'signup', email: address })
            : await supabase.auth.resetPasswordForEmail(address);
        const failure = error ? classifyAuthError(error as AuthErrorLike) : null;
        if (failure === 'offline') { setBand(offlineBand); return; }
        setCode('');
        setErrCode(false);
        setCodeSentAt(Date.now());
        setBand(failure === 'email_rate_limited' || failure === 'rate_limited' ? { kind: 'w', text: METIN.resendLater } : null);
        codeRef.current?.focus();
    };

    // ── M8 · Şifre yenileme: e-posta ────────────────────────────────────────
    const submitResetEmail = async (e: FormEvent) => {
        e.preventDefault();
        if (busy || locked) return;
        const address = email.trim();
        if (!emailLooksValid(address)) {
            setErrEmail(true);
            setBand({ kind: 'e', text: METIN.badEmail });
            return;
        }
        if (isOffline()) { setBand(offlineBand); return; }
        setBusy(true);
        setBand(null);
        setErrEmail(false);
        const { error } = await supabase.auth.resetPasswordForEmail(address);
        setBusy(false);
        const failure = error ? classifyAuthError(error as AuthErrorLike) : null;
        if (failure === 'offline') { setBand(offlineBand); return; }
        if (failure === 'rate_limited') { lock('form'); return; }
        // Her e-postaya aynı cevap: kod ekranı. E-posta başına bekleme süresi
        // de ekrana yansımaz — yansısaydı adresin kayıtlı olduğu okunurdu.
        if (failure && failure !== 'email_rate_limited') {
            setBand({ kind: 'e', text: 'Kod şu an gönderilemedi. Biraz sonra yeniden deneyin.' });
            return;
        }
        openCode(address, 'reset-code');
    };

    // ── M10 · Yeni şifre ────────────────────────────────────────────────────
    const submitNewPassword = async (e: FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!passwordOk(newPassword)) {
            setErrPassword(true);
            setBand({ kind: 'e', text: METIN.weakPassword });
            return;
        }
        if (isOffline()) { setBand(offlineBand); return; }
        setBusy(true);
        setBand(null);
        setErrPassword(false);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        setBusy(false);
        if (!error) { enter('reset'); return; }
        const failure = classifyAuthError(error as AuthErrorLike);
        if (failure === 'same_password') {
            setErrPassword(true);
            setBand({ kind: 'e', text: METIN.samePassword });
        } else if (failure === 'weak_password') {
            setErrPassword(true);
            setBand({ kind: 'e', text: METIN.weakPassword });
        } else if (failure === 'offline') {
            setBand(offlineBand);
        } else {
            setBand({ kind: 'e', text: METIN.passwordSaveFailed });
        }
    };

    // ── M3 · Köprü ──────────────────────────────────────────────────────────
    const bridgeCreate = async () => {
        if (busy) return;
        setBusy(true);
        const ok = await createOwnBusiness();
        // Uygulama "işletmesi yok" bilgisini giriş anında aldı — tazele, yoksa
        // Kurulum sihirbazı kaydedemez (AuthContext.refreshOrg notu).
        if (ok) await refreshOrg();
        setBusy(false);
        if (ok) { enter('signup'); return; }
        setBand({ kind: 'e', text: METIN.signupFailed });
    };
    const bridgeEmail = async () => {
        // Arkada açılan boş hesap sunucuda 24 saat sonra silinir (karar 3).
        await supabase.auth.signOut();
        go({ name: 'login' });
    };

    if (splash) {
        return (
            <SplashScreen onDone={() => {
                navigate(splash.dest, { replace: true });
                if (splash.notice) { const text = splash.notice; window.setTimeout(() => showLoginNotice(text), 0); }
            }} />
        );
    }

    // ── Görünüm ─────────────────────────────────────────────────────────────
    const year = new Date().getFullYear();
    const formDim = waiting !== null ? ' lg-dim' : '';

    const renderLogin = () => (
        <>
            <div className="lg-ph">
                <h1>Hesabınıza girin</h1>
                <p>{SOCIAL_ENABLED ? 'Apple, Google ya da e-postanızla girin.' : 'E-posta adresiniz ve şifrenizle girin.'}</p>
            </div>
            {SOCIAL_ENABLED && (
                <>
                    <Band band={ssoBand} />
                    <SsoButtons intent="login" waiting={waiting} onApple={() => void onApple('login')} onGoogle={() => void onGoogle('login')} />
                </>
            )}
            <div className={`lg-grp${formDim}`}>
                {SOCIAL_ENABLED && <div className="lg-or" role="separator">ya da</div>}
                <form onSubmit={submitLogin} noValidate>
                    <div className="lg-fl">
                        <label className="lg-lb" htmlFor="lg-email">E-posta</label>
                        <EmailInput id="lg-email" ref={emailRef} value={email} invalid={errEmail}
                            onChange={(v) => { setEmail(v); if (errEmail) setErrEmail(false); if (band?.kind === 'e') setBand(null); }} />
                    </div>
                    <div className="lg-fl">
                        <div className="lg-lr">
                            <label className="lg-lb" htmlFor="lg-password">Şifre</label>
                            <button type="button" className="lg-a" onClick={() => go({ name: 'reset-email' })}>Şifremi unuttum</button>
                        </div>
                        <PasswordInput id="lg-password" ref={passwordRef} autoComplete="current-password" value={password} invalid={errPassword}
                            onChange={(v) => { setPassword(v); if (errPassword) setErrPassword(false); if (band?.kind === 'e') setBand(null); }} />
                    </div>
                    <Band band={band} />
                    <button className={`lg-btn${locked ? ' lg-off' : ''}`} type="submit" aria-disabled={locked || undefined} aria-busy={busy || undefined}>
                        {busy ? <Wait>Giriş yapılıyor</Wait> : 'Giriş yap'}
                    </button>
                </form>
                <p className="lg-alt">
                    Hesabınız yok mu?{' '}
                    <button type="button" className="lg-a" onClick={() => { setPassword(''); go({ name: 'signup' }); }}>Yeni işletme oluşturun</button>
                </p>
            </div>
        </>
    );

    const renderSignup = () => (
        <>
            {plan && (
                <span className="lg-plan"><IconTag />{plan.name} · {cycle === 'yearly' ? 'yıllık' : 'aylık'} seçildi</span>
            )}
            <div className="lg-ph">
                <h1>Hesabınızı açalım</h1>
                <p>{SOCIAL_ENABLED ? 'Apple, Google ya da e-postanızla hesap açın.' : 'E-posta adresinizle hesap açın.'}</p>
            </div>
            {SOCIAL_ENABLED && (
                <>
                    <Band band={ssoBand} />
                    <SsoButtons intent="signup" waiting={waiting} onApple={() => void onApple('signup')} onGoogle={() => void onGoogle('signup')} />
                </>
            )}
            <div className={`lg-grp${formDim}`}>
                {SOCIAL_ENABLED && <div className="lg-or" role="separator">ya da</div>}
                <form onSubmit={submitSignup} noValidate>
                    <div className="lg-fl">
                        <label className="lg-lb" htmlFor="lg-email">E-posta</label>
                        <EmailInput id="lg-email" ref={emailRef} value={email} invalid={errEmail}
                            onChange={(v) => { setEmail(v); if (errEmail) setErrEmail(false); if (band?.kind === 'e') setBand(null); }} />
                    </div>
                    <div className="lg-fl">
                        <div className="lg-lr"><label className="lg-lb" htmlFor="lg-password">Şifre</label></div>
                        <PasswordInput id="lg-password" ref={passwordRef} autoComplete="new-password" value={password} invalid={errPassword}
                            aria-describedby="lg-rule"
                            onChange={(v) => { setPassword(v); if (errPassword) setErrPassword(false); if (band?.kind === 'e') setBand(null); }} />
                        <div id="lg-rule"><PasswordRule ok={passwordOk(password)} /></div>
                    </div>
                    <Band band={band} />
                    <button className={`lg-btn${locked ? ' lg-off' : ''}`} type="submit" aria-disabled={locked || undefined} aria-busy={busy || undefined}>
                        {busy ? <Wait>Hesap açılıyor</Wait> : 'Devam'}
                    </button>
                </form>
                <p className="lg-alt">
                    Zaten hesabınız var mı?{' '}
                    <button type="button" className="lg-a" onClick={() => { setPassword(''); go({ name: 'login' }); }}>Giriş yapın</button>
                </p>
            </div>
            <p className="lg-legal">Bilgileriniz <PrivacyLink />'na göre işlenir.</p>
        </>
    );

    const renderCode = (address: string, kind: 'code' | 'reset-code') => {
        const ready = code.length === 6 && !codeLocked && !verifying;
        return (
            <>
                {kind === 'reset-code' && (
                    <div className="lg-top">
                        <button className="lg-back" type="button" aria-label="Geri" onClick={() => go({ name: 'reset-email' })}><IconBack /></button>
                    </div>
                )}
                <div className="lg-ph">
                    <h1>Kodu girin</h1>
                    <p>
                        {kind === 'reset-code' && 'Hesabınız varsa '}<b>{address}</b> adresine 6 haneli kod gönderdik. Luera TimeFlow'dan gelen e-postadaki kodu girin.
                    </p>
                </div>
                <form className="lg-tight" noValidate onSubmit={(e) => { e.preventDefault(); void verifyCode(code); }}>
                    <OtpBox id="lg-code" ref={codeRef} value={code} invalid={errCode} disabled={codeLocked} onChange={onCodeChange} />
                    {verifying && <p className="lg-ost" role="status"><Wait>Kod doğrulanıyor</Wait></p>}
                    <Band band={band} />
                    <button className={`lg-btn${ready ? '' : ' lg-off'}`} type="submit" aria-disabled={!ready || undefined}>Doğrula</button>
                </form>
                <Resend
                    secondsLeft={resendLeft}
                    disabled={codeLocked}
                    onResend={() => void resendCode()}
                    onChangeEmail={() => go(kind === 'code' ? { name: 'signup' } : { name: 'reset-email' })}
                />
                {kind === 'code' && (
                    <p className="lg-small lg-c">
                        Kod gelmediyse bu adresle zaten hesabınız olabilir:{' '}
                        <button type="button" className="lg-a" onClick={() => { setPassword(''); go({ name: 'login' }); }}>Giriş yapın</button>
                        {' · '}
                        <button type="button" className="lg-a" onClick={() => go({ name: 'reset-email' })}>Şifremi unuttum</button>
                    </p>
                )}
            </>
        );
    };

    const renderResetEmail = () => (
        <>
            <div className="lg-top">
                <button className="lg-back" type="button" aria-label="Girişe dön" onClick={() => go({ name: 'login' })}><IconBack /></button>
            </div>
            <div className="lg-ph">
                <h1>Yeni şifre belirleyin</h1>
                <p>Hesabınızın e-posta adresini yazın; size 6 haneli bir kod gönderelim.</p>
            </div>
            <form onSubmit={submitResetEmail} noValidate>
                <div className="lg-fl">
                    <label className="lg-lb" htmlFor="lg-email">E-posta</label>
                    <EmailInput id="lg-email" ref={emailRef} value={email} invalid={errEmail}
                        onChange={(v) => { setEmail(v); if (errEmail) setErrEmail(false); if (band?.kind === 'e') setBand(null); }} />
                </div>
                <Band band={band} />
                <button className={`lg-btn${locked ? ' lg-off' : ''}`} type="submit" aria-disabled={locked || undefined} aria-busy={busy || undefined}>
                    {busy ? <Wait>Kod gönderiliyor</Wait> : 'Kod gönder'}
                </button>
            </form>
            <p className="lg-small lg-c">Hesabınız varsa kodu birkaç dakika içinde alırsınız.</p>
        </>
    );

    const renderNewPassword = (address: string) => (
        <>
            <div className="lg-ph">
                <h1>Yeni şifreniz</h1>
                <p>Bundan sonra e-postanız ve bu şifreyle girersiniz.</p>
            </div>
            <form onSubmit={submitNewPassword} noValidate>
                {/* Tarayıcı yeni şifreyi doğru hesaba kaydetsin. */}
                <input type="email" name="email" autoComplete="username" value={address} readOnly hidden />
                <div className="lg-fl">
                    <div className="lg-lr"><label className="lg-lb" htmlFor="lg-new-password">Yeni şifre</label></div>
                    <PasswordInput id="lg-new-password" ref={passwordRef} autoComplete="new-password" value={newPassword} invalid={errPassword}
                        aria-describedby="lg-rule"
                        onChange={(v) => { setNewPassword(v); if (errPassword) setErrPassword(false); if (band?.kind === 'e') setBand(null); }} />
                    <div id="lg-rule"><PasswordRule ok={passwordOk(newPassword)} /></div>
                </div>
                <Band band={band} />
                <button className="lg-btn" type="submit" aria-busy={busy || undefined}>
                    {busy ? <Wait>Kaydediliyor</Wait> : 'Şifreyi kaydet'}
                </button>
            </form>
        </>
    );

    const renderBridge = (provider: Provider, address: string) => (
        <>
            <div className="lg-ph">
                <h1>Bu hesapla bir işletme bulamadık</h1>
                <p>{provider === 'apple' ? 'Apple' : 'Google'} ile girdiniz; bu hesaba bağlı bir işletme yok.</p>
            </div>
            <div className="lg-acct">
                <b>{provider === 'apple' ? "Apple'ın verdiği adres" : 'Google hesabınız'}</b>
                <span>{address}</span>
            </div>
            <Band band={band} />
            <div className="lg-stack">
                <button className="lg-btn" type="button" onClick={() => void bridgeCreate()} aria-busy={busy || undefined}>
                    {busy ? <Wait>İşletme açılıyor</Wait> : 'Yeni işletme oluştur'}
                </button>
                <button className="lg-btn2" type="button" onClick={() => void bridgeEmail()}>E-postayla giriş yap</button>
            </div>
            {provider === 'apple' && (
                <p className="lg-small">Apple'da 'E-postamı gizle'yi seçtiyseniz Apple bize farklı bir adres verir; eski hesabınız bu yüzden bulunamamış olabilir.</p>
            )}
        </>
    );

    const content = (() => {
        switch (screen.name) {
            case 'login': return renderLogin();
            case 'signup': return renderSignup();
            case 'code': return renderCode(screen.email, 'code');
            case 'reset-email': return renderResetEmail();
            case 'reset-code': return renderCode(screen.email, 'reset-code');
            case 'reset-password': return renderNewPassword(screen.email);
            case 'bridge': return renderBridge(screen.provider, screen.email);
        }
    })();

    return (
        <div className="lg" data-theme={dark ? 'dark' : 'light'}>
            <LightField />
            <div className="lg-blk">
                <div className="lg-head"><Brand /></div>
                <main className="lg-stage">
                    <div className="lg-pr">
                        <p className="lg-promise">Salonunuzun randevuları, kasası ve ekibi tek yerde.</p>
                        <p className="lg-sub">Telefonda ve bilgisayarda aynı hesapla girersiniz.</p>
                    </div>
                    <div className="lg-rgt">
                        <div className="lg-plate" ref={plateRef}>
                            <div key={screen.name} className={`lg-in${swapped ? ' lg-swap' : ''}`}>
                                {content}
                            </div>
                        </div>
                    </div>
                </main>
                <p className="lg-copy">
                    <span>© {year} Luera TimeFlow</span>
                    <span aria-hidden="true">·</span>
                    <PrivacyLink />
                </p>
            </div>
        </div>
    );
};
