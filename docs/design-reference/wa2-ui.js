(function(){
const P={
grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
clip:'<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 3h6v3H9zM9 11.5h6M9 15.5h4"/>',
users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>',
box:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M15.5 15h2.5M6 6V4.5h11V6"/>',
archive:'<rect x="3.5" y="4" width="17" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
link:'<path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>',
gear:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.8"/><path d="M12 2.5v2.7M12 18.8v2.7M2.5 12h2.7M18.8 12h2.7M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M5.3 18.7l1.9-1.9M16.8 7.2l1.9-1.9"/>',
search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
chl:'<path d="M15 5l-7 7 7 7"/>',chr:'<path d="M9 5l7 7-7 7"/>',chd:'<path d="M5 9l7 7 7-7"/>',
check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',plus:'<path d="M12 5v14M5 12h14"/>',
lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
alert:'<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
wa:'<path d="M4.5 19.5l1.2-3.8a8 8 0 1 1 2.7 2.6z"/>'
};
function icons(){if(document.getElementById('lu-ico'))return;let s='';for(const k in P)s+=`<symbol id="i-${k}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[k]}</g></symbol>`;const d=document.createElement('div');d.innerHTML=`<svg id="lu-ico" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true"><defs>${s}</defs></svg>`;document.body.prepend(d.firstChild);}
const I=(n,z=18)=>`<svg class="ic" width="${z}" height="${z}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;

const OFFLINE=['no','qr','rd'];
const HI='Merhaba Ayşe Hanım ✨',BN='<b>Test Salon 2</b>';
function until(d){let day=10+(+d||0);const M=[['Kasım',30],['Aralık',31],['Ocak',31],['Şubat',28],['Mart',31]];for(const [m,n] of M){if(day<=n)return `${day} ${m}`;day-=n;}return '';}
const MSGS=[
{ph:'al',id:'onay',t:'Randevu onayı',tm:'Hemen',w:'Randevu oluşur oluşmaz',d:'Panelden, online randevudan ya da WhatsApp’tan alınan her randevuda.',sw:1,at:'09:12',L:()=>[HI,`${BN} olarak randevunuzu oluşturduk.`,'<b>Hizmet:</b> cilt bakımı','<b>Tarih:</b> Yarın, 11 Kasım Çarşamba','<b>Saat:</b> 10:00','<b>Hazırlık:</b> Gelmeden önce makyajsız gelmeniz yeterli','Sizi bekliyoruz. Değişiklik gerekirse bu mesaja yazmanız yeterli.']},
{ph:'once',id:'h24',t:'24 saat önce hatırlatma',tm:'24 sa önce',w:'Randevudan 24 saat önce',d:'Müşteri “Evet” ya da “Hayır” yazarak cevaplar.',at:'10:00',L:()=>[HI,`${BN} olarak randevunuzu hatırlatmak istedik.`,'<b>Hizmet:</b> cilt bakımı','<b>Tarih:</b> Yarın, 11 Kasım Çarşamba','<b>Saat:</b> 10:00','<b>Hazırlık:</b> Gelmeden önce makyajsız gelmeniz yeterli','Gelebilecek misiniz? <b>Evet</b> ya da <b>Hayır</b> yazmanız yeterli.']},
{ph:'once',id:'h2',t:'2 saat önce hatırlatma',tm:'2 sa önce',w:'Randevudan 2 saat önce',d:'',at:'08:00',L:()=>[HI,'Randevunuza 2 saat kaldı.','<b>Hizmet:</b> cilt bakımı','<b>Saat:</b> 10:00','Görüşmek üzere.']},
{ph:'sonra',id:'google',t:'Google değerlendirme',tm:'+30 dk',tmOff:'~3 sa sonra',w:'Randevu bitiminden 30 dk sonra',wOff:'Hesap kapandıktan ~3 saat sonra, randevu başına bir kez',d:'Önce memnuniyet sorulur; puan verene Google linki gider.',sw:1,at:'11:30',L:s=>[HI,'Bugünkü ziyaretiniz için teşekkür ederiz.','Memnun kaldıysanız Google’da kısa bir değerlendirme bırakmanız bizim için çok değerli:',s.google?`https://${s.google}`:'<span class="miss">link yok — bu satır gitmez</span>']},
{ph:'sonra',id:'next',t:'Sıradaki randevu daveti',tm:'+1,5 sa',tmOff:'Bitince',w:'Ödemeden 1,5 saat sonra',wOff:'Randevu tamamlanınca',d:'İleri randevusu olana ve memnun kalmayana gitmez.',sw:1,at:'12:35',L:s=>[HI,'Bir sonraki <b>cilt bakımı</b> randevunuzu şimdiden ayırtmak ister misiniz?','Uygun gününüzü yazmanız ya da bağlantıdan seçmeniz yeterli.','https://timeflow.lueratech.com/book/test-salon-2'].concat(s.tesvik?[`🎁 ${esc(s.tesvik)}`]:[])},
{ph:'sonra',id:'paket',t:'Paket yenileme',tm:'Paket bitince',w:'Paketin bütün seansları bitince',d:'Paket başına bir kez.',sw:1,at:'16:05',L:()=>[HI,'<b>10 Seans Lazer</b> paketinizdeki bütün seansları tamamladınız. Umarız sonuçtan memnunsunuzdur.','Devam etmek isterseniz bu mesaja yazmanız yeterli; size uygun bir plan hazırlayalım.']},
{ph:'zaman',id:'donus',t:'Dönüş hatırlatması · bakım yenileme',tm:'~30 gün',w:'Son ziyaretten ~30 gün sonra',d:'Tarihe 2 gün kala, bir kez.',tag:'Sektörünüze özel',sw:1,at:'11:00',L:()=>[HI,`${BN} olarak yazıyoruz: <b>bakım yenileme</b> zamanınız geldi.`,'Size uygun bir gün için bu mesaja yazmanız yeterli.']},
{ph:'zaman',id:'ozledik',t:'Sizi özledik',tm:'60 gün',w:'60 günden uzun gelmeyene',d:'İleri randevusu olmayana, bir kez.',sw:1,at:'11:30',L:s=>{const p=+s.disc.p||0;return [HI,`${BN} olarak sizi özledik, bir süredir görüşemedik.`,'Yeni bir bakım planlamak isterseniz bu mesaja yazmanız yeterli.'].concat(p>0?[`<b>Size özel %${p} indirim</b> (${until(s.disc.d)} tarihine kadar)`,'Kod: <b>K7RM2P</b>','Randevunuzda bu kodu söylemeniz yeterli.']:[])}}
];
const PH={al:'RANDEVU ALININCA',once:'RANDEVUDAN ÖNCE',sonra:'RANDEVUDAN SONRA',zaman:'SONRAKİ HAFTALARDA'};
const FAIL={num:'Numarası geçersiz olduğu için bir hatırlatma gitmedi.',conn:'Hat o an bağlı olmadığı için bir mesaj gitmedi.',sess:'WhatsApp oturumu düştüğü için bir mesaj gitmedi.',wa:'WhatsApp o an cevap vermediği için bir mesaj gitmedi.',srv:'Sunucumuza o an ulaşılamadığı için bir mesaj gitmedi.',other:'Bir mesaj gitmedi; sebebi belirlenemedi.'};
const AUD=[['mix','Müşterilerim ve ilk kez yazanlar','Daha önce yazıştığınız ama müşteriniz olmayan kişilere (arkadaş, aile, tedarikçi) cevap vermez.',1],['cust','Yalnız kayıtlı müşterilerim','Müşteri listenizde olmayan kimseye cevap vermez; yeni gelenleri siz karşılarsınız.'],['all','Herkes','Hat yalnız işletmenize aitse seçin. Kişisel numaranızsa arkadaşlarınıza da cevap verir.']];
const AUDS={mix:'Müşterilerinize ve ilk kez yazanlara',cust:'Yalnız kayıtlı müşterilerinize',all:'Size yazan herkese'};
const OPTS=[['me','Ben cevaplarım','Otomatik cevap gitmez. Mesajlar kaydedilir, siz telefonunuzdan cevaplarsınız.'],['bot','Randevu botu','Kalıplı sorularla randevu alır: hizmet, gün ve saati sorar, boş saatleri sunar, onaylanınca randevuyu kurar.'],['ai','Akıllı asistan','Doğal dille konuşur: soruları işletme bilgilerinizden cevaplar, saat sunar; randevu kurar, erteler, iptal eder.']];
const KNOW=[['odeme','Ödeme yöntemleri','Kredi kartı ve nakit, tüm bankalara 24 ay taksit'],['iptal','İptal ve gecikme','randevunuzu 12 saat öncesinde iptal edilir, 30dk geç kalınca iptal olur randevu'],['ulasim','Ulaşım ve otopark','ücretsiz otopark ve vale hizmeti vardır'],['notlar','Diğer notlar','randevudan 10 dk önce gelmenizi rica ederiz'],['sss','Sık sorulanlar','']];
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* chrome */
const rail=()=>`<aside class="rail" aria-label="Uygulama menüsü"><div class="rtop"><span class="lmark">l<i></i></span><span class="rexp">${I('chr',14)}</span></div><div class="ricons">${['grid','cal','clip','|','users','box','|','wallet*','archive','user','link'].map(x=>x==='|'?'<span class="rdiv"></span>':`<span class="ri">${I(x.replace('*',''),21)}${x.endsWith('*')?'<i class="rbadge"></i>':''}</span>`).join('')}</div><div class="rbot"><span class="ri on" aria-current="page">${I('gear',21)}</span><span class="av">F</span></div></aside>`;
const NAV=[['İŞLETME',['İşletme profili','Çalışma saatleri','Hizmetler','Kabinler','Modüller']],['MÜŞTERİLERLE İLETİŞİM',['Online randevu','WhatsApp','Sadakat kartı']],['HESAP',['Hesabım','Bildirimler','Abonelik ve faturalar','Verileriniz']]];
const snav=w=>`<nav class="snav" style="width:${w}px" aria-label="Ayarlar menüsü"><div class="snh">Ayarlar</div><div class="sbox">${I('search',18)}<span>Ayarlarda ara</span><kbd>/</kbd></div><a class="si" href="#">Özet${I('chr',16)}</a>${NAV.map(([g,it])=>`<div class="sg"><div class="sgh"><i></i>${g}</div>${it.map(t=>`<a class="si${t==='WhatsApp'?' on':''}" href="#"${t==='WhatsApp'?' aria-current="page"':''}>${t}${I('chr',16)}</a>`).join('')}</div>`).join('')}<div class="sg"><div class="sgh"><i></i>GELİŞMİŞ${I('chr',14)}</div></div></nav>`;
const mtop=()=>`<div class="mtop"><span class="t">Ayarlar</span><span class="s">/</span><button class="msel" aria-haspopup="listbox">WhatsApp${I('chd',16)}</button><span style="flex:1"></span><button class="msel" aria-label="Ayarlarda ara" style="color:var(--tx2);font-size:14.5px">${I('search',18)}Ara<kbd>/</kbd></button></div>`;

/* glance */
function glance(s){
 const c=s.conn,off=OFFLINE.includes(c);
 let a;
 if(c==='ld')a=['','<span class="sk" style="width:120px;height:20px"></span>','<span class="sk" style="width:180px;height:12px;margin-top:4px"></span>'];
 else if(c==='un')a=['un','Okunamadı','Durum şu an alınamıyor'];
 else if(c==='rd')a=['rd','Bağlantı düştü','Mesajlar gitmiyor','rdw'];
 else if(off)a=['am','Bağlı değil','Hatırlatmalar gitmiyor'];
 else if(c==='in')a=['gr','Bağlı','Giden mesajlar çalışıyor'];
 else a=['gr','Bağlı',s.stats[1]>0?`Son 24 saatte ${s.stats[0]} gitti, ${s.stats[1]} gitmedi`:`${s.since} · son 24 saatte ${s.stats[0]} mesaj gitti`];
 let b;
 if(c==='in')b=['am','Gelen mesajlar işlenmiyor','Şu an kimseye otomatik cevap gitmiyor'];
 else if(off)b=['','Kimse','Hat bağlanınca seçiminiz geçerli olur'];
 else if(s.resp==='me')b=['','Siz cevaplarsınız','Otomatik cevap kapalı'];
 else if(s.resp==='bot')b=['','Randevu botu',AUDS[s.aud]];
 else if(s.use>=100)b=['am','Randevu botu','Akıllı asistanın bu ayki hakkı doldu'];
 else if(s.trial&&s.trial.nums.length)b=['','Akıllı asistan · deneme',`Yalnız ${s.trial.nums.length} numarayla; diğerlerine ${s.trial.fb==='bot'?'randevu botu':'kimse'}`];
 else b=['','Akıllı asistan',AUDS[s.aud]];
 const on=MSGS.filter(m=>!(m.sw&&s.off[m.id])).length;
 const g=off?[c==='rd'?'rd':'am','Hiçbiri gitmiyor','WhatsApp bağlı değil']:['',`${on} mesaj açık`,on===MSGS.length?'Onaydan “sizi özledik”e kadar, sırası aşağıda':`${MSGS.length-on} mesaj kapalı`];
 const cell=(q,t,go)=>`<a class="gc" href="#" data-a="go:${go}"><span class="gq">${q}${I('chd',14)}</span><span class="ga${t[3]?' '+t[3]:''}">${t[0]?`<span class="dot ${t[0]}"></span>`:''}${t[1]}</span><span class="gs">${t[2]}</span></a>`;
 return `<nav class="gl" aria-label="Bir bakışta">${cell('HAT ÇALIŞIYOR MU?',a,'s1')}${cell('SİZE YAZANA KİM CEVAP VERİYOR?',b,'s2')}${cell('MÜŞTERİNİZE NE GİDİYOR?',g,'s3')}</nav>`;
}

/* 1 · hat */
const wal=()=>`<span class="wal">${I('wa',24)}</span>`;
const head=(dot,word,sub,extra='',cls='')=>`<div class="ch">${wal()}<div class="cst ${cls}"><span class="dot ${dot}"></span>${word}${sub?`<span>· ${sub}</span>`:''}</div>${extra}</div>`;
function stats(s){
 const z=s.stats.every(v=>v===0);
 return `<span class="eb">Son 24 saat</span>${z?'<p class="zero">Son 24 saatte mesaj yok.</p>':`<div class="stats">${['Gönderildi','Başarısız','Atlandı','Gelen'].map((l,i)=>`<div><b>${s.stats[i]}</b><span>${l}</span></div>`).join('')}</div>`}<p class="note"><b>Atlandı</b> hata değildir, kural gereği gönderilmeyendir: müşteri “DUR” dedi, günlük sınır doldu, numarası yok ya da hat o an bağlı değildi.</p>${s.fail?`<div class="lerr" role="status">${I('alert',18)}<span><b>Son hata · ${s.fail.at}.</b> ${FAIL[s.fail.k]}</span></div>`:''}`;
}
function test(s){
 const r=s.test.res==='ok'?`<div class="res ok" role="status">${I('check',17)}Gönderildi. <span>Telefonu kontrol edin.</span></div>`:s.test.res==='no'?`<div class="res no" role="status">${I('alert',17)}Gönderilemedi. <span>Numara geçersiz.</span></div>`:'';
 return `<label class="lb">Test mesajı gönder</label><div class="trow"><input class="fld" data-in="test" value="${esc(s.test.v)}" placeholder="05xx xxx xx xx" inputmode="tel" aria-label="Test mesajının gideceği numara"><button class="btn" data-a="test"${s.test.v?'':' disabled'}>Gönder</button></div>${r}<p class="note">Hatırlatmalarla aynı hattan gider. Hattın çalıştığını en hızlı böyle görürsünüz.</p>`;
}
function sec1(s){
 const c=s.conn;let b;
 if(c==='ok'||c==='in'){
  const inb=c==='in'?`<div class="lerr" role="status">${I('alert',18)}<div class="lc"><b>Gelen mesajlar işlenmiyor</b><span>Hat bağlı ama gelen mesajlara cevap verilemiyor. Giden hatırlatmalar etkilenmez.</span></div><button class="btn" data-a="qr">Yeniden bağla</button></div>`:'';
  b=`<div class="card">${head('gr','Bağlı',s.since,`<button class="btn ghost" data-a="modal">Bağlantıyı kes…</button>`)}${inb}<div class="cg"><div class="col">${stats(s)}</div><div class="col">${test(s)}</div></div></div>`;
 }else if(c==='no'){
  b=`<div class="card">${head('am','Bağlı değil','Hatırlatmalar gitmiyor')}<div class="intro"><h3>WhatsApp numaranızı bağlayın</h3><p>Bağlayınca randevu onayları ve hatırlatmalar müşterilerinize bu numaradan gider; size yazanlara seçtiğiniz kişi cevap verir. Telefonunuzdaki WhatsApp her zamanki gibi çalışmaya devam eder.</p></div><div class="acts"><button class="btn pri" data-a="qr">WhatsApp’ı bağla</button><span class="note">Telefondan da bağlayabilirsiniz: TimeFlow uygulaması → İşletme → WhatsApp</span></div></div>`;
 }else if(c==='qr'){
  b=`<div class="card">${head('am','Bağlı değil','QR kod okutulmayı bekliyor')}<div class="qrg"><div class="qrbox">QR kod</div><div class="qrs"><h3>Telefonunuzla okutun</h3><ol><li><span>Telefonda WhatsApp’ı açın.</span></li><li><span><b>Bağlı Cihazlar → Cihaz Ekle</b>’ye dokunun.</span></li><li><span>Kameranızı bu koda tutun.</span></li></ol><div class="cd"><span>Kod <b class="mono" data-cd>0:42</b> sonra yenilenir.</span><span class="trk"><i data-cdb style="transform:scaleX(.7)"></i></span></div><p class="note">Bağlanınca bu sayfa kendiliğinden geçer.<br>Telefondan da bağlayabilirsiniz: TimeFlow uygulaması → İşletme → WhatsApp</p><div><button class="btn" data-a="noqr">Vazgeç</button></div></div></div></div>`;
 }else if(c==='rd'){
  b=`<div class="card rdc">${head('rd','Bağlantı düştü','Mesajlar gitmiyor','','rdw')}<p class="lead2">Bu genelde telefon değişince, WhatsApp’tan çıkış yapılınca ya da telefon uzun süre internetsiz kalınca olur.</p><div class="lost"><span class="eb">Bağlanana kadar gitmeyenler</span><ul>${['Randevu onayları','Hatırlatmalar','İptal haberleri','Asistanın cevapları'].map(t=>`<li><i></i>${t}</li>`).join('')}</ul></div><div class="acts"><button class="btn pri" data-a="qr">Yeniden bağla</button><span class="note">QR kodu telefonunuzla yeniden okutmanız gerekir.</span></div></div>`;
 }else if(c==='ld'){
  b=`<div class="card" aria-busy="true"><div class="ch">${wal()}<div class="cst">Kontrol ediliyor<span class="wdots"><i></i><i></i><i></i></span></div></div><div class="cg"><div class="col"><span class="sk" style="width:90px;height:12px"></span><div class="stats sks">${[0,1,2,3].map(()=>'<div><span class="sk" style="width:40px;height:26px"></span><span class="sk" style="width:76px;height:12px"></span></div>').join('')}</div><span class="sk" style="width:85%;height:12px"></span></div><div class="col"><span class="sk" style="width:140px;height:14px"></span><span class="sk" style="width:100%;max-width:320px;height:46px"></span></div></div></div>`;
 }else{
  b=`<div class="card">${head('un','Okunamadı','Durum şu an alınamıyor')}<p class="lead2">Hattın durumu şu an okunamadı. Bu, hattın bağlı olmadığı anlamına gelmez. İnternetinizi kontrol edip tekrar deneyin.</p><div class="acts"><button class="btn">${I('refresh',17)}Tekrar dene</button></div></div>`;
 }
 return `<section class="sec" data-f="s1" aria-label="Hat"><div class="sh"><h2>Hat</h2><p>Müşterilerinize giden her mesaj bu WhatsApp numarasından gider.</p></div>${b}</section>`;
}

/* 2 · gelen mesajlar */
const sv=(s,k)=>s.saved===k?`<span class="saved" role="status">${I('check',15)}Kaydedildi</span>`:'';
function usage(s){
 const u=s.use;let w='';
 if(u>=100)w=`<div class="lerr" role="status">${I('alert',18)}<span><b>Bu ayın kullanım hakkı doldu;</b> ay sonuna kadar randevu botu cevap veriyor.</span></div>`;
 else if(u>=80)w=`<div class="lerr" role="status">${I('alert',18)}<span><b>Bu ayın hakkının %${u}’si kullanıldı.</b> Size bildirim gönderildi. Dolunca ay sonuna kadar randevu botu cevap verir.</span></div>`;
 const v=Math.min(u,100);
 return `<div class="sub"><div class="shr"><h3>Akıllı asistanın bu ayki kullanım hakkı</h3><b class="pct">%${v}</b></div>${w}<div class="bar" role="progressbar" aria-label="Akıllı asistanın bu ayki kullanımı" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(v,1.2)}%"></i><span class="t80"></span></div><div class="barl"><span>%0</span><span>%80 · size bildirim</span><span>%100</span></div><p class="note">Her işletmenin akıllı asistan için aylık sabit bir hakkı vardır. Dolunca ay sonuna kadar randevu botu cevap verir.</p></div>`;
}
function trial(s){
 const t=s.trial,on=!!(t&&t.nums.length),fb=t?t.fb:'bot';
 const h=`<button class="fold" data-a="trial" aria-expanded="${!!s.trialOpen}">${I(s.trialOpen?'chd':'chr',18)}<span class="ft"><b>Deneme modu</b>${on?`<span class="chip inv">Açık · ${t.nums.length} numara</span>`:'<span class="chip">Kapalı</span>'}</span><span class="fd">${on?'Akıllı asistan şu an yalnız bu numaralarla konuşuyor.':'Asistanı herkese açmadan önce birkaç numarayla deneyin.'}</span></button>`;
 if(!s.trialOpen)return `<div class="sub" data-f="trial" style="gap:0">${h}</div>`;
 const nums=on?t.nums:[];
 return `<div class="sub" data-f="trial" style="gap:0">${h}<div class="fb">${nums.length?`<div class="nl">${nums.map((n,i)=>`<div class="nr"><span class="mono">${n}</span><button class="btn ghost sm" data-a="rm:${i}">Çıkar</button></div>`).join('')}</div>`:''}<div class="trow"><input class="fld" data-in="trialnum" value="${esc(s.trialNum||'')}" placeholder="05xx xxx xx xx" inputmode="tel" aria-label="Deneme numarası"><button class="btn" data-a="add">${I('plus',16)}Ekle</button></div><p class="note">En çok 10 numara. Ekleme ve çıkarma anında kaydedilir.</p><div class="q2"><b>Listede olmayanlara kim cevap versin?</b><div class="seg" role="radiogroup" aria-label="Listede olmayanlara kim cevap versin">${[['bot','Randevu botu'],['none','Kimse, siz cevaplarsınız']].map(([k,l])=>`<button role="radio" aria-checked="${fb===k}" data-a="fb:${k}">${l}</button>`).join('')}</div></div><p class="note">Listeyi boşaltınca akıllı asistan herkese açılır.</p></div></div>`;
}
function know(s){
 return `<div class="sub" data-f="know"><h3>Asistanın bildikleri</h3><p class="note">Müşteri sorunca akıllı asistan yalnız bunları kullanır. Yazmadığınız bir konuda tahmin yürütmez, “ekibimize sorup döneyim” der.</p><div class="kl">${KNOW.map(([k,l,v])=>{const e=s.kEmpty[k];const val=k==='sss'?'<span class="kv">1 soru · “ciltbakımına yanımda güneş kremi getirmeli miyim”</span>':e?'<span class="kv e">Yazılmadı — sorulursa “ekibimize sorup döneyim” der</span>':`<span class="kv">${v}</span>`;return `<div class="kr"><b>${l}</b>${val}<button class="btn sm">${e?'Yaz':'Düzenle'}</button></div>`;}).join('')}</div><p class="note">Sık sorulanlara en çok 20 soru-cevap yazılır. “Düzenle” alanı satırın içinde açar; Kaydet çubuğuyla kaydedilir.</p></div>`;
}
function sec2(s){
 const off=OFFLINE.includes(s.conn);
 let h=`<section class="sec" data-f="s2" aria-label="Gelen mesajlar"><div class="sh"><div class="shr"><h2>Gelen mesajlar</h2>${sv(s,'resp')}</div><p>Biri bu numaraya yazınca ne olacağını seçin. Seçim anında kaydedilir.</p></div>`;
 if(s.conn==='in')h+=`<div class="lerr" role="status">${I('alert',18)}<span><b>Gelen mesajlar işlenmiyor.</b> Seçiminiz duruyor ama şu an kimseye otomatik cevap gitmiyor. <a data-a="go:s1">Hattı yeniden bağlayın</a></span></div>`;
 if(off)h+=`<p class="dim1">${I('info',16)}<span>WhatsApp bağlı değilken gelen mesaj alınmaz. Seçiminiz hat bağlanınca geçerli olur.</span></p>`;
 h+=`<div class="opts" role="radiogroup" aria-label="Gelen mesajlara kim cevap versin">${OPTS.map(([k,t,d])=>`<button class="opt" role="radio" aria-checked="${s.resp===k}" data-a="resp:${k}"><span class="ot"><span class="rad"></span>${t}</span><span class="od">${d}</span>${k==='ai'&&s.use>=100&&s.resp==='ai'?'<span class="chip" style="align-self:flex-start">Ay sonuna kadar randevu botu devrede</span>':''}</button>`).join('')}</div>`;
 if(s.resp!=='me'){
  h+=`<div class="sub"><div class="shr"><h3>Kimlere cevap versin?</h3>${sv(s,'aud')}</div><p class="why">${I('info',17)}<span>Bu numara kişisel numaranızsa önemli: ${s.resp==='ai'?'asistan':'bot'} arkadaşınıza, ailenize cevap vermesin.</span></p><div class="alist" role="radiogroup" aria-label="Kimlere cevap versin">${AUD.map(([k,t,d,r])=>`<button class="arow" role="radio" aria-checked="${s.aud===k}" data-a="aud:${k}"><span class="rad"></span><span class="at"><b>${t}${r?'<span class="chip">Önerilen</span>':''}</b><span>${d}</span></span></button>`).join('')}</div><p class="note">Müşteriniz olmayan birine telefonunuzdan elle yazarsanız ${s.resp==='ai'?'asistan':'bot'} o kişiye bundan sonra cevap vermez.</p></div>`;
  if(s.resp==='ai')h+=usage(s)+trial(s)+know(s);
  else h+=`<p class="dim1">${I('info',16)}<span>Kullanım hakkı, deneme modu ve asistanın bildikleri <b style="color:var(--tx)">Akıllı asistan</b> seçilince açılır.</span></p>`;
 }
 h+=`<div class="always">${I('lock',16)}<span><b>Her zaman çalışır:</b> “DUR” yazan müşteri mesaj listesinden çıkar.</span></div>`;
 return h+'</section>';
}

/* 3 · giden mesajlar */
function setLine(m,s){
 const o=s.open[m.id];const tg=`<a data-a="open:${m.id}">${o?'Kapat':'Düzenle'}</a>`;
 if(m.id==='google')return s.google?`<span class="tset">Link: <span class="mono">${esc(s.google)}</span> · ${tg}</span>`:`<span class="tset am"><span class="dot am"></span>Link yok — puan sorulur ama link gitmez. <a data-a="open:google">${o?'Kapat':'Link ekle'}</a></span>`;
 if(m.id==='next')return `<span class="tset">Teşvik satırı: ${s.tesvik?'🎁 '+esc(s.tesvik):'<span style="color:var(--tx2)">yok</span>'} · <a data-a="open:next">${o?'Kapat':s.tesvik?'Düzenle':'Ekle'}</a></span>`;
 if(m.id==='ozledik')return `<span class="tset">İndirim: ${+s.disc.p>0?`%${esc(s.disc.p)} · ${esc(s.disc.d)} gün geçerli`:'<span style="color:var(--tx2)">yok, indirimsiz gider</span>'} · ${tg}</span>`;
 if(m.id==='donus')return `<span class="tset" style="color:var(--tx2)">Adı ve günü <a data-a="dil">Mesaj dili</a>’nden gelir.</span>`;
 return '';
}
function expand(m,s){
 if(!s.open[m.id])return '';
 const d=k=>s.dirty[k]?' dirty':'';
 if(m.id==='google')return `<div class="tx${d('google')}"><label class="lb">Google değerlendirme linki</label><input class="fld mono" style="font-size:14px" data-in="google" value="${esc(s.google)}" placeholder="g.page/r/…/review" aria-label="Google değerlendirme linki"><p class="note">Google işletme profilinizde <b>Yorum iste → bağlantıyı kopyala</b>.</p></div>`;
 if(m.id==='next'){const off=OFFLINE.includes(s.conn);return `<div class="tx${d('tesvik')}"><label class="lb">Teşvik satırı <span>· isteğe bağlı</span></label><div class="fld"><span>🎁</span><input data-in="tesvik" value="${esc(s.tesvik)}" placeholder="ör. Bir sonraki randevunuzda %10 indirim" aria-label="Teşvik satırı"></div><p class="note">Mesajın sonuna “🎁 …” olarak eklenir.</p><div class="checks"><span class="${off?'x':''}">${I(off?'x':'check',15)}WhatsApp bağlı</span><span>${I('check',15)}Randevu adresi tanımlı</span></div></div>`;}
 if(m.id==='ozledik')return `<div class="tx"><label class="lb">İndirim teklifi</label><div class="trow"><div class="fld nf${d('discp')}" style="max-width:120px"><span>%</span><input data-in="discp" value="${esc(s.disc.p)}" inputmode="numeric" aria-label="İndirim oranı" style="text-align:right"></div><div class="fld nf${d('discd')}" style="max-width:170px"><input data-in="discd" value="${esc(s.disc.d)}" inputmode="numeric" aria-label="Kaç gün geçerli"><span>gün geçerli</span></div></div><p class="note">Her müşteriye özel kod üretilir; Kasa’da girilince uygulanır ve kimin döndüğü ölçülür. Oran 0 ise mesaj indirimsiz gider.</p></div>`;
 return '';
}
function pv(m,s,kind){
 const off=OFFLINE.includes(s.conn),isOff=m.sw&&s.off[m.id];
 const w=!s.sched&&m.wOff?m.wOff:m.w;
 const st=off?'WhatsApp bağlı değil — bu mesaj gitmiyor.':isOff?'Kapalı — bu mesaj gitmiyor.':'';
 return `<${kind==='side'?'aside':'div'} class="pv ${kind}" aria-label="Örnek mesaj" data-k="${m.id}"><div class="pvh"><span class="eb">ÖRNEK · AYŞE HANIM’IN TELEFONUNDA</span><b>${m.t}</b><span>${w}</span></div><div class="chat${st?' dim':''}"><div class="bub">${m.L(s).map(l=>`<span>${l}</span>`).join('')}<time>${m.at} ✓✓</time></div></div>${st?`<p class="pvs">${st}</p>`:''}<p class="note">Metin sektörünüzün mesaj kalıbından gelir; Ayşe Hanım örnek müşteridir.</p></${kind==='side'?'aside':'div'}>`;
}
function trow(m,s){
 const isOff=m.sw&&s.off[m.id],sel=s.sel===m.id;
 const tm=!s.sched&&m.tmOff?m.tmOff:m.tm,w=!s.sched&&m.wOff?m.wOff:m.w;
 const ctl=m.sw?`<span class="tctl">${sv(s,'sw:'+m.id)}<span class="swl">${isOff?'Kapalı':'Açık'}</span><button class="sw" role="switch" aria-checked="${!isOff}" aria-label="${m.t}" data-a="sw:${m.id}"><i></i></button></span>`:'<span class="alw">Her randevuda gider</span>';
 return `<div class="tr${sel?' sel':''}${isOff?' off':''}" role="button" tabindex="0" aria-pressed="${sel}" data-a="sel:${m.id}" data-f="m-${m.id}"><span class="tt">${tm}</span><span class="tn"><i></i></span><div class="tb"><h4>${m.t}${m.tag?`<span class="chip">${m.tag}</span>`:''}</h4><p>${w}.${m.d?' '+m.d:''}</p>${setLine(m,s)}${expand(m,s)}</div>${ctl}</div>${sel?pv(m,s,'inl'):''}`;
}
function dil(s){
 const h=`<button class="fold" data-a="dil" aria-expanded="${!!s.dil}">${I(s.dil?'chd':'chr',18)}<span class="ft"><b>Mesaj dili</b><span class="chip">Sektör varsayılanı</span></span><span class="fd">Mesajların tonu, hitabı, emojisi ve dönüş hatırlatmasının adı.</span></button>`;
 if(!s.dil)return `<div data-f="dil">${h}</div>`;
 return `<div data-f="dil">${h}<div class="fb"><div class="f1"><label class="lb">Karakter</label><span class="note">Akıllı asistan bu tonu kullanır.</span><div class="fld ta">Sıcak ve kısa; samimi ama saygılı.</div></div><div class="g2"><div><label class="lb">Muhatap</label><div class="fld">müşterimiz</div></div><div><label class="lb">“…hatırlatmak istedik” ifadesi</label><div class="fld">randevunuzu</div></div></div><div class="g2"><div><label class="lb">Emoji <span>· en çok 4 karakter</span></label><div class="fld" style="max-width:140px">✨</div></div></div><div class="g2"><div><label class="lb">Dönüş kavramı</label><div class="fld">bakım yenileme</div></div><div><label class="lb">Kaç gün sonra</label><div class="fld nf" style="max-width:160px;justify-content:space-between">30<span>gün</span></div></div></div><p class="note">Dönüş alanları yalnız dönüş hatırlatması olan sektörlerde görünür. Bir alanı değiştirince rozet “Kendi mesaj diliniz” olur ve yanında “Sektör varsayılanına dön” çıkar.</p><div class="always">${I('lock',16)}<span><b>Güvenlik kuralı korunur:</b> <span class="mono" style="font-size:12.5px">‹sektörün kod içindeki kural metni, salt okunur›</span></span></div></div></div>`;
}
function adv(s){
 const h=`<button class="fold" data-a="adv" aria-expanded="${!!s.adv}">${I(s.adv?'chd':'chr',18)}<span class="ft"><b>Gelişmiş</b></span><span class="fd">${s.sched?'Her randevu ayrı zamanlanıyor.':'Mesajlar yarım saatte bir toplu kontrol ediliyor.'}</span></button>`;
 if(!s.adv)return `<div data-f="adv">${h}</div>`;
 return `<div data-f="adv">${h}<div class="fb"><div class="srow"><div class="sbd"><b>Her randevuyu ayrı zamanla<span class="chip">Önerilen</span></b><p class="note">Açıkken her mesaj kendi randevusuna göre planlanır; randevu değişince plan da değişir. Kapalıyken mesajlar yarım saatte bir toplu kontrol edilir.</p></div><span class="tctl">${sv(s,'sched')}<span class="swl">${s.sched?'Açık':'Kapalı'}</span><button class="sw" role="switch" aria-checked="${s.sched}" aria-label="Her randevuyu ayrı zamanla" data-a="sched"><i></i></button></span></div><div class="chg"><span class="eb">Kapalıyken zamanı değişen iki mesaj</span><ul><li><b>Google değerlendirme</b> — hesap kapandıktan ~3 saat sonra, randevu başına bir kez.</li><li><b>Sıradaki randevu daveti</b> — randevu tamamlanınca.</li></ul></div><p class="note">Açınca ileri tarihli randevuların mesajları hemen planlanır.</p></div></div>`;
}
function sec3(s){
 const off=OFFLINE.includes(s.conn);
 let rows='',last='';
 MSGS.forEach(m=>{if(m.ph!==last){if(m.ph==='sonra')rows+=`<div class="tap"><span class="tt">11 Kas.<br>10:00</span><span class="tn"><i></i></span><span class="tab"><b>Randevu</b>· Ayşe Hanım · cilt bakımı</span></div>`;rows+=`<div class="tph"><span></span><span class="tn"></span><span>${PH[m.ph]}</span></div>`;last=m.ph;}rows+=trow(m,s);});
 const sel=MSGS.find(m=>m.id===s.sel)||MSGS[0];
 return `<section class="sec" data-f="s3" aria-label="Müşterinize giden mesajlar"><div class="sh"><h2>Müşterinize giden mesajlar</h2><p>Bir randevunun öncesinden sonrasına, sırasıyla. Satıra tıklayınca örneğini görürsünüz.</p></div>${off?`<div class="offb" role="status"><span class="dot ${s.conn==='rd'?'rd':'am'}"></span>WhatsApp bağlı değil — bu mesajların hiçbiri gitmiyor.</div>`:''}<div class="tlw"><div class="tl${off?' dim':''}">${rows}</div>${pv(sel,s,'side')}</div><div class="folds">${dil(s)}${adv(s)}</div></section>`;
}

/* shell */
const NAMES={google:'Google değerlendirme linki',tesvik:'Teşvik satırı',discp:'Sizi özledik · indirim oranı',discd:'Sizi özledik · geçerlilik süresi'};
function sbar(s){
 if(s.saved==='bar')return `<div class="sbar done" role="status">${I('check',20)}<b style="font-size:15.5px;font-weight:800">Kaydedildi</b></div>`;
 const k=Object.keys(s.dirty);if(!k.length)return '';
 return `<div class="sbar" role="region" aria-label="Kaydedilmemiş değişiklik"><span class="dot or"></span><span class="sbt"><b>Kaydedilmemiş değişiklik</b><span>${k.length} alan · ${k.map(x=>NAMES[x]).join(', ')}</span></span><button class="btn" data-a="cancel">Vazgeç</button><button class="btn pri" data-a="save">Kaydet</button></div>`;
}
const modal=()=>`<div class="ov" data-a="close"><div class="dlg" role="dialog" aria-modal="true" aria-label="Bağlantı kesilsin mi?" data-a="noop"><h3>Bağlantı kesilsin mi?</h3><p>Bağlantı kesilince hatırlatmalar ve mesajlar gitmez. Yeniden bağlamak için QR’ı tekrar okutmanız gerekir.</p><div class="dla"><button class="btn rdb" data-a="disc">Bağlantıyı kes</button><button class="btn inv" data-a="close">Vazgeç</button></div></div></div>`;
function shell(s){
 const top=s.nav==='top';
 return `${rail()}${top?'':snav(s.w<=1100?256:300)}<div class="main">${top?mtop():''}<div class="scroll"><div class="wa"><div class="wi"><header class="ph"><h1>WhatsApp</h1><p>Müşterilerinize giden mesajlar ve size yazanlara verilen cevaplar bu numaradan.</p></header>${glance(s)}${sec1(s)}${sec2(s)}${sec3(s)}</div></div></div>${sbar(s)}</div>${s.modal?modal():''}`;
}
window.WA2={icons,I,shell,MSGS,FAIL,OFFLINE};
})();
