import { useMemo, useState } from 'react';
import { Sparkles, ChevronDown, Heart, CalendarPlus, ArrowRight } from 'lucide-react';
import { useInsight } from '@/hooks/useInsight';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { AiMessageModal, type MsgTarget } from './AiMessageModal';
import { cn } from '@/utils/cn';

const RISK_DAYS = 30;
const ENGAGED_DAYS = 90;
const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function AiAssistant() {
    const { insight, loading: insightLoading } = useInsight();
    const { allCustomers } = useCustomers();
    const { reservations, settings, orgId } = useReservations();

    const [open, setOpen] = useState(false);
    const [modal, setModal] = useState<null | 'winback' | 'campaign'>(null);

    // Müşteri hedefleri
    const { winback, campaign } = useMemo(() => {
        const now = Date.now();
        const base = allCustomers
            .filter(c => c.phone && c.lastVisit && c.totalReservations > 0)
            .map<MsgTarget>(c => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
                days: Math.floor((now - new Date(c.lastVisit!).getTime()) / 86_400_000),
            }));
        return {
            winback: base.filter(c => c.days >= RISK_DAYS).sort((a, b) => b.days - a.days),
            campaign: base.filter(c => c.days <= ENGAGED_DAYS).sort((a, b) => a.days - b.days).slice(0, 15),
        };
    }, [allCustomers]);

    // Sakin gün (son 30 gün)
    const quietDay = useMemo(() => {
        const now = Date.now();
        const counts = new Array(7).fill(0);
        let any = false;
        for (const r of reservations) {
            if (r.status === 'cancelled') continue;
            const t = new Date(r.date + 'T12:00:00').getTime();
            if (now - t > 30 * 86_400_000) continue;
            counts[new Date(r.date + 'T12:00:00').getDay()]++;
            any = true;
        }
        if (!any) return 'Pazartesi';
        let minDay = 1, minVal = Infinity;
        for (let d = 1; d <= 6; d++) if (counts[d] < minVal) { minVal = counts[d]; minDay = d; }
        return DAYS_TR[minDay];
    }, [reservations]);

    const hasActions = winback.length > 0 || campaign.length > 0;

    if (!insight && !insightLoading && !hasActions) return null;

    return (
        <>
            <div className="relative min-w-0 flex-1">
                <button
                    onClick={() => setOpen(o => !o)}
                    className="group flex items-center gap-2 w-full min-w-0 pl-1.5 pr-2.5 py-1.5 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 ring-1 ring-[#CCFF00]/25 shadow-sm hover:ring-[#CCFF00]/50 transition-all"
                >
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#CCFF00] flex-shrink-0 shadow-sm shadow-[#CCFF00]/30">
                        <Sparkles className="w-3.5 h-3.5 text-slate-900" />
                    </span>
                    <span className="text-[10px] font-extrabold text-[#CCFF00] uppercase tracking-wider flex-shrink-0">AI</span>
                    <span className="w-px h-3.5 bg-white/15 flex-shrink-0" />
                    {insightLoading && !insight ? (
                        <span className="h-2.5 w-32 bg-white/15 rounded-full animate-pulse" />
                    ) : (
                        <span className="text-[13px] text-white/90 truncate">{insight ?? 'AI Asistan'}</span>
                    )}
                    <ChevronDown className={cn("w-3.5 h-3.5 text-white/40 flex-shrink-0 transition-transform", open && "rotate-180")} />
                </button>

                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <div className="absolute z-50 left-0 mt-2 w-[26rem] max-w-[90vw] rounded-2xl bg-white border border-gray-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            {/* İçgörü */}
                            {insight && (
                                <div className="p-4 border-b border-gray-100">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#CCFF00]">
                                            <Sparkles className="w-3.5 h-3.5 text-slate-900" />
                                        </span>
                                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Günün İçgörüsü</span>
                                    </div>
                                    <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
                                </div>
                            )}

                            {/* Aksiyonlar */}
                            {hasActions && (
                                <div className="p-2">
                                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">AI Aksiyonlar</p>

                                    {winback.length > 0 && (
                                        <button
                                            onClick={() => { setModal('winback'); setOpen(false); }}
                                            className="flex items-center gap-3 w-full px-2.5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                                        >
                                            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                                                <Heart className="w-4 h-4 text-rose-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800">Müşteri geri kazan</p>
                                                <p className="text-[11px] text-gray-400">{winback.length} müşteri {RISK_DAYS}+ gündür uğramadı</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                                        </button>
                                    )}

                                    {campaign.length > 0 && (
                                        <button
                                            onClick={() => { setModal('campaign'); setOpen(false); }}
                                            className="flex items-center gap-3 w-full px-2.5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                                        >
                                            <div className="w-9 h-9 rounded-xl bg-[#CCFF00]/15 flex items-center justify-center flex-shrink-0">
                                                <CalendarPlus className="w-4 h-4 text-[#5c7300]" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800">Sakin günü doldur</p>
                                                <p className="text-[11px] text-gray-400">{quietDay} için {campaign.length} müşteriye davet</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Modallar */}
            <AiMessageModal
                mode="winback"
                open={modal === 'winback'}
                onClose={() => setModal(null)}
                orgId={orgId}
                whatsappInstance={settings.whatsappInstance}
                targets={winback}
            />
            <AiMessageModal
                mode="campaign"
                open={modal === 'campaign'}
                onClose={() => setModal(null)}
                orgId={orgId}
                whatsappInstance={settings.whatsappInstance}
                targets={campaign}
                context={`${quietDay} günü`}
            />
        </>
    );
}
