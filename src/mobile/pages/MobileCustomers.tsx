import { useMemo, useState } from 'react';
import { Search, Phone, MessageCircle, Plus } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { formatDateEU } from '@/utils/date';
import type { Customer } from '@/types';
import { NewCustomerSheet } from '../NewCustomerSheet';
import { T, avatarColor } from '../theme';

function waLink(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '90' + p.slice(1);
    else if (!p.startsWith('90')) p = '90' + p;
    return `https://wa.me/${p}`;
}

export const MobileCustomers = () => {
    const { customers, allCustomers, searchQuery, setSearchQuery } = useCustomers();
    const [sheetOpen, setSheetOpen] = useState(false);
    const totalVisits = useMemo(() => allCustomers.reduce((s, c) => s + c.totalReservations, 0), [allCustomers]);

    return (
        <div style={{ padding: '14px 22px 0', color: T.ink }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>Müşteriler</h1>
                    <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{allCustomers.length} kişi · {totalVisits} ziyaret</p>
                </div>
                <button onClick={() => setSheetOpen(true)} aria-label="Yeni müşteri" style={{ width: 44, height: 44, borderRadius: 14, background: T.orange, display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px rgba(255,90,31,.4)' }}>
                    <Plus size={22} strokeWidth={2.5} color="#0E0E0E" />
                </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, padding: '13px 14px', background: T.surface, border: `1px solid ${T.border2}` }}>
                <Search size={18} color={T.muted} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="İsim veya telefon ara"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 15, fontFamily: T.font }} />
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {customers.length === 0 && (
                    <div style={{ borderRadius: 16, padding: 24, textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, color: T.muted, fontSize: 13 }}>
                        {searchQuery ? 'Eşleşen müşteri yok' : 'Henüz müşteri yok'}
                    </div>
                )}
                {customers.map((c) => <CustomerRow key={c.id} c={c} />)}
            </div>

            <NewCustomerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
        </div>
    );
};

function CustomerRow({ c }: { c: Customer }) {
    const color = avatarColor(c.name);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, background: T.surface, border: `1px solid ${T.border}` }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: color, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, color: '#0E0E0E', flexShrink: 0 }}>{(c.name || '?').charAt(0).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                <p style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.phone || 'telefon yok'}</p>
                <div style={{ marginTop: 4, fontSize: 11, color: T.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 700, color: T.ink }}>{c.totalReservations}</span> randevu
                    {c.lastVisit && <span>· son {formatDateEU(c.lastVisit)}</span>}
                </div>
            </div>
            {c.phone && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <a href={`tel:${c.phone}`} aria-label="Ara" style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: T.surface2, color: T.muted }}><Phone size={16} /></a>
                    <a href={waLink(c.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(124,196,127,.14)', color: T.green }}><MessageCircle size={16} /></a>
                </div>
            )}
        </div>
    );
}
