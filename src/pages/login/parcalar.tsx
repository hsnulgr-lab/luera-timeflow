// Masaüstü girişin görünüm parçaları — tasarımın (Giriş v2.1) bileşenleri.
// Durum tutmazlar; LoginPage yönetir.
import { forwardRef, useState, type ReactNode, type InputHTMLAttributes } from 'react';
import { cleanCode, formatCountdown } from './girisKurallari';

// ── Simgeler (tasarımın sembolleri, aynı çizgi kalınlıklarıyla) ─────────────

const stroke = (w: number) => ({ fill: 'none', stroke: 'currentColor', strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const IconMail = () => (
    <svg className="lg-ic" viewBox="0 0 24 24" aria-hidden="true" {...stroke(1.7)}><path d="M3.6 6.4h16.8v11.2H3.6zM3.6 6.4 12 13l8.4-6.6" /></svg>
);
const IconEye = () => (
    <svg className="lg-ic" viewBox="0 0 24 24" aria-hidden="true" {...stroke(1.7)}><path d="M2.6 12S6 6.6 12 6.6 21.4 12 21.4 12 18 17.4 12 17.4 2.6 12 2.6 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
);
const IconEyeOff = () => (
    <svg className="lg-ic" viewBox="0 0 24 24" aria-hidden="true" {...stroke(1.7)}><path d="M4 4l16 16M9.9 6.9A9.6 9.6 0 0 1 12 6.6C18 6.6 21.4 12 21.4 12a15.6 15.6 0 0 1-2.8 3.4M14 14.1A2.8 2.8 0 0 1 9.9 10M6.5 8.2A15.7 15.7 0 0 0 2.6 12S6 17.4 12 17.4c1.4 0 2.6-.3 3.7-.8" /></svg>
);
export const IconBack = () => (
    <svg className="lg-ic" viewBox="0 0 24 24" aria-hidden="true" {...stroke(2)}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconCheck = ({ width = 2.6 }: { width?: number }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke(width)}><path d="M4.5 12.6 9.4 17.5 19.5 7" /></svg>
);
export const IconTag = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke(1.8)}><path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z" /><circle cx="8" cy="9" r="1.3" /></svg>
);
const IconApple = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.820-2.323-4.630-2.323-7.280 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" /></svg>
);
const IconGoogle = () => (
    <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.570-.15-3.090-.38-4.550H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.930-2.130 15.890-5.810l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

// ── Işık alanı ──────────────────────────────────────────────────────────────

/** Beş kütle + ortam ışığı + perde + plakanın arkasında sakin bölge. Yalnız CSS. */
export function LightField() {
    return (
        <div className="lg-field" aria-hidden="true">
            <div className="lg-amb" />
            <div className="lg-fb">
                <div className="lg-anc">
                    <i className="lg-m1" /><i className="lg-m2" /><i className="lg-m3" /><i className="lg-m4" /><i className="lg-m5" />
                </div>
            </div>
            <div className="lg-veil" />
            <div className="lg-cw"><div className="lg-calm" /></div>
        </div>
    );
}

export function Brand() {
    return (
        <span className="lg-brand" aria-label="luera timeflow">
            luera<span className="lg-tf" aria-hidden="true">timeflow</span>
        </span>
    );
}

// ── Bant ────────────────────────────────────────────────────────────────────

export type BandKind = 'e' | 'w' | 'n';
export interface BandState { kind: BandKind; text: string }

export function Band({ band }: { band: BandState | null }) {
    if (!band) return null;
    return (
        <div className={`lg-bnd lg-${band.kind}`} role={band.kind === 'e' ? 'alert' : 'status'}>
            {band.text}
        </div>
    );
}

// ── Apple / Google ──────────────────────────────────────────────────────────

export function SsoButtons({ intent, waiting, onApple, onGoogle }: {
    intent: 'login' | 'signup';
    waiting: 'apple' | 'google' | null;
    onApple: () => void;
    onGoogle: () => void;
}) {
    const appleLabel = intent === 'login' ? 'Apple ile Giriş Yap' : 'Apple ile Kaydol';
    const googleLabel = intent === 'login' ? 'Google ile giriş yap' : 'Google ile kaydol';
    const waitDots = <span className="lg-dots"><i /><i /><i /></span>;
    return (
        <div className="lg-sso-g">
            <div className={waiting === 'google' ? 'lg-dim' : undefined}>
                <button className="lg-sso lg-ap" type="button" onClick={onApple} disabled={waiting !== null} aria-busy={waiting === 'apple'}>
                    {waiting === 'apple'
                        ? <span className="lg-wait"><span>Apple ile giriliyor</span>{waitDots}</span>
                        : <><IconApple /><span>{appleLabel}</span></>}
                </button>
            </div>
            <div className={waiting === 'apple' ? 'lg-dim' : undefined}>
                <button className="lg-sso lg-gg" type="button" onClick={onGoogle} disabled={waiting !== null} aria-busy={waiting === 'google'}>
                    {waiting === 'google'
                        ? <span className="lg-wait"><span>Google ile giriliyor</span>{waitDots}</span>
                        : <><IconGoogle /><span>{googleLabel}</span></>}
                </button>
            </div>
        </div>
    );
}

// ── Alanlar ─────────────────────────────────────────────────────────────────

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string;
    onChange: (value: string) => void;
    invalid?: boolean;
};

export const EmailInput = forwardRef<HTMLInputElement, InputProps>(function EmailInput({ value, onChange, invalid, ...rest }, ref) {
    return (
        <div className={`lg-inp${invalid ? ' lg-err' : ''}`}>
            <IconMail />
            <input
                ref={ref}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ornek@salonunuz.com"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={invalid || undefined}
                {...rest}
            />
        </div>
    );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput({ value, onChange, invalid, ...rest }, ref) {
    const [shown, setShown] = useState(false);
    return (
        <div className={`lg-inp${invalid ? ' lg-err' : ''}`}>
            <input
                ref={ref}
                type={shown ? 'text' : 'password'}
                name="password"
                placeholder="••••••••"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={invalid || undefined}
                {...rest}
            />
            <button className="lg-eye" type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Şifreyi gizle' : 'Şifreyi göster'}>
                {shown ? <IconEyeOff /> : <IconEye />}
            </button>
        </div>
    );
});

export function PasswordRule({ ok }: { ok: boolean }) {
    return (
        <p className="lg-rule">
            <i className={ok ? 'lg-ok' : undefined}>{ok && <IconCheck />}</i>
            <span>En az 8 karakter olsun, içinde bir rakam bulunsun.</span>
        </p>
    );
}

// ── Kod kutusu ──────────────────────────────────────────────────────────────

/**
 * Tek <input> (one-time-code, numeric); 6 kutu yalnız görünüm. Yapıştırma ve
 * tarayıcının "kodu doldur" önerisi çalışır.
 */
export const OtpBox = forwardRef<HTMLInputElement, {
    id: string;
    value: string;
    onChange: (value: string) => void;
    invalid?: boolean;
    disabled?: boolean;
}>(function OtpBox({ id, value, onChange, invalid, disabled }, ref) {
    const [focused, setFocused] = useState(false);
    const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
    return (
        <div className={`lg-otp${invalid ? ' lg-err' : ''}${disabled ? ' lg-off' : ''}`}>
            <label className="lg-sr" htmlFor={id}>6 haneli kod</label>
            {cells.map((digit, i) => (
                <span key={i} className={`lg-cell${focused && !disabled && i === value.length ? ' lg-cur' : ''}`} aria-hidden="true">{digit}</span>
            ))}
            <input
                ref={ref}
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={value}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                onChange={(e) => onChange(cleanCode(e.target.value))}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
            />
        </div>
    );
});

export function Resend({ secondsLeft, disabled, onResend, onChangeEmail }: {
    secondsLeft: number;
    disabled: boolean;
    onResend: () => void;
    onChangeEmail: () => void;
}) {
    const locked = disabled || secondsLeft > 0;
    return (
        <div className="lg-resend">
            <span className="lg-r1">
                Kod gelmedi mi?{' '}
                <button type="button" className={`lg-a lg-rs${locked ? ' lg-dis' : ''}`} aria-disabled={locked || undefined} onClick={() => { if (!locked) onResend(); }}>
                    Yeniden gönder
                </button>
                {secondsLeft > 0 && !disabled && <span className="lg-tm">{formatCountdown(secondsLeft)}</span>}
            </span>
            <button type="button" className="lg-a lg-chg" onClick={onChangeEmail}>E-postayı değiştir</button>
        </div>
    );
}

export function Wait({ children }: { children: ReactNode }) {
    return <span className="lg-wait"><span>{children}</span><span className="lg-dots"><i /><i /><i /></span></span>;
}

export function PrivacyLink({ children = 'Gizlilik Politikası' }: { children?: ReactNode }) {
    return <a className="lg-a" href="/gizlilik.html" target="_blank" rel="noopener">{children}</a>;
}
