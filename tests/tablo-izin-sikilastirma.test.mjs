import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * 096 — RLS'in kapsamadığı tablo izinleri (TRUNCATE, REFERENCES, TRIGGER).
 *
 * RLS yalnız SELECT/INSERT/UPDATE/DELETE'e uygulanır. Supabase'in varsayılan
 * ayrıcalıkları istemci rollerine bu üç tablo seviyesi izni de veriyordu.
 * Bu test, iptalin geri sızmasını ve uygulamanın ihtiyaç duyduğu dört
 * işleme yanlışlıkla dokunulmasını yakalar.
 */

const SQL = readFileSync(new URL('../supabase/096_revoke_table_level_grants.sql', import.meta.url), 'utf8');
/** Yorumlar atılmış — doğrulama ve geri alma örnekleri yorumda duruyor. */
const code = SQL.replace(/--[^\n]*/g, '');

test('üç izin, iki istemci rolü, bütün tablolar — roller TEK TEK adlandırılmış', () => {
    const revoke = code.match(/revoke[\s\S]*?;/i)?.[0] ?? '';
    for (const privilege of ['truncate', 'references', 'trigger']) {
        assert.match(revoke, new RegExp(`\\b${privilege}\\b`), privilege);
    }
    assert.match(revoke, /on all tables in schema public/);
    // `from public` YETMEZ (094'ün dersi): anon ve authenticated ayrıca almış.
    assert.match(revoke, /from anon, authenticated;/);
});

test('bundan sonra açılacak tablolar da aynı izinle DOĞMUYOR', () => {
    const defaults = code.match(/alter default privileges[\s\S]*?;/i)?.[0] ?? '';
    assert.match(defaults, /for role postgres in schema public/);
    assert.match(defaults, /revoke truncate, references, trigger on tables/);
    assert.match(defaults, /from anon, authenticated;/);
});

test('uygulamanın dört işlemine ve service_role\'e DOKUNULMUYOR', () => {
    assert.doesNotMatch(code, /\b(select|insert|update|delete)\b\s*(,|on)/i);
    assert.doesNotMatch(code, /service_role/);
    assert.doesNotMatch(code, /\bgrant\b/i, 'çalışan kısımda grant olmamalı — geri alma yalnız yorumda');
    assert.match(code, /begin;[\s\S]*commit;/);
});

test('doğrulama sorguları migration\'ın içinde duruyor', () => {
    assert.match(SQL, /information_schema\.role_table_grants/);
    assert.match(SQL, /pg_default_acl/);
    assert.match(SQL, /has_table_privilege\('authenticated', 'public\.reservations'/);
});

test('istemci rolüyle TRUNCATE çalıştıran bir SQL ya da fonksiyon yok', () => {
    const dir = new URL('../supabase/', import.meta.url);
    for (const name of readdirSync(dir).filter((file) => /^\d{3}_.*\.sql$/.test(file))) {
        const body = readFileSync(new URL(name, dir), 'utf8').replace(/--[^\n]*/g, '');
        assert.doesNotMatch(body, /\btruncate\s+(table\s+)?(public\.)?\w+/i, name);
    }
});
