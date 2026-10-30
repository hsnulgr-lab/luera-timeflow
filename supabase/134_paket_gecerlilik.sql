-- ============================================================
-- TimeFlow Migration 134: Paket geçerlilik tarihi — treatment_plans.valid_until
-- ============================================================
-- 2026-10-31, Paketler tasarım turu. Satış ekranında "Geçerlilik · Yakında"
-- diye pasif bir kutu duruyordu. Kullanıcı kararı (2026-10-31): süre
-- seçilebilsin, süre dolunca UYARSIN ama haklar KAPANMASIN.
--
-- ── Neden yalnız uyarı ──────────────────────────────────────────────────────
-- Süresi dolan hakkı otomatik yakmak müşteriyle tartışma demektir ve salonun
-- kararıdır; sistem yalnız hatırlatır. Bu yüzden kolon hiçbir kısıta,
-- tetikleyiciye ya da hak hesabına (packageRights) bağlanmıyor — bilgi alanı.
--
-- NULL = süresiz (bugüne kadar satılan bütün paketler böyle kalır).
-- Mobil uygulama kolonu okumuyor; eklenmesi onu etkilemez.
-- ============================================================

alter table public.treatment_plans
    add column if not exists valid_until date;

comment on column public.treatment_plans.valid_until is
    'Paketin son geçerlilik günü (134). NULL = süresiz. Yalnız uyarı içindir, hakları kapatmaz.';

notify pgrst, 'reload schema';
