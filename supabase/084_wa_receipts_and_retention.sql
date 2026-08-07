-- 084 — WhatsApp: teslimat makbuzları + mesaj gövdesi saklama süresi
--
-- İKİ AYRI EKSİK, tek migration'da çünkü ikisi de wa_message_log'a dokunuyor.
--
-- ── 1. "Mesaj gitti mi?" sorusunun cevabı yok ───────────────────────────────
-- Bugün status='sent' demek "Evolution isteği kabul etti" demek; müşteriye
-- ULAŞTIĞI anlamına gelmiyor. Telefon kapalıysa, numara WhatsApp'ta yoksa ya da
-- mesaj bekliyorsa da 'sent' yazıyor. Salon "müşteri mesaj gelmedi diyor" diye
-- aradığında elimizde kanıt yok — WhatsApp'ın kendi tik bilgisi duruyor ama biz
-- onu hiç istemiyoruz (webhook'ta yalnız MESSAGES_UPSERT kayıtlı).
--
-- Evolution MESSAGES_UPDATE olayında teslim/okundu durumunu bildiriyor.
-- Kaydını buraya alıyoruz; kota ve kuyruk mantığı DEĞİŞMİYOR, yalnız iki
-- zaman damgası ekleniyor.
--
-- ── 2. Mesaj gövdeleri süresiz saklanıyor ───────────────────────────────────
-- wa_message_log.body hem gidenin hem GELENİN tam metnini tutuyor. Güzellik
-- salonunda bu metinler sağlık bilgisine yaklaşıyor ("hamileyim", "lazer
-- bölgesi") ve KVKK'da özel nitelikli veri sayılabilir. Saklama süresi yok,
-- silme yolu yok.
--
-- Satırı SİLMİYORUZ: kota sayımı, teslimat kanıtı ve "kaç mesaj gönderdik"
-- raporu bu satırlara dayanıyor. Yalnız GÖVDEYİ boşaltıyoruz — kişisel veri
-- gider, muhasebe kalır. wa_inbound_seen zaten temizleniyordu (whatsapp-proxy),
-- asıl kişisel veri ise duruyordu.

-- ── Teslimat alanları ───────────────────────────────────────────────────────
alter table public.wa_message_log
    add column if not exists delivered_at timestamptz,
    add column if not exists read_at      timestamptz,
    add column if not exists body_purged_at timestamptz;

comment on column public.wa_message_log.delivered_at is
    'Evolution MESSAGES_UPDATE ile bildirdi: mesaj cihaza ulaştı. NULL = bilinmiyor '
    '(status=''sent'' yalnız "API kabul etti" demek).';
comment on column public.wa_message_log.read_at is
    'Müşteri okudu (mavi tik). Okundu bilgisi kapalıysa hiç dolmaz.';
comment on column public.wa_message_log.body_purged_at is
    'Gövde KVKK saklama süresi dolduğu için boşaltıldı. Satır kanıt olarak durur.';

-- provider_msg_id ile satır bulma: teslimat bildirimi bu id üzerinden gelir.
-- Kısmi indeks — id'si olmayan satırlar (skipped/queued) taranmaz.
create index if not exists idx_wa_log_provider_msg
    on public.wa_message_log(provider_msg_id)
    where provider_msg_id is not null;

-- ── Saklama süresi ──────────────────────────────────────────────────────────
-- Varsayılan 12 ay. Ticari elektronik ileti tarafında kanıt yükümlülüğü için
-- satır kalıyor; okunabilir içerik gidiyor.
create or replace function public.purge_wa_message_bodies(p_months integer default 12)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    -- Aylık sınır makul bir aralıkta kalsın: 0 verilip her şeyin anında
    -- silinmesi ya da devasa bir sayıyla kuralın etkisiz kılınması engellenir.
    if p_months is null or p_months < 1 or p_months > 120 then
        raise exception 'purge_wa_message_bodies: p_months 1-120 arasında olmalı (verilen: %)', p_months;
    end if;

    with purged as (
        update public.wa_message_log
           set body = null,
               body_purged_at = now()
         where body is not null
           and body_purged_at is null
           and created_at < now() - make_interval(months => p_months)
        returning 1
    )
    select count(*) into v_count from purged;

    return v_count;
end;
$$;

comment on function public.purge_wa_message_bodies(integer) is
    'KVKK saklama: p_months''tan eski mesaj gövdelerini boşaltır. Satır silinmez — '
    'kota sayımı, teslimat kanıtı ve raporlar satıra dayanıyor. remind cron''u çağırır.';

-- Yalnız service_role çağırabilsin; kullanıcı arayüzünden tetiklenecek bir şey değil.
revoke all on function public.purge_wa_message_bodies(integer) from public;
revoke all on function public.purge_wa_message_bodies(integer) from authenticated;
revoke all on function public.purge_wa_message_bodies(integer) from anon;

notify pgrst, 'reload schema';
