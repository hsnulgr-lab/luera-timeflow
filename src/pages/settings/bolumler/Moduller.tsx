/**
 * A5 · Modüller.
 *
 * Sektörün önerdikleri üstte; bu sektörde genelde kullanılmayanlar katlanmış
 * "Diğer modüller"de (içlerinden biri açıksa kendiliğinden açık durur).
 * Anahtar anında kaydeder ve yanında 2 sn "Kaydedildi" yazar; sunucu
 * reddederse anahtar geri döner.
 *
 * Kural: restoran adisyonu kasadan tahsil edilir — Masa açıkken Kasa
 * kapatılamaz (gerekçesi satırda yazılı) ve Masa açılınca Kasa da TEK
 * yazımla açılır.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useModules } from '@/hooks/useModules';
import { useReservations } from '@/hooks/useReservations';
import { MODULE_META, modulesForSector } from '@/lib/modules';
import { profileForSector } from '@/lib/sectorProfiles';
import { Head, I, SwitchRow } from '../parcalar';

const DESC: Record<string, string> = {
    randevu: 'Takvim, rezervasyonlar ve online randevu',
    personel: 'Uzmanlar sayfası',
    hizmet: 'Hizmet kataloğu ve fiyatlandırma',
    kasa: 'Tahsilat, gelir ve ürün satışı',
    analiz: 'İstatistik ve performans raporları',
    sira: 'Sırasız bekleme — kuaför ve berberde',
    masa: 'Restoran masa yönetimi ve oturma planı. Açılınca Kasa da açılır.',
};

export function Moduller() {
    const navigate = useNavigate();
    const { settings } = useReservations();
    const { modules, isEnabled, setModule, patchModules, applySectorDefaults } = useModules();
    const sector = settings.sector || 'genel';
    const rec = modulesForSector(sector);
    const main = MODULE_META.filter((m) => rec[m.key]);
    const other = MODULE_META.filter((m) => !rec[m.key]);
    const otherOn = other.some((m) => isEnabled(m.key));
    const [otherOpen, setOtherOpen] = useState(otherOn);
    const [applying, setApplying] = useState(false);

    const save = (key: (typeof MODULE_META)[number]['key']) => async (next: boolean) => {
        if (key === 'masa' && next && !isEnabled('kasa')) return patchModules({ masa: true, kasa: true });
        return setModule(key, next);
    };

    const row = (m: (typeof MODULE_META)[number]) => {
        const locked = m.key === 'kasa' && isEnabled('masa');
        return (
            <SwitchRow key={m.key} title={m.label} desc={DESC[m.key] ?? m.desc} value={modules[m.key] !== false}
                disabled={locked} lockNote={locked ? 'Masa açıkken kapatılamaz — adisyon tahsilatı kasadan yapılır.' : undefined}
                onSave={save(m.key)} />
        );
    };

    return (
        <div className="ay-col">
            <Head title="Modüller" lead="Kapalı modül menüde görünmez. Müşteriler, Dashboard ve Ayarlar her zaman açıktır." />

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', padding: '16px 0 20px' }}>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--tx2)', maxWidth: 460 }}>
                    <b style={{ color: 'var(--tx)' }}>{profileForSector(sector).label} için:</b> {main.map((m) => m.label).join(', ')}.
                </span>
                <button type="button" className="ay-btn" disabled={applying} onClick={async () => {
                    setApplying(true);
                    const ok = await applySectorDefaults(sector);
                    setApplying(false);
                    if (ok) toast.success('Modüller sektör önerisine göre ayarlandı');
                    else toast.error('Modüller kaydedilemedi — tekrar deneyin');
                }}>{applying ? 'Uygulanıyor…' : 'Sektör önerisini uygula'}</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--bd)' }}>
                {main.map(row)}
            </div>

            {other.length > 0 && (
                <>
                    <button type="button" aria-expanded={otherOpen} className="ay-fold"
                        style={{ borderTop: 0, padding: otherOpen ? '18px 0 6px' : '18px 0', borderBottom: otherOpen ? 0 : '1px solid var(--bd)' }}
                        onClick={() => setOtherOpen((v) => !v)}>
                        <I n="chr" />
                        <span style={{ fontSize: 15.5, fontWeight: 700 }}>Diğer modüller</span>
                        {!otherOpen && <span style={{ fontWeight: 500, color: 'var(--tx2)', fontSize: 15.5 }}>· {other.map((m) => m.label).join(', ')} — bu sektörde genelde kullanılmaz</span>}
                    </button>
                    {otherOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--bd)' }}>
                            {other.map(row)}
                        </div>
                    )}
                </>
            )}

            {isEnabled('kasa') && !isEnabled('masa') && (
                <div className="ay-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 28, padding: '16px 18px', borderRadius: 14 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Ürün kataloğu Stoklar'da.</span>
                    <button type="button" className="ay-btn h40" onClick={() => navigate('/stock')}>Stoklar'a git<I n="chr" size={16} /></button>
                </div>
            )}
        </div>
    );
}
