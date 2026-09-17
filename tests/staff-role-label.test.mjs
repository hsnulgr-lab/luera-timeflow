import assert from 'node:assert/strict';
import test from 'node:test';

import { staffRoleLabel as desktop } from '../src/lib/staffPermissions.ts';
import { staffRoleLabel as mobile, ROLE_LABEL_SECTORS } from '../mobile/src/lib/staffRoleLabel.ts';

/**
 * Giriş listesinde "doctor" yazıyordu (2026-09-17, telefonda görüldü).
 * Mobildeki ad tablosu masaüstünün çıktısıyla her sektör × rol için aynı.
 */

test('mobil rol adları masaüstüyle birebir', () => {
    for (const sector of ROLE_LABEL_SECTORS) {
        for (const role of ['doctor', 'assistant', 'cashier', 'staff']) {
            assert.equal(mobile(role, sector), desktop(role, sector), `${sector}/${role}`);
        }
    }
});

test('rol ANAHTARI ekrana hiç çıkmıyor', () => {
    assert.equal(mobile('doctor', 'kuafor'), 'Kuaför');
    assert.equal(mobile('doctor', null), 'Uzman');
    assert.equal(mobile('doctor', 'bilinmeyen'), 'Uzman');
    assert.equal(mobile('owner', 'kuafor'), 'Personel');
    assert.equal(mobile(null, 'kuafor'), 'Personel');
    assert.equal(mobile('', 'kuafor'), 'Personel');
});
