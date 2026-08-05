import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Login gerektirmeyen (public-booking) ve tenant sınırında duran (whatsapp-proxy)
// edge function'ların güvenlik sözleşmesi. Bu dosya davranışı değil, sözleşmenin
// KODDA DURDUĞUNU doğrular: yamaların bir refactor sırasında sessizce geri
// alınması satışa çıkmış bir üründe fark edilmez.

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const publicBooking = read('../supabase/functions/public-booking/index.ts');
const whatsappProxy = read('../supabase/functions/whatsapp-proxy/index.ts');
const wa = read('../supabase/functions/_shared/wa.ts');
const orgHelper = read('../supabase/functions/_shared/org.ts');
const migration = read('../supabase/072_customer_unique_phone.sql');

test('public booking throttles anonymous writes on every path', () => {
  // Fren tanımlı ve iki tavan da var
  assert.match(publicBooking, /ABUSE_PER_PHONE_DAILY = \d+/);
  assert.match(publicBooking, /ABUSE_PER_ORG_HOURLY = \d+/);
  assert.match(publicBooking, /async function bookingAbuseCheck/);

  // Yazan üç yolun (tekli book, çoklu book, waitlist) hepsi frenden geçer
  const guardCalls = publicBooking.match(/await bookingAbuseCheck\(/g) ?? [];
  assert.equal(guardCalls.length, 3, 'book, çoklu book ve waitlist frenden geçmeli');
  assert.match(publicBooking, /json\(\{ error: abuseMsg \}, 429\)/);

  // Sayım birimi SATIR DEĞİL İŞLEM. Sepetle 3 hizmet alan müşteri 3 satır
  // yazar; satır saymak onu 24 saat kilitler. Aynı group_id tek işlemdir.
  assert.match(publicBooking, /groups\.add\(row\.group_id\)/);
  assert.match(publicBooking, /const phoneEvents = groups\.size \+ solo/);
  assert.match(publicBooking, /phoneEvents >= ABUSE_PER_PHONE_DAILY/);
});

test('public booking never leaks internal error detail', () => {
  // Eski hali: json({ error: 'Sunucu hatası', detail: String(err) }, 500)
  assert.doesNotMatch(publicBooking, /detail: String\(err\)/);
  assert.match(publicBooking, /console\.error\('public-booking error:', err\)/);
  assert.doesNotMatch(whatsappProxy, /json\(\{ error: String\(e\) \}, 500\)/);
});

test('customer creation is race safe against concurrent bookings', () => {
  // Kısmi UNIQUE indeks + uygulama tarafında 23505 fallback'i birlikte anlamlı
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_org_phone_active/);
  assert.match(migration, /ON public\.customers \(organization_id, phone\)/);
  assert.match(migration, /WHERE is_active AND phone <> ''/);

  assert.match(publicBooking, /async function findOrCreateCustomer/);
  assert.match(publicBooking, /createErr\?\.code === '23505'/);
  // Tek yardımcı iki book yolunda da kullanılır; kopyalanmış lookup+insert kalmamalı
  const helperCalls = publicBooking.match(/await findOrCreateCustomer\(/g) ?? [];
  assert.equal(helperCalls.length, 2);
});

test('duplicate cleanup never moves financial records', () => {
  // Referans taraması katalogdan: yeni modül FK eklediğinde kendiliğinden kapsar
  assert.match(migration, /confrelid = 'public\.customers'::regclass/);

  // Migration YALNIZCA is_active'i düşürür; hiçbir alt tabloda customer_id
  // yeniden yazılmaz. 061'in bütünlük trigger'ı bir planın hastasını, ödemesi
  // varken değiştirmeyi zaten reddediyor — script bunu delmeye çalışmamalı.
  assert.doesNotMatch(migration, /SET customer_id =/);
  assert.doesNotMatch(migration, /DISABLE TRIGGER/i);
  assert.doesNotMatch(migration, /session_replication_role/i);

  // Otomatik çözülemeyen durumda sessizce devam etmek yerine hata verir
  assert.match(migration, /customer_merge_needs_human_decision/);
  assert.match(migration, /AND NOT m\.has_data/);
});

test('tenant resolution is unambiguous and role gated', () => {
  // Eski desen: organization_members … limit(1) → çoklu üyelikte RASTGELE org
  assert.doesNotMatch(whatsappProxy, /organization_members[\s\S]{0,200}?\.limit\(1\)/);
  assert.match(whatsappProxy, /resolveOrg\(admin, userId, body\.orgId \?\? null\)/);

  assert.match(orgHelper, /if \(memberships\.length > 1\) return \{ error: 'org_id_required'/);
  assert.match(orgHelper, /if \(!m\) return \{ error: 'forbidden_org', status: 403 \}/);

  // Yıkıcı action'lar org sahibinin kararı
  assert.match(
    whatsappProxy,
    /action === 'connect' \|\| action === 'disconnect' \|\| action === 'features'[\s\S]{0,80}role === 'member'/,
  );
  assert.match(whatsappProxy, /json\(\{ error: 'owner_required' \}, 403\)/);
});

test('whatsapp send retries transient failures only', () => {
  assert.match(wa, /for \(let attempt = 0; attempt < 2; attempt\+\+\)/);
  // Kalıcı 4xx'te retry yok; 429 ve 5xx retry'lanır
  assert.match(wa, /if \(res\.status < 500 && res\.status !== 429\) break/);
  // Oturum düşmesi hâlâ bağlantıyı disconnected işaretler (fallback korunuyor).
  // 079 ile ham gönderim `deliver()`e taşındı; org id oraya parametreyle geçiyor.
  assert.match(wa, /await markDisconnected\(admin, o\.orgId, errText\)/);
});
