/**
 * A7 · WhatsApp.
 *
 * Üç blok, okuma sırasıyla: bağlantı → AI asistan → gönderilen mesajlar.
 * Her mesaj kartı NE ZAMAN gittiğini ve gerçek baloncuğu gösterir (metinler
 * `waTemplates`'ten — tasarım dosyasındaki örnekten DEĞİL); etkisini
 * belirleyen ayar (Google linki, indirim, teşvik satırı) kartın içinde.
 *
 * 24 ve 2 saat önceki hatırlatmaların anahtarı YOK: WhatsApp bağlıyken her
 * zaman gider ve öyle yazılır. "Sıradaki randevu daveti" eskiden Genel'deydi
 * (settings.rebook_*), buraya geldi.
 *
 * Hattın telefon numarası sistemde KAYITLI DEĞİL (`org_whatsapp`'ta kolon
 * yok); bağlıyken yalnız "… tarihinden beri" yazılır, numara uydurulmaz.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useSectorComms } from '@/hooks/useSectorComms';
import {
    build24hMessage, build2hMessage, buildConfirmationMessage, buildDiscountLine, buildRebookInvite, buildRebookMessage,
    buildRecallMessage, buildRenewalMessage, buildReviewMessage, buildWinbackMessage,
} from '@/services/waTemplates';
import { WA_FAIL_TEXT, lastProxyError, sendWhatsApp, waConnect, waDisconnect, waHealth, waSetFeatures, waState, type WaHealth } from '@/services/whatsapp';
import { sinceText } from '../ayarlarModel';
import { useTaslak, type Taslak } from '../useTaslak';
import { Dots, Head, I, Modal, SaveBar, Switch } from '../parcalar';
import { useSwitchSave } from '../useSwitchSave';

type FeatureKey = 'confirmation' | 'review' | 'winback' | 'renewal' | 'recall' | 'assistant';

const PREVIEW_TOMORROW_ISO = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
const PREVIEW_DISCOUNT_CODE = 'K7RM2P';

interface Draft {
    google: string;
    discPct: string;
    discDays: string;
    rebookNote: string;
    persona: string;
    audience: string;
    servicePhrase: string;
    emoji: string;
    recallConcept: string;
    recallDays: string;
}

/** WhatsApp'ın *kalın* işaretini baloncukta kalın çizer; satırları böler. */
function Bubble({ text, time, dim }: { text: string; time: string; dim?: boolean }) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const bold = (l: string): ReactNode[] => l.split(/(\*[^*]+\*)/g).map((part, i) =>
        /^\*[^*]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : <span key={i}>{part}</span>);
    return (
        <div className="ay-chat" style={{ opacity: dim ? 0.42 : 1 }}>
            <div className="ay-bubble">
                {lines.map((l, i) => <span key={i}>{bold(l)}</span>)}
                <span className="t">{time} ✓✓</span>
            </div>
        </div>
    );
}

export function WhatsApp() {
    const { settings, updateSettings } = useReservations();
    const { profile, savePartial } = useOrgProfile();
    const { connection, loading, setupError, isConnected, isBroken, refresh } = useWhatsApp();
    const commsApi = useSectorComms(settings.sector || 'genel');
    const comms = commsApi.effective;

    // ── Bağlantı ──
    const [ui, setUi] = useState<'creating' | 'qr' | 'checking' | null>(null);
    const [qr, setQr] = useState<string | null>(null);
    const [qrLeft, setQrLeft] = useState(60);
    const [health, setHealth] = useState<WaHealth | null>(null);
    const [webhookWarn, setWebhookWarn] = useState<string | null>(null);
    const [askDisconnect, setAskDisconnect] = useState(false);
    const poll = useRef<number | undefined>(undefined);
    const tick = useRef<number | undefined>(undefined);
    const stop = useCallback(() => { window.clearInterval(poll.current); window.clearInterval(tick.current); }, []);
    useEffect(() => stop, [stop]);

    const loadHealth = useCallback(async () => { setHealth(await waHealth()); }, []);
    useEffect(() => {
        if (loading || !isConnected) return;
        let alive = true;
        void (async () => { const h = await waHealth(); if (alive) setHealth(h); })();
        return () => { alive = false; };
    }, [loading, isConnected]);

    const startQrLoop = useCallback(() => {
        stop();
        poll.current = window.setInterval(async () => {
            const res = await waState();
            if (res?.connected) {
                stop(); setQr(null); setUi(null);
                setWebhookWarn(res.webhook && !res.webhook.ok ? (res.webhook.reason ?? 'bilinmiyor') : null);
                void refresh(); void loadHealth();
                toast.success('WhatsApp bağlandı');
            }
        }, 3000);
        setQrLeft(60);
        tick.current = window.setInterval(() => {
            setQrLeft((p) => {
                if (p <= 1) { void waConnect().then((r) => { if (r?.qr) setQr(r.qr); }); return 60; }
                return p - 1;
            });
        }, 1000);
    }, [stop, refresh, loadHealth]);

    const connect = async () => {
        setUi('creating'); setQr(null);
        const res = await waConnect();
        if (!res) { setUi(null); toast.error(lastProxyError || 'Bağlantı başlatılamadı'); return; }
        setWebhookWarn(res.webhook && !res.webhook.ok ? (res.webhook.reason ?? 'bilinmiyor') : null);
        if (res.connected) { setUi(null); void refresh(); void loadHealth(); toast.success('WhatsApp zaten bağlı'); return; }
        if (!res.qr) { setUi(null); toast.error('QR kod alınamadı, tekrar deneyin'); return; }
        setQr(res.qr); setUi('qr'); startQrLoop();
    };
    const refreshQr = async () => {
        const res = await waConnect();
        if (res?.qr) { setQr(res.qr); setQrLeft(60); } else toast.error('QR yenilenemedi');
    };
    const disconnect = async () => {
        stop();
        await waDisconnect();
        await refresh();
        setUi(null); setQr(null); setHealth(null); setAskDisconnect(false);
        toast.success('WhatsApp bağlantısı kesildi');
    };

    // ── Test mesajı ──
    const [testPhone, setTestPhone] = useState('');
    const [testBusy, setTestBusy] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string; detail?: string } | null>(null);
    const sendTest = async () => {
        if (testBusy) return;
        setTestBusy(true); setTestResult(null);
        const res = await sendWhatsApp(testPhone,
            `${settings.businessName} · WhatsApp test mesajı ✅\n\nBu mesajı aldıysanız randevu onayları da gönderilebiliyor demektir.`, 'confirmation');
        setTestBusy(false);
        setTestResult(res.ok
            ? { ok: true, text: 'Gönderildi. Telefonu kontrol edin.' }
            : { ok: false, text: res.reason ? WA_FAIL_TEXT[res.reason] : 'Gönderilemedi.', detail: lastProxyError || res.reason || 'bilinmiyor' });
        void loadHealth();
    };

    // ── Özellik anahtarları (anında) ──
    const setFeature = (key: FeatureKey) => async (next: boolean) => {
        const res = await waSetFeatures({ [key]: next });
        if (res?.ok) { void refresh(); return true; }
        return false;
    };

    // ── Taslak: kartların içindeki ayarlar + mesaj dili ──
    const t = useTaslak<Draft>({
        saved: {
            google: profile.googleReviewUrl,
            discPct: profile.winbackDiscountPercent ? String(profile.winbackDiscountPercent) : '0',
            discDays: String(profile.winbackDiscountDays ?? 30),
            rebookNote: settings.rebookNote || '',
            persona: comms.persona, audience: comms.audience, servicePhrase: comms.servicePhrase, emoji: comms.emoji,
            recallConcept: comms.recall?.concept ?? '', recallDays: comms.recall ? String(comms.recall.afterDays) : '',
        },
        sectionLabel: 'WhatsApp',
        labels: {
            google: 'Google değerlendirme linki', discPct: 'İndirim oranı', discDays: 'İndirim süresi', rebookNote: 'Teşvik satırı',
            persona: 'Karakter', audience: 'Muhatap', servicePhrase: '“…hatırlatmak istedik” ifadesi', emoji: 'Emoji',
            recallConcept: 'Dönüş kavramı', recallDays: 'Kaç gün sonra',
        },
        validate: (d) => (Number(d.discPct) > 100 ? 'İndirim oranı en çok %100 olabilir.' : null),
        save: async (d, s) => {
            const patch: Parameters<typeof savePartial>[0] = {};
            if (d.google !== s.google) patch.googleReviewUrl = d.google.trim();
            if (d.discPct !== s.discPct) patch.winbackDiscountPercent = Math.min(100, Number(d.discPct) || 0);
            if (d.discDays !== s.discDays) patch.winbackDiscountDays = Number(d.discDays) || 0;
            if (Object.keys(patch).length > 0 && !(await savePartial(patch, { quiet: true }))) return false;
            if (d.rebookNote !== s.rebookNote && !(await updateSettings({ ...settings, rebookNote: d.rebookNote.trim() }))) return false;
            const commsChanged = (['persona', 'audience', 'servicePhrase', 'emoji', 'recallConcept', 'recallDays'] as const).some((k) => d[k] !== s[k]);
            if (commsChanged) {
                const ok = await commsApi.save({
                    ...comms,
                    persona: d.persona, audience: d.audience, servicePhrase: d.servicePhrase, emoji: d.emoji.slice(0, 4),
                    recall: comms.recall ? { ...comms.recall, concept: d.recallConcept, afterDays: Number(d.recallDays) || comms.recall.afterDays } : comms.recall,
                });
                if (!ok) return false;
            }
            return true;
        },
    });
    const d = t.draft;
    const [langOpen, setLangOpen] = useState(false);

    // ── Önizleme metinleri (taslakla canlı) ──
    const previewComms = { ...comms, persona: d.persona, audience: d.audience, servicePhrase: d.servicePhrase, emoji: d.emoji,
        recall: comms.recall ? { ...comms.recall, concept: d.recallConcept, afterDays: Number(d.recallDays) || comms.recall.afterDays } : undefined };
    const sample = settings.sector === 'avukat' ? 'Ahmet Yılmaz' : 'Ayşe Demir';
    const service = settings.services[0]?.name || 'Konsültasyon';
    const biz = settings.businessName || 'İşletmeniz';
    const maps = profile.mapsUrl || undefined;
    const bookingUrl = profile.slug ? `${window.location.origin}/book/${profile.slug}` : undefined;
    const pct = Math.min(100, Number(d.discPct) || 0);

    const f = connection.features;
    // Zamanlayıcı açık işletmede memnuniyet ve davet sunucudan, başka zamanda gider (131/132).
    const sched = connection.schedulerOn;
    const cards: {
        key: string; title: string; when: string; feature?: FeatureKey; always?: boolean; text: string; time: string;
        dim?: boolean; extra?: ReactNode; on?: boolean; onToggle?: (v: boolean) => Promise<boolean>; anchor?: string;
    }[] = [
        { key: '24h', title: '24 saat önce hatırlatma', when: 'Randevudan 24 saat önce. Anahtarı yok: WhatsApp bağlıyken her zaman gider.', always: true, time: '10:00',
            text: build24hMessage({ comms: previewComms, customerName: sample, startTime: '10:00', service, businessName: biz, mapsUrl: maps }) },
        { key: '2h', title: '2 saat önce hatırlatma', when: 'Randevudan 2 saat önce. Anahtarı yok: WhatsApp bağlıyken her zaman gider.', always: true, time: '08:00',
            text: build2hMessage({ comms: previewComms, customerName: sample, startTime: '10:00', service, businessName: biz, mapsUrl: maps }) },
        { key: 'confirmation', title: 'Randevu onayı', when: 'Randevu oluşur oluşmaz; panelden, online randevudan ve WhatsApp botundan.', feature: 'confirmation', time: '09:12',
            text: buildConfirmationMessage({ comms: previewComms, customerName: sample, date: PREVIEW_TOMORROW_ISO, startTime: '10:00', service, businessName: biz, mapsUrl: maps }) },
        { key: 'review', title: 'Google değerlendirme',
            when: sched ? 'Randevu bitiminden 30 dk sonra memnuniyet sorulur; puan verene Google linki gider.' : 'Hesap kapandıktan ~3 saat sonra, randevu başına bir kez.',
            feature: 'review', time: '13:40', anchor: 'ay-google',
            dim: !d.google.trim() && !sched,
            text: buildReviewMessage({ comms: previewComms, customerName: sample, businessName: biz, reviewUrl: d.google.trim() || '— link yok' }),
            extra: (
                <div className="ay-msg-ctrl" style={{ position: 'relative' }}>
                    {t.isChanged('google') && <span aria-hidden="true" className="ay-changed" style={{ left: -40, top: 0, bottom: 0 }} />}
                    <label className="ay-lbl sm" htmlFor="ay-google-in">Google değerlendirme linki</label>
                    <input id="ay-google-in" className="ay-input sm mono" value={d.google} placeholder="g.page/r/…/review" onChange={(e) => t.set({ google: e.target.value })} />
                    <span className="ay-help sm">Google işletme profilinizde <b>Yorum iste → bağlantıyı kopyala</b>.</span>
                    {!d.google.trim() && <span role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 700 }}><span className="ay-dot s8 warn" />{sched ? 'Link yok — puan sorulur ama link gitmez.' : 'Link yok — bu mesaj gitmiyor.'}</span>}
                </div>
            ) },
        ...(comms.recall ? [{ key: 'recall', title: `Dönüş hatırlatması · ${d.recallConcept || comms.recall.concept}`,
            when: `Son ziyaretten ~${Number(d.recallDays) || comms.recall.afterDays} gün sonra, tarihe 2 gün kala bir kez. Bu sektörde var.`, feature: 'recall' as FeatureKey, time: '11:00',
            text: buildRecallMessage({ customerName: sample, businessName: biz, comms: previewComms }) }] : []),
        { key: 'winback', title: 'Sizi özledik', when: '60 günden uzun gelmeyen, ileri randevusu olmayan müşteriye bir kez.', feature: 'winback', time: '11:30', anchor: 'ay-indirim',
            text: buildWinbackMessage({ customerName: sample, businessName: biz, comms: previewComms }) + (pct > 0 ? buildDiscountLine(pct, Number(d.discDays) || 0, PREVIEW_DISCOUNT_CODE) : ''),
            extra: (
                <div className="ay-msg-ctrl" style={{ position: 'relative' }}>
                    {(t.isChanged('discPct') || t.isChanged('discDays')) && <span aria-hidden="true" className="ay-changed" style={{ left: -40, top: 0, bottom: 0 }} />}
                    <span className="ay-lbl sm">İndirim teklifi</span>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div className="ay-affix sm" style={{ width: 120 }}>
                            <span className="pre">%</span>
                            <input aria-label="İndirim oranı" inputMode="numeric" value={d.discPct} onChange={(e) => t.set({ discPct: e.target.value.replace(/\D/g, '').slice(0, 3) })} style={{ textAlign: 'right' }} />
                        </div>
                        <div className="ay-affix sm" style={{ width: 150 }}>
                            <input aria-label="İndirim kaç gün geçerli" inputMode="numeric" value={d.discDays} onChange={(e) => t.set({ discDays: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                            <span className="suf">gün geçerli</span>
                        </div>
                    </div>
                    <span className="ay-help sm" style={{ textWrap: 'pretty' }}>Her müşteriye özel kod üretilir; Kasa'da girilince uygulanır ve kimin döndüğü ölçülür. Oran 0 ise mesaj indirimsiz gider.</span>
                </div>
            ) },
        { key: 'renewal', title: 'Paket yenileme', when: 'Tüm seansları biten paketin sahibine paket başına bir kez.', feature: 'renewal', time: '16:05',
            text: buildRenewalMessage({ customerName: sample, packageTitle: '10 Seans Lazer', businessName: biz, comms: previewComms }) },
        { key: 'rebook', title: 'Sıradaki randevu daveti',
            when: sched ? 'Ödemeden 1,5 saat sonra; ileri randevusu olana ve memnun kalmayana gitmez.' : 'Randevu tamamlanınca tekrar randevu daveti.',
            time: sched ? '14:35' : '11:05',
            on: Boolean(settings.rebookEnabled),
            onToggle: (v) => updateSettings({ ...settings, rebookEnabled: v }),
            text: sched
                ? buildRebookInvite({ customerName: sample.split(' ')[0], service, note: d.rebookNote, bookingUrl })
                : buildRebookMessage({ customerName: sample.split(' ')[0], service, businessName: biz, note: d.rebookNote, bookingUrl }),
            extra: (
                <div className="ay-msg-ctrl" style={{ position: 'relative' }}>
                    {t.isChanged('rebookNote') && <span aria-hidden="true" className="ay-changed" style={{ left: -40, top: 0, bottom: 0 }} />}
                    <label className="ay-lbl sm" htmlFor="ay-tesvik">Teşvik satırı <span style={{ fontWeight: 500, color: 'var(--tx2)' }}>· isteğe bağlı</span></label>
                    <div className="ay-affix sm">
                        <span className="pre" style={{ color: 'var(--tx)' }}>🎁</span>
                        <input id="ay-tesvik" value={d.rebookNote} placeholder="ör. Bir sonraki randevunuzda %10 indirim" onChange={(e) => t.set({ rebookNote: e.target.value })} style={{ fontWeight: 600, fontSize: 15.5 }} />
                    </div>
                    <span className="ay-help sm">Mesajın sonuna “🎁 …” olarak eklenir.</span>
                    <span className="ay-req">
                        <span className={isConnected ? 'ok' : 'no'}><I n={isConnected ? 'check' : 'x'} />WhatsApp bağlı</span>
                        <span className={profile.slug ? 'ok' : 'no'}><I n={profile.slug ? 'check' : 'x'} />Randevu adresi tanımlı</span>
                    </span>
                </div>
            ) },
    ];

    // ── Bağlantı kartı ──
    const status: 'setup' | 'checking' | 'creating' | 'qr' | 'connected' | 'broken' | 'idle' =
        setupError ? 'setup' : ui ?? (loading ? 'checking' : isConnected ? 'connected' : isBroken ? 'broken' : 'idle');
    const since = sinceText(connection.connectedAt);
    const logo = <span className="ay-wa-logo"><I n="wa" size={24} /></span>;

    let card: ReactNode;
    if (status === 'setup') {
        card = (
            <div className="ay-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{logo}
                    <span className="ay-wa-st"><span className="ay-dot s9 unk" />Durum okunamadı</span></div>
                <span className="ay-help">{setupError}</span>
                <button type="button" className="ay-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void refresh()}><I n="refresh" />Yenile</button>
            </div>
        );
    } else if (status === 'checking' || status === 'creating') {
        card = (
            <div className="ay-card pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{logo}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span className="ay-wa-st">{status === 'checking' ? 'Kontrol ediliyor' : 'Hazırlanıyor'}<Dots /></span>
                    <span className="ay-help" style={{ fontSize: 14.5 }}>{status === 'checking' ? 'Bağlantı durumu okunuyor. Mesaj kartları bu sırada değişmez.' : 'İşletmenize özel WhatsApp hattı hazırlanıyor; QR kod birazdan çıkar.'}</span>
                </span>
            </div>
        );
    } else if (status === 'qr') {
        card = (
            <div className="ay-card pad" style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr)', gap: 24 }}>
                <div className="ay-qr">{qr ? <img alt="WhatsApp QR kodu" src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} /> : <Dots />}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <span style={{ fontSize: 17, fontWeight: 800 }}>Telefonunuzla okutun</span>
                    <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.45, color: 'var(--tx2)' }}>
                        <li>Telefonda WhatsApp'ı açın.</li>
                        <li><b style={{ color: 'var(--tx)' }}>Bağlı Cihazlar → Cihaz Ekle</b>'ye dokunun.</li>
                        <li>Kameranızı bu koda tutun.</li>
                    </ol>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>Kod <span className="mono">{`0:${String(qrLeft).padStart(2, '0')}`}</span> sonra yenilenir.</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="ay-btn" onClick={() => void refreshQr()}><I n="refresh" />Yenile</button>
                        <button type="button" className="ay-btn-ghost" onClick={() => { stop(); setUi(null); setQr(null); }}>Vazgeç</button>
                    </div>
                </div>
            </div>
        );
    } else if (status === 'broken') {
        card = (
            <div className="ay-card pad red" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{logo}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="ay-wa-st" style={{ color: 'var(--rdt)' }}><span className="ay-dot s9 bad" />Bağlantı düştü</span>
                        <span className="ay-help" style={{ fontSize: 14.5 }}>Hatırlatmalar ve mesajlar şu an gitmiyor.</span>
                    </span>
                </div>
                {connection.lastError && <span className="ay-help">Son hata · <code className="mono" style={{ fontSize: 13, color: 'var(--tx)' }}>{connection.lastError}</code></span>}
                <button type="button" className="ay-btn-pri h46" style={{ alignSelf: 'flex-start' }} onClick={() => void connect()}>Yeniden bağlan</button>
            </div>
        );
    } else if (status === 'connected') {
        card = (
            <div className="ay-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{logo}
                    <span style={{ flex: 1 }} className="ay-wa-st"><span className="ay-dot s9 ok" />Bağlı{since && <small>· {since}</small>}</span>
                    <button type="button" className="ay-btn-ghost" onClick={() => setAskDisconnect(true)}>Bağlantıyı kes…</button>
                </div>
                {webhookWarn && (
                    <div role="status" className="ay-box warn top"><I n="alert" style={{ marginTop: 1 }} />
                        <span>Hat bağlı ama gelen mesajlara bot cevap vermiyor. Giden hatırlatmalar etkilenmez.</span>
                    </div>
                )}
                {webhookWarn && <button type="button" className="ay-btn" style={{ alignSelf: 'flex-start', marginTop: -6 }} onClick={() => void connect()}>Yeniden bağlan</button>}
                {health && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx2)' }}>Son 24 saat</span>
                        <div className="ay-stats">
                            <div><b>{health.last24h.sent}</b><span>Gönderildi</span></div>
                            <div><b>{health.last24h.failed}</b><span>Başarısız</span></div>
                            <div><b>{health.last24h.skipped}</b><span>Atlandı</span></div>
                            <div><b>{health.last24h.inbound}</b><span>Gelen</span></div>
                        </div>
                        {health.lastError && <span className="ay-help">Son hata · <code className="mono" style={{ fontSize: 13, color: 'var(--tx)' }}>{health.lastError}</code></span>}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="ay-lbl sm" htmlFor="ay-test">Test mesajı gönder</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input id="ay-test" className="ay-input sm" style={{ maxWidth: 300 }} type="tel" inputMode="tel" placeholder="05xx xxx xx xx"
                            value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
                        <button type="button" className="ay-btn h46" disabled={testBusy || testPhone.replace(/\D/g, '').length < 10} onClick={() => void sendTest()}>
                            {testBusy ? 'Gönderiliyor…' : 'Gönder'}
                        </button>
                    </div>
                    {testResult
                        ? <span role="status" style={{ fontSize: 14, fontWeight: 700, color: testResult.ok ? 'var(--grt)' : 'var(--rdt)' }}>
                            {testResult.text}{testResult.detail && <span className="mono" style={{ fontWeight: 400, fontSize: 12.5, color: 'var(--tx2)' }}> · {testResult.detail}</span>}
                        </span>
                        : <span className="ay-help">Randevu onay mesajıyla aynı yoldan gider.</span>}
                </div>
            </div>
        );
    } else {
        card = (
            <div className="ay-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{logo}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="ay-wa-st"><span className="ay-dot s9 warn" />Bağlı değil</span>
                        <span className="ay-help" style={{ fontSize: 14.5 }}>Hatırlatmalar gitmiyor.</span>
                    </span>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--tx2)', textWrap: 'pretty' }}>
                    Bağla'ya bastığınızda işletmenize özel bir WhatsApp hattı hazırlanır ve QR kod çıkar. Telefonunuzdan <b style={{ color: 'var(--tx)' }}>WhatsApp → Bağlı Cihazlar → Cihaz Ekle</b> ile okutun.
                </p>
                <button type="button" className="ay-btn-pri h46" style={{ alignSelf: 'flex-start' }} onClick={() => void connect()}>WhatsApp'ı bağla</button>
            </div>
        );
    }

    return (
        <>
            <div className="ay-col w860">
                <Head large title="WhatsApp" lead="Müşterilerinize giden hatırlatmalar ve mesajlar bu hattan gider." />

                <section aria-label="Bağlantı" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="ay-kicker">1 · BAĞLANTI</div>
                    {card}
                </section>

                {isConnected && !ui && (
                    <section aria-label="AI asistan" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 40 }}>
                        <div className="ay-kicker">2 · AI ASİSTAN</div>
                        <AsistanSatiri on={f.assistant} onSave={setFeature('assistant')} />
                    </section>
                )}

                <section aria-label="Gönderilen mesajlar" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 40 }}>
                    <div className="ay-kicker">{isConnected && !ui ? '3' : '2'} · GÖNDERİLEN MESAJLAR</div>
                    {isConnected ? (
                        <p className="ay-help" style={{ marginTop: -4 }}>Baloncuklar örnek müşteriyle doldurulmuş önizlemedir.</p>
                    ) : (
                        <div role="status" style={{ fontSize: 15.5, fontWeight: 700 }}>WhatsApp bağlı değil — bu mesajların hiçbiri gitmiyor.</div>
                    )}
                    {cards.map((c) => {
                        const featOn = c.feature ? f[c.feature] : c.on;
                        if (!isConnected) {
                            return (
                                <div key={c.key} className="ay-msg-dim">
                                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <span style={{ fontSize: 16, fontWeight: 800 }}>{c.title}</span>
                                        <span className="ay-help">{c.when.split('.')[0]}</span>
                                    </span>
                                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx2)', flex: 'none' }}>Gitmiyor</span>
                                </div>
                            );
                        }
                        return (
                            <MesajKarti key={c.key} id={c.anchor} title={c.title} when={c.when} always={c.always} text={c.text} time={c.time}
                                dim={c.dim || (!c.always && !featOn)} extra={c.extra}
                                on={Boolean(featOn)} onToggle={c.always ? undefined : (c.feature ? setFeature(c.feature) : c.onToggle)} />
                        );
                    })}

                    {commsApi.available && (
                        <>
                            <button type="button" aria-expanded={langOpen} className="ay-fold" style={{ marginTop: 12 }} onClick={() => setLangOpen((v) => !v)}>
                                <I n="chr" />
                                <span style={{ fontSize: langOpen ? 18 : 15.5, fontWeight: langOpen ? 800 : 700 }}>{langOpen ? 'Mesaj dili' : 'Mesaj dilini düzenle'}</span>
                                <span className={commsApi.isCustom ? 'ay-tag inv' : 'ay-tag'}>{commsApi.isCustom ? 'Kendi mesaj diliniz' : 'Sektör varsayılanı'}</span>
                            </button>
                            {langOpen && (
                                <MesajDili t={t} hasRecall={Boolean(comms.recall)} guardrail={comms.guardrail} isCustom={commsApi.isCustom}
                                    onReset={async () => { if (await commsApi.reset()) t.discard(); }} />
                            )}
                        </>
                    )}
                </section>
            </div>

            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} maxWidth={860} />

            {askDisconnect && (
                <Modal labelledBy="ay-wa-kes" small alert onClose={() => setAskDisconnect(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 28px 20px' }}>
                        <h2 id="ay-wa-kes" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>WhatsApp bağlantısı kesilsin mi?</h2>
                        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)' }}>Bağlantı kesilince hatırlatmalar ve mesajlar gitmez. Yeniden bağlamak için QR kodu tekrar okutmanız gerekir.</p>
                    </div>
                    <div className="ay-modal-f">
                        <button type="button" className="ay-btn" autoFocus onClick={() => setAskDisconnect(false)}>Vazgeç</button>
                        <button type="button" className="ay-btn-danger" onClick={() => void disconnect()}>Bağlantıyı kes</button>
                    </div>
                </Modal>
            )}
        </>
    );
}

function AsistanSatiri({ on, onSave }: { on: boolean; onSave: (v: boolean) => Promise<boolean> }) {
    const sw = useSwitchSave();
    const shown = sw.pending ?? on;
    return (
        <div className="ay-swrow top" style={{ borderBottom: '1px solid var(--bd)' }}>
            <div className="ay-swrow-t" style={{ gap: 6 }}>
                <b>Gelen mesajlara bot cevap versin</b>
                {sw.status === 'error'
                    ? <span className="err" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>
                    : <span className="big" style={{ maxWidth: 560, textWrap: 'pretty' }}>{shown
                        ? 'Hattınıza yazan müşteriye bot cevap veriyor: hizmet, gün ve saati anlayıp müsait saatleri sunuyor, onay alınca randevuyu oluşturuyor.'
                        : 'Bot gelen mesajlara cevap vermiyor; mesajlar kaydediliyor, siz telefonunuzdan yanıtlarsınız.'}</span>}
                <span style={{ fontSize: 13.5 }}>“DUR” yazan müşterinin çıkış hakkı her zaman çalışır.</span>
            </div>
            {sw.status === 'saved' && <span className="ay-saved" role="status" style={{ paddingTop: 4 }}><I n="check" />Kaydedildi</span>}
            <span className="ay-state" style={{ paddingTop: 4 }}>{shown ? 'Açık' : 'Kapalı'}</span>
            <Switch checked={shown} label="AI asistan" busy={sw.status === 'saving'} onChange={() => sw.run(!on, onSave)} />
        </div>
    );
}

function MesajKarti({ id, title, when, always, text, time, dim, extra, on, onToggle }: {
    id?: string; title: string; when: string; always?: boolean; text: string; time: string; dim?: boolean; extra?: ReactNode;
    on: boolean; onToggle?: (v: boolean) => Promise<boolean>;
}) {
    const sw = useSwitchSave();
    const shown = sw.pending ?? on;
    return (
        <article className="ay-msg" id={id}>
            <div className="ay-msg-l">
                <div className="ay-msg-top">
                    <h3>{title}</h3>
                    {always ? <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 700, color: 'var(--tx2)' }}>Her zaman gider</span> : onToggle && (
                        <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                            {sw.status === 'saved' && <span className="ay-saved" role="status"><I n="check" />Kaydedildi</span>}
                            <span className="ay-state" style={{ minWidth: 0 }}>{shown ? 'Açık' : 'Kapalı'}</span>
                            <Switch checked={shown} label={title} busy={sw.status === 'saving'} onChange={() => sw.run(!on, onToggle)} />
                        </span>
                    )}
                </div>
                {sw.status === 'error' && <span className="ay-errline" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>}
                <span className="ay-msg-when">{always || shown ? when : 'Kapalı — bu mesaj gönderilmiyor.'}</span>
                {extra}
            </div>
            <Bubble text={text} time={time} dim={dim} />
        </article>
    );
}

function MesajDili({ t, hasRecall, guardrail, isCustom, onReset }: {
    t: Taslak<Draft>; hasRecall: boolean; guardrail?: string; isCustom: boolean; onReset: () => void;
}) {
    const d = t.draft;
    const mark = (k: keyof Draft) => t.isChanged(k) && <span aria-hidden="true" className="ay-changed" style={{ top: 18, bottom: 18 }} />;
    return (
        <section aria-label="Mesaj dili" style={{ display: 'flex', flexDirection: 'column' }}>
            {isCustom && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0' }}>
                    <button type="button" className="ay-link-btn" onClick={onReset}>Sektör varsayılanına dön</button>
                </div>
            )}
            <div className="ay-stack" style={{ padding: '18px 0', position: 'relative' }}>
                {mark('persona')}
                <label className="ay-lbl sm" htmlFor="ay-persona">Karakter</label>
                <span className="ay-help sm">AI bu tonu kullanır.</span>
                <textarea id="ay-persona" className="ay-input" style={{ minHeight: 66, fontSize: 15.5 }} rows={2} value={d.persona} onChange={(e) => t.set({ persona: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16, padding: '18px 0', borderTop: '1px solid var(--bd)', position: 'relative' }}>
                {(t.isChanged('audience') || t.isChanged('servicePhrase')) && <span aria-hidden="true" className="ay-changed" style={{ top: 18, bottom: 18 }} />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="ay-lbl sm" htmlFor="ay-muhatap">Muhatap</label>
                    <input id="ay-muhatap" className="ay-input sm" value={d.audience} placeholder="müşterimiz" onChange={(e) => t.set({ audience: e.target.value })} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="ay-lbl sm" htmlFor="ay-ifade">“…hatırlatmak istedik” ifadesi</label>
                    <input id="ay-ifade" className="ay-input sm" value={d.servicePhrase} placeholder="bakımınızı" onChange={(e) => t.set({ servicePhrase: e.target.value })} />
                </div>
            </div>
            <div className="ay-stack" style={{ padding: '18px 0', position: 'relative' }}>
                {mark('emoji')}
                <label className="ay-lbl sm" htmlFor="ay-emoji">Emoji</label>
                <span className="ay-help sm">Bir emoji, en çok 4 karakter.</span>
                <input id="ay-emoji" className="ay-input sm" style={{ width: 120, fontSize: 20 }} maxLength={4} value={d.emoji} onChange={(e) => t.set({ emoji: e.target.value.slice(0, 4) })} />
            </div>
            {hasRecall && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 160px', gap: 16, padding: '18px 0', borderTop: '1px solid var(--bd)', position: 'relative' }}>
                    {(t.isChanged('recallConcept') || t.isChanged('recallDays')) && <span aria-hidden="true" className="ay-changed" style={{ top: 18, bottom: 18 }} />}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label className="ay-lbl sm" htmlFor="ay-donus-k">Dönüş kavramı</label>
                        <input id="ay-donus-k" className="ay-input sm" value={d.recallConcept} placeholder="bakım yenileme" onChange={(e) => t.set({ recallConcept: e.target.value })} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label className="ay-lbl sm" htmlFor="ay-donus-g">Kaç gün sonra</label>
                        <div className="ay-affix sm">
                            <input id="ay-donus-g" inputMode="numeric" value={d.recallDays} onChange={(e) => t.set({ recallDays: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                            <span className="suf">gün</span>
                        </div>
                    </div>
                </div>
            )}
            {guardrail && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 0 0', borderTop: '1px solid var(--bd)', fontSize: 14, lineHeight: 1.5, color: 'var(--tx2)' }}>
                    <I n="lock" size={17} style={{ marginTop: 2 }} />
                    <span><b style={{ color: 'var(--tx)' }}>Güvenlik kuralı korunur:</b> {guardrail}</span>
                </div>
            )}
        </section>
    );
}
