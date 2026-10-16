import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    clampTypeSessions, doneFoldLabel, lastSession, packageBookRows, packageCounts, packageLine,
    packageSections, packageSummary, packageTypesOf, stepTypeSessions, typeLine, typePatchOf,
    typesSummary, typeValid,
} from '../mobile/src/lib/packageBook.ts';
import { formatTRY } from '../mobile/src/lib/customerCard.ts';

// Paketler (1.0.1) — Profil'de Müşteriler'in üstünde. Kullanıcı: "buraya bir
// paketler butonu koysak … müşterilerin üzerine" → "1.0.1'e ekle", "İkisi de"
// (satılan paketler + paket türleri).

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const profile = code(read('../mobile/app/mudur/profile.tsx'));
const book = code(read('../mobile/app/(manager-flow)/paketler.tsx'));
const types = code(read('../mobile/app/(manager-flow)/profil/paket-turleri.tsx'));
const source = code(read('../mobile/src/lib/managerSource.ts'));
const write = code(read('../mobile/src/lib/managerWrite.ts'));
const sheets = code(read('../mobile/src/components/ProfileSheets.tsx'));
const layout = code(read('../mobile/app/_layout.tsx'));

const plan = (over) => ({
    id: 'p1', customer_id: 'c1', customer_name: 'Vildan Ay', title: 'Ağda · 6 seans',
    total_amount: 3600, session_count: 6, sessions_done: 2, created_at: '2026-10-01T10:00:00Z',
    ...over,
});

// ── Sayılar kartla AYNI ─────────────────────────────────────────────────────

test('kalan = toplam − kullanılan; ödenmedi = bedel − O PAKETE bağlı tahsilat', () => {
    const [row] = packageBookRows([plan()], new Map([['p1', 1000]]));
    assert.equal(row.left, 4);
    assert.equal(row.owed, 2600);
    assert.equal(row.customerName, 'Vildan Ay');
    // Fazla ödeme borcu eksiye düşürmez; kullanılan toplamı aşamaz.
    const [over] = packageBookRows([plan({ sessions_done: 9 })], new Map([['p1', 5000]]));
    assert.equal(over.used, 6);
    assert.equal(over.left, 0);
    assert.equal(over.owed, 0);
});

test('adı okunamayan müşteri boş kalır — uydurulmaz', () => {
    const [row] = packageBookRows([plan({ customer_name: null })], new Map());
    assert.equal(row.customerName, '');
    assert.match(book, /row\.customerName \|\| 'Adı okunamadı'/);
});

// ── Bölümler ve sıra ────────────────────────────────────────────────────────

test('seansı bitmiş ama borcu duran paket AÇIK\'ta kalır — müdürün işi var', () => {
    const rows = packageBookRows([
        plan({ id: 'a', sessions_done: 6 }),
        plan({ id: 'b', sessions_done: 6, total_amount: 3600 }),
    ], new Map([['b', 3600]]));
    const { open, done } = packageSections(rows);
    assert.deepEqual(open.map((r) => r.planId), ['a']);
    assert.deepEqual(done.map((r) => r.planId), ['b']);
});

test('sıra iş sırası: önce ödenmeyen, sonra son seans, sonra öteki; her birinde en yeni üstte', () => {
    const paid = new Map([['quiet-old', 3600], ['quiet-new', 3600], ['last', 3600]]);
    const rows = packageBookRows([
        plan({ id: 'quiet-old', created_at: '2026-09-01' }),
        plan({ id: 'last', sessions_done: 5, created_at: '2026-08-01' }),
        plan({ id: 'owed', created_at: '2026-07-01' }),
        plan({ id: 'quiet-new', created_at: '2026-10-01' }),
    ], paid);
    assert.deepEqual(packageSections(rows).open.map((r) => r.planId), ['owed', 'last', 'quiet-new', 'quiet-old']);
});

test('"son seans" yalnız ÇOK seanslı pakette — tek seanslıkta hep yanardı', () => {
    assert.equal(lastSession({ total: 6, left: 1 }), true);
    assert.equal(lastSession({ total: 1, left: 1 }), false);
    assert.equal(lastSession({ total: 6, left: 2 }), false);
});

// ── Cümleler ────────────────────────────────────────────────────────────────

test('özet: "6 açık · 2 ödenmedi"; ödenmeyen yoksa yazılmaz; hiç yoksa "0" denmez', () => {
    assert.equal(packageSummary({ open: 6, owed: 2 }), '6 açık · 2 ödenmedi');
    assert.equal(packageSummary({ open: 3, owed: 0 }), '3 açık');
    assert.equal(packageSummary({ open: 0, owed: 1 }), '0 açık · 1 ödenmedi');
    assert.equal(packageSummary({ open: 0, owed: 0 }), 'Henüz açık paket yok');
});

test('sayım: açık = seansı süren; ödenmedi = borcu duran (bitmiş olsa da)', () => {
    assert.deepEqual(packageCounts([
        { left: 2, owed: 0 }, { left: 0, owed: 500 }, { left: 1, owed: 100 }, { left: 0, owed: 0 },
    ]), { open: 2, owed: 2 });
});

test('satır cümlesi: kalan · son seans · bitti', () => {
    assert.equal(packageLine({ title: 'Ağda · 6 seans', total: 6, left: 4 }), 'Ağda · 6 seans · 4 kaldı');
    assert.equal(packageLine({ title: 'Ağda · 6 seans', total: 6, left: 1 }), 'Ağda · 6 seans · son seans');
    assert.equal(packageLine({ title: 'Ağda · 6 seans', total: 6, left: 0 }), 'Ağda · 6 seans · bitti');
    assert.equal(packageLine({ title: 'Cilt bakımı', total: 1, left: 1 }), 'Cilt bakımı · 1 kaldı');
    assert.equal(doneFoldLabel(4), 'Bitenler · 4');
});

// ── Paket türleri ───────────────────────────────────────────────────────────

test('tür: ad ve sıfırdan büyük bedel zorunlu — ₺0 tür fark edilmeden bedava satış olurdu', () => {
    assert.equal(typeValid({ name: 'Lazer', price: 3600 }), true);
    assert.equal(typeValid({ name: '  ', price: 3600 }), false);
    assert.equal(typeValid({ name: 'Lazer', price: null }), false);
    assert.equal(typeValid({ name: 'Lazer', price: 0 }), false);
});

test('tür: seans 1–50 (069 kısıtı), bedel tam lira; renk ve geçerlilik YAZILMAZ', () => {
    assert.equal(clampTypeSessions(0), 1);
    assert.equal(clampTypeSessions(99), 50);
    assert.equal(stepTypeSessions(50, 1), 50);
    assert.equal(stepTypeSessions(1, -1), 1);
    assert.deepEqual(typePatchOf({ name: ' Lazer ', sessions: 70, price: 3600.4 }),
        { name: 'Lazer', session_count: 50, price: 3600 });
    assert.doesNotMatch(write, /savePackageType[\s\S]{0,1600}(color|validity_months)/);
});

test('tür satırı ve özeti', () => {
    assert.equal(typeLine({ sessions: 6, price: 3600 }, formatTRY), '6 seans · seans başı ₺600');
    assert.equal(typeLine({ sessions: 1, price: 900 }, formatTRY), 'Tek seans');
    assert.equal(typesSummary(3), '3 tür · satışta seçilir');
    assert.equal(typesSummary(0), 'Tür yok · satış hizmetlerden');
    assert.deepEqual(packageTypesOf([{ id: 1, name: 'Ağda', session_count: 0, price: '2400' }]),
        [{ id: '1', name: 'Ağda', sessions: 1, price: 2400 }]);
});

test('kaldırmak PASİFLEŞTİRMEK — satılmış paketin izi silinmez (masaüstünün kuralı)', () => {
    const remove = write.slice(write.indexOf('export async function removePackageType'));
    assert.match(remove.slice(0, 900), /\.update\(\{ is_active: false/);
    assert.doesNotMatch(remove.slice(0, 900), /\.delete\(\)/);
    // Başka cihaz kaldırdıysa ezilmez, "stale" döner.
    assert.match(remove.slice(0, 900), /\.eq\('is_active', true\)/);
    assert.match(remove.slice(0, 900), /kind: 'stale'/);
});

test('türler yalnız etkin olanlar; sayfa ad + seans + bedel yazar', () => {
    assert.match(source, /from\('package_templates'\)\s*\.select\('id, name, session_count, price'\)[\s\S]{0,120}\.eq\('is_active', true\)/);
    assert.match(sheets, /export function PackageTypeSheet/);
    assert.match(sheets, /disabled=\{!valid\}/);
    assert.match(layout, /name="\(manager-flow\)\/profil\/paket-turleri"/);
});

// ── Kapı ve para yolu ───────────────────────────────────────────────────────

test('Profil: Paketler satırı Müşteriler\'in ÜSTÜNDE ve yalnız paket satan sektörde', () => {
    assert.ok(profile.indexOf('title="Paketler"') > 0);
    assert.ok(profile.indexOf('title="Paketler"') < profile.indexOf('title="Müşteriler"'));
    assert.match(profile, /\{packages\?\.enabled \? \(\s*<ProfileRow\s*big\s*title="Paketler"/);
    assert.match(profile, /router\.push\('\/\(manager-flow\)\/paketler'\)/);
    // Okunamazsa satır yok (kapı) ya da özetsiz (sayım) — "0 açık" uydurulmaz.
    assert.match(profile, /fetchPackageGlance\(\)\.catch\(\(\) => null\)/);
    assert.match(profile, /sub=\{packages\.counts \? packageSummary\(packages\.counts\) : undefined\}/);
    const glance = source.slice(source.indexOf('export async function fetchPackageGlance'));
    assert.match(glance.slice(0, 700), /sellsPackages\(/);
    assert.match(glance.slice(0, 700), /return \{ enabled: true, counts: null \}/);
});

test('defter PARA ALMAZ — satır müşteri kartını açar, "Ödeme al" orada', () => {
    assert.doesNotMatch(book, /managerWrite|collectPlanPayment|\.insert\(|\.update\(/);
    assert.match(book, /pathname: '\/\(staff-flow\)\/customer'/);
    assert.match(book, /params: \{ customerId: row\.customerId, customerName: row\.customerName \}/);
});

test('ödemeler 500 kimlikle değil, salonun plana bağlı ödemeleriyle okunur (adres sınırı)', () => {
    const plans = source.slice(source.indexOf('async function fetchPackagePlans'), source.indexOf('export async function fetchPackageBook'));
    assert.match(plans, /\.not\('treatment_plan_id', 'is', null\)/);
    assert.doesNotMatch(plans, /\.in\('treatment_plan_id'/);
    assert.match(plans, /\.neq\('status', 'cancelled'\)/);
    assert.match(plans, /customer:customers\(name\)/);
});

test('okunamayan defter "paket yok" DEĞİL', () => {
    assert.match(book, /<DurumUnread\s*what="Paketleri"/);
    assert.match(types, /<DurumUnread\s*what="Paket türlerini"/);
});

test('tek kişilikte AYNI satır — İşletme, Profil ekranının kendisi; satır solo ile kapanmıyor', () => {
    // Kullanıcı: "tek kişilik içinde aynısını koy".
    const isletme = read('../mobile/app/tek/isletme.tsx');
    assert.match(isletme, /export \{ default \} from '\.\.\/mudur\/profile';/);
    const row = profile.indexOf('title="Paketler"');
    const gate = profile.lastIndexOf('{packages?.enabled ? (', row);
    assert.ok(gate > 0 && row - gate < 120, 'satırın kapısı yalnız sektör');
    assert.doesNotMatch(profile.slice(gate, row), /solo/);
});
