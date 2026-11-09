(function(){
const {icons,I,shell,FAIL}=window.WA2;
const BASE={w:1440,h:900,nav:'full',conn:'ok',since:'29 Ekim’den beri',stats:[12,0,53,0],fail:null,test:{v:'',res:null},resp:'ai',aud:'mix',use:2,trial:null,trialOpen:false,trialNum:'',sel:'onay',open:{},off:{},google:'g.page/r/CbT2xK9/review',disc:{p:20,d:30},tesvik:'',dil:false,adv:false,sched:true,modal:false,saved:null,dirty:{},orig:{},kEmpty:{},focus:null,lab:''};
const S=o=>Object.assign(JSON.parse(JSON.stringify(BASE)),o);

const ROWS=[
{id:'W1',t:'Bağlı · her şey yolunda',when:'Hat bağlı, gelen mesajlar işleniyor: sayfanın olağan hâli. Sayılar Test Salon 2’nin verisi (12 · 0 · 53 · 0, kullanım %2).',
 notes:['Sayfa sahibin üç sorusuyla açılır: üstteki şerit üç cevabı tek bakışta verir, her hücre kendi bölümüne indirir.',
 'Bölümler aynı sırayla akar: Hat → Gelen mesajlar → Müşterinize giden mesajlar.',
 'Bağlı hâlde numara değil bağlantı tarihi yazılır; numara sistemde kayıtlı değil (Müdür 37 ile aynı).',
 '“Atlandı” sayıların hemen altında tek cümleyle açıklanır; 53 gibi büyük bir sayı hata sanılmasın.',
 'Test mesajı sayıların yanında, çünkü “çalışıyor mu?” sorusunun en hızlı cevabı o.',
 'Dokuz uzun kart yerine randevunun etrafında bir zaman çizgisi; 24 ve 2 saat hatırlatmaları anahtarsız, yerlerinde “Her randevuda gider” yazar.',
 'Örnek baloncuk tek ve yanda yapışkan; seçilen satıra göre değişir. 1024 ve altında seçilen satırın altına iner, 768’de Ayarlar gezinmesi v1’deki gibi üst çubuğa geçer.'],
 mo:['Örnek değişimi · opacity 0→1 · 160 ms · ease-out','Şerit hücresine tıklama · içerik kaydırma · smooth (hareketi azalt: anında)'],
 fr:[S({lab:'1440 × 900 · ana kare'}),S({h:'auto',lab:'1440 · sayfanın tamamı'}),S({w:1280,h:800,lab:'1280 × 800'}),S({w:1024,h:768,lab:'1024 × 768'}),S({w:1024,h:768,sel:'h24',focus:'m-h2',lab:'1024 × 768 · örnek satırın altında'}),S({w:768,h:1024,nav:'top',lab:'768 × 1024 · gezinme üst çubukta'})]},
{id:'W2',t:'Bağlı değil · ilk tanışma ve QR',when:'Hat hiç bağlanmamışken ya da bağlantı kesildikten sonra. İkinci kare “WhatsApp’ı bağla”ya basıldıktan sonra; kareler tıklanır.',
 notes:['İlk tanışma bağlayınca ne olacağını tek paragrafta söyler; ana eylem tek düğme.',
 'Telefondan bağlama yolu bir satır, düğme değil: masaüstündeki yol QR.',
 'QR 60 sn’de kendiliğinden yenilenir; sayaç hem sayıyla hem çubukla, ayrıca “Yenile” düğmesi gerekmez.',
 'Bağlanınca sayfa kendiliğinden W1’e geçer; “bitti” düğmesi yok.',
 'Mesajlar sönük ve üstünde tek cümle: “WhatsApp bağlı değil — bu mesajların hiçbiri gitmiyor.” Ayarlar yine değiştirilebilir, bağlanınca geçerli olur.'],
 mo:['QR yenilenirken · opacity 1→0→1 · 2 × 120 ms','Sayaç çubuğu · scaleX 1→0 · 60 s · linear (hareketi azalt: yalnız sayı)','Bağlanınca kart · opacity çapraz solma · 200 ms'],
 fr:[S({conn:'no',lab:'1440 × 900 · ilk tanışma'}),S({conn:'qr',lab:'1440 × 900 · QR bekleniyor'}),S({conn:'no',focus:'s3',sel:'h24',lab:'1440 × 900 · mesajlar sönük'})]},
{id:'W3',t:'Bağlantı düştü',when:'Hat daha önce bağlıydı, şimdi değil.',
 notes:['Kırmızı yalnız burada: nokta, kelime ve kart çerçevesi. Ana düğme turuncu, çünkü eylem.',
 'Sebepler suçlamadan sayılır; hangisi olduğunu bilmiyoruz, uydurmuyoruz.',
 '“Bağlanana kadar gitmeyenler” sahibin asıl kaygısını cevaplar: kime ne gitmiyor.',
 'Şerit, Gelen mesajlar ve giden mesajlar aynı gerçeği kendi yerinde tekrar eder; aşağı inen sahip yine görür.'],
 mo:['Hâl değişimi · opacity çapraz solma · 200 ms · ease-out'],
 fr:[S({conn:'rd',lab:'1440 × 900'})]},
{id:'W4',t:'Gelen mesajlar işlenmiyor',when:'Hat bağlı ama sunucu gelen mesajların işlenmediğini bildiriyor (inboundBroken).',
 notes:['Amber, kırmızı değil: giden hatırlatmalar çalışıyor ve cümle bunu ayrıca söyler.',
 'Uyarı iki yerde: hat kartında çözümüyle (Yeniden bağla), Gelen mesajlar bölümünde etkisiyle (kimseye otomatik cevap gitmiyor).',
 'Şeritte hat “Bağlı” kalır, ikinci hücre amber olur: sorun hatta değil, cevaplamada.'],
 mo:[],
 fr:[S({conn:'in',lab:'1440 × 900'}),S({conn:'in',w:1280,h:800,focus:'s2',lab:'1280 × 800 · Gelen mesajlar bölümü'})]},
{id:'W5',t:'Kontrol ediliyor · Okunamadı',when:'Sayfa açılırken durum sorulurken (iskelet). Sunucuya ulaşılamadığında ya da cevap bozuk geldiğinde (Okunamadı).',
 notes:['İskelet hat kartının biçiminde; bu sırada “Bağlı değil” ya da bağlama düğmesi hiç çizilmez.',
 'Gelen ve giden mesaj ayarları kendi kayıtlarından okunur, iskelete girmez.',
 'Okunamadı gri ve kesik çizgili: hat belki bağlı, kırmızı ya da “Bağlı değil” yanlış alarm olur. Tek eylem Tekrar dene.'],
 mo:['İskelet → sonuç · opacity çapraz solma · 200 ms','Bekleme noktaları · opacity .3↔1 · 1,2 s (hareketi azalt: durağan)'],
 fr:[S({conn:'ld',w:1280,h:800,lab:'1280 × 800 · Kontrol ediliyor'}),S({conn:'un',w:1280,h:800,lab:'1280 × 800 · Okunamadı'})]},
{id:'W6',t:'Gelen mesajlara kim cevap versin',when:'Gelen mesajlar bölümü; üç seçenekten biri hep seçili. Seçenekler tıklanır.',
 notes:['İki anahtar tek soruya indi; veri iki bayrak olarak kalır: Ben = assistant kapalı · Randevu botu = assistant açık, agent_v2 kapalı · Akıllı asistan = ikisi açık.',
 'Her seçenek ne yaptığını tek cümleyle söyler; “bot” kelimesi yalnız “Randevu botu” adında kalır.',
 '“Kimlere” sorusunun gerekçesi seçeneklerden önce yazılır: kişisel numarada bot arkadaşa cevap vermesin.',
 'Seçim anında kaydedilir, başlığın yanında 2 sn “Kaydedildi”. Akıllı asistana özgü ayarlar başka seçimde gizlenir; yerinde nerede açılacağını söyleyen tek satır kalır.',
 'Asistanın bildikleri beş uzun alan yerine beş satır: yazılmış olan tek satırda görünür, yazılmamış olan “Yazılmadı” der. Asistanın neyi bilmediği bir bakışta görünür.',
 '“DUR” kuralı seçimden bağımsız, bu yüzden bölümün en altında kilitli satır.'],
 mo:['“Kaydedildi” · opacity 0→1 · 160 ms, 2 sn kalır, 200 ms söner','Seçime bağlı bloklar · opacity 0→1 + translateY -4→0 · 180 ms · cubic-bezier(.2,.8,.2,1)'],
 fr:[S({w:1280,h:900,resp:'me',focus:'s2',lab:'1280 × 900 · Ben cevaplarım'}),S({w:1280,h:900,resp:'bot',focus:'s2',lab:'1280 × 900 · Randevu botu'}),S({w:1280,h:900,resp:'ai',saved:'resp',sticky:1,kEmpty:{ulasim:1},focus:'s2',lab:'1280 × 900 · Akıllı asistan · az önce seçildi'})]},
{id:'W7',t:'Akıllı asistan · kullanım %80 ve %100',when:'Akıllı asistan seçiliyken bu ayın hakkı %80’i geçince; %100 olunca.',
 notes:['Başlık neyin kullanımı olduğunu söyler; tutar gösterilmez, yalnız yüzde.',
 'Çubukta %80 işareti hep durur: bildirimin ne zaman geleceği önceden görünür.',
 '%100’de seçim değişmez, akıllı asistan seçili kalır; şerit gerçeği söyler: “Randevu botu”.',
 'İkisi de amber uyarı; hiçbir şey bozuk değil.'],
 mo:[],
 fr:[S({use:82,focus:'s2',w:1280,h:900,lab:'1280 × 900 · %82'}),S({use:100,focus:'s2',w:1280,h:900,lab:'1280 × 900 · %100 · randevu botuna düştü'}),S({use:100,lab:'1440 × 900 · şeritte aynı gerçek'})]},
{id:'W8',t:'Deneme modu açık · 2 numara',when:'Deneme modu satırı açıldığında; listede numara varken. Kapalıyken tek satırdır.',
 notes:['“Deneme numaraları” yerine “Deneme modu”: ne işe yaradığı adında.',
 'Açıkken rozet ve şerit “yalnız 2 numarayla” der ki sahip açık bıraktığını unutmasın.',
 'Listede olmayanlara kim cevap vereceği aynı yerde sorulur; boşaltınca herkese açıldığı alt satırda yazar.',
 'Numara ekleme ve çıkarma kendi düğmesiyle anında kaydedilir; kayıt çubuğuna girmez.'],
 mo:['Açılan içerik · opacity 0→1 + translateY -4→0 · 180 ms · cubic-bezier(.2,.8,.2,1)'],
 fr:[S({trial:{nums:['0532 418 27 90','0533 271 90 44'],fb:'bot'},trialOpen:true,focus:'trial',lab:'1440 × 900'})]},
{id:'W9',t:'Son 24 saatte başarısız mesaj var',when:'Son 24 saatte en az bir mesaj gitmediyse son hata tek satır yazılır. Test mesajı gönderilemediyse sebebi alanın altında.',
 notes:['Ham kod hiç görünmez; lastFailure.kind aşağıdaki altı cümleden birine çevrilir, saatiyle.',
 'Amber, kırmızı değil: hat çalışıyor, bir mesaj gitmedi.',
 'Saat yazılır (“bugün 10:12”) ki sahip hangi randevu olduğunu takvimden bulabilsin.',
 'Şeritte de görünür: “12 gitti, 1 gitmedi”.'],
 mo:['Test sonucu satırı · opacity 0→1 · 160 ms'],
 fr:[S({stats:[11,1,53,0],fail:{at:'bugün 10:12',k:'num'},test:{v:'0533 000 11 2',res:'no'},lab:'1440 × 900'})],
 extra:()=>`<div class="xtab">${[['Numara geçersiz','num'],['Bağlantı yok','conn'],['Oturum düştü','sess'],['WhatsApp o an cevap vermedi','wa'],['Sunucuya ulaşılamadı','srv'],['Diğer','other']].map(([a,k])=>`<b>${a}</b><span>Son hata · bugün 10:12. ${FAIL[k]}</span>`).join('')}</div>`},
{id:'W10',t:'Bir mesajın örneği açık',when:'Zaman çizgisinde bir satıra tıklanınca ya da Enter’a basılınca. Açılışta ilk satır seçilidir.',
 notes:['Örnek hep açık ama tek: dokuz baloncuk yerine bir tane, satır seçilince değişir.',
 'Örneğin başlığında hangi mesaj olduğu ve ne zaman gittiği yazar; baloncuk metni koddaki kalıptan gelir, çizimdeki metin örnektir.',
 'Yan alan yapışkan: uzun listede aşağı inerken örnek görünür kalır.',
 'Kapalı bir mesaj seçilirse örnek söner ve altında “Kapalı — bu mesaj gitmiyor.” yazar.'],
 mo:['Örnek değişimi · opacity 0→1 · 160 ms · ease-out','Seçili satır zemini · background 120 ms'],
 fr:[S({sel:'google',focus:'s3',lab:'1440 × 900 · Google değerlendirme seçili'}),S({sel:'paket',off:{paket:1},focus:'m-google',lab:'1440 × 900 · kapalı bir mesaj seçili'}),S({w:1024,h:768,sel:'google',focus:'m-h2',lab:'1024 × 768 · örnek satırın altında'})]},
{id:'W11',t:'Sizi özledik düzenleniyor · Google linki boş',when:'Satırdaki “Düzenle” ile alanlar açıldığında. İndirim oranı 20’den 25’e değişti; Google linki boş.',
 notes:['Yazılan alanlar Ayarlar v1’in kuralıyla kaydedilir: değişen alanın solunda turuncu çizgi, altta çubuk neyin değiştiğini adıyla yazar.',
 'Anahtar ve seçimler çubuğu beklemez, anında kaydedilir; çubuk yalnız yazılanları taşır. Gerekçe: Ayarlar’ın her bölümü böyle çalışıyor, WhatsApp ayrı bir kural öğretmesin.',
 'Örnek baloncuk yazdıkça değişir: %25 ve son geçerlilik tarihi hemen görünür.',
 'Google linki boşken satır kapalıyken bile söyler: “Link yok — puan sorulur ama link gitmez.”'],
 mo:['Kayıt çubuğu · translateY 12→0 + opacity 0→1 · 200 ms · cubic-bezier(.2,.8,.2,1)','Değişen alan çizgisi · opacity 0→1 · 160 ms','Kaydedildi sonrası çubuk · 1,2 sn bekler · opacity → 0 · 200 ms'],
 fr:[S({sel:'ozledik',open:{ozledik:1,google:1},google:'',disc:{p:25,d:30},dirty:{discp:1},orig:{discp:20},focus:'m-google',lab:'1440 × 900'})]},
{id:'W12',t:'Mesaj dili açık · Gelişmiş',when:'Sayfanın en altındaki katlı satırlar açıldığında. İkinci karede “Her randevuyu ayrı zamanla” kapalı.',
 notes:['Mesaj dili ve zamanlama ayda bir bile açılmaz; katlı ve en altta.',
 'Emoji tek alan, en çok 4 karakter; dönüş alanları yalnız dönüş hatırlatması olan sektörde.',
 '“Akıllı zamanlama” ne yaptığını söylemiyordu: “Her randevuyu ayrı zamanla”. Kapatınca iki satırın zamanı çizgide yerinde değişir (+30 dk → ~3 sa sonra, +1,5 sa → Bitince).'],
 mo:['Açılan içerik · opacity 0→1 + translateY -4→0 · 180 ms · cubic-bezier(.2,.8,.2,1)'],
 fr:[S({dil:true,focus:'dil',lab:'1440 × 900 · Mesaj dili'}),S({adv:true,sched:false,sel:'google',focus:'m-h2',lab:'1440 × 900 · zamanlama kapalı'})]},
{id:'W13',t:'Bağlantıyı kes · onay',when:'Hat kartındaki “Bağlantıyı kes…”e basılınca.',
 notes:['Metin brief’teki ve telefondaki gibi. Vazgeç dolu; Bağlantıyı kes kırmızı çerçeveli, kırmızının ikinci ve son yeri.',
 'Kesilince sayfa W2’ye döner. Esc ve dışarı tıklama Vazgeç sayılır.'],
 mo:['Pencere · opacity 0→1 + scale .98→1 · 180 ms · cubic-bezier(.2,.8,.2,1) · örtü opacity 160 ms'],
 fr:[S({modal:true,lab:'1440 × 900'})]}
];

function header(){
 return `<header class="dh"><div class="dtop"><div class="logo">luera<span>timeflow</span></div><div class="dmeta">Masaüstü · Ayarlar → WhatsApp v2 · 2026-11-10<br>timeflow.lueratech.com/settings/whatsapp</div></div>
<h1>WhatsApp: üç soru, üç cevap.</h1>
<p class="dlead">Sayfa sahibin üç sorusuyla açılır ve aynı sırayla ilerler: hat çalışıyor mu, size yazana kim cevap veriyor, müşterinize ne zaman ne gidiyor. Ayarların hiçbiri kaybolmadı; yeri, adı ve sırası değişti. Sol menü ve Ayarlar gezinmesi bugünkü hâliyle. Sağ üstteki düğme bütün kareleri açık ↔ koyu çevirir. Karelerin içi tıklanır: seçenekler, mesaj satırları, anahtarlar, katlı satırlar ve alanlar çalışır.</p>
<div class="dcols">
<div class="dcol"><span class="k">SAYFANIN SIRASI</span><ul><li><span><b>Bir bakışta</b> <span class="m">— üç sorunun cevabı tek şeritte; her hücre bölümüne iner.</span></span></li><li><span><b>Hat</b> <span class="m">— durum, son 24 saat, son hata, test mesajı.</span></span></li><li><span><b>Gelen mesajlar</b> <span class="m">— kim cevap versin, kimlere, kullanım hakkı, deneme modu, asistanın bildikleri.</span></span></li><li><span><b>Müşterinize giden mesajlar</b> <span class="m">— randevunun öncesinden sonrasına zaman çizgisi, yanda tek örnek; altta katlı Mesaj dili ve Gelişmiş.</span></span></li></ul></div>
<div class="dcol"><span class="k">KAYDETME — AYARLAR v1’İN KURALI</span><ul><li><span><b>Seçim ve anahtar → anında.</b> <span class="m">Yanında 2 sn “Kaydedildi”.</span></span></li><li><span><b>Yazılan alan → kayıt çubuğu.</b> <span class="m">Link, indirim, teşvik satırı, asistanın bildikleri, mesaj dili. Değişen alanın solunda turuncu çizgi.</span></span></li><li><span><b>Kendi akışı olan iş → kendi düğmesi.</b> <span class="m">Bağlama, test, deneme numarası ekle/çıkar.</span></span></li></ul><p class="m">Yazılan alanlar yalnız “Düzenle” ile açılır; kapalı bir satırda kaydedilmemiş bir şey durmaz, iki davranış böyle ayrışır.</p></div>
<div class="dcol"><span class="k">ESKİ → YENİ KELİME</span><ul><li><span><span class="m">Bot cevap versin + Akıllı asistan →</span> Gelen mesajlara kim cevap versin?</span></li><li><span><span class="m">Deneme numaraları · Deneme açık · 2 →</span> Deneme modu · Açık · 2 numara</span></li><li><span><span class="m">Bu ayki kullanım →</span> Akıllı asistanın bu ayki kullanım hakkı</span></li><li><span><span class="m">Akıllı zamanlama →</span> Her randevuyu ayrı zamanla</span></li><li><span><span class="m">Anahtarı yok: her zaman gider →</span> Her randevuda gider</span></li><li><span><span class="m">Son hata · not_connected →</span> Hat o an bağlı olmadığı için bir mesaj gitmedi.</span></li></ul></div>
<div class="dcol"><span class="k">VERİ</span><p><b>Yeni veri yok.</b> <span class="m">Çizilen her şey hazır veriden: bağlantı tarihi, link, inboundBroken, lastFailure {kind, at}, last24h, kullanım %, answer_mode, test_numbers, features (assistant, agent_v2, scheduler_v2, mesaj anahtarları).</span></p><p class="m">Örnek müşteri Ayşe Hanım, sektörün ilk hizmeti cilt bakımı; baloncuk metinleri bugünkü sayfadaki kalıplardan.</p></div>
</div>
<nav class="chips" aria-label="Kareler">${ROWS.map(r=>`<a href="#${r.id}">${r.id}</a>`).join('')}</nav></header>`;
}

const frames=[];
function render(){
 const doc=document.getElementById('doc');
 doc.innerHTML=header()+ROWS.map((r,ri)=>`<section class="row" id="${r.id}" data-screen-label="${r.id} ${r.t}"><div class="rh"><span class="code">${r.id}</span><h2>${r.t}</h2></div><div class="frs">${r.fr.map((s,fi)=>`<div class="fw"><span class="flab">${r.id} · ${s.lab}</span><div class="fr${s.h==='auto'?' auto':''}" data-fr="${ri}-${fi}" style="width:${s.w}px;height:${s.h==='auto'?'auto':s.h+'px'}"></div></div>`).join('')}</div><div class="rmeta"><p class="when">Ne zaman görünür: <span>${r.when}</span></p><ul class="notes">${r.notes.map(n=>`<li>${n}</li>`).join('')}${r.mo.map(m=>`<li class="mo">${m}</li>`).join('')}</ul>${r.extra?r.extra():''}</div></section>`).join('');
 ROWS.forEach((r,ri)=>r.fr.forEach((s,fi)=>mount(doc.querySelector(`[data-fr="${ri}-${fi}"]`),s)));
}

function draw(el,s,refocus){
 const sc=el.querySelector('.scroll');const top=sc?sc.scrollTop:0;
 el.innerHTML=shell(s);
 const n=el.querySelector('.scroll');if(n){n.style.scrollBehavior='auto';n.scrollTop=top;n.style.scrollBehavior='';}
 if(refocus){const f=el.querySelector(`[data-in="${refocus.k}"]`);if(f){f.focus();try{f.setSelectionRange(refocus.p,refocus.p);}catch(e){}}}
}
function flash(el,s,k){s.saved=k;draw(el,s);clearTimeout(s._t);s._t=setTimeout(()=>{s.saved=null;draw(el,s);},k==='bar'?1200:2000);}
function scrollTo(el,key,smooth){
 const sc=el.querySelector('.scroll'),t=el.querySelector(`[data-f="${key}"]`);if(!sc||!t)return;
 if(el.classList.contains('auto')){window.scrollTo({top:t.getBoundingClientRect().top+window.scrollY-24,behavior:smooth?'smooth':'auto'});return;}
 const y=t.getBoundingClientRect().top-sc.getBoundingClientRect().top+sc.scrollTop-24;
 if(!smooth){sc.style.scrollBehavior='auto';sc.scrollTop=y;sc.style.scrollBehavior='';}else sc.scrollTop=y;
}
const VAL={google:[s=>s.google,(s,v)=>s.google=v],tesvik:[s=>s.tesvik,(s,v)=>s.tesvik=v],discp:[s=>s.disc.p,(s,v)=>s.disc.p=v],discd:[s=>s.disc.d,(s,v)=>s.disc.d=v]};

function mount(el,s){
 frames.push({el,s});
 draw(el,s);
 el.addEventListener('click',e=>{
  const t=e.target.closest('[data-a]');if(!t||!el.contains(t))return;
  const [a,v]=t.dataset.a.split(':');
  if(t.tagName==='A')e.preventDefault();
  if(a==='noop'){e.stopPropagation();return;}
  if(a==='go'){scrollTo(el,v,true);return;}
  if(a==='sel'){if(e.target.closest('input,.tx'))return;s.sel=v;}
  else if(a==='sw'){s.off[v]=!s.off[v];s.sel=v;return flash(el,s,'sw:'+v);}
  else if(a==='open'){s.open[v]=!s.open[v];s.sel=v;}
  else if(a==='resp'){s.resp=v;return flash(el,s,'resp');}
  else if(a==='aud'){s.aud=v;return flash(el,s,'aud');}
  else if(a==='trial')s.trialOpen=!s.trialOpen;
  else if(a==='fb'){if(!s.trial)s.trial={nums:[],fb:v};else s.trial.fb=v;}
  else if(a==='add'){const n=(s.trialNum||'').trim();if(!n)return;if(!s.trial)s.trial={nums:[],fb:'bot'};if(s.trial.nums.length<10)s.trial.nums.push(n);s.trialNum='';}
  else if(a==='rm'){s.trial.nums.splice(+v,1);}
  else if(a==='dil')s.dil=!s.dil;
  else if(a==='adv')s.adv=!s.adv;
  else if(a==='sched'){s.sched=!s.sched;return flash(el,s,'sched');}
  else if(a==='modal')s.modal=true;
  else if(a==='close')s.modal=false;
  else if(a==='disc'){s.modal=false;s.conn='no';}
  else if(a==='qr')s.conn='qr';
  else if(a==='noqr')s.conn='no';
  else if(a==='test'){const d=s.test.v.replace(/\D/g,'');s.test.res=/^05\d{9}$/.test(d)?'ok':'no';}
  else if(a==='cancel'){for(const k in s.orig)VAL[k][1](s,s.orig[k]);s.dirty={};s.orig={};}
  else if(a==='save'){s.dirty={};s.orig={};return flash(el,s,'bar');}
  draw(el,s);
 });
 el.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&s.modal){s.modal=false;draw(el,s);return;}
  const t=e.target;if((e.key==='Enter'||e.key===' ')&&t.getAttribute&&t.getAttribute('role')==='button'&&t.tagName==='DIV'){e.preventDefault();t.click();}
 });
 el.addEventListener('input',e=>{
  const t=e.target,k=t.dataset&&t.dataset.in;if(!k)return;
  const p=t.selectionStart;
  if(k==='test'){s.test.v=t.value;s.test.res=null;}
  else if(k==='trialnum'){s.trialNum=t.value;return;}
  else if(VAL[k]){if(!(k in s.orig))s.orig[k]=VAL[k][0](s);VAL[k][1](s,t.value);if(String(s.orig[k])===t.value){delete s.dirty[k];delete s.orig[k];}else s.dirty[k]=1;}
  draw(el,s,{k,p});
 });
}

function cd(){const t=60-Math.floor(Date.now()/1000)%60;document.querySelectorAll('[data-cd]').forEach(e=>e.textContent=`0:${String(t).padStart(2,'0')}`);document.querySelectorAll('[data-cdb]').forEach(e=>e.style.transform=`scaleX(${t/60})`);}

function theme(set){const th=set||(()=>{try{return localStorage.getItem('luera-wa2-tema')||'light';}catch(e){return 'light';}})();document.documentElement.setAttribute('data-theme',th);document.getElementById('themeLbl').textContent=th==='dark'?'Koyu':'Açık';try{localStorage.setItem('luera-wa2-tema',th);}catch(e){}}

icons();theme();render();cd();setInterval(cd,1000);
document.getElementById('themeBtn').addEventListener('click',()=>theme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));
const focusAll=()=>frames.forEach(({el,s})=>{if(s.focus)scrollTo(el,s.focus,false);});
(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(()=>requestAnimationFrame(focusAll));
})();
