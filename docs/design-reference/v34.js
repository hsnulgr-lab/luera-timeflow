const PATHS={
 tel:'<path d="M7.5 3.6h2.5l1.4 3.5-2 1.3a11.4 11.4 0 0 0 5.1 5.1l1.3-2 3.5 1.4v2.5a2 2 0 0 1-2 2C10.7 17.4 5.6 12.3 5.6 5.6a2 2 0 0 1 1.9-2z"/>',
 send:'<path d="M6.5 4.6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7l-4.2 3.2V14.6a2 2 0 0 1-1.8-2v-6a2 2 0 0 1 2-2z"/><path d="M8.9 9.6h6.1"/><path d="M12.6 7.3l2.4 2.3-2.4 2.3"/>',
 nox:'<circle cx="10" cy="7.9" r="3.2"/><path d="M4.4 19c0-3.2 2.5-5.2 5.6-5.2 1 0 1.9.2 2.7.6"/><path d="M15.9 15.6l3.4 3.4"/><path d="M19.3 15.6l-3.4 3.4"/>',
 bell:'<path d="M12 4.2a5.1 5.1 0 0 0-5.1 5.1v3.3L5.4 16h13.2l-1.5-3.4V9.3A5.1 5.1 0 0 0 12 4.2z"/><path d="M9.9 18.4a2.3 2.3 0 0 0 4.2 0"/>',
 chk:'<path d="M5.6 12.4l4.2 4.2 8.6-9.4"/>'};
const svg=(n,w)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.7)+'" stroke-linecap="round" stroke-linejoin="round">'+PATHS[n]+'</svg>';
const ic=n=>svg(n);
const chv=(dn)=>`<svg class="chv${dn?' dn':''}" viewBox="0 0 18 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8.5 9 3.5 15 8.5"/></svg>`;
const CEL={ara:['tel','Ara','telefon açılır'],wa:['send','WhatsApp’tan yaz','hazır metin, salonun numarası'],nox:['nox','Gelmedi','geri alınabilir'],inf:['SD','Personele bilgi ver','Selin’e bildirim gider'],waoff:['send','WhatsApp bağlı değil','Ayarlara git']};
const cl=v=>Math.max(0,Math.min(1,v));
/* iki büyük harf = personelin baş harfleri (veri), onun dışında çizim (simge) */
const mark=(g,cr,cls,st)=>{const t=g.length===2&&g===g.toUpperCase();return `<span class="${t?'aini':'aic'}${cr?' cr':''}${cls?' '+cls:''}"${st?' '+st:''}>${t?g:ic(g)}</span>`};
const cell=(k,s)=>{s=s||{};const c=CEL[k],g=c[0];
 const f=s.f||0,done=!!s.done,press=!!(s.press||done||(f>0&&!s.dim));
 const cf=s.cf!=null?s.cf:cl((f-.45)/.32);
 const sc=s.sc!=null?s.sc:(press?1.12:(s.dim?.94:1));
 const ro=s.ro!=null?s.ro:(press?1:.55);
 const vars=`--s:${sc};--f:${done?1:f};--ro:${ro}`+(s.eo!=null?`;--eo:${s.eo}`:'')+(s.ho!=null?`;--ho:${s.ho}`:'')+(s.hs!=null?`;--h:${s.hs}`:'');
 const ink=mark(g,0,s.icls,s.icls?'':`style="opacity:${done?0:1-cf}"`);
 const cream=(cf>0||done||s.ccls)?mark(g,1,s.ccls,s.ccls?'':`style="opacity:${done?0:cf}"`):'';
 const chk=(done||s.kcls)?mark('chk',1,s.kcls):'';
 const halo=(s.ho!=null||s.hcls)?`<span class="ahalo${s.hcls?' '+s.hcls:''}"></span>`:'';
 return `<div class="acell${s.dim&&!press?' dim':''}${k==='waoff'?' off':''}${s.cls?' '+s.cls:''}"><div class="aeye${s.ecls?' '+s.ecls:''}" style="${vars}"${s.est?` ${s.est}`:''}>${halo}<span class="aring${s.rcls?' '+s.rcls:''}"></span><span class="adisc${s.fcls?' '+s.fcls:''}"></span>${ink}${cream}${chk}</div></div>`};
const labl=(k,sub,cls)=>`<span class="ach${cls?' '+cls:''}"><b>${CEL[k]?CEL[k][1]:k}</b><i>${sub!=null?sub:(CEL[k]?CEL[k][2]:'')}</i></span>`;
const pill=(keys,o)=>{o=o||{};return `<div class="bal act${o.inv?' inv':''}${o.below?' below':''}${o.cls?' '+o.cls:''}"${o.st2?` style="${o.st2}"`:''}>${keys.map((k,i)=>cell(k,o.st&&o.st[i])).join('')}${o.lab?`<div class="alab${o.labcls?' '+o.labcls:''}">${o.lab}</div>`:''}<span class="arw"></span></div>`};
const line=(inner,dim)=>`<div class="mline"><div class="grow">${inner}</div><div class="brk"><i></i><b>${dim}</b></div></div>`;
const pnl=o=>`<div class="pnl${o.inv?' inv':''}${o.stripe?' stp '+o.stripe:''}">${o.stripe?'<span class="stripe"></span>':''}<div class="in"><div class="pcol"><div class="plbl${o.tone?' '+o.tone:''}"><s></s>${o.lbl}</div><div class="hero n${o.heroc?' '+o.heroc:''}">${o.hero}</div>${o.sub?`<div class="psub">${o.sub}</div>`:''}${o.rec?`<div class="prec n${o.rect?' '+o.rect:''}"><s></s>${o.rec}</div>`:''}</div>${o.right?`<div class="pact${o.tight?' tight':''}">${o.right}</div>`:''}</div></div>`;
const card=o=>o.act?`<div class="balwrap">${pill(o.act,{...(o.acto||{}),inv:o.inv})}${pnl(o)}</div>`:pnl(o);
const stage=o=>{const a=o.acto||{},t=o.act?(a.below?'tallb':(a.lab?'tall':'tallc')):'';
 return `<div class="stg${o.lt?' lt':''}"><div class="stgcap"><b>${o.id}</b><span>${o.cap}</span>${o.note?`<i>${o.note}</i>`:''}</div><div class="stgin${t?' '+t:''}">${o.act?'<span class="scrim"></span>':''}${line(card(o),o.h)}</div>${o.dims?`<div class="dims">${o.dims.map(d=>`<span>${d}</span>`).join('')}</div>`:''}</div>`};

const yn=k=>`<button class="hap${k==='g'?'':' h44'}${k==='open'?' open':''}" data-trig>Yönet${chv(k==='below')}</button>`;
const A4=['ara','wa','nox','inf'],A2=['ara','wa'];
const A0={lbl:'Girmesine',hero:'6 <span class="u">dk</span>',heroc:'xl',sub:'11:30 · 45 dk',right:'<button class="hap fill h44">Geldi</button>'+yn(),tight:1,h:118};
const A1={lbl:'Gecikti',tone:'rd',stripe:'hot',hero:'8 <span class="u">dk</span>',heroc:'xl rd',sub:'22 dk sonra düşer',right:'<button class="hap fill h44">Geldi</button>'+yn('open'),tight:1,h:118};
const A1c={...A1,right:'<button class="hap fill h44">Geldi</button>'+yn()};
const nb=x=>({dim:1,sc:x!=null?x:.94});

/* ── 1 · dururken, açılış, basılı, dolgu, ödül, kapanış, reduceMotion ── */
document.getElementById('stAct').innerHTML=[
 {...A1,act:A4,id:'Dururken',cap:'koyu · 4 göz',note:'halka %55',h:118,dims:['hap <b>240 × 56</b> · r 18 · göz <b>60 × 56</b>','halka Ø <b>44</b> · kontur <b>1,5</b> · simge <b>22</b>','halkalar arası <b>16</b> pt — ayraç çizgisi kalktı','ok sağdan <b>51</b> · <code>Yönet</code>’e değer']},
 {...A1,act:['ara','wa','inf'],id:'Dururken',cap:'koyu · 3 göz',note:'180',h:118,dims:['göz 60’ta kaldı, hap daraldı','dört halka ritmi üç halkada da aynı']},
 {...A1,act:['nox','inf'],id:'Dururken',cap:'koyu · 2 göz',note:'120',h:118,dims:['iki halka · ok yine tetikleyicinin merkezinde','baş harf gözü: <b>SD</b> = randevunun personeli']},
 {...A1,act:A4,acto:{st:[{eo:0},{eo:0},{eo:0},{sc:.9,eo:.5}],cls:'k60'},id:'Açılış %25',cap:'koyu · 60 ms',note:'ok tarafından başlar',h:118,dims:['hap 140 ms’de geliyor, gözler <b>32 ms</b> arayla','ilk giren göz <b>oka en yakın</b> olan','kademe okun doğduğu noktadan uzağa akar']},
 {...A1,act:A4,acto:{st:[{sc:.86,eo:.35},{sc:.97,eo:.8},{sc:1.04},{}]},id:'Açılış %55',cap:'koyu · 140 ms',note:'aşım görünür kare',h:118,dims:['her göz <b>0,86 → 1,04 → 1,00</b> · 110 + 40 ms','üçüncü göz tepede (1,04), soldaki henüz yolda','hap ölçeği bitti (140), kademe sürüyor']},
 {...A1,act:A4,id:'Açılış %100',cap:'koyu · 250 ms',note:'alet kuruldu',h:118,dims:['son göz 96 + 150 = <b>246 ms</b>’de oturur','toplam açılış <b>250 ms</b> · perde 120 ms','kart kıpırdamadı, perde yalnız opacity']},
 {...A1,act:A4,acto:{st:[{f:.04},nb(),nb(),nb()],lab:labl('ara')},id:'Parmak indi',cap:'koyu · 0 ms',note:'göz cevap veriyor',h:118,dims:['basılan göz <b>1,00 → 1,12</b> · 140 ms yay','halkası <b>%55 → %100</b> · 90 ms','komşular <b>0,94</b> + <b>%32</b> · 100 ms','kelime bloğu 44, karşı kenar, 90 ms']},
 {...A1,act:A4,acto:{st:[{f:.55},nb(),nb(),nb()],lab:labl('ara')},id:'Dolgunun ortası',cap:'koyu · 275 ms',note:'disk merkezden',h:118,dims:['disk Ø <b>39,5</b> · <code>scale</code> 0 → 1 · 500 ms doğrusal','okunan şey <b>halkaya kalan boşluk</b>','simge çapraz sönmesi 270 → 430 ms']},
 {...A1,act:A4,acto:{st:[{f:1},nb(),nb(),nb()],lab:labl('ara')},id:'Dolgunun sonu',cap:'koyu · 500 ms',note:'halka + disk tek madeni para',h:118,dims:['disk halkanın içine <b>0,75 pt</b> kalana kadar büyür','simge krem · halka %100','ödül bu karede başlıyor']},
 {...A1,act:A4,acto:{st:[{done:1,sc:1.12,hs:1.55,ho:.45},{dim:1,sc:.88,eo:0},{dim:1,sc:.88,eo:0},{dim:1,sc:.88,eo:0}],lab:labl('Arandı','telefon açılıyor')},id:'Seçim anı',cap:'koyu · 500 → 720 ms',note:'ödül',h:118,dims:['disk <b>1 → 1,14 → 1</b> yay · 200 ms','halka dalgası <b>1 → 1,7</b>, %90 → 0 · 220 ms','onay çapraz sönme 120 · komşular 0,88 ve <b>0</b>','duruş <b>220 ms</b>, sonra kapanış 110 · dokunsal <code>medium</code>']},
 {...A1,act:A4,acto:{st:[{done:1,sc:1.12},nb(.88),nb(.88),nb(.88)],cls:'kout',lab:labl('Arandı','telefon açılıyor')},id:'Kapanış',cap:'koyu · 830 ms',note:'yerinde söner',h:118,dims:['hap + ok ucu 110 ms · <code>opacity, scale 1 → 0,96</code>','gözler hapla birlikte gider — <b>ters kademe yok</b>','toplam 500 + 220 + 110 = <b>830 ms</b>']},
 {...A1,act:A4,acto:{st:[{f:.5,cf:1},nb(),nb(),nb()],lab:labl('ara')},id:'reduceMotion',cap:'koyu · kademeli disk',note:'6 × 83 ms',h:118,dims:['<code>scale</code> 0 · ,17 · ,33 · ,5 · ,67 · ,83 · 1 · <code>steps(1)</code>','düşen: kademe, aşım, dalga, ölçek, 4 pt kayma','kalan: disk, onay, 220 ms duruş, dokunsallar','rakam yazılmaz — 500 ms sayılamaz, disk sayar']},
 {...A1,inv:1,lt:1,act:A4,id:'Dururken',cap:'aydınlık · 4 göz',h:118,dims:['ters düzlem <b>#1C1710</b> · halka aynı turuncu','%55 halka koyu yüzeyde de çerçeve olarak okunuyor']},
 {...A1,inv:1,lt:1,act:A4,acto:{st:[{f:1},nb(),nb(),nb()],lab:labl('ara')},id:'Dolgunun sonu',cap:'aydınlık · 500 ms',h:118,dims:['krem simge = hapın yüzeyi','gölge <b>0 12px 32px rgba(0,0,0,.20)</b>']},
 {...A1,inv:1,lt:1,act:A4,acto:{st:[{done:1,sc:1.12,hs:1.55,ho:.45},{dim:1,sc:.88,eo:0},{dim:1,sc:.88,eo:0},{dim:1,sc:.88,eo:0}],lab:labl('Arandı','telefon açılıyor')},id:'Seçim anı',cap:'aydınlık · ödül',h:118,dims:['dalga ters düzlemde de turuncu, opaklık aynı']},
 {...A1,act:['nox','inf'],acto:{st:[{},{f:.34}],lab:labl('inf')},id:'2 göz · basılı',cap:'kelime bloğu hapı geçiyor',note:'168 &gt; 120',h:118,dims:['blok hapa <b>ortalı</b>, göze değil','baş harf gözü basılınca da 1,12 · halka %100']}
].map(stage).join('');

/* ── 2 · simgeler, ızgarasıyla ── */
const IG=[
 {g:'tel',nm:'Ara',no:'Ahize. <b>Korundu</b> — dört silüetin en tanıdığı, 22 pt’de kaybı yok. Kontur 1,7’ye indi, ötekilerle aynı kalem.'},
 {g:'send',nm:'WhatsApp’tan yaz',no:'Balon + <b>giden ok</b>. Jenerik “mesaj” yerine “<b>hazır metin gidiyor</b>” diyor. WhatsApp’ın kendi markası çizilmiyor — başkasının işareti; kanalın adını <b>kelime bloğu</b> söylüyor.'},
 {g:'nox',nm:'Gelmedi',no:'Kişi + çarpı, <b>yumuşatıldı</b>: çarpı 4,8’den <b>3,4</b>’e indi, sağ omuzdan sağ alta geçti, gövde yayı kısaldı. Sert duran şey çarpının ağırlığıydı, fikri değil.'},
 {g:'SD',nm:'Personele bilgi ver',no:'Simge değil <b>veri</b>: randevunun personelinin baş harfleri, 14,5/800. Çan “bildirim” diyordu; <b>SD</b> “Selin’e” diyor. Sektör bağımsız, çünkü çizim değil.'}
];
document.getElementById('stIcon').innerHTML=IG.map(o=>{const t=o.g.length===2;
 return `<div class="ig"><div class="igbox">${t?`<span class="igini">${o.g}</span>`:svg(o.g)}</div><div class="igreal">${cell(t?'inf':(o.g==='tel'?'ara':(o.g==='send'?'wa':'nox')))}</div><div class="ignm">${o.nm}</div><div class="igno">${o.no}</div></div>`}).join('')
 +`<div class="ig"><div class="igbox out">${svg('bell')}</div><div class="igreal out">${cell('inf',{})}</div><div class="ignm">Çan · elendi</div><div class="igno">Silüeti güçlüydü, anlamı zayıf: “bir bildirim” diyor, “Selin’e” demiyor. <b>Kişi + giden ok</b> geçen turda kişi-çarpıyla aynı silüete düştüğü için elenmişti; baş harf o çarpışmayı da bitiriyor. <b>Megafon</b> elendi: duyuru tonu, personel değil.</div></div>`;

/* ── göz sayısı ── */
document.getElementById('stCnt').innerHTML=[
 {...A1,act:A4,id:'4 göz',cap:'geciken · tam veri',note:'240',h:118,dims:['ok en sağdaki gözde · halkaya 4 pt']},
 {...A1,act:['ara','wa','inf'],id:'3 göz',cap:'müşteri opt-out',note:'180',h:118,dims:['<code>WhatsApp</code> hiç çizilmez','hap daraldı, göz 60’ta kaldı']},
 {...A1,act:['nox','inf'],id:'2 göz',cap:'numarası yok · gecikmiş',note:'120',h:118,dims:['iki kanal da yok','ok yine tetikleyicinin merkezinde']},
 {...A1,act:['nox','inf'],acto:{st:[{},{f:.34}],lab:labl('inf')},id:'2 göz · basılı',cap:'kelime bloğu hapı geçiyor',note:'168 &gt; 120',h:118,dims:['blok içerikten geniş → hapa <b>ortalı</b>','birleşme kenarı düz, dış kenar r 18']},
 {...A0,act:A2,id:'2 göz',cap:'zamanında (A · 0)',note:'gecikme yok',h:118,dims:['<code>Gelmedi</code> ve personel gözü çizilmez','tetikleyici 0. dakikada da yerinde']},
 {...A1,inv:1,lt:1,act:['ara','waoff','nox','inf'],id:'4 göz · onarım',cap:'aydınlık · salonun WhatsApp’ı bağlı değil',note:'%40 mürekkep',h:118,dims:['göz kalır: gidilecek gerçek yer var','halka da %40’a düşer — <b>dolgusuz halka</b> = göndermez','tek dokunuş → Ayarlar → WhatsApp']}
].map(stage).join('');

/* ── Yaz’ın beş sonucu ── */
const wr=(rec,rect,right)=>({...A1c,sub:'19 dk sonra düşer',rec,rect,right:right||('<button class="hap fill h44">Geldi</button>'+yn()),h:118});
document.getElementById('stWA').innerHTML=[
 {...wr('Yazılıyor · 5','live','<button class="hap fill h44">Geldi</button><button class="hap h44">Geri al</button>'),id:'pencere',cap:'5 saniye · istek henüz gitmedi',note:'yuva takası',dims:['nokta <b>turuncu</b> — canlı','ikinci yuva 5 sn <code>Geri al</code>, sonra <code>Yönet</code>','kart <b>118</b> · takas aynı 44 pt']},
 {...wr('Yazıldı · 2 dk'),id:'ok',cap:'gitti',note:'10. dakikada bayatlar',dims:['ilk kez gerçek teslimat yazılıyor','sunucu döndürdü, kart uydurmuyor']},
 {...wr('Gönderilemedi · bağlantı yok','warn'),id:'not_connected',cap:'salonun bağlantısı yok',note:'bayatlamaz',dims:['onarım hapın sönük gözünde','nokta kırmızı · yaş yazmaz']},
 {...wr('Mesaj istemiyor · gönderilmedi'),id:'opt_out',cap:'müşteri istemiyor',note:'göz bir daha çizilmez',dims:['yapılacak bir şey yok, <code>Ara</code> kalır','bayatlar (10 dk)']},
 {...wr('Numara geçersiz · düzeltilmeli','warn'),id:'invalid_phone',cap:'numara yazılabilir değil',note:'iki kanal da sönük',dims:['aynı numara arama için de güvenilmez','onarım müşteri kartında','satır bütçesi <b>217 pt</b> — kırpılmayacak kadar kısa']},
 {...wr('Kuyrukta · bağlantı gelince gider'),id:'failed',cap:'bağlantı sorunlu',note:'yaş yazmaz',dims:['gidince “Yazıldı · şimdi” olur','bekleyen iş düşmez']},
 {...wr('Yazıldı · 2 dk'),inv:1,lt:1,id:'ok',cap:'aydınlık',dims:['kayıt noktası %70 opak ikincil mürekkep']},
 {...wr('Gönderilemedi · bağlantı yok','warn'),inv:1,lt:1,id:'not_connected',cap:'aydınlık',dims:['kırmızı <b>#E07272</b> ters düzlemde']}
].map(stage).join('');

/* ── personel gözü ── */
document.getElementById('stInf').innerHTML=[
 {...A1,act:A4,acto:{st:[nb(),nb(),nb(),{f:.72}],lab:labl('inf')},id:'Basılı',cap:'koyu · 360 ms',note:'baş harf krem’e dönüyor',h:118,dims:['disk baş harfin altından büyüyor, harf 270 ms’de krem olur','kelime: “Selin’e bildirim gider”']},
 {...A1c,sub:'19 dk sonra düşer',rec:'Personele söylendi · 2 dk',id:'Kayıt',cap:'koyu · teslimat iddiası yok',note:'10 dk sonra düşer',h:118,dims:['“iletildi” değil — kanal bağlı değil','kanal bağlanınca metin değişir, kalıp değişmez']},
 {...A1,inv:1,lt:1,act:A4,acto:{st:[nb(),nb(),nb(),{done:1,hs:1.55,ho:.45}],lab:labl('Söylendi','Selin’in telefonu titredi')},id:'Seçim anı',cap:'aydınlık · ödül',h:118,dims:['baş harf yerini onaya bırakır','tek dolu turuncu göz, altında geçmiş zaman']}
].map(stage).join('');

/* ── çapa ve yön ── */
document.getElementById('stDir').innerHTML=[
 {...A1,act:A4,id:'Yukarı',cap:'varsayılan yön · koyu',note:'ok Yönet’e değer',h:118,dims:['ok ucu tetikleyicinin <b>üst kenarında</b>','büyüme noktası = okun olduğu nokta','kademe de bu noktadan doğar — sağdan sola']},
 {...A1,act:A4,acto:{st:[{f:.55},nb(),nb(),nb()],lab:labl('ara')},id:'Yukarı · basılı',cap:'kelime bloğu üstte',note:'karşı kenar',h:118,dims:['blok okun karşı kenarında','yüzen katman <b>100</b> · kartı <b>46 pt</b> aşıyor']},
 {...A1,inv:1,lt:1,act:A4,acto:{st:[{f:.55},nb(),nb(),nb()],lab:labl('ara')},id:'Yukarı · basılı',cap:'aydınlık',h:118,dims:['ters düzlem · aynı çapa']},
 {...A1,right:'<button class="hap fill h44">Geldi</button>'+yn('below'),act:A4,acto:{below:1},id:'Aşağı',cap:'listenin ilk kartı · koyu',note:'çevron döndü',h:118,dims:['ok ucu <b>alt kenara</b> geçti','çevron 180° / 140 ms — yön değişti','kademe yön değiştirmez: yine oka en yakın gözden']},
 {...A1,right:'<button class="hap fill h44">Geldi</button>'+yn('below'),act:A4,acto:{below:1,st:[nb(),{f:.44},nb(),nb()],lab:labl('wa')},id:'Aşağı · basılı',cap:'kelime bloğu altta',note:'blok yön değiştirdi',h:118,dims:['blok yine okun karşı kenarında','bir sonraki satırı örter — kabul edilen bedel']},
 {...A1,inv:1,lt:1,right:'<button class="hap fill h44">Geldi</button>'+yn('below'),act:A4,acto:{below:1,st:[nb(),{f:.44},nb(),nb()],lab:labl('wa')},id:'Aşağı · basılı',cap:'aydınlık',h:118,dims:['gölge yön değiştirir: blokta yukarı değil aşağı']}
].map(stage).join('');

/* ── kart A ── */
document.getElementById('stA').innerHTML=[
 {...A0,id:'A · 0',cap:'zamanında',note:'hap 2 gözlü',dims:['kart <b>118</b> · sağ 44 + 2 + 44 = 90','Yönet 0. dakikada da yerinde']},
 {...A1c,id:'A · 1',cap:'gecikti · henüz bir şey yapılmadı',note:'takas yok',dims:['alt satır geri sayım · rozet yok','değişen tek şey: hap 4 gözlü açılacak']},
 {...A1,act:A4,id:'A · 2',cap:'hap açık · dururken',dims:['kart kıpırdamaz · perde yalnız opacity','dört halka, dört eşit ağırlık']},
 {...A1,act:A4,acto:{st:[nb(),nb(),{f:.9},nb()],lab:labl('nox')},id:'A · 3',cap:'Gelmedi basılı · 450 ms',note:'geri alınabilir',dims:['kelime: “geri alınabilir”','tamamlanınca kart <code>noshow</code>’a döner']},
 {...A1c,sub:'19 dk sonra düşer',rec:'Arandı · 2 dk',id:'A · 4',cap:'arandı',note:'dördüncü satır',dims:['sol <b>85</b> · 85 &lt; 90 → kart <b>118</b>','ikinci kanal hâlâ mümkün']},
 {...A1c,sub:'16 dk sonra düşer',rec:'Yazıldı · 1 dk',id:'A · 5',cap:'ikinci kanal da kullanıldı',dims:['satır son hamleyi taşır, defter değil']},
 {...A1c,sub:'12 dk sonra düşer',id:'A · 6',cap:'10. dakika · kayıt bayatladı',note:'satır düştü',dims:['sol 85 → <b>70</b>','kart <b>118</b> — tek piksel oynamadı']},
 {...A1c,inv:1,lt:1,sub:'19 dk sonra düşer',rec:'Arandı · 2 dk',id:'A · 4 aydınlık',cap:'arandı',dims:['panel ters düzlem <b>#1C1710</b>']}
].map(stage).join('');

/* ── kart B ── */
const B1={lbl:'Gelmedi',tone:'rd',stripe:'hot',hero:'12 <span class="u">dk</span>',sub:'18 dk sonra otomatik düşer',right:'<button class="hap">Geç geldi</button><button class="ghost">Yönet'+chv()+'</button>',h:96};
const B2={...B1,lbl:'Randevu düştü',hero:'30 <span class="u">dk</span>',heroc:'spent',sub:'Kayıt müşteri dosyasına yazıldı',right:'<button class="hap" data-trig>Yönet'+chv()+'</button><button class="ghost">Yeniden randevu</button>'};
const B3=['ara','wa','inf'];
document.getElementById('stB').innerHTML=[
 {...B1,id:'B · 1',cap:'12. dakika · müşteri girebilir',note:'Yönet hayalet',dims:['kart <b>96</b>','sağ <b>40 + 6 + 22 = 68</b> · sol 66']},
 {...B2,id:'B · 2',cap:'30. dakika · ağırlık değişti',note:'Yönet hap oldu',dims:['aynı yuva, aynı kelime, artan ağırlık','kart <b>96</b> — değişmedi']},
 {...B2,act:B3,id:'B · 3',cap:'hap açık · 3 göz',note:'Gelmedi yok',dims:['hap <b>180</b> — randevu zaten düştü','ok tetikleyicinin merkezinde']},
 {...B2,act:B3,acto:{st:[nb(),{f:.55},nb()],lab:labl('wa')},id:'B · 4',cap:'WhatsApp basılı · 275 ms',dims:['kelime bloğu 168 &lt; hap 180 → hap kazanır','blok hapın genişliğinde']},
 {...B2,sub:'',rec:'Arandı · 2 dk',id:'B · 5',cap:'arandı',note:'kayıt alt satırın yerini aldı',dims:['pay yok: 66 + 15 = 81 &gt; 68','geçmiş olan düşer, yapılan kalır']},
 {...B2,inv:1,lt:1,act:B3,acto:{st:[nb(),nb(),{f:.8}],lab:labl('inf')},id:'B · 4 aydınlık',cap:'personel gözü basılı',h:96,dims:['koltuk boşaldı — personel başka iş alabilir']}
].map(stage).join('');

/* ── C · D · E ── */
const C1={lbl:'Randevu iptal',tone:'rd',stripe:'hot',hero:'45 <span class="u">dk</span>',sub:'3 bekleyene soruldu · 11:30, Selin',right:'<button class="hap">Saati doldur</button>',h:94};
const D1={lbl:'Onay bekliyor',tone:'am',hero:'4 <span class="u">dk</span>',sub:'Yarın 14:00 · Keratin bakımı · Selin',right:'<button class="hap fill">Onayla</button><button class="ghost">Reddet</button>',h:96};
const E1={lbl:'Sürüyor',tone:'or',hero:'24:18',sub:'Saç boyama · 90 dk · Merve ile',right:'<span class="staffpill"><s>MK</s>Merve</span>',h:94};
const E2={...E1,lbl:'Süre aşımı',tone:'am',stripe:'warn',hero:'70 <span class="u">dk</span>',sub:'45 dk işlem · 25 dk aştı · Selin ile',right:'<span class="staffpill"><s>SD</s>Selin</span>'};
document.getElementById('stCDE').innerHTML=[
 {...C1,id:'C · 1',cap:'bekleyen var',note:'tek eylem → hap yok',dims:['kart <b>94</b> — sol sütun belirliyor']},
 {...D1,id:'D · 1',cap:'pending',note:'iki eylem → hap yok',dims:['kart <b>96</b> · rakam = müşterinin beklediği süre']},
 {...D1,id:'D · 3',cap:'reddedildi · 5 sn pencere',lbl:'Reddedildi',tone:'rd',heroc:'spent',sub:'Yarın 14:00 · mesaj 5 sn sonra gidecek',right:'<button class="hap">Geri al</button><span class="ghost n">5</span>',dims:['<code>Yaz</code>’ın penceresi bu kalıptan geliyor']},
 {...E2,id:'E · 2',cap:'süre aşımı',note:'eylem yok',dims:['amber çizgi <b>4</b> · rakam renk değiştirmez']}
].map(stage).join('');

/* ── telefon ── */
const frow=o=>`<div class="frow${o.k?' '+o.k:''}${o.up?' up':''}"><div class="fhd"><span class="ft">${o.t}</span><s></s><span class="flb">${o.f}</span><span class="kebab"><i></i><i></i><i></i></span></div><div class="fnm">${o.nm}</div><div class="fsv">${o.sv}</div><div class="slot">${card(o.c)}</div></div>`;
const phone=(lt,rows,scrim)=>`<div class="phone${lt?' lt':''}"><div class="status"><span class="n">9:41</span><div class="rt"><span class="bars"><i></i><i></i><i></i><i></i></span><span class="batt"><i></i></span></div></div><div class="pbody"><div class="cal-head"><div class="cal-title"><span class="day">Per<i></i></span><span class="num n">13</span></div><div class="cal-sub">Perşembe · 14 randevu · 3 işlem sürüyor</div></div><div class="feed">${rows}<div class="pad-bot"></div></div></div>${scrim?'<span class="scrim"></span>':''}<div class="syszone">sistem sekme çubuğu · 90</div><div class="home-ind"></div></div>`;
document.getElementById('phones').innerHTML=
 phone(0,[
  frow({t:'11:24',k:'amber',f:'Süre aşımı',nm:'Zeynep <b>Kaya</b>',sv:'Saç boyama · 45 dk · Selin ile',c:E2}),
  frow({t:'11:30',k:'late',f:'Gecikti',nm:'Elif <b>Demir</b>',sv:'Keratin bakımı · 45 dk · Selin ile',up:1,c:{...A1,act:A4,acto:{st:[{f:.55},nb(),nb(),nb()],lab:labl('ara')}}})
 ].join(''),1)
 +`<div class="side" style="width:600px"><h3><s>Koyu tema · Ara basılı, 275 ms</s>Parmağın altındaki göz büyüdü, komşuları çekildi.</h3>
 <div class="note"><span><b>Kart perdenin üstünde:</b> müdür hapı açtığında hâlâ Elif Demir’in kartında olduğunu okuyor. Perdenin işi kartı söndürmek değil, <b>arkasındaki listeyi</b> geri almak.</span></div>
 <div class="note"><span><b>Dört halka ekranda tek alet olarak duruyor:</b> ayraç çizgisi kalktı, halkaların arasındaki 16 pt boşluk ayırıyor. Çizgi + halka birlikte iki ayrı ayırma sistemiydi; biri gereksizdi.</span></div>
 <div class="note"><span><b>Basılan göz 1,12’ye büyüyünce hapın kutusuna değmiyor:</b> 44 × 1,12 = 49,3 &lt; 60. Taşma yalnız ödül dalgasında oluyor (1,7 → 75 pt) ve hapın <code>overflow</code>’u olmadığı için serbest.</span></div>
 <div class="note"><span><b>Listenin altında 90 pt boşluk</b> (<code>.pad-bot</code>): sistem sekme çubuğunun altına hiçbir kart girmiyor.</span></div></div>`
 +`<div class="stages" style="min-width:393px"><div class="stg" style="width:393px"><div class="stgcap"><b>Aydınlık</b><span>düşmüş randevu · hap 3 gözlü, seçim anı</span></div>${phone(1,[
  frow({t:'11:30',k:'late',f:'Randevu düştü',nm:'Elif <b>Demir</b>',sv:'Keratin bakımı · 45 dk · Selin ile',up:1,c:{...B2,inv:1,act:B3,acto:{st:[{dim:1,sc:.88,eo:0},{done:1,hs:1.55,ho:.45},{dim:1,sc:.88,eo:0}],lab:labl('Yazıldı','5 saniye içinde geri alınabilir')}}}),
  frow({t:'11:26',f:'Yeni online randevu',nm:'Ayşe <b>Yılmaz</b>',sv:'Yarın 14:00 · Keratin bakımı',c:{...D1,inv:1}})
 ].join(''),1)}</div><div class="dims" style="width:393px"><span>ödül <b>220 ms</b>: dalga, aşım, onay, geçmiş zaman</span><span>kapanış 110 ms · sonra kartta “Yazılıyor · 5”</span></div></div>`;

/* ── yedi hareket anı ── */
const stack=(h,...ly)=>`<div class="stack" style="height:${h}px">${ly.map((l,i)=>`<div class="ly${i?' abs':''}">${l}</div>`).join('')}</div>`;
const trigA='<button class="hap fill h44">Geldi</button><button class="hap h44" data-trig>Yönet'+chv()+'</button>';
const trigO='<button class="hap fill h44">Geldi</button><button class="hap h44 open">Yönet'+chv()+'</button>';
const box=(cls,inner,h,pad)=>`<div class="stgin ${pad||'tall'}">${cls?`<span class="scrim ${cls}"></span>`:''}<div class="mline"><div class="grow">${inner}</div><div class="brk"><i></i><b>${h}</b></div></div></div>`;
const wrapA=(pillHtml,cardHtml)=>`<div class="balwrap">${pillHtml}${cardHtml}</div>`;
const dly=ms=>`style="animation-delay:${ms}ms"`;
const M=[
 {t:'1 · Açılış · alet kurulur',
  d:'Hap tetikleyicinin köşesinden büyüyor (140 ms) ve gözler <b>birbiri ardına</b> giriyor: <b>32 ms</b> arayla, oka en yakın gözden başlayarak. Her göz <b>0,86 → 1,04 → 1,00</b> ölçekleniyor — yaylı bitiş. Kutu belirmiyor; dördüncü göz oturana kadar alet <b>kuruluyor</b>. Kelime bloğu bu anda yok: henüz parmak inmedi.',
  s:['<b>Giren</b> hap · 140 ms · ease-out · <code>opacity 0→1, scale .92→1</code> · origin <code>calc(100% − 51px) 100%</code>','<b>Giren</b> gözler · 150 ms · <code>scale .86→1.04→1.00</code> + <code>opacity</code> · gecikme <b>0 · 32 · 64 · 96</b> ms','<b>Yön</b> oka en yakın göz ilk — hareket okun doğduğu noktadan uzağa akıyor','<b>Giren</b> perde · 120 ms · <code>opacity 0→.22</code>','<b>Toplam</b> 96 + 150 = <b>246 ms</b> · gözler kademeli, halkalar %55’te duruyor','<span class="cost">A</span> <code>Animated.stagger</code> + <code>Animated.spring</code> · <code>selection</code> dokunsal'],
  h:box('n1s',wrapA(pill(A4,{cls:'n1p',st:[{cls:'',ecls:'n1e',est:dly(96)},{ecls:'n1e',est:dly(64)},{ecls:'n1e',est:dly(32)},{ecls:'n1e',est:dly(0)}]}),stack(118,pnl({...A1,right:trigA,tight:1}),`<div class="ly abs n1t">${pnl({...A1,right:trigO,tight:1})}</div>`)),118,'tallc')},
 {t:'2 · Parmak indi · göz cevap veriyor',
  d:'Dört şey <b>aynı karede</b>: basılan göz <b>1,12</b>’ye büyüyor, halkası koyulaşıyor, komşular <b>0,94</b>’e çekilip %32’ye soluyor, kelime bloğu beliriyor. Disk aynı anda büyümeye başlıyor. Gecikme yok — bunlar geri bildirim, animasyon değil.',
  s:['<b>Büyüyen</b> basılan göz · 140 ms · yay (bounciness 8) · <code>scale 1→1.12</code> · 44 → 49,3 pt','<b>Koyulaşan</b> halka · 90 ms · <code>opacity .55→1</code> — kalınlık değişmiyor, kalınlık animasyonlanamaz','<b>Çekilen</b> komşular · 100 ms · <code>scale 1→.94</code> + <code>opacity 1→.32</code>','<b>Giren</b> kelime bloğu · 90 ms · <code>opacity 0→1, translateY 4→0</code>','<b>Başlayan</b> disk · 0 ms gecikme · <code>scale 0→1</code>, 500 ms','<span class="cost">A</span> hepsi <code>opacity</code> + <code>scale</code>, native sürücü'],
  h:box('',wrapA(pill(A4,{st:[{press:1,ecls:'n2s',rcls:'n2r',fcls:'n2f'},{ecls:'n2n'},{ecls:'n2n'},{ecls:'n2n'}],lab:labl('ara','telefon açılır','n2l')}),pnl({...A1,right:trigO,tight:1})),118)},
 {t:'3 · Dolgu · merkezden disk',
  d:'Disk halkanın <b>içinde</b>, merkezden büyüyor: <code>scale</code> 0 → 1, <b>500 ms</b>, doğrusal. Okunan şey diskin alanı değil, <b>halkaya kalan boşluk</b> — yarıçap doğrusal kapanıyor. Diskin kenarı simgeden geçtiği aralıkta simge kreme dönüyor: iki simge üst üste, çapraz sönme; renk animasyonu değil.',
  s:['<b>Büyüyen</b> disk · 500 ms · linear · <code>scale</code>, origin merkez · Ø 39,5','<b>Çapraz sönme</b> simge · <b>270 → 430</b> ms (160 ms) — diskin kenarının simgeyi geçtiği aralık','<b>Yerinde</b> halka: dolgu onu yemiyor, kap olarak kalıyor · 0,75 pt boşluk','<b>Alttan yükselen dolgu elendi:</b> daire içinde yükselen düzlem “sıvı seviyesi” olur, halkayla ilişki kurmaz','<span class="cost">A</span> tek değer, native sürücü','<span class="cost c">C</span> dolan yay / <code>stroke-dashoffset</code> / konik gradyan'],
  h:box('',wrapA(pill(A4,{st:[{press:1,ecls:'n2s',rcls:'n2r',fcls:'n2f',icls:'n3i',ccls:'n3c'},{ecls:'n2n'},{ecls:'n2n'},{ecls:'n2n'}],lab:labl('ara','telefon açılır','n2l')}),pnl({...A1,right:trigO,tight:1})),118)},
 {t:'4 · Parmak erken kalktı',
  d:'Disk <b>200 ms</b>’de sıfıra çekiliyor, göz 1,12’den 1,00’a dönüyor, komşular geri geliyor. Girişten dört kat hızlı: geri alma cezalandırılmaz. Kartta <b>hiçbir kayıt kalmaz</b>, dokunsal geri bildirim yok — olmayan bir şeyi onaylamıyoruz.',
  s:['<b>Geri çekilen</b> disk · 200 ms · ease-in · <code>scale → 0</code>','<b>Dönen</b> basılan göz · 120 ms · <code>scale 1.12→1</code> · halka <code>opacity 1→.55</code>','<b>Geri gelen</b> komşular · 120 ms · <code>scale .94→1</code>, <code>opacity .32→1</code>','<b>Çıkan</b> kelime bloğu · 120 ms','<b>Yerinde</b> hap açık kalır — parmak kalktı, karar verilmedi','<span class="cost">A</span> <code>onPressOut</code> → <code>Animated.timing(200)</code>'],
  h:box('',wrapA(pill(A4,{st:[{press:1,ecls:'n4s',rcls:'n4r',fcls:'n4f'},{ecls:'n4n'},{ecls:'n4n'},{ecls:'n4n'}],lab:labl('ara','telefon açılır','n4l')}),pnl({...A1,right:trigO,tight:1})),118)},
 {t:'5 · Seçim anı · ödül',
  d:'500 ms dolduğu anda dört şey birlikte: disk <b>1 → 1,14 → 1</b> yaylanıyor, halkadan bir <b>dalga</b> çıkıp sönüyor (1 → 1,7 · %90 → 0), simge onaya geçiyor, komşular <b>sıfıra</b> iniyor ve 0,88’e çekiliyor. Ekranda kalan şey tek bir dolu turuncu göz ve altında geçmiş zaman. Duruş <b>220 ms</b> — 830 ms’lik etkileşimin karşılığı bu karede ödeniyor.',
  s:['<b>Aşım</b> disk · 200 ms · yay · <code>scale 1→1.14→1</code>','<b>Dalga</b> ikinci halka · 220 ms · <code>scale 1→1.7</code> + <code>opacity .9→0</code> — yeni bir <code>View</code>, iki dönüşüm, sözleşme içinde','<b>Çapraz sönme</b> onay · 120 ms · krem','<b>Çıkan</b> komşular · 120 ms · <code>opacity .32→0</code> + <code>scale .94→.88</code>','<b>Çapraz sönme</b> kelime: “Ara · telefon açılır” → “Arandı · telefon açılıyor” · 120 ms','<b>Duruş</b> 220 ms — eski 700’ün yerine: bitişi artık dalga ve aşım işaretliyor, ödülün kalanı kartta kayıt satırı olarak ödeniyor','<span class="cost">A</span> <code>Animated.sequence</code> · <code>medium</code> dokunsal'],
  h:box('n5s',wrapA(pill(A4,{cls:'n5p',st:[{press:1,sc:1.12,rcls:'n5r',fcls:'n5f',hcls:'n5h',icls:'n5i',ccls:'n5c',kcls:'n5k'},{ecls:'n5d'},{ecls:'n5d'},{ecls:'n5d'}],lab:labl('ara','telefon açılır','n5l1')+labl('Arandı','telefon açılıyor','abs n5l2')}),pnl({...A1,right:trigO,tight:1})),118)},
 {t:'6 · Kapanış',
  d:'Açılıştan hızlı: <b>110 ms</b>, aynı büyüme noktasında, <b>yerinde sönüyor</b> — tetikleyiciye geri emilmiyor. Gözler hapla birlikte gidiyor: <b>ters kademe yok</b>, çünkü kademe bir tanıtımdır; çıkışta sırayla sönen gözler ikinci bir olay olarak okunur.',
  s:['<b>Çıkan</b> hap + gözler + ok ucu · 110 ms · ease-in · <code>opacity 1→0, scale 1→.96</code>','<b>Çıkan</b> perde · 100 ms · yalnız <code>opacity</code>','<b>Geri dönen</b> tetikleyicinin yüzeyi · anında (<code>pfill</code> → şeffaf)','<b>Çevron</b> yukarı açılan hapta <b>dönmez</b> — yönü söyler, durumu değil','<span class="cost">A</span> dokunsal sessiz'],
  h:box('',wrapA(pill(A4,{cls:'n6p'}),pnl({...A1,right:trigO,tight:1})),118,'tallc')},
 {t:'7 · Kartta kaydın belirişi',
  d:'İki hareket <b>birbirini takip ediyor, çakışmıyor</b>: hap 110 ms’de kapanıyor, 40 ms boşluk, kayıt satırı 200 ms’de kartın solunda beliriyor. Ödülün ikinci yarısı burada: göz hapın kapandığı yerden kartın soluna iniyor. Kart yüksekliği <b>değişmiyor</b> — yer sol sütunda zaten ayrılmış.',
  s:['<b>Çıkan</b> hap · 110 ms','<b>Boşluk</b> 40 ms — çakışma yok','<b>Giren</b> kayıt satırı · 200 ms · <code>opacity 0→1, translateY 4→0</code>','<b>Yerinde</b> kart yüksekliği (118), sağ sütun, geri sayım satırı','<code>Gelmedi</code> seçilirse kart <code>noshow</code>’a döner — mevcut takas, yeni hareket icat edilmedi','<span class="cost">A</span> tek <code>Animated.sequence</code>'],
  h:box('',wrapA(pill(A4,{cls:'n7p',st:[{done:1},nb(.88),nb(.88),nb(.88)]}),stack(118,pnl({...A1c,sub:'19 dk sonra düşer',tight:1}),`<div style="display:flex;align-items:flex-end;height:100%;padding:0 0 14px 14px"><div class="prec n n7r" style="color:rgba(14,14,14,.52)"><s style="background:rgba(14,14,14,.52)"></s>Arandı · şimdi</div></div>`)),118,'tallc')}
];
document.getElementById('motion').innerHTML=M.map(m=>`<div class="mcase"><div class="stgcap"><b>${m.t.split(' · ')[0]}</b><span>${m.t.split(' · ').slice(1).join(' · ')}</span></div>${m.h}<div class="mdesc">${m.d}</div><div class="mspec">${m.s.map(x=>`<span>${x}</span>`).join('')}</div></div>`).join('');

/* hapı tetikleyiciye çapala — ölçü kutu modelinden gelir, dönüşümlerden etkilenmez */
function anchorPills(tries){let pending=0;document.querySelectorAll('.balwrap').forEach(w=>{
 const b=w.querySelector('.bal'),t=w.querySelector('[data-trig]')||w.querySelector('.hap.open,.ghost');if(!b||!t)return;
 if(!t.offsetWidth||!t.offsetTop||!b.offsetWidth){pending++;return}
 const below=b.classList.contains('below');
 b.style.setProperty('--bt',t.offsetTop+'px');
 b.style.setProperty('--bb',(t.offsetTop+t.offsetHeight)+'px');
 const off=Math.max(25,Math.min(b.offsetWidth-25,t.offsetWidth/2));
 b.querySelector('.arw').style.right=(off-7)+'px';
 b.style.transformOrigin='calc(100% - '+off+'px) '+(below?'0':'100%');
});const n=tries||0;if(pending&&n<60)setTimeout(()=>anchorPills(n+1),50);}
anchorPills();
addEventListener('load',()=>anchorPills());
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>anchorPills());
setTimeout(()=>anchorPills(),300);
addEventListener('resize',()=>anchorPills());
