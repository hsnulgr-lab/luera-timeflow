# Müdür 23 v2 · Müşteri kartı — Claude Design brief

Bu belge Claude Design'a verilecek metni içerir. Aşağıdaki teşhis tahmin
değil, mevcut koddan okundu.

---

```
Luera Mobil · Müdür 23 v2 — Müşteri kartı, yeniden

BAĞLAM
Salon/klinik yönetimi için Türkçe bir mobil uygulama. Kullanıcı SALON
MÜDÜRÜ: 40–55 yaş, salonda ayakta, telefonu tek elle tutuyor. Müşteri
kartını gün içinde birkaç saniyeliğine açar — bir soruyu cevaplamak ve
çoğu zaman bir şey YAPMAK için.

Bu ekranın bir v1'i var ve uygulandı. Yeniden tasarlanmasının sebebi
estetik değil: kart bilgi gösteriyor ama İŞ GÖRMÜYOR.

ÖLÇÜLEN SORUNLAR (v1'den)

1 · Kart bir belge, araç değil.
   Ekranda beş kontrol var, YALNIZ BİRİ bağlı:
     · "Randevu ver"        → çalışıyor
     · "Not ekle"           → ölü
     · "Tümü" (geçmiş)      → ölü
     · İki levhanın oku     → ölü
     · Yaklaşan randevuda "Değiştir" → ölü
   Müdür dokunuyor, hiçbir şey olmuyor. Ölü kontrol, olmayan kontrolden
   kötüdür.

2 · Kahraman alan çok pahalı.
   852 pt'lik ekranda 439 pt (uyarı varsa 466). Ekranın YARISINDAN
   FAZLASI ad, telefon ve tek bir uyarı satırı için harcanıyor. Müdür
   asıl aradığı şeyi görmek için kaydırmak zorunda.

3 · En sık sorulan soru en zayıf yerde.
   "Bu müşterinin borcu var mı?" — kartın açılma sebeplerinden biri. Ama
   borç yalnız SIFIRDAN BÜYÜKSE ve yalnız kahraman alanın içinde küçük
   bir uyarı satırı olarak görünüyor. İki levha (KALAN SEANS · SON GELİŞ)
   bilinçli olarak borcu taşımıyor. Bu karar yeniden düşünülmeli.

4 · Geçmiş bir liste, bir cevap değil.
   "Son İşlemler" düz bir satır listesi. Müdürün gerçekten merak ettiği
   toplamlar hiç yok: ne sıklıkla geliyor, toplamda ne harcadı, en çok
   hangi hizmeti alıyor, ortalama aralık ne.

MÜDÜRÜN BU KARTI AÇMA SEBEPLERİ (öncelik sırasıyla)
   a. "Şimdi randevu vereceğim — bu kişide bilmem gereken bir şey var mı?"
      (alerji/risk, açık borç, kalan seans)
   b. "Borcu ne kadar, ne zamandan kalma?"
   c. "En son ne zaman geldi, ne yaptırdı?"
   d. "Arayayım / WhatsApp yazayım."
   e. "Bu müşteri bize ne kadar değerli?" (sıklık, toplam)
   f. "Bir not düşeyim." (alerji, tercih, uyarı)

İSTEDİĞİM
Aynı veriyi taşıyan ama İŞ GÖREN bir kart. Özellikle:

1. Kahraman alanın maliyetini düşür. Kimlik bir kartvizit değil, bir
   başlık olsun. Kazanılan yeri (a) ve (b) sorularına ver.
2. Her kontrolün bir hedefi olsun; hedefi olmayan kontrolü ÇİZME.
   Hangi kontrollerin kalması gerektiğini sen söyle — ben ona göre
   ekranları yazacağım.
3. Risk/alerji ile borcu ayır. Risk bir UYARI (müdür bilmezse müşteriye
   zarar verir), borç bir HATIRLATMA (müdür bilmezse para kaybeder).
   İkisi aynı görsel dilde durmamalı.
4. Geçmişe bir özet katmanı ekle — ama uydurma metrik değil, gerçekten
   karar değiştiren birkaç sayı.
5. Boş hâller: geçmişi olmayan müşteri, notu olmayan müşteri, telefonu
   OLMAYAN müşteri (bu gerçek bir hâl — o zaman ara/WhatsApp çizilmez).

VERİ MODELİ (elimizde OLAN — bunun dışında bir şey uydurma)
   id · name · phone (null olabilir)
   risk        : { label, text } | null      → "Saç boyasına alerjisi var"
   balance     : number | null               → null = BİLİNMİYOR, 0 ≠ null
   balanceSince: string | null               → "12 Haz işleminden"
   pkg         : { name, total, used } | null
   lastVisit   : { date, service } | null
   upcoming    : { date, time, service, staff } | null
   history     : [{ id, service, date, staff, amount }]
   notes       : string[]
   Yaş, cinsiyet, doğum günü, fotoğraf, e-posta YOK ve uydurulmayacak.

DEĞİŞMEZ KURALLAR
· Turuncu #FF5A1F yalnız ZAMAN ve EYLEM içindir. Durum rengi değildir.
  Risk kırmızı (#E07272), borç amber (#D9A43B), olumlu yeşil (#5FBF64).
· Bilinmeyen veri ÇİZİLMEZ. `balance: null` "₺0" diye yazılamaz; bilinmeyen
  bakiye için rozet HİÇ çizilmez. Sıfır bir ölçüm, null bir boşluktur.
· Renk tek başına anlam taşımaz — her durumun yanında KELİMESİ yazar.
· Sahte onay yok: uygulamanın müşteriye mesaj atacak kanalı YOK, o yüzden
  "bildirim gönderildi" gibi bir cümle kurulamaz.
· Rakamlar sistem yazı tipinde ve `tabular-nums`; metin Hanken Grotesk.
· Büyük harfe çevirme metin katmanında (Türkçe "i" → "İ"), CSS'te değil.
· Dokunma hedefi 44 pt'nin altına inmez.

TEKNİK KISITLAR (tasarımı bunlar şekillendirir)
· react-native-reanimated ve react-native-gesture-handler PROJEDE YOK ve
  kurulmayacak. Yalnız RN Animated.
· Animasyonlanabilen tek şeyler: opacity, translateX/Y, scale — hepsi
  useNativeDriver: true. Yükseklik, renk, yarıçap, gölge ANİMASYONLANMAZ.
  Renk değişimi iki yüzeyin üst üste çapraz solmasıyla yapılır.
· Paylaşımlı öge geçişi (shared element) yok.
· Yatay sayfalama yalnız ScrollView pagingEnabled ile.
· Koyu VE aydınlık tema. Aydınlıkta yüzeyler birbirine çok yakın
  (#FAF7F3 üstünde #F0E9DF): dolgu farkı tek başına şekli göstermiyor,
  düğmelerin kenarlığı olmalı.
· 375 pt ve 393 pt genişlik; "Hareketi azalt" açık hâli.

ÇIKTI
Tek HTML dosyası, önceki Müdür belgelerinin biçiminde:
· Kararların gerekçesi (neden bu yerleşim, neyi reddettin ve niçin)
· Telefon çerçevelerinde hâller: tam kayıtlı müşteri · riskli · borçlu ·
  geçmişi olmayan · telefonu olmayan · aydınlık tema
· Ölçü tablosu (CSS ile birebir)
· Hareket bölümü: her an için çıkan / giren / yerinde kalan, süre,
  gecikme, eğri ve hangi özelliğin animasyonlandığı
· 375 pt'de sıkışan yerler
· React Native notları
```

---

## Sonraki tasarım kuyruğu

| Sıra | Ekran | Neden bu sırada |
|---|---|---|
| 1 | Müdür 23 v2 · Müşteri kartı | En çok kontrolü ölü olan ekran |
| 2 | Müdür · Randevu oluşturma (rebuild) | Günlük en sık kullanılan akış |
| 3 | Müdür · Profil | App Store hesap silme kuralı buraya bağlı |
| 4 | Giriş sayfası | Müdür akışının dışında, en sona kalabilir |
