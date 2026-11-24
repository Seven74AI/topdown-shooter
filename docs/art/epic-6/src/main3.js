// ================= THE BEHEMOTH (game style; metres, facing +x, r = 2 m) =================
const BH_R=2;
const BHS=[
  {id:'BH1',name:'The prototype, shaded',look:'proto',skin:'#6a7360',desc:'The prototype as it is: a hunched grey-green back between two huge shoulders, a torn dark shirt, the spine showing through a rip, three rusty rebar rods stuck in its back, stitches and pustules. Drawn with the Brute’s lit parts and skin texture.'},
  {id:'BH2',name:'The site worker',look:'worker',skin:'#6f705f',desc:'What it was before: a construction worker swollen to 4 m, a shredded hi-vis vest stretched over the back (reflective stripes catch every light: readable in the blackout), a cracked yellow hard hat grown into the skull, rebar and a dragged chain.'},
  {id:'BH3',name:'The overgrowth',look:'growth',skin:'#5f6a58',desc:'No clothes left: tumour plates and bulging growths cover the back, a ridge of bone spurs runs down the spine, glowing yellow-green pustules (the Bloater’s colour) mark it as the end of the infection.'},
  {id:'BH4',name:'The riot cop',look:'riot',skin:'#66705e',desc:'A riot officer’s back plate and shoulder pads fused into the flesh, stencilled POLICE, cuffs and a broken chain on one wrist. Dark armour with grey flesh bulging around it: the most “boss” silhouette, darkest of the four.'},
];
const BH_POSES=[['walk',2.0],['slam',1.2],['slamHit',0.5],['charge',1.0],['rush',0.6],['stun',2.0],['throw',1.0],['roar',1.5],['walkE',1.8]];
const BH_CYCLE=BH_POSES.reduce((a,p)=>a+p[1],0);
function bhPoseAt(t){t%=BH_CYCLE;for(const[p,d]of BH_POSES){if(t<d)return{pose:p,k:t/d,t};t-=d;}return{pose:'walk',k:0,t:0};}
const POSE_TXT={walk:'walk',slam:'slam wind-up · 1.2 s',slamHit:'slam!',charge:'charge tell · 1.0 s',rush:'rush · 12 m/s',stun:'crash stun · 2 s',throw:'throw lift · 1.0 s',roar:'enrage roar · 1.5 s',walkE:'enraged walk'};
function bhLump(c,x,y,rx,ry,col,seed,hi){part(c,q=>blobPath(q,x,y,rx,ry,seed,0.06,40),{base:col,lit:'radial',box:[x-rx,y-ry,x+rx,y+ry],tex:skinTex(seed,0.8),hi:hi??0.32,lo:0.6,rim:0.3,inner:0.35,line:1.6});}
function bhRebar(c,x1,y1,x2,y2){strokeP(c,q=>{q.moveTo(x1,y1);q.lineTo(x2,y2);},'#140d09',0.11);strokeP(c,q=>{q.moveTo(x1,y1);q.lineTo(x2,y2);},'#86492a',0.06);
  c.save();c.translate(-0.012,-0.015);strokeP(c,q=>{q.moveTo(x1,y1);q.lineTo(x2,y2);},'rgba(230,170,130,0.35)',0.018);c.restore();
  for(let i=1;i<6;i++){const t=i/6;strokeP(c,q=>{const x=lerp(x1,x2,t),y=lerp(y1,y2,t);q.moveTo(x-0.03,y-0.03);q.lineTo(x+0.03,y+0.03);},'rgba(20,12,8,0.7)',0.012);}}
/** The Behemoth, pose ∈ walk|slam|slamHit|charge|rush|throw|stun|roar; k = pose progress; ph = walk phase (0–1). */
function drawBehemothG(c,r,pose,k,look,enr,ph){
  const L0=BHS.find(b=>b.look===look);const skin=enr?shade(L0.skin,0.06).replace('rgb','rgb'):L0.skin;const skinC=enr?'#7d6a5e':L0.skin;
  const sh=0.12*r,sy=0.82*r;let A,B,headX=0.62*r,headY=0,swell=1,torsoX=0;
  const sw=Math.sin(ph*TAU)*0.16*r;const wL=[0.95*r+sw,-0.98*r,0.33*r],wR=[0.95*r-sw,0.98*r,0.33*r];
  if(pose==='slam'){const e=Math.min(1,k*1.6);swell=1+0.07*e;A=[lerp(wL[0],0.2*r,e),lerp(wL[1],-0.34*r,e),lerp(0.33,0.44,e)*r];B=[lerp(wR[0],0.2*r,e),lerp(wR[1],0.34*r,e),lerp(0.33,0.44,e)*r];}
  else if(pose==='slamHit'){A=[1.12*r,-0.5*r,0.36*r];B=[1.12*r,0.5*r,0.36*r];headX=0.7*r;}
  else if(pose==='charge'||pose==='rush'){const e=pose==='rush'?1:Math.min(1,k*2);headX=lerp(0.62,0.9,e)*r;torsoX=0.1*r*e;A=[lerp(wL[0],-0.3*r,e),lerp(wL[1],-1.08*r,e),0.33*r];B=[lerp(wR[0],-0.3*r,e),lerp(wR[1],1.08*r,e),0.33*r];}
  else if(pose==='throw'){const e=Math.min(1,k*1.8);A=[0.9*r,-0.95*r,0.33*r];B=[lerp(wR[0],-0.15*r,e),lerp(wR[1],0.15*r,e),lerp(0.33,0.42,e)*r];}
  else if(pose==='stun'){A=[0.3*r,-1.28*r,0.32*r];B=[0.42*r,1.25*r,0.32*r];headX=0.55*r;headY=0.22*r;}
  else if(pose==='roar'){A=[0.45*r,-1.32*r,0.35*r];B=[0.45*r,1.32*r,0.35*r];headX=0.5*r;swell=1.08;}
  else{A=wL;B=wR;}
  const raised=pose==='slam'||pose==='throw';
  castShadow(c,q=>{q.beginPath();E(q,-0.08*r,0,r*0.8,r*0.92);q.fill();},0.18,0.26,0.18,0.42);
  const arms=()=>{for(const[F,s]of[[A,-1],[B,1]]){const ex=(sh+F[0])/2-0.12*r,ey=(s*sy+F[1])/2+s*0.1*r;
      drawLimb(c,[sh,s*sy,ex,ey,F[0],F[1]],[0.5*r,0.44*r,0.38*r],skinC,51+s*7,{knobs:false,line:1.6});
      if(look==='riot'&&s<0){fillP(c,q=>E(q,lerp(ex,F[0],0.7),lerp(ey,F[1],0.7),0.2*r,0.24*r),'#1d1f22');strokeP(c,q=>E(q,lerp(ex,F[0],0.7),lerp(ey,F[1],0.7),0.2*r,0.24*r),'#8a8d92',0.04);}
      fist(c,F[0],F[1],Math.atan2(F[1]-ey,F[0]-ex),F[2],skinC,61+s*5,raised?1:0);}};
  if(!raised)arms();
  c.save();c.translate(torsoX,0);c.scale(swell,swell);
  // the back mass and the two shoulder masses
  bhLump(c,-0.2*r,0,0.68*r,0.82*r,skinC,71,0.28);for(const s of[-1,1])bhLump(c,0.14*r,s*0.6*r,0.44*r,0.4*r,skinC,73+s,0.34);
  if(look==='proto'||look==='worker'){
    const torn=q=>{for(let i=0;i<=48;i++){const a=i/48*TAU;const j=1+0.16*Math.sin(a*7+1.3)*(Math.cos(a)<0.2?1:0.3)+0.05*Math.sin(a*19);const x=-0.28*r+Math.cos(a)*0.56*r*j,y=Math.sin(a)*0.67*r*j;i?q.lineTo(x,y):q.moveTo(x,y);}q.closePath();};
    const col=look==='worker'?'#d2861c':'#2a2f37';
    part(c,torn,{base:col,lit:'radial',box:[-0.9*r,-0.7*r,0.3*r,0.7*r],tex:clothTex(81,look==='worker'?'60,40,10':'60,30,20'),hi:0.3,lo:0.55,rim:0.25,inner:0.3,line:1.4});
    if(look==='worker'){c.save();c.beginPath();torn(c);c.clip();for(const yy of[-0.42,0.42]){fillP(c,q=>R(q,-0.95*r,yy*r-0.05*r,1.2*r,0.1*r),'#c8ccd0');fillP(c,q=>R(q,-0.95*r,yy*r-0.05*r,1.2*r,0.03*r),'rgba(255,255,255,0.5)');}
      fillP(c,q=>R(q,-0.62*r,-0.7*r,0.1*r,1.4*r),'#c8ccd0');c.restore();}
    // the rip down the spine: skin and vertebrae
    part(c,q=>blobPath(q,-0.36*r,0,0.44*r,0.12*r,83,0.25,30),{base:shade(skinC,-0.08),lit:'top',box:[-0.8*r,-0.12*r,0.1*r,0.12*r],tex:skinTex(83,1),hi:0.2,lo:0.5,rim:0.2,line:1.3});
    for(let i=0;i<6;i++){const x=-0.72*r+i*0.135*r;part(c,q=>E(q,x,0,0.05*r,0.065*r),{base:'#a39b85',lit:'radial',box:[x-0.05*r,-0.065*r,x+0.05*r,0.065*r],hi:0.4,lo:0.4,rim:0.2,line:1});}
  }
  if(look==='growth'){const rr_=mulberry(91);for(let i=0;i<9;i++){const x=(-0.75+rr_()*0.9)*r,y=(rr_()-0.5)*1.3*r,s=(0.14+rr_()*0.16)*r;bhLump(c,x,y,s,s*0.85,shade(skinC,(rr_()-0.5)*0.25),95+i,0.4);}
    for(let i=0;i<7;i++){const x=(-0.85+i*0.16)*r;part(c,q=>Pg(q,[x-0.06*r,-0.05*r,x+0.1*r,0,x-0.06*r,0.05*r]),{base:'#d8d0b8',lit:'top',box:[x-0.06*r,-0.05*r,x+0.1*r,0.05*r],hi:0.4,lo:0.4,rim:0.3,line:1});}
    for(let i=0;i<8;i++){const x=(-0.6+rr_()*0.8)*r,y=(rr_()-0.5)*1.4*r;glow(c,x,y,0.16*r,'190,220,90',0.35);part(c,q=>E(q,x,y,0.045*r,0.04*r),{base:'#b8c95a',lit:'radial',box:[x-0.05*r,y-0.05*r,x+0.05*r,y+0.05*r],hi:0.6,lo:0.3,rim:0.3,line:0.9});}}
  if(look==='riot'){const plate=q=>R(q,-0.86*r,-0.52*r,0.86*r,1.04*r,0.18*r);part(c,plate,{base:'#1f2226',lit:'top',box:[-0.86*r,-0.52*r,0,0.52*r],tex:polyTex(97,true),hi:0.35,lo:0.5,rim:0.35,line:1.6});
    c.save();c.translate(-0.43*r,0);c.rotate(-Math.PI/2);c.fillStyle='rgba(220,222,226,0.55)';c.font=`700 ${0.2*r}px Oswald, Impact, sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('POLICE',0,0);c.restore();
    for(const s of[-1,1])part(c,q=>blobPath(q,0.14*r,s*0.62*r,0.32*r,0.28*r,99+s,0.05,30),{base:'#2a2d32',lit:'radial',box:[-0.2*r,s*0.62*r-0.3*r,0.46*r,s*0.62*r+0.3*r],tex:polyTex(98),hi:0.45,lo:0.5,rim:0.4,line:1.4});
    for(let i=0;i<6;i++)rivet(c,-0.78*r+i*0.14*r,s_(i)*0.46*r,0.03*r,'#7d8086');}
  if(look!=='growth'){bhRebar(c,-0.45*r,-0.42*r,-0.95*r,-0.72*r);bhRebar(c,-0.2*r,0.45*r,-0.66*r,0.92*r);if(look!=='riot')bhRebar(c,-0.62*r,0.16*r,-1.15*r,0.28*r);}
  if(look==='worker'||look==='riot'){const pts=[];for(let i=0;i<9;i++)pts.push([-0.7*r-i*0.13*r,0.6*r+Math.sin(i*1.3)*0.08*r]);for(const[x,y]of pts){strokeP(c,q=>E(q,x,y,0.07*r,0.04*r),'#0d0d0e',0.05);strokeP(c,q=>E(q,x,y,0.07*r,0.04*r),'#7c7f84',0.025);}}
  wound(c,0.2*r,-0.62*r,0.12*r,101);if(look!=='riot')wound(c,0.05*r,0.75*r,0.09*r,103);
  strokeP(c,q=>{q.moveTo(0.34*r,0.42*r);q.lineTo(0,0.78*r);},'#1a1210',0.03);
  if(enr){c.save();c.globalCompositeOperation='lighter';for(let i=0;i<9;i++){let x=(hash(i+9)*0.7-0.3)*r,y=(hash(i*5+2)-0.5)*1.5*r;const pts=[x,y];for(let j=0;j<5;j++){x+=(hash(i*13+j)-0.5)*0.32*r;y+=(hash(i*17+j*3)-0.5)*0.32*r;pts.push(x,y);}
      strokeP(c,q=>{q.moveTo(pts[0],pts[1]);for(let j=2;j<pts.length;j+=2)q.lineTo(pts[j],pts[j+1]);},'rgba(255,70,40,0.55)',0.05);}c.restore();}
  c.restore();
  if(raised)arms();
  if(pose==='throw'){const e=Math.min(1,k*1.8),cx=lerp(0.9*r,-0.05*r,e),cy=lerp(0.9*r,0.05*r,e),s=lerp(0.6,1.0,e);c.save();c.translate(cx,cy);c.rotate(0.4);c.scale(s,s);throwChunk(c,0);c.restore();}
  // head
  c.save();c.translate(headX,headY);
  part(c,q=>E(q,0,0,0.27*r,0.25*r),{base:shade(skinC,-0.04),lit:'radial',box:[-0.27*r,-0.25*r,0.27*r,0.25*r],tex:skinTex(111,1.3),hi:0.4,lo:0.55,rim:0.3,line:1.5});
  if(look==='worker'){part(c,q=>{q.ellipse(-0.04*r,0,0.25*r,0.26*r,0,Math.PI*0.62,Math.PI*1.38);q.closePath();},{base:'#d9b21f',lit:'radial',box:[-0.29*r,-0.26*r,0.05*r,0.26*r],hi:0.5,lo:0.45,rim:0.35,line:1.3});strokeP(c,q=>{q.moveTo(-0.2*r,-0.1*r);q.lineTo(-0.1*r,0.02*r);q.lineTo(-0.18*r,0.12*r);},'#2a2208',0.025);}
  fillP(c,q=>E(q,0.08*r,0,0.08*r,0.2*r),shade(skinC,-0.38));
  if(pose==='roar')fillP(c,q=>E(q,0.19*r,0,0.1*r,0.12*r),'#1a0606');
  const eye=enr?'255,74,46':'240,214,106';for(const s of[-1,1]){glow(c,0.16*r,s*0.08*r,0.12*r,eye,enr?0.7:0.4);fillP(c,q=>E(q,0.16*r,s*0.08*r,0.035*r,0.035*r),`rgb(${eye})`);}
  c.restore();}
function s_(i){return i%2?1:-1;}
function throwChunk(c,src){const col=src?'#2a2522':'#6a675f';part(c,q=>Pg(q,[-0.7,-0.5,0.6,-0.65,0.8,0.3,0.1,0.7,-0.75,0.35]),{base:col,lit:'top',box:[-0.75,-0.65,0.8,0.7],tex:polyTex(121),hi:0.35,lo:0.5,rim:0.35,line:1.4});
  strokeP(c,q=>{q.moveTo(-0.2,-0.5);q.lineTo(-0.5,-0.95);q.moveTo(0.3,0.4);q.lineTo(0.55,0.85);},'#7d4527',0.05);
  strokeP(c,q=>{q.moveTo(-0.4,-0.2);q.lineTo(0.1,0.05);q.lineTo(0.35,-0.3);},'rgba(0,0,0,0.5)',0.03);}
// LRU of baked poses (drawing a textured boss every frame is expensive)
const BHB=new Map();
function bhBake(look,pose,k,enr,ph,ppm){const kq=pose==='walk'||pose==='walkE'?Math.floor(ph*6)%6:pose==='stun'||pose==='rush'||pose==='slamHit'?0:Math.round(k*5);
  const key=`${look}|${pose}|${kq}|${enr?1:0}|${ppm}`;if(BHB.has(key)){const v=BHB.get(key);BHB.delete(key);BHB.set(key,v);return v;}
  const S=Math.ceil(2*3.9*ppm*DPR),cv=mk(S,S),c=cv.getContext('2d');c.setTransform(ppm*DPR,0,0,ppm*DPR,S/2,S/2);const p0=P;P=1/ppm;
  const pp=pose==='walkE'?'walk':pose;drawBehemothG(c,BH_R,pp,pose==='walk'||pose==='walkE'?0:kq/5,look,enr,kq/6);P=p0;
  BHB.set(key,cv);if(BHB.size>70)BHB.delete(BHB.keys().next().value);return cv;}
/** draw the boss at world (x,y) facing f in view v */
function bossAt(c,v,x,y,f,look,pose,k,enr,ph,T){const ppm=72;const img=bhBake(look,pose,k,enr,ph,ppm);const s=v.k/(ppm*DPR);c.setTransform(Math.cos(f)*s,Math.sin(f)*s,-Math.sin(f)*s,Math.cos(f)*s,v.ox+x*v.k,v.oy+y*v.k);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.drawImage(img,-img.width/2,-img.height/2);
  if(pose==='stun'){setW(c,v);for(let i=0;i<4;i++){const a=T*4+i*TAU/4,hx=x+Math.cos(f)*1.1,hy=y+Math.sin(f)*1.1;c.fillStyle='#ffe07a';c.beginPath();c.arc(hx+Math.cos(a)*0.55,hy+Math.sin(a)*0.42,0.08,0,TAU);c.fill();}}resetCtx(c);}

// ---- cards: big pose cycle + real-size strip ----
function renderBHMain(o){const W=o.W,H=o.H,c=prep(o.cv,W,H);if(!o.bg)o.bg=bgAsphalt(W,H,o.seed,{puddles:2,cracks:3});c.drawImage(o.bg,0,0);
  const st=bhPoseAt(o.T),enr=st.pose==='roar'||st.pose==='walkE';const k=56,v={k:k*DPR,ox:250*DPR,oy:H/2*DPR};
  if(st.pose==='roar'){const u=st.k;ringLine(c,v,0,0,lerp(1.5,5,Math.min(1,u*2)),'rgba(255,90,60,1)',0.5*(1-u),3);resetCtx(c);}
  bossAt(c,v,0,0,0,o.F.look,st.pose,st.k,enr,(o.T*0.9)%1,o.T);
  panel(c,W-188,16,172,H-32);label(c,W-176,40,POSE_TXT[st.pose],'#ffd2a0','left');
  BH_POSES.forEach(([p],i)=>label(c,W-176,62+i*16,(p===st.pose?'▸ ':'  ')+POSE_TXT[p].split(' ·')[0],p===st.pose?'rgba(255,236,200,0.95)':'rgba(230,228,220,0.45)','left'));
  label(c,W-176,H-28,'radius 2 m · 6,000 HP (4 p)','rgba(230,228,220,0.55)','left');scaleBar(c,18,H-12,k);}
function renderBHStrip(o){const W=Math.max(300,Math.round(o.sv.clientWidth||540)),H=250,c=prep(o.sv,W,H);
  if(!o.bg2||o.bg2w!==W){o.bg2=bgAsphalt(W,H,o.seed+90,{puddles:0,agg:0.5,cracks:2,vig:0.35});o.bg2w=W;}c.drawImage(o.bg2,0,0);
  const st=bhPoseAt(o.T),enr=st.pose==='roar'||st.pose==='walkE',k=PPM,v={k:k*DPR,ox:(W/2-40)*DPR,oy:H/2*DPR};
  bossAt(c,v,0,0,0,o.F.look,st.pose,st.k,enr,(o.T*0.9)%1,o.T);
  survAt(c,v,4.2,0.6,Math.PI+0.15);walkerAt(c,v,-3.4,-1.6,0.3,1);walkerAt(c,v,-3.2,1.9,-0.2,2);
  label(c,W/2-40+4.2*k,H/2+0.6*k+30,'survivor');label(c,W/2-40-3.4*k,H/2-1.6*k-16,'Walker');scaleBar(c,W-62,H-8);}

// ---- tells on the real map (stage 5 intersection, scripted 14 s loop) ----
const BT_V={x0:12,y0:9.25,w:VW,h:VH};
const BT_LOOP=15;
function hatch(c,path,alpha){c.save();path();c.clip();c.fillStyle=`rgba(255,40,48,${0.16*alpha})`;c.fillRect(-100,-100,300,300);c.strokeStyle=`rgba(255,255,255,${0.22*alpha})`;c.lineWidth=0.09;c.beginPath();for(let i=-80;i<120;i+=0.55){c.moveTo(i,-60);c.lineTo(i+90,30);}c.stroke();c.restore();}
function teleRing(c,v,x,y,R,k,inner){setW(c,v);hatch(c,()=>{c.beginPath();c.arc(x,y,R,0,TAU);},1);c.fillStyle='rgba(255,40,40,0.38)';c.beginPath();c.arc(x,y,R*k,0,TAU);c.fill();
  c.lineWidth=0.12;c.strokeStyle='#ff3b3b';c.beginPath();c.arc(x,y,R,0,TAU);c.stroke();c.setLineDash([0.4,0.3]);c.lineWidth=0.05;c.strokeStyle='rgba(255,255,255,0.9)';c.beginPath();c.arc(x,y,R-0.06,0,TAU);c.stroke();c.setLineDash([]);
  if(inner){c.strokeStyle='rgba(255,255,255,0.85)';c.lineWidth=0.06;c.beginPath();c.arc(x,y,Math.max(0.2,R*(1-k)),0,TAU);c.stroke();}resetCtx(c);}
function teleLane(c,v,x,y,ang,len,Rw,k,crash){setW(c,v);c.translate(x,y);c.rotate(ang);hatch(c,()=>{c.beginPath();c.rect(0,-Rw,len,Rw*2);},1);
  c.fillStyle='rgba(255,40,40,0.34)';c.fillRect(0,-Rw,len*k,Rw*2);c.strokeStyle='#ff3b3b';c.lineWidth=0.12;c.strokeRect(0,-Rw,len,Rw*2);c.setLineDash([0.4,0.3]);c.strokeStyle='rgba(255,255,255,0.9)';c.lineWidth=0.05;c.strokeRect(0.06,-Rw+0.06,len-0.12,Rw*2-0.12);c.setLineDash([]);
  c.fillStyle='rgba(255,255,255,0.55)';for(let a=1.5;a<len-0.5;a+=1.6){c.beginPath();c.moveTo(a+0.5,0);c.lineTo(a-0.1,-0.45);c.lineTo(a-0.1,0.45);c.closePath();c.fill();}
  if(crash){c.strokeStyle='#f2b448';c.lineWidth=0.14;c.beginPath();c.moveTo(len-0.1,-Rw);c.lineTo(len-0.1,Rw);c.stroke();c.fillStyle='#f2b448';c.font='700 0.62px Oswald, sans-serif';c.textAlign='right';c.fillText('CRASH',len-0.3,-Rw-0.22);}
  resetCtx(c);}
function skull(c,v,x,y,s,col){setW(c,v);c.translate(x,y);c.scale(s,s);c.fillStyle=col;c.beginPath();c.arc(0,-0.08,0.32,0,TAU);c.fill();c.fillRect(-0.18,0.1,0.36,0.2);c.fillStyle='#16090a';c.beginPath();c.arc(-0.12,-0.08,0.09,0,TAU);c.arc(0.12,-0.08,0.09,0,TAU);c.fill();c.fillRect(-0.03,0.04,0.06,0.08);resetCtx(c);}
// the script: boss keys [t,x,y,face], players keys, attack windows
const BT_BOSS=[[0,16.6,15.6,0],[2,18.4,15.6,0],[3.8,18.4,15.6,0],[4.6,18.4,15.75,0],[5.6,18.4,15.75,0],[6.3,28,15.75,0],[8.6,28,15.75,0],[9.2,27.2,15.9,Math.PI*0.86],[11.6,27.2,15.9,Math.PI*0.86],[13.4,25.4,16.4,Math.PI],[15,16.6,15.6,0]];
const BT_P=[ // you (blue): in the lane, steps out; (orange) close for the slam, runs out; (green) far, gets the throw
  [[0,24.6,15.8],[4.6,24.6,15.8],[5.4,24.8,19.2],[8.8,24.8,19.2],[11,23.6,20.4],[15,24.6,15.8]],
  [[0,20.4,18.3],[2.2,20.4,18.3],[3.1,20.2,21.0],[6,20.6,20.6],[9,20.6,20.6],[15,20.4,18.3]],
  [[0,15.2,11.6],[8.6,15.2,11.6],[9.8,15.2,11.6],[10.5,13.6,10.8],[13,14.6,11.4],[15,15.2,11.6]],
];
function btState(t){t%=BT_LOOP;const b=keyAt(BT_BOSS,t);let pose='walk',k=0,enr=t>=11.6&&t<15;
  if(t>=2&&t<3.2){pose='slam';k=(t-2)/1.2;}else if(t>=3.2&&t<3.7){pose='slamHit';}else if(t>=4.6&&t<5.6){pose='charge';k=(t-4.6);}else if(t>=5.6&&t<6.3){pose='rush';}
  else if(t>=6.3&&t<8.6){pose='stun';}else if(t>=9.2&&t<10.2){pose='throw';k=t-9.2;}else if(t>=11.6&&t<13.1){pose='roar';k=(t-11.6)/1.5;}else if(t>=13.1)pose='walkE';
  if(pose==='walk'||pose==='walkE')b[2]=b[2];return{t,b,pose,k,enr};}
function makeTellsCard(){return{kind:'map',id:'TELLS',name:'Slam, charge, throw, enrage',desc:'One 15 s loop of the fight on the stage-5 intersection at real size: slam at the orange player (who runs out), charge at you along a lane that ends on the bus (CRASH: 2 s stun, ×1.5 damage), a throw at the farthest player (green), then the enrage roar at 50 % (bar turns red, eyes and veins glow, a Crawler drops off its back). The red skull marks the boss’s current target.',
  seed:4100,anim:true,V:BT_V,focus:[22,16],stripH:360,look:'proto',light:'night',
  segs:[{key:'look',aria:'boss look',opts:BHS.map(b=>[b.look,b.id])},{key:'light',aria:'light',opts:[['night','lit'],['dark','blackout']]}],stripR:'telegraphs above everything',
  bake:()=>cityBake('bt',{stage:5,power:'ruins',...BT_V,extra:g=>inMetres(g,c=>{rubblePile(c,26.6,13.1,2.0,1.5,231,'concrete');})}),
  init(o){o.crawlers=new Pool(4);},
  step(o,dt){o.T+=dt;},
  scene(c,o,v,W,H,which){const T=o.T,s=btState(T),t=s.t,[bx,by,bf]=s.b;drawBakeV(c,v,o.bake(),BT_V.x0,BT_V.y0);
    // crater decal after the throw
    if(t>10.2){setW(c,v);const cx=15.2,cy=11.6;c.globalAlpha=Math.min(1,(t-10.2)*4);c.fillStyle='rgba(8,8,9,0.6)';c.beginPath();blobPath(c,cx,cy,1.1,0.9,7,0.3,40);c.fill();c.strokeStyle='rgba(120,115,105,0.4)';c.lineWidth=0.06;c.stroke();resetCtx(c);gravelV(c,v,cx,cy);}
    const ps=BT_P.map(k=>keyAt(k,t));
    const walkers=[[30.5,20.8,0],[33.6,12.2,1],[13.4,20.2,2],[34.8,18,3]];for(const[x,y,vv]of walkers)walkerAt(c,v,x+Math.sin(T+x)*0.2,y,Math.atan2(16-y,24-x),vv);
    if(t>12.2&&t<15){const u=Math.min(1,(t-12.2)/0.5);const cx=lerp(bx-1.4,bx-2.6,u),cy=lerp(by,by+1.2,u);walkerAt(c,v,cx,cy,Math.PI*0.6,3,1);lbl(c,v,cx,cy+0.85,'Crawler','rgba(230,228,220,0.6)');}
    const bph=(T*0.9)%1;bossAt(c,v,bx,by,bf,o.look,s.pose,s.k,s.enr,bph,T);
    const faces=[Math.atan2(by-ps[0][1],bx-ps[0][0]),Math.atan2(by-ps[1][1],bx-ps[1][0]),Math.atan2(by-ps[2][1],bx-ps[2][0])];
    ps.forEach((p,i)=>survAt(c,v,p[0],p[1],faces[i]));
    if(o.light==='dark'){const lights=ps.map((p,i)=>({cone:[p[0],p[1],faces[i],Math.PI/6,8,0.95]})).concat(ps.map(p=>({r:[p[0],p[1],1.6,0.75]})));darkness(c,o,v,W,H,BL_REC.alpha,BL_REC.tint,lights);
      setW(c,v);c.translate(bx,by);c.rotate(bf);c.strokeStyle=s.enr?'rgba(255,80,60,0.6)':'rgba(190,170,150,0.4)';c.lineWidth=0.08;c.beginPath();c.ellipse(0,0,0.85*BH_R,1.05*BH_R,0,0,TAU);c.stroke();resetCtx(c);
      const ex=bx+Math.cos(bf)*1.56,ey=by+Math.sin(bf)*1.56;for(const sg of[-1,1]){const px=ex-Math.sin(bf)*0.16*sg,py=ey+Math.cos(bf)*0.16*sg;warmLight(c,v,px,py,0.35,s.enr?'255,74,46':'240,214,106',0.8);}
      ps.forEach((p,i)=>survAt(c,v,p[0],p[1],faces[i]));}
    ps.forEach((p,i)=>slotRing(c,v,p[0],p[1],SLOT[i]));
    // telegraphs (above everything, with a hole for the boss's body)
    c.save();c.setTransform(1,0,0,1,0,0);c.beginPath();c.rect(0,0,c.canvas.width,c.canvas.height);c.moveTo(v.ox+bx*v.k+1.08*BH_R*v.k,v.oy+by*v.k);c.ellipse(v.ox+bx*v.k,v.oy+by*v.k,1.08*BH_R*v.k,1.0*BH_R*v.k,bf,0,TAU);c.clip('evenodd');
    if(t>=2&&t<3.45)teleRing(c,v,18.4,15.6,4.5,Math.min(1,(t-2)/1.2),false);
    if(t>=4.6&&t<6.4)teleLane(c,v,18.4,15.75,0,11.6,2.4,Math.min(1,t-4.6),true);
    if(t>=9.2&&t<10.4)teleRing(c,v,15.2,11.6,3,Math.min(1,(t-9.2)/1.8),true);
    if(t>=11.6&&t<12.4){const u=(t-11.6)/0.8;setW(c,v);c.strokeStyle=`rgba(255,120,90,${0.8*(1-u)})`;c.lineWidth=0.14;c.beginPath();c.arc(bx,by,lerp(2,5,u),0,TAU);c.stroke();resetCtx(c);}
    c.restore();
    if(t>=3.2&&t<3.5){setW(c,v);c.fillStyle=`rgba(255,230,200,${0.45*(1-(t-3.2)/0.3)})`;c.beginPath();c.arc(18.4,15.6,4.5,0,TAU);c.fill();resetCtx(c);}
    // thrown chunk in flight (1.0 s lift, then 0.8 s flight)
    if(t>=10.2&&t<11){const u=(t-10.2)/0.8,sx=bx+0.5,sy=by,x=lerp(sx,15.2,u),y=lerp(sy,11.6,u)-Math.sin(u*Math.PI)*3;setW(c,v);c.fillStyle='rgba(0,0,0,0.35)';c.beginPath();c.ellipse(lerp(sx,15.2,u),lerp(sy,11.6,u),0.6,0.4,0,0,TAU);c.fill();c.translate(x,y);c.rotate(u*6);const p0=P;P=1/PPM;throwChunk(c,0);P=p0;resetCtx(c);}
    // target skull
    const tgt=t<4?1:t<9?0:t<11?2:0;const tp=ps[tgt];if(!(t>=6.3&&t<8.6))skull(c,v,tp[0],tp[1]-1.0-Math.sin(T*6)*0.06,0.9,'#ff4a3a');
    rainV(c,v,W,H,T,o.light==='dark'?0.35:0.7);
    if(which==='main'){// boss bar (top centre) with the gold notch at 50 %
      const hp=t<11.6?lerp(1,0.5,t/11.6):lerp(0.5,0.38,(t-11.6)/3.4);const bw=Math.min(360,W*0.5),bx0=(W-bw)/2,by0=12;c.setTransform(DPR,0,0,DPR,0,0);
      c.fillStyle='rgba(0,0,0,0.6)';c.fillRect(bx0-2,by0-2,bw+4,14);c.fillStyle=s.enr?'#d6302a':'#b8443a';c.fillRect(bx0,by0,bw*hp,10);c.fillStyle='#e8c25a';c.fillRect(bx0+bw*0.5-1,by0-3,2,16);
      c.font='600 12px Oswald, sans-serif';c.textAlign='center';c.fillStyle='#e8e4da';c.fillText('THE BEHEMOTH',W/2,by0+26);
      if(s.enr&&t<13.6){c.font='700 22px Oswald, sans-serif';c.fillStyle=`rgba(255,80,60,${Math.min(1,(13.6-t))})`;c.fillText('ENRAGED',W/2,H*0.3);}resetCtx(c);
      const lab=t<2?'walk':t<3.7?'SLAM · 1.2 s':t<4.6?'recover':t<6.3?'CHARGE · 1.0 s':t<8.6?'CRASH → stunned 2 s, ×1.5 damage':t<9.2?'gap':t<11?'THROW · 1.0 s + 0.8 s':t<13.1?'ENRAGE ROAR · 1.5 s':'enraged: +30 % speed, gaps × 0.7';
      panel(c,10,H-34,Math.max(200,lab.length*6.4+20),24);label(c,20,H-17,lab,'#ffd2a0','left');}}};}
function gravelV(c,v,x,y){setW(c,v);const p0=P;P=1/PPM;gravel(c,x,y,1.4,1.1,40,MATS.concrete.cols,77);P=p0;resetCtx(c);}
