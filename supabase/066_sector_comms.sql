-- 066 — Sektörel WhatsApp iletişim profili
--
-- "Sektöre bürünme"nin mesaj tarafı. Kaynak src/lib/sectorProfiles.ts'teki
-- SectorComms bloğudur; uygulama sektör seçildiğinde/ayarlar açıldığında bu
-- kolonu doldurur (self-healing, bkz. useReservations). Edge function (remind)
-- yalnız buradan okur — böylece sektör tablosunun ikinci bir kopyası kodda
-- tutulmaz ve iki taraf birbirinden kaymaz.
--
-- Org bazında override: klinik kendi tonunu/şablonunu yazarsa uygulama bunu
-- ezmez (custom = true işaretlenir).

alter table public.settings
    add column if not exists comms jsonb;

comment on column public.settings.comms is
    'Sektörel WhatsApp iletişim profili (persona, audience, serviceWord, emoji, recall, guardrail, custom). Kaynak: src/lib/sectorProfiles.ts';

-- Mevcut satırlar NULL kalır; uygulama ilk açılışta doldurur. Edge function
-- comms NULL ise nötr varsayılana düşer, yani mesaj gönderimi kesilmez.
