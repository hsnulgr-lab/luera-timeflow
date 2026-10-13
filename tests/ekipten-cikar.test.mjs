/**
 * EKİPTEN ÇIKAR → TEK KİŞİLİĞE DÖN (2026-10-13).
 *
 * Telefonda: tek kişilikten ekibe geçen sahip, çalışan ayrılınca geri
 * dönemiyordu. Telefonda kimseyi ekipten çıkarmanın yolu yoktu ve dönüş
 * kapısı (115) yalnız ekipte bir kişi kalınca görünüyordu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    REMOVE_LAST_LINE, removeCopy, removePlan, removeProblem, soloAfterRemoveProblem,
} from '../mobile/src/lib/teamRemove.ts';

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const derya = { id: 'd', name: 'Derya Güzellik' };
const elif = { id: 'e', name: 'Elif Demir' };
const selin = { id: 's', name: 'Selin Kaya' };

test('plan: kalan sayısına göre — çıkar, çıkar ve tek kişiliğe dön, çıkarılamaz', () => {
    assert.deepEqual(removePlan([derya, elif, selin], 'e'), { kind: 'remove', remaining: 2 });
    assert.deepEqual(removePlan([derya, elif], 'e'), { kind: 'solo', keeper: 'Derya Güzellik' });
    // Kim kaldığı tahmin edilmiyor: yanlış satırı seçen, kalanın adını görür.
    assert.deepEqual(removePlan([derya, elif], 'd'), { kind: 'solo', keeper: 'Elif Demir' });
    assert.deepEqual(removePlan([derya], 'd'), { kind: 'last' });
    assert.match(REMOVE_LAST_LINE, /İşletme › Tek kişiliğe dön/);
});

test('onay sayfası sonuçları tek tek söylüyor; son çalışan çıkınca düğme dönüşü de söylüyor', () => {
    const solo = removeCopy({ kind: 'solo', keeper: 'Derya Güzellik' }, 'Elif Demir');
    assert.equal(solo.action, 'Çıkar ve tek kişiliğe dön');
    assert.ok(solo.lines.includes('Ekipte yalnız Derya Güzellik kalır ve işletme tek kişilik düzene döner.'));
    assert.ok(solo.lines.includes('Elif Demir telefonundan çıkar; bir daha giriş yapamaz.'));
    assert.ok(solo.lines.some((line) => /İleri randevuları kalan kişiye geçer/.test(line)));
    const plain = removeCopy({ kind: 'remove', remaining: 2 }, 'Elif Demir');
    assert.equal(plain.action, 'Ekipten çıkar');
    assert.ok(plain.lines.some((line) => /takvimde onun sütununda kalır/.test(line)));
    assert.ok(plain.lines.includes('Geçmiş randevularında ve Kasa’da adı kalır.'));
});

test('hatalar: hiçbir şey olmadıysa "kimse çıkarılmadı"; yarıda kaldıysa kapının yeri', () => {
    assert.match(removeProblem('offline'), /Kimse çıkarılmadı/);
    assert.match(removeProblem('not_allowed'), /yalnız işletme sahibi/);
    assert.match(soloAfterRemoveProblem('Elif Demir', 'bağlantı yok'), /^Elif Demir ekipten çıkarıldı; tek kişiliğe dönüş olmadı \(bağlantı yok\)\. İşletme › Tek kişiliğe dön’den tamamlayın\.$/);
});

test('yazma: satır SİLİNMİYOR, pasife alınıyor; RLS sessiz reddi "çıkarıldı" sayılmıyor', () => {
    const write = code('src/lib/managerWrite.ts');
    const fn = write.slice(write.indexOf('export async function removeStaffMember'));
    assert.match(fn, /\.from\('staff'\)\s*\.update\(\{ is_active: false \}\)\s*\.eq\('id', staffId\)\s*\.eq\('organization_id', organizationId\)\s*\.select\('id'\)/);
    assert.doesNotMatch(fn.slice(0, fn.indexOf('// ──') > 0 ? fn.indexOf('// ──') : 2000), /\.delete\(\)/);
    assert.match(fn, /\(data\?\.length \?\? 0\) === 1 \? \{ ok: true \} : \{ ok: false, reason: 'not_allowed' \}/);
});

test('ekran: her satır kişinin sayfasını açıyor; son çalışan çıkınca `end_team` ve tek kişilik kabuk', () => {
    const screen = code('app/(manager-flow)/profil/personel.tsx');
    assert.match(screen, /const tappable = !ownerOnly;/);
    assert.match(screen, /onPress=\{\(\) => openMember\(member\)\}/);
    // Önce çıkar, sonra (yalnız bir kişi kalıyorsa) dön.
    const confirm = screen.slice(screen.indexOf('const confirmRemove'), screen.indexOf('const onRefusalAction'));
    assert.ok(confirm.indexOf('removeStaffMember(member.id)') < confirm.indexOf('authApi.team.end()'));
    assert.match(confirm, /if \(plan\.kind === 'solo'\) \{\s*const ended = await authApi\.team\.end\(\);/);
    assert.match(confirm, /if \(!notice\) \{\s*setSheet\(null\);\s*enterShell\('manager', true\);/);
    // Dönüş düşerse yarıda kalmıyor: kapının yeri yazıyor.
    assert.match(confirm, /setRemoveError\(soloAfterRemoveProblem\(member\.name, teamEndProblem\(ended\.error\)\)\);/);
    // Şifre sıfırlama aynı yoldan, değişmedi.
    assert.match(screen, /await resetStaffPin\(resetting\.id\)/);
    assert.match(screen, /\{member\.hasPin \? \(\s*<ProfileRow first title="Şifreyi sıfırla"/);
});
