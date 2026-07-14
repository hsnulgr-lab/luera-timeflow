-- 050: Özel alan sistemi — sektöre göre değişen bilgi ihtiyacı
-- (tattoo: vücut bölgesi/alerji; gelinlikçi: ölçüler/düğün tarihi; avukat: dosya no).
-- Değerler entity üzerinde JSONB; alan TANIMLARI org'da (null → sektör şablonu,
-- src/lib/sectorProfiles.ts customFieldTemplates). Geriye dönük uyumlu: mevcut
-- satırlar boş obje ile davranış değiştirmez, RLS'e dokunulmaz.

ALTER TABLE customers     ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}';
ALTER TABLE reservations  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}';

-- Org bazlı alan tanımı override'ı: [{entity,key,label,type,options?,required?}, ...]
-- NULL = Ayarlar'da özelleştirilmemiş → sektör şablonu geçerli.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_field_defs JSONB;
