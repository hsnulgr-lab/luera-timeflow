/**
 * A7 · WhatsApp — v2 (2026-11-10).
 *
 * Tasarım: `docs/design-reference/Luera Masaustu - WhatsApp v2.html` (+ wa2-ui.js).
 * Brief: `docs/whatsapp-ayarlar-v2-claude-design-prompt.md`.
 *
 * Sayfa sahibin üç sorusuyla açılır ve aynı sırayla ilerler:
 *   1. Hat çalışıyor mu?            → "Hat" (durum, son 24 saat, son hata, test)
 *   2. Size yazana kim cevap veriyor? → "Gelen mesajlar" (Ben · Randevu botu · Akıllı asistan)
 *   3. Müşterinize ne gidiyor?       → zaman çizgisi + yanda tek örnek baloncuk
 * Üstteki "Bir bakışta" şeridi üç cevabı tek satırda verir.
 *
 * Ayarların hiçbiri kaybolmadı; yeri, adı ve sırası değişti. Veri iki bayrak
 * olarak kalır: Ben = features.assistant kapalı · Randevu botu = assistant
 * açık, agent_v2 kapalı · Akıllı asistan = ikisi açık.
 *
 * Kaydetme Ayarlar v1'in kuralı: seçim ve anahtar anında; yazılan alan
 * (link, indirim, teşvik, asistanın bildikleri, mesaj dili) kayıt çubuğuyla.
 * Baloncuk metinleri `waTemplates`'ten — tasarımdaki örnekten DEĞİL.
 * Hattın telefon numarası sistemde KAYITLI DEĞİL; yalnız "… beri" yazılır.
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
import {
    WA_FAIL_TEXT, lastProxyError, sendWhatsApp, waAgent, waConnect, waDisconnect, waHealth, waSetFeatures, waSetKnowledge, waState,
    type WaAgentPatch, type WaAgentState, type WaAnswerMode, type WaHealth,
} from '@/services/whatsapp';
import { KNOWLEDGE_LIMITS, type FaqItem } from '@/lib/waKnowledge';
import { normalizePhone } from '@/lib/phone';
import { failureLine, sinceLabel } from '@/lib/waLinkText';
import { useTaslak, type Taslak } from '../useTaslak';
import { Dots, I, Modal, SaveBar, Seg, Switch } from '../parcalar';
import { useSwitchSave } from '../useSwitchSave';
import './whatsappV2.css';

type FeatureKey = 'confirmation' | 'review' | 'winback' | 'renewal' | 'recall' | 'assistant';
/** Hattın hâli — tasarımın W1–W5'i. */
type Conn = 'ok' | 'in' | 'no' | 'qr' | 'rd' | 'ld' | 'un';
/** Gelen mesajlara kim cevap veriyor. */
type Resp = 'me' | 'bot' | 'ai';
type MsgId = 'onay' | 'h24' | 'h2' | 'google' | 'next' | 'paket' | 'donus' | 'ozledik';

const OFFLINE: readonly Conn[] = ['no', 'qr', 'rd'];
const PREVIEW_TOMORROW_ISO = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
const PREVIEW_DISCOUNT_CODE = 'K7RM2P';
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

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
    // Asistanın bilgi bankası (137)
    kPayment: string;
    kPolicy: string;
    kLocation: string;
    kNotes: string;
    kFaq: FaqItem[];
}

/** WhatsApp'ın *kalın* işaretini baloncukta kalın çizer; satırları böler. */
function Bubble({ text, time, dim }: { text: string; time: string; dim?: boolean }) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const bold = (l: string): ReactNode[] => l.split(/(\*[^*]+\*)/g).map((part, i) =>
        /^\*[^*]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : <span key={i}>{part}</span>);
    return (
        <div className="ay-chat" style={{ opacity: dim ? 0.45 : 1 }}>
            <div className="ay-bubble">
                {lines.map((l, i) => <span key={i}>{bold(l)}</span>)}
                <span className="t">{time} ✓✓</span>
            </div>
        </div>
    );
}

/** Kısa "Kaydedildi" — seçim ve anahtarın yanında 2 sn. */
function Saved({ on }: { on: boolean }) {
    return on ? <span className="w2-saved" role="status"><I n="check" />Kaydedildi</span> : null;
}

function goTo(id: string) {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function WhatsApp() {
    const { settings, updateSettings } = useReservations();
    const { profile, savePartial } = useOrgProfile();
    const { connection, loading, setupError, isConnected, isBroken, refresh } = useWhatsApp();
    const commsApi = useSectorComms(settings.sector || 'genel');
    const comms = commsApi.effective;

    // ── Bağlantı ──
    const [ui, setUi] = useState<'creating' | 'qr' | null>(null);
    const [qr, setQr] = useState<string | null>(null);
    const [qrLeft, setQrLeft] = useState(60);
    const [health, setHealth] = useState<WaHealth | null>(null);
    const [webhookWarn, setWebhookWarn] = useState<string | null>(null);
    const [askDisconnect, setAskDisconnect] = useState(false);
    const poll = useRef<number | undefined>(undefined);
    const tick = useRef<number | undefined>(undefined);
    const stop = useCallback(() => { window.clearInterval(poll.current); window.clearInterval(tick.current); }, []);
    useEffect(() => stop, [stop]);

    // Sayfa açılınca hattın GERÇEK durumu sorulur (live): "bağlı" bayat kalabilir.
    const loadHealth = useCallback(async () => { setHealth(await waHealth(true)); }, []);
    useEffect(() => {
        if (loading || !isConnected) return;
        let alive = true;
        void (async () => { const h = await waHealth(true); if (alive) setHealth(h); })();
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
        // QR 60 sn'de kendiliğinden yenilenir; ayrıca "Yenile" düğmesi gerekmez.
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
    const cancelQr = () => { stop(); setUi(null); setQr(null); };
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
    const [testResult, setTestResult] = useState<{ ok: boolean; sub: string } | null>(null);
    const sendTest = async () => {
        if (testBusy) return;
        setTestBusy(true); setTestResult(null);
        // Elle mesaj türüyle (139): onay mesajı kapalı işletmede de hattı sınar.
        const res = await sendWhatsApp(testPhone,
            `${settings.businessName} · WhatsApp test mesajı ✅\n\nBu mesajı aldıysanız hat çalışıyor; hatırlatma ve onaylar da bu hattan gider.`, 'manual');
        setTestBusy(false);
        setTestResult(res.ok
            ? { ok: true, sub: 'Telefonu kontrol edin.' }
            : { ok: false, sub: res.reason ? WA_FAIL_TEXT[res.reason] + '.' : 'Tekrar deneyin.' });
        void loadHealth();
    };

    // ── Özellik anahtarları (anında) ──
    const setFeature = (key: FeatureKey) => async (next: boolean) => {
        const res = await waSetFeatures({ [key]: next });
        if (res?.ok) { void refresh(); return true; }
        if (lastProxyError) toast.error(lastProxyError);
        return false;
    };

    // ── Asistan ayarları (139). Yalnız sahip okuyabilir; ekip üyesinde null. ──
    const [agent, setAgent] = useState<WaAgentState | null>(null);
    useEffect(() => {
        if (loading) return;
        let alive = true;
        void (async () => { const a = await waAgent(); if (alive) setAgent(a); })();
        return () => { alive = false; };
    }, [loading]);
    const saveAgent = async (patch: WaAgentPatch): Promise<WaAgentState | null> => {
        const res = await waAgent(patch);
        if (!res?.ok) { if (lastProxyError) toast.error(lastProxyError); return null; }
        setAgent(res);
        void refresh();
        return res;
    };
    const setScheduler = async (next: boolean) => {
        const res = await saveAgent({ scheduler: next });
        if (res && next && res.backfilled) toast.success(`${res.backfilled} randevunun mesajları planlandı`);
        return Boolean(res);
    };

    // ── Gelen mesajlara kim cevap versin — iki bayrağın tek sorusu ──
    const f = connection.features;
    const agentOn = agent ? agent.enabled : connection.agentOn;
    const respNow: Resp = !f.assistant ? 'me' : agentOn ? 'ai' : 'bot';
    const [respPending, setRespPending] = useState<Resp | null>(null);
    const resp = respPending ?? respNow;
    const [flash, setFlash] = useState<string | null>(null);
    const flashT = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(flashT.current), []);
    const showSaved = (k: string) => {
        window.clearTimeout(flashT.current);
        setFlash(k);
        flashT.current = window.setTimeout(() => setFlash(null), 2000);
    };
    const pickResp = async (v: Resp) => {
        if (v === resp || respPending) return;
        setRespPending(v);
        let ok = true;
        // Önce asistan bayrağı, sonra "cevap versin" — arada kısa süre bile
        // istenmeyen bot cevap vermesin diye "Ben"e geçişte tersi.
        if (v === 'me') ok = await setFeature('assistant')(false);
        else {
            const wantAi = v === 'ai';
            if (agentOn !== wantAi) ok = Boolean(await saveAgent({ enabled: wantAi }));
            if (ok && !f.assistant) ok = await setFeature('assistant')(true);
        }
        setRespPending(null);
        if (ok) showSaved('resp');
    };

    // ── Taslak: yazılan alanlar (kayıt çubuğu) ──
    const t = useTaslak<Draft>({
        saved: {
            google: profile.googleReviewUrl,
            discPct: profile.winbackDiscountPercent ? String(profile.winbackDiscountPercent) : '0',
            discDays: String(profile.winbackDiscountDays ?? 30),
            rebookNote: settings.rebookNote || '',
            persona: comms.persona, audience: comms.audience, servicePhrase: comms.servicePhrase, emoji: comms.emoji,
            recallConcept: comms.recall?.concept ?? '', recallDays: comms.recall ? String(comms.recall.afterDays) : '',
            kPayment: connection.knowledge.payment, kPolicy: connection.knowledge.policy,
            kLocation: connection.knowledge.location, kNotes: connection.knowledge.notes, kFaq: connection.knowledge.faq,
        },
        sectionLabel: 'WhatsApp',
        labels: {
            google: 'Google değerlendirme linki', discPct: 'Sizi özledik · indirim oranı', discDays: 'Sizi özledik · geçerlilik süresi', rebookNote: 'Teşvik satırı',
            persona: 'Karakter', audience: 'Muhatap', servicePhrase: '“…hatırlatmak istedik” ifadesi', emoji: 'Emoji',
            recallConcept: 'Dönüş kavramı', recallDays: 'Kaç gün sonra',
            kPayment: 'Ödeme yöntemleri', kPolicy: 'İptal ve gecikme', kLocation: 'Ulaşım ve otopark', kNotes: 'Diğer notlar', kFaq: 'Sık sorulanlar',
        },
        validate: (d) => {
            if (Number(d.discPct) > 100) return 'İndirim oranı en çok %100 olabilir.';
            if (d.kFaq.some((x) => Boolean(x.q.trim()) !== Boolean(x.a.trim()))) return 'Sık sorulanlarda her sorunun cevabı da olmalı.';
            return null;
        },
        save: async (d, s) => {
            const patch: Parameters<typeof savePartial>[0] = {};
            if (d.google !== s.google) patch.googleReviewUrl = d.google.trim();
            if (d.discPct !== s.discPct) patch.winbackDiscountPercent = Math.min(100, Number(d.discPct) || 0);
            if (d.discDays !== s.discDays) patch.winbackDiscountDays = Number(d.discDays) || 0;
            if (Object.keys(patch).length > 0 && !(await savePartial(patch, { quiet: true }))) return false;
            if (d.rebookNote !== s.rebookNote && !(await updateSettings({ ...settings, rebookNote: d.rebookNote.trim() }))) return false;
            const kChanged = (['kPayment', 'kPolicy', 'kLocation', 'kNotes', 'kFaq'] as const)
                .some((k) => JSON.stringify(d[k]) !== JSON.stringify(s[k]));
            if (kChanged) {
                const res = await waSetKnowledge({
                    payment: d.kPayment, policy: d.kPolicy, location: d.kLocation, notes: d.kNotes,
                    faq: d.kFaq.filter((x) => x.q.trim() && x.a.trim()),
                });
                if (!res?.ok) return 'Asistanın bildikleri kaydedilemedi.';
                void refresh();
            }
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

    // ── Hattın hâli ──
    const conn: Conn = setupError ? 'un'
        : ui ? 'qr'
        : loading ? 'ld'
        : isConnected ? ((health?.inboundBroken || webhookWarn) ? 'in' : 'ok')
        : isBroken ? 'rd' : 'no';
    const offline = OFFLINE.includes(conn);
    const since = connection.connectedAt ? sinceLabel(connection.connectedAt) : 'Hat çalışıyor';

    // ── Giden mesajlar (taslakla canlı önizleme) ──
    const previewComms = { ...comms, persona: d.persona, audience: d.audience, servicePhrase: d.servicePhrase, emoji: d.emoji,
        recall: comms.recall ? { ...comms.recall, concept: d.recallConcept, afterDays: Number(d.recallDays) || comms.recall.afterDays } : undefined };
    const sample = settings.sector === 'avukat' ? 'Ahmet Yılmaz' : 'Ayşe Demir';
    const sampleShort = settings.sector === 'avukat' ? 'Ahmet Bey' : 'Ayşe Hanım';
    const service = settings.services[0]?.name || 'Konsültasyon';
    // Hazırlık notu (138) olan ilk hizmet; yoksa önizlemede not satırı çıkmaz.
    const prepNote = settings.services.find((s) => s.prepNote)?.prepNote;
    const prepService = settings.services.find((s) => s.prepNote)?.name ?? service;
    const biz = settings.businessName || 'İşletmeniz';
    const maps = profile.mapsUrl || undefined;
    const bookingUrl = profile.slug ? `${window.location.origin}/book/${profile.slug}` : undefined;
    const pct = Math.min(100, Number(d.discPct) || 0);
    const sched = connection.schedulerOn;
    const recallDays = Number(d.recallDays) || comms.recall?.afterDays || 30;

    const msgs: Msg[] = [
        { id: 'onay', ph: 'al', t: 'Randevu onayı', tm: 'Hemen', w: 'Randevu oluşur oluşmaz', d: 'Panelden, online randevudan ya da WhatsApp’tan alınan her randevuda.',
            feature: 'confirmation', at: '09:12',
            text: buildConfirmationMessage({ comms: previewComms, customerName: sample, date: PREVIEW_TOMORROW_ISO, startTime: '10:00', service: prepService, businessName: biz, mapsUrl: maps, prepNote }) },
        { id: 'h24', ph: 'once', t: '24 saat önce hatırlatma', tm: '24 sa önce', w: 'Randevudan 24 saat önce',
            d: f.assistant ? 'Müşteri “Evet” ya da “Hayır” yazarak cevaplar.' : '', at: '10:00',
            text: build24hMessage({ comms: previewComms, customerName: sample, startTime: '10:00', service: prepService, businessName: biz, mapsUrl: maps, askConfirm: f.assistant, prepNote }) },
        { id: 'h2', ph: 'once', t: '2 saat önce hatırlatma', tm: '2 sa önce', w: 'Randevudan 2 saat önce', d: '', at: '08:00',
            text: build2hMessage({ comms: previewComms, customerName: sample, startTime: '10:00', service, businessName: biz, mapsUrl: maps }) },
        { id: 'google', ph: 'sonra', t: 'Google değerlendirme', tm: sched ? '+30 dk' : '~3 sa sonra',
            w: sched ? 'Randevu bitiminden 30 dk sonra' : 'Hesap kapandıktan ~3 saat sonra, randevu başına bir kez',
            d: sched ? 'Önce memnuniyet sorulur; puan verene Google linki gider.' : '', feature: 'review', at: '13:40',
            text: buildReviewMessage({ comms: previewComms, customerName: sample, businessName: biz, reviewUrl: d.google.trim() || '— link yok' }) },
        { id: 'next', ph: 'sonra', t: 'Sıradaki randevu daveti', tm: sched ? '+1,5 sa' : 'Bitince',
            w: sched ? 'Ödemeden 1,5 saat sonra' : 'Randevu tamamlanınca',
            d: sched ? 'İleri randevusu olana ve memnun kalmayana gitmez.' : '', rebook: true, at: sched ? '14:35' : '11:05',
            text: sched
                ? buildRebookInvite({ customerName: sample, service, note: d.rebookNote, bookingUrl, emoji: previewComms.emoji })
                : buildRebookMessage({ customerName: sample, service, businessName: biz, note: d.rebookNote, bookingUrl, comms: previewComms }) },
        { id: 'paket', ph: 'sonra', t: 'Paket yenileme', tm: 'Paket bitince', w: 'Paketin bütün seansları bitince', d: 'Paket başına bir kez.',
            feature: 'renewal', at: '16:05',
            text: buildRenewalMessage({ customerName: sample, packageTitle: '10 Seans Lazer', businessName: biz, comms: previewComms }) },
        ...(comms.recall ? [{ id: 'donus' as const, ph: 'zaman' as const, t: `Dönüş hatırlatması · ${d.recallConcept || comms.recall.concept}`,
            tm: `~${recallDays} gün`, w: `Son ziyaretten ~${recallDays} gün sonra`, d: 'Tarihe 2 gün kala, bir kez.', tag: 'Sektörünüze özel',
            feature: 'recall' as FeatureKey, at: '11:00',
            text: buildRecallMessage({ customerName: sample, businessName: biz, comms: previewComms }) }] : []),
        { id: 'ozledik', ph: 'zaman', t: 'Sizi özledik', tm: '60 gün', w: '60 günden uzun gelmeyene', d: 'İleri randevusu olmayana, bir kez.',
            feature: 'winback', at: '11:30',
            text: buildWinbackMessage({ customerName: sample, businessName: biz, comms: previewComms }) + (pct > 0 ? buildDiscountLine(pct, Number(d.discDays) || 0, PREVIEW_DISCOUNT_CODE) : '') },
    ];
    const msgOn = (m: Msg) => (m.rebook ? Boolean(settings.rebookEnabled) : m.feature ? f[m.feature] : true);
    const toggleMsg = (m: Msg) => async (v: boolean) => (m.rebook ? updateSettings({ ...settings, rebookEnabled: v }) : m.feature ? setFeature(m.feature)(v) : false);
    const onCount = msgs.filter(msgOn).length;

    const [sel, setSel] = useState<MsgId>('onay');
    const [open, setOpen] = useState<Partial<Record<MsgId, boolean>>>({});
    const [dilOpen, setDilOpen] = useState(false);
    const [advOpen, setAdvOpen] = useState(false);
    const selected = msgs.find((m) => m.id === sel) ?? msgs[0];

    // ── Bir bakışta ──
    const usagePct = agent && agent.budget_usd > 0 ? Math.min(100, Math.round((agent.spent_usd / agent.budget_usd) * 100)) : 0;
    const trialNums = agent?.test_numbers ?? [];
    const glanceA: Glance = conn === 'ld' ? { dot: '', a: <span className="w2-sk" style={{ width: 120, height: 20 }} />, s: <span className="w2-sk" style={{ width: 180, height: 12, marginTop: 4 }} /> }
        : conn === 'un' ? { dot: 'un', a: 'Okunamadı', s: 'Durum şu an alınamıyor' }
        : conn === 'rd' ? { dot: 'rd', a: 'Bağlantı düştü', s: 'Mesajlar gitmiyor', red: true }
        : offline ? { dot: 'am', a: 'Bağlı değil', s: 'Hatırlatmalar gitmiyor' }
        : conn === 'in' ? { dot: 'gr', a: 'Bağlı', s: 'Giden mesajlar çalışıyor' }
        : { dot: 'gr', a: 'Bağlı', s: health && health.last24h.failed > 0
            ? `Son 24 saatte ${health.last24h.sent} gitti, ${health.last24h.failed} gitmedi`
            : `${since}${health ? ` · son 24 saatte ${health.last24h.sent} mesaj gitti` : ''}` };
    const AUDS: Record<WaAnswerMode, string> = {
        customers_and_new: 'Müşterilerinize ve ilk kez yazanlara', customers_only: 'Yalnız kayıtlı müşterilerinize', everyone: 'Size yazan herkese',
    };
    const aud = agent ? AUDS[agent.answer_mode] : '';
    const glanceB: Glance = conn === 'in' ? { dot: 'am', a: 'Gelen mesajlar işlenmiyor', s: 'Şu an kimseye otomatik cevap gitmiyor' }
        : offline ? { dot: '', a: 'Kimse', s: 'Hat bağlanınca seçiminiz geçerli olur' }
        : resp === 'me' ? { dot: '', a: 'Siz cevaplarsınız', s: 'Otomatik cevap kapalı' }
        : resp === 'bot' ? { dot: '', a: 'Randevu botu', s: aud }
        : usagePct >= 100 ? { dot: 'am', a: 'Randevu botu', s: 'Akıllı asistanın bu ayki hakkı doldu' }
        : trialNums.length > 0 ? { dot: '', a: 'Akıllı asistan · deneme', s: `Yalnız ${trialNums.length} numarayla; diğerlerine ${agent?.others === 'old' ? 'randevu botu' : 'kimse'}` }
        : { dot: '', a: 'Akıllı asistan', s: aud };
    const glanceC: Glance = offline ? { dot: conn === 'rd' ? 'rd' : 'am', a: 'Hiçbiri gitmiyor', s: 'WhatsApp bağlı değil' }
        : { dot: '', a: `${onCount} mesaj açık`, s: onCount === msgs.length ? 'Onaydan “sizi özledik”e kadar, sırası aşağıda' : `${msgs.length - onCount} mesaj kapalı` };

    return (
        <>
            <div className="w2">
                <header className="w2-ph">
                    <h1>WhatsApp</h1>
                    <p>Müşterilerinize giden mesajlar ve size yazanlara verilen cevaplar bu numaradan.</p>
                </header>

                <nav className="w2-gl" aria-label="Bir bakışta">
                    <GlanceCell q="HAT ÇALIŞIYOR MU?" g={glanceA} go="w2-hat" />
                    <GlanceCell q="SİZE YAZANA KİM CEVAP VERİYOR?" g={glanceB} go="w2-gelen" />
                    <GlanceCell q="MÜŞTERİNİZE NE GİDİYOR?" g={glanceC} go="w2-giden" />
                </nav>

                {/* ── 1 · Hat ── */}
                <section className="w2-sec" id="w2-hat" aria-label="Hat">
                    <div className="w2-sh"><h2>Hat</h2><p>Müşterilerinize giden her mesaj bu WhatsApp numarasından gider.</p></div>
                    <HatKarti
                        conn={conn} creating={ui === 'creating'} since={since} health={health} qr={qr} qrLeft={qrLeft}
                        setupError={setupError} onConnect={() => void connect()} onCancelQr={cancelQr}
                        onRetry={() => void refresh()} onCut={() => setAskDisconnect(true)}
                        test={(
                            <>
                                <label className="w2-lb" htmlFor="w2-test">Test mesajı gönder</label>
                                <div className="w2-trow">
                                    <input id="w2-test" className="ay-input sm" type="tel" inputMode="tel" placeholder="05xx xxx xx xx"
                                        value={testPhone} onChange={(e) => { setTestPhone(e.target.value); setTestResult(null); }} />
                                    <button type="button" className="ay-btn h46" disabled={testBusy || testPhone.replace(/\D/g, '').length < 10} onClick={() => void sendTest()}>
                                        {testBusy ? 'Gönderiliyor…' : 'Gönder'}
                                    </button>
                                </div>
                                {testResult && (
                                    <div className={`w2-res ${testResult.ok ? 'ok' : 'no'}`} role="status">
                                        <I n={testResult.ok ? 'check' : 'alert'} />{testResult.ok ? 'Gönderildi.' : 'Gönderilemedi.'} <span>{testResult.sub}</span>
                                    </div>
                                )}
                                <p className="w2-note">Hatırlatmalarla aynı hattan gider. Hattın çalıştığını en hızlı böyle görürsünüz.</p>
                            </>
                        )}
                    />
                </section>

                {/* ── 2 · Gelen mesajlar ── */}
                <section className="w2-sec" id="w2-gelen" aria-label="Gelen mesajlar">
                    <div className="w2-sh">
                        <div className="w2-shr"><h2>Gelen mesajlar</h2><Saved on={flash === 'resp'} /></div>
                        <p>Biri bu numaraya yazınca ne olacağını seçin. Seçim anında kaydedilir.</p>
                    </div>
                    {conn === 'in' && (
                        <div className="w2-lerr" role="status"><I n="alert" />
                            <span><b>Gelen mesajlar işlenmiyor.</b> Seçiminiz duruyor ama şu an kimseye otomatik cevap gitmiyor.{' '}
                                <a href="#w2-hat" onClick={(e) => { e.preventDefault(); goTo('w2-hat'); }}>Hattı yeniden bağlayın</a></span>
                        </div>
                    )}
                    {offline && (
                        <p className="w2-dim1"><I n="info" /><span>WhatsApp bağlı değilken gelen mesaj alınmaz. Seçiminiz hat bağlanınca geçerli olur.</span></p>
                    )}
                    <div className="w2-opts" role="radiogroup" aria-label="Gelen mesajlara kim cevap versin">
                        {RESP_OPTS.map((o) => (
                            <button key={o.v} type="button" className="w2-opt" role="radio" aria-checked={resp === o.v}
                                disabled={Boolean(respPending)} onClick={() => void pickResp(o.v)}>
                                <span className="w2-ot"><span className="w2-rad" />{o.t}</span>
                                <span className="w2-od">{o.d}</span>
                                {o.v === 'ai' && resp === 'ai' && usagePct >= 100 && (
                                    <span className="ay-tag" style={{ alignSelf: 'flex-start' }}>Ay sonuna kadar randevu botu devrede</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {resp !== 'me' && agent && (
                        <Kimlere a={agent} who={resp === 'ai' ? 'asistan' : 'bot'} onSave={saveAgent} />
                    )}
                    {resp === 'ai' && agent && (
                        <>
                            <Kullanim pct={usagePct} />
                            <DenemeModu a={agent} onSave={saveAgent} />
                            <Bildikleri t={t} />
                        </>
                    )}
                    {resp === 'bot' && (
                        <p className="w2-dim1"><I n="info" /><span>Kullanım hakkı, deneme modu ve asistanın bildikleri <b style={{ color: 'var(--tx)' }}>Akıllı asistan</b> seçilince açılır.</span></p>
                    )}
                    <div className="w2-always"><I n="lock" /><span><b>Her zaman çalışır:</b> “DUR” yazan müşteri mesaj listesinden çıkar.</span></div>
                </section>

                {/* ── 3 · Müşterinize giden mesajlar ── */}
                <section className="w2-sec" id="w2-giden" aria-label="Müşterinize giden mesajlar">
                    <div className="w2-sh">
                        <h2>Müşterinize giden mesajlar</h2>
                        <p>Bir randevunun öncesinden sonrasına, sırasıyla. Satıra tıklayınca örneğini görürsünüz.</p>
                    </div>
                    {offline && (
                        <div className="w2-offb" role="status"><span className={`w2-dot ${conn === 'rd' ? 'rd' : 'am'}`} />WhatsApp bağlı değil — bu mesajların hiçbiri gitmiyor.</div>
                    )}
                    <div className="w2-tlw">
                        <div className={offline ? 'w2-tl dim' : 'w2-tl'}>
                            {msgs.map((m, i) => {
                                const phStart = i === 0 || msgs[i - 1].ph !== m.ph;
                                const preview = <Ornek m={m} off={!msgOn(m)} offline={offline} sample={sampleShort} kind="inl" />;
                                return (
                                    <div key={m.id} style={{ display: 'contents' }}>
                                        {phStart && m.ph === 'sonra' && (
                                            <div className="w2-tap">
                                                <span className="w2-tt">{shortDate(PREVIEW_TOMORROW_ISO)}<br />10:00</span>
                                                <span className="w2-tn"><i /></span>
                                                <span className="w2-tab"><b>Randevu</b>· {sampleShort} · {service}</span>
                                            </div>
                                        )}
                                        {phStart && (
                                            <div className="w2-tph"><span /><span className="w2-tn" /><span>{PHASES[m.ph]}</span></div>
                                        )}
                                        <ZamanSatiri
                                            m={m} on={msgOn(m)} selected={sel === m.id} isOpen={Boolean(open[m.id])}
                                            onSelect={() => setSel(m.id)}
                                            onToggle={toggleMsg(m)}
                                            setLine={<SetLine m={m} d={d} isOpen={Boolean(open[m.id])} sched={sched}
                                                onOpen={() => { setSel(m.id); setOpen((o) => ({ ...o, [m.id]: !o[m.id] })); }}
                                                onDil={() => { setDilOpen(true); window.setTimeout(() => goTo('w2-dil'), 30); }} />}
                                            editor={open[m.id] ? <Duzenle m={m} t={t} connected={!offline} slug={Boolean(profile.slug)} /> : null}
                                        />
                                        {sel === m.id && preview}
                                    </div>
                                );
                            })}
                        </div>
                        <Ornek key={selected.id} m={selected} off={!msgOn(selected)} offline={offline} sample={sampleShort} kind="side" />
                    </div>

                    <div className="w2-folds">
                        {commsApi.available && (
                            <div id="w2-dil">
                                <button type="button" className="w2-fold" aria-expanded={dilOpen} onClick={() => setDilOpen((v) => !v)}>
                                    <I n={dilOpen ? 'chd' : 'chr'} />
                                    <span className="w2-ft"><b>Mesaj dili</b><span className={commsApi.isCustom ? 'ay-tag inv' : 'ay-tag'}>{commsApi.isCustom ? 'Kendi mesaj diliniz' : 'Sektör varsayılanı'}</span></span>
                                    <span className="w2-fd">Mesajların tonu, hitabı, emojisi{comms.recall ? ' ve dönüş hatırlatmasının adı' : ''}.</span>
                                </button>
                                {dilOpen && (
                                    <div className="w2-fb">
                                        <MesajDili t={t} hasRecall={Boolean(comms.recall)} guardrail={comms.guardrail} isCustom={commsApi.isCustom}
                                            onReset={async () => { if (await commsApi.reset()) t.discard(); }} />
                                    </div>
                                )}
                            </div>
                        )}
                        {agent && (
                            <div>
                                <button type="button" className="w2-fold" aria-expanded={advOpen} onClick={() => setAdvOpen((v) => !v)}>
                                    <I n={advOpen ? 'chd' : 'chr'} />
                                    <span className="w2-ft"><b>Gelişmiş</b></span>
                                    <span className="w2-fd">{agent.scheduler ? 'Her randevu ayrı zamanlanıyor.' : 'Mesajlar yarım saatte bir toplu kontrol ediliyor.'}</span>
                                </button>
                                {advOpen && <Gelismis on={agent.scheduler} onSave={setScheduler} />}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} maxWidth={1010} />

            {askDisconnect && (
                <Modal labelledBy="ay-wa-kes" small alert onClose={() => setAskDisconnect(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 28px 20px' }}>
                        <h2 id="ay-wa-kes" style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.015em' }}>Bağlantı kesilsin mi?</h2>
                        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: 'var(--tx2)' }}>Bağlantı kesilince hatırlatmalar ve mesajlar gitmez. Yeniden bağlamak için QR’ı tekrar okutmanız gerekir.</p>
                    </div>
                    <div className="ay-modal-f">
                        <button type="button" className="ay-btn-danger" onClick={() => void disconnect()}>Bağlantıyı kes</button>
                        <button type="button" className="ay-btn-inv" autoFocus onClick={() => setAskDisconnect(false)}>Vazgeç</button>
                    </div>
                </Modal>
            )}
        </>
    );
}

// ── Türler ve sabitler ──────────────────────────────────────────────────────

interface Msg {
    id: MsgId;
    ph: 'al' | 'once' | 'sonra' | 'zaman';
    t: string;
    /** Çizgideki zaman ("24 sa önce", "+30 dk"). */
    tm: string;
    /** Ne zaman — cümle başı. */
    w: string;
    d: string;
    tag?: string;
    /** Anahtarı olan mesaj; yoksa "Her randevuda gider". */
    feature?: FeatureKey;
    /** Sıradaki randevu daveti — anahtarı settings.rebook_enabled. */
    rebook?: boolean;
    at: string;
    text: string;
}

interface Glance { dot: '' | 'gr' | 'am' | 'rd' | 'un'; a: ReactNode; s: ReactNode; red?: boolean }

const PHASES: Record<Msg['ph'], string> = {
    al: 'RANDEVU ALININCA', once: 'RANDEVUDAN ÖNCE', sonra: 'RANDEVUDAN SONRA', zaman: 'SONRAKİ HAFTALARDA',
};

const RESP_OPTS: { v: Resp; t: string; d: string }[] = [
    { v: 'me', t: 'Ben cevaplarım', d: 'Otomatik cevap gitmez. Mesajlar kaydedilir, siz telefonunuzdan cevaplarsınız.' },
    { v: 'bot', t: 'Randevu botu', d: 'Kalıplı sorularla randevu alır: hizmet, gün ve saati sorar, boş saatleri sunar, onaylanınca randevuyu kurar.' },
    { v: 'ai', t: 'Akıllı asistan', d: 'Doğal dille konuşur: soruları işletme bilgilerinizden cevaplar, saat sunar; randevu kurar, erteler, iptal eder.' },
];

const AUD_OPTS: { v: WaAnswerMode; t: string; d: (who: string) => string; tag?: string }[] = [
    { v: 'customers_and_new', t: 'Müşterilerim ve ilk kez yazanlar', tag: 'Önerilen',
        d: () => 'Daha önce yazıştığınız ama müşteriniz olmayan kişilere (arkadaş, aile, tedarikçi) cevap vermez.' },
    { v: 'customers_only', t: 'Yalnız kayıtlı müşterilerim',
        d: () => 'Müşteri listenizde olmayan kimseye cevap vermez; yeni gelenleri siz karşılarsınız.' },
    { v: 'everyone', t: 'Herkes',
        d: () => 'Hat yalnız işletmenize aitse seçin. Kişisel numaranızsa arkadaşlarınıza da cevap verir.' },
];

function shortDate(iso: string): string {
    const [, m, dd] = iso.split('-').map(Number);
    return `${dd} ${MONTHS_SHORT[(m || 1) - 1]}.`;
}

/** 905321112233 → 0532 111 22 33 (yurt dışı numara olduğu gibi). */
function showPhone(raw: string): string {
    const n = normalizePhone(raw) ?? raw;
    return /^905\d{9}$/.test(n) ? `0${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10)}` : n;
}

// ── Bir bakışta ─────────────────────────────────────────────────────────────

function GlanceCell({ q, g, go }: { q: string; g: Glance; go: string }) {
    return (
        <button type="button" className="w2-gc" onClick={() => goTo(go)}>
            <span className="w2-gq">{q}<I n="chd" /></span>
            <span className={g.red ? 'w2-ga rdw' : 'w2-ga'}>{g.dot && <span className={`w2-dot ${g.dot}`} />}{g.a}</span>
            <span className="w2-gs">{g.s}</span>
        </button>
    );
}

// ── 1 · Hat ─────────────────────────────────────────────────────────────────

function HatKarti({ conn, creating, since, health, qr, qrLeft, setupError, onConnect, onCancelQr, onRetry, onCut, test }: {
    conn: Conn; creating: boolean; since: string; health: WaHealth | null; qr: string | null; qrLeft: number;
    setupError: string | null; onConnect: () => void; onCancelQr: () => void; onRetry: () => void; onCut: () => void; test: ReactNode;
}) {
    const logo = <span className="w2-wal"><I n="wa" /></span>;
    const head = (dot: string, word: string, sub?: string, extra?: ReactNode, red?: boolean) => (
        <div className="w2-ch">{logo}
            <div className={red ? 'w2-cst rdw' : 'w2-cst'}><span className={`w2-dot ${dot}`} />{word}{sub && <small>· {sub}</small>}</div>
            {extra}
        </div>
    );
    const PHONE_LINE = 'Telefondan da bağlayabilirsiniz: TimeFlow uygulaması → İşletme → WhatsApp';

    if (conn === 'ok' || conn === 'in') {
        const l24 = health?.last24h;
        const zero = l24 && l24.sent + l24.failed + l24.skipped + l24.inbound === 0;
        const fail = health?.lastFailure ? failureLine(health.lastFailure) : null;
        return (
            <div className="w2-card">
                {head('gr', 'Bağlı', since, <button type="button" className="ay-btn-ghost" onClick={onCut}>Bağlantıyı kes…</button>)}
                {conn === 'in' && (
                    <div className="w2-lerr" role="status"><I n="alert" />
                        <div className="lc"><b>Gelen mesajlar işlenmiyor</b><span>Hat bağlı ama gelen mesajlara cevap verilemiyor. Giden hatırlatmalar etkilenmez.</span></div>
                        <button type="button" className="ay-btn" onClick={onConnect}>Yeniden bağla</button>
                    </div>
                )}
                <div className="w2-cg">
                    <div className="w2-col">
                        <span className="w2-eb">Son 24 saat</span>
                        {!l24 ? (
                            <div className="w2-stats">{[0, 1, 2, 3].map((i) => (
                                <div key={i}><span className="w2-sk" style={{ width: 40, height: 26 }} /><span className="w2-sk" style={{ width: 76, height: 12 }} /></div>
                            ))}</div>
                        ) : zero ? <p className="w2-zero">Son 24 saatte mesaj yok.</p> : (
                            <div className="w2-stats">
                                <div><b>{l24.sent}</b><span>Gönderildi</span></div>
                                <div><b>{l24.failed}</b><span>Başarısız</span></div>
                                <div><b>{l24.skipped}</b><span>Atlandı</span></div>
                                <div><b>{l24.inbound}</b><span>Gelen</span></div>
                            </div>
                        )}
                        <p className="w2-note"><b>Atlandı</b> hata değildir, kural gereği gönderilmeyendir: müşteri “DUR” dedi, günlük sınır doldu, numarası yok ya da hat o an bağlı değildi.</p>
                        {fail && <div className="w2-lerr" role="status"><I n="alert" /><span><b>{fail.title}</b> {fail.body}</span></div>}
                    </div>
                    <div className="w2-col">{test}</div>
                </div>
            </div>
        );
    }
    if (conn === 'no') {
        return (
            <div className="w2-card">
                {head('am', 'Bağlı değil', 'Hatırlatmalar gitmiyor')}
                <div className="w2-intro">
                    <h3>WhatsApp numaranızı bağlayın</h3>
                    <p>Bağlayınca randevu onayları ve hatırlatmalar müşterilerinize bu numaradan gider; size yazanlara seçtiğiniz kişi cevap verir. Telefonunuzdaki WhatsApp her zamanki gibi çalışmaya devam eder.</p>
                </div>
                <div className="w2-acts">
                    <button type="button" className="ay-btn-pri h46" onClick={onConnect}>WhatsApp’ı bağla</button>
                    <span className="w2-note">{PHONE_LINE}</span>
                </div>
            </div>
        );
    }
    if (conn === 'qr') {
        return (
            <div className="w2-card">
                {head('am', 'Bağlı değil', creating ? 'Hat hazırlanıyor' : 'QR kod okutulmayı bekliyor')}
                <div className="w2-qrg">
                    <div className="w2-qrbox">
                        {qr ? <img key={qr} alt="WhatsApp QR kodu" src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} /> : <Dots />}
                    </div>
                    <div className="w2-qrs">
                        <h3>Telefonunuzla okutun</h3>
                        <ol>
                            <li><span>Telefonda WhatsApp’ı açın.</span></li>
                            <li><span><b>Bağlı Cihazlar → Cihaz Ekle</b>’ye dokunun.</span></li>
                            <li><span>Kameranızı bu koda tutun.</span></li>
                        </ol>
                        {qr && (
                            <div className="w2-cd">
                                <span>Kod <b className="mono">{`0:${String(qrLeft).padStart(2, '0')}`}</b> sonra yenilenir.</span>
                                <span className="w2-trk"><i style={{ transform: `scaleX(${qrLeft / 60})` }} /></span>
                            </div>
                        )}
                        <p className="w2-note">Bağlanınca bu sayfa kendiliğinden geçer.<br />{PHONE_LINE}</p>
                        <div><button type="button" className="ay-btn" onClick={onCancelQr}>Vazgeç</button></div>
                    </div>
                </div>
            </div>
        );
    }
    if (conn === 'rd') {
        return (
            <div className="w2-card rdc">
                {head('rd', 'Bağlantı düştü', 'Mesajlar gitmiyor', undefined, true)}
                <p className="w2-lead2">Bu genelde telefon değişince, WhatsApp’tan çıkış yapılınca ya da telefon uzun süre internetsiz kalınca olur.</p>
                <div className="w2-lost">
                    <span className="w2-eb">Bağlanana kadar gitmeyenler</span>
                    <ul>{['Randevu onayları', 'Hatırlatmalar', 'İptal haberleri', 'Asistanın cevapları'].map((x) => <li key={x}><i />{x}</li>)}</ul>
                </div>
                <div className="w2-acts">
                    <button type="button" className="ay-btn-pri h46" onClick={onConnect}>Yeniden bağla</button>
                    <span className="w2-note">QR kodu telefonunuzla yeniden okutmanız gerekir.</span>
                </div>
            </div>
        );
    }
    if (conn === 'ld') {
        return (
            <div className="w2-card" aria-busy="true">
                <div className="w2-ch">{logo}<div className="w2-cst">Kontrol ediliyor<Dots small /></div></div>
                <div className="w2-cg">
                    <div className="w2-col">
                        <span className="w2-sk" style={{ width: 90, height: 12 }} />
                        <div className="w2-stats">{[0, 1, 2, 3].map((i) => (
                            <div key={i}><span className="w2-sk" style={{ width: 40, height: 26 }} /><span className="w2-sk" style={{ width: 76, height: 12 }} /></div>
                        ))}</div>
                    </div>
                    <div className="w2-col"><span className="w2-sk" style={{ width: 140, height: 14 }} /><span className="w2-sk" style={{ width: '100%', maxWidth: 320, height: 46 }} /></div>
                </div>
            </div>
        );
    }
    // un · okunamadı
    return (
        <div className="w2-card">
            {head('un', 'Okunamadı', 'Durum şu an alınamıyor')}
            <p className="w2-lead2">Hattın durumu şu an okunamadı. Bu, hattın bağlı olmadığı anlamına gelmez. İnternetinizi kontrol edip tekrar deneyin.</p>
            {setupError && <p className="w2-note">{setupError}</p>}
            <div className="w2-acts"><button type="button" className="ay-btn" onClick={onRetry}><I n="refresh" />Tekrar dene</button></div>
        </div>
    );
}

// ── 2 · Gelen mesajlar ──────────────────────────────────────────────────────

function Kimlere({ a, who, onSave }: { a: WaAgentState; who: string; onSave: (p: WaAgentPatch) => Promise<WaAgentState | null> }) {
    const [pending, setPending] = useState<WaAnswerMode | null>(null);
    const mode = pending ?? a.answer_mode;
    const [st, setSt] = useState<'idle' | 'saved' | 'error'>('idle');
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const pick = async (v: WaAnswerMode) => {
        if (v === mode || pending) return;
        setPending(v);
        const ok = Boolean(await onSave({ answer_mode: v }));
        setPending(null);
        setSt(ok ? 'saved' : 'error');
        if (ok) timer.current = window.setTimeout(() => setSt('idle'), 2000);
    };
    return (
        <div className="w2-sub">
            <div className="w2-shr"><h3>Kimlere cevap versin?</h3><Saved on={st === 'saved'} />
                {st === 'error' && <span className="ay-errline" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>}</div>
            <p className="w2-why"><I n="info" /><span>Bu numara kişisel numaranızsa önemli: {who} arkadaşınıza, ailenize cevap vermesin.</span></p>
            <div className="w2-alist" role="radiogroup" aria-label="Kimlere cevap versin">
                {AUD_OPTS.map((o) => (
                    <button key={o.v} type="button" className="w2-arow" role="radio" aria-checked={mode === o.v}
                        disabled={Boolean(pending)} onClick={() => void pick(o.v)}>
                        <span className="w2-rad" />
                        <span className="w2-at"><b>{o.t}{o.tag && <span className="ay-tag">{o.tag}</span>}</b><span>{o.d(who)}</span></span>
                    </button>
                ))}
            </div>
            {mode !== 'everyone' && (
                <p className="w2-note">Müşteriniz olmayan birine telefonunuzdan elle yazarsanız {who} o kişiye bundan sonra cevap vermez.</p>
            )}
        </div>
    );
}

function Kullanim({ pct }: { pct: number }) {
    return (
        <div className="w2-sub">
            <div className="w2-shr"><h3>Akıllı asistanın bu ayki kullanım hakkı</h3><b className="w2-pct">%{pct}</b></div>
            {pct >= 100 ? (
                <div className="w2-lerr" role="status"><I n="alert" /><span><b>Bu ayın kullanım hakkı doldu;</b> ay sonuna kadar randevu botu cevap veriyor.</span></div>
            ) : pct >= 80 ? (
                <div className="w2-lerr" role="status"><I n="alert" /><span><b>Bu ayın hakkının %{pct}’si kullanıldı.</b> Size bildirim gönderildi. Dolunca ay sonuna kadar randevu botu cevap verir.</span></div>
            ) : null}
            <div className="w2-bar" role="progressbar" aria-label="Akıllı asistanın bu ayki kullanımı" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${Math.max(pct, 1.2)}%` }} /><span className="t80" />
            </div>
            <div className="w2-barl"><span>%0</span><span>%80 · size bildirim</span><span>%100</span></div>
            <p className="w2-note">Her işletmenin akıllı asistan için aylık sabit bir hakkı vardır. Dolunca ay sonuna kadar randevu botu cevap verir.</p>
        </div>
    );
}

/**
 * Deneme modu (agent_config.test_numbers): doluysa akıllı asistan yalnız bu
 * numaralarla konuşur. Ekleme/çıkarma anında kaydedilir. İlk numara
 * eklenirken listede olmayanlara varsayılan "Kimse" — kişisel numarada
 * randevu botu arkadaşa cevap vermesin.
 */
function DenemeModu({ a, onSave }: { a: WaAgentState; onSave: (p: WaAgentPatch) => Promise<WaAgentState | null> }) {
    const [open, setOpen] = useState(false);
    const [num, setNum] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const nums = a.test_numbers;
    const on = nums.length > 0;
    const add = async () => {
        const n = normalizePhone(num.trim());
        if (!n) { setErr('Geçerli bir telefon numarası yazın.'); return; }
        if (nums.some((x) => (normalizePhone(x) ?? x) === n)) { setNum(''); return; }
        setBusy(true); setErr(null);
        const ok = await onSave({ test_numbers: [...nums, n], others: on ? a.others : 'silent' });
        setBusy(false);
        if (ok) setNum('');
    };
    const remove = async (i: number) => { setBusy(true); await onSave({ test_numbers: nums.filter((_, j) => j !== i) }); setBusy(false); };
    return (
        <div className="w2-sub" style={{ gap: 0 }}>
            <button type="button" className="w2-fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                <I n={open ? 'chd' : 'chr'} />
                <span className="w2-ft"><b>Deneme modu</b>{on ? <span className="ay-tag inv">Açık · {nums.length} numara</span> : <span className="ay-tag">Kapalı</span>}</span>
                <span className="w2-fd">{on ? 'Akıllı asistan şu an yalnız bu numaralarla konuşuyor.' : 'Asistanı herkese açmadan önce birkaç numarayla deneyin.'}</span>
            </button>
            {open && (
                <div className="w2-fb">
                    {on && (
                        <div className="w2-nl">{nums.map((n, i) => (
                            <div key={n} className="w2-nr"><span className="mono">{showPhone(n)}</span>
                                <button type="button" className="ay-btn-ghost" disabled={busy} onClick={() => void remove(i)}>Çıkar</button></div>
                        ))}</div>
                    )}
                    {nums.length < 10 && (
                        <div className="w2-trow">
                            <input className="ay-input sm" type="tel" inputMode="tel" placeholder="05xx xxx xx xx" aria-label="Deneme numarası"
                                value={num} onChange={(e) => { setNum(e.target.value); setErr(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} />
                            <button type="button" className="ay-btn h46" disabled={busy || !num.trim()} onClick={() => void add()}><I n="plus" />Ekle</button>
                        </div>
                    )}
                    {err && <span className="ay-errline" role="alert"><I n="alert" />{err}</span>}
                    <p className="w2-note">En çok 10 numara. Ekleme ve çıkarma anında kaydedilir.</p>
                    {on && (
                        <div className="w2-q2">
                            <b>Listede olmayanlara kim cevap versin?</b>
                            <Seg label="Listede olmayanlara kim cevap versin" value={a.others}
                                onChange={(v) => void onSave({ others: v })}
                                options={[{ v: 'old', t: 'Randevu botu' }, { v: 'silent', t: 'Kimse, siz cevaplarsınız' }]} />
                        </div>
                    )}
                    <p className="w2-note">Listeyi boşaltınca akıllı asistan herkese açılır.</p>
                </div>
            )}
        </div>
    );
}

const KNOW: { key: 'kPayment' | 'kPolicy' | 'kLocation' | 'kNotes'; label: string; help: string; placeholder: string }[] = [
    { key: 'kPayment', label: 'Ödeme yöntemleri', help: 'Nakit, kart, havale, taksit…', placeholder: 'Nakit, kredi kartı ve havale. Paketlerde 3 taksit yapıyoruz.' },
    { key: 'kPolicy', label: 'İptal ve gecikme', help: 'Kaç saat önceden iptal, geç kalınca ne olur.', placeholder: 'Randevunuzu en geç 24 saat önce iptal edebilirsiniz. 15 dakikadan fazla gecikmede işlem süresi kısalır.' },
    { key: 'kLocation', label: 'Ulaşım ve otopark', help: 'Otopark, toplu taşıma, bina girişi.', placeholder: 'Binanın önünde ücretsiz otopark var. Metroya 5 dakika yürüme mesafesindeyiz.' },
    { key: 'kNotes', label: 'Diğer notlar', help: 'Kapora, çocukla gelmek, ikram… isteğe bağlı.', placeholder: 'Kapora almıyoruz. Randevudan 10 dakika önce gelmenizi rica ederiz.' },
];
const NOT_WRITTEN = 'Yazılmadı — sorulursa “ekibimize sorup döneyim” der';

/**
 * Asistanın bildikleri (137): beş uzun alan yerine beş satır. Yazılmış olan
 * tek satırda görünür, yazılmamış olan "Yazılmadı" der. "Düzenle" alanı
 * satırın içinde açar; kayıt çubuğuyla kaydedilir.
 */
function Bildikleri({ t }: { t: Taslak<Draft> }) {
    const d = t.draft;
    const L = KNOWLEDGE_LIMITS;
    const [open, setOpen] = useState<string | null>(null);
    const faq = d.kFaq.filter((x) => x.q.trim());
    const setFaq = (list: FaqItem[]) => t.set({ kFaq: list });
    return (
        <div className="w2-sub">
            <h3>Asistanın bildikleri</h3>
            <p className="w2-note">Müşteri sorunca akıllı asistan yalnız bunları kullanır. Yazmadığınız bir konuda tahmin yürütmez, “ekibimize sorup döneyim” der.</p>
            <div className="w2-kl">
                {KNOW.map((k) => {
                    const v = d[k.key].trim();
                    const isOpen = open === k.key;
                    return (
                        <div key={k.key} className="w2-kr">
                            {t.isChanged(k.key) && <span aria-hidden="true" className="ay-changed" style={{ left: -12, top: 10, bottom: 10 }} />}
                            <b>{k.label}</b>
                            <span className={v ? 'w2-kv' : 'w2-kv e'}>{v ? v.split('\n')[0] : NOT_WRITTEN}</span>
                            <button type="button" className="ay-btn h40" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k.key)}>
                                {isOpen ? 'Kapat' : v ? 'Düzenle' : 'Yaz'}
                            </button>
                            {isOpen && (
                                <div className="w2-ked">
                                    <span className="w2-note">{k.help}</span>
                                    <textarea className="ay-input" style={{ minHeight: 66, fontSize: 15.5, padding: '11px 14px', height: 'auto' }} rows={2}
                                        maxLength={L.text} autoFocus aria-label={k.label} value={d[k.key]} placeholder={k.placeholder}
                                        onChange={(e) => t.set({ [k.key]: e.target.value } as Partial<Draft>)} />
                                </div>
                            )}
                        </div>
                    );
                })}
                <div className="w2-kr">
                    {t.isChanged('kFaq') && <span aria-hidden="true" className="ay-changed" style={{ left: -12, top: 10, bottom: 10 }} />}
                    <b>Sık sorulanlar</b>
                    <span className={faq.length ? 'w2-kv' : 'w2-kv e'}>{faq.length ? `${faq.length} soru · “${faq[0].q.trim()}”` : NOT_WRITTEN}</span>
                    <button type="button" className="ay-btn h40" aria-expanded={open === 'kFaq'} onClick={() => setOpen(open === 'kFaq' ? null : 'kFaq')}>
                        {open === 'kFaq' ? 'Kapat' : faq.length ? 'Düzenle' : 'Yaz'}
                    </button>
                    {open === 'kFaq' && (
                        <div className="w2-ked">
                            {d.kFaq.map((x, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <input className="ay-input sm" aria-label={`Soru ${i + 1}`} maxLength={L.question} value={x.q} placeholder="Soru: Lazerden önce tıraş olmalı mıyım?"
                                            onChange={(e) => setFaq(d.kFaq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} />
                                        <textarea className="ay-input" aria-label={`Cevap ${i + 1}`} style={{ minHeight: 56, fontSize: 15, padding: '10px 14px', height: 'auto' }} rows={2}
                                            maxLength={L.answer} value={x.a} placeholder="Cevap: Evet, seanstan bir gün önce bölgeyi tıraş etmeniz yeterli."
                                            onChange={(e) => setFaq(d.kFaq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} />
                                    </div>
                                    <button type="button" className="ay-btn" aria-label={`Soru ${i + 1}'i sil`} style={{ padding: '0 12px', height: 40 }}
                                        onClick={() => setFaq(d.kFaq.filter((_, j) => j !== i))}><I n="trash" /></button>
                                </div>
                            ))}
                            {d.kFaq.length < L.faq && (
                                <button type="button" className="ay-link-btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    onClick={() => setFaq([...d.kFaq, { q: '', a: '' }])}><I n="plus" />Soru ekle</button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <p className="w2-note">Sık sorulanlara en çok {L.faq} soru-cevap yazılır. “Düzenle” alanı satırın içinde açar; Kaydet çubuğuyla kaydedilir.</p>
        </div>
    );
}

// ── 3 · Giden mesajlar ──────────────────────────────────────────────────────

function ZamanSatiri({ m, on, selected, isOpen, onSelect, onToggle, setLine, editor }: {
    m: Msg; on: boolean; selected: boolean; isOpen: boolean; onSelect: () => void;
    onToggle: (v: boolean) => Promise<boolean>; setLine: ReactNode; editor: ReactNode;
}) {
    const sw = useSwitchSave();
    const shown = sw.pending ?? on;
    const always = !m.feature && !m.rebook;
    return (
        <div className={`w2-tr${selected ? ' sel' : ''}${shown ? '' : ' off'}`} role="button" tabIndex={0} aria-pressed={selected}
            aria-expanded={isOpen || undefined}
            onClick={(e) => { if ((e.target as HTMLElement).closest('input,textarea,button,a,.w2-tx')) return; onSelect(); }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onSelect(); } }}>
            <span className="w2-tt">{m.tm}</span>
            <span className="w2-tn"><i /></span>
            <div className="w2-tb">
                <h4>{m.t}{m.tag && <span className="ay-tag">{m.tag}</span>}</h4>
                <p>{m.w}.{m.d ? ` ${m.d}` : ''}</p>
                {sw.status === 'error' && <span className="ay-errline" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>}
                {setLine}
                {editor}
            </div>
            {always ? <span className="w2-alw">Her randevuda gider</span> : (
                <span className="w2-tctl">
                    <Saved on={sw.status === 'saved'} />
                    <span className="w2-swl">{shown ? 'Açık' : 'Kapalı'}</span>
                    <Switch checked={shown} label={m.t} busy={sw.status === 'saving'} onChange={() => { onSelect(); void sw.run(!on, onToggle); }} />
                </span>
            )}
        </div>
    );
}

/** Satırın ayar özeti — "Link: …", "İndirim: %20 · 30 gün", "Teşvik satırı: yok". */
function SetLine({ m, d, isOpen, sched, onOpen, onDil }: {
    m: Msg; d: Draft; isOpen: boolean; sched: boolean; onOpen: () => void; onDil: () => void;
}) {
    const tg = (label: string) => <button type="button" onClick={onOpen}>{isOpen ? 'Kapat' : label}</button>;
    if (m.id === 'google') {
        return d.google.trim()
            ? <span className="w2-tset">Link: <span className="mono">{d.google.trim()}</span> · {tg('Düzenle')}</span>
            : <span className="w2-tset am" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><span className="w2-dot am" style={{ marginTop: 5 }} />
                <span>{sched ? 'Link yok — puan sorulur ama link gitmez.' : 'Link yok — bu mesaj gitmiyor.'} {tg('Link ekle')}</span></span>;
    }
    if (m.id === 'next') {
        return <span className="w2-tset">Teşvik satırı: {d.rebookNote.trim() ? `🎁 ${d.rebookNote.trim()}` : <span style={{ color: 'var(--tx2)' }}>yok</span>} · {tg(d.rebookNote.trim() ? 'Düzenle' : 'Ekle')}</span>;
    }
    if (m.id === 'ozledik') {
        const p = Number(d.discPct) || 0;
        return <span className="w2-tset">İndirim: {p > 0 ? `%${p} · ${Number(d.discDays) || 0} gün geçerli` : <span style={{ color: 'var(--tx2)' }}>yok, indirimsiz gider</span>} · {tg('Düzenle')}</span>;
    }
    if (m.id === 'donus') {
        return <span className="w2-tset" style={{ color: 'var(--tx2)' }}>Adı ve günü <button type="button" onClick={onDil}>Mesaj dili</button>’nden gelir.</span>;
    }
    return null;
}

/** Satırın içinde açılan yazılan alanlar — kayıt çubuğuyla kaydedilir. */
function Duzenle({ m, t, connected, slug }: { m: Msg; t: Taslak<Draft>; connected: boolean; slug: boolean }) {
    const d = t.draft;
    const mark = (...keys: (keyof Draft)[]) => keys.some((k) => t.isChanged(k))
        && <span aria-hidden="true" className="ay-changed" style={{ left: -10, top: 8, bottom: 8 }} />;
    if (m.id === 'google') {
        return (
            <div className="w2-tx">{mark('google')}
                <label className="w2-lb" htmlFor="w2-google">Google değerlendirme linki</label>
                <input id="w2-google" className="ay-input sm mono" value={d.google} placeholder="g.page/r/…/review" autoFocus onChange={(e) => t.set({ google: e.target.value })} />
                <p className="w2-note">Google işletme profilinizde <b>Yorum iste → bağlantıyı kopyala</b>.</p>
            </div>
        );
    }
    if (m.id === 'next') {
        return (
            <div className="w2-tx">{mark('rebookNote')}
                <label className="w2-lb" htmlFor="w2-tesvik">Teşvik satırı <span>· isteğe bağlı</span></label>
                <div className="ay-affix sm">
                    <span className="pre" style={{ color: 'var(--tx)' }}>🎁</span>
                    <input id="w2-tesvik" value={d.rebookNote} placeholder="ör. Bir sonraki randevunuzda %10 indirim" autoFocus onChange={(e) => t.set({ rebookNote: e.target.value })} />
                </div>
                <p className="w2-note">Mesajın sonuna “🎁 …” olarak eklenir.</p>
                <div className="w2-checks">
                    <span className={connected ? '' : 'x'}><I n={connected ? 'check' : 'x'} />WhatsApp bağlı</span>
                    <span className={slug ? '' : 'x'}><I n={slug ? 'check' : 'x'} />Randevu adresi tanımlı</span>
                </div>
            </div>
        );
    }
    if (m.id === 'ozledik') {
        return (
            <div className="w2-tx">{mark('discPct', 'discDays')}
                <span className="w2-lb">İndirim teklifi</span>
                <div className="w2-trow">
                    <div className="ay-affix sm" style={{ width: 120 }}>
                        <span className="pre">%</span>
                        <input aria-label="İndirim oranı" inputMode="numeric" autoFocus value={d.discPct} style={{ textAlign: 'right' }}
                            onChange={(e) => t.set({ discPct: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                    </div>
                    <div className="ay-affix sm" style={{ width: 170 }}>
                        <input aria-label="Kaç gün geçerli" inputMode="numeric" value={d.discDays}
                            onChange={(e) => t.set({ discDays: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                        <span className="suf">gün geçerli</span>
                    </div>
                </div>
                <p className="w2-note">Her müşteriye özel kod üretilir; Kasa’da girilince uygulanır ve kimin döndüğü ölçülür. Oran 0 ise mesaj indirimsiz gider.</p>
            </div>
        );
    }
    return null;
}

/** Tek örnek baloncuk — yanda yapışkan; dar ekranda seçilen satırın altında. */
function Ornek({ m, off, offline, sample, kind }: { m: Msg; off: boolean; offline: boolean; sample: string; kind: 'side' | 'inl' }) {
    const st = offline ? 'WhatsApp bağlı değil — bu mesaj gitmiyor.' : off ? 'Kapalı — bu mesaj gitmiyor.' : '';
    const Tag = kind === 'side' ? 'aside' : 'div';
    return (
        <Tag className={`w2-pv ${kind}`} aria-label="Örnek mesaj">
            <div className="w2-pvh">
                <span className="w2-eb">ÖRNEK · {sample.toLocaleUpperCase('tr-TR')}’IN TELEFONUNDA</span>
                <b>{m.t}</b>
                <span>{m.w}</span>
            </div>
            <Bubble text={m.text} time={m.at} dim={Boolean(st)} />
            {st && <p className="w2-pvs">{st}</p>}
            <p className="w2-note">Metin sektörünüzün mesaj kalıbından gelir; {sample} örnek müşteridir.</p>
        </Tag>
    );
}

function Gelismis({ on, onSave }: { on: boolean; onSave: (v: boolean) => Promise<boolean> }) {
    const sw = useSwitchSave();
    const shown = sw.pending ?? on;
    return (
        <div className="w2-fb">
            <div className="w2-srow">
                <div className="sbd">
                    <b>Her randevuyu ayrı zamanla<span className="ay-tag">Önerilen</span></b>
                    <p className="w2-note">Açıkken her mesaj kendi randevusuna göre planlanır; randevu değişince plan da değişir. Kapalıyken mesajlar yarım saatte bir toplu kontrol edilir.</p>
                    {sw.status === 'error' && <span className="ay-errline" role="alert"><I n="alert" />Kaydedilemedi — tekrar deneyin</span>}
                </div>
                <span className="w2-tctl">
                    <Saved on={sw.status === 'saved'} />
                    <span className="w2-swl">{shown ? 'Açık' : 'Kapalı'}</span>
                    <Switch checked={shown} label="Her randevuyu ayrı zamanla" busy={sw.status === 'saving'} onChange={() => void sw.run(!on, onSave)} />
                </span>
            </div>
            <div className="w2-chg">
                <span className="w2-eb">Kapalıyken zamanı değişen iki mesaj</span>
                <ul>
                    <li><b>Google değerlendirme</b> — hesap kapandıktan ~3 saat sonra, randevu başına bir kez.</li>
                    <li><b>Sıradaki randevu daveti</b> — randevu tamamlanınca.</li>
                </ul>
            </div>
            <p className="w2-note">Açınca ileri tarihli randevuların mesajları hemen planlanır.</p>
        </div>
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
            <div className="ay-stack" style={{ padding: '18px 0', position: 'relative', borderTop: 'none' }}>
                {mark('persona')}
                <label className="ay-lbl sm" htmlFor="ay-persona">Karakter</label>
                <span className="ay-help sm">Akıllı asistan bu tonu kullanır.</span>
                <textarea id="ay-persona" className="ay-input" style={{ minHeight: 66, fontSize: 15.5, padding: '11px 14px', height: 'auto' }} rows={2} value={d.persona} onChange={(e) => t.set({ persona: e.target.value })} />
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
                <label className="ay-lbl sm" htmlFor="ay-emoji">Emoji <span style={{ fontWeight: 500, color: 'var(--tx2)' }}>· en çok 4 karakter</span></label>
                <input id="ay-emoji" className="ay-input sm" style={{ width: 140, fontSize: 20 }} maxLength={4} value={d.emoji} onChange={(e) => t.set({ emoji: e.target.value.slice(0, 4) })} />
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
                <div className="w2-always"><I n="lock" /><span><b>Güvenlik kuralı korunur:</b> {guardrail}</span></div>
            )}
        </section>
    );
}
