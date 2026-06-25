import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useStaff } from '@/hooks/useStaff';
import { useManagerMode } from '@/contexts/ManagerModeProvider';
import { hashPin } from '@/lib/pin';
import type { Staff } from '@/types';
import { BottomSheet } from '../BottomSheet';
import { T } from '../theme';

const COLORS = ['#FF5A1F', '#C98BDB', '#6B9FD4', '#E0A84E', '#7CC47F', '#CB5E84', '#E07070', '#9B8CFF'];

interface FormState {
    name: string;
    specialty: string;
    phone: string;
    color: string;
    isActive: boolean;
    pin: string;
}
const EMPTY: FormState = { name: '', specialty: '', phone: '', color: COLORS[0], isActive: true, pin: '' };

export const MobileStaff = () => {
    const navigate = useNavigate();
    const { isManager } = useManagerMode();
    const { staff, addStaff, updateStaff, deleteStaff } = useStaff();

    const [sheetOpen, setSheetOpen] = useState(false);
    const [editing, setEditing] = useState<Staff | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [saving, setSaving] = useState(false);

    const sorted = useMemo(() => [...staff].sort((a, b) => a.name.localeCompare(b.name, 'tr')), [staff]);

    // Yönetici-dışı erişim engeli — personel yönetimi hassas
    if (!isManager) return <Navigate to="/" replace />;

    const openAdd = () => { setEditing(null); setForm(EMPTY); setSheetOpen(true); };
    const openEdit = (m: Staff) => {
        setEditing(m);
        setForm({ name: m.name, specialty: m.specialty || '', phone: m.phone || '', color: m.color, isActive: m.isActive, pin: '' });
        setSheetOpen(true);
    };

    const save = async () => {
        if (!form.name.trim()) { toast.error('İsim gerekli'); return; }
        if (form.pin && !/^\d{4,6}$/.test(form.pin.trim())) { toast.error('PIN 4-6 haneli olmalı'); return; }
        setSaving(true);
        const pinHash = form.pin.trim() ? await hashPin(form.pin.trim()) : undefined;
        const base = {
            name: form.name.trim(),
            specialty: form.specialty.trim() || undefined,
            phone: form.phone.trim() || undefined,
            color: form.color,
            isActive: form.isActive,
        };
        if (editing) {
            await updateStaff(editing.id, { ...base, ...(pinHash ? { pin: pinHash } : {}) });
            toast.success('Personel güncellendi');
        } else {
            await addStaff({ ...base, ...(pinHash ? { pin: pinHash } : {}) } as any);
            toast.success('Personel eklendi');
        }
        setSaving(false);
        setSheetOpen(false);
    };

    const remove = async () => {
        if (!editing) return;
        if (!confirm(`${editing.name} kaldırılsın mı?`)) return;
        await deleteStaff(editing.id);
        setSheetOpen(false);
    };

    return (
        <div style={{ color: T.ink, paddingBottom: 20 }}>
            {/* Header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <button onClick={() => navigate('/')} aria-label="Geri" style={backBtn}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em' }}>Personel</div>
                    <div style={{ fontSize: 11.5, color: T.muted, fontFamily: T.mono, marginTop: 1 }}>{sorted.length} kişi</div>
                </div>
                <button onClick={openAdd} aria-label="Personel ekle" style={{ height: 38, padding: '0 14px', borderRadius: 12, background: T.orange, color: '#0E0E0E', fontSize: 13.5, fontWeight: 800, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="#0E0E0E" strokeWidth="2.4" strokeLinecap="round" /></svg>
                    Ekle
                </button>
            </div>

            {/* List */}
            <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sorted.length === 0 && (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted, fontSize: 13.5 }}>Henüz personel yok. “Ekle” ile başla.</div>
                )}
                {sorted.map((m) => (
                    <button key={m.id} onClick={() => openEdit(m)} style={{ textAlign: 'left', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: m.color, display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{m.name.charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{m.specialty || 'Genel'}{m.pin ? ' · PIN ✓' : ''}</div>
                        </div>
                        <div style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800, background: m.isActive ? 'rgba(124,196,127,.14)' : T.surface3, color: m.isActive ? T.green : T.muted, border: `1px solid ${m.isActive ? 'rgba(124,196,127,.25)' : T.border}` }}>{m.isActive ? 'Aktif' : 'Pasif'}</div>
                    </button>
                ))}
            </div>

            <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? 'Personeli Düzenle' : 'Yeni Personel'}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6, paddingBottom: 4 }}>
                    <Field label="Ad Soyad">
                        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Örn. Ayşe Yılmaz" style={inp} />
                    </Field>
                    <Field label="Uzmanlık / Görev">
                        <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Örn. Kuaför, Garson…" style={inp} />
                    </Field>
                    <Field label="Telefon">
                        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="05xx…" style={inp} />
                    </Field>
                    <Field label="Renk">
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {COLORS.map((c) => (
                                <button key={c} onClick={() => setForm({ ...form, color: c })} aria-label={c} style={{ width: 34, height: 34, borderRadius: 11, background: c, border: form.color === c ? `2.5px solid ${T.ink}` : `2.5px solid transparent`, cursor: 'pointer' }} />
                            ))}
                        </div>
                    </Field>
                    <Field label={editing ? 'Yeni PIN (boş = değişmez)' : 'Personel PIN (opsiyonel)'}>
                        <input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" placeholder="4-6 hane" style={{ ...inp, fontFamily: T.mono, letterSpacing: '.2em' }} />
                    </Field>
                    <button onClick={() => setForm({ ...form, isActive: !form.isActive })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '13px 15px', cursor: 'pointer' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Aktif (çalışıyor)</div>
                        <Switch on={form.isActive} />
                    </button>

                    <button onClick={save} disabled={saving} style={{ height: 50, borderRadius: 15, background: T.orange, color: '#0E0E0E', fontSize: 15, fontWeight: 850, border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, marginTop: 2 }}>
                        {saving ? 'Kaydediliyor…' : editing ? 'Kaydet' : 'Personel Ekle'}
                    </button>
                    {editing && (
                        <button onClick={remove} style={{ height: 46, borderRadius: 14, background: 'rgba(224,112,112,.10)', color: T.red, fontSize: 14, fontWeight: 750, border: '1px solid rgba(224,112,112,.22)', cursor: 'pointer' }}>
                            Personeli Kaldır
                        </button>
                    )}
                </div>
            </BottomSheet>
        </div>
    );
};

// ─── Shared mobile form bits ─────────────────────────────────────────────────
const backBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, cursor: 'pointer', flexShrink: 0 };
const inp: React.CSSProperties = { width: '100%', height: 48, borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontSize: 15, fontWeight: 600, padding: '0 15px', outline: 'none', fontFamily: T.font };

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 8, fontFamily: T.mono }}>{label}</label>
            {children}
        </div>
    );
}

export function Switch({ on }: { on: boolean }) {
    return (
        <div style={{ width: 46, height: 28, borderRadius: 999, background: on ? T.orange : T.surface3, position: 'relative', transition: 'background .18s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .18s' }} />
        </div>
    );
}
