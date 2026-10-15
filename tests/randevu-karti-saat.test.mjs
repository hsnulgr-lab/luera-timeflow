/**
 * Randevu kartının durum saati YEREL saat (2026-10-16, telefonda bulundu).
 *
 * 00:19'da tahsil edilen iş kartta "Tamamlandı · 21:19'de bitti" diyordu:
 * sunucu damgayı UTC dönüyor ("…T21:19:00+00:00") ve `stateLine` saati
 * ISO dizgesinden kesip (`slice(11, 16)`) yazıyordu — üç saat geri. Kumanda
 * aynı işi "09:00 – 00:18" diye doğru gösteriyordu (tarih nesnesinden).
 */
process.env.TZ = 'Europe/Istanbul';

import test from 'node:test';
import assert from 'node:assert/strict';

const { stateLine } = await import('../mobile/src/lib/appointmentDetail.ts');

const base = {
    id: 'a1', customer_id: null, customer_name: 'Hasan', customer_phone: null,
    date: '2026-10-16', start_time: '09:00:00', end_time: '09:30:00',
    service: 'deneme bakım', status: 'completed', staff_id: null, notes: null,
    customer_arrived_at: null, arrived_at: null, service_ended_at: null,
};

test('UTC damga İstanbul saatiyle yazılıyor', () => {
    const done = stateLine({ ...base, service_ended_at: '2026-10-15T21:19:00.412+00:00' }, 600);
    assert.equal(done.context, '00:19’de bitti');
    const running = stateLine({ ...base, status: 'confirmed', arrived_at: '2026-10-16T06:05:00Z' }, 600);
    assert.equal(running.context, '09:05’de başladı');
});

test('ofsetli damga ve saat sütunu bozulmuyor', () => {
    assert.equal(stateLine({ ...base, service_ended_at: '2026-10-16T10:32:00+03:00' }, 600).context, '10:32’de bitti');
    // Saat sütunu ("10:32:00") olduğu gibi — zaman dilimi yok, dönüştürülmez.
    assert.equal(stateLine({ ...base, status: 'confirmed', customer_arrived_at: '09:38:00' }, 600).context, '09:38’de geldi');
    // Çözülemeyen damga uydurulmuyor.
    assert.equal(stateLine({ ...base, service_ended_at: 'bozuk' }, 600).context, null);
});
