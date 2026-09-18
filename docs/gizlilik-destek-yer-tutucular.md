# Gizlilik ve Destek sayfası — yayından önce doldurulacaklar

Dosyalar: `public/gizlilik.html` ve `public/destek.html` (aynı içerik, farklı
başlangıç sekmesi). Frontend deploy'uyla şu adreslere çıkar:

- Gizlilik politikası: `https://timeflow.lueratech.com/gizlilik.html`
- Destek: `https://timeflow.lueratech.com/destek.html`

App Store Connect'e bu iki adres girilecek. Uygulamadaki "Yasal → Gizlilik
politikası" satırı da birinciye açılıyor.

**Yer tutucular (`[ … ]`) doldurulmadan yayınlanmamalı.** Hukuki metin avukat
onayından geçmeli. "Uçtan uca şifreli", "verileriniz Türkiye'de" gibi cümleler
doğrulanmadan yazılmaz.

| Yer tutucu | Nerede | Not |
|---|---|---|
| `[Luera şirket unvanı]` | Gizlilik 1, alt bilgi | Ticaret unvanı, varsa MERSİS |
| `[adres]` | Gizlilik 1 | Tebligata elverişli adres |
| `[destek e-postası]` | Gizlilik 1, 6, 7 · Destek (iletişim + 2 SSS) | `mailto:` bağlantısı da |
| `[ … ]` dönüş süresi · çalışma saatleri | Destek | Tutulamayacak söz verilmez |
| `[tarih]` | Gizlilik başlığı | Yürürlük tarihi |
| `[toplanan alanların listesi]` | Gizlilik 2 | Oturum/cihaz kaydı alanları — geliştirmeden teyit |
| `[tutulan kayıtların süresi]` | Gizlilik 3 | Hata kayıtlarının saklama süresi |
| `[sağlayıcı adı ve sunucu konumu]` | Gizlilik 4 | Barındırma ve bölge; teyitsiz yazılmaz |
| `[bildirim sağlayıcısı]` | Gizlilik 4 | Push yoksa satır kalkar |
| `[varsa sağlayıcı; yoksa bu satır silinir]` | Gizlilik 4 | Bugün hata takibi servisi YOK → satır silinecek |
| `[kalıcı silme talebi yolu]` | Gizlilik 5 | Masaüstü müşteriyi yalnız ARŞİVLİYOR |
| `[mevzuat gereği saklanması gereken kayıtlar]` | Gizlilik 5 | Hukuk görüşü |
| `[bildirim yolu]` | Gizlilik 7 | Salonlara değişiklik nasıl duyurulacak |
| `[yıl]` | Alt bilgi | |

## Tasarımdan düzeltilen iddialar (uygulamayla çelişiyordu)

- **Personel şifresi:** tasarım "personel ekip koduyla yeniden girip yeni PIN
  belirler" diyordu. Gerçek: işletme sahibi Profil → Personel'den sıfırlar,
  personel yenisini bir sonraki girişte belirler, yeni kod gerekmez.
- **"Önemli değişikliklerde uygulama içinden bilgi verilir"** — böyle bir
  özellik yok; yer tutucu oldu.
- **"Salon müşteri kaydını silebilir"** — masaüstü arşivliyor, silmiyor.
- **"Listeyi aşağı çekerek yenileyin"** — yalnız müdür Akış'ında var.
- **Veri kaynağı** — müşteri çevrimiçi randevu ve WhatsApp'tan kendi bilgisini
  de giriyor; eklendi.
- **Kayıp telefon** — "oturumu kapatın" adımı kaldırıldı: bağlı bir personel
  telefonunun bağını koparmanın yolu bugün yok (şifre sıfırlamak oturumu
  düşürüyor ama telefon bağlı kalıyor ve yeni şifre o telefondan
  belirlenebiliyor).

## Hâlâ doğrulanmamış bir cümle

"Yedeklerdeki kopyalar 30 gün içinde döngüden çıkar" — uygulamanın hesap silme
ekranındaki cümlenin aynısı. Veritabanı yedeğinin kurulu olduğu ve 30 günlük
döngüde tutulduğu henüz doğrulanmadı. Yedek kurulurken saklama süresi 30 gün
olarak ayarlanmalı; yoksa iki yerdeki cümle birlikte düzeltilmeli.
