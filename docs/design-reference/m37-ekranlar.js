/* Müdür 37 · WhatsApp bağlama — ekranlar (Tek Kişilik v4 dili) */
const ICN={};const I=(n,c="")=>{if(!(n in ICN)){const e=document.getElementById("i-"+n);ICN[n]=e?e.innerHTML:""}return `<svg class="ic${c?" "+c:""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICN[n]}</svg>`};
const sbar=()=>`<div class="status"><span class="n">9:41</span><span class="rt"><span class="bars"><i></i><i></i><i></i><i></i></span>${I("wifi","wf")}<span class="batt"><i></i></span></span></div>`;
const TABS=[["sun","Gün"],["cal","Takvim"],["plus","Randevu"],["cash","Kasa"],["user","İşletme"]];
const tabbar=sel=>`<nav class="tabbar">${TABS.map(([ic,l],i)=>`<span class="tab${i===sel?" sel":""}">${I(ic)}<span>${l}</span></span>`).join("")}</nav>`;
const ph=(inner,th,o)=>`<div class="phone ${th}${o.se?" se":""}" data-screen-label="${o.id} · ${th==="lt"?"açık":"koyu"}">${o.glow?'<div class="glow"></div>':""}${sbar()}<div class="body">${inner}</div>${o.tab!=null?tabbar(o.tab):""}</div>`;
const notes=a=>(a||[]).map(n=>`<div class="note"><span>${n}</span></div>`).join("");
const pair=o=>`<section class="pair${o.se?" se":""}"><div class="plab"><b>${o.id}</b><span>${o.title}</span>${o.tag?`<i class="tag">${o.tag}</i>`:""}</div><div class="pp">${ph(o.s,"lt",o)}${ph(o.s,"dk",o)}</div><div class="when"><i>Ne zaman görünür</i><span>${o.when}</span></div>${notes(o.notes)}</section>`;
const block=o=>`<section class="pair"><div class="plab"><b>${o.id}</b><span>${o.title}</span></div><div class="pp">${o.lt}${o.dk}</div><div class="when"><i>Ne zaman görünür</i><span>${o.when}</span></div>${notes(o.notes)}</section>`;
const put=(id,h)=>{document.getElementById(id).innerHTML=h};

/* ortak parçalar */
const phd=t=>`<div class="phd">${I("back")}<h2>${t}</h2></div>`;
const mhd=(t,o={})=>`<div class="mhd"><span class="ib">${I(o.x?"x":"back")}</span><b>${t}</b>${o.v?'<span class="tx">Vazgeç</span>':""}</div>`;
const st=(c,t)=>`<div class="st ${c}"><s></s>${t}</div>`;
const ft=(h,c="")=>`<div class="ft${c?" "+c:""}">${h}</div>`;
const btn=(t,c="",ic="")=>`<span class="kbtn${c?" "+c:""}">${t}${ic?I(ic):""}</span>`;
const gh=t=>`<span class="kgh">${t}</span>`;

/* A1 · İşletme sekmesi */
const WS={ok:["ok","Bağlı"],no:["no","Bağlı değil"],rd:["rd","Bağlantı düştü"],ld:["ld","Kontrol ediliyor"],un:["no","Okunamadı"]};
const gr=o=>`<div class="gr${o.sm?" sm":""}${o.hl?" hl":""}"><span class="t"><b>${o.b}</b>${o.s?`<span>${o.s}</span>`:""}</span>${o.v?`<span class="vv">${o.v}</span>`:""}${o.ws?`<span class="ws ${WS[o.ws][0]}"><s></s>${WS[o.ws][1]}</span>`:""}${I("chev","cv")}</div>`;
const grp=r=>`<div class="grp">${r.map(gr).join("")}</div>`;
const WA={ok:{b:"WhatsApp",s:"29 Ekim'den beri",ws:"ok"},no:{b:"WhatsApp",s:"Hatırlatmalar gitmiyor",ws:"no"},rd:{b:"WhatsApp",s:"Mesajlar gitmiyor",ws:"rd"},ld:{b:"WhatsApp",s:"Durum soruluyor",ws:"ld"},un:{b:"WhatsApp",s:"Açınca yeniden sorulur",ws:"un"}};
const hcard=`<div class="hcard"><span class="a">BUGÜN · PAZARTESİ</span><span class="o"><s></s>Şu anda açık</span><span class="h n">09:00 – 19:00</span><span class="k">kapanışa <b class="n">3 sa 44 dk</b></span>${I("chev")}</div>`;
const A1=`<div class="scr"><div class="pfh"><s>İŞLETME</s><h2>Derya Güzellik Stüdyosu</h2><span>İstanbul · Güzellik / Salon</span></div>${hcard}${grp([{b:"Çalışma saatleri",s:"6 gün · pazar kapalı"},{b:"Hizmetler ve fiyatlar",s:"7 hizmet"},{...WA.rd,hl:1}])}${grp([{b:"Ekip",sm:1},{b:"Personel",sm:1},{b:"Paketler",sm:1},{b:"Müşteriler",v:"20 kişi",sm:1}])}${grp([{b:"Hesap",v:"derya",sm:1},{b:"Görünüm",v:"Sistem",sm:1}])}</div>`;
const RCAP={ok:"BAĞLI",no:"HİÇ BAĞLANMAMIŞ",rd:"BAĞLANTI DÜŞTÜ",ld:"YÜKLENİYOR",un:"OKUNAMADI"};
const rbox=th=>`<div class="rbox ${th}">${["ok","no","rd","ld","un"].map(k=>`<div class="rcap">${RCAP[k]}</div>${grp([WA[k]])}`).join("")}</div>`;

/* A2 · eylem hapı (Müdür 34 v2 — tasarım aynı, yalnız metin ve hedef) */
const eye=(g,c="")=>`<span class="acell${c}"><span class="aeye"><span class="aring"></span>${g==="SD"?'<span class="aini">SD</span>':I(g)}</span></span>`;
const stg=(lab,sub)=>`<div class="stg"><div class="alab"><b>${lab}</b><i>${sub}</i></div><div class="bal">${eye("tel")}${eye("send"," off prs")}${eye("nox")}${eye("SD")}<span class="arw"></span></div><div class="pn"><span class="stripe"></span><div class="pcol"><span class="plb"><s></s>GECİKTİ</span><span class="hero n">8 <u>dk</u></span><span class="psub n">22 dk sonra düşer</span></div><div class="pact"><span class="ph44 fill">Geldi</span><span class="ph44 open">Yönet</span></div></div></div>`;
const a2col=th=>`<div class="stbox ${th}"><span class="stcap">${th==="lt"?"Açık tema":"Koyu tema"} · hat bağlı değil</span>${stg("WhatsApp bağlı değil","buradan bağlanır")}<span class="stcap">${th==="lt"?"Açık tema":"Koyu tema"} · bağlantı düştü</span>${stg("WhatsApp bağlantısı düştü","buradan yeniden bağlanır")}</div>`;

/* A3 · randevu onayı (Müdür 16 · E kalıbı) */
const cfCard=`<div class="cfc"><div class="cfr"><b>Zeynep Kaya</b><span class="n">0532 ••• 03 02</span></div><div class="cfs"><s></s><span class="tb"><b>Kesim + fön</b><span class="n">75 dk</span></span><em class="n">₺1.000</em></div></div>`;
const strip=`<div class="strip">${I("check")}<span class="tb"><b>Randevu duruyor</b><span class="n">14 Ağustos Cuma 11:00 – 12:15 · Merve</span></span></div>`;
const A3=`<div class="okh c"><div class="ring"><span class="tk mute">${I("send")}</span></div><div class="h1c">Mesaj gönderilemedi</div><div class="subc">WhatsApp bağlı değil. Mesaj gitmedi.</div></div><div class="cfb">${strip}${cfCard}</div><div class="dock"><span class="dp">WhatsApp'ı bağla</span><span class="ds">Sonra</span><span class="dn">Bağladıktan sonra bu ekrana dönersiniz.</span></div>`;
const A3b=`<div class="okh c"><div class="ring ok"><span class="tk">${I("check")}</span></div><div class="h1c">WhatsApp bağlandı</div><div class="subc">Mesaj henüz gitmedi. Şimdi gönderebilirsiniz.</div></div><div class="cfb">${strip}${cfCard}</div><div class="dock"><span class="dp">Mesajı gönder${I("send")}</span><span class="ds">Sonra</span><span class="dn">Bu ekran kendi kapanmaz.</span></div>`;

put("s-a",[
 pair({id:"A1",title:"İşletme sekmesi · yeni WhatsApp satırı",s:A1,tab:4,glow:1,
  when:"İşletme sekmesi her açıldığında. Satır hattın durumunu sağında yazar; çizilen hâl “Bağlantı düştü”.",
  notes:["<b>Yeri:</b> Hizmetler ve fiyatlar'ın hemen altı, ilk grubun son satırı. Bu grup müşterinin gördüğü şeyleri topluyor (saat, hizmet, mesaj); Ekip, Personel, Paketler, Müşteriler ikinci grupta, Hesap ve sonrası üçüncüde aynen kalıyor.",
  "<b>Satırın sağı durumu, altı sonucu söyler:</b> “Bağlantı düştü” / “Mesajlar gitmiyor”. Renk kelimenin yanında, tek başına değil. Düştüğünde satırın zemini turuncuya %7 ısınır; müdür sekmeyi açtığında gözü önce oraya gider.",
  "Satır her rolde görünür; personel sayfayı salt okur (H2)."]}),
 block({id:"A1 · satır hâlleri",title:"Beş hâl, beş kelime",lt:rbox("lt"),dk:rbox("dk"),
  when:"Durum sorgusunun cevabına göre. Yükleniyor ve okunamadı “bağlı değil” gibi yazılmaz.",
  notes:["<b>Okunamadı gri:</b> hat belki bağlı; kırmızı ya da “bağlı değil” yanlış alarm olur. Sayfaya girilince durum yeniden sorulur.",
  "Bağlı hâlde alt satır tarihi söyler, numarayı değil: numara sistemde kayıtlı değil."]}),
 block({id:"A2",title:"Eylem hapı · WhatsApp gözü",lt:a2col("lt"),dk:a2col("dk"),
  when:"Akıştaki bir kartın hapı açıldığında ve işletmenin hattı bağlı değilken ya da bağlantı düşmüşken. Göz basılıyken kelime bloğu bu metni yazar.",
  notes:["<span class=\"was\"><s>Bugün: “WhatsApp bağlı değil · masaüstünden bağlanır”</s></span> Yeni: <b>“WhatsApp bağlı değil · buradan bağlanır”</b>, düştüyse <b>“WhatsApp bağlantısı düştü · buradan yeniden bağlanır”</b>.",
  "Hap, göz ve onarım gözünün %40 mürekkebi aynı. Değişen yalnız kelime bloğunun metni ve hedef: tek dokunuş hapı 110 ms'de kapatır ve bağlama modalını açar (C'den başlar). Kapanınca kart yerindedir.",
  "Kartta kayıt satırı yazılmaz; bağlama bir eylem değil, onarım."]}),
 pair({id:"A3",title:"Randevu onayı · mesaj gitmedi, hat bağlı değil",s:A3,
  when:"Randevu kurulduktan sonra müşteriye mesaj gönderilmek istendi ve sunucu “bağlı değil” döndü.",
  notes:["Müdür 16'nın E hâli. Bu sebepte <b>Tekrar dene</b> işe yaramayacağı için ana düğme <b>WhatsApp'ı bağla</b>; “Sonra” yanında aynen duruyor.",
  "Simge kırmızı ünlem değil, gri mesaj balonu: mesaj başarısız olmadı, gidecek hat yok. Kırmızı bağlantı düşmesine ayrıldı."]}),
 pair({id:"A3b",title:"Randevu onayı · bağlanıp dönünce",s:A3b,
  when:"A3'ten açılan akış F1'e ulaştı ve “Randevu ekranına dön”e basıldı. Mesaj kendiliğinden gitmez; müdür gönderir.",
  notes:["Randevu ve müşteri kartı aynı yerde. Değişen üç şey: tik yeşil, başlık “WhatsApp bağlandı”, ana düğme <b>Mesajı gönder</b>. Bundan sonrası Müdür 16'nın C ve D hâlleri."]})
].join(""));

/* B · ilk tanışma */
const B=`${phd("WhatsApp")}<div class="pg">${st("no","BAĞLI DEĞİL")}<h3 class="h1">İşletmenizin WhatsApp hattını bağlayın</h3><div class="card"><span class="eb">BAĞLANINCA</span>${["Randevu onayları ve hatırlatmalar müşteriye işletmenizin numarasından gider.","Asistan açıksa müşteri hatırlatmaya “Evet” ya da “Hayır” diye cevap verebilir.","Asistan açıksa gelen mesajlara asistan cevap verir."].map(t=>`<div class="li"><s></s><span>${t}</span></div>`).join("")}</div><div class="trust">${I("phn")}<span>Bağlamak, telefondaki WhatsApp'ın <b>Bağlı Cihazlar</b> listesine bir cihaz eklemektir. Sohbetleriniz yerinde kalır; bağlantıyı istediğinizde oradan da kaldırabilirsiniz.</span></div></div>${ft(btn("WhatsApp'ı bağla"))}`;
const opt=(on,ic,b,s,rec)=>`<div class="opt${on?" on":""}"><span class="oi">${I(ic)}</span><span class="t"><b>${b}${rec?'<i class="rec">ÖNERİLEN</i>':""}</b><span>${s}</span></span><span class="rad"></span></div>`;
const C=`${mhd("WhatsApp'ı bağla",{x:1})}<div class="pg"><h3 class="h1 mt">İşletmenizin WhatsApp'ı hangi telefonda?</h3><p class="lead">Bağlama yolu buna göre değişir.</p></div>${ft(opt(1,"phn","Bu telefonda","Numaranızla bağlanırsınız",1)+opt(0,"phn2","Başka bir telefonda","O telefonla QR kodu okutursunuz")+btn("Devam","","arrow"))}`;
put("s-b",[
 pair({id:"B",title:"Bağlı değil · ilk tanışma",s:B,glow:1,
  when:"Hat hiç bağlanmamışken WhatsApp sayfası açıldığında. Ayrıca kod ya da QR beklenirken akıştan çıkılmışsa bir sonraki açılışta.",
  notes:["Üç madde olacak olanı düz anlatıyor; pazarlama cümlesi, süre vaadi, görsel yok.",
  "Güven cümlesi düğmenin hemen üstünde, okunmadan basılmasın diye kart dışında ve küçük değil.",
  "Tek ana düğme başparmak bölgesinde. Masaüstüne yönlendiren cümle bu sayfada yok."]}),
 pair({id:"C",title:"Hangi telefonda?",s:C,
  when:"Bağlama akışının ilk adımı: B, G, F3, A2 ya da A3'ten “bağla” denince.",
  notes:["Teknik kelime yok: “QR”, “eşleştirme” soruda geçmiyor; QR yalnız ikinci seçeneğin açıklamasında, o telefonun yapacağı iş olarak.",
  "<b>Bu telefonda</b> seçili gelir; çoğu kullanıcı yalnız <b>Devam</b>'a basar. Seçenekler 92 pt, ekranın alt yarısında.",
  "Seçim hatırlanmaz: her bağlamada yeniden sorulur, çünkü düşmenin sık sebebi telefon değişmesi."]})
].join(""));

/* D · numarayla */
const KB=`<div class="kb">${[["1",""],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["",""],["0",""],["⌫",""]].map(([k,l],i)=>`<span class="${i===9||i===11?"bl":""}">${k}${l?`<u>${l}</u>`:""}</span>`).join("")}</div>`;
const fld=(v,foc)=>`<div class="fld${foc?" foc":""}"><span class="n">${v}</span>${foc?'<i class="car"></i>':""}</div>`;
const D1=`${mhd("Numarayla bağla",{v:1})}<div class="pg"><h3 class="h1 mt">Hattın numarası</h3><p class="lead">WhatsApp'ın kurulu olduğu numara.</p><div class="fl"><span>NUMARA</span>${fld("0532 418 27 90",1)}</div><p class="hint">İşletme profilindeki numara hazır geldi. Farklıysa değiştirin.</p></div>${ft(btn("Kodu al"),"kbon")}${KB}`;
const code=dead=>`<div class="code${dead?" dead":""}">${[..."K7RM"].map(c=>`<i>${c}</i>`).join("")}<b></b>${[..."2P4X"].map(c=>`<i>${c}</i>`).join("")}</div>`;
const steps=a=>`<div class="steps">${a.map((t,i)=>`<div class="step"><s class="n">${i+1}</s><span>${t}</span></div>`).join("")}</div>`;
const SD=["WhatsApp'ı açın.","Ayarlar → <b>Bağlı Cihazlar</b> → <b>Cihaz Bağla</b>.","<b>“Bunun yerine telefon numarasıyla bağla”</b>ya dokunun.","Kodu girin."];
const tmr=(t,f,w="sonra geçersiz olur")=>`<span class="tmr"><span><b class="n">${t}</b> ${w}</span><span class="trk"><i style="transform:scaleX(${f})"></i></span></span>`;
const cpy=`<span class="cbtn">${I("copy")}Kopyala</span>`;
const D2=dead=>`${mhd("Numarayla bağla",{v:1})}<div class="pg"><div class="fl" style="margin-top:12px"><span>BAĞLAMA KODU · <em class="n">0532 418 27 90</em></span></div>${code(dead)}<div class="ctool">${dead?'<span class="tmr"><span>Kodun süresi doldu. Yeni kod alın.</span></span>':cpy+tmr("2:41",.54)}</div>${steps(SD)}<div class="aside"><span>WhatsApp bazen kendisi “kodu girin” bildirimi gösterir. O bildirime dokunarak da girebilirsiniz.</span></div></div>${ft(dead?btn("Yeni kod al","","refresh"):btn("WhatsApp'ı aç","","out"))}`;
const D3=`${mhd("Numarayla bağla")}<div class="pg"><div class="wait"><span class="pulse"><i></i></span><span class="t"><b>Bağlantı bekleniyor…</b><span>Kodu WhatsApp'a girdiyseniz bu ekran birkaç saniye içinde kendiliğinden değişir.</span></span></div><div class="fl" style="margin-top:20px"><span>BAĞLAMA KODU</span></div>${code()}<div class="ctool">${cpy+tmr("1:58",.39)}</div><div class="aside"><span>Kodu henüz girmediyseniz WhatsApp'ta: Bağlı Cihazlar → Cihaz Bağla → “Bunun yerine telefon numarasıyla bağla”.</span></div></div>${ft(btn("WhatsApp'a dön","ln","out")+gh("Vazgeç"))}`;
put("s-d",[
 pair({id:"D1",title:"Numara · klavye açık",s:D1,tag:"yeni veri",
  when:"C'de “Bu telefonda” ile Devam'a basılınca. Alan odaklı gelir, sayı klavyesi açık.",
  notes:["Alan işletmenin kayıtlı telefonuyla dolu gelir; değiştirilebilir. Biçim Türkiye: <code>0532 000 00 00</code>, yazılırken boşluklar kendiliğinden girer.",
  "<b>Kodu al</b> klavyenin hemen üstünde; klavye açıkken de, SE'de de görünür.",
  "Basılınca düğme “Kod alınıyor” olur ve pasifleşir; cevap gelince D2 itilir. Gelmezse H3."]}),
 pair({id:"D2",title:"Bağlama kodu",s:D2(),tag:"yeni veri",
  when:"Sunucu kodu döndürünce. Ekranın kahramanı kod; sayaç sakin, ana düğme WhatsApp'a geçirir.",
  notes:["Kod iki dörtlük blok, eşit genişlikli yazı, her karakter kendi kutusunda: WhatsApp'a bakıp geri dönen göz yerini kaybetmesin. <b>Kopyala</b> kodu tire olmadan panoya alır.",
  "Adımlar WhatsApp'taki sırayla ve WhatsApp'taki kelimelerle. Bildirim yolu ayrı bir yan not; adımlara karışmıyor.",
  "<b>WhatsApp'ı aç</b> uygulamaya geçer. Geri dönünce ekran D3'e kendiliğinden geçer; müdür bir şeye basmaz."]}),
 pair({id:"D2 · süre doldu",title:"Kod sönük, yeni kod",s:D2(1),
  when:"Kodun süresi D2 ya da D3 açıkken doldu.",
  notes:["Kırmızı yok, uyarı simgesi yok: süre dolması bir hata değil. Kod %35'e söner, okunur ama kopyalanamaz.",
  "<b>Yeni kod al</b> aynı numarayla yeni istek gönderir; D1'e geri dönülmez."]}),
 pair({id:"D3",title:"Bağlantı bekleniyor",s:D3,
  when:"Kullanıcı D2'den WhatsApp'a geçip uygulamaya geri döndüğünde. Durum her 3 saniyede bir sorulur.",
  notes:["Bekleyen kişi ne yapacağını biliyor: girdiyse bekler, girmediyse yol yan notta yazılı ve <b>WhatsApp'a dön</b> düğmesi var.",
  "Kod ve sayaç hâlâ görünür; kod bu ekrandan da kopyalanabilir.",
  "<b>Vazgeç</b> bu adımda altta: beklerken başparmak ekranın altında. Basılınca istek bırakılır ve modal kapanır; sayfa B'ye döner."]}),
 pair({id:"D2 · 375",title:"Bağlama kodu · iPhone SE",s:D2(),se:1,
  when:"D2'nin en küçük ekrandaki hâli.",
  notes:["Hücre 34 pt, adım satırı 8 pt dolgu. Kod, dört adım ve ana düğme kaydırmadan sığar."]})
].join(""));

/* E · QR */
const qr=()=>{const N=25;let s=2861;const r=()=>(s=(s*16807)%2147483647)/2147483647;const inF=(x,y)=>(x<8&&y<8)||(x>N-9&&y<8)||(x<8&&y>N-9);let o="";for(let y=0;y<N;y++)for(let x=0;x<N;x++){if(!inF(x,y)&&r()<.47)o+=`<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`}const f=(x,y)=>`<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x+1}" y="${y+1}" width="5" height="5" fill="#fff"/><rect x="${x+2}" y="${y+2}" width="3" height="3"/>`;return `<svg viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" fill="#0E0E0E" aria-label="QR kod">${o}${f(0,0)}${f(N-7,0)}${f(0,N-7)}</svg>`};
const QR=qr();
const SQ=["Diğer telefonda WhatsApp'ı açın.","<b>Bağlı Cihazlar</b> → <b>Cihaz Ekle</b>.","Kamerayı bu koda tutun."];
const E=`${mhd("QR ile bağla",{v:1})}<div class="pg"><p class="lead c">İşletmenin WhatsApp'ı olan telefonla okutun.</p><div class="qr">${QR}</div><div class="qtool">${tmr("0:42",.7,"sonra yenilenir")}<span class="cbtn">${I("refresh")}Yenile</span></div>${steps(SQ)}<div class="swr"><span class="t"><b>Ekranı aydınlat</b><span>Okutmak kolaylaşır</span></span><span class="vv">Kapalı</span><span class="sw"><i></i></span></div></div>`;
put("s-e",[
 pair({id:"E",title:"QR ile bağlama",s:E,
  when:"C'de “Başka bir telefonda” ile Devam'a basılınca. QR gelene kadar beyaz kutunun içinde iskelet.",
  notes:["QR iki temada da beyaz kutuda, 20 pt sessiz alanla. Kutunun dışı temaya uyar; kodun kendisi hiç ters çevrilmez.",
  "Sayaç masaüstündeki gibi: “0:42 sonra yenilenir”. <b>Yenile</b> elle yeni kod ister. Okutulunca ekran D3'teki gibi bağlantıyı kendiliğinden fark eder ve F1'e geçer.",
  "<b>Ekranı aydınlat</b> öneri (bkz. 08 · yeni veri): açılınca parlaklık tama çıkar, akıştan çıkınca eski değerine döner. QR deseni örnek."]})
].join(""));

/* F · bağlandı */
const F1=`<div class="okh"><div class="ring ok"><span class="tk">${I("check")}</span></div><div class="h1c">WhatsApp bağlandı</div><div class="subc">Hatırlatmalar ve onaylar artık bu hattan gider.</div></div><div class="dock"><span class="dp">Test mesajı gönder</span><span class="ds">Bitti</span></div>`;
const stat=a=>`<div class="stats">${[["Gönderildi",a[0]],["Başarısız",a[1]],["Atlandı",a[2]],["Gelen",a[3]]].map(([l,v])=>`<div class="${v===0?"z":""}"><b class="n">${v}</b><span>${l}</span></div>`).join("")}</div>`;
const hs=`<div class="hs"><s></s><b>Bağlı</b><span>· 29 Ekim'den beri</span></div>`;
const test=(o={})=>`<div class="card"><span class="eb">TEST MESAJI</span><div class="tf"><div class="fld2${o.v?"":" ph"} n">${o.v||"05xx xxx xx xx"}</div><span class="gbtn${o.v?"":" off"}">Gönder</span></div>${o.res||'<span class="cap">Hatırlatma ve onaylarla aynı hattan gider.</span>'}</div>`;
const F2=(o={})=>`${phd("WhatsApp")}<div class="pg">${hs}${o.pre||""}<div class="card"><span class="eb">SON 24 SAAT</span>${o.zero?'<p class="zero">Son 24 saatte mesaj yok.</p>':stat(o.st||[14,0,2,9])}${o.err||""}</div>${o.notest?"":test(o.test||{})}</div>${o.nofoot?"":ft('<p class="outl">Asistan ve mesaj ayarları masaüstünde: <b>Ayarlar → WhatsApp</b>.</p><span class="kes">Bağlantıyı kes…</span>')}`;
const okRes='<div class="res ok">'+I("check")+'<span>Gönderildi. <span>Telefonu kontrol edin.</span></span></div>';
const noRes='<div class="res no">'+I("warn")+'<span>Gönderilemedi. <span>Numara geçersiz.</span></span></div>';
const lerr='<div class="lerr">'+I("warn")+'<span><b>Son hata · bugün 10:12.</b> Numarası geçersiz olduğu için bir hatırlatma gitmedi.</span></div>';
const sheet=`<div class="scrim"></div><div class="sheet"><div class="grabber"><i></i></div><div class="shb"><h3>Bağlantı kesilsin mi?</h3><p>Bağlantı kesilince hatırlatmalar ve mesajlar gitmez. Yeniden bağlamak için kodu tekrar almanız gerekir.</p></div>${ft(btn("Vazgeç","nt")+btn("Bağlantıyı kes","rd"))}</div>`;
const amn=`<div class="amn"><b>GELEN MESAJLAR İŞLENMİYOR</b><span>Hat bağlı ama gelen mesajlara bot cevap vermiyor. Giden hatırlatmalar etkilenmez.</span><span class="pbtn">Yeniden bağla</span></div>`;
put("s-f",[
 pair({id:"F1",title:"Başarı anı",s:F1,glow:1,
  when:"D3 ya da E'de bağlantı fark edildiği an. Modalın son karesi.",
  notes:["Sevindirici ama kısa: halka, tik, iki satır, bir dokunsal. Konfeti, ses, maskot yok. Hareket ölçüsü 08'de.",
  "<b>Test mesajı gönder</b> F2'yi açar ve test alanına odaklanır. <b>Bitti</b> modalı kapatır.",
  "A3'ten gelindiyse ana düğme <b>Randevu ekranına dön</b> olur (A3b)."]}),
 pair({id:"F2",title:"Bağlı sayfası",s:F2(),
  when:"Hat bağlıyken WhatsApp sayfası her açıldığında. Sayılar sayfa açılınca yenilenir.",
  notes:["Önem sırası yukarıdan aşağı: durum ve tarih, son 24 saat, test, masaüstü satırı, kesme. Numara hiçbir yerde yok.",
  "Sıfır olan sayı soluk yazılır (Başarısız 0): göz sorunlu olana gider.",
  "<b>Bağlantıyı kes…</b> kırmızı yalnız yazıda, kendi kutusunda ve en altta. Üç nokta onay geleceğini söylüyor."]}),
 pair({id:"F2 · sakin gün",title:"Mesaj yok · test gitti",s:F2({zero:1,test:{v:"0532 418 27 90",res:okRes}}),
  when:"Son 24 saatte dört sayının hepsi sıfırsa; test mesajı gönderilip sunucu “gitti” dediğinde.",
  notes:["Dört sıfır yerine bir cümle: “Son 24 saatte mesaj yok”. Bu bir sorun değil, ama müdürün “hat çalışıyor mu?” sorusunun cevabı test mesajı. O yüzden test hemen altında."]}),
 pair({id:"F2 · son hata",title:"Son hata · test gitmedi",s:F2({st:[11,1,0,4],err:lerr,test:{v:"0533 000 11 2",res:noRes}}),
  when:"Son 24 saatte başarısız mesaj varsa son hata tek satır yazılır. Test mesajı gönderilemediyse sebebi satırın altında.",
  notes:["Hata insan diliyle ve tek satır; ham hata kodu, sunucu adı yok. Sebep kelimeleri eylem hapının kayıt satırlarıyla aynı (“numara geçersiz”, “bağlantı yok”).",
  "Amber uyarıdır, kırmızı değil: hat çalışıyor, bir mesaj gitmedi."]}),
 pair({id:"F2 · kes",title:"Bağlantıyı kes · onay",s:`<div class="fade">${F2({nofoot:1})}</div>${sheet}`,
  when:"F2'de “Bağlantıyı kes…”e basılınca.",
  notes:["Metin masaüstündeki onay metniyle aynı. <b>Vazgeç</b> dolu ve üstte; <b>Bağlantıyı kes</b> kırmızı çerçeveli, altta.",
  "Kesilince sayfa B'ye döner. Telefondaki WhatsApp'ın Bağlı Cihazlar listesinden de düşer."]}),
 pair({id:"F3",title:"Bağlı ama gelen mesajlar işlenmiyor",s:F2({pre:amn,nofoot:1}),
  when:"Hat bağlı, ama sunucu gelen mesajların işlenmediğini bildiriyor. Nadir; masaüstünde de aynı uyarı var.",
  notes:["Amber, kırmızı değil: giden hatırlatmalar çalışıyor. Cümle ikisini ayırıyor.",
  "<b>Yeniden bağla</b> modalı C'den açar. Bağlantı kesilmeden yeniden kurulur; sayfadaki sayılar kaybolmaz."]})
].join(""));

/* G · düştü */
const G=`${phd("WhatsApp")}<div class="pg">${st("rd","BAĞLANTI DÜŞTÜ")}<h3 class="h1">Hatırlatmalar ve mesajlar şu an gitmiyor.</h3><p class="lead">Bu genelde telefon değişince, WhatsApp'tan çıkış yapılınca ya da telefon uzun süre internetsiz kalınca olur.</p><div class="card rdc"><span class="eb">BAĞLANANA KADAR GİTMEYENLER</span>${["Randevu onayları","Hatırlatmalar","İptal haberleri","Asistanın cevapları"].map(t=>`<div class="li2"><s></s>${t}</div>`).join("")}</div></div>${ft(btn("Yeniden bağla","","arrow"))}`;
put("s-g",[
 pair({id:"G",title:"Bağlantı düştü",s:G,
  when:"Hat daha önce bağlıydı, şimdi değil. Aynı hâl A1 satırında (kırmızı kelime, ısınmış zemin) ve A2 hapında (“bağlantısı düştü”) görünür.",
  notes:["Kırmızı üç yerde: üst etiket, kart çerçevesi, maddelerin noktası. Ana düğme turuncu, çünkü eylem.",
  "Sebepler sırayla ve suçlamadan; hangisi olduğunu bilmiyoruz, uydurmuyoruz.",
  "<b>Yeniden bağla</b> C'den başlar. Son 24 saat ve test bu hâlde çizilmez: hat yokken sınanacak bir şey yok."]})
].join(""));

/* H · durum dili */
const sk=(w,h,m="")=>`<span class="sk" style="width:${w}px;height:${h}px;${m}"></span>`;
const H1=`${phd("WhatsApp")}<div class="pg">${st("ld","KONTROL EDİLİYOR")}${sk(170,30,"margin-top:12px")}<div class="card">${sk(96,12)}<div class="skg">${[0,1,2,3].map(()=>`<span style="display:flex;flex-direction:column;gap:6px">${sk(34,26)}${sk(62,11)}</span>`).join("")}</div></div><div class="card">${sk(110,12)}${sk(320,50,"width:100%")}</div></div>`;
const H1b=`${phd("WhatsApp")}<div class="void"><div class="vlbl"><s></s>DURUM OKUNAMADI</div><div class="vttl">Hattın durumu şu an okunamadı</div><div class="vsub">Bu, hattın bağlı olmadığı anlamına gelmez. İnternetinizi kontrol edip tekrar deneyin.</div><span class="hap">${I("refresh")}Tekrar dene</span></div>`;
const H2=`${phd("WhatsApp")}<div class="pg">${hs}<div class="card"><span class="eb">SON 24 SAAT</span>${stat([14,0,2,9])}</div><div class="lock">${I("lock")}<span>Bağlantıyı işletme sahibi kurar.</span></div></div>`;
const H3=`${mhd("Numarayla bağla",{v:1})}<div class="pg"><h3 class="h1 mt">Hattın numarası</h3><p class="lead">WhatsApp'ın kurulu olduğu numara.</p><div class="fl"><span>NUMARA</span>${fld("0532 418 27 90")}</div><div class="err">${I("warn")}<span>Kod alınamadı, tekrar deneyin.</span></div></div>${ft(btn("Tekrar dene","","refresh"))}`;
put("s-h",[
 pair({id:"H1",title:"Yükleniyor",s:H1,
  when:"WhatsApp sayfası açıldı, durum soruluyor. Cevap gelince B, F2 ya da G'ye çapraz solar.",
  notes:["İskelet F2'nin biçiminde; “Bağlı değil” ya da düğme bu hâlde hiç çizilmez."]}),
 pair({id:"H1 · okunamadı",title:"Durum okunamadı",s:H1b,
  when:"Sunucuya ulaşılamadı ya da cevap bozuk geldi.",
  notes:["“Bağlı değil” demiyor ve bağlama düğmesi göstermiyor: hat bağlıyken yeniden bağlamak gereksiz bir kod ister.",
  "Gri nokta, kırmızı değil. Tek eylem <b>Tekrar dene</b>."]}),
 pair({id:"H2",title:"Yetki yok · personel",s:H2,
  when:"Personel hesabı WhatsApp sayfasını açtığında. Çizilen hâl: bağlı.",
  notes:["Durumu ve son 24 saati okur; test, kesme ve bağlama düğmeleri yok. Tek cümle: “Bağlantıyı işletme sahibi kurar.”",
  "Bağlı değil ya da düştü hâlinde de aynı: B ve G'nin metni durur, ana düğmenin yerinde bu cümle."]}),
 pair({id:"H3",title:"Kod alınamadı",s:H3,
  when:"D1'de “Kodu al”a basıldı, sunucu kod döndüremedi. QR yolunda aynı hâl “QR alınamadı, tekrar deneyin.”",
  notes:["Sunucu adı, “instance”, “webhook” yok. Numara alanda kalır; <b>Tekrar dene</b> aynı numarayla yeniden ister.",
  "Amber simge, kırmızı değil: kullanıcının bir hatası yok."]})
].join(""));
