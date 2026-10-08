# Apple yeniden gönderim · ADIM ADIM

**Durum:** 1.0 (derleme 4) reddedildi — `2.1.0 Performance: App Completeness`
**Sebep:** Kod hatası DEĞİL. Yeni geliştirici hesabına açılan bilgi talebi.
**Yeni derleme GEREKMİYOR.** Derleme 4 aynen yeniden gönderilecek.

**Toplam süre:** 15–20 dakika.

---

## ADIM 0 · Elindekiler

| Ne | Nerede |
|---|---|
| Video (33 MB, 3dk49sn) | `~/Downloads/timeflow-review-small.mp4` |
| Video (192 MB, orijinal) | `~/Downloads/ScreenRecording_09-28-2026 00-47-53_1.MP4` |
| Demo şifresi | ASC'deki mevcut Notes alanında yazılı — oradan kopyalayacaksın |

**Küçük olanı kullan.** Kalite kontrol edildi, metinler tam okunuyor.

---

## ADIM 1 · Videoyu yerleştir

### 1A · Önce ASC'nin kendi ekini dene (tercih edilen)

1. `appstoreconnect.apple.com` → **My Apps** → **Luera TimeFlow**
2. Sol menü → **`1.0 Rejected`** (sarı/kırmızı noktalı satır)
3. Sayfayı en alta kadar kaydır → **App Review Information** bölümü
4. **`Attachment`** satırı → **`Choose File (Optional)`**
5. `~/Downloads/timeflow-review-small.mp4` dosyasını seç
6. Yüklenme bitene kadar bekle

**Kabul ettiyse:** Adım 2'ye geç. Reply metnindeki `<VIDEO-URL>` yerine şunu yazacaksın:

```
See the attachment in the App Review Information section of this app version.
```

**Reddettiyse / çok büyük dediyse:** 1B'ye geç.

### 1B · YouTube (yedek)

1. `youtube.com` → sağ üst **Oluştur** → **Video yükle**
2. `timeflow-review-small.mp4` seç
3. Başlık: `Luera TimeFlow - App Review screen recording`
4. **"Hayır, çocuklara yönelik değil"** seç
5. `İleri` → `İleri` → `İleri`
6. Görünürlük ekranında → **`Liste dışı` (Unlisted)** seç

> 🔴 **`Özel` (Private) SEÇME.** Özel videoyu yalnız senin davet ettiğin
> Google hesapları açabilir. Apple'ın hakemi açamaz ve ikinci bir ret gelir.
> Bu, bu adımda en sık yapılan hata.

7. `Kaydet` → **işlenmesi bitene kadar bekle** (üstte yüzde görünür)
8. Bağlantıyı kopyala (`https://youtu.be/...`)
9. **Başka bir tarayıcıda, gizli sekmede aç ve oynat.** Açılmıyorsa
   görünürlük yanlış demektir
10. Uygulama onaylanana kadar **videoyu silme**

---

## ADIM 2 · Notes alanını güncelle

> 🔴 **Notes alanının sınırı 4000 karakter ve mevcut not neredeyse dolu**
> (326 karakter yeri kalmıştı). Bu yüzden yeni bir blok EKLEMİYORUZ —
> notun tamamını yeniden yazıyoruz. Yeni metin hem eski bilgileri hem
> Apple'ın istediği altı başlığı taşıyor ve 3901 karakter.
>
> Kimlik bilgileri metinden ÇIKARILDI: zaten hemen üstteki
> **Sign-In Information** alanında yazılı, iki kez yazmak yer israfıydı.

1. `1.0 Rejected` → en alt → **App Review Information** → **`Notes`**
2. Kutuya tıkla, **`⌘ + A`** ile hepsini seç, **sil**
3. `docs/apple-notes-alani-SON.txt` dosyasının tamamını yapıştır
4. `<VIDEO-URL>` yazan satırı video adresiyle değiştir
5. Sağ altta karakter sayacının **negatif olmadığını** gör
6. Sağ üstten **`Save`**

## ADIM 3 · App Review'a cevap yaz

1. Sol menü → **General** → **`App Review`**
2. Açılan sayfada Apple'ın mesajı görünüyor
3. Mesajın altındaki **`Reply to App Review`** bağlantısına tıkla
4. Aşağıdaki metnin tamamını yapıştır
5. İki yeri değiştir:
   - `<VIDEO-URL>` → Adım 1'deki adres ya da attachment cümlesi
   - `<ŞİFRE>` → **sen yazacaksın.** Notes alanındaki mevcut
     `Password:` satırından kopyala

> Metin uzun görünüyor ama Apple'ın altı maddesinin altısına da sırayla
> cevap veriyor. Kısaltma — eksik cevap ikinci bir tur demek.

Metnin tamamı: **`docs/apple-2.1-bilgi-talebi-cevabi.md` §1**

6. **`Send`**

---

## ADIM 4 · Yeniden gönder

1. Sol menü → **`1.0 Rejected`**
2. Sayfanın SAĞ ÜSTÜNDE mavi **`Update Review`** düğmesi
   (ilk gönderimdeki `Add for Review` bu ekranda `Update Review` oluyor)
3. Tıkla
4. Çıkan panelde **`iOS App 1.0` — `1.0.0 (4)`** yazdığını doğrula
5. **`Submit for Review`**
6. Durum **`Waiting for Review`**'a dönecek

Çıkan onay sorularının cevapları (ilk gönderimdekiyle aynı):

| Soru | Cevap |
|---|---|
| Export Compliance / şifreleme | Yalnız standart HTTPS → **muaf** |
| Content Rights / üçüncü taraf içerik | **No** |
| Advertising Identifier (IDFA) | **No** |

---

## ADIM 5 · Sonrası

- Sonuç e-postayla gelir, 48 saate kadar sürebilir
- **Onay gelse bile mağazada görünmez** — Version Release **Manually**
  ayarlı, yayın düğmesine senin basman gerekiyor
- Video, uygulama onaylanana kadar **erişilebilir kalmalı**

---

## Ret gelirse — ne yapmayacağız

İkinci ret gelirse **panikle yeni derleme atma.** Metni oku, hangi
yönergeyi işaret ediyor bak, bana getir. Bugüne kadarki tek ret bilgi
talebiydi; teknik bir ret bambaşka bir iş.

Olası iki soru ve hazır cevabımız:

- **3.2 Other Business Models** ("belirli bir şirket için mi?") →
  Cevap Reply §2'nin son paragrafında: uygulama halka açık, kayıt
  uygulamanın içinden yapılıyor, tek bir şirkete özel değil. O paragraf
  silinmemeli.
- **5.1.1(ix) düzenlenmiş alan** (sağlık) → Reply §6'da sağlık etiketini
  kendimiz açıkladık. Yine de gelirse karar belli: şirket hesabına geçilir.
