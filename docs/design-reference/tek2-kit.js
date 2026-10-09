/* Luera Mobil · Tek kişilik v2 — çerçeve ve ortak parçalar (kit: Müdür Modu, Kumanda, Müdür 24, Müdür 22) */
const I=(n,c="")=>`<svg class="ic${c?" "+c:""}" viewBox="0 0 24 24"><use href="#i-${n}"/></svg>`;
const sbar=(t,o={})=>`<div class="status"><span class="n">${t}</span><span class="rt"><span class="bars${o.off?" no":""}"><i></i><i></i><i></i><i></i></span>${I(o.off?"wifioff":"wifi","wf")}<span class="batt"><i></i></span></span></div>`;
const TABS=[["sun","Gün"],["cal","Takvim"],["plus","Randevu"],["cash","Kasa"],["user","İşletme"]];
const tabbar=sel=>`<nav class="tabbar">${TABS.map(([ic,l],i)=>`<button class="tab${i===sel?" sel":""}">${I(ic)}<span>${l}</span></button>`).join("")}</nav>`;
const phone=(inner,o={})=>`<div class="phone${o.hd?" hd":""}" data-screen-label="${o.id||""}">${o.glow?'<div class="glow"></div>':""}${o.warm?'<div class="warm"></div>':""}${sbar(o.t||"15:16",o)}<div class="body">${inner}</div>${o.tab!=null?tabbar(o.tab):""}</div>`;
const spec=o=>`<div class="spec"><div class="spec-label"><b>${o.id} — ${o.title}</b><span class="from"><i>Nereden</i><span>${o.from}</span></span></div>${o.phone}${(o.notes||[]).map(n=>`<div class="note${n.startsWith("?")?" ask":""}"><span>${n.replace(/^\?/,"")}</span></div>`).join("")}</div>`;
const put=(id,html)=>{const el=document.getElementById(id);if(el)el.innerHTML=html};

/* Gün · Müdür 24 parçaları */
const ring=(cls,bdg)=>`<span class="ring ${cls}">DT${bdg?`<span class="bdg n">${bdg}</span>`:""}</span>`;
const heroH=(cls,bdg,st)=>`<div class="hero-h">${ring(cls,bdg)}<span class="hcol"><span class="hnm">Derya <b>Toprak</b></span>${st===null?"":st||""}<span class="hrole">Güzellik uzmanı</span></span></div>`;
const stamp=(cls,tx)=>`<span class="stamp ${cls}"><s></s>${tx}</span>`;
const ST={run:stamp("run","İŞLEMDE"),free:stamp("free","MÜSAİT"),off:stamp("","BUGÜN KAPALI")};
/* eylem kartı: Müdür 24 hâl kartı yerleşimi + Akış eylem kartının hap yuvası */
const card=o=>`<button class="pnl${o.bar?" bar":""}" aria-label="${o.aria||o.lbl}"><span class="plbl${o.am?" am":""}">${o.dot?`<s class="${o.am?"am":""}"></s>`:""}${o.lbl}</span><span class="hero n">${o.hero}</span>${o.pill?`<span class="ppill ${o.pill[1]}">${o.pill[0]}</span>`:""}<span class="psub">${o.sub}</span></button>`;
const U=s=>`<span class="u">${s}</span>`;
const lhd=t=>`<div class="lhd">${t}<i></i></div>`;
const row=o=>`<div class="row2${o.fade?" fade":""}"><span class="tm n">${o.tm}</span><span class="rc"><span class="rnm">${o.a} <b>${o.s}</b></span><span class="rsv">${o.sv}</span></span><span class="rt2">${o.mini?`<span class="mini ${o.mini[1]||""}"><s></s>${o.mini[0]}</span>`:""}<span class="keb"><i></i><i></i><i></i></span></span></div>`;
const nowl=t=>`<div class="nowl"><span>ŞİMDİ <span class="n">${t}</span></span><i></i></div>`;
const PAID=["tahsil edildi"],OPEN=["adisyon açık","am"];
const R={
 sib:o=>row({tm:"10:30",a:"Sibel",s:"Karaca",sv:"Lazer Epilasyon · 30 dk",...o}),
 pin:o=>row({tm:"12:00",a:"Pınar",s:"Aksoy",sv:"Cilt Bakımı · 60 dk",...o}),
 tug:o=>row({tm:"14:00",a:"Tuğçe",s:"Erden",sv:"Kalıcı Makyaj · 120 dk",...o}),
 yas:o=>row({tm:"16:30",a:"Yasemin",s:"Kurt",sv:"Ağda · 45 dk",...o}),
 vil:o=>row({tm:"17:30",a:"Vildan",s:"Ay",sv:"Kaş Tasarımı · 20 dk",...o})
};

/* kumanda parçaları · personel-02/03/04 */
const kbk=`<div class="kbk">${I("back")}Gün</div>`;
const idp=(stc,stt,t2)=>`<div class="idp"><div class="who"><span class="st ${stc}"><s></s>${stt}</span><span class="nm">Tuğçe Erden</span><span class="sv">Kalıcı Makyaj</span><span class="t2 n">${t2}</span></div><div class="tools"><span class="tb">${I("phone")}</span><span class="tb">${I("note")}</span><span class="tb">${I("user")}</span></div></div>`;
const kdiv=`<div class="kdiv"></div>`;
const astrip=`<div class="astrip"><span class="t"><b>ADİSYON · BOŞ</b><span>ilk kalem eklenmedi</span></span><span class="add">${I("plus")}</span></div>`;
const fin=`<div class="fin"><span class="core"><b>BİTİR</b><u>BASILI TUT</u></span></div>`;
const seg=(opts,on)=>`<div class="seg">${opts.map((m,i)=>`<button class="${i===on?"on":""}">${m}</button>`).join("")}</div>`;

/* Profil / Kasa satır grubu */
const gr=o=>`<button class="gr${o.sm?" sm":""}${o.dg?" dg":""}"><span class="t"><b>${o.b}</b>${o.s?`<span>${o.s}</span>`:""}</span>${o.v?`<span class="vv">${o.v}</span>`:""}${I("chev","cv")}</button>`;
const grp=rows=>`<div class="grp">${rows.map(gr).join("")}</div>`;

/* hafta şeridi · Takvim */
const week=(days,sel)=>`<div class="wk">${days.map(([n,l,dt],i)=>`<span class="wd${i===sel?" sel":""}${dt==="off"?" off":""}"><span class="dn n">${n}</span><span class="dl">${l}</span><span class="dt ${dt==="lg"?"lg":(dt&&dt!=="off")?"":"no"}"></span><span class="tk"></span></span>`).join("")}</div>`;

/* boş hâl · VoidBlock (Müdür 22) */
const vrail=now=>`<div class="vrail">${["09","12","15","18"].map(h=>`<div class="rr${h===now?" now":""}"><b class="n">${h}</b><i></i></div>`).join("")}</div>`;
const voidB=o=>`<div class="void"><div class="vlbl">${o.dot?`<s class="${o.dot}"></s>`:""}${o.lbl}</div><div class="vttl">${o.ttl}</div><div class="vsub">${o.sub}</div>${o.rail?vrail(o.rail):""}${o.btn||""}</div>`;
