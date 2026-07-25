import { useEffect, useMemo, useState } from 'react';
import { normalizePhone } from '@/lib/phone';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, CreditCard, GlassWater, MessageCircle, Phone, Plus } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { computePatientFinance, planRemaining } from '@/lib/patientBalance';
import { cn } from '@/utils/cn';
import { formatDateEU, toISODate } from '@/utils/date';
import { MONO } from '@/components/dashboard/kpi';
import { BeautySessionModal } from '@/components/beauty/BeautySessionModal';
import type { Payment, PaymentMethod, PaymentType, TreatmentPlan } from '@/types';

// Güzellik Müşteri Kartı — tasarım: "Luera TimeFlow Guzellik Salonu.html"
// müşteri kartı ekranı. Paket odaklı: başlıkta uyarı rozetleri (hamilelik,
// alerji), ortada progress'li aktif paket kartları + biten paket yenileme
// bandı, altta seans geçmişi ve Ödeme & Bakiye (patientBalance tek kaynak).

const MONTHS_TR = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
const monoDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`;
};
const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'nakit', card: 'kart', transfer: 'havale' } as Record<PaymentMethod, string>;

function waLink(phone: string): string {
    return `https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}`;
}

// Sonraki seans önerisi: son ziyaret + hizmetin dönüş periyodu (yoksa 28 gün)
function nextSuggestion(lastVisit?: string, afterDays = 28): string {
    const d = lastVisit ? new Date(lastVisit) : new Date();
    d.setDate(d.getDate() + afterDays);
    return formatDateEU(toISODate(d));
}

export function BeautyCustomerPage() {
    const { customerId } = useParams<{ customerId: string }>();
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { orgId } = useAuth();
    const { customers } = useCustomers();
    const { reservations, settings } = useReservations();
    const { plans } = useTreatmentPlans(customerId);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [modalOpen, setModalOpen] = useState(false);

    const customer = customers.find((c) => c.id === customerId);

    // Müşterinin tüm ödemeleri — bakiye patientBalance formülüyle hesaplanır
    useEffect(() => {
        if (!orgId || !customerId) return;
        let alive = true;
        void supabase.from('payments').select('*')
            .eq('organization_id', orgId).eq('customer_id', customerId)
            .order('paid_at', { ascending: false })
            .then(({ data, error }) => {
                if (!alive || error) return;
                setPayments((data || []).map((row) => ({
                    id: row.id, organizationId: row.organization_id, customerId: row.customer_id || undefined,
                    treatmentPlanId: row.treatment_plan_id || undefined, type: (row.type || 'service') as PaymentType,
                    description: row.description || undefined, amount: Number(row.amount),
                    method: row.method as PaymentMethod, paidAt: row.paid_at, createdAt: row.created_at,
                })));
            });
        return () => { alive = false; };
    }, [orgId, customerId]);

    const finance = useMemo(() => computePatientFinance(plans, payments), [plans, payments]);
    const activePlans = useMemo(() => plans.filter((p) => p.status === 'active' && p.sessionsDone < p.sessionCount), [plans]);
    const finishedPlans = useMemo(() => plans.filter((p) => p.status !== 'cancelled' && p.sessionsDone >= p.sessionCount), [plans]);

    const history = useMemo(() => reservations
        .filter((r) => r.customerId === customerId && r.status !== 'cancelled')
        .sort((a, b) => b.date === a.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date))
        .slice(0, 5), [reservations, customerId]);

    const pregnant = Boolean(customer?.customFields?.hamilelik);
    const allergy = String(customer?.customFields?.alerji || '');
    const skinType = String(customer?.customFields?.cilt_tipi || '');
    const lastPayment = payments[0];

    if (!customer) {
        return (
            <div className={cn('dash-theme flex-1 flex items-center justify-center bg-[var(--dc-page)]', dark && 'dark')}>
                <p className="text-sm text-[var(--dc-muted)]">Müşteri bulunamadı…</p>
            </div>
        );
    }

    const initials = customer.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');

    const chip = (cls: string, text: string) => (
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap', cls)}>
            <span className="w-[5px] h-[5px] rounded-full bg-current" />{text}
        </span>
    );

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto space-y-4">

                    <button onClick={() => navigate('/customers')} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--dc-muted)] hover:text-[var(--dc-ink)] transition-colors"><ArrowLeft className="w-3.5 h-3.5" />Müşteriler</button>

                    {/* Başlık kartı */}
                    <section className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] px-6 py-5 flex flex-wrap items-center gap-4">
                        <div className="w-[58px] h-[58px] rounded-[18px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[19px] font-extrabold flex items-center justify-center flex-shrink-0">{initials}</div>
                        <div className="flex-1 min-w-[220px]">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className="text-[21px] font-extrabold text-[var(--dc-ink)] tracking-[-0.025em]">{customer.name}</h1>
                                {chip('bg-[var(--dc-green-bg)] text-[var(--dc-green)]', 'Aktif müşteri')}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {pregnant && chip('bg-[var(--dc-red-bg)] text-[var(--dc-red)]', '⚠ Hamilelik — lazer uygulanmaz')}
                                {allergy && chip('bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]', `Alerji: ${allergy}`)}
                                {skinType && chip('bg-[var(--dc-surface2)] text-[var(--dc-muted)]', `Cilt: ${skinType}`)}
                                {chip('bg-[var(--dc-surface2)] text-[var(--dc-muted)]', `Üyelik: ${monoDate(customer.createdAt).split(' ').slice(1).join(' ')}`)}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[12.5px] text-[var(--dc-muted)]">
                                <span>{customer.phone}</span>
                                {customer.email && <span>{customer.email}</span>}
                                {customer.lastVisit && <span>Son ziyaret: {formatDateEU(customer.lastVisit)}</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                            {customer.phone && <>
                                <a href={waLink(customer.phone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="w-[38px] h-[38px] rounded-full border border-[var(--dc-border2)] flex items-center justify-center text-[var(--dc-muted)] hover:text-[var(--dc-green)] hover:border-[var(--dc-green)] transition-colors"><MessageCircle className="w-4 h-4" /></a>
                                <a href={`tel:${customer.phone.replace(/\s+/g, '')}`} aria-label="Ara" className="w-[38px] h-[38px] rounded-full border border-[var(--dc-border2)] flex items-center justify-center text-[var(--dc-muted)] hover:text-[var(--dc-ink)] hover:border-[var(--dc-ink)] transition-colors"><Phone className="w-4 h-4" /></a>
                            </>}
                            <button onClick={() => navigate(`/packages?sat=${customerId}`)} className="px-4 min-h-[42px] rounded-full border border-[var(--dc-border2)] text-[12.5px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] hover:border-[var(--dc-ink)] transition-colors">Paket Sat</button>
                            <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] px-4.5 min-h-[42px] px-5 rounded-full text-[13px] font-bold transition-all hover:-translate-y-px"><Plus className="w-3.5 h-3.5" />Yeni Seans</button>
                        </div>
                    </section>

                    {/* Aktif Paketler */}
                    <section className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
                        <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center gap-3">
                            <div className="w-[34px] h-[34px] rounded-[11px] bg-[var(--dc-inkbox)] flex items-center justify-center"><GlassWater className="w-4 h-4 text-[var(--dc-inkbox-fg)]" /></div>
                            <div>
                                <h2 className="text-[14px] font-bold text-[var(--dc-ink)]">Aktif Paketler</h2>
                                <p className="text-[11.5px] text-[var(--dc-muted)]">{activePlans.length} aktif{finishedPlans.length > 0 && ` · ${finishedPlans.length} tamamlandı — yenileme önerilebilir`}</p>
                            </div>
                            <button onClick={() => navigate(`/packages?sat=${customerId}`)} className="ml-auto text-[12.5px] font-semibold text-[var(--dc-orange-d)] hover:bg-[var(--dc-orange-soft)] px-3 py-2 rounded-lg transition-colors">Paket Sat →</button>
                        </div>
                        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {activePlans.length === 0 && finishedPlans.length === 0 && (
                                <p className="col-span-full text-[12.5px] text-[var(--dc-muted)] px-1 py-3">Henüz paket yok → <button onClick={() => navigate(`/packages?sat=${customerId}`)} className="font-bold text-[var(--dc-orange-d)]">Paket Sat</button></p>
                            )}
                            {activePlans.map((p) => {
                                const remaining = planRemaining(p, finance.paidByPlan);
                                const perSession = Math.round(p.totalAmount / p.sessionCount);
                                const blocked = pregnant && /lazer|incelme/i.test(p.title);
                                return (
                                    <div key={p.id} className="rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface2)] p-4 flex flex-col gap-2.5">
                                        <div className="flex items-start justify-between gap-2.5">
                                            <div>
                                                <div className="text-[14px] font-extrabold text-[var(--dc-ink)] tracking-[-0.01em]">{p.title}</div>
                                                <div className="text-[11.5px] text-[var(--dc-muted)] mt-px">{p.notes || `${p.sessionCount} seanslık paket`}</div>
                                            </div>
                                            <span className="text-[12px] font-bold text-[var(--dc-ink)] whitespace-nowrap" style={{ fontFamily: MONO }}>{p.sessionsDone}/{p.sessionCount}</span>
                                        </div>
                                        <div className="h-[7px] rounded-full bg-[var(--dc-surface3)] overflow-hidden">
                                            <span className="block h-full rounded-full bg-[var(--dc-inkbox)]" style={{ width: `${Math.round((p.sessionsDone / p.sessionCount) * 100)}%` }} />
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--dc-muted)]">
                                            <span>Kalan <b className="text-[var(--dc-ink)] font-bold" style={{ fontFamily: MONO, fontSize: 11.5 }}>{remaining > 0 ? `₺${remaining.toLocaleString('tr-TR')}` : '₺0 — peşin ödendi'}</b></span>
                                            {remaining > 0 && <span>Seans başı <b className="text-[var(--dc-ink)] font-bold" style={{ fontFamily: MONO, fontSize: 11.5 }}>₺{perSession.toLocaleString('tr-TR')}</b></span>}
                                            <span>Sonraki öneri <b className="text-[var(--dc-ink)] font-bold" style={{ fontFamily: MONO, fontSize: 11.5 }}>{nextSuggestion(customer.lastVisit, (settings.services || []).find((s) => p.title.toLocaleLowerCase('tr').includes(s.name.toLocaleLowerCase('tr')))?.recallDays || 28)}</b></span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {blocked
                                                ? chip('bg-[var(--dc-red-bg)] text-[var(--dc-red)]', '⚠ Hamilelik nedeniyle beklemede')
                                                : remaining === 0
                                                    ? chip('bg-[var(--dc-green-bg)] text-[var(--dc-green)]', 'Ödemesi tamam')
                                                    : chip('bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]', 'Taksit devam ediyor')}
                                            <span className="flex-1" />
                                            <button onClick={() => setModalOpen(true)} className="bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12px] font-bold px-3.5 min-h-[36px] rounded-full hover:bg-[var(--dc-orange)] transition-colors">Seansı Planla</button>
                                        </div>
                                    </div>
                                );
                            })}
                            {finishedPlans.map((p) => (
                                <div key={p.id} className="col-span-full rounded-2xl border border-[rgba(255,90,31,.4)] bg-[var(--dc-orange-soft)] p-4 flex flex-wrap items-center gap-3">
                                    <div className="flex-1 min-w-[200px]">
                                        <div className="text-[14px] font-extrabold text-[var(--dc-ink)]">{p.title} — tamamlandı ✨</div>
                                        <div className="text-[11.5px] text-[var(--dc-muted)] mt-0.5">Son seans {customer.lastVisit ? formatDateEU(customer.lastVisit) : '—'} · yenileme şansı yüksek</div>
                                    </div>
                                    {customer.phone && <a href={`${waLink(customer.phone)}?text=${encodeURIComponent(`Merhaba ${customer.name.split(' ')[0]} 🌸 ${p.title} paketiniz tamamlandı — yenilemek isterseniz size özel fiyatımızla yerinizi ayıralım ✨`)}`} target="_blank" rel="noopener noreferrer" className="px-3.5 min-h-[36px] inline-flex items-center rounded-full border border-[var(--dc-border2)] text-[12px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">Teklif Gönder</a>}
                                    <button onClick={() => navigate(`/packages?sat=${customerId}`)} className="bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12px] font-bold px-3.5 min-h-[36px] rounded-full hover:bg-[var(--dc-orange)] transition-colors">Paketi Yenile</button>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Alt iki kolon */}
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                        {/* Seans geçmişi */}
                        <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center gap-3">
                                <div className="w-[34px] h-[34px] rounded-[11px] bg-[var(--dc-inkbox)] flex items-center justify-center"><Clock className="w-4 h-4 text-[var(--dc-inkbox-fg)]" /></div>
                                <div>
                                    <h2 className="text-[14px] font-bold text-[var(--dc-ink)]">Seans Geçmişi</h2>
                                    <p className="text-[11.5px] text-[var(--dc-muted)]">Son {history.length} kayıt</p>
                                </div>
                                <button onClick={() => navigate('/reservations')} className="ml-auto text-[12.5px] font-semibold text-[var(--dc-orange-d)] hover:bg-[var(--dc-orange-soft)] px-3 py-2 rounded-lg transition-colors">Tümü →</button>
                            </div>
                            <div className="px-5 py-3">
                                {history.length === 0 && <p className="text-[12.5px] text-[var(--dc-muted)] py-3">Henüz seans kaydı yok</p>}
                                {history.map((r, i) => {
                                    const fromPackage = Boolean(r.customFields?.paket_plan_id);
                                    return (
                                        <div key={r.id} className="relative flex gap-3.5 py-3">
                                            {i < history.length - 1 && <span className="absolute left-[5px] top-[26px] -bottom-2 w-[2px] bg-[var(--dc-surface3)]" />}
                                            <span className="w-3 h-3 rounded-full flex-shrink-0 mt-1 border-[3px] border-[var(--dc-surface)]" style={{ background: r.serviceColor || 'var(--dc-orange)' }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap text-[13px] font-bold text-[var(--dc-ink)]">
                                                    {r.service}
                                                    <span className="text-[10.5px] font-semibold text-[var(--dc-muted)] tracking-[.06em]" style={{ fontFamily: MONO }}>{monoDate(r.date)}</span>
                                                </div>
                                                <div className="text-[12px] text-[var(--dc-muted)] mt-px">
                                                    {[r.staffName, r.customFields?.paket_seans ? `paket ${r.customFields.paket_seans}` : null, `${r.startTime}–${r.endTime}`].filter(Boolean).join(' · ')}
                                                </div>
                                            </div>
                                            <span className={cn('flex-shrink-0 text-[12px] font-bold', fromPackage ? 'text-[var(--dc-muted)]' : 'text-[var(--dc-green)]')} style={{ fontFamily: MONO }}>
                                                {fromPackage ? 'Paketten' : r.isPaid ? 'Ödendi' : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Ödeme & Bakiye */}
                        <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center gap-3">
                                <div className="w-[34px] h-[34px] rounded-[11px] bg-[var(--dc-inkbox)] flex items-center justify-center"><CreditCard className="w-4 h-4 text-[var(--dc-inkbox-fg)]" /></div>
                                <div>
                                    <h2 className="text-[14px] font-bold text-[var(--dc-ink)]">Ödeme & Bakiye</h2>
                                    <p className="text-[11.5px] text-[var(--dc-muted)]">Paket taksitleri dahil</p>
                                </div>
                            </div>
                            <div className="px-5 pt-4 pb-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--dc-muted)]" style={{ fontFamily: MONO }}>Kalan Bakiye</span>
                                <div className={cn('text-[28px] font-black tracking-[-0.03em] mt-1.5', finance.balance > 0 ? 'text-[var(--dc-red)]' : 'text-[var(--dc-green)]')} style={{ fontFamily: MONO }}>₺{finance.balance.toLocaleString('tr-TR')}</div>
                            </div>
                            <div className="px-5 pb-4">
                                {[
                                    ['Toplam paket tutarı', `₺${finance.total.toLocaleString('tr-TR')}`, 'var(--dc-ink)'],
                                    ['Ödenen', `₺${finance.paid.toLocaleString('tr-TR')}`, 'var(--dc-green)'],
                                    ...(finance.balance > 0 ? [['Kalan', `₺${finance.balance.toLocaleString('tr-TR')}`, 'var(--dc-red)'] as const] : []),
                                    ...(lastPayment ? [['Son ödeme', `${formatDateEU(lastPayment.paidAt.slice(0, 10))} · ${METHOD_LABEL[lastPayment.method] || lastPayment.method}`, 'var(--dc-ink)'] as const] : []),
                                ].map(([l, v, color]) => (
                                    <div key={l as string} className="flex items-center justify-between gap-2.5 py-2.5 border-b last:border-b-0 border-[var(--dc-border)] text-[13px]">
                                        <span className="text-[var(--dc-muted)] font-semibold">{l}</span>
                                        <span className="font-bold text-[12.5px]" style={{ fontFamily: MONO, color: color as string }}>{v}</span>
                                    </div>
                                ))}
                                <div className="flex gap-2 pt-3">
                                    <button onClick={() => navigate('/kasa')} className="bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12px] font-bold px-4 min-h-[36px] rounded-full hover:bg-[var(--dc-orange)] transition-colors">Ödeme Al</button>
                                    {customer.phone && <a href={`${waLink(customer.phone)}?text=${encodeURIComponent(`Merhaba ${customer.name.split(' ')[0]} 🌸 Güncel hesap özetiniz: toplam ₺${finance.total.toLocaleString('tr-TR')}, ödenen ₺${finance.paid.toLocaleString('tr-TR')}, kalan ₺${finance.balance.toLocaleString('tr-TR')}. Dilediğiniz zaman salonumuzdan ödeyebilirsiniz ✨`)}`} target="_blank" rel="noopener noreferrer" className="px-4 min-h-[36px] inline-flex items-center rounded-full border border-[var(--dc-border2)] text-[12px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">Ekstre Gönder</a>}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {modalOpen && (
                <BeautySessionModal customer={customer} onClose={() => setModalOpen(false)} onCreated={() => setModalOpen(false)} />
            )}
        </div>
    );
}
