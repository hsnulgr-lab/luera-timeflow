-- ============================================================
-- TimeFlow Migration 090: Ziyaretin formülü
-- ============================================================
-- Personel 07/08/09 — müşteri defteri.
--
-- Kuaförün altı ay sonra soracağı tek soru var: "geçen sefer bu saça ne
-- yapmıştım?" Sektör bunu hâlâ BASILI formül defteriyle çözüyor, çünkü
-- yazılımlar çözmüyor.
--
-- NEDEN `reservations` ÜSTÜNDE BİR KOLON:
-- Formül müşterinin değil ZİYARETİN özelliği — aynı müşteri her gelişte
-- farklı formül alıyor ve "geçmiş" zaten ziyaretlerin listesi. Projede bunun
-- kalıbı hazır: `adisyon_items` de aynı satırda bir jsonb. Ayrı tablo açmak
-- ikinci bir RLS yüzeyi ve ikinci bir saklama biçimi demekti.
--
-- NEDEN `materials` İÇİNDE KİMLİK:
-- Malzeme adı katalogdan geliyor ve değişebilir. Yalnız metin saklansaydı
-- ürün adı düzeltilen iki formül "farklı malzeme" görünürdü.
--
-- SEKTÖR: bu alan güzellik/kuaför yüzünün parçası. Diş kliniğinde de
-- `kind:'material'` kalem var, ama orada "formül" diye bir şey yok — arayüz
-- alanı sektör yüzü kayıtlıysa çiziyor, veri her sektörde durabilir.
-- ============================================================

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS formula JSONB;

COMMENT ON COLUMN public.reservations.formula IS
    'Ziyaretin renk formülü: { materials:[{id,name,qty}], ratio, waitMinutes, '
    'waitSource:"timer"|"manual", result, note, staffId, writtenAt }. '
    'Adisyon kasaya gidince kilitlenir (is_paid / status=completed).';

-- Müşterinin formül geçmişi: "bu müşteride ne yapmıştım" sorgusu her kart
-- açılışında çalışıyor ve yalnız formülü OLAN ziyaretleri istiyor.
CREATE INDEX IF NOT EXISTS reservations_customer_formula_idx
    ON public.reservations (organization_id, customer_id, date DESC)
    WHERE formula IS NOT NULL;

NOTIFY pgrst, 'reload schema';
