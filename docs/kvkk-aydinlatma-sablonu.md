# KVKK Aydınlatma Metni — İşletme Şablonu

> **Bu bir hukuki tavsiye değildir.** Şablon, salonun kendi metnini yazarken
> hangi başlıkları doldurması gerektiğini gösterir. Yayınlamadan önce bir
> hukukçuya okutulmalıdır.

## Neden metni Luera yazmıyor

KVKK'da **veri sorumlusu her salonun kendisidir**; Luera yalnız veri işleyendir.
Aydınlatma metni salonun kendi beyanıdır: unvanı, adresi, saklama süresi,
irtibat kişisi kendi bilgileridir. Bu yüzden ürün metni yazmaz, salonun
yayınladığı metne **bağlantı verir**.

Bağlantı `Ayarlar → İşletme Profili → KVKK Aydınlatma Metni Linki` alanına
girilir. Randevu sayfasındaki onay kutusunun yanında görünür. Alan boş olsa bile
**onay kutusu zorunludur** ve onay zaman damgasıyla randevuya yazılır
(`custom_fields.kvkk_onay`); sunucu tarafı da onaysız kaydı reddeder.

## Metnin doldurulacak yerleri

Aşağıdaki `[köşeli parantezler]` salonun kendi bilgileriyle değiştirilir.

---

### [SALON UNVANI] Kişisel Verilerin Korunması Aydınlatma Metni

**Veri sorumlusu:** [Salon ticari unvanı], [açık adres], [telefon], [e-posta].

**İşlenen veriler.** Ad-soyad, telefon numarası, e-posta adresi, randevu tarih
ve saatiniz, aldığınız hizmetler, ödeme kayıtları ve varsa tarafınızca
paylaşılan sağlık/uygunluk bilgileri (örneğin hamilelik, alerji, cilt tipi).

> Sağlık bilgisi **özel nitelikli** kişisel veridir. Bu tür bir alan
> topluyorsanız (güzellik modülünde hamilelik ve alerji alanları vardır)
> metninizde ayrıca ve açıkça belirtilmelidir; açık rıza gerekir.

**İşleme amaçları.** Randevunuzun oluşturulması ve yönetilmesi, randevu
hatırlatması ve onayının iletilmesi, aldığınız hizmetin kaydının tutulması,
uygulanamayacak işlemlerin önceden tespiti, ücret ve paket takibi, yasal
saklama yükümlülüklerinin yerine getirilmesi.

**Hukuki sebep.** Sözleşmenin kurulması ve ifası (KVKK m.5/2-c), hukuki
yükümlülük (m.5/2-ç), meşru menfaat (m.5/2-f); sağlık bilgileri bakımından açık
rızanız (m.6).

**Aktarım.** Verileriniz [salon adı] tarafından; randevu yönetim yazılımı
sağlayıcısı (Luera Teknoloji — veri işleyen), WhatsApp üzerinden mesaj iletimi
ve yasal olarak yetkili kamu kurumları ile sınırlı olarak paylaşılır. Yurt dışına
aktarım [varsa açıklayın: WhatsApp altyapısı nedeniyle veriler yurt dışında
işlenebilir].

**Saklama süresi.** [Örn. müşteri ilişkisinin sona ermesinden itibaren 10 yıl —
kendi yasal saklama yükümlülüğünüze göre belirleyin.]

**Haklarınız (KVKK m.11).** Verilerinize erişme, düzeltilmesini veya silinmesini
isteme, işlenmesine itiraz etme ve verilerinizin bir kopyasını alma
(taşınabilirlik) haklarına sahipsiniz. Başvurularınızı [e-posta / adres]
üzerinden iletebilirsiniz.

**Mesaj almayı durdurma.** WhatsApp mesajlarına "DUR" yazarak bilgilendirme
mesajlarını istediğiniz an durdurabilirsiniz.

---

## Salonun ayrıca yapması gerekenler

- Metni kendi web sitesinde ya da erişilebilir bir sayfada **yayınlamak**
- Bağlantıyı Ayarlar'daki alana girmek
- Personelini bilgilendirmek: müşteri verisi salonun sorumluluğundadır
- Müşteri talep ederse verisini dışa aktarabilmek veya silebilmek

## Ürün tarafında bugün hazır olanlar

| | |
|---|---|
| Randevu sayfasında zorunlu rıza kutusu | ✅ |
| Onayın zaman damgasıyla saklanması | ✅ `reservations.custom_fields.kvkk_onay` |
| Sunucu tarafında onaysız kaydın reddi | ✅ `public-booking` |
| Aydınlatma metni bağlantısı | ✅ `organizations.kvkk_url` (081) |
| WhatsApp "DUR" ile çıkış hakkı | ✅ `customers.wa_opt_out` (070) |
| Müşteri verisini dışa aktarma | ⬜ Faz 2.6 |
| Müşteri verisini silme/anonimleştirme | ⬜ |
