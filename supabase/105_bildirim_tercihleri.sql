-- ============================================================
-- TimeFlow Migration 105: müdürün bildirim tercihleri
-- ============================================================
-- Telefondaki "Bildirimler" ekranı 2026-09-16'dan beri KAPALI
-- (`MANAGER_NOTIFICATIONS_READY = false`) çünkü arkasında hiçbir şey yoktu:
-- dört anahtar yalnız telefonun belleğinde duruyordu, uygulama kapanınca
-- kayboluyordu ve hiçbir bildirimi etkilemiyordu. Olmayan bir şeyin anahtarını
-- göstermek yalan olurdu; ekran bilerek gizlendi.
--
-- Bu dosya o anahtarların gerçek yerini açıyor.
--
-- ── Neden yeni tablo DEĞİL ──────────────────────────────────────────────────
-- `settings` satırı zaten var, org sahibinin satırını çözme mantığı zaten
-- yazılı (`fetchOrgSettings`, `staff-api · orgSettings`), okuma ve iyimser
-- kilitli yazma yolu zaten kurulu (`saveWorkingHours` deseni). Yeni tablo yeni
-- RLS, yeni indeks ve ikinci bir okuma yolu demekti — üç boolean için.
--
-- ── PERSONELİN tercihi burada TUTULMUYOR ────────────────────────────────────
-- Personelin "bildirimler kapalı"sı, jeton kaydının silinmesidir (103).
-- Personele giden dört olayın hepsi KENDİ randevusuyla ilgili ve hepsi iş;
-- seçmeli kapatmak personeli kendi gününe karşı körleştirirdi. Tek kapı
-- işletim sisteminin izni — dürüst ve tek.
--
-- ── Boş nesne ne demek ──────────────────────────────────────────────────────
-- `'{}'` = "hiçbir tercih yazılmadı" = HEPSİ AÇIK. Yokluk "kapalı" demek
-- değil: `send-push` anahtarı bulamazsa GÖNDERİYOR (106 ve fonksiyon içindeki
-- gerekçeye bakın). Ters kurgu, bir şema boşluğunda bütün salonu sessize
-- alırdı.
--
-- Uygulama sırası: 104'ten sonra, 106'dan önce.
-- Edge function deploy'u 106 ile birlikte gerekiyor.
-- ============================================================

begin;

alter table public.settings
    add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

comment on column public.settings.notification_prefs is
    'Müdürün bildirim tercihleri: {"booked":true,"cancelled":false,"cash":true}. '
    'Eksik anahtar AÇIK demek — send-push yokluğu "kapalı" saymıyor.';

commit;

notify pgrst, 'reload schema';

-- ── Doğrulama ───────────────────────────────────────────────────────────────
--   select organization_id, user_id, notification_prefs
--     from public.settings limit 5;
--   -- hepsi {} olmalı: kimse henüz bir anahtar kapatmadı
--
-- Geri alma:
--   alter table public.settings drop column if exists notification_prefs;
