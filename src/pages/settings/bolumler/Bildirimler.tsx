/**
 * A10 · Bildirimler — telefondaki müdür bildirim anahtarlarının aynısı.
 *
 * Kaynak `settings.notification_prefs` (105), işletme SAHİBİNİN ayar satırı:
 * telefon (`managerSource.fetchOrgSettings`) ve sunucu (`send-push`) aynı
 * satırı okuyor; burası da. Biri değişince öteki de değişir; ayrı bir ana
 * anahtar yok.
 *
 * Okunmayan anahtar AÇIK sayılır (PREF_DEFAULT = true) — sunucunun kuralıyla
 * aynı: yokluk "kapalı" demek değil. Tercihler hiç okunamadıysa anahtarlar
 * "kapalı" ÇİZİLMEZ; yerlerine "okunamadı" yazar.
 *
 * Yazma iyimser kilitli (`updated_at`): başka bir cihaz arada değiştirdiyse
 * yazma "kaydedildi" sayılmaz — telefondaki `saveNotificationPref` ile aynı.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Head, I, SwitchRow } from '../parcalar';

type Key = 'booked' | 'cancelled' | 'cash';
const PREF_DEFAULT = true;

const ROWS: { key: Key; title: string; desc: string }[] = [
    { key: 'booked', title: 'Yeni randevu', desc: 'Müşteri online randevu sayfasından ya da WhatsApp\'tan randevu alınca. Kendi girdiğiniz randevuda bildirim gelmez.' },
    { key: 'cancelled', title: 'Randevu iptali', desc: 'Bir randevu iptal edilince.' },
    { key: 'cash', title: 'Adisyon kasada', desc: 'İşlem bitti, ödeme bekliyor.' },
];

interface Row { raw: Record<string, unknown>; userId: string; stamp: string | null }

export function Bildirimler() {
    const { orgId } = useAuth();
    const [row, setRow] = useState<Row | null>(null);
    const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

    const load = useCallback(async () => {
        if (!orgId) return;
        setState('loading');
        try {
            const { data: org, error: orgErr } = await supabase.from('organizations').select('owner_id').eq('id', orgId).maybeSingle();
            if (orgErr) throw orgErr;
            const ownerId = (org as { owner_id?: string } | null)?.owner_id;
            let data: Record<string, unknown> | null = null;
            if (ownerId) {
                const r = await supabase.from('settings').select('user_id, notification_prefs, updated_at')
                    .eq('organization_id', orgId).eq('user_id', ownerId).maybeSingle();
                if (r.error) throw r.error;
                data = r.data as Record<string, unknown> | null;
            }
            if (!data) {
                const r = await supabase.from('settings').select('user_id, notification_prefs, updated_at')
                    .eq('organization_id', orgId).order('created_at', { ascending: true }).limit(1).maybeSingle();
                if (r.error) throw r.error;
                data = r.data as Record<string, unknown> | null;
            }
            if (!data?.user_id) throw new Error('no_settings_row');
            setRow({
                raw: (data.notification_prefs && typeof data.notification_prefs === 'object' ? data.notification_prefs : {}) as Record<string, unknown>,
                userId: String(data.user_id),
                stamp: (data.updated_at as string | null) ?? null,
            });
            setState('ok');
        } catch (e) {
            console.error('notification_prefs okunamadı:', e);
            setState('error');
        }
    }, [orgId]);
    useEffect(() => { void load(); }, [load]);

    const valueOf = (k: Key) => (row && typeof row.raw[k] === 'boolean' ? (row.raw[k] as boolean) : PREF_DEFAULT);

    const save = (k: Key) => async (next: boolean): Promise<boolean> => {
        if (!row || !orgId) return false;
        // Bilinmeyen anahtarlar korunur — bir gün eklenen yeni bir tercih ezilmesin.
        const patch = { ...row.raw, [k]: next };
        const stampedAt = new Date().toISOString();
        let q = supabase.from('settings').update({ notification_prefs: patch, updated_at: stampedAt })
            .eq('organization_id', orgId).eq('user_id', row.userId);
        q = row.stamp === null ? q.is('updated_at', null) : q.eq('updated_at', row.stamp);
        const { data, error } = await q.select('user_id, notification_prefs, updated_at');
        if (error) return false;
        const saved = (data as Record<string, unknown>[] | null)?.[0];
        if (!saved) { void load(); return false; } // başka bir cihaz az önce değiştirmiş
        setRow({ raw: (saved.notification_prefs as Record<string, unknown>) ?? patch, userId: row.userId, stamp: (saved.updated_at as string | null) ?? stampedAt });
        return true;
    };

    return (
        <div className="ay-col">
            <Head title="Bildirimler" lead="Bildirimler TimeFlow telefon uygulamanıza gelir. Telefonda bildirim izni kapalıysa hiçbiri gelmez." />
            {state === 'error' && (
                <div role="status" className="ay-box plain" style={{ justifyContent: 'space-between', padding: '14px 16px', marginBottom: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="ay-dot unk" />Tercihler okunamadı — yenileyin.</span>
                    <button type="button" className="ay-btn" style={{ height: 38, padding: '0 12px', fontSize: 14 }} onClick={() => void load()}><I n="refresh" size={16} />Yenile</button>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--bd)' }}>
                {ROWS.map((r) => state === 'ok' ? (
                    <SwitchRow key={r.key} large title={r.title} desc={r.desc} descLarge value={valueOf(r.key)} onSave={save(r.key)} />
                ) : (
                    <div key={r.key} className="ay-swrow big">
                        <div className="ay-swrow-t"><b>{r.title}</b><span className="big">{r.desc}</span></div>
                        {state === 'loading'
                            ? <span className="ay-skel" style={{ width: 46, height: 28, borderRadius: 999 }} aria-label="Okunuyor" />
                            : <span className="ay-state" style={{ minWidth: 0 }}>Okunamadı</span>}
                    </div>
                ))}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--tx2)', marginTop: 16, maxWidth: 620 }}>
                Üçü de kapalıysa bildirim gelmez; ayrı bir ana anahtar yok. Personel kendi bildirimlerini kendi telefonundan yönetir.
                Buradaki tercih telefondakiyle aynıdır; biri değişince öteki de değişir.
            </p>
        </div>
    );
}
