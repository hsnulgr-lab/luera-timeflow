import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueue } from '@/hooks/useQueue';
import { useReservations } from '@/hooks/useReservations';
import { sendTextMessage, buildQueueJoinMessage, buildQueueReadyMessage } from '@/services/evolutionApi';
import type { QueueEntry } from '@/types';
import { BottomSheet } from '../BottomSheet';
import { Field } from './MobileStaff';
import { T } from '../theme';

const waitMin = (joinedAt: string) => Math.max(0, Math.round((Date.now() - new Date(joinedAt).getTime()) / 60000));

export const MobileQueue = () => {
    const navigate = useNavigate();
    const { waiting, called, addEntry, callEntry, serveEntry, removeEntry } = useQueue();
    const { settings } = useReservations();
    const avg = settings.slotDuration || 20;
    const wa = settings.whatsappInstance;

    const [sheet, setSheet] = useState(false);
    const [showAllWaiting, setShowAllWaiting] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [service, setService] = useState('');
    const [saving, setSaving] = useState(false);

    const add = async () => {
        if (!name.trim()) { toast.error('İsim gerekli'); return; }
        setSaving(true);
        const pos = waiting.length + 1;
        const row = await addEntry({ customerName: name.trim(), customerPhone: phone.trim() || undefined, service: service.trim() || undefined });
        setSaving(false);
        if (row) {
            // Sıraya eklendi → WhatsApp konum/ETA (fire-and-forget)
            if (wa && row.customerPhone) {
                const msg = buildQueueJoinMessage({ customerName: row.customerName, businessName: settings.businessName, position: pos, etaMin: (pos - 1) * avg });
                sendTextMessage(wa, row.customerPhone, msg).catch(() => {});
            }
            toast.success('Sıraya eklendi');
            setName(''); setPhone(''); setService(''); setSheet(false);
        }
    };

    const call = (e: QueueEntry) => {
        callEntry(e.id);
        if (wa && e.customerPhone) {
            sendTextMessage(wa, e.customerPhone, buildQueueReadyMessage({ customerName: e.customerName, businessName: settings.businessName })).catch(() => {});
        }
        toast.success('Çağrıldı 🔔');
    };

    return (
        <div style={{ color: T.ink, paddingBottom: 24 }}>
            {/* Header */}
            <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 22px 10px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, var(--lt-bg, ${T.bg}) 85%, transparent)`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <button onClick={() => navigate('/')} aria-label="Geri" style={backBtn}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em' }}>Sıra</div>
                    <div style={{ fontSize: 11.5, color: T.muted, fontFamily: T.mono, marginTop: 1 }}>{waiting.length} bekliyor{called.length ? ` · ${called.length} çağrıldı` : ''}</div>
                </div>
                <button onClick={() => setSheet(true)} style={{ height: 38, padding: '0 14px', borderRadius: 12, background: T.orange, color: '#0E0E0E', fontSize: 13.5, fontWeight: 800, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="#0E0E0E" strokeWidth="2.4" strokeLinecap="round" /></svg>
                    Ekle
                </button>
            </div>

            {/* Çağrılanlar */}
            {called.length > 0 && (
                <div style={{ padding: '18px 22px 0' }}>
                    <SectionLabel>Çağrıldı</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {called.map((e) => (
                            <div key={e.id} style={{ background: 'rgba(255,90,31,.07)', border: '1px solid rgba(255,90,31,.3)', borderRadius: 16, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,90,31,.14)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3a6 6 0 00-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 00-6-6ZM10 19a2 2 0 004 0" stroke={T.orange} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.customerName}</div>
                                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>{e.service || 'Hizmet yok'}{e.calledAt ? ` · ${waitMin(e.calledAt)} dk önce çağrıldı` : ''}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 7 }}>
                                    <button onClick={() => { serveEntry(e.id); toast.success('Tamamlandı'); }} style={btnGreen}>Geldi</button>
                                    <button onClick={() => removeEntry(e.id)} aria-label="Çıkar" style={btnGhostRed}>✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Bekleyenler */}
            <div style={{ padding: '18px 22px 0' }}>
                <SectionLabel>Bekliyor</SectionLabel>
                {waiting.length === 0 ? (
                    <div style={{ padding: '36px 20px', textAlign: 'center', color: T.muted }}>
                        <div style={{ width: 60, height: 60, borderRadius: 18, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 8a4 4 0 108 0 4 4 0 00-8 0ZM3 21c0-3.5 2.7-6 6-6M15 13l2 2 4-4" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                        <div style={{ fontSize: 14.5, fontWeight: 750, color: T.ink, marginBottom: 6 }}>Sıra boş</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>Gelen müşteriyi "Ekle" ile<br />sıraya yaz.</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {(showAllWaiting ? waiting : waiting.slice(0, 10)).map((e, i) => (
                            <div key={e.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: i === 0 ? T.orange : T.surface2, color: i === 0 ? '#0E0E0E' : T.muted, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 900, flexShrink: 0 }}>{i + 1}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.customerName}</div>
                                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontFamily: T.mono }}>
                                        {e.service ? `${e.service} · ` : ''}{waitMin(e.joinedAt)} dk bekliyor · ~{i * avg} dk
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 7 }}>
                                    <button onClick={() => call(e)} style={btnOrange}>Çağır</button>
                                    <button onClick={() => removeEntry(e.id)} aria-label="Çıkar" style={btnGhostRed}>✕</button>
                                </div>
                            </div>
                        ))}
                        {!showAllWaiting && waiting.length > 10 && (
                            <button onClick={() => setShowAllWaiting(true)}
                                style={{ padding: '11px', borderRadius: 14, background: T.surface2, border: `1px solid ${T.border}`, color: T.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Tümünü gör ({waiting.length})
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Ekle sheet */}
            <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Sıraya Ekle">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6, paddingBottom: 4 }}>
                    <Field label="Ad">
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Müşteri adı" style={inp} autoFocus />
                    </Field>
                    <Field label="Telefon (WhatsApp bildirimi için)">
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05xx…" style={inp} />
                    </Field>
                    <Field label="Hizmet (opsiyonel)">
                        <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Örn. Saç + Sakal" style={inp} />
                    </Field>
                    <button onClick={add} disabled={saving} style={{ height: 50, borderRadius: 15, background: T.orange, color: '#0E0E0E', fontSize: 15, fontWeight: 850, border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, marginTop: 2 }}>
                        {saving ? 'Ekleniyor…' : 'Sıraya Ekle'}
                    </button>
                </div>
            </BottomSheet>
        </div>
    );
};

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '.1em', textTransform: 'uppercase', color: T.muted, marginBottom: 11, fontFamily: T.mono }}>{children}</div>;
}

const backBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, cursor: 'pointer', flexShrink: 0 };
const inp: React.CSSProperties = { width: '100%', height: 48, borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`, color: T.ink, fontSize: 15, fontWeight: 600, padding: '0 15px', outline: 'none', fontFamily: T.font };
const btnOrange: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 10, background: T.orange, color: '#0E0E0E', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer' };
const btnGreen: React.CSSProperties = { height: 34, padding: '0 13px', borderRadius: 10, background: 'rgba(124,196,127,.14)', color: T.green, fontSize: 13, fontWeight: 800, border: '1px solid rgba(124,196,127,.25)', cursor: 'pointer' };
const btnGhostRed: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, background: 'rgba(224,112,112,.10)', color: T.red, fontSize: 13, fontWeight: 800, border: '1px solid rgba(224,112,112,.22)', cursor: 'pointer' };
