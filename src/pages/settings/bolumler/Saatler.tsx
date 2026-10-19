/**
 * A2 · Çalışma saatleri.
 *
 * Pazartesi'den başlar (kayıtta 0 = Pazar; yalnız gösterim sırası değişir).
 * Gün başına TEK aralık — veri modeli tek aralık, "mola ekle" çizilmez.
 * Açık/kapalı bir onay kutusu, anahtar değil: saatlerle birlikte taslağa
 * girer, yarım bir hafta kaydedilmez.
 *
 * Randevu aralığı (eski "Slot süresi") buraya taşındı çünkü etkisi saatlerde;
 * tek dokunuşluk seçim, anında kaydedilir.
 */
import { useState } from 'react';
import { useReservations } from '@/hooks/useReservations';
import type { WorkingHours } from '@/types';
import { hoursValid } from '../ayarlarModel';
import { useTaslak } from '../useTaslak';
import { Head, I, RowLabel, SaveBar, Seg, type SwitchStatus } from '../parcalar';

type DayKey = 'd0' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6';
type Draft = Record<DayKey, WorkingHours>;

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const ORDER: DayKey[] = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd0'];

function toDraft(list: WorkingHours[]): Draft {
    const out = {} as Draft;
    for (let i = 0; i < 7; i++) {
        const h = list.find((x) => x.day === i);
        out[`d${i}` as DayKey] = h ?? { day: i, dayName: DAY_NAMES[i], start: '09:00', end: '18:00', isOff: true };
    }
    return out;
}

export function Saatler() {
    const { settings, updateSettings } = useReservations();
    const saved = toDraft(settings.workingHours || []);

    const t = useTaslak<Draft>({
        saved,
        sectionLabel: 'Çalışma saatleri',
        labels: Object.fromEntries(ORDER.map((k) => [k, DAY_NAMES[Number(k.slice(1))]])) as Record<DayKey, string>,
        validate: (d) => {
            const bad = ORDER.find((k) => !d[k].isOff && !hoursValid(d[k].start, d[k].end));
            return bad ? `${DAY_NAMES[Number(bad.slice(1))]}: bitiş saati başlangıçtan önce — düzeltin` : null;
        },
        save: (d) => updateSettings({ ...settings, workingHours: [0, 1, 2, 3, 4, 5, 6].map((i) => d[`d${i}` as DayKey]) }),
    });
    const d = t.draft;
    const setDay = (k: DayKey, patch: Partial<WorkingHours>) => t.set({ [k]: { ...d[k], ...patch } } as Partial<Draft>);

    const copyMonday = () => {
        const m = d.d1;
        t.set({ d2: { ...d.d2, isOff: m.isOff, start: m.start, end: m.end }, d3: { ...d.d3, isOff: m.isOff, start: m.start, end: m.end },
            d4: { ...d.d4, isOff: m.isOff, start: m.start, end: m.end }, d5: { ...d.d5, isOff: m.isOff, start: m.start, end: m.end } });
    };

    // Randevu aralığı — anında
    const [slotStatus, setSlotStatus] = useState<SwitchStatus>('idle');
    const [slotPending, setSlotPending] = useState<number | null>(null);
    const slot = slotPending ?? settings.slotDuration ?? 30;
    const pickSlot = async (v: number) => {
        if (v === settings.slotDuration || slotStatus === 'saving') return;
        setSlotPending(v); setSlotStatus('saving');
        const ok = await updateSettings({ ...settings, slotDuration: v });
        setSlotPending(null);
        setSlotStatus(ok ? 'saved' : 'error');
        if (ok) window.setTimeout(() => setSlotStatus('idle'), 2000);
    };

    return (
        <>
            <div className="ay-col">
                <Head title="Çalışma saatleri" lead="Takvim ve online randevu sayfası bu saatlere göre açılır. Günde tek aralık." />

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingBottom: 16 }}>
                    <button type="button" className="ay-btn h40" onClick={copyMonday}><I n="copy" />Pazartesiyi hafta içine uygula</button>
                    <span className="ay-help">Salı–Cuma'ya Pazartesi'nin saatlerini yazar.</span>
                </div>

                <div role="table" aria-label="Çalışma saatleri" style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--bd)' }}>
                    {ORDER.map((k) => {
                        const h = d[k];
                        const open = !h.isOff;
                        const err = open && !hoursValid(h.start, h.end);
                        const name = DAY_NAMES[Number(k.slice(1))];
                        return (
                            <div role="row" key={k} className="ay-day">
                                {(t.isChanged(k) || err) && <span aria-hidden="true" className="ay-changed" />}
                                <span className="dn">{name}</span>
                                <button type="button" role="checkbox" aria-checked={open} aria-label={`${name} açık`} className="ay-check"
                                    onClick={() => setDay(k, { isOff: open })}>
                                    <span className="box">{open && <I n="check" />}</span>
                                    {open ? 'Açık' : <span className="off">Kapalı</span>}
                                </button>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {open ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <input type="time" className="ay-time" aria-label={`${name} başlangıç`} value={h.start}
                                                onChange={(e) => setDay(k, { start: e.target.value })} />
                                            <span style={{ color: 'var(--tx3)' }}>–</span>
                                            <input type="time" className="ay-time" aria-label={`${name} bitiş`} value={h.end} aria-invalid={err || undefined}
                                                onChange={(e) => setDay(k, { end: e.target.value })} />
                                        </div>
                                    ) : <span style={{ fontSize: 15, color: 'var(--tx2)' }}>Bu gün randevu alınmaz.</span>}
                                    {err && <span className="ay-errline" role="alert"><I n="alert" />Bitiş, başlangıçtan önce olamaz.</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div id="ay-aralik" className="ay-row" style={{ padding: '26px 0 0', marginTop: 30, borderTopColor: 'var(--bd2)' }}>
                    <RowLabel label="Randevu aralığı" help="Takvim ve online randevu sayfası saatleri bu aralıkla gösterir." />
                    <div className="ay-row-r horiz" style={{ gap: 14 }}>
                        <Seg label="Randevu aralığı" value={slot} onChange={(v) => void pickSlot(v)}
                            options={[15, 30, 60].map((v) => ({ v, t: `${v} dk` }))} />
                        {slotStatus === 'saved' ? <span className="ay-saved" role="status"><I n="check" />Kaydedildi</span>
                            : slotStatus === 'error' ? <span className="ay-errline" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>
                                : <span className="ay-help sm">Seçince anında kaydedilir.</span>}
                    </div>
                </div>
            </div>

            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} />
        </>
    );
}
