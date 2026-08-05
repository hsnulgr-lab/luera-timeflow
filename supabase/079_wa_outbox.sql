-- 079 — WhatsApp giden kuyruğu: geçici hatada mesaj kaybolmasın
--
-- Bugün gönderim tek istek içinde en fazla iki kez deneniyor (bkz. _shared/wa.ts).
-- Evolution yeniden başlatılıyorsa, VPS'e ağ kesintisi düştüyse ya da telefonun
-- oturumu bir dakikalığına koptuysa iki deneme de aynı saniyeye denk gelir ve
-- mesaj "failed" yazılıp KAYBOLUR. Randevu hatırlatması bir daha gönderilmez —
-- müşteri gelmez, kimse sebebini bilmez.
--
-- Ayrı bir kuyruk tablosu AÇILMIYOR: wa_message_log zaten her gönderimin
-- gövdesini, alıcısını, türünü ve org'unu taşıyor. Kuyruk = bu tablonun
-- "henüz bitmemiş" satırları. Böylece kota sayımı, opt-out denetimi ve mesaj
-- geçmişi tek tabloda kalır; iki yerde tutulan gerçek olmaz.
--
-- Yeniden deneme YALNIZ geçici hatalar için: ağ hatası, 5xx, 429. Kalıcı olanlar
-- (geçersiz numara, opt-out, kota, kopmuş bağlantı, 4xx) kuyruğa hiç girmez —
-- tekrar denemek aynı sonucu verir, üstelik opt-out'a ısrar etmek yanlış olur.

-- ── 1. Durum kümesine 'queued' ekle ─────────────────────────────────────────
alter table public.wa_message_log
    drop constraint if exists wa_message_log_status_check;

alter table public.wa_message_log
    add constraint wa_message_log_status_check
    check (status in ('sent', 'failed', 'skipped', 'queued'));

-- ── 2. Kuyruk alanları ──────────────────────────────────────────────────────
alter table public.wa_message_log
    add column if not exists attempts        integer     not null default 0,
    add column if not exists next_attempt_at timestamptz,
    add column if not exists last_attempt_at timestamptz;

comment on column public.wa_message_log.attempts is
    'Kaç kez gönderilmeye çalışıldı. 0 = hiç denenmedi (yalnız skipped satırlarda).';
comment on column public.wa_message_log.next_attempt_at is
    'Dolu VE status=queued ise bu satır kuyruktadır; remind cron''u zamanı gelenleri alır.';

-- Kuyruk taraması: yalnız bekleyen satırlara bakar, tablo büyüdükçe maliyeti artmaz.
create index if not exists idx_wa_log_queue
    on public.wa_message_log(next_attempt_at)
    where status = 'queued';

-- ── 3. Kuyruğu görünür kıl ──────────────────────────────────────────────────
-- Kullanıcı "hatırlatma gitti mi" diye sorduğunda cevabı olsun: bekleyen mesaj
-- sayısı Ayarlar > WhatsApp'ta gösterilebilsin (okuma policy'si zaten var).
-- security_invoker: view'ı sorgulayan kullanıcının RLS'i uygulanır. Olmazsa view
-- sahibinin haklarıyla çalışır ve bir org diğerinin kuyruğunu sayabilirdi.
create or replace view public.wa_outbox_pending
with (security_invoker = true) as
    select organization_id,
           count(*)                       as pending,
           min(next_attempt_at)           as next_at,
           max(attempts)                  as max_attempts
      from public.wa_message_log
     where status = 'queued'
     group by organization_id;

grant select on public.wa_outbox_pending to authenticated;

notify pgrst, 'reload schema';
