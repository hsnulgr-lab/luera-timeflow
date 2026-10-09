/* Luera Mobil · Tek kişilik v2 — belge tabloları */
const tbl=(head,rows)=>`<div class="rn"><div class="r h">${head.map((h,i)=>`<span class="${i===0?"c1":i===1?"c2":""}">${h}</span>`).join("")}</div>${rows.map(r=>`<div class="r">${r.map((c,i)=>`<span class="${i===0?"c1":i===1?"c2":""}">${c}</span>`).join("")}</div>`).join("")}</div>`;

put("s-harman",tbl(["Tek ekran","Nereden","Çıkan","Giren","Not · bu belgede"],[
["Gün","Müdür 24 · <code>StaffDay.tsx</code> + <code>StaffDayParts.tsx</code>","personel şeridi, geri oku, yatay sayfalama; <span class='k2'>alttaki Randevu ver · Ara</span>","hâl kartının yerine Akış eylem kartı (<code>FlowParts.tsx</code>), dört hap","<span class='k2'>Sapma 1:</span> alttaki iki eylem tabloda yoktu. Randevu ver sekmedeki Randevu'yla aynı; Ara kişinin kendisini arardı. §01"],
["İşlem","Personel kumandası · <code>kumanda.tsx</code>","—","tahsilat, \"Adisyonu kasaya gönder\" yerine","Geri etiketi Bugün → Gün. Yöntem seçici Kasa'nın seçicisi. §02"],
["Takvim","Müdür Takvim · <code>calendar.tsx</code>, <code>ColumnCalendar</code>","personel sütun başlıkları, alt başlıkta \"· 3 personel\"","—","Tek sütun mevcut bileşenin parametresi. §06"],
["Randevu (+)","Müdür <code>CreateFlow</code>","kim yapacak","—","<code>CreateFlow.tsx:455</code> düzeltmesi her modda. §05"],
["Kasa","Müdür Kasa · <code>cash.tsx</code>","<span class='k2'>\"X verdi\" satırı</span>","Düzelt, Geri al","<span class='k2'>Sapma 2:</span> karar 3 gereği kişi adı görünmez; boşalan yuvada düzeltme izi. §04"],
["İşletme","Müdür Profil · <code>profile.tsx</code>","Personel satırı","Ekip ekle · Tek kişilik çalışıyorsunuz","Aynı satır biçimi. §03"],
["Müşteriler","Müdür Müşteriler","geçmiş satırlarda personel adı ve baş harfi (karar 3)","—","İşletme → Müşteriler satırından açılır. Değişen yalnız bu; çizilmedi."],
["Sekme seti","<code>app/mudur/_layout.tsx</code> · NativeTabs etiketli","Akış, Profil","Gün, İşletme","Sayı ve yer aynı. Gün'ün ikonu personel Bugün'ün güneşi (Takvim'in yanında ikinci bir takvim olmasın diye); İşletme Profil'in ikonunu taşır."]
]));

put("s-duvar",tbl(["Yer","Bugün","Tek modda","Nerede"],[
["<code>profil/personel.tsx:285,353</code>","\"Personeli bilgisayardan ekleyin\"","<span class='k3'>Düşer.</span> Personel satırı tek modda yok; ekleme İşletme → Ekip ekle formunda. Ekleme telefona geldiği için cümle müdür modunda da kalkmalı.","P1, P2"],
["<code>CreateFlow.tsx:455</code>","\"Hizmetler masaüstündeki ayarlardan eklenir\"","<span class='k1'>Kusur, her modda düzeltilir.</span> HİZMET listesinin sonunda <b>Yeni hizmet ekle</b> → <code>profil/hizmetler</code>'in \"+\" formu.","R1, S3"],
["<code>cash.ts:380</code>","\"Düzeltme ve iptal masaüstündeki Kasa'dan\"","<span class='k3'>Çözülür.</span> Hareket satırı → Düzelt / Geri al. Ters kayıt, <code>server_now()</code>; eski satır silinmez, Kasa'da iziyle görünür.","C1, C2, C3"],
["Akış · adisyon","Tahsilat eylemi yok (2026-09-17)","<span class='k3'>Çözülür.</span> Gün kartında Tahsil et; kumandanın son adımı tahsilat; Kasa'daki turuncu şerit aynı adımı açar.","G4, K3, K4, C1"],
["<code>paket-sat.tsx:303</code>","\"Peşinat ve taksit masaüstünden\"","<span class='k2'>Kısmen.</span> Paket tek ödemeyle satılır; taksit seçeneği tek modda render edilmez, yönlendiren cümle de çıkmaz. Taksit kapsam dışı, bilerek ertelenir.","çizilmedi"],
["<code>actionPill.ts:39</code>","WhatsApp \"masaüstünden bağlanır\"","<span class='k3'>Bağlamadan.</span> Satırın ⋮ menüsünde <b>Mesajla hatırlat</b>: <code>Linking.openURL('https://wa.me/90…?text=…')</code>, hazır metin randevu saatiyle. Otomatik hatırlatma kapsam dışı.","menü mevcut, çizilmedi"],
["<code>signup/ready.tsx</code>","\"Kurulumu bilgisayardan tamamla\"","<span class='k3'>Hiç çıkmaz.</span> Yerinde mod sorusu.","S1"],
["<code>createFlow.ts:181</code>","Personel yoksa \"Saat seçin\" sessizce kapalı","<span class='k3'>Düşer</span> (karar 3: sahip bir personel satırı). Kapalı kalan düğme sebebini yazar: \"Saat seçin\"; uygun saat yoksa \"Bu gün 60 dk'lık boş yer yok\".","R2"]
]));

put("s-karar",tbl(["Karar","Öneri","Gerekçe"],[
["1 · Mod nasıl belirlenir","Kayıtta tek soru: <b>Bu işletmede işi kim yapıyor?</b> → Yalnız ben / Ekibim var. <code>signup/ready.tsx</code>'in yerinde; adım sayısı aynı.","Kayıt anında personel sayısı herkeste sıfır; çıkarım herkesi tek moda düşürür. Soru kişiyi değil işi soruyor. Cevap İşletme'deki satırda görünür ve değişir."],
["2 · Sonradan çalışan alınca","Mod kendiliğinden değişmez. İşletme → <b>Ekip ekle</b>: önce neyin değişeceği, sonra tek form.","Yarı zamanlı bir çalışan için ekranın kendiliğinden değişmesi, her seferinde başka bir uygulama demek. Önkoşul: personel ekleme telefonda (P2). Personel sayısı bire inerse tek moda dönüş önerilir, zorlanmaz."],
["3 · \"Personel\" altta kalsın mı","Kalsın. <code>006_handle_new_user_safe.sql</code> sahip için bir personel satırı açar; sunucu her randevuya o <code>staff_id</code>'yi kendisi yazar, istemci göndermez.","Takvim, çakışma kontrolü ve raporlar <code>staff_id</code> üzerinden. Arayüzde kavram görünmez: \"ile\", \"verdi\", \"kim yapacak\", sütun başlıkları render edilmez. Ekip ekleyince veri taşınmaz; sahip ekip listesinde görünür, o da çalışıyor."],
["4 · Tahsilat telefondan","Tek modda açılsın, düzeltme ve geri alma dahil. Müdür modunda 2026-09-17 kararı kalsın.","Dayanak rol ayrımıydı; tek kişide yok. Tahsilat açılıp düzeltme açılmazsa yanlış tutar geri dönülmez olur. Uygulama kart çekmez, parayı kaydeder. Para kaydı çevrimdışı sıraya girmez."]
]));

put("s-bilesen",tbl(["Parça","Kaynak","Tek modda değişen","Neden yetiyor"],[
["Gün iskeleti","<code>StaffDay.tsx</code>, <code>StaffDayParts.tsx</code> (Müdür 24)","şerit, geri oku, sayfalama ve alt eylemler render edilmez","Tek kişinin günü zaten bu ekran."],
["Eylem kartı","<code>FlowParts.tsx</code> + <code>actionPill.ts</code> (Akış)","Müdür 24'ün hâl kartı yuvasına konur; tek mod hapları: Başlat · Kumandayı aç · Tahsil et","Durum kelimesi, büyük sayı, tek düğme: Akış'ta da aynı iş."],
["Krem hap","Akış SÜRÜYOR kartındaki personel hapı","avatarsız, yalnız metin","Ekran açan ikincil eylem."],
["Kumanda","<code>kumanda.tsx</code> (personel 02–04)","geri etiketi; son adımda tahsilat","Ölçü değişmedi."],
["Seçici","Kasa'nın Bugün / Bu hafta / Bu ay seçicisi","seçenekler Nakit / Kart / Havale; açık zeminde bileşenin açık tema çizimi","Üç seçenekli tek seçim."],
["Tam genişlik düğme · hayalet düğme","\"Adisyonu kasaya gönder\" · Kasa \"Gün sonu özeti\"","etiket","—"],
["Alt sayfa · satır grubu","kit sheet + tutamak · Profil grup kartı","Kasa'da Düzelt / Geri al; İşletme'de Ekip ekle satırı","Başlık, alt satır, ok."],
["Bilgi kartı · alan","Personel sayfası TELEFON BAĞLA kartı · Müşteriler arama kutusu","metin; alan olarak Ad soyad, Meslek, Tutar","—"],
["ColumnCalendar","<code>calendar.tsx</code>","sütun sayısı 1, başlık satırı yok","Bileşen n sütunla çiziyor."],
["Boş ve durum","<code>EmptyDay</code>, <code>VoidBlock</code>, <code>DaySkeleton</code>, <code>DurumUnread</code>","metinler <code>emptyDay.ts</code>'e","—"],
["Giriş çatallanması","kit Müdür 01","iki düğme de ikincil","Tarafsız soru."],
["Geri al onayı","iOS sistem uyarısı (<code>Alert</code>)","—","Sistemin; çizilmiyor."]
])+`<div class="prose"><p><b>Önerilen yeni bileşen yok.</b> Önceki turdaki alt yuva ve ada, Gün'deki kartın kendi sayacı ve kumandaya giden yolu varken gereksizdi; ikisi de çıkarıldı.</p></div>`);

put("s-rn",tbl(["Konu","Karşılık"],[
["Rota","<code>app/tek/</code> gerçek segment: <code>_layout.tsx</code> (NativeTabs), <code>gun.tsx</code>, <code>calendar.tsx</code>, <code>cash.tsx</code>, <code>isletme.tsx</code>; Randevu sekmesi müdürdeki gibi. Kumanda, müşteri kartı, hizmetler ve çalışma saatleri <code>app/(ortak)/</code> altında, yeni kopya yok. <code>/tek/calendar</code> ile <code>/mudur/calendar</code> ayrı dosya; rota çakışması testi geçer."],
["Sekme çubuğu","NativeTabs, <code>labelVisibilityMode=\"labeled\"</code>. iOS 26 kapsülü sistem çiziyor; buradaki kapsül yer tutucu. Etiketler: Gün · Takvim · Randevu · Kasa · İşletme."],
["Özet şeridi","Gün'de yok. <code>tests/mobile-mudur-denetim.test.mjs:30</code>'daki nöbet <code>app/tek/gun.tsx</code>'i de kapsamalı."],
["Üç ayrı hâl","Yükleniyor, okunamadı ve boş ayrı çizildi (B1–B4). Okunamayanda sayı ve damga yok."],
["Yazma önce sunucuya","Başlat (kaydırma), BİTİR, Tahsil et, Düzelt, Geri al: sunucu kabul etmeden ekran değişmez; ret sebebi düğmenin üstünde (K4). Para yazmaları çevrimdışı kuyruğa girmez."],
["Damgalar","<code>started_at</code>, <code>wait_ends_at</code>, bitiş, tahsilat ve ters kayıt <code>server_now()</code>. Gün kartındaki sayaç cihaz saatiyle değil, sunucu farkıyla ilerler."],
["Hareket","Yeni hareket yok. Kartın hâl değişimi Müdür 24'teki çapraz soldurma (RN <code>Animated</code>); kumandaya geçiş personeldeki push; kaydırma ve BİTİR mevcut <code>PanResponder</code> jestleri."],
["Ton","Siz dili, kısa, özürsüz: \"Bugün randevunuz yok.\", \"Bugün kapalısınız.\", \"Tahsilat kaydedilmedi: bağlantı yok.\""]
])+`<div class="prose"><p><b>Açık kalanlar.</b></p>
<p>Kayıt ekranları ve randevu 2/2 canlı görüntülerde yok; S1 ve R2 kit'ten kuruldu ve canlıyla karşılaştırılmalı. Kumandanın bekleme hâli (halka) da görüntülerde yok; tek modda değişmediği için çizilmedi.</p>
<p>Bekleme sırasında başka bir müşteriye bakmak (krem beklerken kaş): çakışma kontrolünün beklemeyi boş sayması gerekir. Ürün ve veri kararı; komşu iş şeridi bu yüzden örneklerde yok.</p>
<p>Gün'de tarih başlığı yok, Müdür 24'te de yok. Başka bir gün Takvim'den açılır.</p>
<p>Uygulama kapalıyken beklemenin bittiğini haber vermek bildirim izni ister. Personelde bugün nasılsa öyle kalır; tek kişide uyaracak başka kimse olmadığı için ayrıca bakılmalı.</p></div>`);
