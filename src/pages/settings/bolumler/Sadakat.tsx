/**
 * A8 · Sadakat kartı — müşterinin dijital damga kartı.
 *
 * Açma/kapama ve eşik anında kaydedilir (tek dokunuş); ödül metni yazılan
 * alan olduğu için taslakla kaydedilir. Önizleme cümlesi seçimle birlikte
 * yazılır.
 */
import { useState } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { useTaslak } from '../useTaslak';
import { Head, I, SaveBar, SwitchRow, type SwitchStatus } from '../parcalar';

const THRESHOLDS = [5, 6, 8, 10, 12, 15, 20];

export function Sadakat() {
    const { settings, updateSettings } = useReservations();
    const enabled = Boolean(settings.loyaltyEnabled);
    const savedThreshold = settings.loyaltyThreshold ?? 10;

    const [thStatus, setThStatus] = useState<SwitchStatus>('idle');
    const [thPending, setThPending] = useState<number | null>(null);
    const threshold = thPending ?? savedThreshold;
    const pickThreshold = async (n: number) => {
        if (n === savedThreshold || thStatus === 'saving') return;
        setThPending(n); setThStatus('saving');
        const ok = await updateSettings({ ...settings, loyaltyThreshold: n });
        setThPending(null);
        setThStatus(ok ? 'saved' : 'error');
        if (ok) window.setTimeout(() => setThStatus('idle'), 2000);
    };

    const t = useTaslak<{ reward: string }>({
        saved: { reward: settings.loyaltyReward || 'Ücretsiz hizmet' },
        sectionLabel: 'Sadakat kartı',
        labels: { reward: 'Ödül' },
        validate: (d) => (d.reward.trim() ? null : 'Ödül boş olamaz.'),
        save: (d) => updateSettings({ ...settings, loyaltyReward: d.reward.trim() }),
    });
    const reward = t.draft.reward.trim() || 'ödül';
    const rewardLower = reward.charAt(0).toLocaleLowerCase('tr') + reward.slice(1);
    const filled = Math.min(3, threshold);

    return (
        <>
            <div className="ay-col">
                <Head title="Sadakat kartı" lead="Müşterinin dijital damga kartı; eşiğe ulaşan müşteri ödülü kazanır." />
                <SwitchRow large title="Dijital müşteri kartı" desc="Her tamamlanan randevu 1 damga." descLarge value={enabled}
                    onSave={(v) => updateSettings({ ...settings, loyaltyEnabled: v })} />

                {enabled && (
                    <>
                        <div className="ay-row">
                            <div className="ay-row-l" style={{ flexBasis: 200, maxWidth: 240, gap: 6 }}>
                                <span className="ay-lbl">Eşik</span>
                                <span className="ay-help">Kaç ziyarette ödül.</span>
                            </div>
                            <div className="ay-row-r" style={{ flexBasis: 340 }}>
                                <div role="radiogroup" aria-label="Eşik" className="ay-chips">
                                    {THRESHOLDS.map((n) => (
                                        <button key={n} type="button" role="radio" aria-checked={n === threshold} className="ay-chip"
                                            onClick={() => void pickThreshold(n)}>{n}</button>
                                    ))}
                                </div>
                                {thStatus === 'saved' && <span className="ay-saved" role="status"><I n="check" />Kaydedildi</span>}
                                {thStatus === 'error' && <span className="ay-errline" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>}
                            </div>
                        </div>

                        <div className="ay-row">
                            {t.isChanged('reward') && <span aria-hidden="true" className="ay-changed" />}
                            <div className="ay-row-l" style={{ flexBasis: 200, maxWidth: 240, gap: 6 }}>
                                <label className="ay-lbl" htmlFor="ay-odul">Ödül</label>
                                <span className="ay-help">Müşterinin kartında yazar.</span>
                            </div>
                            <div className="ay-row-r" style={{ flexBasis: 340 }}>
                                <input id="ay-odul" className="ay-input" value={t.draft.reward} placeholder="ör. Ücretsiz hizmet"
                                    onChange={(e) => t.set({ reward: e.target.value })} />
                            </div>
                        </div>

                        <div className="ay-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>Önizleme · müşterinin kartı</span>
                            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>{threshold} gelişte 1 {rewardLower}</span>
                            <div aria-hidden="true" className={threshold > 10 ? 'ay-stamps many' : 'ay-stamps'}>
                                {Array.from({ length: threshold }, (_, i) => <i key={i} className={i < filled ? 'on' : undefined} />)}
                            </div>
                            <span className="ay-help sm">Örnek: {filled} damgalı bir müşteri.</span>
                        </div>
                    </>
                )}
            </div>
            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} />
        </>
    );
}
