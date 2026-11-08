/**
 * Gizli kimlik (…@lid) → numara, sohbet geçmişinden (canlı 2026-11-09).
 *
 * Hat yeniden bağlanınca bazı sohbetlerin yeni mesajları numarasız geliyor ve
 * Evolution'ın numara ön belleği de bilmiyor; mesaj "gizli kimlik çözülemedi"
 * ile düşüyordu. Canlıda 4 gizli kimlikli sohbetin 4'ünde de eski mesajlarda
 * numara (`remoteJidAlt`) saklıydı.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { phoneJidFromHistory } from '../supabase/functions/_shared/booking/intent.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('geçmişte numarası saklı ilk mesaj bulunur (canlıdaki biçim: yeni mesaj numarasız)', () => {
    const canli = { messages: { total: 23, records: [
        { key: { id: 'a', fromMe: false, remoteJid: '111@lid', participant: '', addressingMode: 'lid' }, messageTimestamp: 1794176049 },
        { key: { id: 'b', fromMe: true, remoteJid: '111@lid', participant: '', addressingMode: 'lid' }, messageTimestamp: 1794170000 },
        { key: { id: 'c', fromMe: false, remoteJid: '111@lid', remoteJidAlt: '905524740440@s.whatsapp.net', addressingMode: 'lid' }, messageTimestamp: 1793225807 },
    ] } };
    assert.equal(phoneJidFromHistory(canli), '905524740440@s.whatsapp.net');
    // senderPn, participantAlt ve cihaz ekli numara da okunur.
    assert.equal(phoneJidFromHistory({ messages: { records: [{ key: { remoteJid: '1@lid' }, senderPn: '905551112233@s.whatsapp.net' }] } }), '905551112233@s.whatsapp.net');
    assert.equal(phoneJidFromHistory({ messages: { records: [{ key: { remoteJid: '1@lid', participantAlt: '905551112233:12@s.whatsapp.net' } }] } }), '905551112233@s.whatsapp.net');
    assert.equal(phoneJidFromHistory([{ key: { remoteJidAlt: '905551112233@s.whatsapp.net' } }]), '905551112233@s.whatsapp.net');
});

test('numara yoksa ya da cevap bozuksa boş döner (mesaj eskisi gibi geçilir)', () => {
    for (const bad of [null, 'x', {}, { messages: 'x' }, { messages: { records: [{ key: { remoteJid: '1@lid', participant: '' } }] } }, [{ key: { remoteJid: '2@lid', participant: '3@lid' } }]]) {
        assert.equal(phoneJidFromHistory(bad), '', JSON.stringify(bad));
    }
});

test('lidToPhone: önce numara ön belleği, bilmiyorsa sohbet geçmişi; ikisi de zaman aşımlı', () => {
    const wa = read('supabase/functions/_shared/wa.ts');
    const fn = wa.slice(wa.indexOf('export async function lidToPhone'), wa.indexOf('async function deliver'));
    const cache = fn.indexOf('/chat/whatsappNumbers/');
    const history = fn.indexOf('/chat/findMessages/');
    assert.ok(cache > 0 && history > cache, 'sıra: ön bellek → geçmiş');
    assert.equal((fn.match(/AbortSignal\.timeout\(8000\)/g) ?? []).length, 2);
    assert.match(fn, /phoneJidFromHistory\(await res\.json\(\)\.catch\(\(\) => null\)\)/);
    // Bulunan numara whatsapp-booking'de wa_lid_map'e yazılır: bir sonraki mesaj sorgusuz.
    assert.match(read('supabase/functions/whatsapp-booking/index.ts'), /const phone = await lidToPhone\(admin, orgWa, lid\);[\s\S]{0,200}wa_lid_map/);
});
