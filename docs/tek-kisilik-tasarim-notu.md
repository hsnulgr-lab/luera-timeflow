# Tasarım notu · Üçüncü kabuk — tek kişilik işletme

**Brief:** `brief-tek-kisilik-isletme.md` (2026-10-08)
**Referans:** `Luera Mobil - Tek Kisilik.html` (aynı klasör)
**Rota önerisi:** `app/tek/` — gerçek segment, grup değil

---

## 1 · Kısa cevap

**Katmanlı. Ama katmanı kullanıcı değil, yaptığı iş kaldırır.**

- **Taban: Gün.** Tek kişinin günü, boşluklarıyla birlikte bir sıra. Yönetim burada yapılıyor.
- **Üst katman: Kumanda.** "Kaydır ve başlat" ile kalkıyor, BİTİR ve tahsilatla iniyor.
- **İkisinin arası: ada.** Kumanda katmanının toplanmış hâli. Gün ekranının alt yuvasında, başparmağın altında duruyor ve saymaya devam ediyor.

Ekranda mod değiştirici yok. Ekranın hangi duruşta olduğunu sunucudaki işlem durumu belirliyor: `in_progress`, `wait_ends_at`, `finished`. Bu durumları da kullanıcı kendi eliyle yazıyor: başlattığında, bekleme kurduğunda, bitirdiğinde. Duruşu kimse tahmin etmiyor, kullanıcının ayrıca söylemesi de gerekmiyor.

---

## 2 · Üç yön, üçünün sınaması

| Yön | Neden seçilmedi / ne alındı |
|---|---|
| **Tek akış, bağlama göre değişen** | Saatten ya da randevu planından "müşteri karşısında" sonucu çıkarmak tahmin olur. Müşteri gecikir, iş uzar, kapıdan biri girer; tahmin tuttuğu sürece ekran doğru, tutmadığı anda yanlış konuşur. §7'nin ilk kuralı ("ekran yalan söylemez") tahmine izin vermiyor. **Alınan:** öne çıkan eylem bağlama göre değişiyor, ama bağlam tahminden değil sunucudaki işlem durumundan okunuyor. |
| **İki duruş, açık geçiş** | Elleri boyalı kişiden bir anahtarı hatırlamasını istiyor. Unutulan anahtar ekranı yanlış duruşta bırakıyor: işlem sürerken "yönetim" ekranı gösterilir ya da tersi olur. Ayrıca adım sayısını artırıyor; her başlatmadan önce bir de "uygulama moduna geç" deniyor. **Alınan:** geçiş açık ve görünür. Kumanda bir jestle iniyor, bir dokunuşla kalkıyor. Ama ayrı bir mod düğmesi yok: geçişi yapan şey işin kendi düğmeleri. |
| **Katmanlı** | **Seçilen.** İki ağırlık iki ayrı yüzeye gidiyor. Kumanda katmanı tam ekran, büyük ve az: 96 pt sayaç, 112 pt BİTİR, kaydırma çubuğu. Gün tabanı ayrıntılı ve sık: 19 pt adlar, 13.5 pt açıklamalar, boşluk satırları. Aynı anda ikisi değil, biri öne geçiyor; öteki ya tek satıra (kumandada "sıradaki") ya adaya (Gün'de) iniyor. |

**Aynı anda gösterme** baştan elendi. 393 pt'lik ekranda iki duruş aynı ağırlıkta duramaz. Brief de bunu açıkça söylüyor: bakmadan ulaşılacak şey ile ayrıntılı bakılacak şey eşit olamaz.

---

## 3 · Model: dört hâl, tek yuva

| Hâl | Sunucuda | Üstte ne var | Alt yuvada ne var | Eller |
|---|---|---|---|---|
| **Boşta** | işlem yok | Gün | Sıradaki ≤ 15 dk ise **Kaydır · Zeynep'i başlat** çubuğu, değilse boş | serbest |
| **İşlemde** | `in_progress` | **Kumanda** (tam ekran, tab bar yok) | — | meşgul |
| **Beklemede** | `in_progress` + `wait_ends_at` > şimdi | Gün | **Ada · amber**, bekleme geri sayar | serbest |
| **Arka planda** | `in_progress`, kumanda elle indirildi | Gün | **Ada · turuncu**, geçen süre | yarı serbest (telefon geldi) |

**Alt yuva** sözleşmenin merkezi. Gün ekranında uygulama duruşu tek bir yerde, tab bar'ın 8 pt üstünde yaşıyor. Boştayken orada başlatma çubuğu duruyor, işlem sürerken ada. Kullanıcı "şu an ne yapıyorum" sorusunun cevabını hep aynı yerde buluyor.

### Geçiş kuralları

1. **Başlat → kumanda kalkar.** Kullanıcının eylemine bağlı, kendiliğinden kalkmıyor.
2. **Bekleme kur → kumanda adaya iner.** Bekleme sunucuda kabul edildikten sonra iniyor; halka önce 600 ms görünüyor. İnişin sebebi şu: beklemeyi kuran kişinin elleri o an boşalıyor.
3. **Elle indirme.** Kumandanın tepesindeki tutamak aşağı çekilince ya da dokununca iniyor. Telefon çaldığında ya da kapıya biri geldiğinde kullanılıyor. İşlem durmuyor; ada geçen süreyi sayıyor.
4. **Adaya dokun / yukarı it → kumanda kalkar.**
5. **Beklemenin son beş dakikası.** Ada kırmızıya dönüyor, saniyeleri gösteriyor ve tek kez titreşiyor. Açık bir sayfa varsa (randevu kurma, düzeltme) aynı kırmızı şerit o sayfanın tepesine çıkıyor; bu, kumandadaki komşu iş şeridiyle aynı bileşen. **Açık bir form hiçbir zaman kesilmiyor.**
6. **Bekleme sıfır → kumanda kendiliğinden kalkar.** Tek otomatik kalkış bu; o da yalnız açık bir sayfa yoksa oluyor. Açık sayfa varsa şerit "YIKA" der ve titreşim tekrarlanıyor. Bu kuralın gerekçesi brief'te: "uyaracak kimse yok."
7. **BİTİR (basılı tut) → tahsilat → Gün.** Tahsilat kumanda katmanının son evresi. Personel kumandasındaki "Adisyonu kasaya gönder" adımının yerine geçiyor, sayı aynı kalıyor (bir adım yerine bir adım).

### Ağırlık farkı nasıl kuruluyor

| | Kumanda (uyguluyor) | Gün (yönetiyor) |
|---|---|---|
| En büyük rakam | 96 pt geçen süre · 74 pt bekleme | 54 pt gün başlığı |
| Ana eylem | 112 pt BİTİR, 76–88 pt kaydırma çubuğu | 40 pt eylem hapı |
| Okuma mesafesi | kol boyu, bakmadan | elde, bakarak |
| Bilgi | bir müşteri, bir sayı, bir eylem | bütün gün, boşluklar, para |
| Para | maskeli (müşteri ekrana bakıyor) | toplam maskeli, tekil adisyon açık |
| Tab bar | yok | var |

---

## 4 · §6'ya karşı sınama

**Müdür modunun "personel" kelimesi silinmiş hâli değil:**
- Müdürün Akış ekranı bir olay akışı ve ekibi izliyor. Tek kişinin Gün ekranı ise bir **plan**: sırayla randevular, aralarında **boşluk satırları**. Boşluk satırına dokununca randevu kurma o saatle açılıyor. Personel şeridinin cevapladığı "kim boş" sorusunun yerini "ne zaman boşum" sorusu alıyor.
- Özet şeridindeki "doluluk %" bir ekip metriği. Onun yerine "boş: 3 sa" yazıyor; buna dokununca ilk boşluğa gidiliyor.
- Takvim'in yerinde **Hafta** var: personel sütunu yok, günler alt alta ve boşluklarıyla duruyor (bu turda çizilmedi).
- Randevu kurma üç adım: müşteri, hizmet, saat. Saat adımı yalnız hizmetin sığdığı aralıkları öneriyor.
- **Alt yuva ve ada** müdür kabuğunda yok.

**Kumandaya kasa eklenmiş hâli değil:**
- Kumandanın çekirdeği aynen kalıyor: plaka, kadran, bekleme halkası, adisyon şeridi, para maskesi, BİTİR.
- Kumandaya yalnız iki şey ekleniyor: **tutamak** (katman inebilsin diye) ve onun içinde tek satır **"sıradaki"** bilgisi.
- Tahsilat yeni bir sekme değil; "kasaya gönder" adımının yerini alıyor. Kasa, Hafta, İşletme ve randevu kurma kumandada yok, katmanın altındaki Gün'de duruyor.

**Üçüncü dil değil:** jetonlar, yarıçaplar, tipografi, durum kelimeleri ve turuncu envanteri müdür ve personel referanslarıyla aynı. Yeni bileşen iki tane, ikisi de mevcut olanlardan türedi:
- **Ada:** sheet tutamağının cam kuralı ile kumanda halkasının birleşimi.
- **Boşluk satırı:** takvimdeki boş slota dokunma dilinin listedeki karşılığı.

**Bilgisayara yönlendiren cümle yok.** Kapsam listesi aşağıda.

---

## 5 · Kabuk

- `app/tek/_layout.tsx`: beş sekme, müdür setiyle aynı biçim (etiketsiz, tam yuvarlak cam). Sekmeler: **Gün · Hafta · + · Kasa · İşletme**.
- `app/tek/gun.tsx`, `hafta.tsx`, `kasa.tsx`, `isletme.tsx`. `+` bir modal rota.
- Kumanda katmanı `_layout` içinde, sekmelerin üstünde render ediliyor (`src/components/tek/KumandaKatmani.tsx`). Sekme değişince katmanın durumu kaybolmuyor.
- Müşteri kartı, randevu detayı, hizmetler ve çalışma saatleri `app/(ortak)/` altında kalıyor, yeni kopya açılmıyor. Ortak ekranlarda "Personel" satırı tek modda **render edilmiyor**.
- "İşletme" sekmesi müdürdeki Profil'in yerini alıyor. İçinde: hizmetler ve fiyatlar, çalışma saatleri, kasa ayarları, "Tek kişilik çalışıyorsunuz · Ekip ekle", tema, çıkış. Ekip kodu ve telefon bağlama satırları yok.

---

## 6 · §3 kapsam kararları — bilgisayarsızlık listesi

| Yer | Tek modda karar | Not |
|---|---|---|
| `profil/personel.tsx:285,353` | **Düşer.** Satır render edilmiyor. | Ekip eklemek "Ekip ekle" kapısından yapılıyor (bkz. §7 karar 2). |
| `CreateFlow.tsx:455` | **Düzeltilir: bütün modlarda.** Cümle yerine satır içi "Hizmet ekle" var ve `profil/hizmetler`'e gidiyor. | Bu bir kusur; tek modu beklemeden düzeltilmeli. İlk gün ekranında hizmet ekleme zaten birinci adım. |
| `cash.ts:380` | **Çözülür.** Kasa → tahsilat satırı → **Düzelt** (tutar, yöntem) ve **Geri al**. Eski kayıt silinmiyor; ters kayıt sunucu saatiyle yazılıyor. | Referans: T10. |
| Akış · adisyon kartı | **Çözülür.** "Adisyon açık" satırında **Tahsil et** hapı var; kumandada BİTİR'den sonra tahsilat geliyor. | §7 karar 4'e bağlı. |
| `paket-sat.tsx:303` | **İlk sürümde kısmen.** Paket telefondan **tek ödemeyle** satılıyor. Peşinat ve taksit **kapsam dışı**: seçenek render edilmiyor, yönlendiren cümle de yok. | Taksit, vade takibi ve kısmi tahsilat modeli istiyor; ayrı bir iş. Ürün sahibi bilerek ertelemeli. Sessizce dışarıda kalmamalı. |
| `actionPill.ts:39` WhatsApp | **Bağlamadan çözülür.** Randevu satırında "Mesajla hatırlat" var; telefonun kendi WhatsApp'ını hazır metinle açıyor (`Linking`, `wa.me`). Otomatik hatırlatma **kapsam dışı.** | Otomatik gönderim işletme hesabı bağlamayı gerektiriyor; o akış bugün telefonda yok. |
| `signup/ready.tsx` | **Düğme çıkmıyor.** Yerine mod sorusu geliyor (T11), ardından ilk gün ekranı (T12). | "Bugün başlayabilirsiniz" vaadi T12'deki üç adımla tutuluyor. |
| `createFlow.ts:181` "Saat seçin" kilidi | **Kendiliğinden düşer** (karar 3). Saat adımında hiç aralık yoksa sebep yazıyor: *"Bu gün 45 dakikalık boşluk yok. Başka gün seçin."* | Hangi modda olursa olsun, kapalı bir düğme sebebini söylemeli. |

---

## 7 · §8 — dört ürün kararı için öneriler

### Karar 1 · Mod nasıl belirlenir? → **Sorulsun. Tek soru, kaydın son ekranında.**

Önerilen soru: *"Bu işletmede işi kim yapıyor?"* — **Yalnız ben** / **Ekibim var**.

Gerekçe:
- **Personel sayısından çıkarmak kayıt anında işe yaramıyor.** Yeni açılan her hesapta personel sayısı sıfır. Ekibi olan salon sahibi de ekibini henüz ekleyemedi (ve bugün telefondan ekleyemiyor). Çıkarım yapılırsa herkes tek kişilik moda düşüyor. Çıkarımın doğru çalışabileceği tek an kayıttan sonraki bir an, o noktada da kullanıcı zaten yanlış kabukta açılmış oluyor.
- **Kurulum uzamıyor.** Soru `ready.tsx`'in yerine geliyor; o ekran bugün de bir adım ve tutmayan bir vaat taşıyor. Adım sayısı aynı kalıyor.
- **"Neden bu moddayım" sorusu cevapsız kalmıyor.** İşletme sekmesinde *"Tek kişilik çalışıyorsunuz"* satırı duruyor, cevap değiştirilebiliyor.
- Soru "yalnız mısınız?" diye sorulmuyor; bu kişisel bir soru gibi okunuyor. İşi kimin yaptığı soruluyor.

### Karar 2 · Sonradan çalışan alınca → **Kullanıcı seçer. Mod kendiliğinden değişmez. Veri taşınmaz, çünkü taşınacak bir şey kalmaz.**

- İşletme → **Ekip ekle**. Bu kapı ilk çalışanı eklemeyi ve müdür kabuğuna geçmeyi tek akışta yapıyor. Geçişten önce tek ekranda neyin değişeceği söyleniyor: "kim yapacak" sorusu geri gelir, takvimde sütunlar açılır, kumanda Personel modundan açılır.
- Kendiliğinden değişmemeli. Tek kişi bir stajyeri yalnız cumartesi çalıştırabilir; mod her personel değişikliğinde zıplarsa ekran kullanıcıya her seferinde başka türlü görünür.
- **Önkoşul:** personel ekleme telefonda yapılabilmeli (`personel.tsx:285` bugün bilgisayara yolluyor). Bu yapılmazsa "Ekip ekle" kapısı da bir duvara dönüşür. Tek modun kapsamına bu kapı giriyor.
- Kararın geri yönü: personel sayısı yeniden bire inerse tek moda dönüş **öneriliyor**, zorlanmıyor.
- Veri: karar 3 uygulanırsa sahibin bütün geçmişi zaten kendi `staff_id`'sine bağlı. Geçiş anında hiçbir satır güncellenmiyor.

### Karar 3 · "Personel" kavramı altta kalsın mı? → **Kalsın. Sahip kayıtta sessizce bir personel satırına bağlansın.**

- `006_handle_new_user_safe.sql`, kayıtta sahip için bir personel satırı açacak şekilde değişiyor. Tek mod bu satırın varlığını varsayıyor.
- Gerekçe: takvim, çakışma kontrolü, raporlar, prim ve `createFlow` hepsi `staff_id` üzerinden yürüyor. `staff_id` boş kalırsa her sorguya ikinci bir dal giriyor; hata o dallarda saklanıyor ve en çok "çakışma kontrolü atlandı" gibi görünmez hatalar üretiyor.
- Karar 2'yi bedavaya getiriyor: büyüme anında veri taşıma gerekmiyor.
- Kavram arayüzde hiç görünmüyor: tek modda "ile", "kim yapacak", personel seçimi ve personel şeridi render edilmiyor. Sunucu her randevuya sahibin `staff_id`'sini kendisi yazıyor (istemci göndermiyor), böylece istemcide personel seçimine dair bir kod yolu kalmıyor.
- Bilinen bedel: müdür moduna geçildiğinde sahip personel listesinde görünecek. Bu doğru bir sonuç; sahip de çalışıyor.

### Karar 4 · Tahsilat telefondan yapılsın mı? → **Tek modda evet. Düzeltme ve geri alma da dahil. Müdür modunda karar değişmesin.**

- 2026-09-17 kararının dayanağı rol ayrımıydı: işi yapan ile parayı alan farklı kişi, müdür telefonu da kasa değil. Tek kişide bu ayrım yok; dayanak ortadan kalkıyor.
- Tahsilat açılırsa düzeltme de açılmalı. Açılmazsa `cash.ts:380` bu modda geri dönüşü olmayan bir duvar oluyor: yanlış tutar girildiğinde düzeltecek bilgisayar yok.
- Kapsam: tahsilat **parayı kaydediyor**, kart çekmiyor. Yöntemler Nakit, Kart (POS cihazı ayrı), Havale. "Sonra tahsil et" adisyonu açık bırakıyor; Gün ekranında "adisyon açık" satırı olarak görünüyor.
- Güvenlik:
  - Tahsilat **çevrimdışı sıraya alınmıyor**; para kaydı ya sunucuda var ya yok.
  - Düzeltme eski kaydı silmiyor; ters kayıt sunucu saatiyle yazılıyor ve kasada "düzeltildi · saat" olarak görünüyor.
  - Geri alma onay diyaloğu sormuyor, çünkü geri alınabiliyor (yeniden tahsil edilebilir). Yalnız sebep soruyor; bu tek dokunuşluk bir seçim.

---

## 8 · §7 kısıtlarının bu kabuktaki karşılığı

- **Üç ayrı hâl:**
  - **Yükleniyor (T15):** gün ve tarih cihazdan biliniyor, gerçek gösteriliyor; geri kalan iskelet. İşlem durumu bilinmediği için ada da gösterilmiyor.
  - **Okunamadı (T16):** rakamlar **"—"**, sıfır değil. Metin: *"Randevularınız yerinde; şu an gösterilemiyor."*
  - **Gerçekten boş (T13):** "Bugün randevunuz yok." Kapalı gün (T14) bundan ayrı bir hâl; "boş" ile "kapalı" aynı cümleyle söylenmiyor.
- **Dokunulan her kontrol bir iş yapar.**
  - Boşluk satırı o saatle randevu kurmayı açıyor.
  - "Boş 3 sa" ilk boşluğa, "açık adisyon 1" o satıra, maskeli tahsil rakamı Kasa'ya gidiyor.
  - Ada kumandayı açıyor.
  - İlk gün ekranında henüz açılmamış adım bir düğme değil; satırda sebebi yazıyor.
- **Yazma önce sunucuya gider.**
  - Başlat, bekleme kur, BİTİR ve tahsil et: ekran sunucu kabul edene kadar değişmiyor. Bekleme durumunda kadranın altında kesik çizgi görünüyor; bu, kumandadaki mevcut "gönderiliyor" dili.
  - Red hâlinde (T08) hiçbir şey değişmiyor ve sebep düğmenin hemen üstünde yazıyor.
- **Damgalar sunucu saatinden.**
  - Geçen süre `started_at`'tan, bekleme kalanı `wait_ends_at`'tan hesaplanıyor; ikisi de sunucuda yazılıyor. Cihaz yalnız `server_now()` ile ölçülen farkı uyguluyor.
  - Bekleme bitişi için yerel bildirim bu farkla kuruluyor.
- **Ton.** Siz-dili, kısa, özürsüz. Ton örneği olarak verilen *"Bu gün randevunuz yok."* cümlesi siz-dilinde olduğu için metinler siz-dilinde yazıldı; brief'teki "sen-dili" ifadesinin bunu kastettiğini varsaydım. Yanlışsa metinler toplu çevrilebilir.

---

## 9 · Hareket (reanimated 4.5.1 + PanResponder)

- **Katman:** tek bir paylaşılan değer, `kat` (0 = kumanda tam, 1 = ada).
  - Kumanda gövdesi `translateY = kat × (H − 84)`.
  - İçerik çapraz geçişle değişiyor: 0–0.4 aralığında kumanda içeriği soluyor, 0.6–1 aralığında ada içeriği beliriyor.
  - Bırakınca `withSpring` (damping 22, stiffness 220).
- **Jest:** kumanda tutamağında ve adada `PanResponder` var. `onMoveShouldSetPanResponder` yalnız dikey harekette (|dy| > 8 ve |dy| > |dx|) devreye giriyor. Bırakma eşiği `kat > 0.35` ya da `vy > 0.6`. Gesture-handler kullanılmıyor.
- **Kaydırma çubuğu ve BİTİR:** Personel 06'daki jestlerin aynısı; yeni yazılmıyor.
- **Kendiliğinden kalkış** (bekleme sıfır): elle kalkışla aynı yay. Hareketin dili tek; kim tetiklerse tetiklesin aynı görünüyor.
- **"Saydamlığı azalt" / "Hareketi azalt":** yay yerine 180 ms opaklık geçişi kullanılıyor; ada konumu aynı kalıyor.

**Kontrol edilmesi gerekenler** (kurulu paket listesinde göremedim):
- `expo-haptics`: son beş dakika ve sıfır titreşimi.
- `expo-notifications`: uygulama arka plandayken bekleme bitişi.

Bildirim paketi kurulu değilse ve kurulmayacaksa, **uygulama kapalıyken beklemenin bittiğini haber verecek bir yol yok.** Bu durumda tek kişi için kritik olan madde (§5.7) yarım kalıyor; ürün sahibinin bunu bilerek kabul etmesi gerekiyor.

---

## 10 · Açık bırakılanlar

- **Hafta ekranı** (§5.3) bu turda çizilmedi. Yönü: günler satır satır, her günde boşluk satırları; personel sütunu yok.
- **Bekleme aralığına kısa hizmet sığdırma** (boya beklerken kaş alma): çakışma kontrolünün beklemeyi "meşgul değil" sayması gerekiyor. Ürün ve veri kararı; burada önerilmiyor.
- **"Ekibim var" yolu** bugün de bilgisayar duvarına çarpıyor (personel ekleme). Bu, tek modun değil müdür modunun açığı, ama aynı düzeltmeyle (karar 2'deki önkoşul) kapanıyor.
- Müdür referansındaki çevrimdışı "sırada" dili tahsilat için **geçerli değil.** Para dışındaki yazmalar mevcut kuyruk diliyle aynı kalabilir.
