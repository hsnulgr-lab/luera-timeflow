# Hazırlık · adım adım (para harcanmadan önce)

**Tarih:** 2026-11-19 · Aşama 3 · Sıra önemli: 1 → 9.
Her adım: **ne · neden · nasıl · ne görmelisin · bana ne söyle.**

> **Durum 2026-11-20 (reklam günü):** ✅ 0 · yeni hat + WhatsApp Business kurulu (hat SMS almıyor; sorun değil,
> Facebook'a bağlarken onay kodu WhatsApp'ın içine gelir). Bugünün sırası: 3 → 4 → 6 → 5 → 7 → reklam
> (`05-kampanya.md`) → 2 + 1 (kupon; **ilk satın alma bağlantısından önce** şart, reklamı bekletmez).
> 8 (Higgsfield) bugün gerekmez. Konuşma metinleri: `04-haftalik.md`.

| # | İş | Kim | Süre |
|---|---|---|---|
| 0 | WhatsApp numarası kararı | **Sen karar ver** | — |
| 1 | Kupon kodunu canlıya alma (deploy) | Sen (benim değişikliğim) | 10 dk |
| 2 | Dodo'da `ANKARA50` kuponu | Sen | 5 dk |
| 3 | Facebook sayfası "TimeFlow by Luera" | Sen | 10 dk |
| 4 | @luera_ai'yı sayfaya bağla | Sen | 5 dk |
| 5 | Reklam hesabı (TRY · İstanbul) + kart | Sen | 10 dk |
| 6 | WhatsApp Business + sayfaya bağlama + ayarlar | Sen (metinler benden) | 20 dk |
| 7 | Instagram profil tazeleme | Sen (metinler benden) | 10 dk |
| 8 | Higgsfield Plus | Sen | 5 dk |
| 9 | Takip tablosu | Hazır (`takip.csv`) | — |

---

## 0 · WhatsApp numarası — ✅ KARAR (2026-11-20): yeni, ayrı hat

**Ne yap:** Yeni bir hat al ve **yalnız WhatsApp Business uygulamasına** kaydet.
**Nasıl:**
1. Operatör mağazasından ya da uygulamasından **ön ödemeli hat** ya da **eSIM** (iPhone'un çift
   SIM desteği var; ikinci telefon gerekmez). Hat senin adına olacak (kimlikle).
2. iPhone → Ayarlar → Hücresel → eSIM ekle (ya da fiziksel SIM'i tak). Bu hattan arama/SMS
   alabildiğini dene: WhatsApp doğrulama kodu SMS ile gelecek.
3. App Store → **WhatsApp Business** (yeşil kutulu "B" simgeli olan; normal WhatsApp değil) → kurarken **yeni
   hattın numarasını** gir. Kişisel WhatsApp'ın aynı telefonda ayrı uygulama olarak kalır.
4. Bu numarayı **hiçbir yere bağlama**: TimeFlow'un WhatsApp ayarlarına (QR/numarayla bağla)
   ve Evolution'a **girmeyecek**. Yalnız Facebook sayfasına bağlanacak (6. adım).
**Ne görmelisin:** telefonda iki WhatsApp: kişisel (yeşil) ve Business (B); Business'ta yeni numara.
**Bana söyle:** "hat hazır" + numaranın son 2 hanesi (kreatiflerde numara **görünmeyecek**,
yalnız ölçüm notu için).

<details><summary>Kararın gerekçesi (eski metin)</summary>

**Ne:** Reklama tıklayan salon sahibi hangi numaraya yazacak?
**Neden önemli:** Bir numara aynı anda hem WhatsApp Business uygulamasında hem bizim WhatsApp
asistanı/hatırlatma hattında (Evolution) olursa, reklamdan gelen salon sahibine **salon botu
cevap verebilir** ya da konuşmalar karışır. Bir Facebook sayfası da tek bir WhatsApp hesabına bağlanır.
**Seçenekler:**
- **(Önerim) Yeni, ayrı bir hat** (ucuz faturasız/ön ödemeli SIM ya da eSIM) → telefonunda
  WhatsApp Business uygulaması. Temiz, ölçülebilir, kişisel hayatına karışmaz.
- Kişisel numaran: hızlı ama reklam mesajları özel mesajlarına karışır, numaran herkese açılır.
- Zaten Evolution'a bağlı bir hat (Test Salon 2'nin hattı vb.): **olmaz**, asistanla karışır.

</details>

---

## 1 · Kupon bağlantısını canlıya almak (benim kodum, senin deploy'un)

**Ne:** `timeflow.lueratech.com/satin-al?plan=pro&cycle=monthly&kod=ANKARA50` bağlantısı Dodo
ödeme sayfasını kuponla açar. Kod `claude/reklam-ilk-musteriler-77c254` dalında, commit
`6906137`; testler temiz, **push edilmedi**.
**Neden:** Bugün kupon girecek bir yer yok; bu olmadan teklif uygulanamaz.
**Nasıl (sıra önemli):**
1. Dal main'e alınır (onay verirsen ben main'in üstüne yeniden dizip hazırlarım; gönderme sende).
2. **Ana klasörden, main'deyken** edge function'lar:
   ```bash
   scripts/deploy-functions.sh dodo-satin-al dodo-checkout
   ```
   ⚠️ Bu betik `_shared` klasörünü **silerek eşitler**. Başka bir daldan çalıştırılırsa
   WhatsApp fonksiyonlarını bozar. Yalnız güncel main'den.
3. Coolify → TimeFlow (masaüstü) → **Deploy** (sayfa tarafı).

**Ne görmelisin:** Oturum açmamış bir tarayıcıda (gizli sekme) bağlantıyı açınca önce
"Ödeme sayfası açılıyor… İndirim kodu ANKARA50 ödeme sayfasında uygulanır" yazısı, sonra Dodo
sayfası. Dodo özetinde **indirim satırı** ve deneme sonrası ilk tahsilatta **649,50 TL** (Ekip).
Ödeme yapmadan **sekmeyi kapat** — sayfayı görmek yeter.
**Bana söyle:** Dodo özetinin ekran görüntüsü (kart bilgisi yokken).

---

## 2 · Dodo'da kupon

**Ne:** `ANKARA50` adlı indirim kodu.
**Neden:** Kod bağlantısı yalnız kodu taşır; indirimi Dodo uygular.
**Nasıl:** Dodo paneli (**Live** kipte) → Discounts / İndirimler → Create:
- Kod: `ANKARA50` (büyük harf)
- Tür: **yüzde**, **50**
- **Abonelik dönemi sınırı: 2** (2 fatura dönemi)
- Ürünler: **yalnız 3 aylık TimeFlow ürünü** (Tek kişilik, Ekip, İşletme — aylık)
- Son kullanma: **31.12.2026**
- Kullanım sınırı: istersen 100

**Ne görmelisin:** listede `ANKARA50 · 50% · 2 cycles · expires Dec 31, 2026`.
**Bana söyle:** "oluşturdum" + Dodo'nun "abonelik dönemi" alanını nasıl adlandırdığı (ekran görüntüsü).

---

## 3 · Facebook sayfası

**Ne:** "TimeFlow by Luera" adında işletme sayfası, kategori **Yazılım**.
**Neden:** Instagram ve WhatsApp reklamları bir Facebook sayfası üzerinden verilir.
**Nasıl:** facebook.com → sol menü **Sayfalar** → **Yeni sayfa oluştur** → ad + kategori →
profil fotoğrafı = TimeFlow logosu (uygulama ikonu), kapak = boş bırakabilirsin.
**Ne görmelisin:** sayfa açıldı, adın sayfada görünmüyor (sen yöneticisin).
**Bana söyle:** sayfanın bağlantısı.

---

## 4 · @luera_ai'yı sayfaya bağla

**Nasıl:** Instagram → Profil → ☰ → **Hesaplar Merkezi** → Hesaplar → Hesap ekle → Facebook →
"TimeFlow by Luera" sayfasının bağlı olduğu Facebook hesabın.
Sonra Facebook sayfası → Ayarlar → **Bağlı hesaplar** → Instagram → @luera_ai görünmeli.
**Ne görmelisin:** sayfa ayarlarında "Instagram: @luera_ai bağlı".
**Bana söyle:** bağlandı / takıldığın ekranın görüntüsü.

---

## 5 · Reklam hesabı + kart

**Ne:** Meta Business (business.facebook.com) içinde reklam hesabı.
**Neden:** Bütçeyi gün gün kontrol etmek, birden çok kreatifi aynı anda denemek için.
**Nasıl:** business.facebook.com → **Ayarlar** → Hesaplar → **Reklam hesapları** → Ekle →
Yeni reklam hesabı oluştur:
- Ad: `TimeFlow Reklam`
- **Saat dilimi: (GMT+03:00) İstanbul**
- **Para birimi: Türk Lirası (TRY)** ⚠️ sonradan **değişmez**
- Bu hesabı "kendi işletmem" için kullan.
Sonra **Faturalama ve ödemeler** → ödeme yöntemi → kartın. Meta faturaya **%5 konum ücreti**
ekler (dijital hizmet vergisi); faturaları sakla.
**Ne görmelisin:** Reklam Yöneticisi'nde hesap adı ve "TRY".
**Bana söyle:** hesap kimliği (act_… numarası) — reklam kurulumunu buna göre anlatacağım.

---

## 6 · WhatsApp Business

**Ne:** 0. adımda seçtiğin numarada WhatsApp Business uygulaması + Facebook sayfasına bağlantı.
**Nasıl:**
1. Uygulamayı kur, işletme adı **"TimeFlow · Salon Randevu Programı"**, kategori **Yazılım**.
2. **Araçlar → Facebook ve Instagram** → giriş → "TimeFlow by Luera" sayfası → **WhatsApp'ı bağla**.
   Onay kodu **WhatsApp'ın içine mesaj olarak** gelir; "SMS ile gönder" seçeneği çıkarsa WhatsApp olanı seç.
3. **İşletme profili:**
   - Açıklama: `Güzellik salonu, nail bar, epilasyon ve kuaförler için randevu programı. Hatırlatmalar sizin WhatsApp numaranızdan gider.`
   - Web sitesi: `https://lueratech.com/?utm_source=whatsapp&utm_medium=profil&utm_campaign=ankara-test`
   - Çalışma saatleri: 09:00–21:00
4. **Karşılama mesajı** (Araçlar → Karşılama mesajı, açık):
   > Merhaba, yazdığınız için teşekkürler! Ben Furkan, TimeFlow'u ben yapıyorum. Salonunuz hangi alanda ve kaç kişi çalışıyorsunuz? Birazdan döneceğim.
5. **Uzakta mesajı** (21:00–09:00):
   > Şu an salonlar kapalı, biz de :) Sabah 09:00'dan sonra ilk iş size döneceğim.
6. **Hızlı yanıtlar** (Araçlar → Hızlı yanıtlar): `/fiyat`, `/kurulum`, `/android`, `/bağlantı`,
   `/veri` — metinleri `04-haftalik.md` §3'te.
7. **Etiketler** (sohbete basılı tut → Etiketle): `1-Yeni`, `2-Gösterim`, `3-Deneme`, `4-Ödedi`,
   `5-Kayıp`. Huni bu etiketlerden sayılır.
**Ne görmelisin:** Facebook sayfasında "WhatsApp: bağlı"; kendine başka telefondan yazınca karşılama mesajı.
**Bana söyle:** bağlandı + karşılama mesajı geldi mi.

---

## 7 · Instagram profil tazeleme

**Neden:** Reklamı gören profile bakar; bugünkü ad "Luera • Dijital Ekibiniz" ne sattığını söylemiyor.
- **Ad alanı:** `TimeFlow · Salon Randevu Programı` (kullanıcı adı @luera_ai **kalır**)
- **Kategori:** Yazılım
- **Bio:**
  ```
  Salon, nail bar, epilasyon ve kuaförler için randevu programı
  Hatırlatma sizin WhatsApp numaranızdan · Kasa · Paket takibi
  Ankara'ya özel: 7 gün ücretsiz + ilk 2 ay %50 👇
  ```
- **Bağlantı:** `https://lueratech.com/?utm_source=instagram&utm_medium=bio&utm_campaign=ankara-test`
- **İletişim düğmesi:** WhatsApp (0. adımdaki numara)
- **3 sabit gönderi ve öne çıkan kapakları:** kreatif aşamasında üretilecek (Nedir · Nasıl
  başlarım · Ankara teklifi).
**Ne görmelisin:** profil başında yeni ad ve WhatsApp düğmesi.

---

## 8 · Higgsfield Plus

**Ne:** Plus **aylık** ($39 → 1.000 kredi). Yıllık ($27/ay) daha ucuz ama 12 ay bağlar.
**Neden:** İlk set ~700–850 kredi (bkz. `01-arastirma.md` §4). 10 krediyle tek video bile çıkmaz.
**Dikkat:** "3 günlük ücretsiz deneme" kart ister ve iptal edilmezse **$79 Ultra** çeker → önermiyorum.
**Bana söyle:** "geçtim" — her üretimden önce kredi tutarını sana sorup onay alacağım.

---

## 9 · Ölçüm

**Uygulamada ziyaretçi ölçümü yok** (UTM'yi okuyan araç yok). Zincir şöyle kurulur:

1. **Kreatife özel ön metin:** her reklamın "hazır mesajı" farklı bir harf taşır:
   `Merhaba, TimeFlow hakkında bilgi almak istiyorum. Kod: A1` → WhatsApp'a gelen ilk mesajdan
   hangi kreatif olduğu okunur. Kod listesi `03-kreatifler.md`'de.
2. **WhatsApp etiketleri** (6. adım): konuşma → gösterim → deneme → ödeme.
3. **Kupon:** Dodo'da hangi abonelik `ANKARA50` ile geldi; kodum artık ödeme kaydına
   `indirim_kodu` olarak da yazıyor.
4. **UTM** yalnız lueratech.com bağlantılarında (Framer analitiği okur):

| Yer | Bağlantı |
|---|---|
| Instagram bio | `https://lueratech.com/?utm_source=instagram&utm_medium=bio&utm_campaign=ankara-test` |
| WhatsApp profil | `https://lueratech.com/?utm_source=whatsapp&utm_medium=profil&utm_campaign=ankara-test` |
| WhatsApp'ta gönderilen satın alma | `https://timeflow.lueratech.com/satin-al?plan=pro&cycle=monthly&kod=ANKARA50` (kupon ölçer) |
| Türkiye geneli (hafta 3+) | aynı, `utm_campaign=tr-genel` ve `kod=ILK50` |

5. **Takip tablosu:** `takip.csv` — her konuşma bir satır (Numbers/Excel'de açılır).
