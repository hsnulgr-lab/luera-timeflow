/**
 * Görsel deposu · göç 145 (denetim 2026-11-24 · B4).
 *
 * 016'da `org-public` yazma/silme politikaları yalnız deponun adına bakıyordu:
 * kayıtlı herhangi biri başka salonun logosunu silebiliyor ya da üzerine
 * yazabiliyordu. 145'ten sonra yolun ilk klasörü kullanıcının işletmesi olmalı.
 *
 * DAVRANIŞ gerçek Postgres'te (PGlite) sınanıyor: Supabase'in ilgili kısmının
 * taslağı (storage.objects, storage.foldername, auth.uid, auth_user_org_ids) +
 * 016 → önce AÇIĞIN var olduğu gösteriliyor → 145 (iki kez) → kapandığı.
 * PGLITE_DIR verilmezse PGlite testleri atlanır:
 *   PGLITE_DIR=<pglite kurulu dizin> node --test tests/org-public-klasor.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const PGLITE_DIR = process.env.PGLITE_DIR;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sqlCode = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const m016 = read('supabase/016_org_public_storage.sql');
const m145 = read('supabase/145_org_public_klasor.sql');

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('145 tek işlemde; üç yazma politikası klasörü işletmeye bağlıyor; okuma değişmiyor', () => {
    const c = sqlCode(m145);
    assert.match(c, /^BEGIN;/);
    assert.match(c, /COMMIT;$/);
    const rule = "(storage.foldername(name))[1] IN (SELECT o::text FROM public.auth_user_org_ids() AS o)";
    for (const p of ['org_public_auth_insert', 'org_public_auth_update', 'org_public_auth_delete']) {
        const start = c.indexOf(`CREATE POLICY "${p}"`);
        assert.ok(start >= 0, `${p} yok`);
        const body = c.slice(start, c.indexOf(';', start));
        assert.ok(body.includes(rule), `${p}: klasör kuralı yok`);
    }
    // UPDATE hem USING hem WITH CHECK (başka klasöre taşıma da engellenir)
    const upd = c.slice(c.indexOf('CREATE POLICY "org_public_auth_update"'));
    assert.match(upd.slice(0, upd.indexOf(';')), /USING \(.*foldername.*\) WITH CHECK \(.*foldername.*\)/);
    assert.doesNotMatch(c, /org_public_read/, 'okuma politikasına dokunulmamalı');
});

const STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, storage, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.organization_members (org_id uuid not null, user_id uuid not null, role text);
insert into public.organization_members values
  ('${ORG_A}', '${USER_A}', 'owner'), ('${ORG_B}', '${USER_B}', 'owner');

-- 003'teki tanımın aynısı
create or replace function public.auth_user_org_ids() returns setof uuid
language sql stable security definer set search_path = public as
  $$ select org_id from organization_members where user_id = auth.uid() $$;
grant execute on function public.auth_user_org_ids() to authenticated;

create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id bigserial primary key, bucket_id text, name text, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant usage on sequence storage.objects_id_seq to authenticated;

-- Supabase storage.foldername: yolun son parçası (dosya adı) hariç klasörler
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant execute on function storage.foldername(text) to anon, authenticated;

insert into storage.objects (bucket_id, name) values
  ('org-public', '${ORG_A}/logo-1.jpg'),
  ('org-public', '${ORG_B}/logo-1.jpg'),
  ('org-public', 'eski-duz-dosya.jpg');
`;

async function fresh() {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(STUB);
    await db.exec(m016);
    return db;
}

/** Kullanıcı adına çalıştırır; satır sayısı ya da hata metni döner. */
async function as(db, user, sql) {
    try {
        await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${user}', true);`);
        const r = await db.query(sql);
        await db.exec('commit;');
        return { rows: r.affectedRows ?? r.rows.length };
    } catch (e) {
        await db.exec('rollback;');
        return { error: String(e.message) };
    }
}

const count = async (db, name) =>
    (await db.query(`select count(*)::int as n from storage.objects where name = $1`, [name])).rows[0].n;

const skip = !PGLITE_DIR && 'PGLITE_DIR yok';

test('016 (eski hâl): B salonu A salonunun logosunu SİLEBİLİYOR — açık gerçek', { skip }, async () => {
    const db = await fresh();
    const r = await as(db, USER_B, `delete from storage.objects where name = '${ORG_A}/logo-1.jpg'`);
    assert.equal(r.rows, 1);
    assert.equal(await count(db, `${ORG_A}/logo-1.jpg`), 0);
});

test('145: B, A\'nın dosyasını silemez, değiştiremez, A\'nın klasörüne yükleyemez', { skip }, async () => {
    const db = await fresh();
    await db.exec(m145);
    await db.exec(m145); // yeniden çalıştırılabilir

    const del = await as(db, USER_B, `delete from storage.objects where name = '${ORG_A}/logo-1.jpg'`);
    assert.equal(del.rows, 0);
    assert.equal(await count(db, `${ORG_A}/logo-1.jpg`), 1);

    const upd = await as(db, USER_B, `update storage.objects set name = '${ORG_A}/logo-1.jpg' where name = '${ORG_A}/logo-1.jpg'`);
    assert.equal(upd.rows, 0);

    const ins = await as(db, USER_B, `insert into storage.objects (bucket_id, name) values ('org-public', '${ORG_A}/sahte.jpg')`);
    assert.match(ins.error ?? '', /row-level security/);
    assert.equal(await count(db, `${ORG_A}/sahte.jpg`), 0);
});

test('145: kendi klasöründe yükleme, değiştirme (upsert) ve silme serbest', { skip }, async () => {
    const db = await fresh();
    await db.exec(m145);
    assert.equal((await as(db, USER_A, `insert into storage.objects (bucket_id, name) values ('org-public', '${ORG_A}/cover-2.jpg')`)).rows, 1);
    assert.equal((await as(db, USER_A, `insert into storage.objects (bucket_id, name) values ('org-public', '${ORG_A}/cover-2.jpg')
        on conflict (bucket_id, name) do update set name = excluded.name`)).rows, 1);
    assert.equal((await as(db, USER_A, `delete from storage.objects where name = '${ORG_A}/logo-1.jpg'`)).rows, 1);
});

test('145: kendi dosyasını başka salonun klasörüne TAŞIYAMAZ', { skip }, async () => {
    const db = await fresh();
    await db.exec(m145);
    const r = await as(db, USER_A, `update storage.objects set name = '${ORG_B}/logo-2.jpg' where name = '${ORG_A}/logo-1.jpg'`);
    assert.match(r.error ?? '', /row-level security/);
    assert.equal(await count(db, `${ORG_A}/logo-1.jpg`), 1);
});

test('145: klasörsüz/uuid olmayan eski dosya politikayı patlatmaz, yalnız dokunulmaz', { skip }, async () => {
    const db = await fresh();
    await db.exec(m145);
    const r = await as(db, USER_A, `delete from storage.objects where name = 'eski-duz-dosya.jpg'`);
    assert.equal(r.error, undefined);
    assert.equal(r.rows, 0);
});

test('145: başka depoya (bucket) etkisi yok — politikalar yalnız org-public', { skip }, async () => {
    const db = await fresh();
    await db.exec(m145);
    const r = await as(db, USER_A, `insert into storage.objects (bucket_id, name) values ('baska', '${ORG_A}/x.jpg')`);
    assert.match(r.error ?? '', /row-level security/, 'başka depoya politika yokken yazılamamalı (016 ile aynı)');
});
