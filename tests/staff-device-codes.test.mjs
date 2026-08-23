import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Cihaz eşleştirme kodu — personelin kendi telefonunu bağlama yolu.
//
// Bu dosyanın koruduğu şey: kodun bir kimlik belgesi olmadığı. Kod yalnız
// "bu telefonu şu işletmeye bağla" der; veriye erişim hâlâ PIN'in arkasında.
// Buna rağmen kod ele geçerse saldırgan personel listesini görüp PIN denemeye
// başlayabilir — bu yüzden kısa ömürlü, tek kullanımlık ve hash'li.

const api = readFileSync(
    new URL('../supabase/functions/staff-api/index.ts', import.meta.url),
    'utf8',
);
const migration = readFileSync(
    new URL('../supabase/091_staff_device_codes.sql', import.meta.url),
    'utf8',
);

const block = (name) => {
    const start = api.indexOf(`if (action === '${name}')`);
    assert.ok(start > 0, `${name} bloğu yok`);
    const rest = api.slice(start + 1);
    const next = rest.indexOf('if (action === ');
    return next > 0 ? rest.slice(0, next) : rest;
};

// ── Kod üretimi ─────────────────────────────────────────────────────────────

test('kod üretmek cihaz yetkilendirmenin uzaktan hâlidir: personel üretemez', () => {
    // device.pair ile aynı kapı. Personel kendine kod üretebilseydi,
    // eşleştirmenin sahibe bağlı olmasının anlamı kalmazdı.
    const create = block('device.code.create');
    assert.match(create, /admin\.auth\.getUser\(jwt\)/);
    assert.match(create, /resolved\.role === 'member'.*owner_required/s);
});

test('kod açık saklanmaz', () => {
    // Veritabanını okuyabilen biri bekleyen kodları kullanamamalı.
    assert.match(api, /code_hash: await hashPin\(code\)/);
    assert.match(migration, /code_hash text not null/);
    assert.doesNotMatch(migration, /\bcode text not null\b/);
});

test('kod tahmin edilemez üretilir', () => {
    // Math.random altı hanelik bir uzayda tek başına kırılma sebebidir.
    assert.match(api, /crypto\.getRandomValues\(buf\)/);
    const code = api.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, /Math\.random/);
    // Modulo sapması: aralık dışına düşen değer yeniden çekilir.
    assert.match(api, /while \(buf\[0\] >= limit\)/);
});

test('kod on dakika yaşar ve tek kullanımlıktır', () => {
    assert.match(api, /const PAIR_CODE_TTL_MINUTES = 10;/);
    assert.match(migration, /used_at timestamptz/);
    // Kısmi benzersiz indeks: aynı hash aynı anda iki kez açık duramaz.
    assert.match(migration, /create unique index[\s\S]*?\(code_hash\)\s*\n\s*where used_at is null/);
});

test('personele bağlı kod "kendini seç" adımını düşürür', () => {
    // Kadro listesi kişisel telefona hiç inmesin.
    assert.match(migration, /staff_id uuid references public\.staff\(id\)/);
    // Nullable: ortak tablet yolu aynı tabloyla, yeni migration gerekmeden yaşar.
    assert.doesNotMatch(migration, /staff_id uuid[^\n]*not null/);
    assert.match(block('device.code.redeem'), /staffId: row\.staff_id/);
});

test('kod yalnız aktif personele üretilir', () => {
    const create = block('device.code.create');
    assert.match(create, /\.eq\('organization_id', resolved\.orgId\)/);
    assert.match(create, /!member \|\| !member\.is_active/);
    assert.match(create, /UUID_RE\.test\(staffId\)/);
});

// ── Kod kullanımı ───────────────────────────────────────────────────────────

test('süresi dolmuş kod yanlış koddan AYRI cevap verir', () => {
    // Kullanıcı doğru yazdı, kod eskidi: çözüm onda değil, işletme sahibinde.
    // Aynı hatayı vermek onu aynı kodu tekrar yazmaya iterdi.
    const redeem = block('device.code.redeem');
    assert.match(redeem, /expired_pair_code/);
    assert.match(redeem, /invalid_pair_code/);
    assert.ok(
        redeem.indexOf('expired_pair_code') > redeem.indexOf('.maybeSingle()'),
        'süre kontrolü satır bulunduktan SONRA yapılmalı',
    );
});

test('süresi dolmuş kod deneme sayacını artırmaz', () => {
    // Doğru yazılmış bir kod kaba kuvvet denemesi değildir.
    const redeem = block('device.code.redeem');
    const start = redeem.indexOf('if (new Date(row.expires_at)');
    const end = redeem.indexOf('const access =');
    assert.ok(start > 0 && end > start, 'süre dalı bulunamadı');
    assert.doesNotMatch(redeem.slice(start, end), /failedPairAttempt/);
});

test('kod tek kullanımlık: yarış koşullu güncellemeyle çözülür', () => {
    // İki telefon aynı kodu aynı anda yazarsa yalnız biri satırı işaretleyebilir.
    const redeem = block('device.code.redeem');
    assert.match(redeem, /\.update\(\{ used_at[\s\S]*?\.is\('used_at', null\)/);
    assert.match(redeem, /if \(!claimed\)/);
});

test('aboneliği bitmiş işletmeye telefon bağlanmaz', () => {
    // Panelsiz ama telefonlu bir salon, abonelik kapısının etrafından dolaşmak olur.
    assert.match(block('device.code.redeem'), /checkAccess\(admin, row\.organization_id\)[\s\S]*?subscription_inactive/);
});

test('başarılı eşleşme sayacı temizler', () => {
    assert.match(block('device.code.redeem'), /clearPairAttempts\(admin, ip\)/);
});

// ── Kaba kuvvet ─────────────────────────────────────────────────────────────

test('kimlik yokken sayaç IP adresinde tutulur', () => {
    // PIN'de kimin denendiği belli (staff satırında sayaç), burada henüz kimlik yok.
    assert.match(migration, /create table if not exists public\.staff_pair_attempts/);
    assert.match(migration, /ip text primary key/);
    assert.match(api, /const PAIR_MAX_ATTEMPTS = 10;/);
    assert.match(api, /const PAIR_LOCK_MINUTES = 15;/);
});

test('kilit denemeden ÖNCE denetlenir', () => {
    const redeem = block('device.code.redeem');
    assert.ok(
        redeem.indexOf('pairAttemptLock') < redeem.indexOf('code_hash'),
        'kilitli IP kod aramasına hiç ulaşmamalı',
    );
    assert.match(redeem, /pair_locked/);
});

test('eksik haneli kod da deneme sayılır', () => {
    // Aksi hâlde saldırgan beş haneli istekle sayacı atlatırdı.
    const redeem = block('device.code.redeem');
    assert.match(redeem, /digits\.length !== PAIR_CODE_LENGTH[\s\S]*?failedPairAttempt/);
});

// ── Yazma yetkisi ve denetim izi ────────────────────────────────────────────

test('istemci kendine kod yazamaz', () => {
    // Yalnız okuma politikası var; insert/update service_role ile.
    assert.match(migration, /create policy staff_device_codes_select[\s\S]*?for select/);
    assert.doesNotMatch(migration, /for insert|for update|for all/);
    assert.match(migration, /alter table public\.staff_device_codes enable row level security/);
});

test('deneme tablosuna istemci hiç erişemez', () => {
    assert.match(migration, /alter table public\.staff_pair_attempts enable row level security/);
    const attempts = migration.slice(migration.indexOf('staff_pair_attempts'));
    assert.doesNotMatch(attempts, /create policy staff_pair_attempts/);
});

test('eşleştirme denetim izine yazılır', () => {
    // "Bu telefon ne zaman, kim tarafından bağlandı" sorusunun tek cevabı.
    assert.match(migration, /'pair_code_created', 'paired', 'failed_pair', 'pair_locked'/);
    assert.match(block('device.code.create'), /audit\([^)]*'pair_code_created'\)/);
    assert.match(block('device.code.redeem'), /audit\([^)]*'paired'\)/);
});

test('denetim kısıtı önceki migrationların olaylarını düşürmez', () => {
    // Bu kısıt bir LİSTEDİR, ekleme yapılamaz: her migration tamamını yeniden
    // yazar. 091, 090'ın ziyaret olaylarını saymazsa staff-api'nin
    // visit.start/finish kayıtları reddedilir ve denetim izi sessizce kopar.
    const previous = readFileSync(
        new URL('../supabase/090_staff_visit_hardening.sql', import.meta.url),
        'utf8',
    );
    const events = (sql) => {
        const check = sql.slice(sql.lastIndexOf('staff_auth_log_event_check'));
        return new Set([...check.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]));
    };
    const before = events(previous);
    const after = events(migration);
    for (const event of before) {
        assert.ok(after.has(event), `091, ${event} olayını düşürüyor`);
    }
});

test('device.pair kaldırılmadı: ortak tablet yolu yaşıyor', () => {
    assert.match(api, /if \(action === 'device\.pair'\)/);
});
