-- 052: Çok günlük rezervasyon — gelinlikçi prova/kiralama, ileride konaklama.
-- end_date NULL = tek gün (mevcut davranış birebir korunur).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS end_date DATE;
