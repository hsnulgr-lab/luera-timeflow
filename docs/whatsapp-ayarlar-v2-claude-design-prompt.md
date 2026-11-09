# MASAÜSTÜ · Ayarlar → WhatsApp v2 — Claude Design promptu

**Yazıldı:** 2026-11-10. Luera TimeFlow masaüstü panelinde Ayarlar → WhatsApp
sayfası (`timeflow.lueratech.com/settings/whatsapp`). Sayfa çalışıyor; her
anahtar gerçekten bir şey yapıyor. Sorun **anlaşılmaması**: sahibi tasarımı
seviyor, ama başka bir işletme sahibi sayfayı açınca neyin ne yaptığını,
müşterisine hangi mesajın ne zaman gittiğini ve gelen mesaja kimin cevap
verdiğini çıkaramıyor.

Hedef: **bir bakışta "müşterime ne gidiyor, gelen mesaja kim cevap veriyor"
sorularını cevaplayan**, teknik kelimesiz, premium bir WhatsApp sayfası.
Ayarların hiçbiri kaybolmuyor; yerleri, isimleri ve sırası değişebilir.

**Effort: High.** Tek turda bitsin. Aşağıdaki her içerik maddesi gerçek ve
koddan doğrulandı:
- masaüstü sayfası: `src/pages/settings/bolumler/WhatsApp.tsx`,
- sunucu: `supabase/functions/whatsapp-proxy/index.ts`,
- gelen mesaj: `supabase/functions/whatsapp-booking/index.ts`,
- kimlere cevap: `supabase/functions/_shared/agent/audience.ts`.

Uydurma alan, uydurma sayı, uydurma özellik ekleme. Yeni bir veri gerekiyorsa
**"yeni veri"** diye işaretle; çizebilirsin ama ayrı tut.

---

## Ekler — `whatsapp-ayarlar-ekleri/` klasörü, yalnız bunlar

1. **`01`–`07 bugun-*.png` — bugünkü sayfa, yukarıdan aşağı.**
   - **İçerik envanteri olarak** bak; düzen ve hiyerarşi kopyalanmayacak.
   - Sayılar Test Salon 2'nin gerçek ama küçük verisi: 12 / 0 / 53 / 0, kullanım %2.
2. **`08 Luera Masaustu - Ayarlar v1.dc.html` (+ yanındaki `support.js`)** —
   masaüstü Ayarlar'ın **uygulanmış** tasarımı.
   - Bunlar AYNEN kalır: sol menü, Ayarlar'ın iç gezinmesi (Özet, İşletme, Müşterilerle iletişim, Hesap gruplar), başlık dili, anahtar, alan, düğme, kayıt çubuğu, açık/koyu tema.
   - Yeniden düşünülecek olan yalnız bu sayfanın **içerik alanı**.
3. **`09 Luera Mobil - Mudur 37 WhatsApp Baglama.html` (+ `m37-ekranlar.js`)** —
   telefonun yeni WhatsApp sayfası. Uygulandı ve telefonda denendi.
   - **Durum dili buradan:** Bağlı · Bağlı değil · Bağlantı düştü · Gelen mesajlar işlenmiyor · Kontrol ediliyor · Okunamadı.
   - Son hatanın insan diliyle yazılışı da buradan: "Son hata · bugün 10:12. Numarası geçersiz olduğu için bir hatırlatma gitmedi."
   - Masaüstü aynı kelimeleri kullanmalı.

`Durumlar.html` ve `Hareket Sözleşmesi.html` bu işin eki DEĞİL; geçerli
kurallar aşağıda yazılı.

---

## Bağlam — kim, ne için açıyor

- **Kim:** İşletme sahibi. Salon, klinik, diş; 40–55 yaş; teknik değil. Sayfayı kurulumda bir kez dikkatle, sonra ayda bir ya da bir şey ters gidince açıyor.
- **Hat ne:** İşletmenin WhatsApp numarası, Luera'nın sunucusuna "bağlı cihaz" olarak eklenir. Küçük işletmelerde bu çoğu zaman **sahibin kişisel numarası**; arkadaşları ve ailesi de bu numaraya yazıyor.
- **Sahibin üç sorusu:**
  1. **Müşterime ne gidiyor, ne zaman?** Hatırlatma, onay, teşekkür, "sizi özledik"…
  2. **Biri bana yazınca kim cevap veriyor?** Ben mi, basit bir bot mu, akıllı asistan mı? Arkadaşıma da cevap verir mi?
  3. **Çalışıyor mu?** Bağlı mı, mesajlar gitmiş mi, bir şey takıldı mı?

Bugünkü sayfa bu soruların cevabını veriyor, ama dağınık ve teknik kelimelerle.

---

## Bugünkü sayfa — neden anlaşılmıyor (ekran görüntülerinden ve koddan)

1. **İki anahtar aynı şeyi söylüyor gibi.**
   - "Gelen mesajlara bot cevap versin" (`features.assistant`) ile "Akıllı asistan" (`features.agent_v2`) alt alta duruyor.
   - Gerçekte üç ayrı durum var:
     - **hiç kimse cevap vermez,**
     - **basit (kalıplı) randevu botu** cevap verir,
     - **akıllı asistan** cevap verir.
   - Kullanıcı bunu iki anahtardan çıkaramıyor.
2. **"Kimlere cevap versin"in bağlamı kayıp.** Üç seçenek uzun cümlelerle anlatılıyor. Neden önemli olduğu söylenmiyor: kişisel numarada bot arkadaşa cevap vermesin.
3. **"Deneme numaraları · Deneme açık · 2"** jargon.
   - Asıl anlamı: asistanı herkese açmadan önce birkaç numarayla denemek.
   - Açıkken listede olmayanlara ya kalıplı bot cevap verir ya kimse ("Listede olmayanlara").
4. **"Bu ayki kullanım · %2"** neyin kullanımı belli değil. Gerçeği:
   - akıllı asistanın aylık kullanım hakkı (işletme başına sabit bir bütçe),
   - %80'de sahibe bildirim gidiyor,
   - %100'de ay sonuna kadar kalıplı bot cevap veriyor.
5. **Ham hata kodu:** "Son hata · `not_connected`".
6. **Gönderilen mesajlar dokuz uzun kart.**
   - Her kartta anahtar, açıklama ve büyük bir baloncuk önizlemesi var; sayfa çok uzuyor.
   - Kartlar zaman sırasında değil. Müşterinin yolculuğu (randevu alır → hatırlatılır → gelir → teşekkür → bir süre sonra davet) görünmüyor.
   - "Anahtarı yok: WhatsApp bağlıyken her zaman gider" gibi teknik cümleler var.
7. **"Akıllı zamanlama" anahtarı** (`scheduler_v2`) teknik. Kullanıcı ne değiştiğini bilmiyor.
   - Açıkken mesajlar randevu başına ayrı zamanlanır; kapalıyken yarım saatte bir toplu taranır.
   - İki mesajın "ne zaman" cümlesi bu anahtara göre değişiyor (aşağıda).
   - Yeni işletmelerde varsayılan açık.
8. **Kaydetme iki türlü ve fark görünmüyor.**
   - Anahtarlar ve seçimler anında kaydediliyor.
   - Metin alanları sayfanın kayıt çubuğuyla kaydediliyor.
9. **Asistanın bilgileri** (ödeme, iptal, ulaşım, notlar, sık sorulanlar) sayfanın ortasında beş uzun alan. Ne işe yaradığı tek cümleyle duruyor.

---

## İçerik envanteri — hepsi kalacak

### 1 · Bağlantı (hattın kendisi)
**Hâller ve kelimeleri (Müdür 37 ile aynı):**
- **Bağlı** · "29 Ekim'den beri". Numara yazılmaz; hat numarası sistemde kayıtlı değil.
- **Bağlı değil** · "Hatırlatmalar gitmiyor".
- **Bağlantı düştü** · "Mesajlar gitmiyor". Kırmızı yalnız burada.
- **Gelen mesajlar işlenmiyor** (amber) · hat bağlı ama gelen mesaja cevap verilemiyor; giden mesajlar etkilenmez. "Yeniden bağla".
- **Kontrol ediliyor** · iskelet.
- **Okunamadı** · gri. "Bağlı değil" demez.

**Bağlama (masaüstü):** "WhatsApp'ı bağla" → QR.
- Telefondan WhatsApp → Bağlı Cihazlar → Cihaz Ekle ile okutulur.
- QR her 60 sn'de yenilenir, sayaçlı.
- Bağlanınca sayfa kendiliğinden geçer.
- İstersen bir satırla "Telefondan da bağlayabilirsiniz: TimeFlow uygulaması → İşletme → WhatsApp" de.

**Sağlık:**
- Son 24 saatin dört sayısı: Gönderildi, Başarısız, Atlandı, Gelen.
- **Atlandı** = kural gereği gönderilmedi: müşteri "DUR" dedi, günlük sınır doldu, numara yok ya da o an hat bağlı değildi. Bu bir hata değil; kısa açıklama hak ediyor.
- **Son hata** insan diliyle ve saatle. Türler:
  - numara geçersiz,
  - bağlantı yok,
  - oturum düştü,
  - WhatsApp o an cevap vermedi,
  - sunucuya ulaşılamadı,
  - diğer.

  Ham kod hiç görünmez. Veri hazır: `health` cevabında `lastFailure {kind, at, message}`.

**Test mesajı:** numara alanı + Gönder; sonuç satırı:
- "Gönderildi. Telefonu kontrol edin."
- ya da "Gönderilemedi. Numara geçersiz."

**Bağlantıyı kes…:** onay penceresi. Metin: "Bağlantı kesilince hatırlatmalar ve mesajlar gitmez. Yeniden bağlamak için QR'ı tekrar okutmanız gerekir."

### 2 · Gelen mesajlar — kim cevap veriyor
**Bugünkü iki anahtarın gerçeği** (birleştirebilirsin; veri iki bayrak olarak kalır):

| `features.assistant` | `features.agent_v2` | Ne olur |
|---|---|---|
| kapalı | — | Kimse cevap vermez. Mesaj kaydedilir, sahip telefonundan cevaplar. |
| açık | kapalı | Kalıplı randevu botu cevap verir: hizmet, gün ve saati anlar, boş saatleri sunar, onaylanınca randevuyu kurar. |
| açık | açık | Akıllı asistan doğal dille konuşur: soruları işletme bilgilerinden cevaplar, saat sunar, randevu kurar, erteler, iptal eder. |

Öneri: tek soru, üç seçenek ("Gelen mesajlara kim cevap versin? · Ben · Randevu botu · Akıllı asistan"). Daha iyisini bulursan onu çiz.

**Kimlere cevap versin** (her iki bot için geçerli; `agent_config.answer_mode`):
- **Müşterilerim ve ilk kez yazanlar** (ÖNERİLEN, varsayılan) — daha önce yazıştığı ama müşterisi olmayan kişilere (arkadaş, aile, tedarikçi) cevap vermez.
- **Yalnız kayıtlı müşterilerim.**
- **Herkes** — "Hat yalnız işletmenize aitse seçin."
- Kural: sahip, müşterisi olmayan birine telefonundan elle yazarsa bot o kişiye bundan sonra cevap vermez.
- Gerekçe görünür olmalı: kişisel numarada bot arkadaşa cevap vermesin.

**Akıllı asistanın aylık kullanımı:** % ve ince çubuk.
- %80'de sahibe bildirim gider.
- %100'de "Bu ayın kullanım hakkı doldu; ay sonuna kadar randevu botu cevap veriyor."
- Tutar (dolar) gösterilmez; yalnız yüzde.

**Deneme modu** (`test_numbers`, en çok 10):
- Doluysa akıllı asistan yalnız bu numaralarla konuşur.
- Listede olmayanlara iki seçenek: randevu botu cevap versin / kimse cevap vermesin.
- Boşaltınca herkese açılır.
- Seyrek kullanılan bir şey; katlanmış durabilir.

**Her zaman çalışan:** "DUR" yazan müşteri mesaj listesinden çıkar.

**Asistanın bilgileri** (yalnız akıllı asistan kullanır):
- Alanlar:
  - Ödeme yöntemleri,
  - İptal ve gecikme,
  - Ulaşım ve otopark,
  - Diğer notlar,
  - Sık sorulanlar (en çok 20 soru-cevap).
- Kural: yazılmayan konuda asistan tahmin etmez, "ekibimize sorup döneyim" der.
- Akıllı asistan seçili değilken ya gizlenir ya "akıllı asistan seçilince kullanılır" diye sönük durur; sen öner.

### 3 · Müşteriye giden mesajlar
**Zaman sırası** (Akıllı zamanlama açıkken). Çizim bu sırayı göstermeli:

| Mesaj | Ne zaman | Anahtar | Ayarı |
|---|---|---|---|
| Randevu onayı | Randevu oluşur oluşmaz (panel, online randevu, WhatsApp botu) | var | — |
| 24 saat önce hatırlatma | Randevudan 24 saat önce; "Gelebilecek misiniz? Evet ya da Hayır" | **yok, hep gider** | — |
| 2 saat önce hatırlatma | Randevudan 2 saat önce | **yok, hep gider** | — |
| Google değerlendirme | Bitiminden 30 dk sonra memnuniyet sorulur; puan verene Google linki | var | Google değerlendirme linki (yoksa: "puan sorulur ama link gitmez") |
| Sıradaki randevu daveti | Ödemeden 1,5 saat sonra; ileri randevusu olana ve memnun kalmayana gitmez | var | Teşvik satırı, isteğe bağlı ("🎁 …" olarak eklenir); koşullar: WhatsApp bağlı ✓, randevu adresi tanımlı ✓ |
| Paket yenileme | Tüm seansları biten paketin sahibine, paket başına bir kez | var | — |
| Dönüş hatırlatması · *sektöre göre ad* ("bakım yenileme", "kontrol") | Son ziyaretten ~30 gün sonra, tarihe 2 gün kala bir kez | var | **Yalnız bazı sektörlerde**; ad ve gün "Mesaj dili"nden |
| Sizi özledik | 60 günden uzun gelmeyen, ileri randevusu olmayana bir kez | var | İndirim teklifi: % ve kaç gün geçerli. Kişiye özel kod üretilir, Kasa'da girilince uygulanır. Oran 0 ise indirimsiz gider |

**Akıllı zamanlama KAPALIYKEN değişen iki cümle:**
- Google değerlendirme: "Hesap kapandıktan ~3 saat sonra, randevu başına bir kez."
- Sıradaki randevu daveti: "Randevu tamamlanınca tekrar randevu daveti."

**Önizleme:** her mesajın gerçek metni bir WhatsApp baloncuğunda, örnek müşteriyle (Ayşe Hanım, sektörün ilk hizmeti).
- Önizleme hep açık olmak zorunda değil: tıklayınca açılan, yan panelde gösterilen ya da tek bir "örnek" alanında değişen bir önizleme olabilir.
- Metinler tasarımdan değil koddaki kalıplardan gelir; çizimdeki metin örnektir.

**Hat bağlı değilken:** bütün mesajlar sönük, "WhatsApp bağlı değil — bu mesajların hiçbiri gitmiyor."

**Mesaj dili** (bugün en altta, katlanmış; "Sektör varsayılanı" / "Kendi mesaj diliniz"). Alanlar:
- Karakter,
- Muhatap,
- "…hatırlatmak istedik" ifadesi,
- Emoji (tek alan, ≤4 karakter),
- Dönüş kavramı ve kaç gün sonra (yalnız dönüş hatırlatması olan sektörde).

**Akıllı zamanlama anahtarı:** kalacak ama öne çıkmak zorunda değil ("Gelişmiş" gibi bir yere alınabilir). Açınca ileri tarihli randevuların mesajları hemen planlanır.

---

## Kurallar ve sınırlar

- **Dil:**
  - Türkçe, "siz" hitabı, kısa cümle.
  - Teknik kelime yok: bot anahtarı, agent, webhook, instance, API, `not_connected`, scheduler, "anahtarı yok".
  - "AI" yerine "akıllı asistan".
  - "Dijital çalışan / dijital ekip" ifadesi KULLANILMAZ.
- **Renk anlam taşımaz:** durum hep kelimeyle yazılı.
  - Kırmızı yalnız "bağlantı düştü" ve "bağlantıyı kes".
  - Amber uyarı, kırmızı değil.
  - WhatsApp yeşili yalnız logo ve baloncuklarda.
- **Kaydetme:**
  - Anahtar ve seçimler anında kaydedilir (yanında "Kaydedildi").
  - Metin alanları kayıt çubuğuyla.
  - İkisi görsel olarak ayrışmalı ya da hepsi tek davranışa çekilmeli; seçimini gerekçelendir.
- **Asistanın KONUŞMASI bu işin konusu değil:** asistanın kuralları, cümleleri ve modeli kilitli. Yalnız ayarların sunuluşu değişiyor.
- **Masaüstü kırılımları:** 1440 × 900 ana kare; ayrıca 1280 × 800, 1024 × 768 ve 768 × 1024. 768'in altı telefon yüzü, çizme.
- **Tema:** açık + koyu, tek düğmeyle değişsin.
- **Hareket:** yalnız opaklık, kaydırma, ölçek; kısa. Hareketi azalt açıkken süreler 0.
- **Erişilebilirlik:** her anahtarın ve seçimin metin etiketi var. Klavyeyle gezilir, odak halkası görünür.

## Kapsam dışı (bu turda çizme)

- Telefondaki WhatsApp ekranları (Müdür 37, uygulandı).
- Sol menü ve Ayarlar'ın iç gezinmesi (Ayarlar v1).
- Asistanın konuşma içeriği, mesaj kalıplarının metni.
- Faturalama, ödeme, yeni özellik.

---

## Teslim

- **Tek HTML:** `Luera Masaustu - WhatsApp v2.html`. Kareler sırayla, her karenin başında kodu.
- **Çizilecek hâller:**
  - **W1** Bağlı · her şey yolunda (ana kare). Ayrıca 1280, 1024, 768.
  - **W2** Bağlı değil · ilk tanışma + QR'lı bağlama (QR bekleniyor, sayaç).
  - **W3** Bağlantı düştü.
  - **W4** Gelen mesajlar işlenmiyor (amber).
  - **W5** Kontrol ediliyor (iskelet) ve Okunamadı.
  - **W6** Gelen mesaj seçenekleri: "Ben cevaplarım" · "Randevu botu" · "Akıllı asistan".
  - **W7** Akıllı asistan · kullanım %80 uyarısı ve %100 (randevu botuna düştü).
  - **W8** Deneme modu açık (2 numara).
  - **W9** Son 24 saatte başarısız mesaj var · son hata insan diliyle.
  - **W10** Bir mesaj türünün önizlemesi açık.
  - **W11** Sizi özledik · indirim teklifi düzenlenirken; Google linki boş uyarısı.
  - **W12** Mesaj dili açık.
  - **W13** Bağlantıyı kes onayı.
- **Her karenin altında bir satır:** ne zaman görünür.
- **Karar başına tek cümle gerekçe;** hareket için tek satır (özellik · ms · eğri).
- **Yeni veri gerektiren yer olursa "yeni veri" etiketi.** Bilinen hazır veriler: bağlantı tarihi, `link`, `inboundBroken`, `lastFailure`, `last24h`, kullanım %, `answer_mode`, `test_numbers`, `features`.

---

### Claude Design'da küçük kutuya

> Luera TimeFlow masaüstü: Ayarlar → WhatsApp sayfasının yeniden tasarımı (v2). Sayfa çalışıyor ama işletme sahibi anlamıyor: müşteriye ne zaman ne gidiyor, gelen mesaja kim cevap veriyor, hat çalışıyor mu — bunlar bir bakışta görünmeli. Ayrıntılar ekteki BRIEF dosyasında; ekler whatsapp-ayarlar-ekleri klasöründe. Sol menü ve Ayarlar gezinmesi aynen kalır, yalnız içerik alanı. Açık + koyu, tüm hâller, tek HTML.

**Effort: High.**
