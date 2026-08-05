-- 081 — KVKK aydınlatma metni bağlantısı
--
-- Randevu sayfasındaki rıza kutusu zaten var ve zorunlu; eksik olan, kutunun
-- yanındaki "Aydınlatma metni" bağlantısının kaynağıydı. BookingPage `biz.kvkkUrl`
-- okuyor ama hiçbir yer doldurmuyordu, dolayısıyla bağlantı hiç çıkmıyordu.
--
-- Metin ÜRÜNE gömülmez, org başına URL olarak tutulur. Sebebi hukuki: KVKK'da
-- veri sorumlusu her salonun kendisidir (Luera yalnız veri işleyen). Aydınlatma
-- metni salonun kendi beyanıdır — unvanı, adresi, saklama süresi, irtibat kişisi
-- kendi bilgileridir. Ürün bunları yazamaz, yalnız yayınlanmış metne bağlantı
-- verir. Sabit bir /kvkk sayfası da 404 olurdu.
--
-- Kolon organizations'ta, settings'te DEĞİL: settings kullanıcı başına tek satır
-- (070'te org_whatsapp'ın ayrılma sebebi de buydu), oysa aydınlatma metni org
-- başına tektir. maps_url ve google_review_url ile aynı yerde durur.

alter table public.organizations
    add column if not exists kvkk_url text;

comment on column public.organizations.kvkk_url is
    'İşletmenin yayınladığı KVKK aydınlatma metninin URL''i. Veri sorumlusu işletmedir; metin ürün tarafından yazılmaz.';

notify pgrst, 'reload schema';
