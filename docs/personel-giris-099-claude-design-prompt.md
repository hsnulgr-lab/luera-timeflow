# Personel Girişi 099 · Ekip kodu ve kendi şifresi — Claude Design promptu

**Ekler:**
1. `Luera Mobil - Giris v3 Isik Alani.html` — **görsel dilin kaynağı** (ışık alanı,
   buzlu cam, `luera timeflow` hapı). Bu turun giriş ekranları bu dilin içinde.
2. `docs/design-reference/Luera Mobil - Giris.html` — personel akışının ilk hâli
   (kod → kim → PIN). **Yapı genişliyor**, bkz. §2.
3. `docs/design-reference/Luera Mobil - Mudur 27 Profil.html` — müdür profil dili.
   Müdürün yeni **Personel** ekranı bu dilde.
4. `docs/design-reference/Luera Mobil - Durumlar.html` — durum/hata dili.
5. **Ekran görüntüleri (telefondan, bugünkü hâl):** karşılama · kod ekranı (boş ve
   "Bu kod eşleşmedi") · "Siz kimsiniz?" (şifresiz personelde "İlk giriş") · şifre
   girişi · "Şifremi hatırlamıyorum" uyarısı. Kod ekranı görüntüsündeki açıklama
   ESKİ; yenisi: "Müdürün ekranındaki altı haneli kodu yazın — bilgisayarda ya da
   müdürün telefonunda çıkar."
   **Görüntüsü olmayan ekranlar** (şifre belirleme, şifre değiştir, Oturumu kapat
   sayfası, müdürün Personel ekranı) §4'te hâl hâl tarif edildi — **bunları sıfırdan
   çiz.** Görüntülerde roller İngilizce ("doctor", "staff"): bu bir kusur, Türkçe
   karşılıkla çiz ("Doktor", "Personel").

**Effort: High.**

---

## 0 · Bu tur neden var

Personel telefondan **giremiyordu.** Sunucu kayıtları eşleştirmenin çalıştığını
gösterdi; bozuk olan akıştı:

- "Burada çalışıyorum" telefon zaten bağlıyken bile her seferinde kod istiyordu.
- Çıkış yapmak telefonu işletmeden koparıyordu → her vardiya yeni kod.
- Şifresi olmayan personel "Siz kimsiniz?" listesinde **hiç görünmüyordu**.
- Kullanılmış ya da kapanmış kod "Bu kod eşleşmedi" diyordu — kişi doğru kodu
  tekrar tekrar yazıp kendini kilitliyordu.

Akış **yeniden kuruldu, canlıda ve çalışıyor.** Yeni ekranlar (şifre belirleme,
şifre değiştirme, müdürün Personel ekranı) mevcut bileşenlerle, **tasarım turu
görmeden** yazıldı. Bu tur onların cilası — ve akışın bütün hâllerinin aynı dili
konuşması.

**Bu bir akış değişikliği turu değil.** Kararlar verildi (§1). Tasarımın işi
onları **sakin, anlaşılır ve güven veren** bir deneyime çevirmek.

---

## 1 · Verilmiş kararlar — değişmez

Müdürün (ürün sahibi) kararları:

1. **Her personel kendi telefonundan girer.** Ortak tablet senaryosu yok.
2. **Tek ekip kodu.** Müdür bir kez üretir; 6 hane, **15 dakika**, bütün ekip
   aynı kodu yazar. Yenisi eskisini kapatır.
3. **Kod iki yerde üretilir:** masaüstü Personel sayfası **ve** müdürün telefonu
   (Profil → Personel → Telefon bağla). Telefonda **büyük rakam + geri sayım**.
4. **QR yok, WhatsApp bağlantısı yok.** ("Çok uğraştırıcı.") Kod elle yazılır.
5. **Kodu yazan listeden kendini seçer.** Liste bütün aktif personeli gösterir.
6. **Şifreyi personel kendisi belirler** (ilk girişte), **ayarlardan değiştirir.**
   Müdür şifre yazmaz, yalnız **sıfırlar**.
7. **Çıkışta telefon bağlı kalır.** Sonraki giriş **yalnız şifre**.
8. Tasarım cilası **bu turda** yapılır; akış kodda hazır.

---

## 2 · Akış — bugün kodda olan

```
PERSONEL — İLK GİRİŞ
Karşılama ─ "Burada çalışıyorum"
   └─ Kod (6 hane) ─┬─ yanlış kod ............ aynı ekranda hata
                    ├─ süresi dolmuş ......... kendi ekranı
                    ├─ artık geçerli değil ... kendi ekranı (yeni kod üretilmiş)
                    ├─ çok deneme ............ kilit ekranı (15 dk)
                    ├─ abonelik bitmiş ....... kilit ekranı
                    └─ bağlandı
                         └─ Siz kimsiniz? (liste; şifresizlerin altında "İlk giriş")
                              ├─ şifresi var ─── Şifrenizi girin ─── içeri
                              └─ şifresi yok ─── Şifrenizi belirleyin
                                                  └─ Şifrenizi tekrar girin ─── içeri

PERSONEL — SONRAKİ GİRİŞLER (telefon bağlı)
Uygulama açılır ──── doğrudan: [ad] · Şifrenizi girin
                       ├─ "Ben değilim" ─── Siz kimsiniz?
                       ├─ "Şifremi hatırlamıyorum" ─── müdürden sıfırlama iste
                       └─ şifre sıfırlanmışsa ─── Şifrenizi belirleyin

PERSONEL — İÇERİDE
Profil ─ Şifreyi değiştir ─── şu anki → yeni → yeni tekrar
Profil ─ Oturumu kapat ─── telefon bağlı kalır, sonraki giriş yalnız şifre
Dönüş ekranı ─ "Bu telefon benim değil" ─── telefonu işletmeden ÇIKARIR (onaylı)

MÜDÜR
Profil ─ Personel
   ├─ Telefon bağla ─── büyük kod + 15:00 geri sayım ─── Kodu kapat / süresi doldu
   └─ Ekip listesi ─── satır: durum ─── dokun ─── "Şifreyi sıfırla" (onaylı)
```

---

## 3 · Teknik zarf

- **Expo Go**, React Native 0.86, `react-native-reanimated` serbest (Giriş v3'te
  kanıtlandı: ışık alanı, cam, marka hapı çalışıyor). Skia yok.
- Giriş ekranlarının zemini **`LightField`** (profil `form`), plakalar **cam**.
- Müdür ve personel **içeriden** ekranları (profil, şifre değiştir, müdürün
  Personel ekranı) bugün **opak sıcak yüzey** dilinde. Şifre değiştir ekranı
  şimdilik ışık alanı kullanıyor — **hangi dile ait olduğunu sen söyle** (§6·7).
- Şifre **4 hane**, tuş takımı mevcut (`keypadKeyHeight 62` / küçükte 52,
  yarıçap 16, aralık 10). 4. hanede **otomatik** doğrulanır, ayrı onay düğmesi yok.
- Bugünkü ölçüler (değiştirebilirsin, bilerek): başlık 26/800 · nokta 16, aralık
  16 · başlık–nokta 24 · belirleme alt satırı 14/500 · avatar 64 · hata bandı
  alttan 16.
- **Alert'ler** (şifremi hatırlamıyorum, şifreyi sıfırla onayı) bugün sistem
  `Alert`i. Sayfaya/plakaya dönmeleri serbest ve beklenen.

---

## 4 · Kapsam — ekranlar ve hâller

### P1 · Kod ekranı — "Bu telefonu işletmeye bağlayın"

Taşıması zorunlu: marka · başlık · tek cümle açıklama · 6 kutu · tuş takımı ·
"Devam" · "Kodum yok".

Hâller: **boş · yazarken · yanlış kod** (kutular kızarır, hafif sarsıntı) ·
**gönderiliyor** · **süresi doldu** (kendi ekranı, saat ikonu) · **artık geçerli
değil** (kendi ekranı — müdür yeni kod üretmiş) · **kilitli** (kendi ekranı, geri
sayım; 20 yanlış deneme / 15 dk, bütün salon aynı Wi‑Fi'dan geldiği için sayaç
paylaşılıyor) · **çevrimdışı** · **"Kodum yok" sayfası** (üç adım).

Soru: "süresi doldu" ile "artık geçerli değil" aynı ekran mı olmalı? İkisinin de
çözümü aynı (müdürden güncel kodu iste) ama sebepleri farklı. **Gerekçelendir.**

### P2 · Siz kimsiniz?

Taşıması zorunlu: işletme adı (üstte) · başlık · "Listeden kendinizi seçin" ·
satırlar (baş harf halkası · ad · rol) · "Listede yoksanız müdür sizi Personel
sayfasından eklemeli."

Yeni: **şifresi olmayan personel listede.** Bugün rolün yanına " · İlk giriş"
ekleniyor. **Bu yeterli mi, yoksa ayrı bir işaret mi olmalı?** Kural: şifresiz
personel "eksik", "hatalı" ya da "ikinci sınıf" görünmemeli — yalnızca
"ilk kez giriyor".

Hâller: **dolu liste (karışık: şifreli + ilk giriş)** · **seçilince** (dokunuş
geri bildirimi, geçiş) · **boş liste** · **okunamadı** (tekrar dene) · **20+ kişi**
(uzun liste, 375×667).

### P3 · Şifre belirleme — turun kalbi

İki adım, aynı ekran: **Şifrenizi belirleyin** → **Şifrenizi tekrar girin**.
Bugün alt satır: "4 hane · girişte yalnız siz kullanacaksınız" / "Aynı dört
haneyi bir kez daha".

Hâller:
- **belirle** (boş · 1–3 hane)
- **tekrar** — ilk adımdan ikinciye **geçiş nasıl?** Kişi adımın değiştiğini
  kaçırmamalı; kaçırırsa ikinci kez yazdığını ilk kez sanır.
- **iki şifre aynı değil** → baştan
- **zayıf şifre** (0000, 1234, 9876 gibi) → "Bu şifre çok kolay tahmin edilir."
- **başka telefon önce davrandı** (aynı kişi iki telefondan seçildi) → bilgi
  bandı, giriş hâline döner
- **kaydediliyor**
- **tamam** — şifre belirlendi ve içeri giriliyor. Bu kişinin ürünle **ilk
  başarı anı.** Kutlama var mı? Varsa **300 ms'yi geçmesin.**
- **"Ben değilim"** — sessiz metin bağlantısı

### P4 · Şifre girişi

Taşıması zorunlu: ad + rol (üst çubuk) · baş harf avatarı · "Şifrenizi girin" ·
4 nokta · tuş takımı · "Şifremi hatırlamıyorum" · "Ben değilim".

Hâller: **boş · yanlış** ("Şifre yanlış. 3 denemeniz kaldı; sonra bu telefon 15
dakika kilitlenir.") · **kilitli** (geri sayım) · **şifreniz sıfırlanmış** →
belirleme hâline **geçiş** (hata değil, bilgi) · **çevrimdışı** ·
**"Şifremi hatırlamıyorum" sayfası** (bugün Alert: "Müdür Luera'da Personel
ekranından şifrenizi sıfırlar…").

Soru: bu ekran **günde birkaç kez** görülüyor (her vardiya). Dönüş ekranı gibi
sakin mi olmalı, yoksa ilk giriş ekranları gibi mi?

### P5 · Personel · Şifreyi değiştir (profil içinden)

Üç adım: **Şu anki şifreniz → Yeni şifreniz → Yeni şifre bir kez daha.**
Hâller: her adım · eski şifre yanlış (baştan, kalan hak) · yeni = eski · zayıf ·
iki yeni aynı değil · kilitli · **değişti** (bugün başlık "Şifreniz değişti",
900 ms sonra geri döner) · çevrimdışı.

Adım göstergesi olmalı mı (üç çizgi, Giriş.html'deki gibi)?

### P6 · Oturumu kapat sayfası

Bugünkü metin: "Bu telefon **[işletme]** işletmesine **bağlı kalır**. Geri dönünce
yalnız şifreniz sorulur; yeni kod gerekmez." + "Silinmeyen: Randevularınız, müşteri
geçmişi ve telefonun bağlantısı." Metni ve **"Bu telefonu işletmeden çıkar"** ile
arasındaki farkı netleştir: biri günlük, biri geri dönüşsüz.

### M1 · Müdür · Profil → Personel — ikinci kalp

**Üst: Telefon bağla.**
- **kapalı** — tek cümle + turuncu "Telefon bağla"
- **kod açık** — büyük kod (bugün `482 913`, 44 pt), geri sayım "14:32 geçerli",
  "Bütün ekip bu kodu yazabilir…", "Kodu kapat"
- **son 60 saniye** — geri sayım turuncu
- **süresi doldu** — "Yeni kod üret"
- **üretiliyor · hata** (yetki yok / bağlantı yok)

**Asıl soru: müdür kodu ekibe nasıl GÖSTERİYOR?** Telefonu elinde tutup beş kişiye
tek tek mi gösterecek, masaya mı bırakacak, sesli mi okuyacak? Kodun **"sunum"
hâli** gerekiyor mu (tam ekran, dev rakam, ekran kararmıyor)? **Önerini çiz.**

**Alt: Ekip listesi** — başlık "EKİP · 8 kişi · 3 kişi henüz girmedi".
Satır hâlleri (bugünkü metinler):
- "Henüz girmedi · ilk girişte şifresini belirleyecek"
- "Şifresini belirledi · bugün 23:31" — **en önemli satır:** müdürün "doğru
  kişi mi belirledi" kontrolü. Yeni ama sessiz dikkat çekmeli.
- "Son giriş · dün 09:05"
- "Çok yanlış deneme · kilitli"
- "Şifresi var · telefondan henüz girmedi"

**Şifreyi sıfırla onayı** (bugün Alert): "[Ad] şifresini sıfırlasın mı? Şifre silinir
ve açık oturumu kapanır. Bir sonraki girişte yeni şifresini kendisi belirler.
Telefonu işletmeye bağlı kalır." → **sıfırlandı** geri bildirimi → satır "Henüz
girmedi"ye döner.

Diğer hâller: **okunamadı** · **yükleniyor** · **yetki yok** (işletme sahibi
değil).

### M2 · Müdür Profil ana ekranı

Yeni büyük satır **"Personel · Telefon bağla · giriş durumu"** (Çalışma saatleri
ve Hizmetler'in altında). Alt satırda canlı bir özet olmalı mı ("3 kişi henüz
girmedi")?

---

## 5 · Değişmez kısıtlar

- **Dokunma hedefi ≥ 44 pt.** Hedef kitle 40–55 yaş, ayakta, tek elle.
- **Hiçbir şey yalan söylemez:** "eşleşmedi" yalnız gerçekten yanlış kodda;
  "bağlı kalır" yalnız gerçekten kalıyorsa. Sahte onay, çalışmayan düğme yok.
- **Kod ve şifre asla metin olarak başka yerde tekrar edilmez** (kayıt satırı,
  bildirim, onay metni).
- **`reduceMotion`:** hareket durur, bilgi durmaz — sarsıntı yerine renk,
  kutlama yerine durağan onay. **Bu hâli çiz.**
- **375 × 667** — tuş takımı + hata bandı + iki bağlantı sığmalı.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız zaman ve eylem · kırmızı
  `#E07272`/`#C94040` risk · amber `#D9A43B`/`#B87A00` uyarı · yeşil
  `#5FBF64`/`#2D8F32` olumlu. Koyu `bg #120E08` · `surf #1C1710` · `card #241E16`
  · `tx #F3EDE3`. Açık `bg #F3ECE0` · `surf #FAF7F3` · `card #FFFDFB` · `tx #0E0E0E`.
- **Yazı:** Hanken Grotesk 400–900. Rakamlar tabular.
- **Abonelik / plan / fiyat geçmez** (App Store 3.1.1).
- **İki tema da çizilir.**

---

## 6 · Cevaplamanı istediğim sorular

1. "Süresi doldu" ve "artık geçerli değil" **tek ekran mı, iki ekran mı?**
2. Listede **"İlk giriş"** nasıl işaretlenir — ikinci sınıf göstermeden?
3. Şifre belirlemede **1. adımdan 2. adıma geçiş** nasıl görünür?
4. Şifre belirlendi anı: **kutlama var mı**, kaç ms?
5. Şifre girişi günde birkaç kez: **ne kadar sakin?** Sayıyla.
6. Müdür kodu ekibe **nasıl gösteriyor** — sunum hâli gerekli mi?
7. **Şifre değiştir** ekranı giriş dilinde mi (ışık alanı + cam), uygulama
   içi dilde mi (opak)? Gerekçe.
8. "Şifresini belirledi · bugün 23:31" satırı **nasıl dikkat çeker**, kaç saat
   sonra sıradan satıra döner?
9. **Alert'lerin yerine** ne geliyor — sayfa mı, plaka mı?

Her hareket için bedel etiketi: **A** reanimated ile bugün yazılır · **B** Skia
ister (bu turda uygulanamaz — A karşılığını da çiz) · **C** mümkün değil.

---

## 7 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **P3 Şifre belirleme** — belirle · tekrar · aynı değil · zayıf · tamam ← **ana kare**
2. **M1 Müdür Personel** — kod kapalı · kod açık · son 60 sn · (varsa) sunum hâli ·
   ekip listesi tüm satır hâlleriyle · sıfırlama onayı
3. **P1 Kod** — boş · yanlış · süresi doldu · artık geçerli değil · kilitli ·
   Kodum yok sayfası
4. **P2 Siz kimsiniz?** — karışık liste · boş · okunamadı
5. **P4 Şifre girişi** — boş · yanlış · kilitli · sıfırlanmış → belirleme ·
   Şifremi hatırlamıyorum sayfası
6. **P5 Şifreyi değiştir** — üç adım · değişti · eski yanlış
7. **P6 Oturumu kapat** ve "Bu telefonu işletmeden çıkar" yan yana
8. **M2** profil satırı
9. **`reduceMotion`** (P3 + P4) · **375 × 667** (P3 + M1)
10. Akışın tek sayfalık haritası (§2'nin çizilmiş hâli)

Her karar için **bir cümlelik gerekçe.**

---

## Kutuya yazılacak cümle

> Luera TimeFlow'da personelin telefonla girişini cilalamak: tek ekip kodu →
> "Siz kimsiniz?" listesi → **personelin kendi şifresini belirlemesi**, sonraki
> girişlerde yalnız şifre; müdürün telefonunda **Profil → Personel** (büyük kod +
> 15 dakika geri sayım, ekibin giriş durumu, şifre sıfırlama). Akış kodda hazır ve
> canlıda — değişmiyor; iş, bütün hâllerin (yanlış, süresi dolmuş, kilitli,
> sıfırlanmış, zayıf şifre) **Giriş v3'ün ışık alanı ve cam dilinde** sakin ve
> güven veren bir deneyime dönmesi. En önemli iki kare: **şifre belirleme** ve
> **müdürün kodu ekibe gösterdiği ekran.** Koyu + açık tema, 375×667, reduceMotion.

**Effort: High.**
