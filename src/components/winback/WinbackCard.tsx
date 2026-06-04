import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, X, Send, Check, Loader2, MessageCircle } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { sendTextMessage } from '@/services/evolutionApi';
import { cn } from '@/utils/cn';

const RISK_DAYS = 30; // bu kadar gündür gelmeyen = riskli

interface AtRisk {
    id: string;
    name: string;
    phone: string;
    days: number;
}

export function WinbackCard({ orgId, whatsappInstance }: { orgId: string | null; whatsappInstance?: string }) {
    const { allCustomers } = useCustomers();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [sent, setSent] = useState<Set<string>>(new Set());
    const [sendingId, setSendingId] = useState<string | null>(null);
    const [bulkSending, setBulkSending] = useState(false);

    const atRisk = useMemo<AtRisk[]>(() => {
        const now = Date.now();
        return allCustomers
            .filter(c => c.phone && c.lastVisit && c.totalReservations > 0)
            .map(c => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
                days: Math.floor((now - new Date(c.lastVisit!).getTime()) / 86_400_000),
            }))
            .filter(c => c.days >= RISK_DAYS)
            .sort((a, b) => b.days - a.days);
    }, [allCustomers]);

    if (atRisk.length === 0) return null;

    const openModal = async () => {
        setOpen(true);
        if (Object.keys(drafts).length > 0) return; // zaten üretildi
        setLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/draft-messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                    organization_id: orgId,
                    intent: 'winback',
                    customers: atRisk.map(c => ({ id: c.id, name: c.name, days: c.days })),
                }),
            });
            const data = await res.json();
            const map: Record<string, string> = {};
            for (const d of data.drafts ?? []) map[d.id] = d.message;
            setDrafts(map);
        } catch {
            toast.error('Mesajlar üretilemedi, tekrar dene');
        } finally {
            setLoading(false);
        }
    };

    const sendOne = async (c: AtRisk): Promise<boolean> => {
        if (!whatsappInstance) {
            toast.error('WhatsApp bağlı değil — Ayarlar > WhatsApp\'tan bağla');
            return false;
        }
        const msg = drafts[c.id];
        if (!msg?.trim()) return false;
        const ok = await sendTextMessage(whatsappInstance, c.phone, msg);
        if (ok) {
            setSent(prev => new Set(prev).add(c.id));
            return true;
        }
        toast.error(`${c.name}: gönderilemedi`);
        return false;
    };

    const handleSendOne = async (c: AtRisk) => {
        setSendingId(c.id);
        const ok = await sendOne(c);
        if (ok) toast.success(`${c.name.split(' ')[0]} için gönderildi`);
        setSendingId(null);
    };

    const handleSendAll = async () => {
        if (!whatsappInstance) {
            toast.error('WhatsApp bağlı değil — Ayarlar > WhatsApp\'tan bağla');
            return;
        }
        setBulkSending(true);
        let count = 0;
        for (const c of atRisk) {
            if (sent.has(c.id)) continue;
            const ok = await sendOne(c);
            if (ok) count++;
            await new Promise(r => setTimeout(r, 600)); // rate-limit dostu
        }
        setBulkSending(false);
        toast.success(`${count} müşteriye mesaj gönderildi 🎉`);
    };

    const remaining = atRisk.filter(c => !sent.has(c.id)).length;

    return (
        <>
            {/* Kart */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 shadow-md">
                <div className="absolute -top-8 -right-8 w-40 h-40 bg-[#CCFF00]/10 rounded-full blur-3xl" />
                <div className="relative flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#CCFF00] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#CCFF00]/20">
                        <Sparkles className="w-5 h-5 text-slate-900" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[11px] font-bold text-[#CCFF00] uppercase tracking-wider">AI Geri-Kazanım</span>
                            <span className="text-[9px] font-bold text-slate-900 bg-[#CCFF00] px-1.5 py-0.5 rounded-md">AI</span>
                        </div>
                        <p className="text-[15px] text-white/90">
                            <span className="font-bold">{atRisk.length} müşterin</span> {RISK_DAYS}+ gündür uğramadı. Geri kazanalım mı?
                        </p>
                    </div>
                    <button
                        onClick={openModal}
                        className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all active:scale-[0.98]"
                    >
                        <Sparkles className="w-4 h-4" />
                        Mesajları Hazırla
                    </button>
                </div>
            </div>

            {/* Modal */}
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
                    <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                        {/* Başlık */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-[#CCFF00]" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">Geri-Kazanım Mesajları</h3>
                                    <p className="text-[11px] text-gray-400">AI hazırladı · gönder veya düzenle</p>
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Liste */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <Loader2 className="w-7 h-7 text-[#7a9900] animate-spin" />
                                    <p className="text-sm text-gray-400">AI mesajları yazıyor...</p>
                                </div>
                            ) : (
                                atRisk.map(c => {
                                    const isSent = sent.has(c.id);
                                    return (
                                        <div key={c.id} className={cn(
                                            "rounded-xl border p-3 transition-all",
                                            isSent ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-gray-50/50"
                                        )}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-gray-900">{c.name}</span>
                                                    <span className="text-[10px] font-semibold text-gray-400">{c.days} gündür yok</span>
                                                </div>
                                                {isSent ? (
                                                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                                                        <Check className="w-3.5 h-3.5" /> Gönderildi
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleSendOne(c)}
                                                        disabled={sendingId === c.id || bulkSending}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                                    >
                                                        {sendingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                                        Gönder
                                                    </button>
                                                )}
                                            </div>
                                            <textarea
                                                value={drafts[c.id] ?? ''}
                                                onChange={e => setDrafts(p => ({ ...p, [c.id]: e.target.value }))}
                                                disabled={isSent}
                                                rows={2}
                                                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none resize-none disabled:opacity-60"
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Alt bar */}
                        {!loading && (
                            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
                                {!whatsappInstance ? (
                                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp bağlı değil
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-400">{remaining} mesaj gönderilmeyi bekliyor</p>
                                )}
                                <button
                                    onClick={handleSendAll}
                                    disabled={bulkSending || remaining === 0 || !whatsappInstance}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all active:scale-[0.98] disabled:opacity-40"
                                >
                                    {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Tümünü Gönder
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
