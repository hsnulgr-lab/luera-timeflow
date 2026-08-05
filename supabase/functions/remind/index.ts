import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    connectedOrgs, drainOutbox, featureOn, getOrgWa, getSecret, sendWA, verifyConnection,
    type OrgWa, type WaKind,
} from '../_shared/wa.ts';
import { identify, deny } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Turkey UTC+3
const TZ_OFFSET_MIN = 3 * 60;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Manuel tetikleme: panel/vizit ekranındaki "Hatırlat" butonu tek bir
        // hastanın kontrol (recall) mesajını hemen gönderir. Body yoksa (cron)
        // tam otomatik tarama çalışır.
        let reqBody: { recallCustomerId?: string } = {};
        try { reqBody = await req.json(); } catch { /* cron: gövde yok */ }

        // Türkiye saatine göre şimdiki zaman
        const nowUtc = new Date();
        const nowTR  = new Date(nowUtc.getTime() + TZ_OFFSET_MIN * 60_000);

        const todayStr    = datePart(nowTR);
        const tomorrowStr = datePart(new Date(nowTR.getTime() + 86_400_000));
        const plus2Str    = datePart(new Date(nowTR.getTime() + 2 * 86_400_000));
        const nowMin      = nowTR.getHours() * 60 + nowTR.getMinutes();

        // Sessiz saatler: cron 30 dakikada bir çalıştığı için gece yarısı da
        // tetikleniyor ve "yarınki randevunuz" hatırlatması 00:00'da gidiyordu.
        // İşletme adına gönderilen mesajlar yalnız 09:00–21:00 (TR) arasında.
        // 2 saat kala hatırlatma bunun DIŞINDA: randevu saatine bağlı, zaten
        // mesai içine denk gelir ve geciktirilirse anlamını yitirir.
        const SENDABLE_FROM = 9 * 60;
        const SENDABLE_TO   = 21 * 60;
        const sendableHour  = nowMin >= SENDABLE_FROM && nowMin < SENDABLE_TO;

        // 2h penceresi: şu andan 90-150 dakika arasındaki randevular
        const window2hStart = nowMin + 90;
        const window2hEnd   = nowMin + 150;

        let sent24h = 0;
        let sent2h  = 0;
        let sentRecall = 0;
        let sentWinback = 0;
        let sentRenewal = 0;
        let sentReview = 0;
        const errors: string[] = [];

        // AI mesaj üretimi için Gemini key (env → app_secrets)
        const geminiKey = await getGeminiKey(supabase);

        // ── MANUEL MOD: tek hasta kontrol hatırlatması ───────────────────────
        // "Hatırlat" butonu bu yolu tetikler; cron beklemeden anında gönderir.
        if (reqBody.recallCustomerId) {
            // Tenant izolasyonu: service-role RLS'i bypass ettiği için çağıranın
            // org'unu JWT'den doğrula ve hastanın AYNI org'a ait olduğunu kanıtla.
            // Aksi halde başka kliniğin hastasına mesaj attırılabilirdi.
            const authHeader = req.headers.get('Authorization') || '';
            const jwt = authHeader.replace(/^Bearer\s+/i, '');
            const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
            if (userErr || !userData?.user) {
                return new Response(JSON.stringify({ error: 'Yetkisiz' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            const { data: member } = await supabase
                .from('organization_members')
                .select('org_id')
                .eq('user_id', userData.user.id)
                .limit(1)
                .maybeSingle();
            const callerOrgId = member?.org_id;
            if (!callerOrgId) {
                return new Response(JSON.stringify({ error: 'Organizasyon bulunamadı' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            const { data: cust } = await supabase
                .from('customers')
                .select('id, name, phone, recall_date, organization_id')
                .eq('id', reqBody.recallCustomerId)
                .eq('organization_id', callerOrgId)
                .maybeSingle();
            if (!cust?.phone) {
                return new Response(JSON.stringify({ error: 'Hasta veya telefon bulunamadı' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            const { data: orgSettings } = await supabase
                .from('settings')
                .select('business_name, comms')
                .eq('organization_id', cust.organization_id)
                .limit(1)
                .maybeSingle();
            // Bağlantı org_whatsapp'ta (070) — settings kullanıcı başına tek satır
            // olduğu için oradan okumak çok üyeli org'da belirsizdi.
            const orgWa = await getOrgWa(supabase, cust.organization_id);
            if (!orgWa?.instance || orgWa.status !== 'connected') {
                return new Response(JSON.stringify({ error: 'WhatsApp bağlı değil' }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            const { data: orgRow } = await supabase
                .from('organizations').select('maps_url').eq('id', cust.organization_id).maybeSingle();
            const mapsUrl = orgRow?.maps_url ?? null;
            // settings satırı yoksa (silinmiş/eksik) mesaj yine gitsin
            const bizName = orgSettings?.business_name || 'İşletme';
            const manualComms = resolveComms(orgSettings?.comms);
            const tmpl = () => buildRecallMessage({ customerName: cust.name, businessName: bizName, comms: manualComms });
            const msg = withMapsUrl(await recallAiOrTemplate(geminiKey, manualComms, cust.name, bizName, tmpl), mapsUrl);
            // Elle tetiklenen hatırlatma kotaya takılmasın (kind:'manual').
            const res = await sendWA(supabase, {
                org: orgWa, phone: cust.phone, text: msg, kind: 'manual', customerId: cust.id,
            });
            // Kuyruğa alındıysa da damgala: teslimat outbox'ın işi, kullanıcı
            // butona tekrar basınca ikinci mesaj kuyruğa girmesin (079).
            const handled = res.ok || Boolean(res.queued);
            if (handled && cust.recall_date) {
                await supabase.from('customers').update({ recall_reminded_for: cust.recall_date }).eq('id', cust.id);
            }
            return new Response(JSON.stringify({ success: res.ok, queued: Boolean(res.queued) }),
                { status: handled ? 200 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // ── CRON MODU: yalnız zamanlayıcı tetikleyebilir ────────────────────
        // Buraya kadar gelen istek gövdesiz demektir = tüm org'ların taraması.
        // Kimlik kontrolü yoktu: URL'i bilen herkes tüm müşterilere mesaj
        // gönderilmesini tetikleyebiliyordu. Artık x-cron-secret (ya da dahili
        // service_role çağrısı) şart.
        const caller = await identify(supabase, req);
        if (caller.kind !== 'cron' && caller.kind !== 'service') {
            return deny(401, 'Bu uç yalnız zamanlayıcı tarafından çağrılabilir', corsHeaders);
        }

        // Bağlı organizasyonlar — org başına TEK satır (org_whatsapp, 070).
        // Eskiden settings satırları üzerinde dönülüyordu; settings kullanıcı
        // başına tek satır olduğu için 3 üyeli org 3 kez işleniyordu.
        const orgList = await connectedOrgs(supabase);
        const orgIds = orgList.map((o) => o.organization_id);

        // Bekleyen kuyruk ÖNCE boşaltılır (079): geciken hatırlatma yeni
        // hatırlatmadan daha aceledir. Sessiz saatte de çalışır — kuyruktaki
        // mesaj zaten gönderilebilir bir saatte üretilmiştir.
        const outbox = await drainOutbox(supabase);

        // İşletme adı + sektörel iletişim profili (settings'ten, org bazlı)
        const settingsByOrg = new Map<string, { business_name: string; comms: unknown; sector: string | null }>();
        const mapsUrlByOrg = new Map<string, string>();
        // Değerlendirme daveti ve indirimli winback için org ayarları
        const orgExtras = new Map<string, { reviewUrl: string | null; discountPercent: number; discountDays: number }>();
        if (orgIds.length > 0) {
            const { data: settingsRows } = await supabase
                .from('settings')
                .select('organization_id, business_name, comms, sector')
                .in('organization_id', orgIds);
            for (const s of settingsRows ?? []) {
                if (!settingsByOrg.has(s.organization_id)) {
                    settingsByOrg.set(s.organization_id, { business_name: s.business_name, comms: s.comms, sector: s.sector ?? null });
                }
            }
            const { data: orgRows } = await supabase
                .from('organizations')
                .select('id, maps_url, google_review_url, winback_discount_percent, winback_discount_days')
                .in('id', orgIds);
            for (const o of orgRows ?? []) {
                if (o.maps_url) mapsUrlByOrg.set(o.id, o.maps_url);
                orgExtras.set(o.id, {
                    reviewUrl: o.google_review_url ?? null,
                    discountPercent: Number(o.winback_discount_percent ?? 0) || 0,
                    discountDays: Number(o.winback_discount_days ?? 30) || 0,
                });
            }
        }

        for (const orgWa of orgList) {
            const organization_id = orgWa.organization_id;
            const conf = settingsByOrg.get(organization_id);
            const business_name = conf?.business_name ?? 'İşletme';
            // Sektörel iletişim profili — kaynak src/lib/sectorProfiles.ts, uygulama
            // settings.comms'a yazar (066). Yoksa nötr profille devam edilir.
            const comms: Comms = resolveComms(conf?.comms);
            const mapsUrl = mapsUrlByOrg.get(organization_id) ?? null;
            const extras = orgExtras.get(organization_id)
                ?? { reviewUrl: null, discountPercent: 0, discountDays: 30 };

            // Hat gerçekten ayakta mı? Düşmüşse org_whatsapp güncellenir ve bu
            // org atlanır — ölü hatta boşuna gönderim denenmez, uygulamadaki
            // "bağlantı düştü" uyarısı da en geç 30 dakikada belirir.
            if (!(await verifyConnection(supabase, orgWa as OrgWa))) {
                errors.push(`offline:${organization_id}`);
                continue;
            }

            // Her gönderim aynı kapıdan: normalize + opt-out + kota + log
            //
            // Kuyruğa alınan mesaj da "hallolmuş" sayılır (079). Sayılmazsa
            // randevu `reminder_24h_sent` işaretlenmez ve bir sonraki tur AYNI
            // mesajı sıfırdan kuyruğa ekler — geçici bir ağ hatası müşteriye üç
            // hatırlatma olarak döner.
            const send = async (phone: string, text: string, kind: WaKind, customerId?: string | null) => {
                const res = await sendWA(supabase, { org: orgWa as OrgWa, phone, text, kind, customerId });
                return res.ok || Boolean(res.queued);
            };

            // ── 24h Hatırlatma ───────────────────────────────────────────────
            const { data: list24h } = !sendableHour ? { data: [] } : await supabase
                .from('reservations')
                .select('id, customer_id, customer_name, customer_phone, start_time, service')
                .eq('organization_id', organization_id)
                .eq('date', tomorrowStr)
                .eq('reminder_24h_sent', false)
                .neq('status', 'cancelled');

            for (const r of list24h ?? []) {
                const startTime = r.start_time.slice(0, 5);
                const tmpl = () => build24hMessage({ customerName: r.customer_name, startTime, service: r.service, businessName: business_name, comms });
                const msg = withMapsUrl(await aiOrTemplate(geminiKey, comms, '24h', r.customer_name, r.service, startTime, business_name, tmpl), mapsUrl);
                const ok = await send(r.customer_phone, msg, 'reminder_24h', r.customer_id);
                if (ok) {
                    await supabase.from('reservations').update({ reminder_24h_sent: true }).eq('id', r.id);
                    sent24h++;
                } else {
                    errors.push(`24h:${r.id}`);
                }
            }

            // ── 2h Hatırlatma ────────────────────────────────────────────────
            const { data: list2h } = await supabase
                .from('reservations')
                .select('id, customer_id, customer_name, customer_phone, start_time, service')
                .eq('organization_id', organization_id)
                .eq('date', todayStr)
                .eq('reminder_2h_sent', false)
                .neq('status', 'cancelled');

            for (const r of list2h ?? []) {
                if (!r.start_time) continue;
                const [h, m] = r.start_time.split(':').map(Number);
                const resMin = h * 60 + m;
                if (resMin < window2hStart || resMin > window2hEnd) continue;

                const startTime2 = r.start_time.slice(0, 5);
                const tmpl2 = () => build2hMessage({ customerName: r.customer_name, startTime: startTime2, service: r.service, businessName: business_name, comms });
                const msg = withMapsUrl(await aiOrTemplate(geminiKey, comms, '2h', r.customer_name, r.service, startTime2, business_name, tmpl2), mapsUrl);
                const ok = await send(r.customer_phone, msg, 'reminder_2h', r.customer_id);
                if (ok) {
                    await supabase.from('reservations').update({ reminder_2h_sent: true }).eq('id', r.id);
                    sent2h++;
                } else {
                    errors.push(`2h:${r.id}`);
                }
            }

            // ── Dönüş (recall) Hatırlatması ──────────────────────────────────
            // Sektörün recall kavramı varsa (diş: kontrol, kuaför: dip boyası,
            // gym: üyelik yenileme…) recall_date'e 2 gün kala tek sefer gönderilir.
            // recall_reminded_for aynı tarihe ikinci mesajı engeller (065).
            if (comms.recall && featureOn(orgWa, 'recall') && sendableHour) {
                // Alt sınır: 60 günden eski recall tarihleri artık "kaçmış"tır —
                // ilk kurulumdaki tarihi kayıtlara toplu mesaj patlatılmaz.
                // Telefonsuz hastalar SQL'de elenir (işaretlenemedikleri için
                // eskiden her 30 dakikada bir yeniden taranıyorlardı).
                const recallFloor = datePart(new Date(nowTR.getTime() - 60 * 86_400_000));
                const { data: recallList } = await supabase
                    .from('customers')
                    .select('id, name, phone, recall_date, recall_reminded_for')
                    .eq('organization_id', organization_id)
                    .not('recall_date', 'is', null)
                    .not('phone', 'is', null)
                    .gte('recall_date', recallFloor)
                    .lte('recall_date', plus2Str)
                    .order('recall_date', { ascending: true })
                    .limit(200);

                let recallBudget = 30;
                for (const c of recallList ?? []) {
                    if (recallBudget <= 0) break;
                    if (!c.phone) continue;
                    // Bu kontrol tarihi için zaten hatırlatıldıysa atla
                    if (c.recall_reminded_for && c.recall_reminded_for === c.recall_date) continue;
                    const tmpl = () => buildRecallMessage({ customerName: c.name, businessName: business_name, comms });
                    const msg = withMapsUrl(await recallAiOrTemplate(geminiKey, comms, c.name, business_name, tmpl), mapsUrl);
                    const ok = await send(c.phone, msg, 'recall', c.id);
                    if (ok) {
                        await supabase.from('customers').update({ recall_reminded_for: c.recall_date }).eq('id', c.id);
                        sentRecall++;
                        recallBudget--;
                    } else {
                        errors.push(`recall:${c.id}`);
                    }
                }
            }

            // ── Google değerlendirme daveti — 071 ────────────────────────────
            // Tahsilat kapandıktan ~3 saat sonra: müşteri işletmeden ayrılmış,
            // deneyim hâlâ taze. Hemen göndermek (daha içerideyken) rahatsız
            // edici, ertesi güne bırakmak yanıt oranını düşürüyor.
            // İşletme Google değerlendirme linkini girmemişse hiç denenmez.
            if (featureOn(orgWa, 'review') && sendableHour && extras.reviewUrl) {
                const readyBefore = new Date(nowUtc.getTime() - 3 * 3_600_000).toISOString();
                // Çok eski hesapları diriltme: 2 günden fazla gecikmişse (cron
                // durmuş, link sonradan girilmiş) davet artık anlamsız.
                const notOlderThan = new Date(nowUtc.getTime() - 2 * 86_400_000).toISOString();
                const { data: reviewList } = await supabase
                    .from('reservations')
                    .select('id, customer_id, customer_name, customer_phone, paid_at')
                    .eq('organization_id', organization_id)
                    .eq('review_sent', false)
                    .eq('is_paid', true)
                    .not('paid_at', 'is', null)
                    .lte('paid_at', readyBefore)
                    .gte('paid_at', notOlderThan)
                    .order('paid_at', { ascending: true })
                    .limit(30);

                for (const r of reviewList ?? []) {
                    if (!r.customer_phone) continue;
                    const msg = buildReviewMessage({
                        customerName: r.customer_name,
                        businessName: business_name,
                        reviewUrl: extras.reviewUrl,
                        comms,
                    });
                    const ok = await send(r.customer_phone, msg, 'review', r.customer_id);
                    // Gönderilemese de işaretliyoruz: opt-out ya da geçersiz numara
                    // kalıcı sebepler, her turda yeniden denemek log şişirir.
                    await supabase.from('reservations').update({ review_sent: true }).eq('id', r.id);
                    if (ok) sentReview++;
                    else errors.push(`review:${r.id}`);
                }
            }

            // ── "Sizi özledik" (winback) — 067 ───────────────────────────────
            // İşletme Ayarlar → WhatsApp'tan kapatabilir (org_whatsapp.features).
            // 60+ gündür gelmeyen, ileri tarihli randevusu olmayan müşteriye bir
            // kez gönderilir; 90 gün geçmeden tekrarlanmaz. Tur başına 15 mesaj
            // (WhatsApp spam görünümünü ve süreyi sınırlar).
            if (featureOn(orgWa, 'winback') && sendableHour) {
                const cutoff60 = datePart(new Date(nowTR.getTime() - 60 * 86_400_000));
                const resend90 = new Date(nowUtc.getTime() - 90 * 86_400_000).toISOString();
                const { data: futureRes } = await supabase
                    .from('reservations')
                    .select('customer_id')
                    .eq('organization_id', organization_id)
                    .gte('date', todayStr)
                    .neq('status', 'cancelled');
                const hasFuture = new Set((futureRes ?? []).map((r: any) => r.customer_id).filter(Boolean));

                const { data: winbackList } = await supabase
                    .from('customers')
                    .select('id, name, phone, last_visit, winback_sent_at')
                    .eq('organization_id', organization_id)
                    .not('phone', 'is', null)
                    .not('last_visit', 'is', null)
                    .lte('last_visit', cutoff60)
                    .order('last_visit', { ascending: true })
                    .limit(60);

                let budget = 15;
                for (const c of winbackList ?? []) {
                    if (budget <= 0) break;
                    if (!c.phone || hasFuture.has(c.id)) continue;
                    if (c.winback_sent_at && c.winback_sent_at > resend90) continue;

                    // İndirim teklifi — 071. Oran 0 ise kod üretilmez, mesaj
                    // eski hâlinde gider. Kod müşteriye ÖZEL: kimin döndüğünü
                    // ölçebilmenin tek yolu, aksi halde indirim veriliyor ama
                    // karşılığı bilinmiyordu.
                    let offer: DiscountOffer | null = null;
                    if (extras.discountPercent > 0) {
                        offer = await issueDiscountCode(
                            supabase, organization_id, c.id,
                            extras.discountPercent, extras.discountDays,
                        );
                    }

                    // AI kod uydurabilir ya da düşürebilir; indirim satırı
                    // şablondan, metnin sonuna sabit eklenir.
                    const tmpl = () => buildWinbackMessage({ customerName: c.name, businessName: business_name, comms });
                    const base = withMapsUrl(await winbackAiOrTemplate(geminiKey, comms, c.name, business_name, tmpl), mapsUrl);
                    const msg = offer ? base + discountLine(offer) : base;
                    const ok = await send(c.phone, msg, 'winback', c.id);
                    if (ok) {
                        await supabase.from('customers').update({ winback_sent_at: nowUtc.toISOString() }).eq('id', c.id);
                        sentWinback++;
                        budget--;
                    } else {
                        errors.push(`winback:${c.id}`);
                    }
                }
            }

            // ── Biten pakete yenileme teklifi — 067 ──────────────────────────
            // Tüm seansları tamamlanmış paketin sahibine paket başına bir kez
            // yenileme mesajı gönderilir (renewal_offered_at damgası).
            // Diş kliniğinde çok seanslı treatment_plan "paket" değil tedavidir
            // (3 seanslı kanal tedavisi bitince "paketinizi yenileyelim mi"
            // mesajı klinik olarak yanlış). Diş'te dönüş mesajı recall kanalından
            // gider; renewal bu sektörde hiç taranmaz.
            if (conf?.sector !== 'dis' && featureOn(orgWa, 'renewal') && sendableHour) {
                // DİKKAT: eleme (sessions_done >= session_count) PostgREST'te
                // kolon-kolon karşılaştırması gerektirdiği için JS'te yapılıyor.
                // Bu yüzden LIMIT, elemeden ÖNCEKİ kümeye uygulanır — sıralamasız
                // küçük bir limitle biten planlar hiç görülmeyebiliyordu (canlıda
                // 57 aday plan içinden tek biten plan 30'luk rastgele dilime
                // girmediği için yenileme teklifi hiç gitmiyordu).
                // Çözüm: SQL'de daraltabildiğimiz kadar daralt (session_count > 1),
                // deterministik sırala, limiti güvenli bir tavana çek.
                const { data: donePlans } = await supabase
                    .from('treatment_plans')
                    .select('id, title, customer_id, session_count, sessions_done, renewal_offered_at, status')
                    .eq('organization_id', organization_id)
                    .neq('status', 'cancelled')
                    .is('renewal_offered_at', null)
                    .gt('session_count', 1)
                    .order('created_at', { ascending: false })
                    .limit(500);

                const ready = (donePlans ?? []).filter((p: any) =>
                    Number(p.sessions_done ?? 0) >= Math.max(1, Number(p.session_count ?? 1)) && Number(p.session_count ?? 1) > 1);
                let budget = 15;
                for (const p of ready) {
                    if (budget <= 0) break;
                    const { data: cust } = await supabase
                        .from('customers').select('id, name, phone')
                        .eq('id', p.customer_id).eq('organization_id', organization_id).maybeSingle();
                    if (!cust?.phone) {
                        // Telefonu olmayan paket her turda taranmasın
                        await supabase.from('treatment_plans').update({ renewal_offered_at: nowUtc.toISOString() }).eq('id', p.id);
                        continue;
                    }
                    const tmpl = () => buildRenewalMessage({ customerName: cust.name, packageTitle: p.title, businessName: business_name, comms });
                    const msg = withMapsUrl(await renewalAiOrTemplate(geminiKey, comms, cust.name, p.title, business_name, tmpl), mapsUrl);
                    const ok = await send(cust.phone, msg, 'renewal', cust.id);
                    if (ok) {
                        await supabase.from('treatment_plans').update({ renewal_offered_at: nowUtc.toISOString() }).eq('id', p.id);
                        sentRenewal++;
                        budget--;
                    } else {
                        errors.push(`renewal:${p.id}`);
                    }
                }
            }
        }

        // ── Yaklaşan randevu push'u (WhatsApp'tan bağımsız, tüm org'lar) ──────
        // Atanmış personele, randevusuna ~10-25 dk kala bir kez push.
        let sentPush = 0;
        const pushBase = await getSecret(supabase, 'FUNCTIONS_BASE_URL');
        const pushSecret = await getSecret(supabase, 'PUSH_TRIGGER_SECRET');
        if (pushBase && pushSecret) {
            const winStart = `${String(Math.floor((nowMin + 10) / 60)).padStart(2, '0')}:${String((nowMin + 10) % 60).padStart(2, '0')}`;
            const winEnd   = `${String(Math.floor((nowMin + 25) / 60)).padStart(2, '0')}:${String((nowMin + 25) % 60).padStart(2, '0')}`;
            const { data: soon } = await supabase
                .from('reservations')
                .select('id, organization_id, customer_name, service, start_time, staff_id')
                .eq('date', todayStr)
                .eq('reminder_push_sent', false)
                .not('staff_id', 'is', null)
                .in('status', ['confirmed', 'pending'])
                .gte('start_time', winStart)
                .lte('start_time', winEnd);

            for (const r of soon ?? []) {
                try {
                    const res = await fetch(`${pushBase}/send-push`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-push-secret': pushSecret },
                        body: JSON.stringify({
                            organization_id: r.organization_id,
                            target: { staffId: r.staff_id },
                            payload: {
                                title: 'Sıradaki randevun yaklaşıyor',
                                body: `${r.customer_name || 'Müşteri'} · ${r.service || ''} · ${String(r.start_time).slice(0, 5)}`,
                                url: '/calendar',
                                tag: `soon-${r.id}`,
                            },
                        }),
                    });
                    if (res.ok) {
                        await supabase.from('reservations').update({ reminder_push_sent: true }).eq('id', r.id);
                        sentPush++;
                    }
                } catch (_e) { /* sessiz geç — bir sonraki turda tekrar denenir */ }
            }
        }

        console.log(`Remind: outbox=${outbox.sent}/${outbox.requeued}/${outbox.dropped} 24h=${sent24h} 2h=${sent2h} recall=${sentRecall} review=${sentReview} winback=${sentWinback} renewal=${sentRenewal} push=${sentPush} errors=${errors.length}${sendableHour ? '' : ' (sessiz saat)'}`);
        return new Response(
            JSON.stringify({ success: true, outbox, sent24h, sent2h, sentRecall, sentWinback, sentRenewal, sentPush, errors }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err) {
        console.error('Remind error:', err);
        return new Response(
            JSON.stringify({ error: 'Sunucu hatası', detail: String(err) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function datePart(d: Date): string {
    return d.toISOString().slice(0, 10);
}

// Konum linkini şablon/AI ayrımı olmadan tek noktadan ekler
// (AI'ya URL verilmez — bozma riski var)
function withMapsUrl(msg: string, mapsUrl: string | null): string {
    return mapsUrl ? `${msg}\n\n📍 Konum: ${mapsUrl}` : msg;
}

function build24hMessage(p: { customerName: string; startTime: string; service: string; businessName: string; comms?: Comms }): string {
    const c = p.comms ?? NEUTRAL_COMMS;
    return (
        `Merhaba ${p.customerName} 👋\n\n` +
        `*${p.businessName}*'daki ${p.service} ${c.servicePhrase} hatırlatmak istedik.\n\n` +
        `📅 Yarın saat *${p.startTime}*\n\n` +
        `Görüşmek üzere! ${c.emoji}`
    );
}

function build2hMessage(p: { customerName: string; startTime: string; service: string; businessName: string; comms?: Comms }): string {
    return (
        `Merhaba ${p.customerName} 👋\n\n` +
        `Bugün saat *${p.startTime}*'deki *${p.service}* randevunuz 2 saat sonra.\n\n` +
        `📍 ${p.businessName}\n\n` +
        `Görüşmek üzere! ${(p.comms ?? NEUTRAL_COMMS).emoji}`
    );
}

// Dönüş (recall) şablonu — AI başarısız olursa güvenlik ağı. Kavram sektörden
// gelir: diş kontrolü / dip boyası / üyelik yenileme…
function buildRecallMessage(p: { customerName: string; businessName: string; comms?: Comms }): string {
    const firstName = (p.customerName || '').split(' ')[0];
    const c = p.comms ?? NEUTRAL_COMMS;
    const concept = c.recall?.concept ?? 'dönüş';
    return (
        `Merhaba ${firstName} 👋\n\n` +
        `*${p.businessName}*'den yazıyoruz. *${concept}* zamanınız geldi ${c.emoji}\n\n` +
        `Size uygun bir güne randevu oluşturmak için bu mesaja yanıt vermeniz yeterli. İyi günler dileriz! 😊`
    );
}

// "Sizi özledik" şablonu — 60+ gün gelmeyen müşteri için güvenlik ağı
// ── İndirim kodu — 071 ──────────────────────────────────────────────────────
interface DiscountOffer { code: string; percent: number; expiresAt: string | null }

// Karışması kolay harf/rakamlar (O/0, I/1) dışarıda: kod telefonda sözlü olarak
// da söyleniyor, "sıfır mı O mu" tartışması yaşanmasın.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len = 6): string {
    let out = '';
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    return out;
}

/**
 * Müşteriye özel indirim kodu üretir. Kullanılmamış ve süresi geçmemiş bir kodu
 * varsa yenisini üretmez — aynı müşteriye iki tur mesaj giderse elinde iki kod
 * birikmesin. Kod org içinde tekil (unique constraint); çakışırsa yeniden dener.
 */
async function issueDiscountCode(
    // deno-lint-ignore no-explicit-any
    supabase: any, orgId: string, customerId: string,
    percent: number, days: number,
): Promise<DiscountOffer | null> {
    const nowIso = new Date().toISOString();
    const { data: existing } = await supabase
        .from('discount_codes')
        .select('code, percent, expires_at')
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .is('redeemed_at', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .limit(1)
        .maybeSingle();
    if (existing?.code) {
        return { code: existing.code, percent: existing.percent, expiresAt: existing.expires_at ?? null };
    }

    const expiresAt = days > 0
        ? new Date(Date.now() + days * 86_400_000).toISOString()
        : null;

    for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const { error } = await supabase.from('discount_codes').insert({
            organization_id: orgId, customer_id: customerId,
            code, percent, source: 'winback', expires_at: expiresAt,
        });
        if (!error) return { code, percent, expiresAt };
        // 23505 = unique violation → başka kod dene; diğer hatalarda vazgeç
        if (error.code !== '23505') {
            console.error('discount code insert:', error);
            return null;
        }
    }
    return null;
}

function discountLine(o: DiscountOffer): string {
    const until = o.expiresAt
        ? ` (${new Date(o.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar)`
        : '';
    return `\n\n🎁 Size özel *%${o.percent} indirim*${until}\nKod: *${o.code}*\nRandevunuzda bu kodu söylemeniz yeterli.`;
}

// Google değerlendirme daveti — 071. İstemcideki eşi src/services/waTemplates.ts,
// ikisi aynı metni üretmeli (Ayarlar'daki önizleme oradan besleniyor).
function buildReviewMessage(p: {
    customerName: string; businessName: string; reviewUrl: string; comms?: Comms;
}): string {
    const firstName = (p.customerName || '').split(' ')[0];
    const c = p.comms ?? NEUTRAL_COMMS;
    return (
        `Merhaba ${firstName} ${c.emoji}\n\n` +
        `Bugün *${p.businessName}*'i tercih ettiğiniz için teşekkür ederiz!\n\n` +
        `Memnun kaldıysanız Google'da kısa bir değerlendirme bırakmanız bizim için çok değerli — ` +
        `bir dakikanızı bile almaz 🙏\n\n👉 ${p.reviewUrl}`
    );
}

function buildWinbackMessage(p: { customerName: string; businessName: string; comms?: Comms }): string {
    const firstName = (p.customerName || '').split(' ')[0];
    const c = p.comms ?? NEUTRAL_COMMS;
    return (
        `Merhaba ${firstName} ${c.emoji}\n\n` +
        `*${p.businessName}* olarak sizi özledik! Bir süredir uğramadınız — ` +
        `size uygun bir güne ${c.serviceWord} planlamak isterseniz bu mesaja yanıt vermeniz yeterli. 😊`
    );
}

function buildWinbackAiPrompt(comms: Comms, customerName: string, businessName: string): string {
    const firstName = (customerName || '').split(' ')[0];
    return (
        `${comms.persona} İşletme adı: ${businessName}.\n` +
        `${comms.audience} ${firstName}. Bu kişi 2 aydan uzun süredir gelmedi.\n` +
        `Bu kişiye kısa (en fazla 2-3 cümle), sıcak, WhatsApp için uygun bir Türkçe "SİZİ ÖZLEDİK" mesajı yaz. ` +
        `Adıyla başla. Suçlayıcı olma; nazikçe dönüş yapmasını iste. 1 emoji kullanabilirsin (${comms.emoji}). ` +
        (comms.guardrail ? `${comms.guardrail} ` : '') +
        `İndirim/kampanya UYDURMA. Sadece mesaj metnini döndür; başka açıklama, tırnak veya etiket ekleme.`
    );
}

async function winbackAiOrTemplate(
    geminiKey: string | null, comms: Comms, customerName: string, businessName: string, fallback: () => string,
): Promise<string> {
    if (geminiKey) {
        const ai = await geminiMessage(geminiKey, buildWinbackAiPrompt(comms, customerName, businessName));
        if (ai) return ai;
    }
    return fallback();
}

// Paket yenileme şablonu — biten paket için güvenlik ağı
function buildRenewalMessage(p: { customerName: string; packageTitle: string; businessName: string; comms?: Comms }): string {
    const firstName = (p.customerName || '').split(' ')[0];
    const c = p.comms ?? NEUTRAL_COMMS;
    return (
        `Merhaba ${firstName} ${c.emoji}\n\n` +
        `*${p.businessName}*'daki *${p.packageTitle}* paketiniz tamamlandı — emeğinize sağlık! 🎉\n\n` +
        `Devam etmek isterseniz yenileme için bu mesaja yanıt vermeniz yeterli; size uygun bir plan hazırlayalım. 😊`
    );
}

function buildRenewalAiPrompt(comms: Comms, customerName: string, packageTitle: string, businessName: string): string {
    const firstName = (customerName || '').split(' ')[0];
    return (
        `${comms.persona} İşletme adı: ${businessName}.\n` +
        `${comms.audience} ${firstName}. Bu kişinin "${packageTitle}" paketindeki tüm seanslar tamamlandı.\n` +
        `Bu kişiye kısa (en fazla 2-3 cümle), sıcak, WhatsApp için uygun bir Türkçe PAKET YENİLEME teklifi yaz. ` +
        `Adıyla başla, paketi tebrikle an, yenilemek isterse dönüş yapmasını iste. 1 emoji kullanabilirsin (${comms.emoji}). ` +
        (comms.guardrail ? `${comms.guardrail} ` : '') +
        `Fiyat/indirim UYDURMA. Sadece mesaj metnini döndür; başka açıklama, tırnak veya etiket ekleme.`
    );
}

async function renewalAiOrTemplate(
    geminiKey: string | null, comms: Comms, customerName: string, packageTitle: string, businessName: string, fallback: () => string,
): Promise<string> {
    if (geminiKey) {
        const ai = await geminiMessage(geminiKey, buildRenewalAiPrompt(comms, customerName, packageTitle, businessName));
        if (ai) return ai;
    }
    return fallback();
}

// Recall için AI mesajı — gizlilik: yalnız ön ad + işletme adı gider (telefon/soyad GİTMEZ)
function buildRecallAiPrompt(comms: Comms, customerName: string, businessName: string): string {
    const firstName = (customerName || '').split(' ')[0];
    const concept = comms.recall?.concept ?? 'dönüş';
    return (
        `${comms.persona} İşletme adı: ${businessName}.\n` +
        `${comms.audience} ${firstName}. Bu kişinin periyodik *${concept}* zamanı geldi.\n` +
        `Bu kişiye kısa (en fazla 2-3 cümle), samimi, WhatsApp için uygun bir Türkçe HATIRLATMA mesajı yaz. ` +
        `Adıyla başla. Randevu için dönüş yapmasını nazikçe iste. 1 emoji kullanabilirsin (${comms.emoji}). ` +
        (comms.guardrail ? `${comms.guardrail} ` : '') +
        `Sadece mesaj metnini döndür; başka açıklama, tırnak veya etiket ekleme.`
    );
}

async function recallAiOrTemplate(
    geminiKey: string | null, comms: Comms, customerName: string, businessName: string, fallback: () => string,
): Promise<string> {
    if (geminiKey) {
        const ai = await geminiMessage(geminiKey, buildRecallAiPrompt(comms, customerName, businessName));
        if (ai) return ai;
    }
    return fallback();
}

// ─── AI (Gemini) sektörel hatırlatma ─────────────────────────────────────────
// Gizlilik: Gemini'ye yalnızca ön ad + hizmet + saat + sektör + işletme adı gider.
// Telefon ve soyad GİTMEZ.
// Sektörel iletişim profili — TEK KAYNAK src/lib/sectorProfiles.ts'tir.
// Uygulama sektör seçildiğinde settings.comms'a yazar (066); burada sektör
// tablosunun ikinci bir kopyası TUTULMAZ, aksi halde iki taraf birbirinden
// kayar (eski SECTOR_HINTS tam olarak bu yüzden 8 sektörü ıskalıyordu).
interface Comms {
    persona: string;
    audience: string;
    serviceWord: string;
    servicePhrase: string;
    emoji: string;
    recall?: { concept: string; afterDays: number };
    guardrail?: string;
}

// comms yazılmamış org'lar için nötr profil — mesajlaşma asla kesilmez.
const NEUTRAL_COMMS: Comms = {
    persona: 'Randevulu hizmet veren bir işletmesin; samimi, nazik ve net ol.',
    audience: 'müşterimiz',
    serviceWord: 'randevu',
    servicePhrase: 'randevunuzu',
    emoji: '🗓️',
};

function resolveComms(raw: any): Comms {
    if (!raw || typeof raw !== 'object' || !raw.persona) return NEUTRAL_COMMS;
    return {
        persona: String(raw.persona),
        audience: String(raw.audience ?? NEUTRAL_COMMS.audience),
        serviceWord: String(raw.serviceWord ?? NEUTRAL_COMMS.serviceWord),
        servicePhrase: String(raw.servicePhrase ?? NEUTRAL_COMMS.servicePhrase),
        emoji: String(raw.emoji ?? NEUTRAL_COMMS.emoji),
        recall: raw.recall?.concept ? { concept: String(raw.recall.concept), afterDays: Number(raw.recall.afterDays) || 90 } : undefined,
        guardrail: raw.guardrail ? String(raw.guardrail) : undefined,
    };
}

async function getGeminiKey(supabase: any): Promise<string | null> {
    const env = Deno.env.get('GEMINI_API_KEY');
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', 'GEMINI_API_KEY').maybeSingle();
    return data?.value ?? null;
}

function buildAiPrompt(type: '24h' | '2h', comms: Comms, customerName: string, service: string, time: string, businessName: string): string {
    const firstName = (customerName || '').split(' ')[0];
    const whenLine = type === '24h'
        ? `Randevu YARIN saat ${time}.`
        : `Randevu BUGÜN saat ${time}'de (yaklaşık 2 saat sonra).`;
    return (
        `${comms.persona} İşletme adı: ${businessName}.\n` +
        `${comms.audience} ${firstName}. ${comms.serviceWord}: ${service}. ${whenLine}\n` +
        `Bu kişiye kısa (en fazla 2-3 cümle), samimi, WhatsApp için uygun bir Türkçe RANDEVU HATIRLATMA mesajı yaz. ` +
        `Adıyla başla. Saati ve hizmeti net belirt. 1 emoji kullanabilirsin (${comms.emoji}). ` +
        (comms.guardrail ? `${comms.guardrail} ` : '') +
        `Sadece mesaj metnini döndür; başka açıklama, tırnak veya etiket ekleme.`
    );
}

async function geminiMessage(key: string, prompt: string): Promise<string | null> {
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 220, temperature: 0.85, thinkingConfig: { thinkingBudget: 0 } },
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return (typeof text === 'string' && text.trim()) ? text.trim() : null;
    } catch {
        return null;
    }
}

// AI mesajı dener; başarısız/boşsa şablona düşer (güvenlik ağı)
async function aiOrTemplate(
    geminiKey: string | null, comms: Comms, type: '24h' | '2h',
    customerName: string, service: string, time: string, businessName: string,
    fallback: () => string,
): Promise<string> {
    if (geminiKey) {
        const ai = await geminiMessage(geminiKey, buildAiPrompt(type, comms, customerName, service, time, businessName));
        if (ai) return ai;
    }
    return fallback();
}
