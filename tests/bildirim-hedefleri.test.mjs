/**
 * BİLDİRİME DOKUNUNCA DOĞRU EKRAN (2026-10-14, kullanıcının notu 1).
 *
 * Kararlar (soru-cevapla): müdür ve tek kişilik randevu bildirimleri randevu
 * kartını; "Adisyon kasada" Kasa'yı tahsil edilmedi listesi açık (ekipte
 * seçilen Akış'ta); personel her şeyi Bugün'de; bekleme bitti o işin
 * kumandasını açıyor. Tek kişiliğe "Sıradaki randevun yaklaşıyor" de gidiyor.
 * Bildirimde yalnız ilk ad (karar 2) WhatsApp ve "randevumu yönet" kaynaklı
 * bildirimlere de uygulandı.
 *
 * Saf karar `pushRoute.pushTargetOf` (`mobil-push-karar.test.mjs`); burada
 * ekranların ve sunucunun ona uyduğu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pendingHint } from '../mobile/src/lib/managerFlow.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── Kasa: liste açık ────────────────────────────────────────────────────────

test('Kasa: bildirimden gelince liste günün okuması gelince BİR KEZ açılıyor', () => {
    const cash = read('mobile/app/mudur/cash.tsx');
    assert.match(cash, /useLocalSearchParams<\{ bekleyen\?: string \}>\(\)/);
    assert.match(cash, /if \(params\.bekleyen !== '1' \|\| dayState !== 'ok'\) return;\s*router\.setParams\(\{ bekleyen: undefined \}\);\s*if \(tickets\.length > 0\) openPendingList\(\);/);
});

test('Kasa: listeden seçilen tek kişilikte tahsilat adımı, ekipte Akış\'taki satırı', () => {
    const cash = read('mobile/app/mudur/cash.tsx');
    assert.match(cash, /opensIn: solo \? 'collect' : 'flow',\s*onPick: solo \? openTicket : focusInFlow,/);
    assert.match(cash, /pathname: '\/mudur',\s*params: \{ focus: ticket\.appointmentId, \.\.\.\(ticket\.dateISO \? \{ date: ticket\.dateISO \} : \{\}\) \},/);
    // Liste kendi cümlesini kipine göre söylüyor.
    assert.equal(pendingHint('collect'), 'Dokunduğunuz adisyon tahsilat adımında açılır.');
    assert.equal(pendingHint('flow'), "Dokunduğunuz adisyon Akış'ta, kendi satırında açılır.");
    const sheet = read('mobile/src/components/PendingTicketsSheet.tsx');
    assert.match(sheet, /\{pendingHint\(opensIn\)\}/);
    assert.match(read('mobile/app/(manager-flow)/kasa/bekleyen.tsx'), /opensIn=\{sheet\.opensIn\}/);
});

// ── Akış: adisyona git ──────────────────────────────────────────────────────

test('Akış: istenen adisyonun satırına kaydırıyor — gün değişiyorsa önce gün, istek bir kez', () => {
    const flow = read('mobile/app/mudur/index.tsx');
    assert.match(flow, /useLocalSearchParams<\{ focus\?: string; date\?: string \}>\(\)/);
    assert.match(flow, /if \(date && date !== selectedISO\) goToDay\(date\);/);
    assert.match(flow, /router\.setParams\(\{ focus: undefined, date: undefined \}\);/);
    // Şimdi-çizgisine atlama isteği ezmiyor.
    assert.match(flow, /focusRef\.current = focus;\s*\/\/[^\n]*\n\s*jumped\.current = true;/);
    // Önce bekleyen adisyonun kendi satırı.
    assert.match(flow, /event\.appointmentId === focus && event\.kind === 'due'/);
    // Satırlar çizildikçe yeniden deneniyor.
    assert.equal((flow.match(/jumpToNow\(\);\s*focusRow\(\);/g) ?? []).length, 2);
    // Vurgu `freshId` ile yapılmıyor — o satırda geri almayı açardı.
    const block = flow.slice(flow.indexOf('const focusRow = useCallback'), flow.indexOf('useEffect(() => { focusRow(); }, [focusRow]);'));
    assert.doesNotMatch(block, /setFreshId/);
});

// ── Sunucu ──────────────────────────────────────────────────────────────────

test('bildirimde yalnız ilk ad — WhatsApp ve "randevumu yönet" de; numara kilit ekranına çıkmıyor', () => {
    const notify = read('supabase/functions/_shared/notify.ts');
    assert.match(notify, /export function firstNameOf\(full: string \| null \| undefined\): string \{\s*return String\(full \?\? ''\)\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \|\| 'Müşteri';/);
    const bodies = [read('supabase/functions/booking-manage/index.ts'), read('supabase/functions/whatsapp-booking/index.ts')]
        .flatMap((src) => [...src.matchAll(/body: `([^`]*)`/g)].map((m) => m[1]));
    // 2026-10-28: yeni randevu ve iptal bildirimleri buradan kalktı (müdüre
    // tetikleyici gönderiyor, çift push'tu); kalanlar erteleme ve devir.
    assert.ok(bodies.length >= 3, `bildirim gövdesi bulunamadı (${bodies.length})`);
    for (const body of bodies) {
        assert.match(body, /^\$\{firstNameOf\(/, body);
        assert.doesNotMatch(body, /\?\? phone/, body);
    }
});

test('ortak modüle yalnız EKLENDİ — remind\'ı kıran türden ad değişikliği yok', () => {
    // `_shared` her deploy'da kopyalanıyor; eski dışa aktarımlar yerinde olmalı.
    const notify = read('supabase/functions/_shared/notify.ts');
    assert.match(notify, /export async function notifyOwner\(/);
    assert.match(notify, /export async function announceFreedSlot\(/);
});

test('tek kişilikte "Sıradaki randevun yaklaşıyor" sahibin müdür kaydına gidiyor', () => {
    const remind = read('supabase/functions/remind/index.ts');
    assert.match(remind, /from\('organizations'\)\.select\('id'\)\.in\('id', soonOrgs\)\.eq\('solo', true\)/);
    assert.match(remind, /target: soloOrgs\.has\(r\.organization_id\)\s*\? \{ role: 'manager' \}\s*: \{ staffId: r\.staff_id \},/);
    // Etiket randevuyu taşıyor — dokununca kart.
    assert.match(remind, /tag: `soon-\$\{r\.id\}`/);
});

test('118: personel bildirimi randevunun GÜNÜNÜ taşıyor; müdür olayları ve 116 koşulu aynı', () => {
    const m = read('supabase/118_personel_bildirim_gunu.sql');
    for (const [url, tag] of [
        ["'/calendar?date=' || NEW.date::text", 'assign'],
        ["'/personel?date=' || NEW.date::text", 'arrived'],
        ["'/personel?date=' || NEW.date::text", 'cancel'],
        ["'/personel?date=' || NEW.date::text", 'moved'],
    ]) {
        const at = m.indexOf(`'tag',   '${tag}-'`);
        assert.ok(at > 0, tag);
        assert.ok(m.slice(at - 120, at).includes(`'url',   ${url},`), `${tag} adresi günü taşımıyor`);
    }
    // Müdür olayları değişmedi; 116'nın tek kişilik koşulu duruyor.
    assert.equal((m.match(/'url',   '\/calendar',/g) ?? []).length, 2);
    assert.match(m, /'url',   '\/kasa',/);
    assert.match(m, /AND NOT v_solo/);
    assert.match(m, /AND NOT v_self/);
    assert.match(m, /^BEGIN;/m);
    assert.match(m, /^COMMIT;/m);
    assert.match(read('supabase/tests/personel_bildirim_gunu_regression.sql'), /personel bildirim günü \(118\) regression: ok/);
});
