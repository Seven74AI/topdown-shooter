// ================= PAGE =================
const cards=[];
/** Card: head, description, main canvas (aspect W:H), strip canvas, label row with switches (o.segs = [{key, opts:[[value,text],…]}]). */
function makeCard(parent,o){const a=document.createElement('article');a.className='card';
  const segs=(o.segs||[]).map((s,si)=>`<span class="seg" role="group" aria-label="${s.aria||s.key}">${s.opts.map(([v,t])=>`<button type="button" data-s="${si}" data-v="${v}" aria-pressed="${String(v===o[s.key])}">${t}</button>`).join('')}</span>`).join('');
  const ar=o.kind==='map'?`${o.V.w}/${o.V.h}`:`${o.W}/${o.H}`;
  a.innerHTML=`<div class="head"><span class="code">${o.id}</span><h3>${o.name}</h3>${o.tag?`<span class="tag">${o.tag}</span>`:''}</div><p class="desc">${o.desc}</p><div class="main"><canvas class="big${o.kind==='map'?' full':''}" style="aspect-ratio:${ar}" aria-label="${o.name}${o.kind==='map'?', the whole phone screen':', large drawing'}"></canvas></div>${o.noStrip?'':`<div class="strip"><canvas class="ig" aria-label="${o.name} at real size"></canvas>`}<div class="lbl"><span>${o.stripL||(o.kind==='map'?'real size · 48 px/m':'in-game size · 48 px/m')}</span>${segs}<span>${o.stripR||''}</span></div>${o.noStrip?'':'</div>'}`;
  parent.appendChild(a);o.el=a;o.cv=a.querySelector('canvas.big');o.sv=a.querySelector('canvas.ig');o.T=o.T||0;cards.push(o);
  a.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{const s=o.segs[+b.dataset.s];const raw=b.dataset.v;o[s.key]=isNaN(+raw)?raw:+raw;
    b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(s.on)s.on(o);drawCard(o);}));
  if(o.init)o.init(o);return o;}
function mapViews(o,which){const V=o.V;
  if(which==='main'){const W=Math.max(300,Math.round(o.cv.clientWidth||1150)),H=Math.round(W*V.h/V.w);const k=W*DPR/V.w;return{W,H,v:{k,ox:-V.x0*k,oy:-V.y0*k}};}
  const W=Math.max(300,Math.round(o.sv.clientWidth||560)),H=o.stripH||300,k=DEV;let ox=W*DPR/2-o.focus[0]*k,oy=H*DPR/2-o.focus[1]*k;
  ox=clamp(ox,W*DPR-(V.x0+V.w)*k,-V.x0*k);oy=clamp(oy,H*DPR-(V.y0+V.h)*k,-V.y0*k);return{W,H,v:{k,ox,oy}};}
function drawCard(o){
  if(o.kind==='map'){
    {const{W,H,v}=mapViews(o,'main');const c=prep(o.cv,W,H);c.fillStyle='#050608';c.fillRect(0,0,W*DPR,H*DPR);o.scene(c,o,v,W,H,'main');resetCtx(c);if(o.overlay)o.overlay(c,o,v,W,H,'main');}
    if(o.sv){const{W,H,v}=mapViews(o,'strip');const c=prep(o.sv,W,H);c.fillStyle='#050608';c.fillRect(0,0,W*DPR,H*DPR);o.scene(c,o,v,W,H,'strip');resetCtx(c);if(o.overlay)o.overlay(c,o,v,W,H,'strip');scaleBar(c,W-62,H-8);}
  }else{o.drawMain(o);if(o.sv)o.drawStrip(o);}}
function addRec(id,html){document.getElementById('rec-'+id).innerHTML=html;}
function build(){
  GRAIN=makeGrain();AGG=makeAgg();buildFx();buildE6();
  const REC_RU='RU1',sec=id=>document.getElementById(id);
  RUS.forEach((F,i)=>makeCard(sec('ru'),{...makeRuinsCard(F,i),tag:F.id===REC_RU?'recommended':''}));
  if(typeof buildSections==='function')buildSections(sec);
  addRec('ru','<b>Recommended: RU1</b> concrete and rebar (base), with <b>RU4</b> fire-gutted as the look for endless waves. RU1 stays grey like the street, so the piles read as solid cover without stealing attention from zombies; the rebar and the caved-in diner corner say “building came down” at 48 px/m. RU2’s red bricks are pretty but warm up the whole palette; RU3 reads best as cover but looks the least like a ruin.');
  const draw=drawCard;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches||QS.has('static');
  STATIC=reduce&&FREEZE==null;
  const runTo=(o,t)=>{if(!o.step)return;const dt=1/30;let n=Math.round(t/dt);while(n-->0)o.step(o,dt);};
  let rt;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>cards.forEach(o=>{if(!o.anim||STATIC||FREEZE!=null||!o.vis)draw(o);}),120);});
  if(reduce||FREEZE!=null){for(const o of cards){runTo(o,FREEZE!=null?FREEZE:(o.still||0));draw(o);}return;}
  const io=new IntersectionObserver(es=>es.forEach(e=>{const o=cards.find(q=>q.el===e.target);if(!o)return;o.vis=e.isIntersecting;if(o.vis&&!o.drawn){o.drawn=true;draw(o);}}),{rootMargin:'200px'});cards.forEach(o=>{o.vis=false;io.observe(o.el);});
  let last=performance.now();const loop=now=>{requestAnimationFrame(loop);const dt=Math.min(0.05,(now-last)/1000);if(dt<1/40)return;last=now;for(const o of cards)if(o.anim&&o.vis){o.step(o,dt);draw(o);}};requestAnimationFrame(loop);
}
function buildE6(){buildRD();}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(build);else build();
