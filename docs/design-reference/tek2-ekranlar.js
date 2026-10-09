/* Luera Mobil · Tek kişilik v2 — ekranlar. Veri: Derya Toprak, Cuma 9 Ekim; 10:30 Sibel · 12:00 Pınar · 14:00 Tuğçe (Kalıcı Makyaj 120 dk, krem beklemesi 25 dk) · 16:30 Yasemin · 17:30 Vildan */

/* ── 01 · GÜN ── */
const LST_BUGUN=(nowT,tugO)=>`${lhd("BUGÜN · 5 RANDEVU")}<div class="lst">${R.sib({fade:1,mini:PAID})}${R.pin({fade:1,mini:PAID})}${tugO?R.tug(tugO):""}</div>${nowl(nowT)}<div class="lst">${tugO?"":R.tug()}${R.yas()}${R.vil()}</div>`;
const LST_SIRA=`${lhd("SIRADAKİ · 2 RANDEVU")}<div class="lst">${R.yas()}${R.vil()}</div>`;
const gun=(hero,c,list,o)=>phone(`<div class="scr">${hero}${c}${list}</div>`,{glow:1,tab:0,...o});

put("p-gun",`<p><b>Hangi satırın kartı öne çıkar.</b> Kart, günün o anki satırının eylem kartı. Sıra: süren ya da beklemedeki iş, sonra açık adisyon, sonra sıradaki randevu. Başka açık adisyonlar listede amber çiple ve Kasa'nın turuncu şeridinde kalır.</p>
<p><b>Hap, kumandada yapılacak ilk işin adı.</b> Kartın tamamı dokunulabilir ve kumandayı o hâlde açar. Turuncu hap sunucuya yazan işe götürür (başlatmak, para almak), krem hap yalnız ekranı açar. Krem hap Akış'taki SÜRÜYOR kartının personel hapı; avatarı çıktı.</p>
<p><b>Liste kuralı değişmedi.</b> İşlemdeyken başlık SIRADAKİ, süren iş listeden çıkıp kartta durur. Müsaitken başlık BUGÜN, tamamlananlar soluk, araya şimdi çizgisi girer. Satırdaki ⋮ menüsü müdürdeki gibi; "Mesajla hatırlat" oraya giriyor (§09).</p>
<p><b>Alttaki iki eylem çıktı.</b> <b>Randevu ver</b>, sekme çubuğundaki Randevu ile aynı akışı açıyordu. <b>Ara</b>, günü gösterilen kişiyi, yani kullanıcının kendisini arardı. Brief §2'nin "çıkar" sütununda bu ikisi yok; tablodan ilk sapma bu.</p>`);

put("s-gun",[
spec({id:"G1",title:"Boşta · sıradaki 19 dk sonra",from:"Müdür 24 · müsait (mudur-13) + Akış eylem kartı",
 phone:gun(heroH("free","",ST.free),card({lbl:"ŞU AN BOŞ",hero:"19"+U("dk"),pill:["Başlat","go"],sub:"14:00'e kadar · sıradaki Tuğçe Erden",aria:"Tuğçe Erden'i başlat"}),LST_BUGUN("13:41"),{id:"G1",t:"13:41"}),
 notes:["Kart canlıdaki ŞU AN BOŞ kartı; büyük sayı boş süre, yani sıradakine kalan dakika. Eklenen yalnız <b>Başlat</b>.","Başlat kumandayı <b>bekleniyor</b> hâlinde açar (K1). İşi başlatan, personeldeki gibi <b>Kaydır ve başlat</b>; listede yanlış dokunuşla iş başlamaz.","Sıradaki satır listede kalır, canlıdaki gibi."]}),
spec({id:"G2",title:"Sürüyor",from:"Müdür 24 · işlemde (mudur-12) + Akış SÜRÜYOR kartı",
 phone:gun(heroH("run","74 dk",ST.run),card({dot:1,lbl:"SÜRÜYOR",hero:"74:12",pill:["Kumandayı aç","cr"],sub:"Tuğçe Erden · Kalıcı Makyaj · 16:02'de biter"}),LST_SIRA,{id:"G2",t:"15:16"}),
 notes:["Akış kartında personel hapının (DT Derya) durduğu yerde <b>Kumandayı aç</b>.","Sayaç <code>started_at</code>'tan, sunucu farkıyla. Telefon çaldı, kumandadan Gün'e dönüldü: iş sürüyor, sayaç burada.","Halka rozeti ve kart sayacı canlıda da ikisi birden var; dokunulmadı."]}),
spec({id:"G3",title:"Beklemede · krem",from:"Müdür 24 · işlemde + Akış eylem kartı",
 phone:gun(heroH("run","18 dk",ST.run),card({dot:1,am:1,lbl:"BEKLEMEDE · KREM",hero:"13"+U("dk"),pill:["Kumandayı aç","cr"],sub:"Tuğçe Erden · Kalıcı Makyaj · bekleme 14:33'te biter"}),LST_SIRA,{id:"G3",t:"14:20"}),
 notes:["Büyük sayı bekleme kalanı (<code>wait_ends_at</code>). Kelime ve nokta amber: kumandadaki Bekleme kur'un rengi.","Damga İŞLEMDE kalır; iş bitmedi, yalnız eller boş.","Bekleme bitince kart SÜRÜYOR'a döner. Uyarı davranışı kumandadaki gibi; bu belgede yenisi yok."]}),
spec({id:"G4",title:"Adisyon açık",from:"Müdür 24 · müsait + Akış KASADA BEKLİYOR kartı",
 phone:gun(heroH("free","",ST.free),card({bar:1,dot:1,am:1,lbl:"ADİSYON AÇIK",hero:"₺4.500",pill:["Tahsil et","go"],sub:"Tuğçe Erden · Kalıcı Makyaj · 16:02'de bitti"}),LST_BUGUN("16:04",{mini:OPEN}),{id:"G4",t:"16:04"}),
 notes:["Akış'taki KASADA BEKLİYOR kartı: amber kenar, büyük tutar. Eklenen <b>Tahsil et</b>; kumandanın tahsilat adımını açar (K3).","Tutar açık, Akış'taki gibi. Para maskesi yalnız kumandada, müşteri ekrana bakarken.","İş bittiği için damga MÜSAİT, liste BUGÜN. Satır amber çiple listede durur.","Tahsilattan sonra kart G1'in kartına döner: ŞU AN BOŞ · 26 dk · sıradaki Yasemin Kurt."]})
].join(""));

/* ── 02 · İŞLEM ── */
const tahsil=o=>phone(`${kbk}${idp("am","ADİSYON AÇIK","14:02 – 16:02 · 120 dk sürdü")}${kdiv}<div style="display:flex;flex-direction:column;align-items:center;position:relative;z-index:2"><div class="mask"><i></i><i></i><i></i>${I("eyeoff")}</div><div class="tot">TOPLAM · 0 KALEM</div><div class="dur n">120 dk sürdü · <b>14:02 – 16:02</b></div></div>${astrip}<div class="ksec">RANDEVU</div><div class="kit"><b>Kalıcı Makyaj</b><span>RANDEVUDA</span></div><div class="knote">Bu hizmetler tahsilata randevuyla birlikte giriyor; yeniden eklemeyin.</div><div class="kfoot">${seg(["Nakit","Kart","Havale"],1)}${o.err?`<div class="kerr">${I("warn")}<span>Tahsilat kaydedilmedi: bağlantı yok. Kasaya bir şey yazılmadı.</span></div>`:""}<button class="kbtn">${I("cash")}${o.err?"Tekrar dene · kartla tahsil et":"Kartla tahsil et"}</button><button class="kgh">Sonra tahsil et</button></div>`,{warm:1,...o});

put("s-islem",[
spec({id:"K1",title:"Bekleniyor · Başlat'tan",from:"Personel kumandası · bekleniyor (personel-04)",
 phone:phone(`${kbk}${idp("","BEKLENİYOR","14:00 başlangıç · 120 dk plan")}${kdiv}<div class="dial"><span class="big wt n">19<span class="u">dk</span></span><span class="unit">BAŞLAMAYA</span><span class="schip n">14:00'te başlıyor</span></div><div class="sl"><span class="hnd">${I("arrow")}</span><span class="lbl">Kaydır ve başlat</span><span class="sok"></span></div>`,{id:"K1",warm:1,t:"13:41"}),
 notes:["Canlıdakinin aynısı. Değişen geri etiketi: <b>Bugün → Gün</b>.","Komşu iş şeridi (Zeynep Kaya · boya) yalnız paralel bir iş varken çıkar; bu örnekte yok.","Kaydırma bırakılınca sunucu <code>started_at</code> yazar; kabul gelmeden ekran K2'ye geçmez."]}),
spec({id:"K2",title:"İşlemde",from:"Personel kumandası · işlemde (personel-02), birebir",
 phone:phone(`${kbk}${idp("or","SÜRÜYOR","14:02 başlangıç · 120 dk plan")}${kdiv}<div class="dial"><span class="big n">74:12</span><span class="unit">GEÇEN SÜRE</span><div class="plan"><span class="trk"><i style="width:62%"></i><s></s></span><span class="n">120 dk plan · 46 dk kaldı</span></div><span class="wchip">${I("timer")}Bekleme kur</span></div>${astrip}${fin}`,{id:"K2",warm:1,t:"15:16"}),
 notes:["Hiçbir şey çıkmadı, hiçbir şey girmedi.","<b>Gün</b>'e dönmek işi durdurmaz; G2'deki kart saymaya devam eder.","Bekleme kur → G3. BİTİR (basılı tut) → K3."]}),
spec({id:"K3",title:"Adisyon · tahsilat",from:"Personel kumandası · adisyon açık (personel-03), son adım",
 phone:tahsil({id:"K3",t:"16:04"}),
 notes:["Değişen yalnız son adım. <b>Adisyonu kasaya gönder</b> yerine yöntem seçici ve <b>Kartla tahsil et</b>. Seçici, Kasa'nın Bugün / Bu hafta / Bu ay seçicisi.","Toplam maskeli kalır. Tahsilat adisyonun sunucudaki toplamını yazar; kullanıcı rakam girmez. Yanlışsa Kasa'da düzeltilir (C3).","Düğme yöntemle birlikte adlanır: Nakit tahsil et · Kartla · Havaleyle. Yöntem seçilmeden düğme kapalı ve \"Ödeme yöntemini seçin\" yazar.","<b>Sonra tahsil et</b>: adisyon açık kalır, Gün'de kart G4 olur. Hayalet düğme Kasa'daki \"Gün sonu özeti\".","Kopya: \"kasaya randevuyla birlikte gidiyor\" → \"tahsilata randevuyla birlikte giriyor\"."]}),
spec({id:"K4",title:"Tahsilat · sunucu reddetti",from:"K3 · reddedilen yazma",
 phone:tahsil({id:"K4",t:"16:05",off:1,err:1}),
 notes:["Ekran sunucu kabul etmeden değişmez. Ret sebebi kullanıcının baktığı yerde, düğmenin hemen üstünde.","Kumanda adisyonda kalır, Kasa'ya bir şey yazılmaz. Para kaydı çevrimdışı sıraya alınmaz: ya sunucuda var ya yok."]})
].join(""));

/* ── 03 · İŞLETME ── */
put("s-isletme",[
spec({id:"P1",title:"İşletme",from:"Müdür Profil · profile.tsx (mudur-07)",
 phone:phone(`<div class="scr"><div class="pfh"><s>İŞLETME</s><h2>Derya Güzellik Stüdyosu</h2><span>İstanbul · Güzellik / Salon</span></div><button class="hcard"><span class="a">BUGÜN · CUMA</span><span class="o"><s></s>Şu anda açık</span><span class="h n">09:00 – 19:00</span><span class="k">kapanışa <b class="n">3 sa 44 dk</b></span>${I("chev")}</button>${grp([{b:"Çalışma saatleri",s:"6 gün · pazar kapalı"},{b:"Hizmetler ve fiyatlar",s:"7 hizmet"},{b:"Ekip ekle",s:"Tek kişilik çalışıyorsunuz"},{b:"Müşteriler",s:"20 kişi"}])}${grp([{b:"Hesap",v:"derya",sm:1},{b:"Görünüm",v:"Sistem",sm:1},{b:"Bildirimler",v:"3 açık",sm:1},{b:"Yasal",v:"Gizlilik",sm:1}])}</div>`,{id:"P1",tab:4}),
 notes:["Satır düzeni Müdür Profil. Sekme adı ve üst etiket <b>İşletme</b>.","\"Personel\" satırının yerinde, aynı satır biçiminde: başlık <b>Ekip ekle</b>, alt satır <b>Tek kişilik çalışıyorsunuz</b>. Başlık dokununca ne olacağını, alt satır bugünkü durumu söylüyor; öbür satırlar da böyle.","İkon değişmedi. Müdür Profil de işletmenin sayfasıydı."]}),
spec({id:"P2",title:"Ekip ekle kapısı",from:"Profil → Personel (mudur-09) · TELEFON BAĞLA kartının dili",
 phone:phone(`<div class="scr"><div class="phd">${I("back")}<h2>Ekip ekle</h2></div><div class="pcard"><span class="eb">EKİBE GEÇİNCE</span><p>İlk çalışanınızı eklediğinizde uygulama ekip düzenine geçer. Randevu kurarken kimin yapacağı sorulur, takvimde her kişiye bir sütun açılır, ana ekran Akış olur. Geçmiş randevularınız ve kasanız olduğu gibi kalır.</p></div><div class="pcard"><span class="eb">YENİ ÇALIŞAN</span><div class="fl"><span>AD SOYAD</span><div class="fld2 ph">Örn. Elif Demir</div></div><div class="fl"><span>MESLEĞİ</span><div class="fld2 ph">Örn. Kuaför</div></div><button class="pbtn">Ekle ve ekip düzenine geç</button></div><div class="sfn">Çalışan kendi telefonundan girecekse, eklendikten sonra Personel sayfasındaki Telefon bağla ile tek seferlik kod üretirsiniz.</div></div>`,{id:"P2"}),
 notes:["Kapı önce neyin değişeceğini söylüyor, sonra tek form. İki kart da canlı Personel sayfasının kart dili; alanlar Müşteriler'in arama kutusu.","Mod kendiliğinden değişmez, bu düğmeyle değişir (karar 2). Sonrası canlı Personel sayfası: Telefon bağla, ekip listesi.","?Önkoşul: personel ekleme telefonda. Bu form yoksa kapı duvara döner. Personel sayfasının altındaki \"bilgisayardan\" cümlesi müdür modunda da kalkmalı."]})
].join(""));

/* ── 04 · KASA ── */
const kasaTop=(amt,band)=>`<div class="isl kz">${seg(["Bugün","Bu hafta","Bu ay"],0)}<div class="kgir">BUGÜN GİREN</div><div class="kamt n">${amt}</div><div class="kbar"></div><div class="kleg"><s></s><span class="n">Kart ${amt}</span></div></div>${band?`<button class="kband"><span class="t"><b>1 adisyon tahsil edilmedi</b><span class="n">${band}</span></span>${I("chev")}</button>`:""}`;
const kr=o=>`<div class="kr"><span class="kav">${o.i}</span><span class="t"><b>${o.nm}</b><span class="n">${o.sv}</span>${o.em?`<em class="n">${o.em}</em>`:""}</span><span class="v"><b class="n">${o.v}</b><span>${I("card")}KART</span></span></div>`;
const kasa=(amt,band,rows)=>`${kasaTop(amt,band)}<div class="khd">HAREKETLER<span>${rows.length} işlem</span></div><div class="kcard">${rows.map(kr).join("")}</div><div class="kday">Gün sonu özeti</div>`;
const PIN0={i:"PA",nm:"Pınar Aksoy",sv:"Cilt Bakımı · 13:05",v:"₺1.200"},SIB={i:"SK",nm:"Sibel Karaca",sv:"Lazer Epilasyon · 11:02",v:"₺1.500"};

put("s-kasa",[
spec({id:"C1",title:"Kasa · bir düzeltmeden sonra",from:"Müdür Kasa · cash.tsx (mudur-06)",
 phone:phone(kasa("₺2.500","₺4.500 · en eskisi 8 dk bekliyor",[{...PIN0,v:"₺1.000",em:"düzeltildi 15:40 · önce ₺1.200"},SIB]),{id:"C1",hd:1,tab:3,t:"16:10"}),
 notes:["Müdür Kasa birebir: seçici, BUGÜN GİREN, yöntem çubuğu, turuncu şerit, HAREKETLER.","Kalkan tek satır \"Elif Demir verdi\": parayı veren hep kullanıcının kendisi (karar 3). Boşalan yuvada <b>düzeltme izi</b>: düzeltildi 15:40 · önce ₺1.200.","Turuncu şerit tek modda kumandanın tahsilat adımını açar (K3). Birden çok adisyon varsa önce liste."]}),
spec({id:"C2",title:"Hareket satırı · Düzelt / Geri al",from:"Müdür Kasa + Profil satır grubu, alt sayfada",
 phone:phone(`${kasa("₺2.700","",[PIN0,SIB])}<div class="scrim"></div><div class="sheet"><div class="grabber"><i></i></div><div class="shd"><h3 class="n">₺1.200 · Kart</h3><span class="n">Pınar Aksoy · Cilt Bakımı · 13:05'te alındı</span></div>${grp([{b:"Düzelt",s:"Tutar ya da yöntem"},{b:"Geri al",s:"Adisyon yeniden açılır",dg:1}])}<div class="sfn" style="padding-bottom:44px">Eski kayıt silinmez. Düzeltme ve geri alma Kasa'da saatiyle görünür.</div></div>`,{id:"C2",hd:1,t:"15:38"}),
 notes:["Hareket satırına dokununca alt sayfa. <code>cash.ts:380</code>'deki \"masaüstündeki Kasa'dan\" cümlesinin yerinde bu iki satır.","<b>Geri al</b> sistem uyarısıyla onaylanır: \"₺1.200 kart tahsilatı geri alınsın mı? Adisyon yeniden açılır.\" Onaydan sonra adisyon Gün'de G4 kartına döner.","Sayfa gövdesi opak, yalnız tutamak cam (kit kuralı)."]}),
spec({id:"C3",title:"Tahsilatı düzelt",from:"Aynı alt sayfa · alanlar Müşteriler arama kutusu, seçici Kasa'nınki",
 phone:phone(`${kasa("₺2.700","",[PIN0,SIB])}<div class="scrim"></div><div class="sheet" style="top:150px"><div class="grabber"><i></i></div><div class="shd"><h3>Tahsilatı düzelt</h3><span class="n">Pınar Aksoy · Cilt Bakımı · 13:05</span></div><div style="padding:4px 20px 0;display:flex;flex-direction:column;gap:18px"><div class="fl"><span>TUTAR</span><div class="fld2 big n">₺1.000<s>₺1.200</s></div></div><div class="fl"><span>YÖNTEM</span>${seg(["Nakit","Kart","Havale"],1)}</div></div><div class="kfoot" style="padding:0 20px 44px"><button class="kbtn">Düzeltmeyi kaydet</button><div class="sfn" style="padding:0;text-align:center">Eski kayıt silinmez; yanına düzeltme kaydı yazılır.</div></div></div>`,{id:"C3",hd:1,t:"15:39"}),
 notes:["Kaydet: sunucu ters kaydı ve yeni kaydı birlikte yazar, damga <code>server_now()</code>. Kabul gelince C1'deki iz görünür; ret gelirse sayfa açık kalır, sebep düğmenin üstünde.","Rakam klavyesi çizilmedi; sistemin.","Düzeltme yalnız tutar ve yöntem. Yanlış müşteriye yazılan tahsilat geri alınır ve doğru adisyondan yeniden alınır."]})
].join(""));

/* ── 05 · RANDEVU ── */
const SV=[["#8B5CF6","Cilt Bakımı","60 dk · ₺1.200"],["#EC4899","Ağda","45 dk · ₺900"],["#06B6D4","Lazer Epilasyon","30 dk · ₺1.500"],["#F59E0B","Manikür & Pedikür","60 dk · ₺750"],["#10B981","Kaş Tasarımı","20 dk · ₺350"],["#F43F5E","Kalıcı Makyaj","120 dk · ₺4.500"],["#64748B","Aromaterapi Masajı","50 dk · ₺1.100"]];
const ADDSV=`<div class="sr ad">${I("plus")}<b>Yeni hizmet ekle</b>${I("chev","cv")}</div>`;
const rh1=`<div class="isl rhd"><div class="rtop"><span class="xb">${I("x")}</span><b>Yeni randevu</b><span class="n">1 / 2</span></div><div class="rttl">Kim ve ne<i></i></div><div class="rsrc">${I("search")}Müşteri ara</div></div>`;
const slotY=t=>{const[h,m]=t.split(":").map(Number);return 14+((h-9)*60+m)/30*44};
const SLOTS=["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00"];
const W2=[["9","CUM","lg"],["10","CMT","lg"],["11","PAZ","off"],["12","PZT","s"],["13","SAL",""],["14","ÇAR","s"],["15","PER",""]];

put("s-randevu",[
spec({id:"R1",title:"1 / 2 · kim ve ne · hizmet listesinin sonu",from:"Müdür CreateFlow 1/2 (mudur-05) · kaydırılmış",
 phone:phone(`${rh1}<div class="rsh"><div class="rlab" style="padding-top:18px">HİZMET<u>7</u></div><div class="svc">${SV.map(([c,n,d])=>`<div class="sr"><s style="background:${c}"></s><b>${n}</b><span class="n">${d}</span></div>`).join("")}${ADDSV}</div></div><div class="rdock"><span class="rcta">Müşteri ve hizmet seçin</span></div>`,{id:"R1",hd:1,tab:2}),
 notes:["Canlı 1/2 adımı; SON GELENLER yukarıda kaldı. \"Kim ve ne\"deki kim müşteri; adım değişmedi.","Giren tek satır: <b>Yeni hizmet ekle</b>. <code>CreateFlow.tsx:455</code>'teki \"masaüstündeki ayarlardan\" cümlesinin yerinde. Kusur düzeltmesi, her modda.","Satır <code>profil/hizmetler</code>'in \"+\" formunu açar; dönüşte yeni hizmet seçili gelir.","Kapalı düğme eksiği söylüyor, canlıdaki gibi."]}),
spec({id:"R2",title:"2 / 2 · ne zaman · \"kim\" yok",from:"CreateFlow 2/2 · canlı görüntüsü yok; saat rayı kit Müdür 15",
 phone:phone(`<div class="isl rhd" style="padding-bottom:34px"><div class="rtop"><span class="xb">${I("back")}</span><b>Yeni randevu</b><span class="n">2 / 2</span></div><div class="rttl">Ne zaman<i></i></div><div class="rsum"><b>Gizem Ünal</b> · Cilt Bakımı · <span class="n">60 dk</span></div></div><div class="rsh">${week(W2,3)}<div class="srail" style="height:${slotY("13:00")+20}px;margin-top:14px">${SLOTS.map(t=>`<div class="sx" style="top:${slotY(t)}px"><b class="n">${t}</b><i></i></div>`).join("")}<div class="sblk" style="top:${slotY("10:00")+4}px;height:80px"><b>Dolu</b><span>Deniz Şahin · Manikür & Pedikür</span></div><div class="sblk pk" style="top:${slotY("11:00")+4}px;height:80px"><span class="n">11:00 – 12:00</span><b>Gizem Ünal · Cilt Bakımı</b></div></div></div><div class="rdock"><span class="rcta on">Pzt 12 Ekim · 11:00 · Randevuyu kur</span></div>`,{id:"R2",hd:1,tab:2,t:"15:17"}),
 notes:["Çıkan: <b>kim yapacak</b>. Personel seçimi de, kit'teki \"Merve yapacak · Değiştir\" sonucu da yok. Sunucu <code>staff_id</code>'yi kendisi yazar (karar 3).","Rayda yalnız kullanıcının kendi dolu saatleri. Dolu saat seçilmez ve sebebini yazar.","Saat seçilmeden düğme kapalı ve \"Saat seçin\" yazar. Gün hiç sığmıyorsa: \"Bu gün 60 dk'lık boş yer yok\".","?Bu adım canlı görüntülerde yok; başlık ve yüzeyler 1/2'nin dilinden kuruldu. Canlı 2/2 ile karşılaştırılmalı."]})
].join(""));

/* ── 06 · TAKVİM ── */
const W1=[["5","PZT","s"],["6","SAL",""],["7","ÇAR","s"],["8","PER","s"],["9","CUM","lg"],["10","CMT","lg"],["11","PAZ","off"]];
const cy=t=>{const[h,m]=t.split(":").map(Number);return 22+((h-10)*60+m)/60*69};
const cb=(t,e,cls,inner)=>`<div class="cb ${cls}" style="top:${cy(t)+2}px;height:${cy(e)-cy(t)-4}px">${inner}</div>`;
put("s-takvim",spec({id:"T1",title:"Takvim · tek sütun",from:"Müdür Takvim · ColumnCalendar (mudur-03, mudur-04)",
 phone:phone(`<div class="chd"><div class="ctl"><span class="d">Cum<i></i></span><span class="nn n">9</span></div><div class="csub">5 randevu</div>${week(W1,4)}</div><div class="cgrid">${["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"].map(t=>`<div class="hr" style="top:${cy(t)}px"><b class="n">${t}</b><i></i></div>`).join("")}
${cb("10:30","11:00","done row1",`<span class="n">10:30</span><b>Sibel</b><em>Lazer Epilasyon</em>`)}
${cb("12:00","13:00","done tight",`<span class="n">12:00</span><b>Pınar</b><em>Cilt Bakımı</em>`)}
${cb("14:00","16:00","live",`<span class="n">14:00</span><b>Tuğçe</b><em>Kalıcı Makyaj</em>`)}
${cb("16:30","17:15","row1",`<span class="n">16:30</span><b>Yasemin</b><em>Ağda</em>`)}
${cb("17:30","18:00","row1",`<span class="n">17:30</span><b>Vildan</b><em>Kaş Tasarımı</em>`)}
<div class="cnow" style="top:${cy("15:16")}px"></div></div>`,{id:"T1",glow:1,tab:1}),
 notes:["Çıkan: personel sütun başlıkları ve alt başlıktaki \"· 3 personel\". ColumnCalendar tek sütunla; blok bileşeni aynı.","Sütun genişleyince hizmet adı kesilmiyor. Blokta yine yalnız ad; soyad canlıdaki gibi yok.","Boş saate dokununca randevu kurma o saatle açılır (mevcut davranış). Pazar kapalı gün, noktasız."]}));

/* ── 07 · BOŞ HÂLLER ── */
const loadRow=`<div class="row2"><span class="sk" style="width:40px;height:15px;margin-top:5px"></span><span class="rc"><span class="sk" style="width:170px;height:22px"></span><span class="sk" style="width:118px;height:14px;margin-top:4px"></span></span></div>`;
put("s-bos",[
spec({id:"B1",title:"Gerçekten boş",from:"Gün + EmptyDay / VoidBlock",
 phone:gun(heroH("free","",ST.free),"",voidB({dot:"or",lbl:"BUGÜN · SALI",ttl:"Bugün randevunuz yok.",sub:"Çalışma saatiniz 09:00 – 19:00.",rail:"09"}),{id:"B1",t:"10:12"}),
 notes:["Boş dizi \"yok\" der. Kart yok, çünkü üzerinde iş yapılacak satır yok; eylem sekme çubuğundaki Randevu.","Saat rayı VoidBlock'un kendi rayı; şimdi işaretli."]}),
spec({id:"B2",title:"Kapalı gün",from:"Gün + VoidBlock · çalışma saatlerinden",
 phone:gun(heroH("non","",ST.off),"",voidB({dot:"g",lbl:"PAZAR",ttl:"Bugün kapalısınız.",sub:"Pazar, çalışma saatlerinizde kapalı gün. Yarın 09:00'da açıksınız."}),{id:"B2",t:"11:05"}),
 notes:["Boştan ayrı cümle: kapalı gün boş gün değil. Damga gri, halka soluk, ray yok.","Cümle çalışma saatlerinden okunur; Gün kendi başına \"kapalı\" demez."]}),
spec({id:"B3",title:"Yükleniyor",from:"Gün + DaySkeleton",
 phone:gun(`<div class="hero-h"><span class="ring non">DT</span><span class="hcol"><span class="hnm">Derya <b>Toprak</b></span><span class="sk" style="width:92px;height:26px"></span><span class="hrole">Güzellik uzmanı</span></span></div>`,`<div class="sk" style="margin:16px 18px 0;height:100px;border-radius:18px"></div>`,`<div class="lhd"><span class="sk" style="width:150px;height:12px;border-radius:5px"></span><i></i></div><div class="lst">${loadRow}${loadRow}${loadRow}</div>`,{id:"B3"}),
 notes:["Ad ve baş harf oturumdan biliniyor, gerçek gösteriliyor. Durum, kart ve liste iskelet.","İskelet gerçek kartın geometrisinde; içerik gelince hiçbir şey kaymaz. Kayan ışık yok."]}),
spec({id:"B4",title:"Okunamadı",from:"Gün + DurumUnread",
 phone:gun(`<div class="hero-h"><span class="ring non">DT</span><span class="hcol"><span class="hnm">Derya <b>Toprak</b></span><span class="hrole">Güzellik uzmanı</span></span></div>`,"",voidB({lbl:"OKUNAMADI",ttl:"Gününüz şu an gösterilemiyor.",sub:"Randevularınız yerinde. Bağlantı gelince bu ekran kendiliğinden yenilenir.",btn:`<button class="hap">${I("refresh")}Tekrar dene</button>`}),{id:"B4",off:1}),
 notes:["<code>null</code> \"bilmiyorum\" der: sayı yok, ŞU AN BOŞ yok, damga yok. Bilinmeyen bir gün boş gösterilmez.","Tekrar dene, Müdür 24'teki kenarlıklı hap (\"Ara\"nın biçimi)."]})
].join(""));

/* ── 08 · KURULUM ── */
put("s-kurulum",[
spec({id:"S1",title:"Mod sorusu",from:"signup/ready.tsx'in yerine · kit Müdür 01 giriş çatallanması",
 phone:phone(`<div class="su"><div class="mark">luera<i></i></div><h2>Bu işletmede işi kim yapıyor?</h2><p>Uygulama cevabınıza göre açılır. Sonradan İşletme'den değiştirebilirsiniz.</p><div class="sbtns"><button class="tall">Yalnız ben</button><button class="tall">Ekibim var</button></div></div>`,{id:"S1",glow:1,t:"11:18"}),
 notes:["Adım sayısı aynı: ready.tsx'in yerinde tek soru. \"Kurulumu bilgisayardan tamamla\" düğmesi hiç çıkmaz.","Düzen kit'teki giriş çatallanması: iki 66 pt düğme, alt üçte birde. Orada biri turuncuydu; burada ikisi de ikincil, çünkü soru tarafsız.","Yalnız ben → S2. Ekibim var → müdür kabuğu; personel ekleme P2'deki formla."]}),
spec({id:"S2",title:"İlk gün",from:"Gün + EmptyDay · hizmet sayısı 0",
 phone:gun(heroH("free","",ST.free),"",voidB({dot:"or",lbl:"BUGÜN · CUMA",ttl:"Bugün randevunuz yok.",sub:"İlk randevuyu alttaki Randevu'dan kurun. Hizmetlerinizi orada da ekleyebilirsiniz.",rail:"09"}),{id:"S2",t:"11:20"}),
 notes:["B1'in aynısı; değişen alt cümle. emptyDay.ts hizmet sayısı 0 iken ilk adımı söylüyor.","Çalışma saatleri kayıttaki varsayılanla açılır; İşletme'den değişir."]}),
spec({id:"S3",title:"İlk randevu · yeni hesap",from:"CreateFlow 1/2 · müşteri ve hizmet yok",
 phone:phone(`${rh1}<div class="rsh"><div class="rlab">MÜŞTERİ</div><div class="sfn" style="padding:0 19px">Henüz müşteri yok. Adını yukarıya yazın; yeni müşteri olarak eklenir.</div><div class="rlab" style="padding-top:26px">HİZMET<u>0</u></div><div class="svc">${ADDSV}</div><div class="sfn" style="padding:10px 19px 0">Ad, süre ve fiyat. Eklenince burada seçili gelir.</div></div><div class="rdock"><span class="rcta">Müşteri ve hizmet seçin</span></div>`,{id:"S3",hd:1,tab:2,t:"11:21"}),
 notes:["Kayıttan ilk randevuya kadar bilgisayar yok: müşteri arama kutusundan, hizmet aynı ekrandaki satırdan.","Boş liste \"yok\" der, sıfır satırlık boş kart çizilmez."]})
].join(""));
