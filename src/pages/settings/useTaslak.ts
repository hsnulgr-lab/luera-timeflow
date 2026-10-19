/**
 * Ayarlar — "yazılan alan ve tablo → bölüm başına taslak" kuralı.
 *
 * ── Neden ───────────────────────────────────────────────────────────────────
 *
 * Eski Ayarlar'da dört ayrı kaydetme davranışı vardı (anında, sağ üstteki
 * Kaydet, alandan çıkınca, kutunun kendi Kaydet'i) ve hiçbiri söylenmiyordu.
 * Yeni kural tek: anahtarlar anında (`useSwitchSave`), yazılanlar bu kancayla
 * bölüm başına taslakta durur; değişince alttaki çubuk çıkar.
 *
 * ── Sunucu onaylamadan "Kaydedildi" yazılmaz ────────────────────────────────
 *
 * `save` true dönerse 'saved'; false ya da metin dönerse 'error' (metin
 * çubukta yazar). Cevap 15 sn'de gelmezse 'unknown': ne "kaydedildi" ne
 * "kaydedilmedi" — yazılmış olabilir (bkz. 00-BASLA-BURADAN · kural 1).
 *
 * ── Başka bölüme geçerken ───────────────────────────────────────────────────
 *
 * Kirli taslak `TaslakKaydi` bağlamına kayıtlıdır; Ayarlar kabuğu menüden ya
 * da aramadan bölüm değiştirirken sorar (S2: Kal · Değişiklikleri at · Kaydet
 * ve geç) ve sayfa kapanırken tarayıcının kendi uyarısını açar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { draftSummary } from './ayarlarModel';

export type SaveState = 'clean' | 'dirty' | 'invalid' | 'saving' | 'saved' | 'unknown' | 'error' | 'offline';

/** true = sunucu onayladı · false = reddetti · metin = reddetti, sebebi bu. */
export type SaveOutcome = boolean | string;

export const SAVE_TIMEOUT_MS = 15_000;
const TIMEOUT = Symbol('timeout');

/** Söz 15 sn'de dönmezse `TIMEOUT` — "cevap gelmedi" hâli. */
export async function withTimeout<T>(p: Promise<T>, ms = SAVE_TIMEOUT_MS): Promise<T | typeof TIMEOUT> {
    let t: number | undefined;
    const timer = new Promise<typeof TIMEOUT>((res) => { t = window.setTimeout(() => res(TIMEOUT), ms); });
    try { return await Promise.race([p, timer]); } finally { window.clearTimeout(t); }
}
export const isTimeout = (v: unknown): v is typeof TIMEOUT => v === TIMEOUT;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface TaslakOptions<T extends object> {
    /** Sunucudaki (kayıtlı) değer. Taslak temizken bunu izler. */
    saved: T;
    /** Alan anahtarı → ekranda adı ("İşletme adı"). Çubuğun alt satırı buradan. */
    labels: Partial<Record<keyof T, string>>;
    /** Hata metni ya da null. Hata varken Kaydet kapalı. */
    validate?: (draft: T) => string | null;
    save: (draft: T, saved: T) => Promise<SaveOutcome>;
    /** Kaydı sağlanırsa kabuk bu adla sorar: "İşletme profili'nde …". */
    sectionLabel?: string;
}

export interface Taslak<T extends object> {
    draft: T;
    set: (patch: Partial<T>) => void;
    dirty: boolean;
    state: SaveState;
    error: string | null;
    summary: string;
    changedKeys: (keyof T)[];
    isChanged: (key: keyof T) => boolean;
    save: () => Promise<boolean>;
    discard: () => void;
}

export function useTaslak<T extends object>(opts: TaslakOptions<T>): Taslak<T> {
    const { saved, labels, validate, sectionLabel } = opts;
    const saveRef = useRef(opts.save);
    saveRef.current = opts.save;

    const [draft, setDraft] = useState<T>(saved);
    const [touched, setTouched] = useState(false);
    const [phase, setPhase] = useState<'idle' | 'saving' | 'saved' | 'unknown' | 'error'>('idle');
    const [serverError, setServerError] = useState<string | null>(null);
    const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
    const doneTimer = useRef<number | undefined>(undefined);

    // Temizken kayıtlı değeri izle (sunucudan geç gelen veri taslağı ezmez).
    const savedKey = JSON.stringify(saved);
    useEffect(() => {
        if (!touched) setDraft(saved);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedKey]);

    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.clearTimeout(doneTimer.current); };
    }, []);

    const changedKeys = useMemo(
        () => (Object.keys(draft) as (keyof T)[]).filter((k) => !same(draft[k], saved[k])),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [draft, savedKey],
    );
    const dirty = touched && changedKeys.length > 0;
    const invalid = dirty && validate ? validate(draft) : null;

    const set = useCallback((patch: Partial<T>) => {
        setDraft((d) => ({ ...d, ...patch }));
        setTouched(true);
        setPhase((p) => (p === 'error' || p === 'unknown' ? 'idle' : p));
        setServerError(null);
    }, []);

    const discard = useCallback(() => {
        setDraft(saved);
        setTouched(false);
        setPhase('idle');
        setServerError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedKey]);

    const save = useCallback(async (): Promise<boolean> => {
        if (!dirty || invalid || phase === 'saving' || !online) return false;
        setPhase('saving');
        setServerError(null);
        const out = await withTimeout(saveRef.current(draft, saved).catch(() => false as SaveOutcome));
        if (isTimeout(out)) { setPhase('unknown'); return false; }
        if (out === true) {
            setPhase('saved');
            setTouched(false);
            window.clearTimeout(doneTimer.current);
            doneTimer.current = window.setTimeout(() => setPhase('idle'), 1200);
            return true;
        }
        setServerError(typeof out === 'string' ? out : null);
        setPhase('error');
        return false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty, invalid, phase, online, draft, savedKey]);

    let state: SaveState;
    if (phase === 'saving') state = 'saving';
    else if (phase === 'saved') state = 'saved';
    else if (phase === 'unknown') state = 'unknown';
    else if (!dirty) state = 'clean';
    else if (invalid) state = 'invalid';
    else if (!online) state = 'offline';
    else if (phase === 'error') state = 'error';
    else state = 'dirty';

    const names = changedKeys.map((k) => labels[k]).filter(Boolean) as string[];
    const summary = draftSummary(names.length ? names : changedKeys.map(String));

    const api: Taslak<T> = {
        draft, set, dirty, state, error: invalid ?? serverError, summary, changedKeys,
        isChanged: (k) => dirty && changedKeys.includes(k),
        save, discard,
    };

    useTaslakKaydi(sectionLabel ? { label: sectionLabel, dirty, names, save, discard } : null);
    return api;
}

// ── Kabuğa kayıt ────────────────────────────────────────────────────────────

export interface KayitliTaslak {
    label: string;
    dirty: boolean;
    names: string[];
    save: () => Promise<boolean>;
    discard: () => void;
}

export interface TaslakKaydiCtx {
    register: (id: string, t: KayitliTaslak | null) => void;
}

export const TaslakKaydiContext = createContext<TaslakKaydiCtx | null>(null);

let seq = 0;

/** Taslağı kabuğa bildirir; kabuk yoksa (test, başka sayfa) sessizce geçer. */
export function useTaslakKaydi(t: KayitliTaslak | null) {
    const ctx = useContext(TaslakKaydiContext);
    const idRef = useRef<string>('');
    if (!idRef.current) idRef.current = `t${++seq}`;
    const latest = useRef(t);
    latest.current = t;
    const dirty = t?.dirty ?? false;
    const namesKey = t ? t.names.join('|') : '';
    useEffect(() => {
        if (!ctx) return;
        const cur = latest.current;
        ctx.register(idRef.current, cur && cur.dirty ? {
            ...cur,
            save: () => latest.current?.save() ?? Promise.resolve(false),
            discard: () => latest.current?.discard(),
        } : null);
    }, [ctx, dirty, namesKey]);
    useEffect(() => () => { ctx?.register(idRef.current, null); }, [ctx]);
}
