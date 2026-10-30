// Müşteri sayfalarının ortak stili — online randevu (/book) ve randevu
// yönetimi (/booking) aynı koyu aileden (2026-10-30 rötuşu: yönetim sayfası
// bu aileye katıldı; daktilo yazılar sayfanın yazısına geçti).

/** Handoff CSS — koyu, premium randevu sayfası (tf-*). */
export function BookingCSS() {
  return <style>{`
.tf-page{min-height:100vh;background:#080604;color:#F3EDE3;font-family:'Hanken Grotesk',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative;padding-bottom:calc(48px + env(safe-area-inset-bottom))}
.tf-page::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 100% 55% at 50% -5%,rgba(255,90,31,.16) 0%,transparent 68%),radial-gradient(ellipse 50% 35% at 85% 90%,rgba(201,139,219,.06) 0%,transparent 60%),radial-gradient(ellipse 40% 30% at 10% 70%,rgba(107,159,212,.05) 0%,transparent 55%)}
.tf-shell{position:relative;z-index:1;width:100%;background:#0E0A06}
@media(min-width:540px){.tf-page{padding-top:52px;padding-bottom:80px}.tf-shell{width:464px;margin:0 auto;border-radius:30px;box-shadow:0 0 0 1px rgba(243,237,227,.09),0 40px 100px rgba(0,0,0,.80),0 12px 32px rgba(0,0,0,.55)}.tf-hero{border-radius:30px 30px 0 0}}
.tf-hero{height:164px;position:relative;overflow:hidden;background:linear-gradient(150deg,#2E2010 0%,#1A1208 45%,#0C0906 100%)}
.tf-orb1{position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(255,90,31,.32) 0%,transparent 62%);top:-130px;left:-70px;animation:tff1 11s ease-in-out infinite}
.tf-orb2{position:absolute;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(201,139,219,.14) 0%,transparent 60%);top:20px;right:-30px;animation:tff2 15s ease-in-out infinite}
.tf-orb3{position:absolute;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(224,168,78,.10) 0%,transparent 60%);bottom:-60px;left:30%;animation:tff1 13s ease-in-out infinite reverse}
@keyframes tff1{0%,100%{transform:translate(0,0)}40%{transform:translate(40px,28px)}75%{transform:translate(-18px,35px)}}
@keyframes tff2{0%,100%{transform:translate(0,0)}35%{transform:translate(-30px,20px)}70%{transform:translate(15px,-25px)}}
.tf-hlogo{position:absolute;bottom:14px;left:20px;display:flex;align-items:flex-end;gap:.05em;font-weight:900;font-size:13px;letter-spacing:-.04em;color:rgba(243,237,227,.13)}
.tf-hdot{width:.18em;height:.18em;border-radius:50%;background:rgba(255,90,31,.35);margin-bottom:.05em}
.tf-hmark{position:absolute;bottom:15px;right:20px;font-size:9.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(243,237,227,.11)}
.tf-profile{display:flex;align-items:center;gap:14px;padding:15px 20px 14px;background:rgba(12,8,4,.78);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-bottom:1px solid rgba(243,237,227,.09)}
.tf-appicon{width:46px;height:46px;border-radius:13px;flex-shrink:0;background:linear-gradient(145deg,#2C2010,#1A1208);border:1.5px solid rgba(243,237,227,.15);display:grid;place-items:center;font-weight:800;font-size:15px;letter-spacing:-.01em;color:#F3EDE3}
.tf-pname{font-size:16px;font-weight:800;letter-spacing:-.025em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf-pmeta{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:11.5px;color:rgba(243,237,227,.48)}
.tf-pdot{width:6px;height:6px;border-radius:50%;background:#7CC47F;flex-shrink:0}
.tf-progress{display:flex;align-items:center;padding:13px 20px 11px;background:rgba(10,6,3,.55);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid rgba(243,237,227,.07)}
.tf-ps{display:flex;align-items:center;gap:7px}
.tf-pn{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-size:11px;font-weight:800;transition:all .4s cubic-bezier(.2,.8,.2,1)}
.tf-pn.act{background:#FF5A1F;color:#fff;box-shadow:0 0 0 4px rgba(255,90,31,.22)}
.tf-pn.done{background:#FF5A1F;color:#fff;font-size:12px}
.tf-pn.pend{background:rgba(243,237,227,.08);color:rgba(243,237,227,.28)}
.tf-pl{font-size:11px;font-weight:600;white-space:nowrap;transition:color .3s}
.tf-pl.act{color:#F3EDE3}.tf-pl.pend{color:rgba(243,237,227,.28)}
.tf-pline{flex:1;height:1px;margin:0 6px;background:rgba(243,237,227,.10);position:relative;overflow:hidden}
.tf-pline::after{content:'';position:absolute;inset:0;background:#FF5A1F;transform-origin:left;transform:scaleX(0);transition:transform .55s cubic-bezier(.2,.8,.2,1)}
.tf-pline.on::after{transform:scaleX(1)}
.tf-bd{padding:0 16px 4px}
@media(min-width:540px){.tf-bd{padding-bottom:20px}}
.tf-slbl{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(243,237,227,.32);margin:22px 0 10px}
.tf-sgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.tf-sgrid .tf-sc:last-child:nth-child(odd){grid-column:1/-1}
.tf-sc{background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);border-radius:17px;padding:13px 14px 12px;cursor:pointer;position:relative;overflow:hidden;text-align:left;color:#F3EDE3;font-family:inherit;transition:border-color .22s,background .22s,box-shadow .22s,transform .15s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-sc:active{transform:scale(.97)}
.tf-sc:hover:not(.sel){border-color:rgba(243,237,227,.17);transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,0,0,.45)}
.tf-sc.sel{border-color:rgba(255,90,31,.52);background:rgba(255,90,31,.10);box-shadow:0 0 0 1px rgba(255,90,31,.22),0 8px 30px rgba(255,90,31,.16)}
.tf-bar{position:absolute;top:0;left:0;right:0;height:2px;border-radius:17px 17px 0 0;transition:opacity .25s}
.tf-sdot{width:7px;height:7px;border-radius:50%;margin-bottom:9px}
.tf-sname{font-size:13.5px;font-weight:700;letter-spacing:-.015em;margin-bottom:5px}
.tf-smeta{display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(243,237,227,.42)}
.tf-sprice{font-size:13px;font-weight:800;color:#FF5A1F;margin-top:5px}
.tf-staffrow{display:flex;gap:5px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}
.tf-staffrow::-webkit-scrollbar{display:none}
.tf-sc2{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 8px 6px;border-radius:16px;min-width:63px;cursor:pointer;flex-shrink:0;border:1.5px solid transparent;background:none;font-family:inherit;transition:all .2s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-sc2:hover{background:rgba(243,237,227,.05)}
.tf-sc2.sel{border-color:rgba(255,90,31,.42);background:rgba(255,90,31,.08)}
.tf-sav{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;font-size:15px;font-weight:800;flex-shrink:0;letter-spacing:-.01em;transition:box-shadow .2s}
.tf-sc2.sel .tf-sav{box-shadow:0 0 0 2.5px rgba(255,90,31,.75)}
.tf-sn{font-size:10.5px;font-weight:700;white-space:nowrap;color:#F3EDE3}
.tf-srole{font-size:9.5px;color:rgba(243,237,227,.36);white-space:nowrap}
.tf-cta{width:100%;height:54px;border-radius:17px;background:linear-gradient(145deg,#FF5A1F,#E84010);color:#fff;font-size:15px;font-weight:700;letter-spacing:.01em;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin:20px 0 4px;box-shadow:0 4px 24px rgba(255,90,31,.38),0 1px 0 rgba(255,255,255,.14) inset;font-family:inherit;transition:all .22s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-cta:hover:not(:disabled){transform:translateY(-1.5px);box-shadow:0 10px 36px rgba(255,90,31,.48)}
.tf-cta:active:not(:disabled){transform:scale(.98)}
.tf-cta:disabled{opacity:.28;cursor:not-allowed;box-shadow:none;transform:none}
.tf-arr{font-size:16px;transition:transform .2s}.tf-cta:hover:not(:disabled) .tf-arr{transform:translateX(3px)}
.tf-back{display:flex;align-items:center;gap:5px;padding:14px 0 0;font-size:13px;font-weight:600;color:rgba(243,237,227,.42);background:none;border:none;cursor:pointer;font-family:inherit;transition:color .15s}
.tf-back:hover{color:#F3EDE3}
.tf-cal{background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);border-radius:19px;padding:15px}
.tf-chdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.tf-cmon{font-size:14px;font-weight:800;letter-spacing:-.015em}
.tf-cnav{width:32px;height:32px;border-radius:10px;background:rgba(243,237,227,.07);border:none;cursor:pointer;color:#F3EDE3;font-size:18px;display:grid;place-items:center;transition:background .15s}
.tf-cnav:hover{background:rgba(243,237,227,.14)}
.tf-cgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;text-align:center}
.tf-dn{font-size:9.5px;font-weight:800;letter-spacing:.07em;color:rgba(243,237,227,.30);padding:2px 0 10px;text-transform:uppercase}
.tf-cd{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:500;cursor:pointer;position:relative;transition:background .15s,box-shadow .2s;-webkit-tap-highlight-color:transparent}
.tf-cd:hover:not(.past):not(.emp):not(.sel){background:rgba(243,237,227,.09)}
.tf-cd.past{color:rgba(243,237,227,.17);cursor:default;pointer-events:none}
.tf-cd.emp{cursor:default;pointer-events:none}
.tf-cd.today{color:#FF5A1F;font-weight:700}
.tf-cd.today::after{content:'';position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:3px;height:3px;border-radius:50%;background:#FF5A1F}
.tf-cd.sel{background:#FF5A1F;color:#fff;font-weight:700;box-shadow:0 0 0 3px rgba(255,90,31,.28)}
.tf-tgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tf-ts{height:44px;border-radius:12px;background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);font-size:12.5px;font-weight:600;color:#F3EDE3;cursor:pointer;display:grid;place-items:center;font-family:inherit;transition:all .17s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-ts:hover{border-color:rgba(243,237,227,.22);background:rgba(243,237,227,.05)}
.tf-ts.sel{background:rgba(255,90,31,.13);border-color:rgba(255,90,31,.52);color:#FF8050}
.tf-ig{display:flex;flex-direction:column;gap:5px;margin-top:12px}
.tf-ilbl{font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:rgba(243,237,227,.36)}
.tf-inp{height:50px;border-radius:14px;background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);padding:0 16px;font-family:inherit;font-size:15px;font-weight:500;color:#F3EDE3;width:100%;box-sizing:border-box;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none}
.tf-inp::placeholder{color:rgba(243,237,227,.20)}
.tf-inp:focus{border-color:rgba(255,90,31,.52);box-shadow:0 0 0 3px rgba(255,90,31,.11);outline:none}
textarea.tf-inp{height:88px;padding:13px 16px;resize:none;line-height:1.5}
.tf-sumc{background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);border-radius:16px;padding:2px 0}
.tf-sr{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(243,237,227,.06)}
.tf-sr:last-child{border-bottom:none}
.tf-sk{font-size:12px;color:rgba(243,237,227,.42);font-weight:500}
.tf-sv{font-size:13px;font-weight:700}
.tf-cfm{display:flex;flex-direction:column;align-items:center;padding:44px 0 20px;text-align:center}
.tf-cring{width:88px;height:88px;border-radius:50%;background:rgba(124,196,127,.10);border:2px solid rgba(124,196,127,.32);display:grid;place-items:center;margin-bottom:20px;animation:tfRing .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes tfRing{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
.tf-cring svg path{stroke-dasharray:30;stroke-dashoffset:30;animation:tfDraw .6s cubic-bezier(.2,.8,.2,1) .25s forwards}
@keyframes tfDraw{to{stroke-dashoffset:0}}
.tf-ct{font-size:23px;font-weight:900;letter-spacing:-.03em;margin-bottom:7px}
.tf-cs{font-size:13.5px;color:rgba(243,237,227,.50);line-height:1.55}
.tf-sin{opacity:1}
@media(prefers-reduced-motion:no-preference){.tf-sin{animation:tfIn .32s cubic-bezier(.2,.8,.2,1)}@keyframes tfIn{from{transform:translateY(14px)}to{transform:translateY(0)}}}
.tf-cta2{width:100%;height:48px;border-radius:15px;background:rgba(243,237,227,.06);border:1.5px dashed rgba(243,237,227,.20);color:rgba(243,237,227,.72);font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:16px;transition:all .18s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-cta2:hover:not(:disabled){border-color:rgba(255,90,31,.45);color:#F3EDE3}
.tf-cta2:active:not(:disabled){transform:scale(.98)}
.tf-cta2:disabled{opacity:.28;cursor:not-allowed}
.tf-cart{margin-top:18px;background:rgba(24,18,10,.6);border:1.5px solid rgba(243,237,227,.08);border-radius:16px;padding:6px 0 4px}
.tf-cartlbl{font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(243,237,227,.32);padding:8px 14px 4px}
.tf-lr{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(243,237,227,.06)}
.tf-lr:last-child{border-bottom:none}
.tf-ldot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.tf-lname{font-size:13px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf-lmeta{font-size:11px;color:rgba(243,237,227,.42);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf-lprice{font-size:12.5px;font-weight:800;color:#F3EDE3;flex-shrink:0}
.tf-lx{width:24px;height:24px;border-radius:8px;background:rgba(243,237,227,.06);border:none;color:rgba(243,237,227,.55);font-size:17px;line-height:1;cursor:pointer;flex-shrink:0;display:grid;place-items:center;font-family:inherit;transition:all .15s}
.tf-lx:hover{background:rgba(232,64,16,.18);color:#FF7040}
.tf-page.tf-emb{min-height:0;background:transparent;padding:0}
.tf-page.tf-emb::before{display:none}
.tf-page.tf-emb .tf-shell{width:100%;margin:0;border-radius:22px;box-shadow:0 0 0 1px rgba(243,237,227,.09);overflow:hidden}
@media(min-width:540px){.tf-page.tf-emb{padding:0}.tf-page.tf-emb .tf-shell{width:100%}}
.tf-spin{width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,90,31,.25);border-top-color:#FF5A1F;animation:tfspin .8s linear infinite}
.tf-spin-sm{width:18px;height:18px;border-width:2.5px}
@keyframes tfspin{to{transform:rotate(360deg)}}
/* ── Rötuş (2026-10-30): sayfa içi uyarı, takvime ekle, randevu yönetimi ── */
.tf-note{display:flex;align-items:flex-start;gap:10px;margin:16px 0 0;padding:12px 14px;border-radius:14px;font-size:13px;font-weight:600;line-height:1.45;background:rgba(224,168,78,.10);border:1px solid rgba(224,168,78,.28);color:#E8B867}
.tf-note.err{background:rgba(240,128,106,.10);border-color:rgba(240,128,106,.30);color:#F29A86}
.tf-note.ok{background:rgba(124,196,127,.10);border-color:rgba(124,196,127,.30);color:#8FD192}
.tf-note svg{flex-shrink:0;margin-top:1px}
.tf-note a,.tf-note button{color:inherit;font-weight:800;text-decoration:underline;text-underline-offset:3px;background:none;border:none;font:inherit;cursor:pointer;padding:0}
.tf-acts{display:grid;grid-template-columns:1fr 1fr;gap:9px;width:100%;margin-top:16px}
.tf-btn{height:48px;border-radius:15px;background:rgba(243,237,227,.06);border:1.5px solid rgba(243,237,227,.12);color:#F3EDE3;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:7px;text-decoration:none;transition:all .18s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-btn:hover:not(:disabled){border-color:rgba(243,237,227,.26);background:rgba(243,237,227,.09)}
.tf-btn:active:not(:disabled){transform:scale(.98)}
.tf-btn:disabled{opacity:.35;cursor:not-allowed}
.tf-btn.danger{background:rgba(240,128,106,.08);border-color:rgba(240,128,106,.30);color:#F29A86}
.tf-btn.danger:hover:not(:disabled){background:rgba(240,128,106,.14);border-color:rgba(240,128,106,.5)}
.tf-btn.full{grid-column:1/-1}
.tf-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.01em}
.tf-chip i{width:6px;height:6px;border-radius:50%;background:currentColor}
.tf-chip.confirmed{background:rgba(124,196,127,.12);color:#8FD192}
.tf-chip.pending{background:rgba(224,168,78,.13);color:#E8B867}
.tf-chip.cancelled{background:rgba(240,128,106,.12);color:#F29A86}
.tf-chip.completed,.tf-chip.other{background:rgba(243,237,227,.08);color:rgba(243,237,227,.62)}
.tf-kv{display:flex;align-items:center;gap:11px;padding:13px 16px;border-bottom:1px solid rgba(243,237,227,.06)}
.tf-kv:last-child{border-bottom:none}
.tf-kv svg{flex-shrink:0;color:rgba(243,237,227,.38)}
.tf-kk{font-size:12.5px;color:rgba(243,237,227,.46);font-weight:500;width:58px;flex-shrink:0}
.tf-kval{flex:1;min-width:0;text-align:right;font-size:14px;font-weight:700;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tf-kval small{display:block;font-size:11.5px;font-weight:600;color:rgba(243,237,227,.42);margin-top:2px}
.tf-lead{font-size:13.5px;color:rgba(243,237,227,.50);line-height:1.55;margin:4px 0 14px}
.tf-h1{font-size:21px;font-weight:900;letter-spacing:-.03em;margin:22px 0 6px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.tf-dstrip{display:flex;gap:7px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none;margin:0 -16px;padding-left:16px;padding-right:16px}
.tf-dstrip::-webkit-scrollbar{display:none}
.tf-day{flex-shrink:0;width:56px;height:66px;border-radius:15px;background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);color:#F3EDE3;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:all .17s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.tf-day small{font-size:10.5px;font-weight:700;color:rgba(243,237,227,.42)}
.tf-day b{font-size:18px;font-weight:800;letter-spacing:-.02em}
.tf-day:hover{border-color:rgba(243,237,227,.2)}
.tf-day.sel{background:rgba(255,90,31,.13);border-color:rgba(255,90,31,.52)}
.tf-day.sel small{color:#FF8050}
.tf-change{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:rgba(24,18,10,.95);border:1.5px solid rgba(243,237,227,.08);margin-top:16px;font-size:13px;font-weight:700}
.tf-change s{color:rgba(243,237,227,.38);font-weight:600;text-decoration-color:rgba(243,237,227,.3)}
.tf-change .to{color:#FF8050}
.tf-cring.red{background:rgba(240,128,106,.10);border-color:rgba(240,128,106,.32)}
.tf-skel{border-radius:14px;background:linear-gradient(90deg,rgba(243,237,227,.05),rgba(243,237,227,.09),rgba(243,237,227,.05));background-size:200% 100%;animation:tfSk 1.4s ease-in-out infinite}
@keyframes tfSk{from{background-position:100% 0}to{background-position:-100% 0}}
@media(prefers-reduced-motion:reduce){.tf-skel{animation:none}}
`}</style>;
}
