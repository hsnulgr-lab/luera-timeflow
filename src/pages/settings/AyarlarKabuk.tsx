/**
 * Ayarlar kabuğu — tasarım: "Luera Masaustu - Ayarlar v1.1".
 *
 * Eski sayfa 9 düz sekme + başlıkta ayrı bir "Entegrasyonlar" düğmesiydi;
 * sekme çubuğu iki satıra taşıyordu ve bir ayarın nerede olduğu tahmin
 * edilemiyordu. Yeni hâli: solda gruplu Ayarlar menüsü (üstünde arama),
 * sağda seçili bölüm. Dar genişlikte menü içeriğin üstünde açılır seçiciye
 * döner (R2/R3) — kırılımlar ayarlar.css'te kap sorgusuyla.
 *
 * Kaydedilmemiş bir taslak varken bölüm değiştirmek sorulur (S2); sayfa
 * kapanırken tarayıcının kendi uyarısı açılır.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useReservations } from '@/hooks/useReservations';
import { profileForSector } from '@/lib/sectorProfiles';
import './ayarlar.css';
import {
    GROUP_LABEL, legacyTabTarget, resourcesLabel, searchSettings, sectionFromPath, sectionHref,
    visibleSections, withCase, type SearchEntry, type SectionDef, type SectionGroup, type SectionId,
} from './ayarlarModel';
import { AyIkonlar, I, Modal } from './parcalar';
import { TaslakKaydiContext, type KayitliTaslak } from './useTaslak';
import { Ozet } from './bolumler/Ozet';
import { Isletme } from './bolumler/Isletme';
import { Saatler } from './bolumler/Saatler';
import { Hizmetler } from './bolumler/Hizmetler';
import { Kaynaklar } from './bolumler/Kaynaklar';
import { Moduller } from './bolumler/Moduller';
import { OnlineRandevu } from './bolumler/OnlineRandevu';
import { WhatsApp } from './bolumler/WhatsApp';
import { Sadakat } from './bolumler/Sadakat';
import { Hesabim } from './bolumler/Hesabim';
import { Bildirimler } from './bolumler/Bildirimler';
import { Abonelik } from './bolumler/Abonelik';
import { Verileriniz } from './bolumler/Verileriniz';
import { Webhook } from './bolumler/Webhook';

interface NavGroup { group: SectionGroup; items: (SectionDef & { label: string })[] }

/** Arama sonucuna gidilince alanı görünür yere kaydırıp 1,5 sn vurgular. */
function useAnchorHighlight() {
    const location = useLocation();
    useEffect(() => {
        const anchor = (location.state as { anchor?: string } | null)?.anchor;
        if (!anchor) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let tries = 0;
        let off: number | undefined;
        const find = () => {
            const el = document.getElementById(anchor);
            if (!el) { if (tries++ < 20) off = window.setTimeout(find, 50); return; }
            el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
            el.classList.add('ay-hl');
            off = window.setTimeout(() => el.classList.remove('ay-hl'), 1700);
        };
        off = window.setTimeout(find, 30);
        return () => window.clearTimeout(off);
    }, [location.key, location.state]);
}

export function AyarlarKabuk() {
    const { dark } = useTheme();
    const { settings } = useReservations();
    const location = useLocation();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    useAnchorHighlight();

    // ── Bölümler ve menü ──
    const resourceTypes = profileForSector(settings.sector).resourceTypes;
    const kaynakLabel = resourcesLabel(resourceTypes);
    const sections = useMemo(() => visibleSections(Boolean(kaynakLabel)), [kaynakLabel]);
    const current = sectionFromPath(location.pathname);
    // Bölüm değişince içerik başa döner — önceki bölümün kaydırması taşınmaz.
    // (Arama sonucunun alanı varsa useAnchorHighlight onu ayrıca görünür yapar.)
    const scrollRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [current]);
    const labelOf = useCallback((s: SectionDef) => (s.id === 'kaynaklar' && kaynakLabel ? kaynakLabel : s.label), [kaynakLabel]);
    const groups: NavGroup[] = useMemo(() => {
        const out: NavGroup[] = [];
        for (const s of sections) {
            const last = out[out.length - 1];
            const item = { ...s, label: labelOf(s) };
            if (last && last.group === s.group) last.items.push(item);
            else out.push({ group: s.group, items: [item] });
        }
        return out;
    }, [sections, labelOf]);
    // Gelişmiş katlı; Webhook açıkken grup her zaman açık görünür.
    const [advToggle, setAdvOpen] = useState(false);
    const advOpen = advToggle || current === 'webhook';
    const currentLabel = labelOf(sections.find((s) => s.id === current) ?? sections[0]);

    // ── Taslak kaydı ──
    const drafts = useRef(new Map<string, KayitliTaslak>());
    const [dirtyCount, setDirtyCount] = useState(0);
    const registry = useMemo(() => ({
        register: (id: string, t: KayitliTaslak | null) => {
            if (t && t.dirty) drafts.current.set(id, t); else drafts.current.delete(id);
            setDirtyCount(drafts.current.size);
        },
    }), []);
    useEffect(() => {
        if (dirtyCount === 0) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirtyCount]);

    const [ask, setAsk] = useState<{ to: string; state?: unknown; targetLabel: string; pending: KayitliTaslak[] } | null>(null);
    const [askBusy, setAskBusy] = useState(false);
    const go = useCallback((to: string, targetLabel: string, state?: unknown) => {
        if (drafts.current.size > 0) { setAsk({ to, state, targetLabel, pending: [...drafts.current.values()] }); return; }
        navigate(to, { state });
    }, [navigate]);
    const pending = ask?.pending ?? [];
    const pendingNames = pending.flatMap((d) => d.names);

    // ── Eski ?tab= adresleri ──
    const legacy = legacyTabTarget(params.get('tab'));
    if (legacy && location.pathname.replace(/\/$/, '') === '/settings') {
        return <Navigate to={legacy} replace />;
    }

    const goSection = (id: SectionId) => {
        const s = sections.find((x) => x.id === id);
        go(sectionHref(id), s ? labelOf(s) : '');
    };
    const goResult = (e: SearchEntry) => {
        const s = sections.find((x) => x.id === e.section);
        if (!s) return;
        go(sectionHref(e.section), labelOf(s), e.anchor ? { anchor: e.anchor } : undefined);
    };

    return (
        <TaslakKaydiContext.Provider value={registry}>
            <div className="ay" data-theme={dark ? 'dark' : 'light'} lang="tr">
                <AyIkonlar />

                <nav className="ay-nav" aria-label="Ayarlar menüsü">
                    <div className="ay-nav-title">Ayarlar</div>
                    <Arama onPick={goResult} hotkey />
                    <div className="ay-groups">
                        {groups.map((g) => {
                            const adv = g.group === 'gelismis';
                            const open = !adv || advOpen;
                            return (
                                <div key={g.group ?? 'ozet'} className="ay-group">
                                    {g.group && (adv
                                        ? <button type="button" className="ay-gh" aria-expanded={open} onClick={() => setAdvOpen((v) => !v)}>
                                            {GROUP_LABEL[g.group]}<I n="chr" />
                                        </button>
                                        : <div className="ay-gh">{GROUP_LABEL[g.group]}</div>)}
                                    {open && g.items.map((it) => (
                                        <a key={it.id} href={sectionHref(it.id)} className="ay-ni"
                                            aria-current={it.id === current ? 'page' : undefined}
                                            onClick={(e) => { e.preventDefault(); if (it.id !== current) goSection(it.id); }}>
                                            {it.label}
                                        </a>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </nav>

                <div className="ay-main">
                    <DarSecici groups={groups} current={current} currentLabel={currentLabel} onPick={goSection} onSearch={goResult} />
                    <div className="ay-scroll" ref={scrollRef}>
                        <Routes>
                            <Route index element={<Ozet />} />
                            <Route path="isletme" element={<Isletme />} />
                            <Route path="calisma-saatleri" element={<Saatler />} />
                            <Route path="hizmetler" element={<Hizmetler />} />
                            <Route path="kaynaklar" element={kaynakLabel ? <Kaynaklar label={kaynakLabel} types={resourceTypes} /> : <Navigate to="/settings" replace />} />
                            <Route path="moduller" element={<Moduller />} />
                            <Route path="online-randevu" element={<OnlineRandevu />} />
                            <Route path="whatsapp" element={<WhatsApp />} />
                            <Route path="sadakat" element={<Sadakat />} />
                            <Route path="hesabim" element={<Hesabim />} />
                            <Route path="bildirimler" element={<Bildirimler />} />
                            <Route path="abonelik" element={<Abonelik />} />
                            <Route path="verileriniz" element={<Verileriniz />} />
                            <Route path="webhook" element={<Webhook />} />
                            <Route path="*" element={<Navigate to="/settings" replace />} />
                        </Routes>
                    </div>
                </div>

                {ask && (
                    <Modal labelledBy="ay-s2" small alert onClose={() => { if (!askBusy) setAsk(null); }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 28px 20px' }}>
                            <h2 id="ay-s2" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Değişiklikler kaydedilmedi</h2>
                            <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)' }}>
                                {pending[0] ? withCase(pending[0].label, 'loc') : 'Bu bölümde'} kaydedilmemiş {pendingNames.length || 1} değişiklik var
                                {pendingNames.length > 0 && <>: <b style={{ color: 'var(--tx)' }}>{pendingNames.slice(0, 3).join(', ')}</b></>}.
                                {ask.targetLabel ? ` ${withCase(ask.targetLabel, 'dat')} geçmeden ne yapalım?` : ' Ne yapalım?'}
                            </p>
                        </div>
                        <div className="ay-modal-f">
                            <button type="button" className="ay-btn" autoFocus disabled={askBusy} onClick={() => setAsk(null)}>Kal</button>
                            <button type="button" className="ay-btn-danger" disabled={askBusy} onClick={() => {
                                for (const d of pending) d.discard();
                                drafts.current.clear(); setDirtyCount(0);
                                const t = ask; setAsk(null); navigate(t.to, { state: t.state });
                            }}>Değişiklikleri at</button>
                            <button type="button" className="ay-btn-pri" disabled={askBusy} onClick={async () => {
                                setAskBusy(true);
                                let ok = true;
                                for (const d of pending) { if (!(await d.save())) { ok = false; break; } }
                                setAskBusy(false);
                                if (!ok) { setAsk(null); return; }
                                drafts.current.clear(); setDirtyCount(0);
                                const t = ask; setAsk(null); navigate(t.to, { state: t.state });
                            }}>Kaydet ve geç</button>
                        </div>
                    </Modal>
                )}
            </div>
        </TaslakKaydiContext.Provider>
    );
}

// ── Arama ───────────────────────────────────────────────────────────────────

function Arama({ onPick, hotkey, compact }: { onPick: (e: SearchEntry) => void; hotkey?: boolean; compact?: boolean }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [sel, setSel] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const res = searchSettings(q);

    useEffect(() => {
        if (!hotkey) return;
        const onKey = (e: KeyboardEvent) => {
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !(document.activeElement as HTMLElement | null)?.isContentEditable) {
                // Dar ekranda menü gizli; görünen arama kutusu odaklanır.
                const boxes = [...document.querySelectorAll<HTMLInputElement>('.ay input[data-ay-search]')]
                    .filter((el) => el.offsetParent !== null);
                const el = boxes[0];
                if (el) { e.preventDefault(); el.focus(); el.select(); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [hotkey]);

    const pick = (e: SearchEntry) => { setOpen(false); setQ(''); inputRef.current?.blur(); onPick(e); };

    return (
        <div className="ay-search">
            <label className="ay-search-box">
                <I n="search" />
                <input ref={inputRef} data-ay-search value={q} placeholder={compact ? 'Ara' : 'Ayarlarda ara'} aria-label="Ayarlarda ara"
                    autoComplete="off" role="combobox" aria-expanded={open} aria-controls="ay-search-list"
                    onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => window.setTimeout(() => setOpen(false), 120)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); return; }
                        if (!res || res.length === 0) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(res.length - 1, s + 1)); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                        if (e.key === 'Enter') { e.preventDefault(); pick(res[Math.min(sel, res.length - 1)]); }
                    }} />
                {!q && <kbd className="ay-kbd">/</kbd>}
            </label>
            {open && (
                <div className="ay-pop" role="listbox" id="ay-search-list">
                    {res === null && <div className="ay-pop-msg idle">Bir ayarın adını ya da ne işe yaradığını yazın.</div>}
                    {res && res.length === 0 && <div className="ay-pop-msg">‘{q.trim()}’ için ayar bulunamadı.</div>}
                    {res && res.length > 0 && (
                        <>
                            {res.map((e, i) => (
                                <button key={`${e.section}-${e.name}`} type="button" role="option" aria-selected={i === sel} className="ay-res"
                                    onMouseDown={(ev) => ev.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => pick(e)}>
                                    <b>{e.name}</b><span>{e.path}</span>
                                </button>
                            ))}
                            <div className="ay-pop-foot"><span>↑ ↓ seç · Enter aç</span><span>Esc kapat</span></div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Dar ekran (R2/R3): üstte açılır seçici + arama ──────────────────────────

function DarSecici({ groups, current, currentLabel, onPick, onSearch }: {
    groups: NavGroup[]; current: SectionId; currentLabel: string;
    onPick: (id: SectionId) => void; onSearch: (e: SearchEntry) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('mousedown', close);
        window.addEventListener('keydown', esc);
        return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
    }, [open]);
    return (
        <div className="ay-top" ref={ref}>
            <span className="ay-top-title">Ayarlar</span>
            <span className="ay-top-sep">/</span>
            <button type="button" className="ay-picker" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                {currentLabel}<I n="chd" />
            </button>
            {open && (
                <div className="ay-picker-pop" role="listbox" aria-label="Ayarlar bölümleri">
                    {groups.map((g) => (
                        <div key={g.group ?? 'ozet'} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {g.group && <div className="ay-gh">{GROUP_LABEL[g.group]}</div>}
                            {g.items.map((it) => (
                                <button key={it.id} type="button" role="option" aria-selected={it.id === current} className="ay-po"
                                    onClick={() => { setOpen(false); if (it.id !== current) onPick(it.id); }}>
                                    {it.label}{it.id === current && <I n="check" />}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            <div className="ay-top-search"><Arama onPick={onSearch} compact /></div>
        </div>
    );
}
