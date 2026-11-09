// WhatsApp bağlama · Müdür 37 — sunucu çağrıları.
//
// Hepsi `whatsapp-proxy`ten geçer (Evolution anahtarı sunucuda kalır).
// Biçim ve kararlar saf katmanda: `waLink.ts`. Hiçbiri fırlatmaz; ekran her
// hâlde bir şey çizebilmeli.

import { supabase } from './supabase';
import { resolveOrg } from './managerSource';
import { waResultOf } from './actionPill.ts';
import { codeHalves, healthOf, pairNumberOf, type TestResult, type WaHealth } from './waLink.ts';

async function proxy(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    try {
        const choice = await resolveOrg();
        const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
            // Çok üyeli hesapta sunucu salonu tahmin etmesin.
            body: { ...body, orgId: choice.ok ? choice.id : undefined },
        });
        if (error) return null;
        return (data ?? null) as Record<string, unknown> | null;
    } catch {
        return null;
    }
}

/**
 * Sayfanın verisi. `live`: sunucu Evolution'a hattın gerçek durumunu sorar
 * (veritabanındaki "bağlı" bir sonraki gönderime kadar bayat kalabilir).
 * Okunamazsa `null` — sayfa "okunamadı" der, "bağlı değil" demez.
 */
export async function fetchWaHealth(live = true): Promise<WaHealth | null> {
    return healthOf(await proxy({ action: 'health', live }));
}

/** İşletme profilindeki telefon (masaüstü Ayarlar → İşletme). D1'in ilk değeri. */
export async function fetchPublicPhone(): Promise<string | null> {
    try {
        const choice = await resolveOrg();
        if (!choice.ok) return null;
        const { data } = await supabase.from('organizations').select('public_phone')
            .eq('id', choice.id).maybeSingle()
            .returns<{ public_phone?: string | null } | null>();
        return data?.public_phone ?? null;
    } catch {
        return null;
    }
}

export type PairStart =
    | { kind: 'code'; code: string }
    | { kind: 'qr'; qr: string }
    | { kind: 'connected' }
    | { kind: 'failed' };

/** "Kodu al" — numarayla bağlama kodu (D1 → D2; gelmezse H3). */
export async function requestPairCode(numberText: string): Promise<PairStart> {
    const number = pairNumberOf(numberText);
    if (!number) return { kind: 'failed' };
    const r = await proxy({ action: 'connect', number });
    if (r?.connected === true) return { kind: 'connected' };
    const halves = codeHalves(typeof r?.code === 'string' ? r.code : null);
    return halves ? { kind: 'code', code: halves.join('') } : { kind: 'failed' };
}

/** QR — başka telefonla okutmak için (E). */
export async function requestQr(): Promise<PairStart> {
    const r = await proxy({ action: 'connect' });
    if (r?.connected === true) return { kind: 'connected' };
    return typeof r?.qr === 'string' && r.qr ? { kind: 'qr', qr: qrUri(r.qr) } : { kind: 'failed' };
}

function qrUri(qr: string): string {
    return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}

export interface LinkPoll {
    /** Sunucuya ulaşıldı mı — ulaşılamayan yoklama "bağlanmadı" sayılmaz. */
    reached: boolean;
    connected: boolean;
    /** Evolution durumu: 'connecting' bekleniyor; 'close' kodun/QR'ın ömrü bitti. */
    state: string | null;
    code: string | null;
    qr: string | null;
}

/** Bekleme yoklaması (D2, D3, E): her 3 sn. Güncel kodu/QR'ı da getirir. */
export async function pollLink(): Promise<LinkPoll> {
    const r = await proxy({ action: 'state', withCode: true });
    if (!r || typeof r.state !== 'string') return { reached: false, connected: false, state: null, code: null, qr: null };
    const halves = codeHalves(typeof r.code === 'string' ? r.code : null);
    return {
        reached: true,
        connected: r.connected === true,
        state: r.state,
        code: halves ? halves.join('') : null,
        qr: typeof r.qr === 'string' && r.qr ? qrUri(r.qr) : null,
    };
}

/** Bağlantıyı kes. Telefondaki WhatsApp'ın Bağlı Cihazlar listesinden de düşer. */
export async function disconnectWa(): Promise<boolean> {
    const r = await proxy({ action: 'disconnect' });
    return r?.ok === true;
}

/** Test mesajı — müdürün yazdığı numaraya, hatırlatmalarla aynı hattan (`manual`). */
export async function sendWaTest(phone: string, text: string): Promise<TestResult> {
    const r = await proxy({ action: 'send', phone, text, kind: 'manual' });
    return waResultOf(r as { ok?: boolean; reason?: string; queued?: boolean } | null);
}
