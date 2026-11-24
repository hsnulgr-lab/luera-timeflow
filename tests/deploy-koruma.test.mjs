/**
 * Fonksiyon yükleme emniyet kemeri (denetim 2026-11-24 · B7).
 *
 * Geçici git depolarında `scripts/deploy-guard.sh` gerçekten çalıştırılır
 * (macOS'un /bin/bash 3.2'si ile). Sunucuya hiçbir şey gitmez: SSH'tan önceki
 * denetim sınanıyor; durdurulan yüklemede `deploy-functions.sh`'nin SSH'a hiç
 * ulaşmadığı da (sahte, ulaşılamaz sunucuyla) gösteriliyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASH = '/bin/bash';

function sh(cwd, cmd, env = {}) {
    const r = spawnSync(BASH, ['-c', cmd], {
        cwd, encoding: 'utf8',
        env: {
            ...process.env, ...env,
            GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
            GIT_CONFIG_NOSYSTEM: '1', HOME: cwd,
        },
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** origin (çıplak) + çalışma kopyası, main'de bir commit, push edilmiş. */
function repo() {
    const base = mkdtempSync(join(tmpdir(), 'deploy-koruma-'));
    const origin = join(base, 'origin.git');
    const work = join(base, 'work');
    sh(base, `git init -q --bare -b main ${origin} && git init -q -b main ${work}`);
    mkdirSync(join(work, 'supabase/functions/_shared'), { recursive: true });
    mkdirSync(join(work, 'scripts'), { recursive: true });
    writeFileSync(join(work, 'supabase/functions/_shared/wa.ts'), 'export const a = 1;\n');
    copyFileSync(join(ROOT, 'scripts/deploy-guard.sh'), join(work, 'scripts/deploy-guard.sh'));
    copyFileSync(join(ROOT, 'scripts/deploy-functions.sh'), join(work, 'scripts/deploy-functions.sh'));
    const r = sh(work, `git add -A && git commit -qm ilk && git remote add origin ${origin} && git push -q origin main`);
    assert.equal(r.code, 0, r.out);
    return { base, work, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const guard = (work, env) => sh(work, '/bin/bash scripts/deploy-guard.sh', env);

test('main, temiz, GitHub ile eşit: geçer', () => {
    const { work, cleanup } = repo();
    try { assert.equal(guard(work).code, 0); } finally { cleanup(); }
});

test('başka dal: durur', () => {
    const { work, cleanup } = repo();
    try {
        sh(work, 'git switch -qc tek-kisilik');
        const r = guard(work);
        assert.equal(r.code, 1);
        assert.match(r.out, /yalnız main/);
    } finally { cleanup(); }
});

test('supabase/functions altında kaydedilmemiş değişiklik: durur ve dosyayı gösterir', () => {
    const { work, cleanup } = repo();
    try {
        writeFileSync(join(work, 'supabase/functions/_shared/wa.ts'), 'export const a = 2;\n');
        const r = guard(work);
        assert.equal(r.code, 1);
        assert.match(r.out, /kaydedilmemiş/);
        assert.match(r.out, /wa\.ts/);
    } finally { cleanup(); }
});

test('fonksiyonlar dışındaki kayıtsız dosya (belge) yüklemeyi durdurmaz', () => {
    const { work, cleanup } = repo();
    try {
        writeFileSync(join(work, 'not.md'), 'taslak\n');
        assert.equal(guard(work).code, 0);
    } finally { cleanup(); }
});

test('GitHub main\'in gerisinde: durur', () => {
    const { base, work, cleanup } = repo();
    try {
        const other = join(base, 'other');
        sh(base, `git clone -q ${join(base, 'origin.git')} ${other}`);
        writeFileSync(join(other, 'yeni.txt'), 'x\n');
        sh(other, 'git add -A && git commit -qm baskasi && git push -q origin main');
        const r = guard(work);
        assert.equal(r.code, 1);
        assert.match(r.out, /gerisinde/);
    } finally { cleanup(); }
});

test('GitHub\'ın önünde (push edilmemiş): geçer ama uyarır', () => {
    const { work, cleanup } = repo();
    try {
        writeFileSync(join(work, 'supabase/functions/_shared/wa.ts'), 'export const a = 3;\n');
        sh(work, 'git commit -qam ileri');
        const r = guard(work);
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /1 commit henüz GitHub'a gönderilmedi/);
    } finally { cleanup(); }
});

test('ZORLA=1: kural uyarıya döner', () => {
    const { work, cleanup } = repo();
    try {
        writeFileSync(join(work, 'supabase/functions/_shared/wa.ts'), 'export const a = 4;\n');
        const r = guard(work, { ZORLA: '1' });
        assert.equal(r.code, 0);
        assert.match(r.out, /\(ZORLA\)/);
    } finally { cleanup(); }
});

test('deploy-functions.sh: denetim düşerse sunucuya HİÇ bağlanmaz', () => {
    const { work, cleanup } = repo();
    try {
        writeFileSync(join(work, 'supabase/functions/_shared/wa.ts'), 'export const a = 5;\n');
        const r = sh(work, '/bin/bash scripts/deploy-functions.sh gateway', {
            DEPLOY_HOST: 'root@203.0.113.1', DEPLOY_KEY: '/yok', EDGE_SERVICE: 'yok',
        });
        assert.equal(r.code, 1);
        assert.match(r.out, /DURDURULDU/);
        assert.doesNotMatch(r.out, /Konteyner ve mount/);
    } finally { cleanup(); }
});

test('deploy-functions.sh sözdizimi bash 3.2 ile geçerli', () => {
    assert.equal(sh(ROOT, '/bin/bash -n scripts/deploy-functions.sh && /bin/bash -n scripts/deploy-guard.sh').code, 0);
});
