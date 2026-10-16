(function(){
const chev='<svg class="chv" viewBox="0 0 14 9"><path d="M1.5 7.5 7 2l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const keb='<span class="keb"><i></i><i></i><i></i></span>';
const S={
H1:{k:'Hiç kullanılmamış',d:'Lazer Epilasyon · 6 seans · 6 kaldı',pkg:{n:'Lazer Epilasyon',tot:6,left:6}},
H2:{k:'Yarıda',d:'Ağda · 8 seans · 3 kaldı',pkg:{n:'Ağda',tot:8,left:3}},
H3:{k:'Son seans',d:'Cilt Bakımı · 4 seans · 1 kaldı',pkg:{n:'Cilt Bakımı',tot:4,left:1}},
H4:{k:'Paket + ödenmedi',d:'Lazer · 6 seans · 4 kaldı · ₺2.600',pkg:{n:'Lazer Epilasyon',tot:6,left:4,due:'2.600'}},
H5:{k:'Uyarı + paket',d:'Hamilelik + H2',note:'Hamilelik · gebelikte uygulanmaz',pkg:{n:'Ağda',tot:8,left:3}},
H6:{k:'Yalnız uyarı',d:'Paket yok',note:'Saç boyasına alerjisi var'},
H7:{k:'Uzun ad',d:'12 seans · 7 kaldı',pkg:{n:'Bölgesel Zayıflama ve Sıkılaştırma',tot:12,left:7}},
H8:{k:'Gecikmiş + H4',d:'12 dk gecikti · ₺2.600',late:true,pkg:{n:'Lazer Epilasyon',tot:6,left:4,due:'2.600'}}
};
const VILDAN={pkg:{n:'Lazer Epilasyon',tot:6,left:6,due:'7.500'}};
const kp=n=>`<span class="kp"><span class="n">${n}</span> seans kaldı</span>`;
const due=d=>`<span class="due"><s></s><span class="n">₺${d}</span>&nbsp;ödenmedi</span>`;
const note=t=>`<div class="nt"><s></s><span>${t}</span></div>`;
const last='<span class="last">Son seans</span>';
const sp=(a,b)=>`<span class="sp"><span class="el">${a}</span><span class="tl">${b}</span></span>`;
function ring(sz,tot,left,sw){const c=sz/2,r=(sz-sw)/2,C=2*Math.PI*r,seg=C/tot,g=tot>1?Math.min(3.2,seg*.3):0;let o='';for(let i=0;i<tot;i++){o+=`<circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="currentColor" stroke-opacity="${i<left?1:.17}" stroke-width="${sw}" stroke-dasharray="${(seg-g).toFixed(2)} ${(C-seg+g).toFixed(2)}" stroke-dashoffset="${(-(i*seg+g/2)).toFixed(2)}" transform="rotate(-90 ${c} ${c})"></circle>`}return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">${o}</svg>`}
const bar=(tot,left,cls='')=>`<span class="bar ${cls}">${Array.from({length:tot},(_,i)=>`<i class="${i>=tot-left?'on':''}"></i>`).join('')}</span>`;

/* ── yollar ── */
const P={
y0:{nm:'Bugün',
 ctx(s){if(!s.pkg&&!s.note)return'';let h='<div class="bx old" data-box>';if(s.note)h+=`<div class="orow"><s>NOT</s><span class="el">${s.note}</span></div>`;if(s.pkg){const p=s.pkg;h+=`<div class="orow"><s>PAKET</s><span class="el">${p.n} · ${p.left} seans kaldı</span></div>`}return h+'</div>'},
 rline:p=>`<span class="el">${p.n} · ${p.tot} Seans · 0/${p.tot}</span>`,
 hsub:p=>`<span class="n">${p.left}</span> seans kaldı · <span class="amt">₺${p.due} ödenmedi</span>`,
 hright:p=>`<b class="hfr n">0/${p.tot}</b>`},
y1:{nm:'Halka',
 ctx(s){if(!s.pkg&&!s.note)return'';let h='<div class="bx" data-box>';if(s.note)h+=note(s.note);if(s.note&&s.pkg)h+='<i class="hr"></i>';if(s.pkg){const p=s.pkg;h+=`<div class="y1"><span class="rg">${ring(40,p.tot,p.left,3.5)}<b class="n">${p.left}</b></span><div class="y1t"><div class="l1">${kp(p.left)}${p.left===1?last:''}</div><div class="l2">${sp(p.n,' · '+p.tot+' seans')}</div>${p.due?`<div class="l3">${due(p.due)}</div>`:''}</div></div>`}return h+'</div>'},
 rline:p=>`<span class="rgi">${ring(18,p.tot,p.left,2.6)}</span>${sp(p.n+' ·',' '+p.left+' seans kaldı')}`,
 hsub:p=>`${kp(p.left)} · ${due(p.due)}`,
 hright:p=>`<span class="rg hr36">${ring(36,p.tot,p.left,3.2)}<b class="n">${p.left}</b></span>`},
y2:{nm:'Seans dizisi',
 ctx(s){if(!s.pkg&&!s.note)return'';let h='<div class="bx b8" data-box>';if(s.note)h+=note(s.note);if(s.note&&s.pkg)h+='<i class="hr"></i>';if(s.pkg){const p=s.pkg;const l3=p.due||p.left===1;h+=`<div class="y2"><div class="y2a">${sp(p.n,' · '+p.tot+' seans')}${kp(p.left)}</div>${bar(p.tot,p.left)}${l3?`<div class="y2c">${p.due?due(p.due):''}${p.left===1?last:''}</div>`:''}</div>`}return h+'</div>'},
 rline:p=>`${sp(p.n+' ·',' '+p.left+' seans kaldı')}${bar(p.tot,p.left,'mini')}`,
 hsub:p=>`${kp(p.left)} · ${due(p.due)}`,
 hright:p=>bar(p.tot,p.left,'h')},
y3:{nm:'Levha',
 ctx(s){if(!s.pkg&&!s.note)return'';let h='<div class="bx b9 g10" data-box>';if(s.note)h+=note(s.note);if(s.pkg){const p=s.pkg;h+=`<div class="y3"><div class="y3a"><span class="lbl">${p.left===1?'Son seans':'Kalan seans'}</span>${p.due?due(p.due):''}</div><div class="y3b"><b class="n">${p.left}</b>${sp(p.n,' · '+p.tot+' seanslık paket')}</div></div>`}return h+'</div>'},
 rline:p=>`${sp(p.n+' ·','')}<b class="big n">${p.left}</b><span class="tl">seans kaldı</span>`,
 hsub:p=>`${kp(p.left)} · ${due(p.due)}`,
 hright:p=>`<span class="hlev"><i>Kalan</i><b class="n">${p.left}</b></span>`},
y4:{nm:'Satır içi rozet',
 chips(s){if(!s.pkg&&!s.note)return'';const p=s.pkg;let h='<div class="y4" data-box>';if(s.note)h+=`<span class="chip"><s></s><span class="el">${s.note}</span></span>`;if(p)h+=`<span class="chip">${kp(p.left)}<span class="cn el">· ${p.left===1?'son · ':''}${p.n}</span></span>`;if(p&&p.due)h+=`<span class="chip"><s></s><span class="n">₺${p.due}</span>&nbsp;ödenmedi</span>`;return h+'</div>'},
 ctx(){return''},
 rline:p=>`${sp(p.n,'')}<span class="chip sm">${kp(p.left)}</span>`,
 hsub:p=>`<span class="chip sm">${kp(p.left)}</span>${due(p.due)}`,
 hright:()=>''},
y5:{nm:'Eylem satırında',
 ctx(s){return s.note?`<div class="y5n" data-box>${note(s.note)}</div>`:''},
 tail(s){if(!s.pkg)return'';const p=s.pkg;return `<div class="y5" data-tail data-left="${p.left}"><div class="l1">${kp(p.left)}</div><div class="l2">${p.due?due(p.due):`<span class="el">${p.left===1?'Son seans · ':''}${p.n}</span>`}</div></div>`},
 rline:p=>`<span class="el">${p.n} · ${p.left} seans kaldı</span>`,
 hsub:p=>`${kp(p.left)} · ${due(p.due)}`,
 hright:()=>''}
};

function card(path,s){const y=P[path],late=s.late;return `<div class="a2${late?' late':''}" data-card><div class="a2hd"><span class="av">VA</span><div class="a2who"><div class="a2nm">Vildan <b>Ay</b></div><div class="a2sv">Kaş Tasarımı · 20 dk · Selin Kaya ile</div></div><div class="a2r"><b class="n">${late?'12 dk':'40 dk'}</b><span class="n">${late?'gecikti':'14:40'}</span></div></div>${y.chips?y.chips(s):''}${y.ctx(s)}<div class="a2act" data-act><span class="geldi">Geldi</span><span class="yonet">Yönet ${chev}</span>${y.tail?y.tail(s):''}</div></div>`}
const rowAd=()=>`<div class="fr"><span class="ft n">12:30</span><div class="fc"><div class="fhd"><span class="kk am"><s></s>Adisyon bekliyor</span>${keb}</div><div class="who1"><span class="avs">SK</span><span class="nm1">Sibel <b>Karaca</b></span></div><div class="sv1">Lazer Epilasyon · 30 dk · Selin Kaya ile</div><div class="pnl"><span class="stripe"></span><div class="pin"><div class="plbl am"><s></s>Kasada bekliyor · 58 dk</div><div class="hero n">₺1.500</div><div class="psub">Selin Kaya verdi · en eskisi 58 dk bekliyor</div></div></div></div></div>`;
const rowA2=(path,s)=>`<div class="fr" data-a2row><span class="ft n">14:40</span><div class="fc"><div class="fhd"><span class="kk${s.late?' rd':''}"><s></s>Sıradaki randevu</span>${keb}</div>${card(path,s)}</div></div>`;
const rowA1=late=>`<div class="fr"><span class="ft n">15:30</span><div class="fc"><div class="fhd"><span class="kk"><s></s>Yaklaşan randevu</span>${keb}</div><div class="who1"><span class="avs">YK</span><span class="nm1">Yasemin <b>Kurt</b></span></div><div class="sv1">Ağda · 45 dk · Derya Toprak ile</div><div class="pnl a1"><div class="pin"><div class="plbl">Girmesine</div><div class="hero n">${late?'38<span class="u">dk</span>':'1<span class="u">sa</span>30<span class="u">dk</span>'}</div><div class="psub n">15:30 · 45 dk</div></div><div class="pact"><span class="hap fill">Geldi</span><span class="hap">Yönet ${chev}</span></div></div></div></div>`;
const feed=(path,s)=>`<div class="feed">${rowAd()}${rowA2(path,s)}${rowA1(s.late)}<div class="endl">Bugünlük bu kadar</div></div>`;
const status=(sm,late)=>`<div class="status"><span class="n">${late?'14:52':'14:00'}</span><span class="rt"><span class="bars"><i></i><i></i><i></i><i></i></span><span class="batt"><i></i></span></span></div>`;
const strip=()=>`<div class="strip"><div class="days">${[13,14,15,16,17,18,19].map(d=>`<span class="n${d===16?' on':''}">${d}</span>`).join('')}</div><div class="ruler"></div></div>`;
const tabs=()=>`<div class="tabbar">${[['Akış','i-cal on'],['Takvim','i-cal2'],['Randevu','i-plus'],['Kasa','i-cash'],['Profil','i-user']].map(([t,c])=>`<span class="tb ${c.includes('on')?'on':''}"><i class="${c}"></i>${t}</span>`).join('')}</div>`;
function phone(path,s,sm){return `<div class="phone ph${sm?' sm':''}" data-phone${sm?' data-shift':''}><div class="fw">${feed(path,s)}</div><div class="top">${status(sm,s.late)}${strip()}</div>${tabs()}<span class="hi"></span></div>`}
const slice=(path,s,w)=>`<div class="slice ph" style="width:${w||393}px" data-slice>${feed(path,s)}</div>`;
function trio(path){const y=P[path],p=VILDAN.pkg;return `<div class="trio ph"><div class="tsec"><div class="tcap"><b>1</b>Akış · müşteri dosyası</div>${card(path,VILDAN)}</div><div class="tsec"><div class="tcap"><b>2</b>Randevu kartı · müşteri kutusu</div><div class="rbox"><div class="rtop"><span class="rav">VA</span><div class="rtx"><div class="r1">${y.rline(p)}</div><div class="r2">İlk ziyaret</div></div><span class="rgo">→</span></div><span class="rph n">0533 ••• 02 12</span></div></div><div class="tsec"><div class="tcap"><b>3</b>Müşteri kartı · Hesap</div><div class="hs"><div class="hl">Hesap</div><div class="hrow"><s class="hdot"></s><div class="hx"><div class="h1">${p.n} · ${p.tot} seans</div><div class="h2">${y.hsub(p)}</div></div>${y.hright(p)}</div><div class="hn">Tahsilat Kasa’dan yapılır</div></div></div></div>`}

const fr=(key,lim,cap,body,w)=>`<div class="frm" data-frame data-key="${key}" data-lim="${lim}" style="width:${w||393}px"><div class="cap">${cap}</div>${body}<div class="dims" data-m></div></div>`;
function build(path){const el=document.getElementById('st-'+path);if(!el)return;let h='';
 if(path==='y0'){h+=fr('y0-H1',72,'<b>Bugün</b><i>H1 · Akış içinde</i>',slice('y0',S.H1));h+=fr('y0-H4',72,'<b>Bugün</b><i>H4 · ödenmedi kutuda yok</i>',slice('y0',S.H4));h+=fr('y0-T',0,'<b>Bugün</b><i>Aynı paket, üç yer</i>',trio('y0'));el.innerHTML=h;return}
 h+=fr(path+'-P',72,'<b>393 × 852</b><i>H1 · Akış</i>',phone(path,S.H1));
 h+=fr(path+'-SM',72,'<b>375 × 667</b><i>H7 · uzun ad</i>',phone(path,S.H7,true),375);
 h+=fr(path+'-T',0,'<b>Tek dil</b><i>Aynı paket, üç yer · ₺7.500 ödenmedi</i>',trio(path));
 el.innerHTML=h;
 let g='';Object.keys(S).forEach(k=>{const s=S[k];g+=fr(path+'-'+k,(s.note&&s.pkg)?96:72,`<b>${k}</b><i>${s.k} · ${s.d}</i>`,slice(path,s))});
 document.getElementById('sg-'+path).innerHTML=g}
['y0','y1','y2','y3','y4','y5'].forEach(build);

const M={};
function layout(){
 document.querySelectorAll('[data-tail]').forEach(t=>{const l1=t.querySelector('.l1');l1.innerHTML=kp(t.dataset.left);t.removeAttribute('data-short');if(l1.scrollWidth>l1.clientWidth+.5){l1.innerHTML=`<span class="kp"><span class="n">${t.dataset.left}</span> kaldı</span>`;t.setAttribute('data-short','')}});
 document.querySelectorAll('[data-slice]').forEach(sl=>{const f=sl.querySelector('.feed'),r=sl.querySelector('[data-a2row]');const top=r.offsetTop-58;sl.style.height=(r.offsetHeight+58+104)+'px';f.style.transform=`translateY(${-top}px)`});
 document.querySelectorAll('[data-shift]').forEach(ph=>{const f=ph.querySelector('.feed'),r=ph.querySelector('[data-a2row]'),top=ph.querySelector('.top').offsetHeight;f.style.transform=`translateY(${-(r.offsetTop-top-34)}px)`});
 const base=(()=>{const c=document.querySelector('[data-key="y0-H1"] [data-card]');const b=c.querySelector('[data-box]');return Math.round(c.getBoundingClientRect().height-b.getBoundingClientRect().height-12)})();
 document.querySelectorAll('[data-frame]').forEach(f=>{const c=f.querySelector('[data-card]');if(!c)return;const out=f.querySelector('[data-m]');const b=c.querySelector('[data-box]');const lim=+f.dataset.lim;const ch=Math.round(c.getBoundingClientRect().height);const bh=b?Math.round(b.getBoundingClientRect().height):0;const d=ch-base;const short=!!c.querySelector('[data-short]');M[f.dataset.key]={bh,ch,d,short};
  let t=`<span>kutu <b class="n">${bh} pt</b>${lim?' / '+lim:''}</span><span>kart <b class="n">${ch} pt</b></span><span>bağlamsız karta göre <b class="n">${d>=0?'+':''}${d}</b></span>`;
  if(f.dataset.key.startsWith('y5')&&c.querySelector('[data-tail]'))t+=`<span>paket eylem satırında${short?' · <b class="warn">“N kaldı”ya kısaldı</b>':''}</span>`;
  if(lim&&bh>lim)t+=`<span class="warn">bütçe aşıldı</span>`;out.innerHTML=t});
 document.querySelectorAll('[data-fill]').forEach(e=>{const [k,f]=e.dataset.fill.split('|');const m=M[k];if(!m)return;e.textContent=f==='d'?((m.d>=0?'+':'')+m.d):m[f]});
}
window.__m36layout=layout;
const th=localStorage.getItem('m36-theme')||'dark';document.documentElement.dataset.theme=th;
document.querySelectorAll('[data-th]').forEach(b=>{b.classList.toggle('on',b.dataset.th===th);b.onclick=()=>{document.documentElement.dataset.theme=b.dataset.th;localStorage.setItem('m36-theme',b.dataset.th);document.querySelectorAll('[data-th]').forEach(x=>x.classList.toggle('on',x===b));layout()}});
(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(()=>requestAnimationFrame(layout));
})();
