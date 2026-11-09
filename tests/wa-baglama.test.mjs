/**
 * Müdür 37 · telefondan WhatsApp bağlama — sunucu tarafı (2026-11-10).
 *
 * whatsapp-proxy: connect + number → 8 karakterlik bağlama kodu; state +
 * withCode → güncel kod/QR; health → sayfanın durumu (link, inboundBroken,
 * connectedAt, lastFailure). Biçimlendirme _shared/waLink.ts'te, saf.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    failureKind, inboundBroken, lastFailure, linkState, pairingCodeOf, qrCountOf, qrImageOf,
} from '../supabase/functions/_shared/waLink.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const proxy = read('supabase/functions/whatsapp-proxy/index.ts');

test('bağlama kodu: create (qrcode içinde) ve connect (düz) biçimi, tire ve küçük harf temizlenir', () => {
    assert.equal(pairingCodeOf({ qrcode: { pairingCode: 'K7RM2P4X', code: '2@abc', base64: 'data:image/png;base64,xx' } }), 'K7RM2P4X');
    assert.equal(pairingCodeOf({ pairingCode: 'k7rm-2p4x', code: '2@abc', count: 1 }), 'K7RM2P4X');
    assert.equal(pairingCodeOf({ pairingCode: null, code: '2@abc' }), null);
    assert.equal(pairingCodeOf({ pairingCode: 'K7RM2P' }), null, 'yarım kod gösterilmez');
    assert.equal(pairingCodeOf(null), null);
    assert.equal(pairingCodeOf({ instance: { state: 'open' } }), null);
});

test('QR görseli: data URL ya da öneksiz base64; ham QR metni (code) görsel sayılmaz', () => {
    const b64 = 'A'.repeat(120);
    assert.equal(qrImageOf({ base64: 'data:image/png;base64,iVBOR' }), 'data:image/png;base64,iVBOR');
    assert.equal(qrImageOf({ qrcode: { base64: b64 } }), b64);
    assert.equal(qrImageOf({ code: '2@Xyz,abc==,def==' }), null);
    assert.equal(qrImageOf({ base64: '' }), null);
    assert.equal(qrCountOf({ count: 3 }), 3);
    assert.equal(qrCountOf({ qrcode: { count: 1 } }), 1);
    assert.equal(qrCountOf({}), null);
});

test('sayfa durumu: bağlı / düştü / bağlı değil; yarım kalan bağlama alarm sayılmaz', () => {
    assert.equal(linkState({ status: 'connected', last_error: null }), 'connected');
    assert.equal(linkState({ status: 'disconnected', last_error: 'state:close' }), 'dropped');
    assert.equal(linkState({ status: 'disconnected', last_error: 'http_401' }), 'dropped');
    assert.equal(linkState({ status: 'disconnected', last_error: null }), 'off', 'sahip kesti');
    assert.equal(linkState({ status: 'connecting', last_error: null }), 'off');
    assert.equal(linkState({}), 'off');
});

test('gelen mesaj işlenmiyor: yalnız bağlıyken ve webhook hatasıyla', () => {
    assert.equal(inboundBroken({ status: 'connected', last_error: 'webhook: Evolution webhook/set → HTTP 500' }), true);
    assert.equal(inboundBroken({ status: 'connected', last_error: null }), false);
    assert.equal(inboundBroken({ status: 'disconnected', last_error: 'webhook: x' }), false);
});

test('son hata: yalnız başarısız gidiş; atlananlar (DUR, kota) hata değil; ham metin türe iner', () => {
    const rows = [
        { direction: 'in', status: 'received', error: null, created_at: '2026-11-10T09:00:00Z' },
        { direction: 'out', status: 'skipped', error: 'opt_out', created_at: '2026-11-10T08:50:00Z' },
        { direction: 'out', status: 'failed', kind: 'reminder_24h', error: 'http_400', created_at: '2026-11-10T07:12:00Z' },
        { direction: 'out', status: 'failed', error: 'http_500', created_at: '2026-11-10T06:00:00Z' },
    ];
    assert.deepEqual(lastFailure(rows), { kind: 'invalid_phone', at: '2026-11-10T07:12:00Z', message: 'reminder_24h' });
    assert.equal(lastFailure(rows.slice(0, 2)), null);
    assert.equal(failureKind('http_401'), 'session');
    assert.equal(failureKind('http_404'), 'session');
    assert.equal(failureKind('http_429'), 'busy');
    assert.equal(failureKind('retry_exhausted'), 'busy');
    assert.equal(failureKind('TimeoutError: Signal timed out.'), 'network');
    assert.equal(failureKind('not_connected'), 'not_connected');
    assert.equal(failureKind('invalid_phone'), 'invalid_phone');
    assert.equal(failureKind('evolution_not_configured'), 'other');
    assert.equal(failureKind(null), 'other');
});

test('proxy: numara doğrulanır, kod yolu hattı numarayla yeniden kurar, member bağlayamaz', () => {
    assert.match(proxy, /normalizePhone\(String\(body\.number\)\)/);
    assert.match(proxy, /return json\(\{ error: 'invalid_number' \}, 400\)/);
    assert.match(proxy, /pairWithCode\(admin, orgId, org, evo, instance, pairNumber\)/);
    assert.match(proxy, /instance\/delete\/\$\{instance\}[\s\S]{0,400}instance\/create[\s\S]{0,300}number \}\)/);
    // Açık hat silinmez: kod yolu ancak 'open' kontrolünden SONRA.
    assert.ok(proxy.indexOf("if (existing === 'open')") < proxy.indexOf('if (pairNumber) {'));
    assert.match(proxy, /action === 'connect' \|\| action === 'disconnect'[^\n]*role === 'member'/);
});

test('proxy: kod tazeleme yalnız connecting iken (close\'da numarasız yeni oturum açardı)', () => {
    assert.match(proxy, /body\.withCode === true && state === 'connecting'/);
    assert.match(proxy, /fetchConnect\(evo\.url, evo\.headers, instance, state === 'close' \? number : undefined\)/);
});

test('proxy: health sayfa alanlarını taşır, live iken önce gerçek durumu okur', () => {
    for (const k of ['link: linkState(o)', 'inboundBroken: inboundBroken(o)', 'connectedAt:', 'lastFailure: lastFailure(rows)', 'lastError:']) {
        assert.ok(proxy.includes(k), k);
    }
    assert.match(proxy, /canManage: role !== 'member'/);
    assert.match(proxy, /body\.live === true[\s\S]{0,160}syncState\(admin, orgId, org, evo, instance\)/);
});
