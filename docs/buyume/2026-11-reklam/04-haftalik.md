# 04 · WhatsApp satış metinleri + günlük/haftalık rapor

**Aşama 6.** Reklamdan gelen salon sahibiyle yeni hattaki **WhatsApp Business**'ta nasıl konuşulur.
Metinler kopyala-yapıştır içindir; kendi ağzına göre değiştir. Yalnız ⚠️ işaretli cümleleri
**doğrulamadan** gönderme.

**Altın kurallar**
1. **1 saat içinde dön** (09:00–21:00). Reklamdan gelen konuşmanın değeri ilk saatte en yüksek.
2. **Önce sor, sonra anlat.** İlk mesajda fiyat listesi yapıştırma; hangi salon, kaç kişi, şu an ne kullanıyor.
3. **Tek hedef: 10 dakikalık kurulum görüşmesi** (telefon ya da görüntülü). Satış orada olur.
4. **Söz verilmeyecekler:** WhatsApp'tan otomatik cevap veren asistan · SMS · kapora/online ödeme ·
   şube · "gelmeyen müşteri %X azalır" gibi rakam · rakip adı.
5. Konuşmayı açtığın an etiketle (aşağıda §4) ve `takip.csv`'ye bir satır aç.

---

## 1 · Konuşma akışı

```
(A1) ile gelen mesaj
  → karşılama mesajı otomatik gider (salon alanı + kişi sayısı sorar)
  → 1 · Tanı:  ne iş, kaç kişi, şu an randevuyu nerede tutuyor, en büyük derdi ne
  → 2 · Dert → çözüm: tek cümle, onun derdine göre (§2)
  → 3 · Görüşme teklifi: "10 dakika telefonda birlikte kuralım"
  → 4 · Görüşmede: hesap açılır (bağlantı §3/bağlantı), hizmetler girilir, WhatsApp bağlanır, ilk hatırlatma görülür
  → 5 · Deneme 7 gün: 2. gün ve 6. gün kısa yoklama (§5)
  → 6 · Ödedi / Kayıp (nedeni yazılır)
```

---

## 2 · Konuşma metinleri

### 2.1 · İlk cevap (karşılama mesajına cevap geldikten sonra)
> Teşekkürler 🙏 [nail bar / güzellik salonu] için çok uygun. Şu an randevuları nerede tutuyorsunuz: defter mi, WhatsApp mı, başka bir program mı? En çok neyle uğraşıyorsunuz: gelmeyen müşteri mi, telefon trafiği mi, paket ve kasa takibi mi?

Karşılama mesajı gitmediyse (gece, hata):
> Merhaba, yazdığınız için teşekkürler! Ben Furkan, TimeFlow'u ben yapıyorum. Salonunuz hangi alanda ve kaç kişi çalışıyorsunuz?

### 2.2 · Derde göre tek cümle

| Dediği | Sen |
|---|---|
| "Müşteri gelmiyor / unutuyor" | "TimeFlow randevudan 1 gün ve 2 saat önce, **sizin WhatsApp numaranızdan** hatırlatma gönderir. Müşteri Evet/Hayır diye cevaplar, panelde 'Gelirim dedi' ya da boşalan saat olarak görürsünüz." |
| "Telefon/WhatsApp çok yoğun" | "Size online randevu sayfası açılır; müşteri boş saati kendisi seçer, randevu takviminize düşer. Siz işlemdeyken telefona bakmanız gerekmez." |
| "Defter tutuyorum" | "Defteri bırakmanız gerekmiyor: 7 gün ikisini yan yana kullanın. Fark, defterin hatırlatma göndermemesi." |
| "Paket/seans takibi" | "Müşterinin paketinde kaç seans kaldığı ve ne kadar borcu olduğu randevuda görünür; kasa gün sonunda kendiliğinden toplanır." |
| "Personelim var" | "Ekip paketinde personel sınırı yok; her personel kendi randevularını iPhone uygulamasından görür." ⚠️ Android personel uygulaması henüz yok, sorarsa §3 `/android`. |

### 2.3 · Görüşme teklifi (her konuşmada hedef)
> En kolayı şu: 10 dakika telefonda birlikte kuralım. Hizmetlerinizi girer, WhatsApp'ınızı bağlarız, ilk hatırlatmanın nasıl gittiğini kendi telefonunuzda görürsünüz. Bugün ya da yarın hangi saat uygun?

Saat verdiyse:
> Harika, [gün saat]'te arıyorum. O sırada bilgisayar ya da telefon yanınızda olsun, bir de salonun WhatsApp'ı açık olan telefon.

### 2.4 · Görüşmeye gelmeyen / cevap vermeyen (24 saat sonra, bir kez)
> Merhaba, dün TimeFlow için yazmıştınız. Hâlâ ilginizi çekiyorsa bu hafta 10 dakikalık bir kurulum yapabiliriz. Ankara'ya özel teklif (7 gün ücretsiz + ilk 2 ay %50) 31 Aralık'a kadar geçerli.

Bundan sonra **yazma**. Etiket `5-Kayıp`, neden "cevap yok".

---

## 3 · Hızlı yanıtlar (WhatsApp Business → Araçlar → Hızlı yanıtlar)

Kısayolu yazınca metin gelir. Beşini de ekle.

**`/fiyat`**
> Aylık paketler (randevu sınırı yok):
> • Tek kişilik (yalnız siz çalışıyorsanız): 799 TL → ilk 2 ay **399,50 TL**
> • Ekip (sınırsız personel + personel uygulaması): 1.299 TL → ilk 2 ay **649,50 TL**
> • İşletme (öncelikli + birebir kurulum desteği): 1.999 TL → ilk 2 ay **999,50 TL**
> Hepsinde önce **7 gün ücretsiz**. Ankara'ya özel indirim 31 Aralık'a kadar.

**`/kurulum`**
> Kurulumu ben yapıyorum, 10 dakika sürüyor: hesabınızı açarız, hizmetlerinizi ve çalışma saatlerinizi gireriz, salonun WhatsApp'ını QR kodla bağlarız (WhatsApp Web gibi). Hatırlatmalar o andan sonra sizin numaranızdan gider. Size uygun bir saat söyleyin, arayayım.

**`/android`** ⚠️ göndermeden önce Google Play durumunu kontrol et
> iPhone uygulaması App Store'da yayında. Android uygulaması henüz mağazada değil; o zamana kadar paneli bilgisayardan ve telefonun tarayıcısından kullanabilirsiniz.

⚠️ "Telefonun tarayıcısından" cümlesi, panelin Android telefon tarayıcısında rahat kullanıldığı **denenmeden** gönderilmez. Bir kez bir Android telefonda `timeflow.lueratech.com` açılıp Takvim ve Yeni randevu denenmeli. Google Play'de yayına girince bu metin değişir.

**`/bağlantı`** (paket konuşmada seçildikten sonra; doğru satırı bırak, ötekileri sil)
> Hesabınızı buradan açıyoruz, indirim kodu bağlantıda hazır:
> Tek kişilik: https://timeflow.lueratech.com/satin-al?plan=baslangic&cycle=monthly&kod=ANKARA50
> Ekip: https://timeflow.lueratech.com/satin-al?plan=pro&cycle=monthly&kod=ANKARA50
> İşletme: https://timeflow.lueratech.com/satin-al?plan=isletme&cycle=monthly&kod=ANKARA50
> Kart bilgisi istenir ama 7 gün dolmadan ücret çekilmez; istediğiniz an iptal edebilirsiniz.

⛔ Bu bağlantılar, kupon kodu **canlıya alınmadan** (`hazirlik-adim-adim.md` §1 + Dodo'da `ANKARA50`) gönderilmez. Yoksa indirim uygulanmaz.

**`/veri`**
> Müşteri bilgileriniz yalnız sizin hesabınızda durur, başka bir işletmeyle paylaşılmaz. Hatırlatma mesajlarını biz değil, sizin WhatsApp numaranız gönderir. Hesabınızı istediğiniz an uygulamadan silebilirsiniz.

---

## 4 · İtirazlar

| İtiraz | Cevap |
|---|---|
| **"Pahalı" / "ücretsiz program var"** | "Ücretsizlerde hatırlatma ya sınırlı ya SMS parası ayrı. Bizde hatırlatma sizin WhatsApp'ınızdan gider, randevu sınırı yok. İlk 2 ay 399,50 TL'den başlıyor; ayda bir gelmeyen müşteriyi önlemesi bile kendini çıkarır." |
| **"Başka program kullanıyorum"** | "Ne kullandığınızı sorabilir miyim? Hatırlatma sizin numaranızdan mı gidiyor, yoksa SMS mi?" → farkı **rakip adı vermeden** söyle: kendi numaradan WhatsApp, randevu sınırı yok, kurulumu birlikte. |
| **"Düşüneyim"** | "Tabii. Düşünürken denemek de ücretsiz: 7 gün içinde istediğiniz an iptal edersiniz. İsterseniz kurulumu yapalım, karar sizde kalsın." |
| **"Zaten defterim var"** | "Defter hatırlatma göndermiyor. 7 gün deneyin, defteri bırakmanız gerekmiyor; bir hafta ikisini yan yana kullanın." |
| **"Kurmakla uğraşamam"** | "Ben kuruyorum. 10 dakika telefonda; hizmetlerinizi birlikte gireriz, ilk hatırlatmayı görürsünüz." |
| **"Kartımı vermek istemiyorum"** | "7 gün dolmadan ücret çekilmez, istediğiniz an tek tuşla iptal edersiniz. Ödeme Dodo Payments üzerinden, kart bilgisi bizde tutulmuyor." |
| **"Fatura?"** | ⚠️ Şirket kurulana kadar cevap: "Ödeme Dodo Payments üzerinden alınıyor, makbuzu e-postanıza gelir." Dodo'nun gerçekte ne gönderdiği (fatura mı, makbuz mu) **teyit edilmeden** "fatura" deme. |
| **"Müşterilerime spam gider mi?"** | "Hayır. Yalnız randevusu olan müşteriye, randevudan önce iki hatırlatma gider. Toplu reklam mesajı göndermiyoruz." |
| **"Telefonum kapalıysa?"** | "WhatsApp Web gibi çalışır: salon telefonu internete bağlı olduğu sürece mesajlar gider. Bağlantı koparsa panelde uyarı görürsünüz, QR'ı yeniden okutursunuz." |

---

## 5 · Deneme süresinde yoklama

**2. gün:**
> Merhaba [ad], hatırlatmalar gidiyor mu, takılan bir şey var mı? Hizmet ya da personel eklemek isterseniz 5 dakikada birlikte yapalım.

**6. gün** (deneme yarın biter):
> Yarın deneme bitiyor, ilk ödeme ANKARA50 ile [399,50 / 649,50 / 999,50] TL olacak. Devam etmeden önce sormak istediğiniz bir şey var mı? Bu hafta kaç müşteriye hatırlatma gitti, bakalım mı?

---

## 6 · Etiketler (WhatsApp Business) ve takip

| Etiket | Ne zaman | `takip.csv` |
|---|---|---|
| `1-Yeni` | İlk mesaj geldi | satır aç: tarih, kreatif_kodu (A1…), sektör, kişi sayısı |
| `2-Gösterim` | Kurulum görüşmesi yapıldı | gosterim_tarihi |
| `3-Deneme` | Satın alma bağlantısından hesap açtı (7 gün başladı) | deneme_baslangic, paket |
| `4-Ödedi` | 7 gün sonra ilk ödeme geçti (Dodo'da görülür) | odedi_mi = evet |
| `5-Kayıp` | Vazgeçti / 24 saat + 1 hatırlatmadan sonra cevap yok | kayip_nedeni (fiyat · android · cevap yok · başka program · salon sahibi değil) |

Salon sahibi olmayanlar (müşteri, iş arayan, öğrenci) → `5-Kayıp`, neden **"salon sahibi değil"**.
Bu sayı, reklamın doğru kişiye gidip gitmediğini gösterir (`05-kampanya.md` §7).

**Gizlilik:** Bana konuşma aktarırken yalnız **soru + kreatif kodu + sektör** yaz. Salon adı, kişi
adı ve numara **gelmesin**. `takip.csv`'nin bir **kopyasını repo dışında** (ör. Belgeler klasörü) doldur;
repodaki dosya boş şablon olarak kalır, dolu hâli git'e girmez.

---

## 7 · Günlük kontrol (her akşam 21:00, 5 dk)

Bana şunları at:
1. Reklam Yöneticisi satırı ("Ankara test" sütunlarıyla) → ekran görüntüsü.
2. Bugün kaç WhatsApp konuşması geldi, kaçı `Kod: A1` (ya da başka kod) ile, kaçı gerçekten salon sahibi.
3. Takıldığın bir soru varsa o soru (adsız).

Ben de karşılığında: bugünün maliyeti, kural tablosuna göre (`05-kampanya.md` §7) "dokunma / ekle / değiştir" kararı.

---

## 8 · Haftalık rapor şablonu (her Pazar)

```
HAFTA: [tarih – tarih] · Kampanya: TF · Ankara test · WA

PARA
  Harcanan: ___ TL (+%5 konum ücreti: ___ TL)
  Gösterim: ___ · Erişim: ___ · 3 sn izleme oranı: ___%

HUNİ
  Konuşma: ___  (maliyet/konuşma: ___ TL)
    gerçek salon sahibi: ___ (%___)
  Gösterim (kurulum görüşmesi): ___
  Deneme başladı: ___
  Ödedi: ___  (müşteri başı maliyet: ___ TL)

KREATİF
  A1 v2: konuşma ___ · ___ TL/konuşma
  A3:    konuşma ___ · ___ TL/konuşma   (eklendiyse)
  D1 v2: konuşma ___ · ___ TL/konuşma   (eklendiyse)

KAYIP NEDENLERİ (ilk 3): 1) ___  2) ___  3) ___
EN ÇOK SORULAN: ___

KARAR (05-kampanya §7'ye göre): devam / kreatif ekle / kanca değiştir / büyüt (+%20)
```
