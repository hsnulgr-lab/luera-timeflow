/* Luera Mobil · Tek kişilik işletme — ekran kurucuları */
const g=(n,c="")=>`<svg class="${c}" viewBox="0 0 24 24"><use href="#i-${n}"/></svg>`;
const sbar=(t,o={})=>`<div class="status"><span class="n" data-clk>${t}</span><div class="rt">${o.off?g("off","ofi"):""}<span class="bars${o.off?" no":""}"><i></i><i></i><i></i><i></i></span><span class="batt"><i></i></span></div></div>`;
const ph=(inner,o={})=>`<div class="phone${o.lt?" lt":""}${o.cls?" "+o.cls:""}" data-screen-label="${o.id||""}"${o.dom?` id="${o.dom}"`:""}>${o.glow?'<div class="glow"></div>':""}${o.warm?`<div class="warm ${o.warm}"></div>`:""}${sbar(o.t||"10:48",o)}<div class="body">${inner}</div><div class="home-ind"></div></div>`;
const spec=(id,title,sub,phone,notes=[])=>`<div class="spec"><div class="spec-label"><b>${id} — ${title}</b><span>${sub}</span></div>${phone}${notes.map(n=>`<div class="note"><span>${n}</span></div>`).join("")}</div>`;

/* ── Gün · taban ── */
const calHead=(d,n,sub)=>`<div class="cal-head"><div class="cal-title"><span class="day">${d}<i></i></span><span class="num n">${n}</span></div><div class="cal-sub">${sub}</div></div>`;
const DOTS=`<span class="dts"><i></i><i></i><i></i></span>`;
const stl=cs=>`<div class="statline">${cs.map(c=>`<button aria-label="${c.a||c.l}">${c.m?`<b class="mk">${DOTS}${g("eyeoff")}</b>`:c.sk?`<b><span class="skel" style="width:${c.sk}px;height:22px"></span></b>`:`<b class="n${c.d?" dash":""}">${c.v}</b>`}<span>${c.l}</span></button>`).join("")}</div>`;
const STL=[{m:1,l:"tahsil",a:"Bugünkü tahsilat, Kasa'yı açar"},{v:"1",l:"açık adisyon",a:"Açık adisyona git"},{v:"3 sa",l:"boş",a:"İlk boşluğa git"}];
const fk=(c,l)=>`<div class="fk ${c==="or"?"or":c==="a"?"a":""}"><s class="${c}"></s>${l}</div>`;
const nm=(a,s)=>`<div class="fnm"><span>${a}</span><b>${s}</b></div>`;
const dr=o=>`<div class="dr${o.dim?" dim":""}${o.live?" live":""}${o.live==="am"?" am":""}"${o.k2?` data-k="${o.k2}"`:""}><span class="ft n">${o.t}</span><div class="fb">${fk(o.c||"",o.k)}${nm(o.a,o.s)}<div class="fd">${o.d}</div>${o.act?`<div class="fa">${o.act}</div>`:""}</div></div>`;
const HP=`<div class="hairpad"></div>`;
const gap=(t,rng,len)=>`<div class="gp"><span class="ft n">${t}</span><button class="box" aria-label="${rng} arasına randevu kur"><span><b class="n">${rng}</b> · ${len} boş</span><span class="gpp">${g("plus")}Randevu</span></button></div>`;
const nowl=t=>`<div class="nowline"><b class="n" data-clk>${t}</b><s></s></div>`;
const dn=(n,txt)=>`<button class="dn">${g("check")}<span><b>${n}</b> ${txt}</span>${g("chev","cv")}</button>`;
const pill=(t,sec)=>`<button class="gopill${sec?" sec":""}">${t}</button>`;
const amt=v=>`<span class="amt n">${v}</span>`;
const tabbar=(sel=0)=>{const ic=["today","cal","plus","cash","store"],lb=["Gün","Hafta","Randevu kur","Kasa","İşletme"];return`<div class="tabbar">${ic.map((n,i)=>`<button class="tab${i===sel?" sel":""}${i===2?" plus":""}" aria-label="${lb[i]}">${g(n)}</button>`).join("")}</div>`};
const slider=(lbl,o={})=>`<div class="sl${o.big?" big":""}${o.cl?" "+o.cl:""}" style="--p:${o.p||0}" role="button" tabindex="0" aria-label="${lbl}. Kaydırın ya da iki kez dokunun."><div class="fill"></div><div class="lbl">${lbl}</div><div class="rel">Bırak · başlıyor</div><div class="sok"></div><div class="hnd">${g("arrow")}</div></div>`;
const ada=o=>`<button class="ada ${o.k}" aria-label="Kumandayı aç"><span class="ag"><i></i></span><span class="ab"><span class="mr" style="--pr:${o.pr}"><span class="arc"></span>${o.k==="or"?'<s class="pd"></s>':g("timer")}</span><span class="at"><span class="ak">${o.kk}</span><b>${o.who}</b></span><span class="av2 n" data-ada>${o.v}</span>${g("chevu","cu")}</span></button>`;
const yuva=x=>`<div class="yuva">${x}</div>`;

const GUL=dr({t:"10:30",c:"a",k:"adisyon açık",a:"Gül",s:"Tan",d:"Fön · 30 dk · 10:58'de bitti",act:amt("₺350")+pill("Tahsil et")});
const ELIF=dr({t:"12:30",k:"sırada",a:"Elif",s:"Demir",d:"Kaş alma + fön · 45 dk"});
const AYSE=dr({t:"14:00",k:"sırada",a:"Ayşe",s:"Yılmaz",d:"Saç boyama + fön · 120 dk · içinde 35 dk bekleme"});
const zey=(k,c,live,d)=>dr({t:"11:00",c,k,a:"Zeynep",s:"Kaya",d,live,k2:"zey"});

const gunBosta=()=>calHead("Per","8","Perşembe · 6 randevu · sıradaki 12 dk sonra")+stl(STL)+`<div class="flow">${dn("2","randevu tamamlandı")}${HP}${GUL}${nowl("10:48")}${zey("sıradaki · 12 dk sonra","or",0,"Saç boyama · 90 dk · içinde 35 dk bekleme")}${HP}${ELIF}${gap("13:15","13:15–14:00","45 dk")}${AYSE}<div class="padbot y"></div></div>`;
const gunBekleme=(t="11:36")=>calHead("Per","8","Perşembe · 6 randevu · 1 işlem sürüyor")+stl(STL)+`<div class="flow">${dn("2","randevu tamamlandı")}${HP}${GUL}${HP}${zey("bekliyor · boya","a","am","Saç boyama · 11:02'de başladı · bekleme 11:55'te biter")}${nowl(t)}${ELIF}${gap("13:15","13:15–14:00","45 dk")}${AYSE}<div class="padbot y"></div></div>`;
const gunSuruyor=(t="11:14")=>calHead("Per","8","Perşembe · 6 randevu · 1 işlem sürüyor")+stl(STL)+`<div class="flow">${dn("2","randevu tamamlandı")}${HP}${GUL}${HP}${zey("sürüyor","or",1,"Saç boyama · 11:02'de başladı · 90 dk plan")}${nowl(t)}${ELIF}${gap("13:15","13:15–14:00","45 dk")}${AYSE}<div class="padbot y"></div></div>`;

/* ── Kumanda · üst katman ── */
const kgrab=txt=>`<button class="kgrab" aria-label="Kumandayı indir, günü göster"><i></i><span>${g("chevd")}Güne in · ${txt}</span></button>`;
const NEXT="sıradaki <b>12:30 Elif Demir</b>";
const idp=o=>`<div class="idp"><div class="who"><div class="st ${o.sc||""}"><s></s>${o.st}</div><div class="nm">${o.nm||"Zeynep Kaya"}</div><div class="sv">${o.sv||"Saç boyama"}</div>${o.tm===null?"":`<div class="tm">${o.tm||"11:02 başlangıç · 90 dk plan"}</div>`}</div>${o.tools===false?"":`<div class="tools"><button class="tb" aria-label="Müşteriyi ara">${g("phone")}</button><button class="tb" aria-label="Not ve formül">${g("note")}<i></i></button><button class="tb" aria-label="Müşteri kartı">${g("user")}</button></div>`}</div>`;
const dialB=(el,pl,p,o={})=>`<div class="dial"><span class="big n${o.q?" q":""}" data-el>${el}</span><span class="unit">geçen süre</span><div class="plnk"><div class="trk" style="--p:${p}"><i></i><s></s></div><span data-pl>${pl}</span></div>${o.chip===false?"":`<button class="dchip" data-act="wait">${g("timer")}Bekleme kur</button>`}</div>`;
const ringBig=(rem,pr,cls,lb)=>`<div class="ring ${cls}" style="--pr:${pr}"><div class="rail"></div><div class="arc"></div><span class="rem n" data-wl>${rem}</span><span class="lb">${lb}</span><span class="src">Boya · 35 dk</span></div>`;
const dialW=(rem,pr,cls,el,extra="")=>`<div class="dial"><div class="el2"><u class="n" data-el>${el}</u><i>geçen · 90 dk plan</i></div>${ringBig(rem,pr,cls,cls.includes("zero")?"bekleme bitti":"bekleme kalan")}${extra}</div>`;
const strip=(n,last)=>`<div class="strip"><div class="t"><b>Adisyon · ${n} kalem</b><span><u>son</u>${last}</span></div><button class="mny" aria-label="Tutarı göster">${DOTS}${g("eyeoff")}</button><button class="add" aria-label="Kalem ekle">${g("plus")}</button></div>`;
const fin=()=>`<div class="act"><div class="fin" role="button" tabindex="0" aria-label="İşlemi bitir. Basılı tutun ya da iki kez dokunun."><div class="rail"></div><div class="arc"></div><div class="core"><b>BİTİR</b><u>basılı tut</u>${g("check")}</div></div></div>`;
const it=(n,k,p)=>`<div class="it"><div class="t"><b>${n}</b><span>${k}</span></div><span class="pz n${p?"":" non"}">${p||"stoktan düşer"}</span></div>`;
const ITS=it("Saç boyama","Hizmet","₺1.450")+it("Saç bakım maskesi","Ek hizmet","₺210")+it("Boya · 7.3 kumral ×2","Malzeme");
const seg=(on,opts=["Nakit","Kart","Havale"])=>`<div class="seg">${opts.map((m,i)=>`<button class="${i===on?"on":""}" data-m="${i}">${m}</button>`).join("")}</div>`;
const payBody=(o={})=>`<div class="pg">${kgrab(NEXT)}${idp({st:"bitti · 82 dk",sc:"gr",tm:null,tools:false})}<div class="dial top"><span class="pay n">₺1.660</span><span class="unit">toplam · 3 kalem</span><span class="lead">11:02 – 12:24 · <b>82 dk sürdü</b></span></div><div class="its">${ITS}</div><div class="slab">Ödeme</div>${seg(o.m??0)}<div class="foot">${o.err?`<div class="banner err">${g("warn")}<span>Tahsilat kaydedilmedi. İnternet bağlantısı yok; kasaya bir şey yazılmadı. Bağlantı gelince tekrar deneyin.</span></div>`:""}<button class="btn" data-act="pay">${o.err?"Tekrar dene · ":""}₺1.660 nakit tahsil et</button><button class="btn gh">Sonra tahsil et · adisyon açık kalır</button></div></div>`;
const doneBody=(o={})=>`<div class="pg"><div class="done"><div class="ok">${g("check")}</div><h3>₺1.660 nakit alındı</h3><p>Zeynep Kaya · 12:25 · kasaya yazıldı. Boya stoktan düştü, not müşteri kartına eklendi.</p><button class="mini">${g("cash")}Yanlışsa Kasa'da düzeltin</button></div><div class="nx"><div class="h">${fk("or","sıradaki · 5 dk sonra")}${nm("Elif","Demir")}<div class="fd">Kaş alma + fön · 45 dk</div></div>${slider("Kaydır · Elif'i başlat")}</div><div class="foot" style="padding-top:8px"><button class="btn gh" data-act="home">Güne dön</button></div></div>`;
const kumIslem=(el="22:18",o={})=>`<div class="pg">${kgrab(NEXT)}${idp({st:"sürüyor",sc:"or"})}${dialB(el,"90 dk plan · 68 dk kaldı",.25,o)}${strip(2,"Boya · 7.3 kumral")}${fin()}</div>`;
const kumSifir=()=>`<div class="pg">${kgrab(NEXT)}${idp({st:"bekleme bitti",sc:"am"})}${dialW("YIKA",1,"zero","53:12",`<button class="mini" data-act="ack">${g("check")}Başındayım</button>`)}${strip(2,"Boya · 7.3 kumral")}${fin()}</div>`;

/* ── Randevu kur · saat (kim sorusu yok) ── */
const week=()=>{const d=[["Per","8",1],["Cum","9"],["Cmt","10"],["Paz","11",0,1],["Pzt","12"],["Sal","13"],["Çar","14"]];return`<div class="week">${d.map(([l,n,s,o])=>`<button class="wd${s?" sel":""}${o?" off":""}"><span class="n">${n}</span><span class="l">${l}</span></button>`).join("")}</div>`};
const kurSheet=()=>`<div class="scrim"></div><div class="sheet full"><div class="grab"><i></i></div><div class="sh"><h3>Randevu kur</h3><s>3 / 3 · saat</s></div><div class="sb"><button class="par hot"><s></s><u>Zeynep Kaya · boya</u><b class="n">04:12</b></button><div class="steps"><i></i><i></i><i></i></div><div class="chosen"><b>Selin Boz · Kesim</b><span>45 dk · ₺650</span></div>${week()}<div class="slab" style="padding:12px 2px 8px">Bugün 45 dakikanın sığdığı saatler</div><div class="slots"><button class="slot on n">13:15</button><button class="slot n">17:15</button><button class="slot n">17:30</button><button class="slot n">17:45</button><button class="slot n">18:00</button><button class="slot n">18:15</button></div><div class="sx">16:00–16:30 arası 30 dk; kesim sığmadığı için önerilmiyor.</div></div><div class="sf"><button class="btn">Bugün 13:15 · randevuyu kur</button></div></div>`;

/* ── Kasa · düzeltme ── */
const kasaList=()=>`<div class="pgt"><h2>Kasa</h2><span>Perşembe 8 Ekim · 2 tahsilat · 1 açık adisyon</span></div><div class="stack" style="position:relative;z-index:10"><div class="kr"><div class="t"><b>Zeynep Kaya</b><span>12:25 · Nakit · Saç boyama</span></div><span class="r n">₺1.660</span></div><div class="kr"><div class="t"><b>Merve Aydın</b><span>10:31 · Kart · Kesim + fön</span></div><span class="r n">₺900</span></div><div class="kr"><div class="t"><b>Gül Tan</b><span>Açık adisyon · Fön</span></div><span class="r n" style="color:var(--am)">₺350</span></div></div>`;
const duzSheet=()=>`<div class="scrim"></div><div class="sheet"><div class="grab"><i></i></div><div class="sh"><h3>Tahsilatı düzelt</h3><s>12:25 kaydı</s></div><div class="sb"><div class="sumc"><b>Zeynep Kaya · ₺1.660 nakit</b><span>Saç boyama · 12:25'te alındı</span></div><div class="field"><span>Tutar</span><div class="in n">₺1.660</div></div><div class="slab" style="padding:16px 2px 8px">Yöntem</div><div class="seg" style="padding:0">${["Nakit","Kart","Havale"].map((m,i)=>`<button class="${i===1?"on":""}">${m}</button>`).join("")}</div><div class="slab" style="padding:16px 2px 8px">Sebep</div><div class="chips"><button class="chp">Yanlış tutar</button><button class="chp on">Yanlış yöntem</button><button class="chp">Yanlış müşteri</button></div></div><div class="sf"><button class="btn">Düzeltmeyi kaydet · nakit → kart</button><button class="btn dg">Tahsilatı geri al</button><div class="small">Eski kayıt silinmez. Kasada "düzeltildi · saat" olarak görünür.</div></div></div>`;

/* ── Boş / kurulum / durumlar ── */
const empty=(ic,h,p,x="")=>`<div class="empty"><div class="ring0">${g(ic)}</div><h3>${h}</h3><p>${p}</p>${x}</div>`;
const skRows=()=>[0,1,2].map(()=>`<div class="dr"><span class="ft"><span class="skel" style="display:block;width:40px;height:14px"></span></span><div class="fb"><span class="skel" style="width:96px;height:12px"></span><span class="skel" style="width:190px;height:20px"></span><span class="skel" style="width:150px;height:13px"></span></div></div>${HP}`).join("");

const S2=[
 spec("T01","Gün · boşta","10:48. İşlem yok, sıradaki müşteri 12 dk sonra. Alt yuvada başlatma çubuğu var; çubuk sıradakine 15 dk kala beliriyor.",
  ph(gunBosta()+yuva(slider("Kaydır · Zeynep'i başlat"))+tabbar(0),{id:"T01",glow:1,t:"10:48"}),
  ["<b>Boşluk satırı</b> dokununca randevu kurmayı o saatle açıyor. Personel şeridinin cevapladığı \"kim boş\" sorusu burada \"ne zaman boşum\" oluyor.",
   "<b>Özet şeridi:</b> günün toplamı maskeli, çünkü bekleyen müşteri ekranı görebilir. Tekil adisyon tutarı açık; onu tahsil etmek gerekiyor. Üç hücrenin her biri bir yere gidiyor: Kasa, açık adisyon, ilk boşluk.",
   "<b>Tahsil et</b> hapı müdür kabuğunda kapalı, tek kabukta açık (karar 4)."]),
 spec("T02","Gün · beklemede","11:36. Zeynep'in boyası bekliyor; kumanda adaya indi. Bu aralıkta kişinin elleri serbest.",
  ph(gunBekleme()+yuva(ada({k:"am",kk:"bekleme kalan · boya",who:"Zeynep Kaya",v:"18:40",pr:.47}))+tabbar(0),{id:"T02",glow:1,t:"11:36"}),
  ["Bekleme kurulduğunda kumanda <b>kendiliğinden iner</b>; bu, kullanıcının kendi eyleminin sonucu. Halka 600 ms görünüyor, sonra kumanda adaya dönüşüyor.",
   "<b>Ada</b>, kumanda sheet'inin toplanmış hâli. Tutamağı cam (sheet kuralı), gövdesi opak. Dokununca ya da yukarı itince kumanda kalkıyor.",
   "Gül'ün açık adisyonu şimdi kapatılabilir. Bekleme süresi, tek kişinin yönetim işini yapabildiği aralık."]),
 spec("T03","Gün · işlem arka planda","11:14 · aydınlık. Telefon çaldı; kumanda elle aşağı çekildi. İşlem durmadı.",
  ph(gunSuruyor()+yuva(ada({k:"or",kk:"sürüyor · geçen",who:"Zeynep Kaya · boya",v:"12:06",pr:.13}))+tabbar(0),{id:"T03",glow:1,lt:1,t:"11:14"}),
  ["Turuncu ada geçen süreyi sayıyor, amber ada beklemeyi. Renk ve kelime birlikte değişiyor; renk tek başına bir anlam taşımıyor.",
   "Kumanda kalkmadan bütün yönetim yapılabiliyor: randevu kurma, tahsilat, takvim. Ada bu süre boyunca başparmağın altında kalıyor."])
];
const S3=[
 spec("T04","Kumanda · işlemde","11:24. Personel 06'nın B evresiyle aynı. Değişen iki şey: tepede tutamak ve tutamağın içinde \"sıradaki\" satırı.",
  ph(kumIslem(),{id:"T04",warm:"or",t:"11:24"}),
  ["<b>Tab bar yok.</b> Ekranda bir müşteri, bir sayı, bir eylem var. Yönetim tutamağın altında, Gün'de bekliyor.",
   "Tutamak aşağı çekilince (PanResponder, eşik %35 ya da vy > 0.6) ya da dokununca kumanda adaya iniyor. İşlem sürüyor.",
   "\"Sıradaki\" satırı tek kişi için gerekli: başka kimse \"Elif geldi\" demeyecek. Satır tek bilgi taşıyor ve dokunulduğunda kumandayı indiriyor."]),
 spec("T05","Randevu kur · bekleme son beş dakika","11:51. Kullanıcı telefonla randevu kuruyor. Beklemenin son beş dakikası formu kesmiyor; şerit olarak formun tepesine çıkıyor.",
  ph(gunBekleme("11:51")+kurSheet(),{id:"T05",t:"11:51"}),
  ["<b>Kim yapacak sorusu yok.</b> Üç adım var: müşteri, hizmet, saat. Saat adımı yalnız hizmetin sığdığı aralıkları öneriyor; sığmayan aralık neden önerilmediğini yazıyor.",
   "<b>Kırmızı şerit</b> kumandadaki komşu iş şeridiyle aynı bileşen. Açık bir sayfa varken kumanda kendiliğinden kalkmıyor: şerit beliriyor ve tek titreşim veriliyor.",
   "Hiç aralık yoksa düğme kapalı kalmıyor, yerine sebep geliyor: \"Bu gün 45 dakikalık boşluk yok. Başka gün seçin.\""]),
 spec("T06","Kumanda · bekleme bitti","11:55. Sıfırda kumanda kendiliğinden kalkıyor. Bu tek otomatik kalkış ve yalnız açık bir sayfa yoksa oluyor.",
  ph(kumSifir(),{id:"T06",warm:"am",t:"11:55"}),
  ["Halka kelimeye dönüyor: hizmet şablonundaki sıfır kelimesi (boyada \"YIKA\"). <b>Başındayım</b> beklemeyi kapatıyor ve kadranı geçen süreye döndürüyor.",
   "Uygulama arka plandayken yerel bildirim ve ses gerekiyor. Bildirim saati <code>wait_ends_at</code> ile <code>server_now()</code> farkından kuruluyor (bkz. not §9)."]),
 spec("T07","Tahsilat · BİTİR'den sonra","12:24. Personelde bu adım \"Adisyonu kasaya gönder\" idi. Tek kişide parayı alan da uygulamayı kullanan da aynı kişi.",
  ph(payBody(),{id:"T07",warm:"gr",t:"12:24"}),
  ["Tutar burada <b>açık</b>; müşteri zaten ödüyor. Kumandanın geri kalanında para maskeli.",
   "Yöntem seçimi tek dokunuş: Nakit, Kart (POS cihazı ayrı), Havale. Uygulama kart çekmiyor, yalnız parayı kaydediyor.",
   "<b>Sonra tahsil et</b> adisyonu açık bırakıyor; Gün'de \"adisyon açık\" satırı olarak görünüyor (T01'deki Gül)."]),
 spec("T08","Tahsilat · sunucu reddetti","Bağlantı yok. Ekranda hiçbir şey değişmedi; sebep, kullanıcının baktığı yerde yazıyor.",
  ph(payBody({err:1}),{id:"T08",warm:"gr",t:"12:24",off:1}),
  ["<b>Tahsilat sıraya alınmıyor.</b> Para kaydı ya sunucuda var ya yok. Adisyon açık kalıyor, tutar aynı, seçilen yöntem korunuyor.",
   "Para dışındaki yazmalar (not, kalem) mevcut kuyruk diliyle devam edebilir."]),
 spec("T09","Tahsil edildi → sıradaki","12:25. Bitir, tahsil et, sıradakini başlat: hepsi aynı yerde ve tek elle yapılıyor.",
  ph(doneBody(),{id:"T09",t:"12:25"}),
  ["Ekran üç şeyi söylüyor: ne kadar alındı, nereye yazıldı, stokta ne oldu. Kutlama yok.",
   "\"Yanlışsa Kasa'da düzeltin\" düğmesi T10'u açıyor. Bilgisayardan söz eden bir cümle yok."])
];
const S4=[
 spec("T10","Kasa · tahsilatı düzelt","Bugün cash.ts:380 \"masaüstündeki Kasa'dan\" diyor. Tek modda düzeltme ve geri alma telefonda yapılıyor.",
  ph(kasaList()+duzSheet()+tabbar(3),{id:"T10",t:"12:40"}),
  ["<b>Ters kayıt:</b> eski satır silinmiyor; düzeltme sunucu saatiyle yazılıyor ve kasada görünüyor.",
   "Geri alma onay diyaloğu sormuyor, çünkü geri alınabiliyor (yeniden tahsil edilebilir). Yalnız sebep soruyor; sebep tek dokunuşluk bir seçim.",
   "Sunucu kabul edene kadar listede eski tutar duruyor (§7)."])
];
const S5=[
 spec("T11","Kayıt sonu · mod sorusu","signup/ready.tsx'in yerine geliyor. Adım sayısı aynı kalıyor ve \"bilgisayardan tamamla\" düğmesi yok.",
  ph(`<div class="cent"><div class="mark" style="font-size:30px">luera<i></i></div><div style="display:flex;flex-direction:column;gap:10px"><h2>Bu işletmede işi kim yapıyor?</h2><p>Uygulama cevabınıza göre açılır. Sonra İşletme'den değiştirebilirsiniz.</p></div><div style="display:flex;flex-direction:column;gap:10px"><button class="opt pri"><span class="t"><b>Yalnız ben</b><span>Randevu, işlem ve kasa tek telefondan.</span></span>${g("chev")}</button><button class="opt"><span class="t"><b>Ekibim var</b><span>Siz yönetirsiniz, çalışanlar kendi telefonundan girer.</span></span>${g("chev")}</button></div></div>`,{id:"T11",glow:1,t:"10:02"}),
  ["Soru \"yalnız mısınız?\" değil, işi kimin yaptığı; ilki kişisel bir soru gibi okunuyor.",
   "Mod personel sayısından çıkarılamıyor: kayıt anında herkesin personel sayısı sıfır (karar 1)."]),
 spec("T12","İlk gün · iki adım kaldı","\"Randevu almaya bugün başlayabilirsiniz\" vaadi bu üç adımla tutuluyor. Hizmet ekleme adımın kendisi; bir yönlendirme değil.",
  ph(calHead("Per","8","Perşembe · Studio Ayla")+`<div class="sq"><h2>İlk randevunuza iki adım kaldı</h2><p>Saat önerileri hizmet süresinden ve çalışma saatlerinizden çıkıyor.</p></div><div style="margin-top:10px;border-top:1px solid var(--bd);position:relative;z-index:10"><button class="su ok"><span class="no">${g("check")}</span><span class="t"><b>Hizmetleriniz</b><span>3 hizmet · Kesim, Fön, Saç boyama</span></span>${g("chev","cv")}</button><button class="su cur"><span class="no">2</span><span class="t"><b>Çalışma saatleriniz</b><span>Henüz girilmedi</span></span>${g("chev","cv")}</button><div class="su wait"><span class="no">3</span><span class="t"><b>İlk randevu</b><span>Saatler girilince açılır</span></span></div></div>`+tabbar(0),{id:"T12",glow:1,t:"10:04"}),
  ["Üçüncü adım bir düğme değil; satır, neden henüz açılmadığını yazıyor. Kapalı ama sebepsiz bir düğme yok.",
   "Bu hâldeyken tab bar'daki \"+\" de aynı listeye düşüyor; \"Saat seçin\" kilidine hiçbir yoldan ulaşılmıyor.",
   "Sahip kayıtta sessizce bir personel satırına bağlandığı için (karar 3) createFlow.ts:181 bu modda kilitlenmiyor."]),
 spec("T13","Boş gün · açık","Gerçekten boş: sunucu boş dizi döndü. Ekran \"yok\" diyor.",
  ph(calHead("Per","8","Perşembe · 09:00–19:00 açık")+stl([{m:1,l:"tahsil"},{v:"0",l:"açık adisyon"},{v:"10 sa",l:"boş"}])+empty("cal","Bugün randevunuz yok.","09:00–19:00 arası açıksınız. Bir saate randevu kurmak için alttaki “+”.")+yuva(`<button class="btn sec" style="height:66px">${g("walk")}Kapıdaki müşteriyi hemen başlat</button>`)+tabbar(0),{id:"T13",glow:1,t:"09:12"}),
  ["<b>Kapıdan gelen müşteri</b> tek kişide sık görülüyor. Bu düğme saat adımını atlıyor: müşteri, hizmet, ardından doğrudan kumanda.",
   "Özet şeridi boş günde de duruyor: \"0\" burada doğru bir sayı, çünkü liste okundu ve boş."]),
 spec("T14","Kapalı gün","Boş ile kapalı ayrı hâller ve aynı cümleyle söylenmiyor.",
  ph(calHead("Paz","11","Pazar · kapalı")+empty("moon","Pazar günleri kapalısınız.","Yine de randevu kurabilirsiniz; çalışma saatleriniz değişmez.",`<button class="mini">${g("store")}Çalışma saatleri</button>`)+tabbar(0),{id:"T14",glow:1,t:"09:40"}),
  ["Kapalı günde ölçülecek bir şey olmadığı için özet şeridi yok.",
   "\"Çalışma saatleri\" düğmesi İşletme → saatler ekranını açıyor; o ekran telefonda zaten çalışıyor."]),
 spec("T15","Yükleniyor","Cihazın bildiği gerçek gösteriliyor (gün, tarih); geri kalan iskelet.",
  ph(calHead("Per","8","Perşembe")+stl([{sk:64,l:"tahsil"},{sk:28,l:"açık adisyon"},{sk:48,l:"boş"}])+`<div class="flow">${skRows()}</div>`+tabbar(0),{id:"T15",glow:1,t:"10:48"}),
  ["<b>Ada da yok.</b> Bir işlemin sürüp sürmediği henüz bilinmiyor; bilinmeyen bir şey gösterilmiyor.",
   "Shimmer ve animasyon yok. İskelet gerçek satırın geometrisini 4 pt içinde tutuyor."]),
 spec("T16","Okunamadı","Sunucu cevap vermedi. Bu bir \"boş\" hâli değil, bir \"bilmiyorum\" hâli.",
  ph(calHead("Per","8","Perşembe")+stl([{v:"—",d:1,l:"tahsil"},{v:"—",d:1,l:"açık adisyon"},{v:"—",d:1,l:"boş"}])+empty("off","Gün okunamadı.","Bağlantı yok ya da sunucu cevap vermedi. Randevularınız yerinde; şu an gösterilemiyor.",`<button class="mini">${g("refresh")}Tekrar dene</button>`)+tabbar(0),{id:"T16",glow:1,t:"10:48",off:1}),
  ["Rakamların yerinde <b>\"—\"</b> var, \"0\" yok. Okunamayan veri sıfır gibi gösterilmiyor.",
   "Kapalı düğme yok. Tekrar dene, okumayı yeniden başlatıyor."])
];
document.getElementById("s2").innerHTML=S2.join("");
document.getElementById("s3").innerHTML=S3.join("");
document.getElementById("s4").innerHTML=S4.join("")+`<div class="spec" style="width:520px"><div class="spec-label"><b>Kabuk — sekmeler ve rota</b><span>app/tek/ gerçek segment. Ortak ekranlar app/(ortak)/ altında.</span></div><div class="rn" style="margin:0"><div class="r h"><b>Sekme</b><span>İçerik</span></div><div class="r"><b>Gün</b><span>Bugünün sırası, boşluk satırları, alt yuva. <code>app/tek/gun.tsx</code></span></div><div class="r"><b>Hafta</b><span>Günler alt alta, her günde boşluklar. Personel sütunu yok. Bu turda çizilmedi. <code>hafta.tsx</code></span></div><div class="r"><b>+</b><span>Müşteri → hizmet → saat. \"Kapıdaki müşteri\" yolu saat adımını atlıyor. Modal rota.</span></div><div class="r"><b>Kasa</b><span>Tahsilat, düzeltme, geri alma, açık adisyonlar. <code>kasa.tsx</code></span></div><div class="r"><b>İşletme</b><span>Hizmetler ve fiyatlar, çalışma saatleri, "Tek kişilik çalışıyorsunuz · Ekip ekle", tema, çıkış. Personel, ekip kodu ve telefon bağlama satırları yok. <code>isletme.tsx</code></span></div><div class="r"><b>Kumanda katmanı</b><span><code>_layout.tsx</code> içinde, sekmelerin üstünde. Sekme değişince durum korunuyor. <code>src/components/tek/KumandaKatmani.tsx</code></span></div></div></div>`;
document.getElementById("s5").innerHTML=S5.join("");

const kap=[["profil/personel.tsx:285,353","k0","Düşer","Satır render edilmiyor. Ekip eklemek İşletme → \"Ekip ekle\" kapısından yapılıyor; bu kapı telefonda personel eklemeyi şart koşuyor (karar 2)."],
["CreateFlow.tsx:455","k3","Düzeltilir · bütün modlarda","Cümle yerine satır içi \"Hizmet ekle\" var ve profil/hizmetler'e gidiyor. Bu bir kusur; tek modu beklememeli. İlk gün ekranında (T12) hizmet ekleme birinci adım."],
["cash.ts:380","k3","Çözülür","Kasa → tahsilat → Düzelt / Geri al (T10). Ters kayıt, sunucu saatiyle."],
["Akış · adisyon kartı","k3","Çözülür","\"Adisyon açık\" satırında Tahsil et (T01); BİTİR'den sonra tahsilat (T07). Karar 4'e bağlı."],
["paket-sat.tsx:303","k2","Kısmen · bilerek","Paket telefondan tek ödemeyle satılıyor. Peşinat ve taksit kapsam dışı: seçenek render edilmiyor, yönlendiren cümle de yok. Taksit vade takibi ve kısmi tahsilat modeli istiyor; ürün sahibi bilerek ertelemeli."],
["actionPill.ts:39 · WhatsApp","k2","Bağlamadan çözülür","Randevu satırındaki \"Mesajla hatırlat\" telefonun WhatsApp'ını hazır metinle açıyor (Linking · wa.me). Otomatik hatırlatma kapsam dışı."],
["signup/ready.tsx","k3","Düğme çıkmaz","Yerine mod sorusu (T11), ardından ilk gün (T12)."],
["createFlow.ts:181 · \"Saat seçin\"","k3","Kendiliğinden düşer","Sahip kayıtta personel satırına bağlanıyor (karar 3). Aralık yoksa düğme sebebini yazıyor (T05)."]];
document.getElementById("s6").innerHTML=`<div class="rn"><div class="r h"><b>Yer</b><em>Karar</em><span>Nasıl</span></div>${kap.map(([a,k,b,c])=>`<div class="r"><b style="text-transform:none;letter-spacing:0;font-family:ui-monospace,Menlo,monospace;font-weight:600;font-size:12px">${a}</b><em class="${k}">${b}</em><span>${c}</span></div>`).join("")}</div>`;

const rn=[["Katman değeri","Tek paylaşılan değer: <code>kat</code> (0 = kumanda tam, 1 = ada). Gövde <code>translateY = kat × (H − 84)</code>. Kumanda içeriği 0–0.4 aralığında soluyor, ada içeriği 0.6–1 aralığında beliriyor. Bırakınca <code>withSpring</code> (damping 22, stiffness 220)."],
["Jest · PanResponder","Kumanda tutamağında ve adada. <code>onMoveShouldSetPanResponder</code> yalnız |dy| > 8 ve |dy| > |dx| olduğunda devreye giriyor. Bırakma: <code>kat > 0.35</code> ya da <code>vy > 0.6</code> → 1; değilse 0. Gesture-handler kullanılmıyor."],
["Kendiliğinden hareket","Yalnız iki tane. Bekleme kurulunca iniş: sunucu kabul ettikten sonra halka 600 ms görünüyor, ardından iniş. Bekleme sıfırda kalkış: açık bir sayfa yoksa. Kullanıcı ya da kural tetiklesin, ikisi de elle hareketle aynı yayı kullanıyor."],
["Alt yuva","<code>bottom: 124</code> (tab bar 46 + 66 + 8). Gün listesinin alt boşluğu yuva doluyken 240, boşken 140. Başlatma çubuğu 76 pt, ada 84 pt."],
["Ada","Tutamak şeridi 18 pt cam (sheet kuralı), gövde opak <code>card</code>. Mini halka 48 pt, 4 pt kenar. Sayı 30/800 tabular. Turuncu = geçen süre · amber = bekleme · kırmızı = son 5 dk, saniyeli, nabızlı."],
["Son beş dakika","Ada kırmızıya dönüyor, saniyeleri gösteriyor ve tek titreşim veriyor. Açık bir sayfa varsa aynı şerit (<code>.par.hot</code>) sayfanın tepesine çıkıyor. Formu kesen bir hareket yok."],
["Zaman","Geçen süre <code>started_at</code>'tan, bekleme <code>wait_ends_at</code>'tan hesaplanıyor; ikisi de sunucuda yazılıyor. Cihaz yalnız <code>server_now()</code> farkını uyguluyor. Yerel bildirim saati de bu farkla kuruluyor."],
["Yazma","Başlat, bekleme kur, BİTİR, tahsil et: ekran sunucu kabul edene kadar değişmiyor. Beklerken kadranın altında kesik çizgi, düğmede dönen gösterge var. Red durumunda hiçbir şey değişmiyor ve sebep düğmenin üstünde yazıyor."],
["Para","Kumandada maskeli (göz düğmesi, 6 sn sonra kendiliğinden kapanıyor; Personel 06 ile aynı). Gün'de toplam maskeli, tekil adisyon açık. Tahsilat ekranında açık."],
["Kontrol edilecek paketler","<code>expo-haptics</code> (son 5 dk, sıfır) · <code>expo-notifications</code> (uygulama arka plandayken bekleme bitişi). Bildirim paketi yoksa ve kurulmayacaksa, uygulama kapalıyken beklemenin bittiğini haber verecek bir yol yok. Bu durum ürün sahibine açıkça söylenmeli."],
["Erişilebilirlik","\"Hareketi azalt\" açıkken yay yerine 180 ms opaklık geçişi kullanılıyor. \"Saydamlığı azalt\" açıkken cam katmanlar <code>surf</code> + <code>bd2</code>'ye düşüyor. Kaydırma çubuğu ve BİTİR, iki kez dokunma ile de çalışıyor."]];
document.getElementById("s7").innerHTML=`<div class="rn">${rn.map(([a,b])=>`<div class="r"><b>${a}</b><span>${b}</span></div>`).join("")}</div>`;
