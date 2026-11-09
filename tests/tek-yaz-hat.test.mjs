/**
 * Tek kişilik Gün · "Yaz" işletmenin hattından (2026-11-10, Müdür 37 sonrası).
 *
 * Hat bağlıysa mesaj işletmenin hattından gider (Akış'ın "Yaz"ıyla aynı kapı,
 * `manual`); bağlı değilse ya da durum okunamadıysa kişinin kendi WhatsApp'ı
 * hazır metinle açılır. Asıl sebep: elle yazılan mesaj sunucuda "sahip
 * devraldı" sayılıp o müşterinin asistanını duraklatıyordu.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    SOLO_SENT_NOTE_MS, soloSentNote, soloWaFail, soloWaRoute, withSentNotes,
} from '../mobile/src/lib/soloDay.ts';

const screen = readFileSync(new URL('../mobile/app/tek/index.tsx', import.meta.url), 'utf8');

test('yol: yalnız hat KESİN bağlıysa işletmenin hattı; bilinmiyorsa kendi WhatsApp\'ı', () => {
    assert.equal(soloWaRoute(true), 'line');
    assert.equal(soloWaRoute(false), 'own');
    assert.equal(soloWaRoute(null), 'own');
});

test('gönderilemeyince: sebep söylenir; kendi WhatsApp\'ı yalnız işe yarayacaksa önerilir', () => {
    assert.equal(soloWaFail('ok'), null);
    assert.equal(soloWaFail('queued'), null);
    assert.equal(soloWaFail('not_connected').fallback, true);
    assert.equal(soloWaFail('failed').fallback, true);
    assert.equal(soloWaFail('invalid_phone').fallback, false);
    assert.equal(soloWaFail('opt_out').fallback, false, 'mesaj istemeyene başka yoldan yazılmaz');
    assert.match(soloWaFail('opt_out').body, /istemediğini/);
});

test('kart notu: iki dakika "yazıldı", sonra eski cümle', () => {
    const now = 1_000_000;
    assert.equal(soloSentNote(undefined, now), null);
    assert.equal(soloSentNote(now - 1000, now), 'WhatsApp\'tan yazıldı · şimdi');
    assert.equal(soloSentNote(now - 1000, now, true), 'WhatsApp · sıraya alındı, birazdan gider');
    assert.equal(soloSentNote(now - SOLO_SENT_NOTE_MS - 1, now), null);
    // Ekranın saati gönderimden geride olabilir (30 sn'lik tik): not yine çizilir.
    assert.equal(soloSentNote(now + 20_000, now), 'WhatsApp\'tan yazıldı · şimdi');
    const items = [
        { id: 'a', panel: { label: 'ŞU AN BOŞ', subText: '09:00\'a kadar', subName: 'Lukera' }, action: null, spoken: '', menu: null },
        { id: 'b', panel: { label: 'BAŞLAMAYA', subText: 'Zeynep · Ağda' }, action: null, spoken: '', menu: null },
    ];
    const out = withSentNotes(items, new Map([['a', { at: now, queued: false }]]), now);
    assert.equal(out[0].panel.subText, 'WhatsApp\'tan yazıldı · şimdi');
    assert.equal(out[0].panel.label, 'ŞU AN BOŞ', 'kartın kendisi değişmez');
    assert.equal(out[1], items[1], 'notu olmayan kart aynen kalır');
});

test('ekran: durum odakta okunur; hattan gönderim Akış\'ın kapısından; düşerse kendi WhatsApp\'ı önerilir', () => {
    assert.match(screen, /fetchWaLine\(\)\.then\(\s*\(line\) => \{ if \(alive\) setWaReady\(line\.ready\); \}/);
    assert.match(screen, /if \(soloWaRoute\(waReady\) === 'own'\) \{ openOwn\(\); return; \}/);
    assert.match(screen, /void sendWaNudge\(\{/);
    assert.match(screen, /\{ text: 'Kendi WhatsApp\\'ımdan yaz', onPress: openOwn \}/);
    assert.match(screen, /withSentNotes\(pickBase, sent, deviceNow\)/);
});
