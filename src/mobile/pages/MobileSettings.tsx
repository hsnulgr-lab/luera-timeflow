import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useModules } from '@/hooks/useModules';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { useManagerMode } from '@/contexts/ManagerModeProvider';
import { MODULE_META } from '@/lib/modules';
import { hashPin } from '@/lib/pin';
import type { Service, Settings, WorkingHours } from '@/types';
import { BottomSheet } from '../BottomSheet';
import { ThemeSegment } from '../ThemeToggle';
import { Field, Switch } from './MobileStaff';
import { T } from '../theme';

const SVC_COLORS = ['#FF5A1F', '#C98BDB', '#6B9FD4', '#E0A84E', '#7CC47F', '#CB5E84', '#E07070', '#9B8CFF'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

type SheetId = null | 'business' | 'modules' | 'services' | 'hours' | 'booking' | 'pin';

export const MobileSettings = () => {
    const navigate = useNavigate();
    const { isManager } = useManagerMode();
    const { settings, updateSettings } = useReservations();
    const { modules, setModule } = useModules();
    const { profile } = useOrgProfile();
    const [sheet, setSheet] = useState<SheetId>(null);
    const [params] = useSearchParams();

    // Yönetim grid’inden ?tab=services / ?tab=hours ile gelince ilgili sheet’i aç
    useEffect(() => {
        const tab = params.get('tab');
        const map: Record<string, SheetId> = { services: 'services', hours: 'hours', modules: 'modules', booking: 'booking' };
        if (tab && map[tab]) setSheet(map[tab]);
    }, [params]);

    // Yönetici Modu kapalıysa (cihazda hiç PIN girilmemiş) sessizce ana sayfaya
    // dönmek yerine giriş kapısına yönlendir — aksi hâlde "Ayarlar" butonu hiçbir
    // açıklama olmadan tıklanamıyormuş gibi görünür.
    if (!isManager) return <Navigate to="/personel" replace />;

    const enabledCount = MODULE_META.filter((m) => modules[m.key] !== false).length;

    const rows: { id: SheetId; label: string; sub: string; clr: string; bg: string; path: string }[] = [
        { id: 'business', label: 'İşletme Bilgisi', sub: settings.businessName || 'İsim ekle', clr: T.ink, bg: T.surface3, path: 'M3 7l3-3h8l3 3M4 7h12v9H4zM8 16v-4h4v4' },
        { id: 'modules', label: 'Modüller', sub: `${enabledCount}/${MODULE_META.length} açık`, clr: T.purple, bg: 'rgba(201,139,219,.13)', path: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z' },
        { id: 'services', label: 'Hizmetler', sub: `${settings.services.length} hizmet`, clr: T.amber, bg: 'rgba(224,168,78,.13)', path: 'M3 5h14M3 10h14M3 15h8' },
        { id: 'hours', label: 'Çalışma Saatleri', sub: `${settings.workingHours.filter((w) => !w.isOff).length} gün açık`, clr: T.green, bg: 'rgba(124,196,127,.13)', path: 'M10 5v5l3 3M10 2a8 8 0 100 16 8 8 0 000-16Z' },
        { id: 'booking', label: 'Booking Sayfam', sub: profile.slug ? `/book/${profile.slug}` : 'Adres ayarla', clr: T.blue, bg: 'rgba(107,159,212,.13)', path: 'M8 12a3 3 0 004 0l3-3a3 3 0 00-4-4l-1 1M12 8a3 3 0 00-4 0l-3 3a3 3 0 004 4l1-1' },
        { id: 'pin', label: 'Yönetici PIN', sub: settings.managerPin ? 'Ayarlı ✓' : 'Ayarlanmadı', clr: T.orange, bg: 'rgba(255,90,31,.13)', path: 'M6 9V6a4 4 0 018 0v3M5 9h10v8H5z' },
    ];

    return (
        <div style={{ color: T.ink, paddingBottom: 20 }}>
            {/* Header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <button onClick={() => navigate('/')} aria-label="Geri" style={backBtn}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em' }}>Ayarlar</div>
            </div>

            {/* Görünüm — tema seçimi */}
            <div style={{ padding: '18px 22px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 9, fontFamily: T.mono }}>Görünüm</div>
                <ThemeSegment />
            </div>

            <div style={{ padding: '14px 22px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map((r) => (
                    <button key={r.label} onClick={() => setSheet(r.id)} style={{ textAlign: 'left', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}>
                        <div style={{ width: 42, height: 42, borderRadius: 13, background: r.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d={r.path} stroke={r.clr} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-0.02em' }}>{r.label}</div>
                            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</div>
                        </div>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: T.muted2 }}><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                ))}
            </div>

            <BusinessSheet open={sheet === 'business'} onClose={() => setSheet(null)} settings={settings} updateSettings={updateSettings} />
            <ModulesSheet open={sheet === 'modules'} onClose={() => setSheet(null)} modules={modules} setModule={setModule} />
            <ServicesSheet open={sheet === 'services'} onClose={() => setSheet(null)} settings={settings} updateSettings={updateSettings} />
            <HoursSheet open={sheet === 'hours'} onClose={() => setSheet(null)} settings={settings} updateSettings={updateSettings} />
            <BookingSheet open={sheet === 'booking'} onClose={() => setSheet(null)} slug={profile.slug} business={settings.businessName} />
            <PinSheet open={sheet === 'pin'} onClose={() => setSheet(null)} settings={settings} updateSettings={updateSettings} />
        </div>
    );
};

// ─── İşletme adı ─────────────────────────────────────────────────────────────
function BusinessSheet({ open, onClose, settings, updateSettings }: SheetProps) {
    const [name, setName] = useState(settings.businessName);
    const save = async () => { await updateSettings({ ...settings, businessName: name.trim() }); toast.success('Kaydedildi'); onClose(); };
    return (
        <BottomSheet open={open} onClose={onClose} title="İşletme Bilgisi">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
                <Field label="İşletme Adı">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="İşletme adı" style={inp} />
                </Field>
                <button onClick={save} style={primaryBtn}>Kaydet</button>
            </div>
        </BottomSheet>
    );
}

// ─── Modüller ────────────────────────────────────────────────────────────────
function ModulesSheet({ open, onClose, modules, setModule }: { open: boolean; onClose: () => void; modules: Record<string, boolean>; setModule: (k: any, v: boolean) => Promise<void> }) {
    return (
        <BottomSheet open={open} onClose={onClose} title="Modüller">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 6, paddingBottom: 4 }}>
                {MODULE_META.map((m) => {
                    const on = modules[m.key] !== false;
                    return (
                        <button key={m.key} onClick={() => setModule(m.key, !on)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 15, padding: '13px 15px', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 800 }}>{m.label}</div>
                                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{m.desc}</div>
                            </div>
                            <Switch on={on} />
                        </button>
                    );
                })}
            </div>
        </BottomSheet>
    );
}

// ─── Hizmetler ───────────────────────────────────────────────────────────────
function ServicesSheet({ open, onClose, settings, updateSettings }: SheetProps) {
    const [list, setList] = useState<Service[]>(settings.services);
    const [dirty, setDirty] = useState(false);

    const upd = (next: Service[]) => { setList(next); setDirty(true); };
    const add = () => upd([...list, { id: `svc-${Date.now()}`, name: '', duration: 30, color: SVC_COLORS[list.length % SVC_COLORS.length] }]);
    const edit = (id: string, f: keyof Service, v: string | number) => upd(list.map((s) => (s.id === id ? { ...s, [f]: v } : s)));
    const del = (id: string) => upd(list.filter((s) => s.id !== id));
    const save = async () => {
        const clean = list.filter((s) => s.name.trim());
        await updateSettings({ ...settings, services: clean });
        toast.success('Hizmetler kaydedildi');
        setDirty(false);
        onClose();
    };

    return (
        <BottomSheet open={open} onClose={onClose} title="Hizmetler">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, paddingTop: 6, paddingBottom: 4 }}>
                {list.map((s) => (
                    <div key={s.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input value={s.name} onChange={(e) => edit(s.id, 'name', e.target.value)} placeholder="Hizmet adı" style={{ ...inp, height: 42, flex: 1 }} />
                            <button onClick={() => del(s.id)} aria-label="Sil" style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(224,112,112,.10)', border: '1px solid rgba(224,112,112,.22)', color: T.red, cursor: 'pointer', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 9 }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input value={s.duration} onChange={(e) => edit(s.id, 'duration', Number(e.target.value) || 0)} inputMode="numeric" placeholder="Süre" style={{ ...inp, height: 42, paddingRight: 38 }} />
                                <span style={miniSuffix}>dk</span>
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input value={s.price ?? ''} onChange={(e) => edit(s.id, 'price', Number(e.target.value) || 0)} inputMode="numeric" placeholder="Fiyat" style={{ ...inp, height: 42, paddingRight: 38 }} />
                                <span style={miniSuffix}>₺</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {SVC_COLORS.map((c) => (
                                <button key={c} onClick={() => edit(s.id, 'color', c)} aria-label={c} style={{ width: 28, height: 28, borderRadius: 9, background: c, border: s.color === c ? `2.5px solid ${T.ink}` : '2.5px solid transparent', cursor: 'pointer' }} />
                            ))}
                        </div>
                    </div>
                ))}
                <button onClick={add} style={{ height: 46, borderRadius: 14, background: T.surface2, color: T.ink, fontSize: 14, fontWeight: 750, border: `1px dashed ${T.border2}`, cursor: 'pointer' }}>+ Hizmet Ekle</button>
                <button onClick={save} disabled={!dirty} style={{ ...primaryBtn, opacity: dirty ? 1 : 0.5 }}>Kaydet</button>
            </div>
        </BottomSheet>
    );
}

// ─── Çalışma Saatleri ────────────────────────────────────────────────────────
function HoursSheet({ open, onClose, settings, updateSettings }: SheetProps) {
    const [hours, setHours] = useState<WorkingHours[]>(settings.workingHours);
    const upd = (day: number, patch: Partial<WorkingHours>) => setHours((prev) => prev.map((h) => (h.day === day ? { ...h, ...patch } : h)));
    const save = async () => { await updateSettings({ ...settings, workingHours: hours }); toast.success('Saatler kaydedildi'); onClose(); };

    return (
        <BottomSheet open={open} onClose={onClose} title="Çalışma Saatleri">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, paddingBottom: 4 }}>
                {[...hours].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7)).map((h) => (
                    <div key={h.day} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 78, fontSize: 13, fontWeight: 750, flexShrink: 0 }}>{h.dayName || DAYS[h.day]}</div>
                        {h.isOff ? (
                            <div style={{ flex: 1, fontSize: 12.5, color: T.muted, fontFamily: T.mono }}>Kapalı</div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
                                <input type="time" value={h.start} onChange={(e) => upd(h.day, { start: e.target.value })} style={timeInp} />
                                <span style={{ color: T.muted2 }}>–</span>
                                <input type="time" value={h.end} onChange={(e) => upd(h.day, { end: e.target.value })} style={timeInp} />
                            </div>
                        )}
                        <button onClick={() => upd(h.day, { isOff: !h.isOff })} style={{ flexShrink: 0 }}><Switch on={!h.isOff} /></button>
                    </div>
                ))}
                <button onClick={save} style={{ ...primaryBtn, marginTop: 4 }}>Kaydet</button>
            </div>
        </BottomSheet>
    );
}

// ─── Booking Sayfam ──────────────────────────────────────────────────────────
function BookingSheet({ open, onClose, slug, business }: { open: boolean; onClose: () => void; slug: string; business: string }) {
    const url = slug ? `${window.location.origin}/book/${slug}` : '';
    const copy = async () => { await navigator.clipboard.writeText(url); toast.success('Link kopyalandı'); };
    const share = async () => {
        if (navigator.share) { try { await navigator.share({ title: business || 'Randevu', url }); } catch { /* iptal */ } }
        else copy();
    };
    return (
        <BottomSheet open={open} onClose={onClose} title="Booking Sayfam">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
                {url ? (
                    <>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 15px', fontFamily: T.mono, fontSize: 13, color: T.blue, wordBreak: 'break-all' }}>{url}</div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={copy} style={{ ...primaryBtn, flex: 1, background: T.surface2, color: T.ink, border: `1px solid ${T.border2}` }}>Kopyala</button>
                            <button onClick={share} style={{ ...primaryBtn, flex: 1 }}>Paylaş</button>
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>Booking adresi (slug) henüz ayarlanmamış. Masaüstü Ayarlar → Booking Sayfam bölümünden bir adres belirleyin.</div>
                )}
            </div>
        </BottomSheet>
    );
}

// ─── Yönetici PIN ────────────────────────────────────────────────────────────
function PinSheet({ open, onClose, settings, updateSettings }: SheetProps) {
    const [pin, setPin] = useState('');
    const [pin2, setPin2] = useState('');
    const save = async () => {
        if (!/^\d{4,6}$/.test(pin)) { toast.error('PIN 4-6 haneli olmalı'); return; }
        if (pin !== pin2) { toast.error('PIN’ler eşleşmiyor'); return; }
        const h = await hashPin(pin);
        await updateSettings({ ...settings, managerPin: h });
        toast.success('Yönetici PIN güncellendi');
        setPin(''); setPin2('');
        onClose();
    };
    return (
        <BottomSheet open={open} onClose={onClose} title="Yönetici PIN">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
                <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>Bu PIN, Personel ekranından Yönetici Paneline girişte kullanılır.</div>
                <Field label="Yeni PIN">
                    <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="4-6 hane" style={{ ...inp, fontFamily: T.mono, letterSpacing: '.3em' }} />
                </Field>
                <Field label="PIN Tekrar">
                    <input value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="Tekrar gir" style={{ ...inp, fontFamily: T.mono, letterSpacing: '.3em' }} />
                </Field>
                <button onClick={save} style={primaryBtn}>Kaydet</button>
            </div>
        </BottomSheet>
    );
}

// ─── Shared ──────────────────────────────────────────────────────────────────
interface SheetProps { open: boolean; onClose: () => void; settings: Settings; updateSettings: (s: Settings) => Promise<boolean> }
const backBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, cursor: 'pointer', flexShrink: 0 };
const inp: React.CSSProperties = { width: '100%', height: 48, borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontSize: 15, fontWeight: 600, padding: '0 15px', outline: 'none', fontFamily: T.font };
const timeInp: React.CSSProperties = { flex: 1, height: 38, borderRadius: 10, background: T.bg, border: `1px solid ${T.border}`, color: T.ink, fontSize: 13, fontFamily: T.mono, padding: '0 8px', outline: 'none', colorScheme: 'var(--lt-scheme,dark)' as any };
const miniSuffix: React.CSSProperties = { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: T.muted, fontFamily: T.mono, pointerEvents: 'none' };
const primaryBtn: React.CSSProperties = { height: 50, borderRadius: 15, background: T.orange, color: '#0E0E0E', fontSize: 15, fontWeight: 850, border: 'none', cursor: 'pointer' };
