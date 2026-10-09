/* Luera Mobil · Tek kişilik — canlı katman modeli (HTML taklidi; native: reanimated + PanResponder) */
(function(){
const host=document.getElementById("live"),col=document.getElementById("livecol");
const S={st:"bosta",el:0,wl:-1,wt:1,off:false,m:0,err:0,clock:10*3600+48*60,sheet:false,busy:false};
const two=n=>String(n).padStart(2,"0");
const fmt=s=>s<0?"—":`${two(Math.floor(s/60))}:${two(s%60)}`;
const clk=()=>`${two(Math.floor(S.clock/3600)%24)}:${two(Math.floor(S.clock/60)%60)}`;
const NAMES={bosta:"Boşta",islem:"İşlemde",arka:"Arka planda",bekleme:"Beklemede",sifir:"Bekleme bitti",odeme:"Tahsilat",tamam:"Tahsil edildi"};

host.innerHTML=`<div class="spec-label"><b>Canlı — tek telefon, dört hâl</b><span>Ekrandaki her kontrol çalışıyor. Sürükleme farenin basılı tutulmasıyla da yapılabiliyor.</span></div>
<div class="phone live" id="lv" data-screen-label="Canlı"><div class="glow"></div>${sbar(clk())}<div class="body">
<div id="lvB" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
<div class="yuva" id="lvY"></div>${tabbar(0)}
<div class="layer down" id="lvL"><div class="warm" id="lvWarm"></div><div class="pg" id="lvK"></div></div>
<div class="wscrim" id="lvWS"></div>
<div class="wsheet" id="lvW"><div class="grab"><i></i></div><div class="sh"><h3>Bekleme kur</h3><s>Boya · Zeynep Kaya</s></div><div class="wgrid">${[15,25,35,45].map(m=>`<button data-w="${m}"><b class="n">${m}</b><span>dakika</span></button>`).join("")}</div></div>
</div><div class="home-ind"></div></div>`;
col.innerHTML=`<div class="stt" id="lvS">Hâl: <b>Boşta</b></div>
<div class="ctl"><button class="play" data-c="w5">Beklemeyi son 5 dk'ya sar</button><button class="play" data-c="w0">Beklemeyi sıfıra sar</button><button class="play" data-c="off">Bağlantıyı kes</button><button class="play" data-c="rs">Baştan</button></div>
<div class="rn" style="margin:6px 0 0"><div class="r h"><b>Hâl</b><em>Sunucuda</em><span>Üstte · alt yuvada</span></div>
<div class="r" data-h="bosta"><b>Boşta</b><em class="k0">işlem yok</em><span>Gün · sıradakine ≤ 15 dk kala başlatma çubuğu</span></div>
<div class="r" data-h="islem"><b>İşlemde</b><em class="k1">in_progress</em><span>Kumanda tam ekran · tab bar yok</span></div>
<div class="r" data-h="bekleme"><b>Beklemede</b><em class="k2">+ wait_ends_at</em><span>Gün · amber ada geri sayıyor, son 5 dk'da kırmızı</span></div>
<div class="r" data-h="arka"><b>Arka planda</b><em class="k1">in_progress</em><span>Gün · turuncu ada geçen süreyi sayıyor (elle indirildi)</span></div></div>
<div class="prose" style="font-size:13.5px"><p><b>Kendiliğinden hareket yalnız iki tane.</b> Bekleme kurulunca kumanda iniyor, bekleme sıfıra inince kalkıyor. Kalkış, açık bir sayfa varsa olmuyor; yerine şerit ve titreşim geliyor. Diğer bütün hareketleri kullanıcının eli yapıyor.</p><p><b>Bağlantıyı kesip tahsil etmeyi deneyin:</b> ekran değişmiyor, sebep düğmenin üstünde yazıyor.</p></div>`;

const $=s=>document.querySelector(s);
const ph=$("#lv"),L=$("#lvL"),K=$("#lvK"),Y=$("#lvY"),B=$("#lvB"),W=$("#lvW"),WS=$("#lvWS");
let adaKind="";
const active=()=>["islem","arka","bekleme","sifir"].includes(S.st);
const plan=()=>`90 dk plan · ${Math.max(0,90-Math.floor(S.el/60))} dk kaldı`;

function kHTML(){
 if(S.st==="odeme")return payBody({m:S.m,err:S.err}).replace(/^<div class="pg">|<\/div>$/g,"").replace(/nakit tahsil et/,["nakit","kartla","havaleyle"][S.m]+" tahsil et");
 if(S.st==="tamam")return doneBody().replace(/^<div class="pg">|<\/div>$/g,"").replace("nakit alındı",["nakit","kartla","havaleyle"][S.m]+" alındı");
 const head=kgrab(NEXT);
 if(S.st==="sifir")return head+idp({st:"bekleme bitti",sc:"am"})+dialW("YIKA",1,"zero",fmt(S.el),`<button class="mini" data-act="ack">${g("check")}Başındayım</button>`)+strip(2,"Boya · 7.3 kumral")+fin();
 if(S.wl>0)return head+idp({st:"bekliyor · boya",sc:"am"})+dialW(fmt(S.wl),1-S.wl/S.wt,S.wl<=300?"hot":"",fmt(S.el))+strip(2,"Boya · 7.3 kumral")+fin();
 return head+idp({st:"sürüyor",sc:"or"})+dialB(fmt(S.el),plan(),Math.min(1,S.el/5400))+strip(2,"Boya · 7.3 kumral")+fin();
}
function yHTML(){
 if(S.st==="bosta")return slider("Kaydır · Zeynep'i başlat");
 if(S.st==="arka")return ada({k:"or",kk:"sürüyor · geçen",who:"Zeynep Kaya · boya",v:fmt(S.el),pr:Math.min(1,S.el/5400)});
 if(S.st==="bekleme")return ada({k:S.wl<=300?"rd":"am",kk:S.wl<=300?"son dakikalar · boya":"bekleme kalan · boya",who:"Zeynep Kaya",v:fmt(S.wl),pr:1-S.wl/S.wt});
 return "";
}
function bHTML(){return S.st==="bosta"?gunBosta():S.wl>0||S.st==="sifir"?gunBekleme(clk()):gunSuruyor(clk())}
function render(){
 B.innerHTML=bHTML();
 Y.innerHTML=yHTML();Y.classList.toggle("hide",!Y.innerHTML);
 adaKind=S.st==="bekleme"?(S.wl<=300?"rd":"am"):S.st;
 const up=!["bosta","arka","bekleme"].includes(S.st);
 if(up)K.innerHTML=kHTML();
 L.classList.toggle("down",!up);L.style.transform="";
 $("#lvWarm").className="warm "+(S.st==="odeme"||S.st==="tamam"?"gr":S.wl>0||S.st==="sifir"?"am":"");
 $("#lvS").innerHTML=`Hâl: <b>${NAMES[S.st]}</b>${S.off?" · bağlantı yok":""}`;
 col.querySelectorAll("[data-h]").forEach(r=>r.style.background=r.dataset.h===(S.st==="sifir"?"islem":S.st)?"var(--surf2)":"");
 syncStatus();
}
function syncStatus(){const bars=ph.querySelector(".status .bars");bars.classList.toggle("no",S.off);let o=ph.querySelector(".status .ofi");if(S.off&&!o)bars.insertAdjacentHTML("beforebegin",g("off","ofi"));if(!S.off&&o)o.remove();col.querySelector('[data-c="off"]').textContent=S.off?"Bağlantıyı aç":"Bağlantıyı kes";col.querySelector('[data-c="off"]').classList.toggle("on",S.off)}
const lower=()=>{if(!["islem","sifir"].includes(S.st))return;S.st=S.wl>0?"bekleme":"arka";render()};
const raise=()=>{if(!["arka","bekleme"].includes(S.st))return;S.st=S.wl===0?"sifir":"islem";render()};
function reset(){Object.assign(S,{st:"bosta",el:0,wl:-1,wt:1,m:0,err:0,clock:10*3600+48*60,busy:false});closeW();render()}

/* tik · sunucu saati taklidi */
setInterval(()=>{
 S.clock++;
 if(active()||S.st==="odeme"){S.el++;if(S.wl>0){S.wl--;if(S.wl===0){if(S.st==="bekleme"&&!S.sheet){S.st="sifir";render();return}if(S.st==="islem"){S.st="sifir";render();return}}}}
 ph.querySelectorAll("[data-clk]").forEach(e=>e.textContent=clk());
 ph.querySelectorAll("[data-el]").forEach(e=>e.textContent=fmt(S.el));
 const pl=ph.querySelector("[data-pl]");if(pl)pl.textContent=plan();
 if(S.wl>0){ph.querySelectorAll("[data-wl]").forEach(e=>e.textContent=fmt(S.wl));const r=K.querySelector(".ring");if(r){r.style.setProperty("--pr",1-S.wl/S.wt);r.classList.toggle("hot",S.wl<=300)}}
 if(S.st==="bekleme"){const k=S.wl<=300?"rd":"am";if(k!==adaKind){Y.innerHTML=yHTML();adaKind=k}else{const v=Y.querySelector("[data-ada]");if(v)v.textContent=fmt(S.wl);const m=Y.querySelector(".mr");if(m)m.style.setProperty("--pr",1-S.wl/S.wt)}}
 if(S.st==="arka"){const v=Y.querySelector("[data-ada]");if(v)v.textContent=fmt(S.el)}
},1000);

/* jestler · PanResponder taklidi */
let drag=null;
ph.addEventListener("pointerdown",e=>{
 const sl=e.target.closest(".sl"),kg=e.target.closest(".kgrab"),fn=e.target.closest(".fin");
 if(sl){const r=sl.getBoundingClientRect(),tr=parseFloat(getComputedStyle(sl).getPropertyValue("--tr"))||290;drag={k:"sl",el:sl,x0:e.clientX,tr,p:0,sc:r.width/sl.offsetWidth||1};sl.classList.remove("rt");sl.setPointerCapture(e.pointerId);return}
 if(kg){drag={k:"kg",y0:e.clientY,t0:performance.now(),dy:0};kg.setPointerCapture(e.pointerId);L.classList.add("drag");return}
 if(fn&&!fn.classList.contains("ok")){fn.classList.remove("can");fn.classList.add("hold","fil");fn.style.setProperty("--pr",1);drag={k:"fin",el:fn,t:setTimeout(()=>{fn.classList.remove("hold");fn.classList.add("ok");drag=null;setTimeout(()=>{S.st="odeme";S.err=0;render()},380)},900)};fn.setPointerCapture(e.pointerId)}
});
ph.addEventListener("pointermove",e=>{
 if(!drag)return;
 if(drag.k==="sl"){drag.p=Math.max(0,Math.min(1,(e.clientX-drag.x0)/drag.sc/drag.tr));drag.el.style.setProperty("--p",drag.p);drag.el.classList.toggle("thr",drag.p>.72)}
 if(drag.k==="kg"){drag.dy=Math.max(0,e.clientY-drag.y0);L.style.transform=`translateY(${drag.dy}px)`}
});
const endDrag=e=>{
 if(!drag)return;const d=drag;drag=null;
 if(d.k==="sl"){if(d.p>.72){d.el.style.setProperty("--p",1);setTimeout(()=>{if(S.st==="tamam"){reset();return}S.st="islem";S.el=0;render()},160)}else{d.el.classList.add("rt");d.el.style.setProperty("--p",0);d.el.classList.remove("thr")}}
 if(d.k==="kg"){L.classList.remove("drag");const v=d.dy/Math.max(1,performance.now()-d.t0);if(d.dy<6||d.dy>140||v>.6){L.style.transform="";lower()}else L.style.transform=""}
 if(d.k==="fin"){clearTimeout(d.t);d.el.classList.remove("hold","fil");d.el.classList.add("can");d.el.style.setProperty("--pr",0)}
};
ph.addEventListener("pointerup",endDrag);ph.addEventListener("pointercancel",endDrag);

/* dokunuşlar */
function openW(){S.sheet=true;W.classList.add("on");WS.classList.add("on")}
function closeW(){S.sheet=false;W.classList.remove("on");WS.classList.remove("on")}
ph.addEventListener("click",e=>{
 const t=e.target;
 if(t.closest(".ada")){raise();return}
 const a=t.closest("[data-act]");
 if(a){const act=a.dataset.act;
  if(act==="wait"&&S.st==="islem"&&!(S.wl>0))openW();
  if(act==="ack"){S.wl=-1;S.st="islem";render()}
  if(act==="home")reset();
  if(act==="pay"&&!S.busy){S.busy=true;a.classList.add("wait");a.textContent="Kaydediliyor";setTimeout(()=>{S.busy=false;if(S.off){S.err=1;render()}else{S.st="tamam";render()}},750)}
  return}
 const m=t.closest(".seg [data-m]");if(m&&S.st==="odeme"){S.m=+m.dataset.m;render();return}
 const w=t.closest("[data-w]");
 if(w){closeW();const big=K.querySelector(".big");if(big)big.classList.add("q");
  setTimeout(()=>{if(big)big.classList.remove("q");if(S.off){const ip=K.querySelector(".idp");if(ip&&!K.querySelector(".banner"))ip.insertAdjacentHTML("afterend",`<div class=\"banner err\" style=\"margin:0 20px 6px\">${g("warn")}<span>Bekleme kurulmadı. İnternet bağlantısı yok; sayaç değişmedi.</span></div>`);return}S.wt=S.wl=+w.dataset.w*60;render();setTimeout(()=>{if(S.st==="islem"&&S.wl>0)lower()},600)},500);return}
});
WS.addEventListener("click",closeW);
col.addEventListener("click",e=>{const c=e.target.closest("[data-c]");if(!c)return;const k=c.dataset.c;
 if(k==="w5"&&S.wl>301){S.wl=301}
 if(k==="w0"&&S.wl>3){S.wl=3}
 if(k==="off"){S.off=!S.off;syncStatus();$("#lvS").innerHTML=`Hâl: <b>${NAMES[S.st]}</b>${S.off?" · bağlantı yok":""}`}
 if(k==="rs")reset();
});
render();
})();
