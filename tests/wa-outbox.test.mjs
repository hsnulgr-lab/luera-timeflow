import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isTransient, nextAttemptAt, MAX_ATTEMPTS } from '../supabase/functions/_shared/wa.ts';

// Giden kuyruğu (079). Regresyon: gönderim tek istek içinde iki kez deneniyordu
// ve iki deneme de aynı saniyeye denk geldiği için kısa bir ağ kesintisi mesajı
// "failed" yazıp KAYBEDİYORDU — randevu hatırlatması bir daha gönderilmiyordu.

test('yalnız geçici hatalar yeniden denenir', () => {
    for (const err of ['http_429', 'http_500', 'http_502', 'http_503',
        'TypeError: Failed to fetch', 'connection reset']) {
        assert.equal(isTransient(err), true, err);
    }
});

test('kalıcı hatalar kuyruğa girmez', () => {
    // opt_out ve invalid_phone ısrar edilecek şeyler değil; not_connected zaten
    // 'skipped' yazılır; 4xx tekrar denense aynı sonucu verir.
    for (const err of ['http_400', 'http_401', 'http_403', 'http_404', 'http_422',
        'opt_out', 'invalid_phone', 'not_connected', 'quota:phone_daily',
        'evolution_not_configured']) {
        assert.equal(isTransient(err), false, err);
    }
    assert.equal(isTransient(null), false);
});

test('gecikme artar ve tavanda biter', () => {
    const first = nextAttemptAt(1);
    const second = nextAttemptAt(2);
    const third = nextAttemptAt(3);
    assert.ok(first && second && third);
    assert.ok(new Date(first) < new Date(second));
    assert.ok(new Date(second) < new Date(third));
    // Dördüncü deneme yok: geç hatırlatma hatırlatma değildir.
    assert.equal(nextAttemptAt(MAX_ATTEMPTS), null);
    assert.equal(MAX_ATTEMPTS, 4);
});

test('ilk gecikme 5 dakika — cron 30 dakikada bir çalıştığı için pratikte sonraki tur', () => {
    const at = new Date(nextAttemptAt(1)).getTime() - Date.now();
    assert.ok(at > 4 * 60_000 && at <= 5 * 60_000 + 1000, `${at}ms`);
});

// ── Kuyruğun sözleşmesi ─────────────────────────────────────────────────────
const wa = readFileSync(new URL('../supabase/functions/_shared/wa.ts', import.meta.url), 'utf8');
const remind = readFileSync(new URL('../supabase/functions/remind/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/079_wa_outbox.sql', import.meta.url), 'utf8');

test('kuyruk yeni log satırı açmaz, mevcut satırı günceller', () => {
    const drain = wa.slice(wa.indexOf('export async function drainOutbox'));
    assert.match(drain, /from\('wa_message_log'\)\s*\.update\(/);
    assert.doesNotMatch(drain, /from\('wa_message_log'\)\s*\.insert\(/,
        'kuyruk insert ederse tek hatırlatma kotada üç mesaj gibi görünür');
});

test('kuyruktaki mesaj gönderilmeden önce opt-out yeniden denetlenir', () => {
    const drain = wa.slice(wa.indexOf('export async function drainOutbox'));
    assert.match(drain, /isOptedOut\(/);
});

test('remind kuyruğu her turda boşaltır ve kuyruğa gireni "hallolmuş" sayar', () => {
    assert.match(remind, /drainOutbox\(supabase\)/);
    assert.match(remind, /res\.ok \|\| Boolean\(res\.queued\)/);
});

test('migration queued durumunu ve kısmi indeksi tanımlar', () => {
    assert.match(migration, /check \(status in \('sent', 'failed', 'skipped', 'queued'\)\)/);
    assert.match(migration, /create index if not exists idx_wa_log_queue[\s\S]*where status = 'queued'/);
    // View RLS'i çağırana göre uygulamalı, yoksa org'lar birbirinin kuyruğunu sayar
    assert.match(migration, /security_invoker = true/);
});
