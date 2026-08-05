import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { planKindForSector, SECTOR_PROFILES } from '../src/lib/sectorProfiles.ts';

// `treatment_plans` iki işi taşır: klinik tedavi planı ve ticari seans paketi.
// Regresyon: ayraç yokken güzellik dashboard'ının fırsat kuyruğu org'un TÜM
// planlarını çekiyordu ve orada implant/kanal satırları görünüyordu.

test('klinik sektörler tedavi, ticari sektörler paket üretir', () => {
    for (const sector of ['dis', 'saglik', 'fizyoterapi']) {
        assert.equal(planKindForSector(sector), 'tedavi', sector);
    }
    for (const sector of ['guzellik', 'kuafor', 'berber', 'estetik', 'gym', 'genel']) {
        assert.equal(planKindForSector(sector), 'paket', sector);
    }
});

test('bilinmeyen/boş sektör ticari pakete düşer', () => {
    assert.equal(planKindForSector(undefined), 'paket');
    assert.equal(planKindForSector(null), 'paket');
    assert.equal(planKindForSector(''), 'paket');
    assert.equal(planKindForSector('henuz-olmayan-sektor'), 'paket');
});

test('her tanımlı sektör iki türden birine düşer', () => {
    for (const sector of Object.keys(SECTOR_PROFILES)) {
        assert.ok(['tedavi', 'paket'].includes(planKindForSector(sector)), sector);
    }
});

// TS tarafındaki eşlemenin ikizi 077'deki trigger'da yaşıyor. İkisi ayrışırsa
// aynı org'un planları yazarken bir tür, okurken başka tür alır.
test('SQL trigger ile TS eşlemesi aynı klinik sektör listesini kullanır', () => {
    const sql = readFileSync(new URL('../supabase/077_plan_kind.sql', import.meta.url), 'utf8');
    const clinical = [...sql.matchAll(/sector in \(([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(clinical.length >= 2, 'hem backfill hem trigger eşlemesi bulunmalı');
    for (const list of clinical) {
        const sectors = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
        assert.deepEqual(sectors.sort(), ['dis', 'fizyoterapi', 'saglik']);
    }
});

test('useOrgPackages yalnız ticari paketleri çeker', () => {
    const src = readFileSync(new URL('../src/hooks/useOrgPackages.ts', import.meta.url), 'utf8');
    assert.match(src, /\.eq\('plan_kind', 'paket'\)/);
    assert.match(src, /plan_kind: 'paket'/);
});
