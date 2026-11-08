# WhatsApp · çoklu işletme hazırlığı (2026-11-08)

## Denetimin sonucu
**İzolasyon sağlam.** Bir işletme, başka bir işletmenin müşterisini, mesajını, hattını, bilgi bankasını ya da asistan bütçesini göremez. Bunu dört şey sağlıyor:
- her işletmenin kendi hattı (`tf_<org>`),
- hatta özel webhook sırrı,
- her sorguda işletme filtresi,
- bütün `wa_*` tablolarında RLS.

Eksikler kurulum, güvenlik ve ölçek tarafındaydı. Faz 1 ve 2 bunları kapattı. Asistanın konuşması değişmedi; `tests/wa-asistan-kilidi` yeşil.

## Faz 1 · pilot öncesi (main 7240e2d, göç 139)
- **Kimlere cevap versin** (`agent_config.answer_mode`): kişisel hatta bot arkadaşa ve aileye cevap vermez.
  - Varsayılan: müşteri ve ilk kez yazan numara.
  - Karar `_shared/agent/audience.ts` içinde verilir. Evolution geçmişine bakılır; sahip elle yazarsa numara tanıdık sayılır.
- **Yeni işletmenin varsayılanı:** kampanyalar kapalı, `scheduler_v2` açık. Mevcut işletmelere dokunulmadı.
- **Ayarlar → WhatsApp:**
  - akıllı asistan ve bu ayki kullanım,
  - deneme numaraları,
  - akıllı zamanlama.
- **`whatsapp-proxy`:**
  - gönderimde tür izin listesi,
  - metin uzunluk sınırı,
  - müşteri kimliğinin işletmeye ait olduğu kontrolü,
  - elle mesaja saatlik tavan.
- **DUR numaraya bağlı:** `wa_opt_out_phones`.
- **`webhook_secret`:** üyelere kapalı (kolon izni).

## Faz 2 · doğruluk ve işletme deneyimi (göç 140)
- **Ayar her yerde sahibin satırından:**
  - Sunucuda `_shared/org.ts ownerSettings` ve toplu okuma için `pickOwnerRows`.
  - Panelde `src/lib/ownerSettings.ts`.
  - İki tetikleyici (076, 077) de sahibin satırını okur.
  - Ekip üyesi adına yeni ayar satırı açılmaz.
- **`remind`:**
  - geri kazanma ve geri çağırma süzmesi sorguda yapılıyor (eskiden ~90 gün takılabiliyordu),
  - 40 sn bütçe ve adil sıra (`campaign_run_at`),
  - Evolution çağrılarına zaman aşımı.
- **"Müşteri sizinle görüşmek istiyor" bildirimi:**
  - masaüstünde müşteri kartını açar (`/mesajlar?phone=`),
  - `/takvim` takvime gider,
  - telefon uygulaması değişmedi (etiketten gider).
- **Uyarılar:**
  - `wa-saglik` ucu, dış izlemede WhatsApp sunucusu ve akıllı asistan kontrolleri (`WA_IZLE`),
  - asistanın aylık kullanımı %80'e ve %100'e gelince sahibe bildirim.

## Faz 3 · telefon uygulaması (1.0.2 yayınıyla)
- Onay mesajı ortak kalıba (`bookingConfirmation`): hazırlık notu ve hitapla.
- Telefondan iptal edince "müşteriye haber ver" seçeneği (masaüstündeki gibi, işaretli gelir).
- WhatsApp bağlama ekranı (QR). Şu an yalnız masaüstünde var.
- Devretme bildirimi müşteri kartına gitsin. Şu an `wa.me`'ye gidiyor; bu ancak müdürün telefonu işletmenin hattıysa doğru.

## Faz 4 · 10+ işletmede alınacak kararlar (kod yok)
1. **WhatsApp sunucusu:** Tek bir Evolution sunucusu var ve resmî olmayan API ile çalışıyor (Baileys; ban riski).
   - 20+ işletmede ikinci sunucuya mı, Meta Cloud API'ye mi geçilecek?
   - Gönderimler arasında bekleme ve işletme başına günlük tavan konacak mı?
2. **Yapay zekâ maliyeti:** Tek bir Anthropic anahtarı var; işletme başına bütçe 25 $.
   - Ses çözümü (Groq) ve eski botun yapay zekâ çağrıları bütçeye sayılmıyor.
   - Bu maliyet fiyata nasıl yansıyacak, karar verilmedi.
3. **Şube:** `settings.user_id` tekil. Aynı kişinin ikinci işletmesi için ayar satırı açılamıyor; şube kararıyla birlikte ele alınacak.
4. **Üyelik ekleme kuralı (platform geneli):** Sahip, kimliğini (UUID) bildiği her kullanıcıyı kendi işletmesine ekleyebiliyor.
   - Davet akışı gelince daraltılmalı.
   - İstemci `orgId` göndermeli.
5. **Son 10 hane eşleşmesi:** `findCustomerByPhone` yabancı bir numarayı yanlış müşteriye eşleyebilir. Olasılık düşük.
