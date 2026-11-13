'use strict';
/* Al Doha Food Industries dashboard - front end.
   All data comes from app.py: /api/config once, /api/live every 3 s. */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let C=null,D=null,LV=null,skew=0,lastSync=0;
let cur='overview',tab=0,range='Daily',sel=3,ls=0,fv=0,F={fx:10,loc:0,fuel:0},E=6.2,Rc=3.8,pk='',raf=0;
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches,RC=2*Math.PI*52;
const N=(x,d=0)=>(+x).toLocaleString('en-US',{maximumFractionDigits:d});
/* ---------- language (English / Arabic) ---------- */
let LANG=(()=>{try{return localStorage.getItem('lang')==='ar'?'ar':'en'}catch(e){return 'en'}})(),AR=null;const TRC=new Map();
const NUMRE=/(?<![A-Za-z0-9])[−+]?\d[\d,]*(?:\.\d+)?/g;
const LOC=()=>LANG==='ar'?'ar-EG-u-nu-latn':'en-GB';
/* exact phrase → template with {n} for numbers → phrase-by-phrase fallback; unknown text (IDs, codes) stays as is */
function trCore(c){if(TRC.has(c))return TRC.get(c);let r=AR[c];
 if(r==null){const nums=[];const key=c.replace(NUMRE,m=>{nums.push(m);return '{n}'});const t=AR[key];if(t!=null){let i=0;r=t.replace(/\{n\}/g,()=>nums[i++]??'')}}
 if(r==null){for(const sep of [' · ',' → ',': ',' | ']){if(c.includes(sep)){const parts=c.split(sep);if(parts.length>1){r=parts.map(x=>trCore(x.trim())).join(sep===' → '?' ← ':sep);break}}}}
 if(r==null&&/^[–-] /.test(c))r=c[0]+' '+trCore(c.slice(2));
 if(r==null)r=c.replace(/→/g,'←');
 TRC.set(c,r);return r}
const tr=s=>{if(LANG!=='ar'||!AR||s==null)return s;s=String(s);const core=s.trim();if(!core||!/[A-Za-z→]/.test(core))return s;return s.replace(core,trCore(core.replace(/\s+/g,' ')))};
const trTT=s=>LANG==='ar'&&s?s.split('|').map(x=>isoN(tr(x))).join('|'):s;
/* keep number groups like "5 / 6" or "−12" in reading order inside right-to-left text (invisible bidi isolates) */
const ISO=/(?<![A-Za-z0-9\-\u2066])[−+]?\d[\d,]*(?:\.\d+)?%?(?:\s*[\/÷×]\s*[−+]?\d[\d,]*(?:\.\d+)?%?)*/g;
const isoN=s=>LANG==='ar'&&s&&/\d/.test(s)?s.replace(ISO,m=>'\u2066'+m+'\u2069'):s;
const AR_CH=/[\u0600-\u06FF]/;
function translateDOM(root){if(LANG!=='ar'||!AR||!root)return root;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const v=n.nodeValue;if(v.includes('⁦')||v.includes('⁧'))continue;let t=/[A-Za-z→]/.test(v)?tr(v):v;
  if(n.parentNode&&n.parentNode.namespaceURI==='http://www.w3.org/2000/svg'){if(AR_CH.test(t))t='⁧'+t+'⁩'}else t=isoN(t);if(t!==v)n.nodeValue=t}
 const els=root.querySelectorAll?[root,...root.querySelectorAll('*')]:[];
 for(const el of els){if(!el.getAttribute)continue;for(const a of ['aria-label','alt','title','data-label']){const v=el.getAttribute(a);if(v&&/[A-Za-z]/.test(v))el.setAttribute(a,tr(v))}{const v=el.getAttribute('data-n');if(v&&!v.includes('⁦'))el.setAttribute('data-n',isoN(/[A-Za-z]/.test(v)?tr(v):v))}if(el.dataset&&el.dataset.tt)el.dataset.tt=trTT(el.dataset.tt)}
 return root}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- icons (24×24 stroke set) ---------- */
const ICONS={
 overview:'<rect x="3" y="3" width="7.5" height="9" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2"/><rect x="3" y="15" width="7.5" height="6" rx="2"/>',
 factory:'<path d="M2 21h20"/><path d="M4 21V11l5 3v-3l5 3V8l6 3v10"/><path d="M17 9.5V3h3v8"/><path d="M8 17.5h1.5M12 17.5h1.5M16 17.5h1.5"/>',
 production:'<rect x="2.5" y="14.5" width="19" height="5" rx="2.5"/><circle cx="7" cy="17" r=".9"/><circle cx="12" cy="17" r=".9"/><circle cx="17" cy="17" r=".9"/><rect x="5" y="6" width="6" height="6" rx="1.2"/><path d="M14 12V9h4.5v3"/>',
 warehouse:'<path d="M3 21V9.5L12 4l9 5.5V21"/><path d="M7 21v-8h10v8"/><path d="M7 16.5h10"/>',
 energy:'<path d="M13.5 2.5 4.5 14h7l-1 7.5 9-11.5h-7z"/>',
 wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
 truck:'<path d="M14 17.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10.5a1 1 0 0 0 1 1h1.5"/><path d="M15 17.5H9"/><path d="M19.5 17.5H21a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.22-.62l-3.5-4.4A1 1 0 0 0 17.5 7.5H14"/><circle cx="17" cy="17.5" r="2"/><circle cx="7" cy="17.5" r="2"/>',
 route:'<circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><path d="M8.5 18.5H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
 report:'<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5"/><path d="M8.5 17v-3M12 17v-5.5M15.5 17v-2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
 alert:'<path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
 leaf:'<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
 fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8.5L18 5.5"/>',
 gauge:'<path d="M3.5 18a9 9 0 1 1 17 0"/><path d="m12 14.5 4.5-5"/><circle cx="12" cy="15" r="1.4"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
 box:'<path d="M21 7.5 12 3 3 7.5l9 4.5 9-4.5z"/><path d="M3 7.5v9l9 4.5 9-4.5v-9"/><path d="M12 12v9"/>',
 drop:'<path d="M12 2.8s7 7.4 7 12.2a7 7 0 0 1-14 0c0-4.8 7-12.2 7-12.2z"/>',
 coin:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
 shield:'<path d="M12 3 4.5 6v6c0 4.8 3.3 8 7.5 9 4.2-1 7.5-4.2 7.5-9V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5" opacity=".5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 moon:'<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 collapse:'<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
 grain:'<path d="M12 21V9"/><path d="M12 9c-2.5-1-3.5-3.5-3-6.5 2.6.6 3.8 3 3 6.5zM12 9c2.5-1 3.5-3.5 3-6.5-2.6.6-3.8 3-3 6.5z"/><path d="M12 15c-2.8-.6-4.4-2.8-4.5-5.6 2.9.2 4.5 2.6 4.5 5.6zM12 15c2.8-.6 4.4-2.8 4.5-5.6-2.9.2-4.5 2.6-4.5 5.6z"/>',
 expand:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
 download:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
 trend:'<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
 table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9.5 4v16"/>',
};
const ic=(n,s=20)=>`<svg class="icn" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;

/* ---------- small building blocks ---------- */
const SC={Running:'var(--brand)',OK:'var(--brand)',Done:'var(--brand)','On time':'var(--brand)',Pass:'var(--brand)','On route':'var(--brand)',
 Idle:'var(--warn)',Watch:'var(--warn)',Open:'var(--warn)',Pending:'var(--warn)',Hold:'var(--warn)',Loading:'var(--warn)','Due soon':'var(--warn)',
 Fault:'var(--crit)',Stopped:'var(--crit)',Low:'var(--crit)',Delayed:'var(--crit)',Critical:'var(--crit)',
 'Under Maintenance':'var(--info)',Planned:'var(--info)','In transit':'var(--info)','In workshop':'var(--info)',Maintenance:'var(--info)'};
const sevC={Critical:'var(--crit)',Warning:'var(--warn)',Info:'var(--info)'};
const HC={ok:'#2fd47a',warn:'#f5b52e',crit:'#ff4d42',bad:'#ff4d42'};
const pill=t=>`<span class="pill" style="--c:${SC[t]||'var(--mut)'}">${t}</span>`;
const cell=x=>typeof x==='number'?N(x,x%1?1:0):typeof x==='string'&&x[0]==='@'?pill(x.slice(1)):x;
const T=(h,rows,o={})=>`<div class="tw"><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr${o.click?` class="ck${o.sel===i?' on':''}" onclick="${o.click}(${i})"`:''}>${r.map(x=>`<td>${cell(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const Cd=(t,b,x='')=>`<section class="c ${x}">${t?`<h3>${t}</h3>`:''}${b}</section>`;
const R=(a,b,cls='two2')=>`<div class="g ${cls}">${a}${b}</div>`;
const sub=t=>`<small class="h3s">${t}</small>`;
const note=t=>`<p class="fn">${t}</p>`;
const go=(p,t=0)=>{cur=p;tab=t;closeNav();render()};
const setTab=i=>{tab=i;render()};
const TB=(tabs,demo='DEMO DATA')=>`<div class="bar">${tabs?`<div class="seg" role="tablist">${tabs.map((x,i)=>`<button role="tab" class="${i===tab?'on':''}" onclick="setTab(${i})">${x}</button>`).join('')}</div>`:''}<span class="demo">${demo}</span></div>`;
function legend(items){return `<div class="lgd">${items.map(x=>`<span><i style="background:${x.c}"></i>${x.n}</span>`).join('')}</div>`}

/* ---------- KPI cards ---------- */
function viz(z){if(!z)return '';switch(z.t){
 case 'bar':return `<span class="pb"><i data-w="${Math.min(z.p,100)}" style="background:${z.c||'var(--acc)'}"></i></span>`;
 case 'ring':return `<span class="kr">${ring(z.p,'var(--acc)',58,10)}<b>${N(z.p,z.p%1?1:0)}%</b></span>`;
 case 'chips':return `<span class="chips">${z.d.map(x=>`<span>${x}</span>`).join('')}</span>`;
 case 'spark':return spark(z.d,z.c)+(z.cap?`<small class="cap">${z.cap}</small>`:'');
 case 'pair':return `<span class="trp">${z.d.map(x=>`<span class="${x[2]}"><b>${x[0]}</b> ${x[1]}</span>`).join('')}</span>`;
 case 'split':return z.d.map(x=>mbar(x[0],x[1],x[3],x[2])).join('');
 case 'lines':return `<span class="lns">${C.machines.map(l=>`<i data-tt="${l[0]}|${l[1]}" class="${l[1]=='Running'?'run':l[1]=='Fault'?'flt':''}" style="--c:${SC[l[1]]}"></i>`).join('')}</span>`;
 }return ''}
function kcard(k){const b=!!k.go,tag=b?'button':'div',num=/\d/.test(k.v)&&!k.v.includes('<');
 return `<${tag} class="c kp${b?' xk':''}${k.viz&&k.viz.t=='ring'?' hasr':''}"${b?` onclick="go('${k.go[0]}',${k.go[1]||0})"`:''}><span class="xh">${k.i?`<span class="xi">${ic(k.i,18)}</span>`:''}<span class="l">${k.l}</span>${b?'<span class="xg">→</span>':''}</span><span class="v"${num?` data-n="${esc(k.v)}"`:''}>${k.v}</span><span class="s ${k.c||''}">${k.s||''}</span>${viz(k.viz)}</${tag}>`}
const K=a=>`<div class="g k ${a.length%3==0?'k3':a.length==4?'k4':''}">${a.map(kcard).join('')}</div>`;
const mbar=(l,v,c,mx=100,txt)=>`<span class="mbr"><span>${l}</span><span class="pb"><i data-w="${Math.min(v/mx*100,100)}" style="background:${c}"></i></span><b>${txt||N(v,v%1?1:0)+'%'}</b></span>`;

/* ---------- charts ---------- */
const ring=(p,c,sz,sw=11)=>`<svg class="rg" viewBox="0 0 120 120" width="${sz}" height="${sz}" aria-hidden="true"><circle cx="60" cy="60" r="52" class="rgb" stroke-width="${sw}"/><circle cx="60" cy="60" r="52" class="rgf" stroke-width="${sw}" stroke="${c}" stroke-dasharray="${RC}" stroke-dashoffset="${RC}" data-p="${Math.min(p,100)}" transform="rotate(-90 60 60)"/></svg>`;
function spark(a,c,W=220,H=46){const mn=Math.min(...a)*.97,mx=Math.max(...a)*1.02,x=i=>4+i*(W-8)/(a.length-1),y=v=>H-4-(v-mn)/((mx-mn)||1)*(H-10),l='M'+a.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' L');
 return `<svg class="spk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${l} L${x(a.length-1)},${H} L4,${H} Z" fill="${c}" opacity=".14"/><path d="${l}" pathLength="1" class="draw" fill="none" stroke="${c}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`}
const nice=v=>{if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),m=v/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p};
/* vertical bars: o={l,s:[{n,d,c}],u,stack,tgt,h} */
function bars(o){const W=640,H=o.h||240,L=48,Rr=14,Tp=16,B=30,l=o.l,s=o.s,n=l.length;
 const tot=i=>o.stack?s.reduce((a,x)=>a+x.d[i],0):Math.max(...s.map(x=>x.d[i]));
 const raw=Math.max(...l.map((_,i)=>tot(i)),o.tgt||0)*1.06,stp=nice(raw/4),tk=Math.max(Math.ceil(raw/stp),2),mx=stp*tk,y=v=>H-B-v/mx*(H-B-Tp),bw=(W-L-Rr)/n,gw=o.stack?Math.min(bw*.5,60):Math.min(bw*.74/s.length,46);
 let g='';for(let f=0;f<=tk;f++){const v=stp*f;g+=`<line x1="${L}" x2="${W-Rr}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L-8}" y="${y(v)+4}" class="ax" text-anchor="end">${N(v,v<10&&v%1?1:0)}</text>`}
 let b='';l.forEach((t,i)=>{let acc=0;const span=o.stack?gw:gw*s.length,x0=L+i*bw+(bw-span)/2;
  b+=`<text x="${L+i*bw+bw/2}" y="${H-9}" class="ax" text-anchor="middle">${t}</text>`;
  s.forEach((x,j)=>{const v=x.d[i],hh=Math.max(H-B-y(v),0),bx=o.stack?x0:x0+j*gw,by=o.stack?y(acc+v):y(v);acc+=v;
   b+=`<rect class="br" x="${bx+1}" y="${by}" width="${gw-2}" height="${hh}" rx="4" fill="${x.c}" style="animation-delay:${(i*.03+j*.02).toFixed(2)}s" data-tt="${esc(t)}|${esc(x.n)}: ${N(v,1)} ${esc(o.u||'')}"/>`})});
 const tg=o.tgt?`<line x1="${L}" x2="${W-Rr}" y1="${y(o.tgt)}" y2="${y(o.tgt)}" class="tg"/><text x="${W-Rr}" y="${y(o.tgt)-6}" class="ax tgl" text-anchor="end">target ${N(o.tgt,1)}</text>`:'';
 return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="ch">${g}${b}${tg}</svg>${legend(s.concat(o.tgt?[]:[]))}${o.u?`<small class="cap">${o.u}</small>`:''}`}
/* horizontal bars: rows=[{n,v,max,c,txt,sub}] */
const hbars=rows=>`<div class="hbs">${rows.map((r,i)=>`<div class="hbr" data-tt="${esc(r.n)}|${esc(r.txt||N(r.v,1))}"><span class="hbn">${r.n}${r.sub?`<small>${r.sub}</small>`:''}</span><span class="hbt"><i data-w="${Math.min(r.v/r.max*100,100)}" style="background:${r.c};transition-delay:${i*.03}s"></i></span><b>${r.txt||N(r.v,1)}</b></div>`).join('')}</div>`;
/* donut: items=[{n,v,c}] */
function donut(items,o={}){const tot=items.reduce((a,x)=>a+x.v,0),r=70,Cc=2*Math.PI*r;let off=0;
 const segs=items.map((x,i)=>{const f=x.v/tot,len=f*Cc,s=`<circle class="dns" cx="100" cy="100" r="${r}" stroke="${x.c}" stroke-dasharray="0 ${Cc}" data-da="${Math.max(len-2.5,.1).toFixed(2)} ${Cc.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" style="transition-delay:${i*.05}s" data-tt="${esc(x.n)}|${N(x.v,1)} ${esc(o.u||'')} · ${N(f*100,1)}%"/>`;off+=len;return s}).join('');
 const ctr=o.center||N(tot,1);
 return `<div class="dnw"><div class="dnc"><svg viewBox="0 0 200 200" width="210" height="210" aria-hidden="true"><circle cx="100" cy="100" r="${r}" class="dnb"/><g transform="rotate(-90 100 100)">${segs}</g></svg><div class="dnm"><b data-n="${esc(ctr)}">${ctr}</b><small>${o.cl||o.u||''}</small></div></div><div class="dnl">${items.map(x=>`<div data-tt="${esc(x.n)}|${N(x.v,1)} ${esc(o.u||'')}"><i style="background:${x.c}"></i><span>${x.n}</span><b>${N(x.v,1)}</b><small>${N(x.v/tot*100,0)}%</small></div>`).join('')}</div></div>`}
const PAL=['#0a9d55','#2f7fd1','#e39a12','#8a5fd1','#c2417a','#12a3a3','#7b8791'];
const ringsRow=items=>`<div class="rgr">${items.map((x,i)=>`<div class="rgi" data-tt="${esc(x.n)}|${x.p}% used"><div class="rgw">${ring(x.p,x.p>=80?'var(--crit)':x.p>=70?'var(--warn)':'var(--acc)',112,12)}<b data-n="${x.p}%">${x.p}%</b></div><span>${x.n}</span></div>`).join('')}</div>`;
const tanks=items=>`<div class="tks">${items.map((x,i)=>`<div class="tk" data-tt="${esc(x[0])}|${x[1]}% used|${esc(x[2])}"><div class="tkb"><div class="tkf" data-h="${x[1]}" style="--c:${x[1]>=80?'var(--crit)':x[1]>=70?'var(--warn)':'var(--acc)'};transition-delay:${i*.06}s"><svg class="wv" viewBox="0 0 120 12" preserveAspectRatio="none"><path d="M0 6 Q15 0 30 6 T60 6 T90 6 T120 6 V12 H0z"/></svg></div><b data-n="${x[1]}%">${x[1]}%</b><span class="tkm" style="bottom:80%">80%</span></div><strong>${x[0]}</strong><small>${x[2]}</small></div>`).join('')}</div>`;
function gauge(v,t,mx,u){const r=80,cx=100,cy=100,a=p=>Math.PI*(1-p),P=p=>`${(cx+r*Math.cos(a(p))).toFixed(1)},${(cy-r*Math.sin(a(p))).toFixed(1)}`,tp=t/mx;
 return `<div class="gw"><svg viewBox="0 0 200 118" width="100%" aria-hidden="true"><path d="M20,100 A80,80 0 0 1 180,100" class="gbg"/><path d="M20,100 A80,80 0 0 1 180,100" class="gfv" pathLength="1" style="--p:${v/mx}"/><line x1="${P(tp).split(',')[0]}" y1="${P(tp).split(',')[1]}" x2="${(cx+(r+16)*Math.cos(a(tp))).toFixed(1)}" y2="${(cy-(r+16)*Math.sin(a(tp))).toFixed(1)}" class="gtk"/></svg><div class="gv"><b data-n="${N(v)} ${u}">${N(v)} ${u}</b><small>target ${N(t)} ${u} · ${v>t?'+':''}${N((v-t)/t*100,1)}%</small></div></div>`}

/* ---------- overview trend chart ---------- */
const CW=640,CH=250,CL=48,CR=18,cx=(i,n)=>CL+i*(CW-CL-CR)/(n-1);
function trend(){const d=C.trend[range],n=d.l.length,mx=Math.max(...d.t,...d.a)*1.1,y=v=>CH-30-(v/mx)*(CH-50),x=i=>cx(i,n),path=a=>'M'+a.map((v,i)=>x(i)+','+y(v)).join(' L');
 let grid='';[0,.25,.5,.75,1].forEach(f=>{const v=mx/1.1*f;grid+=`<line x1="${CL}" x2="${CW-CR}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${CL-8}" y="${y(v)+4}" class="ax" text-anchor="end">${N(v)}</text>`});
 const sa=d.cum?d.a[n-1]:d.a.reduce((s,v)=>s+v,0),st=d.cum?d.t[n-1]:d.t.reduce((s,v)=>s+v,0),pc=sa/st*100;
 return `<div class="chs"><div><small>Actual</small><b data-n="${N(sa)} t">${N(sa)} t</b></div><div><small>Target</small><b data-n="${N(st)} t">${N(st)} t</b></div><div><small>Achievement</small><b class="${pc<100?'dn':'up'}" data-n="${N(pc,1)}%">${N(pc,1)}%</b></div></div>
<div class="chw"><svg viewBox="0 0 ${CW} ${CH}" width="100%" role="img" aria-label="Actual vs target production"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".35"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>${grid}
${d.l.map((l,i)=>`<text x="${x(i)}" y="${CH-8}" class="ax" text-anchor="middle">${l}</text>`).join('')}
<path d="${path(d.a)} L${x(n-1)},${CH-30} L${x(0)},${CH-30} Z" fill="url(#ga)" class="fade"/><path d="${path(d.t)}" fill="none" stroke="var(--mut)" stroke-width="2" stroke-dasharray="6 5"/><path d="${path(d.a)}" pathLength="1" class="draw" fill="none" stroke="var(--brand)" stroke-width="3.5" stroke-linejoin="round"/>
<line class="gl" y1="14" y2="${CH-30}" stroke="var(--ink)" stroke-opacity=".25" stroke-dasharray="3 3"/>
${d.a.map((v,i)=>`<circle class="dt pop" cx="${x(i)}" cy="${y(v)}" r="4.5" fill="var(--card)" stroke="var(--brand)" stroke-width="2.5" style="animation-delay:${.25+i*.04}s"/>`).join('')}</svg><div class="ctip"></div></div>
<div class="lgd"><span><i style="background:var(--brand)"></i>Actual</span><span><i class="dsh"></i>Target</span><span class="mut">${d.u} · hover the chart for values</span></div>`}
function bindTrend(){const w=$('.chw');if(!w)return;const d=C.trend[range],n=d.l.length,s=$('svg',w),tp=$('.ctip',w),gl=$('.gl',w),ds=$$('.dt',w);
 s.onpointermove=e=>{const r=s.getBoundingClientRect(),vx=(e.clientX-r.left)/r.width*CW,i=Math.max(0,Math.min(n-1,Math.round((vx-CL)/((CW-CL-CR)/(n-1))))),X=cx(i,n),df=d.a[i]-d.t[i];
  gl.setAttribute('x1',X);gl.setAttribute('x2',X);gl.style.opacity=1;ds.forEach((c,j)=>c.classList.toggle('on',j==i));
  tp.innerHTML=`<b>${range=='Daily'?d.l[i]+':00':d.l[i]}</b><span><i style="background:var(--brand)"></i>Actual <b>${N(d.a[i])} t</b></span><span><i class="dsh"></i>Target <b>${N(d.t[i])} t</b></span><span class="${df<0?'dn':'up'}">${df<0?'−':'+'}${N(Math.abs(df))} t · ${N(d.a[i]/d.t[i]*100,1)}%</span>`;
  translateDOM(tp);tp.style.left=X/CW*100+'%';tp.style.transform=`translateX(${X/CW>.6?'calc(-100% - 14px)':'14px'})`;tp.classList.add('o')};
 s.onpointerleave=()=>{tp.classList.remove('o');gl.style.opacity=0;ds.forEach(c=>c.classList.remove('on'))}}

/* ---------- motion helpers ---------- */
const NF={},nf=(dc,g)=>NF[dc+''+g]||(NF[dc+''+g]=new Intl.NumberFormat('en-US',{minimumFractionDigits:dc,maximumFractionDigits:dc,useGrouping:g}));
function cu(el){const txt=el.dataset.n,re=/\d[\d,]*(\.\d+)?/g;if(!re.test(txt))return;const t0=performance.now(),dur=550;
 const f=now=>{const k=Math.min((now-t0)/dur,1),e=1-Math.pow(1-k,3);el.textContent=txt.replace(re,m=>{const dc=(m.split('.')[1]||'').length;return nf(dc,m.includes(',')).format(parseFloat(m.replace(/,/g,''))*e)});if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)}
function fx(r,an){if(an&&!RM)$$('[data-n]',r).forEach(cu);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{$$('[data-w]',r).forEach(el=>el.style.width=el.dataset.w+'%');$$('[data-h]',r).forEach(el=>el.style.height=el.dataset.h+'%');
  $$('[data-p]',r).forEach(el=>el.style.strokeDashoffset=RC*(1-el.dataset.p/100));$$('[data-da]',r).forEach(el=>el.style.strokeDasharray=el.dataset.da)}))}

/* ---------- map (Locations + Fleet) ---------- */
const MX=x=>50+(x-29.4)/3.1*900,MY=y=>40+(31.6-y)/2*420,site=id=>D.locations.sites.find(s=>s[0]==id);
function egyptMap(o={}){const u='m'+(++UID),L=D.locations,P=(a,b)=>MX(a).toFixed(1)+','+MY(b).toFixed(1),coast=[[29.4,30.85],[29.88,31.2],[30.4,31.5],[31,31.55],[31.5,31.55],[31.8,31.42],[32.1,31.3],[32.5,31.27]];
 const rts=L.routes.map((r,i)=>{const a=site(r[0]),b=site(r[1]);return `<line x1="${MX(a[5])}" y1="${MY(a[6])}" x2="${MX(b[5])}" y2="${MY(b[6])}" class="rt${o.hiRoute===i?' on':''}" data-tt="${esc(a[1])} → ${esc(b[1])}|${esc(r[2])} · ${r[3]} km · ${r[4]} trips/day"/>`}).join('');
 const sts=L.sites.map((s,i)=>{const X=MX(s[5]),Y=MY(s[6]),c=L.types[s[4]][0],on=i===o.sel,lx=s[14]=='l';
  return `<g class="st-s${on?' on':''}"${o.click?` onclick="${o.click}(${i})"`:''} data-tt="${esc(s[1])}|${esc(s[3])}"><circle cx="${X}" cy="${Y}" r="${on?30:25}" fill="${c}" opacity=".18" class="halo"/><circle cx="${X}" cy="${Y}" r="${on?20:16}" fill="${c}" stroke="${on?'#fff':'none'}" stroke-width="3"/><text x="${X}" y="${Y+5.5}" text-anchor="middle" class="sn">${s[0]}</text><text x="${s[14]=='t'?X:lx?X-26:X+26}" y="${s[14]=='t'?Y-30:Y+6}" text-anchor="${s[14]=='t'?'middle':lx?'end':'start'}" class="sl">${s[1]}</text></g>`}).join('');
 return `<svg viewBox="0 0 1000 480" width="100%" class="map" role="img" aria-label="Map of sites and routes"><defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7fd1" stop-opacity=".28"/><stop offset="1" stop-color="#2f7fd1" stop-opacity=".08"/></linearGradient><pattern id="${u}d" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" class="mdot"/></pattern></defs>
<rect width="1000" height="480" rx="12" fill="url(#${u}s)"/><polygon points="${coast.map(c=>P(c[0],c[1])).join(' ')} ${P(32.5,29.6)} ${P(29.4,29.6)}" class="land"/>
<polyline class="nile" points="${P(31.24,29.6)} ${P(31.24,30.1)} ${P(31,30.6)} ${P(30.8,31)} ${P(30.42,31.45)}"/><polyline class="nile" points="${P(31.24,30.1)} ${P(31.4,30.7)} ${P(31.6,31.1)} ${P(31.8,31.42)}"/><polyline class="nile" stroke-dasharray="7 5" points="${P(32.3,29.95)} ${P(32.3,31.27)}"/>
<text x="470" y="30" class="geo">Mediterranean Sea</text><text x="${MX(31.0)}" y="${MY(30.62)}" class="geo">Nile Delta</text><text x="${MX(32.3)-10}" y="${MY(30.12)}" class="geo" text-anchor="end">Suez Canal</text>
${rts}${sts}${o.trucks?'<g class="trk"></g>':''}</svg>`}

/* ---------- pages ---------- */
const P={};
P.overview=()=>{const o=D.overview,pr=o.production,oe=o.oee;
 const hs=(h,i)=>{const [nm,l,t,pg,tb,st,...info]=h,pn=C.pages.find(p=>p.id==pg).name;return `<button class="hs${l>60?' L':''}${t>55?' U':''}" style="left:${l}%;top:${t}%;--c:${HC[st]};animation-delay:${.05+i*.04}s" onclick="go('${pg}',${tb})" aria-label="${nm} - open ${pn}"><span class="pu"></span><span class="co"></span><span class="hl">${nm}</span><span class="tip"><b>${nm}</b>${info.map(x=>`<span>${x}</span>`).join('')}<em>Open ${pn} →</em></span></button>`};
 return `<div class="bar"><div class="seg">${['Daily','Weekly','Monthly'].map(r=>`<button class="${r===range?'on':''}" data-r="${r}">${r}</button>`).join('')}</div><input type="date" class="ib" value="${new Date().toISOString().slice(0,10)}" aria-label="Date"><span class="demo">DEMO DATA – no live PLC/SCADA connection</span></div>
<div class="ovh"><div class="hero" id="hero"><div class="kb"><img src="/static/images/factory-photo-1000.jpg" srcset="/static/images/factory-photo-1000.jpg 1000w, /static/images/factory-photo-hero.jpg 1600w" sizes="(max-width:1100px) 100vw, 60vw" alt="Aerial view of the plant" decoding="async" width="1600" height="1079"></div>
<div class="htop"><span class="live"><i></i>LIVE PLANT VIEW</span><b>Al Doha Food Industries</b><small>Factory layout · hover a zone for details, click to open it</small></div>${o.hotspots.map(hs).join('')}
<div class="hbot"><span class="hleg"><i style="background:${HC.ok}"></i>Normal<i style="background:${HC.warn}"></i>Warning<i style="background:${HC.crit}"></i>Issue</span><span class="ph">Placeholder photo – replace with plant layout</span><button class="hb" onclick="lbOpen()">${ic('expand',16)} Full view</button></div></div>
<div class="sd"><button class="c pc" onclick="go('production',0)"><span class="ch"><span class="l">Production today</span><span class="chip">Target ${pr.target} t</span></span><span class="pr">${ring(pr.actual/pr.target*100,'var(--brand)',156)}<span class="rc"><b data-n="${pr.actual} t">${pr.actual} t</b><small>${N(pr.actual/pr.target*100,1)}% of target</small></span></span>
<span class="st"><span>Finished rice</span><b>${pr.rice} t</b></span><span class="st"><span>Pasta</span><b>${pr.pasta.toFixed(1)} t</b></span><span class="st"><span>Gap to target</span><b class="dn">−${pr.target-pr.actual} t</b></span></button>
<button class="c pc" onclick="go('maintenance',0)"><span class="ch"><span class="l">OEE</span><span class="chip">A × P × Q</span></span><span class="big" data-n="${oe.v}%">${oe.v}%</span>${mbar('Availability',oe.a,'var(--info)')}${mbar('Performance',oe.p,'#8a5fd1')}${mbar('Quality',oe.q,'var(--brand)')}</button></div></div>
<div class="g k k3">${o.kpis.map(kcard).join('')}</div>
<div class="g two"><div class="c"><h3>Production – actual vs target</h3><div id="chw">${trend()}</div></div>
<div class="c"><h3>Recent alerts ${sub('– click to open')}</h3>${C.notes.slice(0,5).map((n,i)=>`<button class="al${n.r?' r':''}${n.s=='Critical'?' cr':''}" style="--c:${sevC[n.s]}" onclick="openNote(${i})"><span class="sv"></span><span><span class="at">${n.t}</span><small>${n.s} · ${n.m}</small></span><span class="xg">→</span></button>`).join('')}</div></div>
<div class="g two"><div class="c"><h3>Machine status ${sub('– live load, click a machine for maintenance detail')}</h3><div class="mts">${C.machines.map(l=>{const ld=LV?LV.loads[l[0]]??l[2]:l[2];return `<button class="mt ${l[1]=='Running'?'run':l[1]=='Fault'?'flt':'idl'}" style="--c:${SC[l[1]]}" onclick="${l[3]!=null?`selGo(${l[3]})`:`go('maintenance',0)`}"><span class="mh"><b>${l[0]}</b>${pill(l[1])}</span><span class="ml"><span>Load</span><b data-lv="load:${l[0]}">${ld}%</b></span><span class="pb"><i data-w="${ld}" data-lv="loadbar:${l[0]}"></i></span></button>`}).join('')}</div></div>
<div class="c"><h3>Workforce today</h3><div class="wf">${ring(93,'var(--brand)',96)}<span><b class="big" data-n="212 / 228">212 / 228</b><small>present · 93% attendance</small></span></div>${o.workforce.map(w=>mbar(w[0],w[1]/w[2]*100,w[1]<w[2]?'var(--warn)':'var(--brand)',100,`${w[1]}/${w[2]}`)).join('')}</div></div>
${note('Production achievement % = actual ÷ target × 100 · OEE = availability × performance × quality · Energy intensity = kWh ÷ finished tons. All values are sample data.')}`};

P.factories=()=>{const f=D.factories;let b;
 if(tab==0){const m=f.main,mx=m.stages[0][1];
  b=K(m.kpis)+R(Cd('Process flow – output by stage '+sub('(t)'),`<div class="fun">${m.stages.map((s,i)=>{const loss=i?m.stages[i-1][1]-s[1]:0;return `<div class="fr" data-tt="${s[0]}|${s[1]} t out${loss?`|−${loss} t lost at this stage`:''}"><span class="fn1"><b>${i+1}</b>${s[0]}</span><span class="ft"><i data-w="${s[1]/mx*100}" style="transition-delay:${i*.08}s"></i><em>${s[1]} t</em></span><span class="fl">${loss?`−${loss} t`:''}</span></div>`}).join('')}</div><div class="fsum">Yield <b>${N(m.stages.at(-1)[1]/mx*100,1)}%</b> · ${m.stages.at(-1)[1]} t of ${mx} t paddy · biggest loss at <b>Hulling</b> (husk)</div>`),Cd('Stage detail',T(['Stage','In t','Out t','Status'],m.table)));
 }else if(tab==1){const p=f.packaging;b=K(p.kpis)+R(Cd('Packages by type '+sub('(thousand)'),donut(p.types.map((x,i)=>({n:x[0],v:x[1],c:PAL[i]})),{u:'k',center:'121.5 k',cl:'packages today'})),Cd('Lines',T(['Line','Product','Pkg/min','Reject %','Status'],p.lines)));
 }else if(tab==2){const q=f.quality;b=K(q.kpis)+Cd('Batch traceability – B-RC-2610-07',`<div class="trc">${q.trace.map((s,i)=>`<div class="ts${i==q.trace.length-1?' hold':''}" style="animation-delay:${i*.07}s"><i></i><span>${s}</span></div>`).join('')}</div><p class="mut">Moisture 14.8% at final QC – batch held for re-drying and retest.</p>`)+Cd('Batch traceability & inspections',T(['Batch','Product','Stage','Result','Finding','Corrective action'],q.batches));
 }else if(tab==3){const w=f.workforce;b=K(w.kpis)+R(Cd('Present vs required by area',bars({l:w.areas.map(a=>a[0]),s:[{n:'Present',d:w.areas.map(a=>a[1]),c:'var(--acc)'},{n:'Required',d:w.areas.map(a=>a[2]),c:'var(--mut2)'}],u:'staff'})),Cd('Staffing gaps',w.areas.map(a=>`<div class="gap"><span>${a[0]}</span><span class="gd">${[...Array(a[2])].map((_,i)=>`<i class="${i<a[1]?'':'mi'}"></i>`).join('')}</span><b class="${a[1]<a[2]?'dn':'up'}">${a[1]<a[2]?`−${a[2]-a[1]}`:'full'}</b></div>`).join('')+`<p>${w.impact}</p><p class="mut">Aggregated figures only – no personal employee data.</p>`));
 }else if(tab==4)b=plan();else if(tab==5){const fl=f.filling;b=K(fl.kpis)+R(Cd('Output by filling line '+sub('(thousand packages)'),hbars(fl.lines.map((x,i)=>({n:x[0],v:x[1],max:65,c:i==1?'var(--crit)':'var(--warn)',txt:N(x[1],1)+' k',sub:i==1?'faulted at 09:40':''})))),Cd('Filling stations',T(['Location','Line','Product','Pkg/min','Reject %','Changeover','Status'],fl.stations)))+Cd('Material feed to filling',T(['Material','From','Route','Status'],fl.feed));
 }else{const s=f.storage;b=K(s.kpis)+R(Cd('Capacity used by zone',ringsRow(s.zones.map(z=>({n:z[0],p:z[1]})))),Cd('Finished goods aging '+sub('(t)'),bars({l:s.aging.l,s:[{n:'Rice',d:s.aging.rice,c:'var(--acc)'},{n:'Pasta',d:s.aging.pasta,c:'#e39a12'}],u:'t',stack:1})))+Cd('Storage locations',T(['Zone','Location','Contents','Capacity','Used','Stock','Status'],s.table));}
 return TB(f.tabs)+b};
function plan(){const p=D.factories.plan,DC={ok:'#2fb86a',warn:'#e39a12',bad:'#d9382f'};
 const zs=p.zones.map(z=>{const [n,nm,sb,t,x,y,w,h,pg,tb,st,fn]=z,c=p.types[t][0];
  return `<g class="zn" onclick="go('${pg}',${tb})" data-tt="${esc(nm.replace('|',' '))}|${esc(fn)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="2"/><circle cx="${x+18}" cy="${y+18}" r="12" fill="${c}"/><text x="${x+18}" y="${y+22.5}" text-anchor="middle" class="zn1">${n}</text><circle cx="${x+w-15}" cy="${y+17}" r="6" fill="${DC[st]}" class="${st!='ok'?'blink':''}"/>${nm.split('|').map((l,i)=>`<text x="${x+11}" y="${y+54+i*16}" class="zt">${l}</text>`).join('')}<text x="${x+11}" y="${y+h-11}" class="zs">${sb}</text></g>`}).join('');
 return Cd('Factory site plan '+sub('– click a zone to open it'),`<svg viewBox="0 0 1000 490" width="100%" class="plan" role="img" aria-label="Factory site plan"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="arh"/></marker></defs><rect x="2" y="2" width="996" height="486" rx="12" class="pbg"/>${p.arrows.map(a=>`<polyline points="${a}" class="flow" marker-end="url(#ar)"/>`).join('')}${zs}</svg>
${legend(Object.values(p.types).map(t=>({n:t[1],c:t[0]})))}<p class="mut">Dots: <span style="color:#2fb86a">●</span> normal <span style="color:#e39a12">●</span> warning <span style="color:#d9382f">●</span> issue · moving dashes = product flow · schematic plan, replace with your real layout</p>`)+Cd('Zone list',T(['#','Zone','Type','Function'],[...p.zones].sort((a,b)=>a[0]-b[0]).map(z=>[z[0],z[1].replace('|',' '),`<span style="color:${p.types[z[3]][0]}">■</span> ${p.types[z[3]][1]}`,z[11]])))}

function rcalc(){const r=D.production.rice;E=+$('#e').value||0;Rc=Math.min(+$('#r').value||0,E);const p=E>0?Rc/E*100:0;
 $('#rr').textContent=E>0?N(p,1)+' %':'—';$('#rr2').textContent=E>0?N(p,1)+'%':'—';$('#un').textContent=tr(N(Math.max(r.waste-Rc,0),1)+' t');$('#ev').textContent=tr(N(E,1)+' t');$('#rv').textContent=tr(N(Rc,1)+' t');
 $('#rrg').style.strokeDashoffset=RC*(1-Math.min(p,100)/100);
 const w=r.waste;$('#s1').style.width=Rc/w*100+'%';$('#s2').style.width=Math.max(E-Rc,0)/w*100+'%';$('#s3').style.width=Math.max(w-E,0)/w*100+'%'}
P.production=()=>{const p=D.production;let b;
 if(tab==0){const r=p.rice,rr=Rc/E*100;
  b=K([{l:'Raw input',v:r.input+' t',s:'paddy',i:'box'},{l:'Finished rice',v:r.finished+' t',s:'yield 67.5%',i:'production',viz:{t:'ring',p:67.5}},{l:'Process waste',v:r.waste+' t',s:'4.2% of input',i:'leaf'},{l:'Recovery rate',v:`<span id="rr">${N(rr,1)} %</span>`,s:'recovered ÷ eligible',c:'up',i:'check'}])
  +R(Cd('Waste recovery – adjustable',`<div class="rcv"><div class="rcl"><label>Recoverable material (eligible) <b id="ev">${N(E,1)} t</b><input id="e" type="range" min="0" max="${r.waste}" step=".1" value="${E}" oninput="rcalc()"></label><label>Actual recovered output <b id="rv">${N(Rc,1)} t</b><input id="r" type="range" min="0" max="${r.waste}" step=".1" value="${Rc}" oninput="rcalc()"></label>
  <div class="stk"><i id="s1" style="width:${Rc/r.waste*100}%;background:var(--brand)" data-tt="Recovered"></i><i id="s2" style="width:${(E-Rc)/r.waste*100}%;background:var(--warn)" data-tt="Eligible, not recovered"></i><i id="s3" style="width:${(r.waste-E)/r.waste*100}%;background:var(--crit)" data-tt="Not eligible"></i></div>
  ${legend([{n:'Recovered',c:'var(--brand)'},{n:'Eligible, not recovered',c:'var(--warn)'},{n:'Not eligible',c:'var(--crit)'}])}<p>Unrecoverable waste: <b id="un">${N(r.waste-Rc,1)} t</b> of ${r.waste} t</p></div>
  <div class="rcr"><svg class="rg" viewBox="0 0 120 120" width="150" height="150"><circle cx="60" cy="60" r="52" class="rgb" stroke-width="12"/><circle id="rrg" cx="60" cy="60" r="52" class="rgf" stroke-width="12" stroke="var(--brand)" stroke-dasharray="${RC}" stroke-dashoffset="${RC*(1-rr/100)}" transform="rotate(-90 60 60)"/></svg><b id="rr2">${N(rr,1)}%</b><small>recovery rate</small></div></div>
  <small class="mut">Recovery Rate (%) = Recovered ÷ Eligible Recoverable Material × 100. Only material passing food-safety review is eligible; set the eligible amount to match your process.</small>`),Cd('Output by grade '+sub('(t)'),donut(r.grades.map((x,i)=>({n:x[0],v:x[1],c:PAL[i]})),{u:'t',cl:'finished rice'})))
  +Cd('Quality & rejects',T(['Batch','Product','Result','Finding'],r.quality));
 }else{const q=p.pasta;b=K(q.kpis)+R(Cd('Production by flavor – actual vs target',bars({l:q.flavors.l,s:[{n:'Actual',d:q.flavors.a,c:'var(--acc)'},{n:'Target',d:q.flavors.t,c:'var(--mut2)'}],u:'thousand packets'})),Cd('Ingredients & seasoning',T(['Item','Stock','Status'],q.ingredients)))+Cd('Batches',T(['Batch','Flavor','Packets','QC'],q.batches)+'<small class="mut">New flavors are added as rows in the product list – no layout change.</small>');}
 return TB(p.tabs)+b};

P.warehouses=()=>{const w=D.warehouses;
 return TB(null)+K(w.kpis)+R(Cd('Capacity by warehouse',tanks(w.tanks)+'<small class="mut">Dashed mark = 80% alert level</small>'),Cd('Shipments',T(['ID','Type','Qty','Status'],w.shipments)))
 +Cd('Stock levels '+sub('– cover = available ÷ reorder point'),T(['Item','On hand','Reserved','Available','Reorder pt','Status','Batch / expiry','Cover'],w.stock.map(r=>[...r.slice(0,7),`<span class="cov"><span class="pb"><i data-w="${Math.min(r[7]/2*100,100)}" style="background:${r[7]<.75?'var(--crit)':r[7]<1?'var(--warn)':'var(--brand)'}"></i></span><b>${N(r[7]*100)}%</b></span>`])))};

P.energy=()=>{const e=D.energy,pw=LV?LV.power:[];
 return TB(null,'DEMO DATA – no meter integration configured')+`<div class="c lvs"><span class="lvd"><i></i>Live demand</span><b data-lv="power">${pw.length?N(pw.at(-1)):'—'} kW</b><span class="lvsp" data-lv="powerspark">${pw.length>1?spark(pw,'var(--acc)',600,46):''}</span><small class="mut">simulated meter, updates every 3 s</small></div>`
 +K(e.kpis)+R(Cd('kWh by area today '+sub('(thousand kWh)'),donut(e.areas.map((x,i)=>({n:x[0],v:x[1],c:PAL[i]})),{u:'k kWh',center:'42.3 k',cl:'kWh today'})),Cd('Last 7 days vs target '+sub('(thousand kWh)'),bars({l:e.week.l,s:[{n:'Actual',d:e.week.a.map(x=>x),c:'var(--acc)'}],u:'thousand kWh',tgt:e.week.t})))
 +R(Cd('Energy intensity',gauge(e.intensity.v,e.intensity.t,e.intensity.max,'kWh/t')+T(['Time','Where','Finding','Level'],e.anomalies)),Cd('Saving opportunities',`<div class="svl">${e.savings.map((s,i)=>`<div class="svi"><span class="svn">${i+1}</span><span>${s[0]}<small>${s[1]}</small></span></div>`).join('')}</div>`))
 +note('Energy intensity = kWh ÷ finished tons (42,300 ÷ 148). Water per ton = m³ ÷ finished tons.')};

const selE=i=>{sel=i;render(true)};
const selGo=i=>{sel=i;refresh('maintenance-0');go('maintenance',0)};
P.maintenance=()=>{const m=D.maintenance;let b;
 if(tab==0){const e=m.equipment[sel],dc=e[8]*e[7]+e[9];b=K(m.kpis)+Cd('Equipment '+sub('– click a row'),T(['ID','Name','Status','MTBF h','MTTR h','Next PM','YTD cost EGP'],m.equipment.map(e=>[e[0],e[1],'@'+e[2],e[3],e[4],e[5],e[6]]),{click:'selE',sel}))
  +Cd('Machine detail – '+e[1],`<div class="md"><div><small>Status</small>${pill(e[2])}</div><div><small>MTBF</small><b>${N(e[3])} h</b><span class="pb"><i data-w="${e[3]/1500*100}" style="background:var(--brand)"></i></span></div><div><small>MTTR</small><b>${e[4]} h</b><span class="pb"><i data-w="${e[4]/5*100}" style="background:var(--warn)"></i></span></div><div><small>Downtime today</small><b>${e[8]} h</b></div><div><small>Downtime cost (est.)</small><b class="${dc?'dn':''}">EGP ${N(dc)}</b></div><div><small>Next PM</small><b>${e[5]}</b></div></div><small class="mut">Downtime cost = hours × lost contribution (EGP ${N(e[7])}/h, assumption) + direct costs (EGP ${N(e[9])}). MTBF = operating hours ÷ failures; MTTR = repair hours ÷ failures.</small>`);
 }else if(tab==1)b=R(Cd('Work orders',T(['WO','Machine','Type','Priority','Status','Labor h'],m.orders)),Cd('Spare parts '+sub('– stock vs minimum'),hbars(m.spares.map(s=>({n:s[0],v:s[1],max:Math.max(...m.spares.map(x=>x[1])),c:s[1]<s[2]?'var(--crit)':'var(--acc)',txt:`${s[1]}${s[1]<s[2]?' (low)':''}`,sub:`min ${s[2]}`})))));
 else{b=Cd('Next 14 days',`<div class="cal">${[...Array(14)].map((_,i)=>{const d=new Date(Date.now()+i*864e5),ev=m.calendar[i];return `<div class="cd${i==0?' td':''}${ev?' ev':''}"><small>${d.toLocaleDateString(LOC(),{weekday:'short'})}</small><b>${d.getDate()}</b>${ev?`<span class="pill" style="--c:var(--info)">${ev}</span>`:''}</div>`}).join('')}</div>`)}
 return TB(m.tabs)+b};

/* ----- fleet ----- */
const vlive=v=>LV&&LV.veh[v.id]?LV.veh[v.id]:{speed:0,fuel:v.fuel};
function vprog(v){if(v.route==null)return null;if(v.fixed!=null)return {p:v.fixed,dir:1};const t=(Date.now()/1000+skew)/v.leg_s+v.phase,m=t%2;return m<1?{p:m,dir:1}:{p:2-m,dir:-1}}
function vpos(v){const g=vprog(v);if(!g)return null;const r=D.locations.routes[v.route],a=site(r[0]),b=site(r[1]);return {x:MX(a[5])+(MX(b[5])-MX(a[5]))*g.p,y:MY(a[6])+(MY(b[6])-MY(a[6]))*g.p,...g,r,a,b}}
const vcol=v=>({'On route':'#0a9d55',Delayed:'#d9382f',Loading:'#e39a12',Idle:'#7b8791',Maintenance:'#2f7fd1'}[v.status]);
const selV=i=>{fv=i;refresh('fleet-1');if(cur==='fleet'&&tab===0)render(true);else{refresh('fleet-0');go('fleet',0)}};
function vdetail(v){const g=vpos(v),lv=vlive(v),km=g?g.r[3]:0,rem=g?(g.dir==1?1-g.p:g.p)*km:0,eta=lv.speed>0?rem/lv.speed*60:null;
 return `<div class="vd"><div class="vdh"><span class="vic" style="--c:${vcol(v)}">${ic('truck',26)}</span><div><b>${v.id}</b><small>${v.type} · ${v.cap} t · ${v.plate} · driver ${v.driver}</small></div>${pill(v.status)}</div>
${g?`<div class="vdr"><span>${g.dir==1?g.a[1]:g.b[1]}</span><span>${g.dir==1?g.b[1]:g.a[1]}</span><span class="vdl"><i style="width:${(g.dir==1?g.p:1-g.p)*100}%" data-lv="vprog:${v.id}"></i></span></div><small class="mut">${g.r[2]} · ${km} km leg${g.dir==-1?' · returning empty':''}</small>`:`<p class="mut">${v.note}</p>`}
<div class="vds"><div><small>Speed</small><b data-lv="spd:${v.id}">${lv.speed} km/h</b></div><div><small>ETA</small><b data-lv="eta:${v.id}">${eta!=null?N(eta)+' min':'—'}</b></div><div><small>Load</small><b>${v.load}%</b></div><div><small>Today</small><b>${v.km} km · ${v.trips} trips</b></div></div>
${mbar('Fuel',lv.fuel,lv.fuel<20?'var(--crit)':'var(--acc)',100)}${mbar('Load',v.load,'#2f7fd1',100)}
${v.note?`<p class="vnote">${ic('alert',16)} ${v.note}</p>`:''}<div class="vdf"><span>Service in <b>${N(Math.max(v.to_service,0))} km</b></span>${pill(v.svc)}</div></div>`}
P.fleet=()=>{const f=D.fleet,V=f.vehicles,s=f.sum;let b;
 if(tab==0){const v=V[fv];b=K(f.live_kpis)+`<div class="g two">`+Cd('Live fleet map '+sub('– trucks move in real time · click a truck'),egyptMap({hiRoute:v.route,trucks:1})+legend([{n:'On route',c:'#0a9d55'},{n:'Delayed',c:'#d9382f'},{n:'Loading',c:'#e39a12'},{n:'Parked / workshop',c:'#7b8791'}]))+Cd('Vehicle '+sub('– select below or on the map'),vdetail(v))+`</div>`
  +Cd('All vehicles',`<div class="vgr">${V.map((x,i)=>`<button class="vch${i==fv?' on':''}" style="--c:${vcol(x)}" onclick="selV(${i})"><span class="vcd"></span><b>${x.id}</b><small>${x.route!=null?'to '+site(D.locations.routes[x.route][1])[1].replace(' City','').split(' (')[0]:x.status}</small><span class="vsp" data-lv="spd:${x.id}">${vlive(x).speed} km/h</span></button>`).join('')}</div>`);
 }else if(tab==1){b=R(Cd('Fleet by status',donut(Object.entries(s.status).map(([k,n])=>({n:k,v:n,c:{'On route':'#0a9d55',Loading:'#e39a12',Delayed:'#d9382f',Idle:'#7b8791',Maintenance:'#2f7fd1'}[k]})),{u:'vehicles',center:String(s.size),cl:'vehicles'})),Cd('Fleet by type',hbars(['Trailer','Truck','Van'].map((t,i)=>{const n=V.filter(x=>x.type==t);return {n:t+'s',v:n.length,max:V.length,c:PAL[i],txt:`${n.length} · ${N(n.reduce((a,x)=>a+x.cap,0),1)} t capacity`}}))),'two2')
  +Cd('Vehicles '+sub('– live speed and fuel, click a row to see it on the map'),T(['ID','Type','Plate','Driver','Status','Route','Load','Fuel','Speed','Note'],V.map(x=>{const lv=vlive(x),r=x.route!=null?D.locations.routes[x.route]:null;return [x.id,`${x.type} ${x.cap} t`,x.plate,x.driver,'@'+x.status,r?`${site(r[0])[1].split(' ')[0]} → ${site(r[1])[1].split(' ')[0]}`:'—',`<span class="cov"><span class="pb"><i data-w="${x.load}" style="background:#2f7fd1"></i></span><b>${x.load}%</b></span>`,`<span class="cov"><span class="pb"><i data-w="${lv.fuel}" data-lv="fuelbar:${x.id}" style="background:${lv.fuel<20?'var(--crit)':'var(--acc)'}"></i></span><b data-lv="fuel:${x.id}">${N(lv.fuel)}%</b></span>`,`<b data-lv="spd:${x.id}">${lv.speed} km/h</b>`,x.note||'—']}),{click:'selV',sel:fv}));
 }else if(tab==2){const used=V.filter(x=>x.km>0),norm={Trailer:40,Truck:31,Van:15.5};
  b=K(f.fuel_kpis)+R(Cd('Consumption by vehicle '+sub('(L/100 km) vs type norm'),bars({l:used.map(x=>x.id),s:[{n:'Actual',d:used.map(x=>x.l100),c:'var(--acc)'},{n:'Type norm',d:used.map(x=>norm[x.type]),c:'var(--mut2)'}],u:'L/100 km'})),Cd(`Transport cost today – EGP ${N(f.transport_cost)}`,donut(s.costs.map((c,i)=>({n:c[0],v:c[1],c:PAL[i]})),{u:'EGP',center:'38.9 k',cl:'EGP today'})))
  +Cd('Fuel by vehicle',T(['Vehicle','Type','km today','Diesel L','L/100 km','Type norm','Diesel cost EGP'],used.map(x=>[x.id,x.type,x.km,x.fuel_l,x.l100,`${norm[x.type]}${x.l100>norm[x.type]?' <span class="dn">▲</span>':''}`,Math.round(x.fuel_l*f.diesel_price)])))+note(`Diesel price EGP ${f.diesel_price}/L (assumption). Cost per km = total transport cost ÷ km driven. Type norms are sample targets.`);
 }else{const drv=V.filter(x=>x.harsh+x.speeding>0),act=V.filter(x=>x.status!='Maintenance').sort((a,b)=>a.score-b.score);
  b=K(f.safety_kpis)+R(Cd('Driving events by driver',bars({l:drv.map(x=>x.driver),s:[{n:'Harsh braking',d:drv.map(x=>x.harsh),c:'var(--warn)'},{n:'Speeding',d:drv.map(x=>x.speeding),c:'var(--crit)'}],u:'events today',stack:1})),Cd('Driver safety score '+sub('– lowest first'),hbars(act.slice(0,7).map(x=>({n:x.driver,sub:x.id,v:x.score,max:100,c:x.score<85?'var(--crit)':x.score<90?'var(--warn)':'var(--brand)',txt:x.score+''})))))
  +Cd('Service schedule',T(['Vehicle','Type','Odometer km','Next service at','Remaining','Status'],[...V].sort((a,b)=>a.to_service-b.to_service).map(x=>[x.id,x.type,x.odo,x.service_at,`<span class="cov"><span class="pb"><i data-w="${Math.max(Math.min(x.to_service/10000*100,100),2)}" style="background:${x.svc=='OK'?'var(--brand)':x.svc=='Due soon'?'var(--warn)':'var(--info)'}"></i></span><b>${N(Math.max(x.to_service,0))} km</b></span>`,'@'+x.svc])))+note('Safety score = 100 minus penalties for harsh braking, speeding and long idling (telematics rule set, sample). Driver codes only – no personal data.');}
 return TB(f.tabs,'DEMO DATA – no telematics connection')+b};
let fleetT=0,fleetF=0;
function fleetLoop(now=performance.now()){const v=VIEWS['fleet-0'],g=v&&v.isConnected&&cur==='fleet'?$('.trk',v):null;if(!g){raf=0;return}
 raf=requestAnimationFrame(fleetLoop);if(now-fleetF<33)return;fleetF=now;
 const V=D.fleet.vehicles,slow=now-fleetT>1000;if(slow)fleetT=now;
 if(!g.firstChild)g.innerHTML=V.map((x,i)=>`<g class="trkm${i===fv?' on':''}${x.status=='Delayed'?' dl':''}" data-i="${i}" onclick="selV(${i})"><circle r="${i===fv?18:14}" fill="${vcol(x)}" stroke="#fff" stroke-width="2.5"/><path transform="translate(-7.2,-6.6) scale(.6)" d="M14 17.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10.5h3M15 17.5H9M19.5 17.5H22v-4.6l-4-5.4H14" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>${i===fv?`<text y="-25" text-anchor="middle" class="tkl">${x.id}</text>`:''}</g>`).join('');
 for(const m of g.children){const x=V[+m.dataset.i],q=vpos(x);if(!q){m.style.display='none';continue}
  m.setAttribute('transform',`translate(${q.x.toFixed(1)},${q.y.toFixed(1)})`);if(slow)m.dataset.tt=trTT(`${x.id} · ${x.status}|${vlive(x).speed} km/h · ${q.r[2]}`)}
 const pv=V[fv],pp=vpos(pv),bar=$(`[data-lv="vprog:${pv.id}"]`,v);if(pp&&bar)bar.style.width=(pp.dir==1?pp.p:1-pp.p)*100+'%'}

/* ----- supply chain ----- */
const setF=(k,v)=>{F[k]=+v;render(true)};
P.supply=()=>{const s=D.supply;let b;
 if(tab==0){b=K(s.kpis)+Cd('Shipments',T(['ID','Type','Qty t','Cost EGP','EGP/t','Status','Delay cause'],s.shipments.map(x=>[x[0],x[1],x[2],x[3],Math.round(x[3]/x[2]),x[4],x[5]])))
  +R(Cd('Supplier on-time delivery',`<div class="rad"><svg viewBox="0 0 220 220" width="220" height="220" aria-hidden="true">${s.suppliers.map((x,i)=>{const r=92-i*24,c=2*Math.PI*r;return `<circle cx="110" cy="110" r="${r}" class="rgb" stroke-width="16"/><circle cx="110" cy="110" r="${r}" fill="none" stroke-width="16" stroke-linecap="round" stroke="${PAL[i]}" stroke-dasharray="0 ${c}" data-da="${(x[1]/100*c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 110 110)" class="dns" style="transition-delay:${i*.15}s" data-tt="${x[0]}|${x[1]}% on time"/>`}).join('')}</svg><div class="dnl">${s.suppliers.map((x,i)=>`<div><i style="background:${PAL[i]}"></i><span>${x[0]}</span><b>${x[1]}%</b><small class="${x[1]<90?'dn':'up'}">${x[1]<90?'below 90%':'ok'}</small></div>`).join('')}</div></div>`),
  Cd('Delayed shipments',s.shipments.filter(x=>x[4]=='@Delayed').map(x=>`<button class="al" style="--c:var(--crit)" onclick="go('fleet',0)"><span class="sv"></span><span><span class="at">${x[0]} · ${x[1]} · ${x[2]} t</span><small>${x[5]} – tracked in Fleet Management</small></span><span class="xg">→</span></button>`).join('')));
 }else if(tab==1){const a=s.cost_a,bu=s.cost_b,vs=s.costs.map(x=>(x[1]-x[2])/x[2]*100),mxv=Math.max(...vs.map(Math.abs)),neg=vs.some(v=>v<0);
  b=K([{l:'Cost per ton',v:'EGP '+N(a),s:'actual, finished rice + pasta',i:'coin'},{l:'Budget',v:'EGP '+N(bu),s:'per ton',i:'report'},{l:'Variance',v:'+'+N((a-bu)/bu*100,1)+'%',s:'raw material is the main driver',c:'dn',i:'alert'}])
  +R(Cd('Variance vs budget by driver '+sub('(%)'),`<div class="dv${neg?'':' one'}">${s.costs.map((x,i)=>{const v=(x[1]-x[2])/x[2]*100;return `<div class="dvr" data-tt="${x[0]}|actual EGP ${N(x[1])} vs budget ${N(x[2])}|${v>0?'+':''}${N(v,1)}%"><span>${x[0]}</span><span class="dvt"><i class="${v>0?'pos':''}" data-w="${Math.abs(v)/mxv*(neg?50:100)}" style="transition-delay:${i*.05}s"></i></span><b class="${v>0?'dn':'mut'}">${v>0?'+':''}${N(v,1)}%</b></div>`}).join('')}</div>`),Cd('Actual vs budget '+sub('(EGP per ton)'),T(['Driver','Actual','Budget','Var %'],s.costs.map(x=>[x[0],x[1],x[2],N((x[1]-x[2])/x[2]*100,1)]))+'<small class="mut">Cost per ton = costs ÷ finished tons. Each cost counted once.</small>'));
 }else{let d=0,ii=0,tot=0;const rows=s.costs.map(x=>{const dr=x[1]*x[3]*F.fx/100,ir=x[1]*x[4]*F.loc/100+x[1]*x[5]*F.fuel/100;d+=dr;ii+=ir;tot+=x[1];return [x[0],x[1],Math.round(dr),Math.round(ir)]});
  b=`<div class="c fxp"><div class="fxr"><span><b>USD/EGP</b> ${s.usd_egp.toFixed(2)} <small class="mut">(sample – not live)</small></span><span class="seg">${[0,5,10,15].map(v=>`<button class="${F.fx==v?'on':''}" onclick="setF('fx',${v})">+${v}%</button>`).join('')}</span></div>
  <label class="sl2">Local supplier increase <b>${F.loc}%</b><input type="range" min="0" max="20" value="${F.loc}" oninput="this.previousElementSibling.textContent=this.value+'%'" onchange="setF('loc',this.value)"></label><label class="sl2">Fuel price increase <b>${F.fuel}%</b><input type="range" min="0" max="30" value="${F.fuel}" oninput="this.previousElementSibling.textContent=this.value+'%'" onchange="setF('fuel',this.value)"></label></div>`
  +K([{l:'Base cost / t',v:'EGP '+N(tot),i:'coin'},{l:'Direct FX effect',v:'+EGP '+N(d),s:'imported share × FX %',c:'dn',i:'trend'},{l:'Indirect effect',v:'+EGP '+N(ii),s:'local prices + fuel',c:'dn',i:'fuel'},{l:'New cost / t',v:'EGP '+N(tot+d+ii),s:'+'+N((d+ii)/tot*100,1)+'%',c:'dn',i:'gauge'}])
  +Cd('Sensitivity by driver '+sub('(EGP/t)'),T(['Driver','Base','Direct (FX)','Indirect'],rows)+'<small class="mut">Transport has no direct FX term; it changes only through the fuel share (35%) of its cost. Import shares are sample assumptions.</small>')}
 return TB(s.tabs)+b};

/* ----- locations ----- */
const selL=i=>{ls=i;render(true)};
P.locations=()=>{const L=D.locations;let b;
 if(tab==0){const z=L.sites[ls],pg=C.pages.find(p=>p.id==z[11]);
  b=K(L.kpis)+`<div class="g two">`+Cd('Locations map '+sub('– click a site'),egyptMap({sel:ls,click:'selL'})+legend(Object.values(L.types).map(t=>({n:t[1],c:t[0]})))+'<small class="mut">Moving dashes = product flow · schematic map, approximate positions</small>')
  +Cd('Site: '+z[1],`<p>${pill(L.types[z[4]][1])}</p>`.replace('var(--mut)',L.types[z[4]][0])+[['Governorate',z[2]],['Role',z[3]],['Contains',z[7]],['Throughput',z[8]],['Staff',z[9]],['Status',z[10]],['Road km from Cairo',z[13]?'≈ '+z[13]:'—']].map(r=>`<div class="st"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')+`<p><button class="btn" onclick="go('${z[11]}',${z[12]})">Open ${pg.name} →</button></p>`)+`</div>`
  +Cd('All locations '+sub('– click a row'),T(['#','Site','Governorate','Role','Type','Staff','Km from Cairo'],L.sites.map(l=>[l[0],l[1],l[2],l[3],`<span style="color:${L.types[l[4]][0]}">●</span> ${L.types[l[4]][1]}`,l[9],l[13]?'≈ '+l[13]:'—']),{click:'selL',sel:ls})+'<small class="mut">Sample assignment of roles, staff and volumes – confirm the real role of each site. Distances are approximate.</small>');
 }else{const rows=L.routes.map(r=>[site(r[0])[1]+' → '+site(r[1])[1],r[2],r[3],r[4],Math.round(r[3]*L.rate)]);
  b=K([{l:'Routes',v:String(L.routes.length),s:'active',i:'route'},{l:'Trips per day',v:String(L.routes.reduce((a,r)=>a+r[4],0)),s:'all routes',i:'truck'},{l:'Avg cost / t',v:'EGP '+N(L.routes.reduce((a,r)=>a+r[3],0)/L.routes.length*L.rate),s:`rate ${L.rate} EGP per t·km (assumption)`,i:'coin'}])
  +R(Cd('Cost per ton by route '+sub('(EGP)'),hbars(L.routes.map((r,i)=>({n:`${site(r[0])[1].split(' ')[0]} → ${site(r[1])[1].split(' ')[0]}`,sub:r[2],v:r[3]*L.rate,max:Math.max(...L.routes.map(x=>x[3]))*L.rate,c:PAL[i],txt:'EGP '+N(r[3]*L.rate)})))),Cd('Routes',T(['Route','Cargo','km','Trips/day','EGP/t'],rows)+'<small class="mut">Cost per ton = km × rate. Fuel price changes are simulated in Supply Chain & Costs.</small>'))}
 return TB(L.tabs)+b};

let rf='All',ri=0;
const RIC={'Daily production':'production','Weekly operations':'gauge','Monthly summary':'calendar',Inventory:'warehouse',Maintenance:'wrench',Energy:'energy',Fleet:'truck','Transport & cost':'route',Quality:'shield',Workforce:'users','Exchange-rate impact':'coin'};
const selR=i=>{ri=i;render(true)},setRF=f=>{rf=f;render(true)};
P.reports=()=>{const L=D.reports.list,vis=L.map((r,i)=>[r,i]).filter(([r])=>rf==='All'||r[1]===rf);if(vis.length&&!vis.some(x=>x[1]===ri))ri=vis[0][1];
 const r=L[ri],cnt={All:L.length};L.forEach(x=>cnt[x[1]]=(cnt[x[1]]||0)+1);
 const stamp=new Date().toLocaleString(LOC(),{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
 return `${TB(null,'DEMO DATA')}<div class="rpc"><section class="c rpl"><div class="rph"><h3>Report library</h3><span class="mut">${L.length} reports · built by app.py on demand</span></div>
<div class="rpf" role="tablist">${['All','Daily','Weekly','Monthly'].map(f=>`<button role="tab" class="${rf===f?'on':''}" onclick="setRF('${f}')">${f}<i>${cnt[f]||0}</i></button>`).join('')}</div>
<div class="rps">${vis.map(([x,i])=>`<button class="rpi${i===ri?' on':''}" onclick="selR(${i})"><span class="rpic">${ic(RIC[x[0]]||'report',19)}</span><span class="rpt"><b>${x[0]}</b><small>${x[2].map(m=>m[0]).join(' · ')}</small></span><span class="rpp p-${x[1].toLowerCase()}">${x[1]}</span></button>`).join('')}</div></section>
<section class="rpv"><div class="rpb2"><span class="rpn"><small>Preview</small><b>${r[0]}</b></span><span class="rpa"><a class="btn" href="/api/report?i=${ri}&fmt=pdf" download>${ic('download',16)} Download PDF</a><a class="btn ghost" href="/api/report?i=${ri}&fmt=csv" download>${ic('table',16)} CSV</a></span></div>
<div class="desk"><article class="paper" aria-label="${esc(r[0])} report preview"><div class="pp-h"><div><b>Al Doha Food Industries</b><small>Plant operations dashboard</small></div><div class="pp-lg"><img src="/static/images/schneider.png" alt="Schneider Electric"><i></i><img src="/static/images/aveva.png" alt="AVEVA"></div></div><div class="pp-bar"></div>
<small class="pp-k">${r[1].toUpperCase()} REPORT</small><h2>${r[0]}</h2><small class="pp-g">${tr('Generated')} ${stamp} | ${tr('DEMO DATA')}</small>
<table class="pp-t"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${r[2].map(m=>`<tr><td>${m[0]}</td><td><b>${m[1]}</b></td></tr>`).join('')}</tbody></table>
<footer class="pp-f"><span>Sample values for demonstration - not live plant data.</span><span>Page 1 of 1</span></footer></article></div></section></div>`};

/* ---------- shell ---------- */
const openNote=i=>{C.notes[i].r=1;nrender();refresh('overview-0');go(C.notes[i].pg)};
const lbOpen=()=>{$('#lb').classList.add('o');$('#lb img').classList.remove('z')};
function bindHero(){const h=$('#hero');if(!h||RM)return;const im=$('img',h);let r=null,q=0,mx=0,my=0;
 const set=()=>{q=0;im.style.transform=`translate(${(mx*-22).toFixed(1)}px,${(my*-16).toFixed(1)}px) scale(1.05)`};
 h.onpointerenter=()=>{r=h.getBoundingClientRect()};
 h.onpointermove=e=>{r=r||h.getBoundingClientRect();mx=(e.clientX-r.left)/r.width-.5;my=(e.clientY-r.top)/r.height-.5;if(!q)q=requestAnimationFrame(set)};
 h.onpointerleave=()=>{mx=my=0;r=null;if(!q)q=requestAnimationFrame(set)}}
function nav(){let g='',h='';C.pages.forEach(p=>{if(p.group!==g){g=p.group;h+=`<div class="ng t">${g}</div>`}const bd=C.badges[p.id];
 h+=`<button data-pg="${p.id}" style="--acc:${p.acc}" data-label="${p.name}"><span class="ni2">${ic(p.icon,19)}</span><span class="t">${p.name}</span>${bd&&bd[0]?`<span class="nb ${bd[1]}">${bd[0]}</span>`:''}</button>`});
 $('#nav').innerHTML=h;translateDOM($('#nav'));$$('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.pg,0))}
function nrender(){const n=C.notes.filter(x=>!x.r).length;$('#nc').textContent=n;$('#nc').style.display=n?'':'none';
 $('#np').innerHTML='<div class="ni" style="justify-content:space-between"><b>Notifications <small class="mut">(demo)</small></b><a href="#" id="mk">Mark all read</a></div>'+C.notes.map((x,i)=>`<div class="ni ${x.r?'r':''}" data-i="${i}"><span class="sv" style="background:${sevC[x.s]}"></span><div><div>${x.t}</div><small class="mut">${x.s} · ${x.m}</small></div></div>`).join('');
 translateDOM($('#np'));$('#mk').onclick=e=>{e.preventDefault();C.notes.forEach(x=>x.r=1);nrender();refresh('overview-0')};
 $$('.ni[data-i]').forEach(el=>el.onclick=()=>{$('#np').classList.remove('o');openNote(+el.dataset.i)})}
const closeNav=()=>$('#sb').classList.remove('m');
const VIEWS={};let UID=0,booted=false;
const inval=k=>{if(VIEWS[k]){VIEWS[k].remove();delete VIEWS[k]}};
const refresh=k=>{if(k===pk&&VIEWS[k])render(true);else inval(k)};
/* set every bar, ring, donut and tank to its final value on the detached view, so it opens fully drawn */
function settle(r){r.classList.add('still');
 $$('[data-w]',r).forEach(el=>el.style.width=el.dataset.w+'%');$$('[data-h]',r).forEach(el=>el.style.height=el.dataset.h+'%');
 $$('[data-p]',r).forEach(el=>el.style.strokeDashoffset=RC*(1-el.dataset.p/100));$$('[data-da]',r).forEach(el=>el.style.strokeDasharray=el.dataset.da)}
function build(p,t){const c0=cur,t0=tab;cur=p;tab=t;const el=document.createElement('div');el.className='pv';el.style.setProperty('--acc',C.pages.find(x=>x.id==p).acc);el.innerHTML=P[p]();cur=c0;tab=t0;translateDOM(el);
 if(booted)settle(el);return VIEWS[p+'-'+t]=el}
function bindView(v){bindHero();bindTrend();
 $$('[data-r]',v).forEach(b=>b.onclick=()=>{range=b.dataset.r;$$('[data-r]',v).forEach(x=>x.classList.toggle('on',x===b));const w=$('#chw',v);w.classList.remove('still');w.innerHTML=trend();translateDOM(w);fx(w,1);bindTrend()})}
function render(force){const p=C.pages.find(x=>x.id==cur);
 if(navOn)navOn.classList.remove('on');navOn=$(`#nav button[data-pg="${cur}"]`);navOn.classList.add('on');
 $('#ttl').textContent=tr(p.name);$('#crumb').textContent=tr(p.group);$('header').style.setProperty('--acc',p.acc);
 const k=cur+'-'+tab,sw=k!==pk;if(force)inval(k);
 const v=VIEWS[k]||build(cur,tab),pg=$('#pg');
 if(v.parentNode!==pg){const old=VIEWS[pk];if(old&&old!==v)old.remove();pg.appendChild(v)}
 pk=k;if(sw)scrollTo(0,0);
 if(!v._init){v._init=1;if(!booted){booted=true;fx(v,1)}bindView(v)}
 applyLive();if(k==='fleet-0'&&!raf)fleetLoop()}
let navOn=null;
/* build every other page while the browser is idle, so the first visit is instant */
function prebuild(){const q=[];C.pages.forEach(p=>{const n=D[p.id]&&D[p.id].tabs?D[p.id].tabs.length:1;for(let t=0;t<n;t++)q.push([p.id,t])});
 const idle=window.requestIdleCallback?f=>requestIdleCallback(f,{timeout:700}):f=>setTimeout(()=>f({timeRemaining:()=>8}),40);
 const step=dl=>{let n=0;while(q.length&&n++<1&&dl.timeRemaining()>=0){const [p,t]=q.shift();if(!VIEWS[p+'-'+t])build(p,t)}if(q.length)idle(step)};idle(step)}

/* ---------- live polling ---------- */
function applyLive(){if(!LV||!VIEWS[pk])return;$$('[data-lv]',VIEWS[pk]).forEach(el=>{const [k,id]=el.dataset.lv.split(/:(.*)/);
 if(k==='load'){el.textContent=LV.loads[id]+'%'}else if(k==='loadbar'){el.style.width=LV.loads[id]+'%'}
 else if(k==='power'){el.textContent=tr(N(LV.power.at(-1))+' kW')}else if(k==='powerspark'){el.innerHTML=spark(LV.power,'var(--acc)',600,46).replace('class="draw"','')}
 else if(LV.veh[id]){const v=LV.veh[id];if(k==='spd')el.textContent=tr(v.speed+' km/h');else if(k==='fuel')el.textContent=N(v.fuel)+'%';else if(k==='fuelbar')el.style.width=v.fuel+'%';
  else if(k==='eta'){const x=D.fleet.vehicles.find(q=>q.id==id),g=vpos(x);el.textContent=g&&v.speed>0?tr(N((g.dir==1?1-g.p:g.p)*g.r[3]/v.speed*60)+' min'):'—'}}})}
async function poll(){try{const r=await fetch('/api/live',{cache:'no-store'});LV=await r.json();skew=LV.now-Date.now()/1000;lastSync=Date.now();applyLive()}catch(e){}}
function syncTick(){const s=$('#sync'),ago=Math.round((Date.now()-lastSync)/1000),ok=lastSync&&ago<10;s.classList.toggle('off',!ok);$('span',s).textContent=tr(ok?`Live · synced ${ago}s ago`:'Server offline – showing last data')}

/* ---------- language switch ---------- */
let STATIC=null;
function staticText(){if(!STATIC){STATIC=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('#pg,#nav,#np,#tt,script')||!/[A-Za-z]/.test(n.nodeValue)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});let n;while((n=w.nextNode()))STATIC.push([n,n.nodeValue]);
  $$('[aria-label],img[alt]').forEach(el=>{if(!el.closest('#pg,#nav'))for(const a of ['aria-label','alt'])if(el.getAttribute(a))STATIC.push([el,el.getAttribute(a),a])})}
 STATIC.forEach(([n,v,a])=>a?n.setAttribute(a,tr(v)):n.nodeValue=tr(v))}
function applyDir(){const r=document.documentElement;r.lang=LANG;r.dir=LANG==='ar'?'rtl':'ltr';const b=$('#lng');b.textContent=LANG==='ar'?'EN':'ع';b.title=LANG==='ar'?'English':'العربية'}
async function setLang(l){if(l==='ar'&&!AR){try{AR=await (await fetch('/static/i18n/ar.json',{cache:'no-cache'})).json()}catch(e){return}}
 LANG=l;try{localStorage.setItem('lang',l)}catch(e){}TRC.clear();applyDir();staticText();
 if(!C)return;for(const k in VIEWS){VIEWS[k].remove();delete VIEWS[k]}pk='';nav();nrender();render();prebuild()}

/* ---------- boot ---------- */
async function init(){
 $('#mb').innerHTML=ic('menu',20);$('#bell').insertAdjacentHTML('afterbegin',ic('bell',19));$('#togi').innerHTML=ic('collapse',18);
 const thI=()=>{const r=document.documentElement,dk=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;$('#th').innerHTML=ic(dk?'sun':'moon',19)};thI();
 $('#th').onclick=()=>{const r=document.documentElement,dk=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;r.dataset.theme=dk?'light':'dark';try{localStorage.setItem('th',r.dataset.theme)}catch(e){}thI()};
 $('#tog').onclick=()=>$('#sb').classList.toggle('c');$('#mb').onclick=()=>$('#sb').classList.toggle('m');
 $('#bell').onclick=()=>$('#np').classList.toggle('o');
 $('#lng').onclick=()=>setLang(LANG==='ar'?'en':'ar');
 const tick=()=>{const d=new Date();$('#tm').textContent=d.toLocaleTimeString('en-GB');$('#dt').textContent=d.toLocaleDateString(LOC(),{weekday:'short',day:'2-digit',month:'short',year:'numeric'});syncTick()};tick();setInterval(tick,1000);
 $('#lb').onclick=e=>{const im=$('#lb img');if(e.target===im){const r=im.getBoundingClientRect();im.style.transformOrigin=`${(e.clientX-r.left)/r.width*100}% ${(e.clientY-r.top)/r.height*100}%`;im.classList.toggle('z')}else $('#lb').classList.remove('o')};
 addEventListener('keydown',e=>{if(e.key==='Escape'){$('#lb').classList.remove('o');$('#np').classList.remove('o')}});
 const tt=$('#tt');let ttEl=null,ttW=0,ttH=0;
 document.addEventListener('pointermove',e=>{const el=e.target.closest&&e.target.closest('[data-tt]');
  if(!el){if(ttEl){tt.classList.remove('o');ttEl=null}return}
  if(el!==ttEl||el.dataset.tt!==tt._s){ttEl=el;tt._s=el.dataset.tt;const [a,...rest]=tt._s.split('|');tt.innerHTML=`<b>${a}</b>${rest.map(x=>`<span>${x}</span>`).join('')}`;tt.classList.add('o');ttW=tt.offsetWidth;ttH=tt.offsetHeight}
  const x=Math.min(e.clientX+14,innerWidth-ttW-8),y=e.clientY+ttH+20>innerHeight?e.clientY-ttH-12:e.clientY+16;tt.style.transform=`translate(${x}px,${y}px)`},{passive:true});
 try{C=await (await fetch('/api/config',{cache:'no-store'})).json()}catch(e){$('#pg').innerHTML='<div class="boot">Could not reach the dashboard server. Start it with <code>python app.py</code>.</div>';return}
 D=C.data;if(LANG==='ar'){try{AR=await (await fetch('/static/i18n/ar.json',{cache:'no-cache'})).json()}catch(e){LANG='en'}}applyDir();staticText();await poll();$('#pg').innerHTML='';nav();nrender();render();prebuild();setInterval(poll,3000)}
init();
