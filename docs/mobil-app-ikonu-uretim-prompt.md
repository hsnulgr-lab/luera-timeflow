# TimeFlow uygulama ikonu · Üretim turu

Keşif bitti. Seçilen ikon: **T·2b·2 "Tam kaplama"** (Tur 9). Bu turda yeni
fikir ya da yeni varyant yok. T·2b·2'yi iki düzeltmeyle son hâline getir ve
mağazaya gidecek dosyaları üret. Önceki turlardaki öneri kutularını ve finalist
sıralamasını dikkate alma.

## 0 · İsim değişti

Uygulamanın ana ekrandaki adı **"TimeFlow"**. App Store'daki adı "Luera
TimeFlow". İkon `luera` diyor, altındaki etiket `TimeFlow` diyor. Kullanıcı
ikisini birlikte okuyor.

60 px önizlemelerin hepsinde ikonun altındaki etiketi **"TimeFlow"** yap. Şu
an "luera" yazıyor, bu yanlış.

## 1 · Düzeltme A: küre sınırı hiçbir harfi bölmesin

T·2b·2'de "e" zaten tamamen kürenin içinde. Ama kürenin kenarı hâlâ "u"nun sağ
sapının üst kısmından geçiyor ve o köşe koyu kalıyor. 40–60 px'te bu köşe
baskı hatasına benziyor.

- Küreyi çok az kaydır ya da çapını çok az değiştir. Kenar **"u" ile "e"
  arasındaki boşluktan** geçsin. Hiçbir harf iki renge bölünmesin. Kompozisyonun
  geri kalanı, yani kürenin büyüklüğü ve kelimenin yeri, aynen kalsın.
- "lu" koyu zeminin üstünde krem `#F3EDE3` olsun. "era" kürenin üstünde koyu
  `#120E08` olsun.
- Kürenin kenarıyla "u" arasında gözle görülür bir boşluk kalsın (1024'te en
  az ~20 px). §3'teki tek renkli sürümde bu boşluk yoksa "u" küreye yapışır.
- Kontrol et: 40 ve 60 px'te kelime tek parça "luera" diye okunuyor mu?

## 2 · Düzeltme B: Android kırpması

iOS'ta sorun yok. Android'in daire maskesinde kelime içeride kalıyor ama "l" ile
"a" kenara çok yakın. Bu yüzden Android ön plan dosyası için şu kurallara göre
ayrı bir kompozisyon yap:

- 512'lik tuvalde görünen alan ortadaki 341×341'lik kare. Güvenli alan ortadaki
  **~313 px çaplı daire** (Android'deki 108dp tuval / 66dp güvenli alan oranı).
  Kelimenin tamamı bu dairenin içinde kalmalı.
- Küre tuvalin kenarından taşabilir.
- **Küre ve harfler aynı katmanda, yani ön planda olmalı.** Bazı Android
  başlatıcılar ön ve arka katmanı birbirinden bağımsız kaydırıyor (paralaks).
  Küre arkada, harfler önde olursa renk sınırı harflerin üstünden kayar. Arka
  katman yalnızca düz zemin olsun.

## 3 · Teslim edilecek dosyalar (adları tam olarak bunlar olsun)

| Dosya | Boyut | Şart |
|---|---|---|
| `icon.png` | 1024×1024 | iOS ana ikon. sRGB olsun. **Alfa kanalı, köşe yuvarlatma ve gölge olmasın**, tam kare olsun. Maskeyi Apple kendisi uyguluyor. |
| `icon-dark.png` | 1024×1024 | iOS koyu varyant. Tasarım aynı, zemin `#120E08` ailesinden düz renk. Alfa kanalı olmasın. |
| `icon-tinted.png` | 1024×1024 | iOS renksiz varyant. **Sadece gri ton**, zemin siyah. Sistem ikonu parlaklığa göre boyuyor: küre açık-orta gri, "lu" en açık ton, "era" siyah (sanki küreden oyulmuş gibi). Parçalar renkle değil, parlaklıkla ayrışmalı. |
| `android-icon-foreground.png` | 512×512 | Zemin saydam. Küre ve harfler §2'deki kurallara göre. |
| `android-icon-background.png` | 512×512 | Düz `#120E08`. Saydamlık olmasın. |
| `android-icon-monochrome.png` | 512×512 | Android 13 ve sonrasının temalı ikonu. **Tek renk (beyaz) ve saydamlık.** Küre dolu, "lu" dolu, "era" küreden **oyulmuş boşluk**. §2'deki güvenli alan burada da geçerli. |

Harfler Hanken Grotesk 900 olacak, harf aralığı -0.05em. Harfler **dış hatlara
çevrilsin**, dosyalarda yazı tipine bağımlılık kalmasın. Turuncu küre
markanın küresel degradesi olsun: `#ffb27a → #ff7a33 → #ff5a1f → #e8430f`, ışık
sol üstten geliyor.

## 4 · Sınav sayfası

Her dosyayı tek bir sayfada, şu önizlemelerle yan yana göster:

1. Tam boy
2. 60 px ve 40 px. Açık ve koyu duvar kağıdında, altında "TimeFlow" etiketi
   olsun.
3. iOS için squircle maskesi. Renksiz varyantı sayfadaki tintColor
   seçenekleriyle göster.
4. Android için daire, damla ve yuvarlak kare maskeleri. Güvenli alan dairesi
   önizlemede görünür şekilde çizili olsun, dosyaya girmesin.
5. Tek renkli ikon için Android temalı ikon görünümü, açık ve koyu duvar
   kağıdında.

## 5 · Yasaklar

- Kılavuz çizgisi, güvenli alan halkası, etiket ve rozet **dosyaların içine**
  girmesin. Bunlar yalnızca sınav sayfasında olacak.
- iOS dosyalarında yuvarlatılmış köşe ya da saydamlık olmasın.
- Yeni fikir ya da yeni varyant üretme. İstenen şey T·2b·2'nin düzeltilmiş hâli.
