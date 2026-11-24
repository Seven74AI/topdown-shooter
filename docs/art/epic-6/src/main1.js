// ================= EPIC 6 · shared infrastructure =================
const MPX=CITY.PX;               // map px per metre (32)
const DEV=PPM*DPR;               // bake density: device px per metre (real size at DPR 2)
const VW=24,VH=13.5;             // the phone's view in metres
const SLOT=['#3d8bff','#ff8a1f','#34c759','#b05cff'];
const LIGHT_DX=0.55,LIGHT_DY=0.83; // palette.LIGHT_DIR: shadows fall this way
const LAMPS_M=CITY.dressing.lamps.map(([x,y])=>[x/MPX,y/MPX]);
const CITYBAKES=new Map();
/** A rectangle of the real map baked by the game's code (cached). */
function cityBake(key,o){if(CITYBAKES.has(key))return CITYBAKES.get(key);const cv=CITY.render({...o,ppm:DEV});CITYBAKES.set(key,cv);return cv;}
/** Paint in metres inside a city bake's `extra` (map px transform). */
function inMetres(g,fn){g.save();g.scale(MPX,MPX);const p0=P;P=1/PPM;fn(g);P=p0;g.restore();}
/** A view v = {k: device px per metre, ox, oy: device px of the world origin}. */
function setW(c,v){c.setTransform(v.k,0,0,v.k,v.ox,v.oy);}
function cssOf(v,x,y){return[(v.ox+x*v.k)/DPR,(v.oy+y*v.k)/DPR];}
function drawBakeV(c,v,bake,x0,y0){c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';const s=v.k/DEV;c.imageSmoothingEnabled=true;c.drawImage(bake,v.ox+x0*v.k,v.oy+y0*v.k,bake.width*s,bake.height*s);}
const RPX=r=>Math.max(2,Math.round(r*4)/4);
function survAt(c,v,x,y,face,a){const[cx,cy]=cssOf(v,x,y);putImg(c,survBake(RPX(0.4*v.k/DPR)),cx,cy,face,a);}
function walkerAt(c,v,x,y,face,variant,a){const[cx,cy]=cssOf(v,x,y);putImg(c,walkerBake(variant||0,RPX(0.35*v.k/DPR)),cx,cy,face,a);}
function slotRing(c,v,x,y,col,a){setW(c,v);c.globalAlpha=a??0.9;c.strokeStyle=col;c.lineWidth=0.07;c.beginPath();c.arc(x,y,0.54,0,TAU);c.stroke();resetCtx(c);}
function lbl(c,v,x,y,t,col,al){const[cx,cy]=cssOf(v,x,y);label(c,cx,cy,t,col,al);}
const smooth=t=>t<0?0:t>1?1:t*t*(3-2*t);
function keyAt(keys,t){ // keys: [[t,x,y,(face)],...] → [x,y,face] eased between keys
  if(t<=keys[0][0])return keys[0].slice(1);for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const a=keys[i-1],b=keys[i],u=smooth((t-a[0])/(b[0]-a[0]));return[lerp(a[1],b[1],u),lerp(a[2],b[2],u),b[3]!=null?(a[3]!=null?a[3]+(((b[3]-a[3]+Math.PI*3)%TAU)-Math.PI)*u:b[3]):Math.atan2(b[2]-a[2],b[1]-a[1])];}
  return keys[keys.length-1].slice(1);}

// ---- rain over a view (CSS px), strength 0–1 ----
function rainV(c,v,W,H,T,str,col){if(str<=0)return;c.setTransform(DPR,0,0,DPR,0,0);c.globalCompositeOperation='lighter';c.lineCap='round';c.strokeStyle=col||'rgb(200,214,240)';
  const kk=v.k/DPR,N=Math.round(W*H/kk/kk*0.45*str),sp=2.6;
  for(let i=0;i<N;i++){const ph=hash(i*12.9898+3.1),tt=T*sp+ph,cyc=Math.floor(tt),u=tt-cyc;const x=hash(cyc*3.17+i*7.71)*W,y=hash(cyc*5.31+i*1.37)*H;
    c.globalAlpha=0.16*(1-u)*str;c.lineWidth=Math.max(0.6,0.035*kk);const L=0.45*kk;c.beginPath();c.moveTo(x,y);c.lineTo(x-L*0.22,y+L);c.stroke();}
  c.globalCompositeOperation='source-over';c.globalAlpha=1;}

// ---- darkness: a half-resolution layer with lights erased (destination-out) ----
// lights: {r:[x,y,R,s]} round, {cone:[x,y,face,half,len,s]}
function darkness(c,o,v,W,H,alpha,tint,lights){const dw=Math.ceil(W*DPR/2),dh=Math.ceil(H*DPR/2);
  if(!o._dk||o._dk.width!==dw||o._dk.height!==dh){o._dk=mk(dw,dh);}const d=o._dk.getContext('2d');
  d.setTransform(1,0,0,1,0,0);d.globalCompositeOperation='source-over';d.clearRect(0,0,dw,dh);d.fillStyle=`rgba(${tint},${alpha})`;d.fillRect(0,0,dw,dh);
  d.globalCompositeOperation='destination-out';d.setTransform(v.k/2,0,0,v.k/2,v.ox/2,v.oy/2);
  for(const L of lights){if(L.r){const[x,y,R,s]=L.r;const g=d.createRadialGradient(x,y,0,x,y,R);g.addColorStop(0,`rgba(0,0,0,${s})`);g.addColorStop(0.55,`rgba(0,0,0,${s*0.72})`);g.addColorStop(0.85,`rgba(0,0,0,${s*0.25})`);g.addColorStop(1,'rgba(0,0,0,0)');d.fillStyle=g;d.beginPath();d.arc(x,y,R,0,TAU);d.fill();}
    else if(L.cone){const[x,y,f,h,len,s]=L.cone;const g=d.createRadialGradient(x,y,0,x,y,len);g.addColorStop(0,`rgba(0,0,0,${s})`);g.addColorStop(0.7,`rgba(0,0,0,${s*0.8})`);g.addColorStop(1,'rgba(0,0,0,0)');d.fillStyle=g;
      d.save();d.filter='blur(3px)';d.beginPath();d.moveTo(x,y);d.arc(x,y,len,f-h,f+h);d.closePath();d.fill();d.restore();}}
  c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.globalAlpha=1;c.imageSmoothingEnabled=true;c.drawImage(o._dk,0,0,W*DPR,H*DPR);}
/** warm additive light on top of the darkness hole (colour of the source) */
function warmLight(c,v,x,y,R,rgb,a){setW(c,v);c.globalCompositeOperation='lighter';const g=c.createRadialGradient(x,y,0,x,y,R);g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(0.5,`rgba(${rgb},${a*0.45})`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.beginPath();c.arc(x,y,R,0,TAU);c.fill();resetCtx(c);}
function beamLight(c,v,x,y,f,h,len,rgb,a){setW(c,v);c.globalCompositeOperation='lighter';const g=c.createRadialGradient(x,y,0.2,x,y,len);g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(0.6,`rgba(${rgb},${a*0.4})`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.beginPath();c.moveTo(x,y);c.arc(x,y,len,f-h,f+h);c.closePath();c.fill();resetCtx(c);}

// ---- the particle car fire (fire-lab D, 2 m zone) ----
function carFire(x,y,R){return{x,y,R:R||2,fl:new Pool(260),sm:new Pool(46),em:new Pool(40),acc:new Float32Array(4),fit:{kind:1,cx:x,cy:y,R:R||2}};}
function stepCarFire(F,dt,T,amt){amt=amt??1;const R=F.R;
  F.acc[0]+=150*amt*dt;while(F.acc[0]>=1){F.acc[0]--;const a=rr(0,TAU),s=rr(0.28,0.42),d=R-CORE*s*0.5-rr(0,0.08);put(F.fl,F.x+Math.cos(a)*d,F.y+Math.sin(a)*d,rr(-0.15,0.15),rr(-0.7,-0.3),s,0,rr(0.22,0.38));}
  F.acc[1]+=150*amt*dt;while(F.acc[1]>=1){F.acc[1]--;const a=rr(0,TAU),d=R*0.75*Math.sqrt(FXR());put(F.fl,F.x+Math.cos(a)*d,F.y+Math.sin(a)*d*0.6,rr(-0.15,0.15),rr(-0.8,-0.3),rr(0.5,0.9),0,rr(0.3,0.55));}
  F.acc[2]+=9*amt*dt;while(F.acc[2]>=1){F.acc[2]--;put(F.sm,F.x+rr(-0.8,0.8),F.y+rr(-0.4,0.4),WIND_X*1.6,WIND_Y*1.4-0.2,rr(0.7,1.0),rr(2.8,3.6),rr(3.0,4.4));}
  F.acc[3]+=14*amt*dt;while(F.acc[3]>=1){F.acc[3]--;const a=rr(0,TAU),d=R*0.8*Math.sqrt(FXR());put(F.em,F.x+Math.cos(a)*d,F.y+Math.sin(a)*d,rr(-0.6,0.6),rr(-2.4,-1.0),rr(0.05,0.08),0,rr(0.7,1.4));}
  stepFlames(F.fl,dt,T,0.8,1.4,0.3,1.2);stepSmoke(F.sm,dt,T);stepEmbers(F.em,dt,T,3.0);}
function drawCarFire(c,v,F,T,glowA){const f=flick(T,F.x);drawImg(c,v,groundGlow,F.x,F.y,2*F.R*1.6,2*F.R*1.6,0,(glowA??0.3)*f,'lighter');
  drawFlames(c,v,F.fl,F.fit);drawSmoke(c,v,F.sm,'black',0.55,F.x,F.y,1.4);drawEmbers(c,v,F.em,F.fit);resetCtx(c);}

// ---- dust ambience (D4): puffs from broken edges + falling grit ----
function dustFx(spots){return{spots,sm:new Pool(40),bits:new Pool(60),next:0.4};}
function stepDust(D,dt,T){D.next-=dt;if(D.next<=0){D.next=rr(0.6,1.6);const s=D.spots[(FXR()*D.spots.length)|0];
    for(let i=0;i<3;i++)put(D.sm,s[0]+rr(-0.3,0.3),s[1]+rr(-0.2,0.2),rr(-0.1,0.3),rr(0.05,0.25),rr(0.3,0.5),rr(1.1,1.7),rr(1.4,2.2));
    for(let i=0;i<8;i++){const j=put(D.bits,s[0]+rr(-0.25,0.25),s[1]+rr(-0.15,0.15),rr(-0.3,0.3),rr(0.1,0.6),rr(0.03,0.07),0,rr(0.8,1.4));if(j>=0){D.bits.z[j]=rr(1.5,3);D.bits.vz[j]=0;D.bits.vr[j]=rr(-8,8);}}}
  stepDrift(D.sm,dt,T);stepBallistic(D.bits,dt,0.2);}
const GRIT=['#8b867c','#6f6b63','#a29c90','#4e4b46'];
function drawDust(c,v,D,pal){drawSmoke(c,v,D.sm,pal||'dust',0.55,0,0,0);drawBits(c,v,D.bits,GRIT,2);resetCtx(c);}

// ---- lamp flicker (stage 4): each lamp drops out 0.15–0.6 s every 4–10 s (seeded per lamp) ----
function lampOut(i,T){const per=4+hash(i*7.13)*6,ph=hash(i*3.71)*per,t=(T+ph)%per,dur=0.15+hash(i*9.1+Math.floor((T+ph)/per))*0.45;return t<dur||(t>dur+0.08&&t<dur+0.16&&hash(i)>0.5);}
/** darken a baked lamp pool while it is out (multiply, so the bake's light is taken back out) */
function lampDark(c,v,x,y){setW(c,v);c.globalCompositeOperation='multiply';const R=5.8,g=c.createRadialGradient(x,y,0,x,y,R);g.addColorStop(0,'rgb(70,72,86)');g.addColorStop(0.18,'rgb(120,122,136)');g.addColorStop(0.5,'rgb(200,202,210)');g.addColorStop(1,'rgb(255,255,255)');c.fillStyle=g;c.fillRect(x-R,y-R,2*R,2*R);resetCtx(c);}

// ================= RUINS ART (metres, top-down; light from the upper left, shadows down-right) =================
const MATS={
  concrete:{cols:['#8f8b82','#7d7a72','#a09b90','#6c6962','#aaa69c'],dust:'184,176,160',rebar:true,beam:false},
  brick:{cols:['#7b3f2c','#8a4a33','#6a3424','#94553a','#5c2e22','#9c8f80'],dust:'176,128,98',rebar:false,beam:true},
  slab:{cols:['#8f8b82','#807d75','#9a968c','#73706a'],dust:'176,170,156',rebar:true,beam:false},
  char:{cols:['#2b2725','#36302c','#221f1e','#3e3631','#4a3f37'],dust:'90,84,80',rebar:true,beam:true,embers:true},
};
/** one irregular shaded chunk */
function chunk(c,x,y,s,rot,col,seed,flat){const r=mulberry(seed);const n=5+(r()*3|0),pts=[];for(let i=0;i<n;i++){const a=i/n*TAU+r()*0.6;const d=s*(0.62+r()*0.45);pts.push(x+Math.cos(a+rot)*d,y+Math.sin(a+rot)*d*(flat||0.85));}
  const path=q=>Pg(q,pts);part(c,path,{base:col,lit:'top',box:[x-s,y-s,x+s,y+s],hi:0.32,lo:0.5,rim:0.35,inner:0.3,line:1.1,tex:polyTex(seed)});
  if(s>0.12){strokeP(c,q=>{q.moveTo(x-s*0.3,y-s*0.2);q.lineTo(x+s*0.1,y+s*0.05);q.lineTo(x+s*0.35,y-s*0.1);},'rgba(0,0,0,0.45)',0.9*P);}}
function brick(c,x,y,rot,col,seed){c.save();c.translate(x,y);c.rotate(rot);const w=0.22,h=0.1;part(c,q=>R(q,-w/2,-h/2,w,h,0.012),{base:col,lit:'top',box:[-w/2,-h/2,w/2,h/2],hi:0.3,lo:0.45,rim:0.3,inner:0.25,line:0.9,tex:polyTex(seed)});c.restore();}
function rebarStick(c,x,y,a,L){const x2=x+Math.cos(a)*L,y2=y+Math.sin(a)*L*0.9;strokeP(c,q=>{q.moveTo(x,y);q.quadraticCurveTo((x+x2)/2+L*0.12,(y+y2)/2,x2,y2);},'#130d09',0.05);strokeP(c,q=>{q.moveTo(x,y);q.quadraticCurveTo((x+x2)/2+L*0.12,(y+y2)/2,x2,y2);},'#7d4527',0.028);}
function beamPiece(c,x,y,a,L,w,col,seed){c.save();c.translate(x,y);c.rotate(a);part(c,q=>R(q,-L/2,-w/2,L,w,0.01),{base:col,lit:'top',box:[-L/2,-w/2,L/2,w/2],tex:woodTex(seed,0,0.7),hi:0.25,lo:0.45,rim:0.3,line:1.1});c.restore();}
function dustSkirt(c,x,y,rx,ry,rgb,a){c.save();c.translate(x,y);c.scale(1,ry/rx);const g=c.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(0.6,`rgba(${rgb},${a*0.5})`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.beginPath();c.arc(0,0,rx,0,TAU);c.fill();c.restore();}
function gravel(c,x,y,rx,ry,n,cols,seed){const r=mulberry(seed);for(let i=0;i<n;i++){const a=r()*TAU,d=Math.sqrt(r());const px=x+Math.cos(a)*rx*d,py=y+Math.sin(a)*ry*d,s=0.015+r()*0.04;fillP(c,q=>E(q,px,py,s,s*0.7,r()*3),cols[(r()*cols.length)|0]);fillP(c,q=>E(q,px+s*0.3,py+s*0.4,s*0.8,s*0.5),'rgba(0,0,0,0.35)');}}
/** A rubble pile ≈ w × h (hard cover): dust skirt, gravel, a cast shadow, chunks big-to-small, rebar / beams. */
function rubblePile(c,cx,cy,w,h,seed,mat){const M=MATS[mat],r=mulberry(seed);
  dustSkirt(c,cx,cy,w*0.75,h*0.75,M.dust,mat==='char'?0.35:0.22);gravel(c,cx,cy,w*0.7,h*0.7,90,M.cols.concat(['#3a3835']),seed+1);
  const items=[];
  if(mat==='slab'){items.push({k:'slab',x:cx-w*0.08,y:cy-h*0.05,a:(r()-0.5)*0.7,L:w*0.8,W:h*0.62});items.push({k:'slab',x:cx+w*0.22,y:cy+h*0.2,a:(r()-0.5)*0.9+0.5,L:w*0.42,W:h*0.4});}
  const n=mat==='brick'?14:mat==='slab'?8:22;for(let i=0;i<n;i++){const a=r()*TAU,d=Math.pow(r(),0.8)*0.42;items.push({k:'c',x:cx+Math.cos(a)*w*d,y:cy+Math.sin(a)*h*d,s:(0.16+r()*0.26)*(1-d*0.9)*(mat==='brick'?0.8:1)*Math.min(1.2,w/1.6),a:r()*TAU,col:M.cols[i%M.cols.length]});}
  if(mat==='brick')for(let i=0;i<34;i++){const a=r()*TAU,d=Math.sqrt(r())*0.52;items.push({k:'b',x:cx+Math.cos(a)*w*d,y:cy+Math.sin(a)*h*d,a:r()*TAU,col:M.cols[(r()*5)|0]});}
  // the mound: one solid irregular base, lit from the upper left, with its cast shadow (it is hard cover)
  const mound=q=>blobPath(q,cx,cy,w*0.47,h*0.45,seed+9,0.22,48);
  castShadow(c,q=>{q.beginPath();mound(q);q.fill();},0.22,0.32,0.12,0.7);
  part(c,mound,{base:shade(M.cols[0],mat==='char'?0:-0.25),lit:'radial',box:[cx-w/2,cy-h/2,cx+w/2,cy+h/2],tex:polyTex(seed+2),hi:0.3,lo:0.6,rim:0.3,inner:0.35,line:1.4});
  gravel(c,cx,cy,w*0.42,h*0.4,70,M.cols,seed+6);
  items.sort((p,q)=>(q.s||q.L||0.1)-(p.s||p.L||0.1));
  for(const it of items){if(it.k==='slab'){c.save();c.translate(it.x,it.y);c.rotate(it.a);castShadow(c,q=>{q.beginPath();R(q,-it.L/2,-it.W/2,it.L,it.W,0.03);q.fill();},0.16,0.22,0.08,0.6);
      part(c,q=>Pg(q,[-it.L/2,-it.W/2,it.L/2-0.12,-it.W/2,it.L/2,-it.W/2+0.1,it.L/2-0.05,it.W/2,-it.L/2+0.15,it.W/2,-it.L/2,it.W/2-0.12]),{base:'#8a867d',lit:'top',box:[-it.L/2,-it.W/2,it.L/2,it.W/2],tex:polyTex(seed+7),hi:0.35,lo:0.45,rim:0.45,line:1.3});
      strokeP(c,q=>{q.moveTo(-it.L*0.3,-it.W/2);q.lineTo(-it.L*0.1,0);q.lineTo(-it.L*0.25,it.W/2);q.moveTo(-it.L*0.1,0);q.lineTo(it.L*0.25,-it.W*0.1);},'rgba(0,0,0,0.6)',1.1*P);
      for(let k=0;k<3;k++)rebarStick(c,it.L/2-0.05,-it.W/3+k*it.W/3,0.2-k*0.2,0.28);c.restore();}
    else if(it.k==='b')brick(c,it.x,it.y,it.a,it.col,seed+((it.x*100)|0));
    else chunk(c,it.x,it.y,it.s,it.a,it.col,seed+((it.x*991+it.y*37)|0));}
  if(M.beam){beamPiece(c,cx-w*0.1,cy-h*0.12,(r()-0.5)*1.2,w*0.62,0.12,mat==='char'?'#1f1915':'#5e4630',seed+3);beamPiece(c,cx+w*0.15,cy+h*0.15,(r()-0.5)*1.2+1.2,w*0.4,0.1,mat==='char'?'#241c17':'#6b5036',seed+4);}
  if(M.rebar)for(let i=0;i<4;i++)rebarStick(c,cx+(r()-0.5)*w*0.5,cy+(r()-0.5)*h*0.5,r()*TAU,0.3+r()*0.35);
  if(mat==='char'){for(let i=0;i<6;i++){const x=cx+(r()-0.5)*w*0.6,y=cy+(r()-0.5)*h*0.6;glow(c,x,y,0.18,'255,120,40',0.5);fillP(c,q=>E(q,x,y,0.03,0.02),'rgba(255,190,90,0.9)');}}}
/** A broken corner of a building's roof: the roof gone inside poly, floor, beams and a jagged edge. b = [x0,y0,x1,y1] of the building. */
function brokenRoof(c,poly,seed,mat){const M=MATS[mat],r=mulberry(seed);
  // interior floor in the roof's own shadow
  c.save();c.beginPath();Pg(c,poly);c.clip();
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let i=0;i<poly.length;i+=2){x0=Math.min(x0,poly[i]);x1=Math.max(x1,poly[i]);y0=Math.min(y0,poly[i+1]);y1=Math.max(y1,poly[i+1]);}
  c.fillStyle=mat==='char'?'#141110':'#1d1b19';c.fillRect(x0,y0,x1-x0,y1-y0);
  if(mat!=='char'){c.strokeStyle='rgba(120,112,100,0.18)';c.lineWidth=0.02;c.beginPath();for(let x=Math.floor(x0);x<x1;x+=0.5){c.moveTo(x,y0);c.lineTo(x,y1);}for(let y=Math.floor(y0);y<y1;y+=0.5){c.moveTo(x0,y);c.lineTo(x1,y);}c.stroke();}
  else{for(let i=0;i<40;i++){fillP(c,q=>E(q,x0+r()*(x1-x0),y0+r()*(y1-y0),0.1+r()*0.3,0.06+r()*0.2,r()*3),`rgba(${r()<0.3?'90,45,20':'0,0,0'},${0.2+r()*0.3})`);}}
  // inner walls (room partitions) and fallen ceiling
  for(let i=0;i<2;i++){const yy=lerp(y0,y1,0.35+i*0.3);fillP(c,q=>R(q,x0,yy,(x1-x0)*(0.5+r()*0.4),0.12),mat==='char'?'#2a2420':'#4d4944');}
  gravel(c,(x0+x1)/2,(y0+y1)/2,(x1-x0)*0.5,(y1-y0)*0.5,120,M.cols,seed+5);
  for(let i=0;i<7;i++)chunk(c,lerp(x0,x1,r()),lerp(y0,y1,r()),0.12+r()*0.2,r()*TAU,M.cols[i%M.cols.length],seed+20+i);
  if(M.beam||mat==='concrete'){for(let i=0;i<3;i++)beamPiece(c,lerp(x0,x1,0.2+r()*0.6),lerp(y0,y1,0.2+r()*0.6),r()*3,1.2+r()*1.2,0.13,mat==='char'?'#1d1714':mat==='concrete'?'#55524d':'#5a432d',seed+30+i);}
  // the remaining roof throws its shadow into the hole (light from the upper left)
  c.globalCompositeOperation='multiply';const g=c.createLinearGradient(x0,y0,x0+0.9,y0+1.3);g.addColorStop(0,'rgb(40,40,48)');g.addColorStop(1,'rgb(255,255,255)');c.fillStyle=g;c.fillRect(x0,y0,x1-x0,y1-y0);c.globalCompositeOperation='source-over';
  c.restore();
  // jagged broken edge: a thick torn roof slab line with rebar ends
  strokeP(c,q=>Pg(q,poly),'rgba(8,8,9,0.9)',3*P);
  for(let i=0;i<poly.length;i+=2){const xa=poly[i],ya=poly[i+1],xb=poly[(i+2)%poly.length],yb=poly[(i+3)%poly.length];const L=Math.hypot(xb-xa,yb-ya);
    for(let s=0.3;s<L-0.2;s+=0.35+r()*0.3){const t=s/L;const px=lerp(xa,xb,t),py=lerp(ya,yb,t);if(M.rebar&&r()<0.6)rebarStick(c,px,py,Math.atan2(yb-ya,xb-xa)+Math.PI/2+(r()-0.5),0.15+r()*0.2);}}}
/** A breach in a wall face: a dark hole into the building and bricks blown outward. */
function breach(c,x,y,dirx,diry,w,seed,mat){const r=mulberry(seed),M=MATS[mat];const nx=-diry,ny=dirx;
  const pts=[];const N=12;for(let i=0;i<=N;i++){const t=i/N,a=t*Math.PI;const d=(0.6+r()*0.35)*w*0.5;pts.push(x+nx*Math.cos(a)*w*0.5*(0.85+r()*0.2)-dirx*Math.sin(a)*d*1.6,y+ny*Math.cos(a)*w*0.5*(0.85+r()*0.2)-diry*Math.sin(a)*d*1.6);}
  fillP(c,q=>Pg(q,pts),'#070707');
  c.save();c.beginPath();Pg(c,pts);c.clip();const g=c.createRadialGradient(x,y,0,x,y,w*0.8);g.addColorStop(0,'rgba(60,52,44,0.5)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-w,y-w,2*w,2*w);c.restore();
  strokeP(c,q=>Pg(q,pts),'rgba(10,10,10,0.95)',3.4*P);strokeP(c,q=>Pg(q,pts),'rgba(200,190,170,0.35)',1.2*P);
  for(let i=0;i<14;i++){const t=(r()-0.5)*w*1.2,o=r()*0.9;const px=x+nx*t+dirx*o,py=y+ny*t+diry*o;if(mat==='brick'||mat==='char')brick(c,px,py,r()*3,M.cols[i%M.cols.length],seed+i);else chunk(c,px,py,0.06+r()*0.12,r()*3,M.cols[i%M.cols.length],seed+i);}
  gravel(c,x+dirx*0.5,y+diry*0.5,w*0.6,0.6,60,M.cols,seed+3);}
/** soot fan up a facade / across a roof from a burnt hole */
function soot(c,x,y,rx,ry,a){dustSkirt(c,x,y,rx,ry,'10,8,8',a);}

// ================= RUINS: the scene =================
// Real slice of Downtown: the diner corner, alley 2 and the parking lot (24 × 13.5 m).
const RU_V={x0:0,y0:17,w:VW,h:VH};
const RU_PILES=[[19.4,18.4,2.1,1.5],[10.6,21.0,2.0,1.4],[2.0,16.9,2.0,1.5]]; // 3 street piles (hard cover)
const RU_ALLEY=[7,22,3,2.6];   // alley 2 closed by a heap filling it wall to wall
const RU_BREACH=[4.6,22];      // diner north wall, facing the street: breach spawn
const RU_DUST=[[6.6,22.2],[7.2,24.6],[4.6,22.4],[9.6,22.2],[19.4,18],[0.8,22.2]];
const RUS=[
  {id:'RU1',name:'Concrete and rebar',mat:'concrete',desc:'Grey concrete chunks with bent rebar; the diner’s roof corner has caved in, showing the floor tiles, a fallen beam and the room walls inside; alley 2 is a concrete heap wall to wall. Dust is pale grey.'},
  {id:'RU2',name:'Brick collapse',mat:'brick',desc:'The diner’s brick facade has come down: piles of loose red-brown bricks, broken timber joists and orange brick dust; the street piles are brick heaps with a beam across. Warmest and most “old city”.'},
  {id:'RU3',name:'Whole wall slabs',mat:'slab',desc:'Big flat wall panels fell in one piece and lie tilted on smaller chunks, rebar sticking out of the torn edge. Fewest, biggest pieces: the piles read as solid cover at a glance (they are: they stop bullets).'},
  {id:'RU4',name:'Fire-gutted',mat:'char',desc:'Everything burnt: black charred debris with embers still glowing in the piles, soot fans across the roofs, a burnt-out hole in the diner roof. The darkest option: the city has burnt, not just fallen.'},
];
function ruinsExtra(F){return g=>inMetres(g,c=>{
  const m=F.mat;
  // diner roof corner caved in (diner = 0–7 × 22–32): NE corner, plus the breach in its north wall
  brokenRoof(c,[3.0,22,7,22,7,27.0,6.5,26.3,6.0,26.6,5.7,25.6,5.0,25.4,4.6,24.5,3.9,24.4,3.7,23.4,3.2,23.0],111,m);
  breach(c,RU_BREACH[0],RU_BREACH[1],0,-1,1.8,117,m);
  if(m==='char'){soot(c,5,24,3.4,2.4,0.55);soot(c,14.8,28,2.4,2.6,0.45);soot(c,12.2,28,2,2.4,0.35);}
  // alley 2 heap: fills x 7–10, y 22–24.6
  const[ax,ay,aw,ah]=RU_ALLEY;rubblePile(c,ax+aw/2,ay+ah/2,aw*1.08,ah*1.05,201,m);rubblePile(c,ax+aw*0.55,ay+ah*0.75,aw*0.8,ah*0.6,203,m);
  // spill of the diner's fallen corner onto the sidewalk
  rubblePile(c,6.4,21.3,1.6,0.7,207,m);
  // three street piles
  RU_PILES.forEach(([x,y,w,h],i)=>rubblePile(c,x,y,w,h,300+i*17,m));
  // loose debris scattered around (ambience, not cover)
  const r=mulberry(77);for(let i=0;i<40;i++){const x=r()*24,y=17+r()*13.5;if(x<7.2&&y>22)continue;if(x>10.4&&x<20&&y>22&&r()<0.6)continue;chunk(c,x,y,0.04+r()*0.07,r()*3,MATS[m].cols[i%4],900+i);}
  if(m==='brick'){for(let i=0;i<20;i++)brick(c,2+r()*8,20.4+r()*1.4,r()*3,MATS.brick.cols[i%5],950+i);}
});}
function makeRuinsCard(F,i){return{kind:'map',id:F.id,name:F.name,desc:F.desc,F,seed:1000+i*13,anim:true,V:RU_V,focus:[8.6,21.4],stripH:320,
  stripR:'piles ≈ 2 × 1.5 m · alley 2 closed',
  bake:()=>cityBake('ru'+F.id,{stage:4,power:'ruins',...RU_V,extra:ruinsExtra(F)}),
  init(o){o.dust=dustFx(RU_DUST);o.zs=[[12.5,24.3,0],[16,19.6,1],[3.5,20.6,2],[22.4,25.2,3],[13.8,17.6,0]];},
  step(o,dt){o.T+=dt;stepDust(o.dust,dt,o.T);},
  scene(c,o,v,W,H){const T=o.T;drawBakeV(c,v,o.bake(),RU_V.x0,RU_V.y0);
    LAMPS_M.forEach(([x,y],i)=>{if(lampOut(i,T))lampDark(c,v,x,y);});
    // characters: the team holds the street; Walkers come out of the breach and over the piles
    const sx=13.2,sy=19.1;survAt(c,v,sx,sy,Math.atan2(21.5-sy,4.6-sx));slotRing(c,v,sx,sy,SLOT[0]);
    survAt(c,v,20.6,20.9,Math.atan2(24-20.9,22.5-20.6));slotRing(c,v,20.6,20.9,SLOT[1]);
    const u=(T*0.18)%1;walkerAt(c,v,lerp(4.6,6.5,u),lerp(22.4,20.6,u),Math.atan2(sy-21,sx-5.5),1,Math.min(1,u*5));
    for(const[x,y,vv]of o.zs)walkerAt(c,v,x+Math.sin(T*0.7+x)*0.15,y,Math.atan2(sy-y,sx-x),vv);
    drawDust(c,v,o.dust,F.mat==='brick'?'dust':F.mat==='char'?'dark':'grey');
    if(F.mat==='char'){/* smoke wisps from the piles */}
    rainV(c,v,W,H,T,0.9);}};}
// ---- round D floodlight pool (5.10 reference) ----
let poolSpr;
function buildRD(){
  poolSpr=radialSprite(256,[[0,'rgba(255,240,210,1)'],[0.45,'rgba(255,234,198,0.74)'],[0.75,'rgba(255,226,186,0.44)'],[0.92,'rgba(255,220,178,0.2)'],[1,'rgba(255,216,172,0)']]);
}
function lightPool(c,x,y,Rpx,a){c.globalCompositeOperation='lighter';c.globalAlpha=a;c.setTransform(DPR*2*Rpx,0,0,DPR*2*Rpx,x*DPR,y*DPR);c.drawImage(poolSpr,-0.5,-0.5,1,1);
  c.globalAlpha=a*0.7;c.setTransform(DPR*0.9*PPM,0,0,DPR*0.9*PPM,x*DPR,y*DPR);c.drawImage(poolSpr,-0.5,-0.5,1,1);resetCtx(c);}
