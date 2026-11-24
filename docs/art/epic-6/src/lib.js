"use strict";
// ---- lib.js ----
const DPR = 2;
const TAU = Math.PI * 2;
let P = 1; // one logical px, in object units (metres)

// ---------- helpers ----------
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rgbOf(h){const n=parseInt(h.slice(1),16);return[n>>16,(n>>8)&255,n&255];}
function shade(h,t){const f=t<0?0:255,a=Math.abs(t);const c=rgbOf(h).map(v=>Math.round(v+(f-v)*a));return`rgb(${c[0]},${c[1]},${c[2]})`;}
function R(c,x,y,w,h,r=0){if(!r){c.moveTo(x,y);c.lineTo(x+w,y);c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.closePath();return;}r=Math.min(r,w/2,h/2);c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function E(c,x,y,rx,ry,a=0){c.moveTo(x+rx*Math.cos(a),y+rx*Math.sin(a));c.ellipse(x,y,Math.max(1e-5,rx),Math.max(1e-5,ry),a,0,TAU);c.closePath();}
function Pg(c,p){c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);c.closePath();}
function blobPath(c,cx,cy,rx,ry,seed,amp=0.15,n=56,rot=0){const r=mulberry(seed);const ph=[r()*TAU,r()*TAU,r()*TAU];const cr=Math.cos(rot),sr=Math.sin(rot);for(let i=0;i<=n;i++){const a=i/n*TAU;const k=1+amp*(0.5*Math.sin(a*2+ph[0])+0.3*Math.sin(a*3+ph[1])+0.2*Math.sin(a*5+ph[2]));const x=Math.cos(a)*rx*k,y=Math.sin(a)*ry*k;const X=cx+x*cr-y*sr,Y=cy+x*sr+y*cr;i?c.lineTo(X,Y):c.moveTo(X,Y);}c.closePath();}
function fillP(c,fn,style){c.beginPath();fn(c);c.fillStyle=style;c.fill();}
function strokeP(c,fn,style,w,cap='round'){c.beginPath();fn(c);c.strokeStyle=style;c.lineWidth=w;c.lineCap=cap;c.lineJoin='round';c.stroke();}
function devToLocal(c,dx,dy){const m=c.getTransform();const det=m.a*m.d-m.b*m.c;return[(m.d*dx-m.c*dy)/det,(-m.b*dx+m.a*dy)/det];}
function lightDir(c){const v=devToLocal(c,-1,-1);const l=Math.hypot(v[0],v[1]);return[v[0]/l,v[1]/l];}
function glow(c,x,y,r,rgb,a){if(a<=0)return;c.save();c.globalCompositeOperation='lighter';const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(0.3,`rgba(${rgb},${a*0.5})`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.restore();}
/** Soft cast shadow: fn draws (fills/strokes) in black; drawn far away and thrown back with shadowOffset. */
function castShadow(c,fn,dx,dy,blur,a){const m=c.getTransform();const s=Math.hypot(m.a,m.b);c.save();c.translate(-4000/s,0);c.shadowColor=`rgba(0,0,0,${a})`;c.shadowOffsetX=4000*m.a/s+dx*s;c.shadowOffsetY=dy*s;c.shadowBlur=blur*s;c.fillStyle='#000';c.strokeStyle='#000';fn(c);c.restore();}
function rivet(c,x,y,r,base,hex=false){c.beginPath();if(hex){for(let i=0;i<6;i++){const a=i/6*TAU+0.3;i?c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r):c.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}c.closePath();}else E(c,x,y,r,r);const L=lightDir(c);const g=c.createRadialGradient(x+L[0]*r*0.45,y+L[1]*r*0.45,0,x,y,r*1.05);g.addColorStop(0,shade(base,0.55));g.addColorStop(0.55,base);g.addColorStop(1,shade(base,-0.55));c.fillStyle=g;c.fill();c.lineWidth=0.7*P;c.strokeStyle='rgba(0,0,0,0.65)';c.stroke();}

/** One shaded part: fill, texture, light gradient, rim light upper-left, inner shade lower-right, outline. */
function part(c,path,o){
  const[x0,y0,x1,y1]=o.box;const cx=(x0+x1)/2,cy=(y0+y1)/2,w=x1-x0,h=y1-y0;
  c.beginPath();path(c);c.fillStyle=o.base;c.fill();
  c.save();c.clip();
  if(o.tex)o.tex(c,x0,y0,x1,y1);
  const hi=o.hi??0.22,lo=o.lo??0.4;let g;
  if(o.lit==='top'){const L=lightDir(c);const s=Math.hypot(w,h)/2;g=c.createLinearGradient(cx+L[0]*s,cy+L[1]*s,cx-L[0]*s,cy-L[1]*s);g.addColorStop(0,`rgba(200,215,240,${hi})`);g.addColorStop(0.5,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${lo})`);}
  else if(o.lit==='radial'){const L=lightDir(c);const m=Math.max(w,h);g=c.createRadialGradient(cx+L[0]*w*0.28,cy+L[1]*h*0.32,0,cx,cy,m*0.62);g.addColorStop(0,`rgba(225,235,255,${hi})`);g.addColorStop(0.45,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${lo})`);}
  else{g=c.createLinearGradient(0,y0,0,y1);g.addColorStop(0,`rgba(215,225,242,${hi})`);g.addColorStop(0.2,`rgba(215,225,242,${hi*0.3})`);g.addColorStop(0.5,'rgba(0,0,0,0.04)');g.addColorStop(0.85,`rgba(0,0,0,${lo})`);g.addColorStop(1,`rgba(60,72,90,${lo*0.35})`);}
  c.fillStyle=g;c.fillRect(x0-w,y0-h,w*3,h*3);
  const rim=o.rim??0.42;
  if(rim>0){const d=devToLocal(c,1.5*DPR,1.7*DPR);c.beginPath();c.rect(x0-w,y0-h,w*3,h*3);c.save();c.translate(d[0],d[1]);path(c);c.restore();c.fillStyle=`rgba(195,210,235,${rim})`;c.fill('evenodd');}
  const dk=o.inner??0.32;
  if(dk>0){const d=devToLocal(c,-1.3*DPR,-1.5*DPR);c.beginPath();c.rect(x0-w,y0-h,w*3,h*3);c.save();c.translate(d[0],d[1]);path(c);c.restore();c.fillStyle=`rgba(0,0,0,${dk})`;c.fill('evenodd');}
  c.restore();
  if(o.line!==0){c.beginPath();path(c);c.lineJoin='round';c.strokeStyle=o.stroke||'rgba(4,4,6,0.95)';c.lineWidth=(o.line??1.3)*P;c.stroke();}
}

// ---------- textures (drawn inside a clip, object units) ----------
function woodTex(seed,ang=0,light=1){return(c,x0,y0,x1,y1)=>{const r=mulberry(seed);const cx=(x0+x1)/2,cy=(y0+y1)/2,L=Math.hypot(x1-x0,y1-y0);c.save();c.translate(cx,cy);c.rotate(ang);
  for(let i=0;i<90;i++){const y=(r()-0.5)*L;const amp=L*(0.0015+r()*0.005);const f=(2+r()*5)/L;const ph=r()*TAU;c.beginPath();for(let k=0;k<=48;k++){const x=-L/2+L*k/48;const yy=y+Math.sin(x*f*4+ph)*amp+Math.sin(x*f*11+ph*2)*amp*0.2;k?c.lineTo(x,yy):c.moveTo(x,yy);}const dark=r()<0.72;c.strokeStyle=dark?`rgba(28,14,6,${0.14+r()*0.32})`:`rgba(205,160,110,${(0.05+r()*0.1)*light})`;c.lineWidth=(0.5+r()*1.5)*P;c.stroke();}
  for(let i=0;i<7;i++){const x=(r()-0.5)*L,y=(r()-0.5)*L*0.5,rr=L*(0.04+r()*0.1);const g=c.createRadialGradient(x,y,0,x,y,rr);g.addColorStop(0,`rgba(175,135,92,${0.2*light})`);g.addColorStop(1,'rgba(175,135,92,0)');c.fillStyle=g;c.fillRect(x-rr,y-rr,rr*2,rr*2);}
  for(let i=0;i<2;i++){const x=(r()-0.5)*L*0.7,y=(r()-0.5)*L*0.2;c.beginPath();E(c,x,y,L*0.012,L*0.006);c.fillStyle='rgba(30,14,5,0.55)';c.fill();c.beginPath();E(c,x,y,L*0.022,L*0.011);c.strokeStyle='rgba(30,14,5,0.3)';c.lineWidth=P;c.stroke();}
  for(let i=0;i<30;i++){const x=(r()-0.5)*L,y=(r()-0.5)*L*0.5,l=L*(0.004+r()*0.03),a=(r()-0.5)*1.4;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);c.strokeStyle=`rgba(225,195,155,${(0.1+r()*0.22)*light})`;c.lineWidth=(0.4+r()*0.6)*P;c.stroke();}
  c.restore();};}
function steelTex(seed,wear=0.5){return(c,x0,y0,x1,y1)=>{const r=mulberry(seed);const w=x1-x0,h=y1-y0;const area=w*h/(P*P);
  for(let i=0;i<Math.min(140,area*0.012);i++){c.fillStyle=r()<0.5?`rgba(200,210,225,${0.03+r()*0.05})`:`rgba(0,0,0,${0.05+r()*0.08})`;c.fillRect(x0+r()*w,y0+r()*h,w*(0.05+r()*0.3),0.6*P);}
  const n=Math.min(500,area*0.03*wear);for(let i=0;i<n;i++){const ed=r()<0.6;const x=x0+r()*w;const y=ed?(r()<0.5?y0+r()*h*0.15:y1-r()*h*0.12):y0+r()*h;const v=150+r()*45|0;c.fillStyle=`rgba(${v},${v},${v+12},${0.07+r()*0.2})`;const s=P*(0.6+r()*1.4);c.fillRect(x,y,s*(1+r()*2),s);}
  if(wear>0.7){for(let i=0;i<Math.min(50,area*0.003);i++){const x=x0+r()*w,y=y0+r()*h,rr=P*(0.8+r()*2.5);c.fillStyle=`rgba(115,62,30,${0.15+r()*0.25})`;c.beginPath();c.arc(x,y,rr,0,TAU);c.fill();}}};}
function polyTex(seed,check=false){return(c,x0,y0,x1,y1)=>{const r=mulberry(seed);const w=x1-x0,h=y1-y0;const n=Math.min(1600,(w*h)/(P*P)*0.12);for(let i=0;i<n;i++){c.fillStyle=r()<0.5?`rgba(255,255,255,${0.025+r()*0.05})`:`rgba(0,0,0,${0.08+r()*0.12})`;c.fillRect(x0+r()*w,y0+r()*h,P*(0.8+r()),P*(0.8+r()));}
  if(check){c.strokeStyle='rgba(0,0,0,0.4)';c.lineWidth=0.7*P;c.beginPath();const s=3*P;for(let k=-h;k<w+h;k+=s){c.moveTo(x0+k,y0);c.lineTo(x0+k+h,y1);c.moveTo(x0+k+h,y0);c.lineTo(x0+k,y1);}c.stroke();}
  for(let i=0;i<10;i++){const x=x0+r()*w,y=y0+r()*h,l=w*(0.02+r()*0.08);c.strokeStyle=`rgba(180,185,195,${0.07+r()*0.1})`;c.lineWidth=0.6*P;c.beginPath();c.moveTo(x,y);c.lineTo(x+l,y+(r()-0.5)*l*0.4);c.stroke();}};}
function rustTex(seed,amt=1){return(c,x0,y0,x1,y1)=>{const r=mulberry(seed);const w=x1-x0,h=y1-y0;const area=w*h/(P*P);
  const nb=Math.min(26,4+area*0.0015)*amt;for(let i=0;i<nb;i++){const x=x0+r()*w,y=y0+r()*h,rr=Math.max(w,h)*(0.04+r()*0.14);const g=c.createRadialGradient(x,y,0,x,y,rr);const col=r()<0.5?'150,72,28':'92,46,20';g.addColorStop(0,`rgba(${col},${0.28+r()*0.32})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.fillRect(x-rr,y-rr,rr*2,rr*2);}
  const n=Math.min(900,area*0.05*amt);for(let i=0;i<n;i++){c.fillStyle=r()<0.6?`rgba(160,84,36,${0.18+r()*0.3})`:`rgba(28,20,15,${0.2+r()*0.3})`;const s=P*(0.6+r()*1.6);c.fillRect(x0+r()*w,y0+r()*h,s,s);}};}
function skinTex(seed,veins=1){return(c,x0,y0,x1,y1)=>{const r=mulberry(seed);const w=x1-x0,h=y1-y0;const m=Math.min(w,h);
  for(let i=0;i<14;i++){const x=x0+r()*w,y=y0+r()*h,rr=m*(0.12+r()*0.32);const g=c.createRadialGradient(x,y,0,x,y,rr);const col=['85,110,75','115,80,98','58,66,52','150,150,125'][i%4];g.addColorStop(0,`rgba(${col},${0.12+r()*0.2})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.fillRect(x-rr,y-rr,2*rr,2*rr);}
  for(let i=0;i<7*veins;i++){let x=x0+r()*w,y=y0+r()*h,a=r()*TAU;c.beginPath();c.moveTo(x,y);for(let k=0;k<9;k++){a+=(r()-0.5)*1.3;const l=m*0.05;x+=Math.cos(a)*l;y+=Math.sin(a)*l;c.lineTo(x,y);}c.strokeStyle=`rgba(72,58,96,${0.18+r()*0.18})`;c.lineWidth=(0.6+r()*0.7)*P;c.stroke();}
  const n=Math.min(700,w*h/(P*P)*0.06);for(let i=0;i<n;i++){c.fillStyle=r()<0.5?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.12)';c.fillRect(x0+r()*w,y0+r()*h,P,P);}};}
function clothTex(seed,stain='60,30,20'){return(c,x0,y0,x1,y1)=>{const r=mulberry(seed);const w=x1-x0,h=y1-y0;
  c.lineWidth=0.5*P;c.strokeStyle='rgba(0,0,0,0.12)';c.beginPath();for(let x=x0;x<x1;x+=2.2*P){c.moveTo(x,y0);c.lineTo(x+h*0.2,y1);}c.stroke();
  c.strokeStyle='rgba(255,255,255,0.035)';c.beginPath();for(let y=y0;y<y1;y+=2.2*P){c.moveTo(x0,y);c.lineTo(x1,y+w*0.05);}c.stroke();
  for(let i=0;i<9;i++){const x=x0+r()*w,y=y0+r()*h,rr=Math.min(w,h)*(0.08+r()*0.25);const g=c.createRadialGradient(x,y,0,x,y,rr);const col=i%3===0?stain:'20,18,14';g.addColorStop(0,`rgba(${col},${0.2+r()*0.3})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.fillRect(x-rr,y-rr,2*rr,2*rr);}};}
function veinTex(seed,col){return(c,x0,y0,x1,y1)=>{const r=mulberry(seed);const w=x1-x0,h=y1-y0,m=Math.min(w,h);for(let i=0;i<9;i++){let x=x0+w*0.5+(r()-0.5)*w*0.8,y=y0+h*0.5+(r()-0.5)*h*0.8,a=r()*TAU;c.beginPath();c.moveTo(x,y);for(let k=0;k<7;k++){a+=(r()-0.5)*1.1;const l=m*0.07;x+=Math.cos(a)*l;y+=Math.sin(a)*l;c.lineTo(x,y);}c.strokeStyle=`rgba(${col},${0.35+r()*0.3})`;c.lineWidth=(0.7+r()*0.9)*P;c.stroke();}};}

// ---------- backgrounds (logical px) ----------
let GRAIN,AGG;
function makeGrain(){const S=256,cv=document.createElement('canvas');cv.width=cv.height=S;const g=cv.getContext('2d');const id=g.createImageData(S,S);const r=mulberry(7);for(let i=0;i<S*S;i++){const v=r();let k=0,a=0;if(v<0.1){k=255;a=r()*0.09;}else if(v>0.78){k=0;a=r()*0.3;}id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=k;id.data[i*4+3]=a*255|0;}g.putImageData(id,0,0);return cv;}
function makeAgg(){const S=384,cv=document.createElement('canvas');cv.width=cv.height=S;const g=cv.getContext('2d');const r=mulberry(11);for(let i=0;i<1700;i++){const x=r()*S,y=r()*S,s=0.6+r()*1.9;const l=r();g.fillStyle=l<0.55?`rgba(150,156,168,${0.04+r()*0.12})`:`rgba(0,0,0,${0.15+r()*0.28})`;g.beginPath();g.ellipse(x,y,s,s*(0.55+r()*0.45),r()*3,0,TAU);g.fill();}return cv;}
function asphalt(c,W,H,seed,o={}){
  const r=mulberry(seed);
  c.fillStyle='#17191d';c.fillRect(0,0,W,H);
  for(let i=0;i<14;i++){const x=r()*W,y=r()*H,rad=(0.15+r()*0.35)*Math.max(W,H);const g=c.createRadialGradient(x,y,0,x,y,rad);const d=r()<0.5;g.addColorStop(0,d?'rgba(0,0,0,0.18)':'rgba(62,68,80,0.10)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,W,H);}
  c.save();c.setTransform(1,0,0,1,0,0);c.fillStyle=c.createPattern(GRAIN,'repeat');c.fillRect(0,0,c.canvas.width,c.canvas.height);
  const pa=c.createPattern(AGG,'repeat');pa.setTransform(new DOMMatrix().translate(r()*384,r()*384).scale(o.agg||1));c.fillStyle=pa;c.fillRect(0,0,c.canvas.width,c.canvas.height);c.restore();
  for(let k=0;k<(o.cracks??3);k++){let x=r()*W,y=r()*H,a=r()*TAU;const pts=[[x,y]];const n=10+r()*25|0;for(let i=0;i<n;i++){a+=(r()-0.5)*1.1;const l=4+r()*10;x+=Math.cos(a)*l;y+=Math.sin(a)*l;pts.push([x,y]);}const pl=(dx,dy)=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0]+dx,p[1]+dy):c.moveTo(p[0]+dx,p[1]+dy));};pl(0.7,0.7);c.strokeStyle='rgba(150,165,190,0.07)';c.lineWidth=0.7;c.stroke();pl(0,0);c.strokeStyle='rgba(0,0,0,0.6)';c.lineWidth=0.9+r()*0.8;c.stroke();}
  const np=o.puddles??2;for(let k=0;k<np;k++){const q=o.pud&&o.pud[k];const px=q?q[0]*W:r()*W,py=q?q[1]*H:r()*H;const rx=(q?q[2]:0.08+r()*0.12)*W,ry=rx*(0.4+r()*0.3),rot=r()*0.6,sd=seed*10+k;
    const pp=c=>blobPath(c,px,py,rx,ry,sd,0.3,64,rot);
    c.beginPath();pp(c);c.fillStyle='rgba(5,7,11,0.38)';c.fill();
    c.save();c.clip();const g=c.createLinearGradient(px-rx,py-ry,px+rx,py+ry);g.addColorStop(0,'rgba(125,150,190,0.18)');g.addColorStop(0.45,'rgba(60,75,100,0.06)');g.addColorStop(1,'rgba(10,12,18,0.15)');c.fillStyle=g;c.fillRect(px-rx*1.6,py-ry*1.6,rx*3.2,ry*3.2);
    for(let i=0;i<6;i++){const x=px+(r()-0.5)*rx*1.4,y=py+(r()-0.5)*ry*1.2,rr=1.5+r()*5;c.beginPath();c.ellipse(x,y,rr,rr*0.6,0,0,TAU);c.strokeStyle='rgba(170,190,225,0.07)';c.lineWidth=0.6;c.stroke();}
    c.restore();c.beginPath();pp(c);c.strokeStyle='rgba(150,170,205,0.05)';c.lineWidth=1;c.stroke();}
  let g=c.createRadialGradient(W*0.15,H*0.08,0,W*0.15,H*0.08,Math.max(W,H)*0.9);g.addColorStop(0,'rgba(120,142,180,0.16)');g.addColorStop(0.5,'rgba(70,85,110,0.05)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,W,H);
  if(o.rain!==0){c.strokeStyle='rgba(170,190,220,0.05)';c.lineWidth=0.6;c.beginPath();for(let i=0;i<W*H/2500;i++){const x=r()*W,y=r()*H,l=6+r()*10;c.moveTo(x,y);c.lineTo(x-l*0.25,y+l);}c.stroke();}
  g=c.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3,W/2,H/2,Math.max(W,H)*0.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${o.vig??0.5})`);c.fillStyle=g;c.fillRect(0,0,W,H);
}
function charcoal(c,W,H){const g=c.createRadialGradient(W*0.5,H*0.42,0,W*0.5,H*0.5,W*0.66);g.addColorStop(0,'#25282c');g.addColorStop(0.6,'#16181b');g.addColorStop(1,'#0b0c0e');c.fillStyle=g;c.fillRect(0,0,W,H);c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=0.55;c.fillStyle=c.createPattern(GRAIN,'repeat');c.fillRect(0,0,c.canvas.width,c.canvas.height);c.restore();}

// ================= GUNS (side view, metres, muzzle +x) =================
function trigger(c,tg,tr){strokeP(c,tg,'#050506',0.0075+2*P);strokeP(c,tg,'#24262a',0.0075);c.save();c.translate(0,-0.0022);strokeP(c,tg,'rgba(170,180,195,0.35)',1.1*P);c.restore();strokeP(c,tr,'#050506',0.0055+2*P);strokeP(c,tr,'#2e3035',0.0055);}

function bez(p,t){const u=1-t;return[u*u*u*p[0]+3*u*u*t*p[2]+3*u*t*t*p[4]+t*t*t*p[6],u*u*u*p[1]+3*u*u*t*p[3]+3*u*t*t*p[5]+t*t*t*p[7]];}
function taperPath(pts,ws){const n=pts.length/2;const Q=[],N=[];for(let i=0;i<n;i++){const a=Math.max(0,i-1),b=Math.min(n-1,i+1);const dx=pts[2*b]-pts[2*a],dy=pts[2*b+1]-pts[2*a+1];const l=Math.hypot(dx,dy)||1;Q.push([pts[2*i],pts[2*i+1]]);N.push([-dy/l,dx/l]);}
  return c=>{const w=i=>ws[i]/2;c.moveTo(Q[0][0]+N[0][0]*w(0),Q[0][1]+N[0][1]*w(0));for(let i=1;i<n;i++)c.lineTo(Q[i][0]+N[i][0]*w(i),Q[i][1]+N[i][1]*w(i));
    const e=n-1,tx=N[e][1],ty=-N[e][0];for(let k=1;k<=8;k++){const th=k/8*Math.PI,cs=Math.cos(th),sn=Math.sin(th);c.lineTo(Q[e][0]+(N[e][0]*cs+tx*sn)*w(e),Q[e][1]+(N[e][1]*cs+ty*sn)*w(e));}
    for(let i=n-2;i>=0;i--)c.lineTo(Q[i][0]-N[i][0]*w(i),Q[i][1]-N[i][1]*w(i));
    const sx=N[0][1],sy=-N[0][0];for(let k=1;k<=8;k++){const th=k/8*Math.PI,cs=Math.cos(th),sn=Math.sin(th);c.lineTo(Q[0][0]+(-N[0][0]*cs-sx*sn)*w(0),Q[0][1]+(-N[0][1]*cs-sy*sn)*w(0));}c.closePath();};}
function drawLimb(c,pts,ws,col,seed,o={}){const path=taperPath(pts,ws);const m=Math.max(...ws)/2;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let i=0;i<pts.length;i+=2){x0=Math.min(x0,pts[i]-m);x1=Math.max(x1,pts[i]+m);y0=Math.min(y0,pts[i+1]-m);y1=Math.max(y1,pts[i+1]+m);}
  part(c,path,{base:col,lit:'top',box:[x0,y0,x1,y1],hi:o.hi??0.3,lo:o.lo??0.45,tex:o.tex===undefined?skinTex(seed,0.5):o.tex,rim:o.rim??0.45,inner:0.35,line:o.line??1.2});
  if(o.knobs!==false){const L=lightDir(c);for(let i=2;i<pts.length-2;i+=2){const w=ws[i/2];fillP(c,c=>E(c,pts[i]+L[0]*w*0.18,pts[i+1]+L[1]*w*0.18,w*0.3,w*0.24),'rgba(225,232,245,0.2)');}}}

// ---- chars.js ----
const CHAR={skin:'#7c8676',hair:'#231f1c',outline:'rgba(6,6,6,0.7)',blood:'#5a0c0a',walkerShirts:['#454c5a','#574636','#3b4636','#625849'],jacket:'#3c5670',pack:'#26251f',cap:'#1f2326',survivorSkin:'#c49a7c',gun:'#17181a'};
function hash(n){const s=Math.sin(n)*43758.5453;return s-Math.floor(s);}
function circ(c,x,y,r){c.beginPath();c.arc(x,y,r,0,TAU);}
function ell(c,x,y,rx,ry){c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);}
function rrect(c,x,y,w,h,r){c.beginPath();R(c,x,y,w,h,r);}
function drawWalker(c,r,variant){
  const seed=5+variant*13;c.lineJoin='round';c.strokeStyle=CHAR.outline;c.lineWidth=Math.max(1,r*0.1);
  const skin=CHAR.skin,shirt=CHAR.walkerShirts[variant%4],len=r*1.25;
  for(const s of[-1,1]){c.fillStyle=skin;rrect(c,0,s*r*0.62-r*0.15,len+s*r*0.08,r*0.3,r*0.15);c.fill();c.stroke();}
  c.fillStyle=shirt;ell(c,-r*0.15,0,r*0.5,r*0.95);c.fill();c.stroke();
  c.fillStyle=CHAR.blood;for(let i=0;i<2;i++){circ(c,-r*0.2+(hash(seed+i)-0.5)*r*0.6,(hash(seed*2+i)-0.5)*r*1.3,r*(0.1+hash(seed+i*5)*0.12));c.fill();}
  c.fillStyle=skin;circ(c,r*0.14,0,r*0.46);c.fill();c.stroke();
  c.fillStyle=CHAR.hair;ell(c,-r*0.04,0,r*0.3,r*0.38);c.fill();
}
// --- brute helpers (round B) ---
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<0?0:t>1?1:t*t*(3-2*t);
/** Closed Catmull-Rom curve through points. */
function smoothClosed(pts){return q=>{const n=pts.length;q.moveTo(pts[0][0],pts[0][1]);for(let i=0;i<n;i++){const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];q.bezierCurveTo(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6,p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6,p2[0],p2[1]);}q.closePath();};}
function blood(c,x,y,rx,ry,seed,a=0.62){fillP(c,q=>blobPath(q,x,y,rx,ry,seed,0.45,40),`rgba(84,12,9,${a})`);fillP(c,q=>blobPath(q,x+rx*0.1,y,rx*0.5,ry*0.5,seed+1,0.4,30),`rgba(40,5,4,${a*0.8})`);}
function wound(c,x,y,s,seed){fillP(c,q=>blobPath(q,x,y,s,s*0.7,seed,0.35,30),'#3a0907');fillP(c,q=>blobPath(q,x,y,s*0.55,s*0.38,seed+3,0.3,24),'#6b1712');strokeP(c,q=>blobPath(q,x,y,s*1.15,s*0.85,seed,0.35,30),'rgba(120,40,35,0.45)',1.2*P);}
function ears(c,hx,hy,rx,col){for(const s of[-1,1])part(c,q=>E(q,hx+s*rx*0.98,hy-0.005,0.022,0.035),{base:col,lit:'radial',box:[hx+s*rx-0.022,hy-0.04,hx+s*rx+0.022,hy+0.03],hi:0.25,lo:0.4,rim:0.2,line:1});}
function bareHead(c,hx,hy,rx,ry,col,seed,o={}){ears(c,hx,hy,rx,col);
  part(c,q=>E(q,hx,hy,rx,ry),{base:col,lit:'radial',box:[hx-rx,hy-ry,hx+rx,hy+ry],hi:0.45,lo:0.55,tex:skinTex(seed,1.2),rim:0.4});
  // brow ridge at the front edge (top-down: the forehead overhang)
  strokeP(c,q=>{q.arc(hx,hy+ry*0.05,ry*0.85,0.55,Math.PI-0.55);},'rgba(0,0,0,0.3)',2.2*P);
  if(o.stubble){c.save();c.beginPath();E(c,hx,hy-0.01,rx*0.96,ry*0.9);c.clip();const r=mulberry(seed+7);for(let i=0;i<160;i++){fillP(c,q=>E(q,hx+(r()-0.5)*rx*2,hy-0.02+(r()-0.5)*ry*1.9,0.0035,0.0035),`rgba(20,17,14,${0.25+r()*0.35})`);}c.restore();}
  if(o.stitch){strokeP(c,q=>{q.moveTo(hx-rx*0.5,hy+ry*0.35);q.quadraticCurveTo(hx,hy+ry*0.05,hx+rx*0.55,hy-ry*0.45);},'#3a0d0a',2.2*P);for(let k=0;k<6;k++){const t=k/5;const x=lerp(hx-rx*0.5,hx+rx*0.55,t),y=lerp(hy+ry*0.35,hy-ry*0.45,t)-Math.sin(t*Math.PI)*0.02;strokeP(c,q=>{q.moveTo(x-0.012,y-0.012);q.lineTo(x+0.012,y+0.012);},'#1d1a16',1.3*P);}}
  if(o.wound)wound(c,hx+rx*0.35,hy-ry*0.25,0.028,seed+9);
  fillP(c,q=>E(q,hx-rx*0.32,hy-ry*0.3,rx*0.32,ry*0.22),'rgba(235,240,245,0.12)');}
/** Text stencilled on the back: letter tops point forward (+y), so it reads upright when the Brute faces up. */
/** spriteArt.drawSurvivor with two hooks: o.held (weapon, under the arms) and o.back (replaces the backpack: tanks). */
function drawSurvivorX(c,r,o={}){
  c.lineJoin='round';c.strokeStyle=CHAR.outline;c.lineWidth=Math.max(1,r*0.08);
  if(o.back){c.save();o.back(c,r);c.restore();}
  if(o.held){c.save();o.held(c,r);c.restore();}else{c.fillStyle=CHAR.gun;rrect(c,r*0.3,-r*0.13,r*1.75,r*0.26,1);c.fill();}
  c.strokeStyle=CHAR.jacket;c.lineCap='round';c.lineWidth=r*0.3;c.beginPath();c.moveTo(0,-r*0.6);c.lineTo(r*0.85,-r*0.1);c.moveTo(0,r*0.6);c.lineTo(r*0.55,r*0.12);c.stroke();
  c.lineCap='butt';c.strokeStyle=CHAR.outline;c.lineWidth=Math.max(1,r*0.08);
  if(!o.back){c.fillStyle=CHAR.pack;rrect(c,-r*0.98,-r*0.48,r*0.5,r*0.96,r*0.15);c.fill();}
  c.fillStyle=CHAR.jacket;ell(c,-r*0.05,0,r*0.52,r*0.9);c.fill();c.stroke();
  if(o.strap){c.save();o.strap(c,r);c.restore();}
  c.fillStyle=CHAR.survivorSkin;circ(c,r*0.12,0,r*0.4);c.fill();c.stroke();
  c.fillStyle=CHAR.cap;ell(c,r*0.02,0,r*0.36,r*0.4);c.fill();c.beginPath();c.ellipse(r*0.38,0,r*0.16,r*0.3,0,-Math.PI/2,Math.PI/2);c.fill();
}
function fist(c,x,y,ang,s,col,seed,up=0){c.save();c.translate(x,y);c.rotate(ang);
  part(c,q=>blobPath(q,0,0,s,s*0.86,seed,0.07,40),{base:col,lit:'radial',box:[-s,-s,s,s],hi:0.34+up*0.22,lo:0.5,rim:0.32,tex:skinTex(seed,0.2),line:1.3});
  for(let k=0;k<4;k++){const yy=(-1.5+k)*s*0.4;fillP(c,q=>E(q,s*0.6,yy,s*0.2,s*0.16),'rgba(225,232,240,0.17)');if(k)strokeP(c,q=>{q.moveTo(s*0.32,yy-s*0.2);q.lineTo(s*0.86,yy-s*0.2);},'rgba(0,0,0,0.38)',1.1*P);}
  fillP(c,q=>blobPath(q,s*0.7,s*0.1,s*0.14,s*0.1,seed+4,0.4,20),'rgba(70,10,8,0.6)');
  c.restore();}

// ---- fx.js ----
// ================= FX: particle fire (port of fire-lab D / fireParticles.ts + fireSprites.ts) =================
// Metres everywhere. A view v = {k: device px per metre, ox, oy: device px of the scene origin}.
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function mk(w,h){const c=document.createElement('canvas');c.width=Math.max(1,w|0);c.height=Math.max(1,h|0);return c;}
function vnoise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);const h=(a,b)=>hash(a*127.1+b*311.7+s*74.7);return lerp(lerp(h(xi,yi),h(xi+1,yi),u),lerp(h(xi,yi+1),h(xi+1,yi+1),u),v);}
function fbm(x,y,s){let a=0,amp=0.5,f=1;for(let o=0;o<4;o++){a+=amp*vnoise(x*f,y*f,s+o*13);f*=2.03;amp*=0.5;}return a/0.9375;}
const FXR=mulberry(90210);
const rr=(a,b)=>a+FXR()*(b-a);

// ---- sprites (made once) ----
const FS=96,VARS=4,STEPS=16;
const RAMP=[[0,255,246,214],[0.1,255,220,125],[0.27,255,158,52],[0.48,240,96,24],[0.7,168,42,12],[1,74,13,6]];
function rampAt(t){for(let i=1;i<RAMP.length;i++)if(t<=RAMP[i][0]){const a=RAMP[i-1],b=RAMP[i],u=(t-a[0])/(b[0]-a[0]);return[lerp(a[1],b[1],u),lerp(a[2],b[2],u),lerp(a[3],b[3],u)];}return RAMP[RAMP.length-1].slice(1);}
let CORE=0;const REACH=new Float32Array(VARS);
const flameMasks=[];
function tintMask(mask,size,rgb){const c=mk(size,size),g=c.getContext('2d'),im=g.createImageData(size,size),d=im.data;for(let i=0;i<size*size;i++){d[i*4]=rgb[0];d[i*4+1]=rgb[1];d[i*4+2]=rgb[2];d[i*4+3]=Math.round(clamp(mask[i],0,1)*255);}g.putImageData(im,0,0);return c;}
function radialSprite(size,stops){const c=mk(size,size),g=c.getContext('2d'),gr=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);for(const[o,col]of stops)gr.addColorStop(o,col);g.fillStyle=gr;g.fillRect(0,0,size,size);return c;}
const SS=96,SVARS=3,STONES=6;
const SMOKE_PALS={
  dark:[[150,112,84],[104,92,84],[84,80,79],[72,70,71],[62,61,63],[56,56,59]],
  black:[[120,82,56],[70,58,50],[50,46,44],[42,40,40],[37,36,37],[34,34,36]],
  grey:[[156,132,112],[124,116,110],[104,101,100],[90,89,90],[78,78,80],[70,70,73]],
  dust:[[150,128,104],[120,110,98],[100,94,86],[88,84,78],[76,73,69],[66,64,62]],
  gas:[[196,206,104],[170,184,86],[146,164,74],[126,146,66],[110,128,60],[96,112,56]],
};
let flameSpr,smokeSpr,emberSpr,coalSpr,groundGlow,gasGlow,flashSpr,blueSpr,greenFlash,scorchSpr,gasDisc,splatSpr,coneGlow;
function buildFx(){
  for(let v=0;v<VARS;v++){const m=new Float32Array(FS*FS);let reach=-1;
    for(let y=0;y<FS;y++)for(let x=0;x<FS;x++){const dx=((x+0.5)/FS)*2-1,dy=((y+0.5)/FS)*2-1,r=Math.hypot(dx,dy),an=Math.atan2(dy,dx);
      const n=fbm(Math.cos(an)*1.7+v*5.1+r*1.4,Math.sin(an)*1.7+r*2.3,11+v*7);const rq=r*(0.72+0.62*n);
      let a=Math.pow(clamp(1-rq,0,1),1.15)*1.45;const q=fbm(dx*4.2+v*9,dy*4.2-v*3,3+v);a*=clamp(0.25+1.25*q*q*1.6,0,1.3);a=clamp(a,0,1);
      m[y*FS+x]=a;if(a>=0.5&&r>CORE)CORE=r;if(a>=0.15){const vv=(y/FS)*2-1;if(-vv>reach)reach=-vv;}}
    REACH[v]=Math.min(1,reach+0.02);flameMasks.push(m);}
  CORE=Math.min(1,CORE+0.02);
  flameSpr=[];for(let s=0;s<STEPS;s++){const rgb=rampAt(s/(STEPS-1));for(let v=0;v<VARS;v++)flameSpr.push(tintMask(flameMasks[v],FS,rgb));}
  const smokeMasks=[];
  for(let v=0;v<SVARS;v++){const m=new Float32Array(SS*SS);
    for(let y=0;y<SS;y++)for(let x=0;x<SS;x++){const dx=((x+0.5)/SS)*2-1,dy=((y+0.5)/SS)*2-1,r=Math.hypot(dx,dy),an=Math.atan2(dy,dx);
      const n=fbm(Math.cos(an)*1.2+v*4.3,Math.sin(an)*1.2+v*2.1,40+v);const rq=r*(0.75+0.5*n);let a=clamp((1-rq)/0.6,0,1);a=a*a*(3-2*a);
      const q=fbm(dx*2.6+v*7,dy*2.6,60+v);a*=0.25+1.9*q*q;m[y*SS+x]=clamp(a,0,1);}
    smokeMasks.push(m);}
  smokeSpr={};for(const k in SMOKE_PALS){smokeSpr[k]=[];for(let t=0;t<STONES;t++)for(let v=0;v<SVARS;v++)smokeSpr[k].push(tintMask(smokeMasks[v],SS,SMOKE_PALS[k][t]));}
  emberSpr=radialSprite(32,[[0,'rgba(255,246,210,1)'],[0.18,'rgba(255,200,110,0.9)'],[0.45,'rgba(255,130,40,0.25)'],[1,'rgba(255,90,20,0)']]);
  coalSpr=radialSprite(64,[[0,'rgba(255,170,70,0.9)'],[0.35,'rgba(230,80,20,0.45)'],[1,'rgba(160,30,10,0)']]);
  groundGlow=radialSprite(256,[[0,'rgba(255,160,70,1)'],[0.5,'rgba(255,118,40,0.62)'],[0.9,'rgba(235,80,25,0.36)'],[0.985,'rgba(220,70,20,0.18)'],[1,'rgba(220,70,20,0)']]);
  gasGlow=radialSprite(128,[[0,'rgba(200,230,90,1)'],[0.45,'rgba(170,205,70,0.45)'],[1,'rgba(140,180,60,0)']]);
  flashSpr=radialSprite(256,[[0,'rgba(255,255,245,1)'],[0.18,'rgba(255,240,190,0.95)'],[0.45,'rgba(255,170,80,0.5)'],[0.8,'rgba(255,110,40,0.14)'],[1,'rgba(255,90,30,0)']]);
  greenFlash=radialSprite(256,[[0,'rgba(250,255,220,1)'],[0.2,'rgba(220,240,140,0.85)'],[0.5,'rgba(170,205,80,0.4)'],[1,'rgba(120,160,50,0)']]);
  blueSpr=radialSprite(64,[[0,'rgba(235,245,255,1)'],[0.3,'rgba(120,170,255,0.75)'],[0.7,'rgba(60,90,255,0.2)'],[1,'rgba(40,60,255,0)']]);
  // scorch: dark noisy disc, soft inside, ragged edge ending at the sprite edge (drawn 2R wide = the blast edge)
  {const S=256;scorchSpr=mk(S,S);const g=scorchSpr.getContext('2d'),im=g.createImageData(S,S),d=im.data;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const dx=((x+0.5)/S)*2-1,dy=((y+0.5)/S)*2-1,r=Math.hypot(dx,dy),i=(y*S+x)*4;if(r>=1){d[i+3]=0;continue;}
      const an=Math.atan2(dy,dx);const n=fbm(dx*5,dy*5,7),streak=0.5+0.5*Math.sin(an*23+fbm(dx*2,dy*2,3)*6);
      const edge=0.86+0.12*fbm(Math.cos(an)*3,Math.sin(an)*3,9);let a=r<edge?0.55+0.35*(1-r)+0.2*(n-0.5):clamp((1-r)/(1-edge),0,1)*0.55;
      a*=0.8+0.25*streak*clamp(r*1.4,0,1);d[i]=12+n*14|0;d[i+1]=10+n*11|0;d[i+2]=9+n*9|0;d[i+3]=clamp(a,0,1)*255|0;}
    g.putImageData(im,0,0);}
  // gas cloud disc: noisy yellow-green fog with a firm edge exactly at the sprite edge (drawn 2R wide)
  {const S=256;gasDisc=mk(S,S);const g=gasDisc.getContext('2d'),im=g.createImageData(S,S),d=im.data;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const dx=((x+0.5)/S)*2-1,dy=((y+0.5)/S)*2-1,r=Math.hypot(dx,dy),i=(y*S+x)*4;if(r>=1){d[i+3]=0;continue;}
      const n=fbm(dx*3.2+4,dy*3.2,21),m=fbm(dx*7,dy*7,33);let a=(0.32+0.5*n*n+0.12*m)*(0.75+0.25*r);
      const edge=clamp((1-r)/0.035,0,1);a=a*edge+0.28*clamp(1-Math.abs(r-0.975)/0.025,0,1);
      d[i]=150+60*n|0;d[i+1]=168+50*n|0;d[i+2]=62+30*m|0;d[i+3]=clamp(a,0,1)*255|0;}
    g.putImageData(im,0,0);}
  // bile splats (gore-free): 4 shapes, dark olive with a wet rim
  splatSpr=[];for(let v=0;v<4;v++){const S=64,c=mk(S,S),g=c.getContext('2d');g.translate(S/2,S/2);g.scale(S/2,S/2);P=2/S;
    fillP(g,q=>blobPath(q,0,0,0.62,0.5,700+v,0.38,40),'rgba(52,58,26,0.92)');fillP(g,q=>blobPath(q,-0.08,-0.06,0.34,0.26,710+v,0.3,30),'rgba(98,110,44,0.75)');
    const r=mulberry(720+v);for(let i=0;i<6;i++){const a=r()*TAU,d=0.6+r()*0.3;fillP(g,q=>E(q,Math.cos(a)*d,Math.sin(a)*d,0.05+r()*0.08,0.04+r()*0.06),'rgba(60,68,30,0.9)');}
    fillP(g,q=>E(q,-0.2,-0.2,0.12,0.07),'rgba(220,235,170,0.35)');splatSpr.push(c);}
  // flamethrower ground light: a sector of exactly 35° x 4 m, soft inside, ending at the cone edge
  {const S=320,c=mk(S,S),g=c.getContext('2d'),im=g.createImageData(S,S),d=im.data;const half=FT_HALF;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const lx=(x+0.5)/S,ly=((y+0.5)/S)*2-1;const dd=Math.hypot(lx,ly),an=Math.abs(Math.atan2(ly,lx)),i=(y*S+x)*4;
      if(dd>=1||an>=half){d[i+3]=0;continue;}const ed=Math.min((1-dd)/0.12,(half-an)/0.12,1);const a=clamp(ed,0,1)*(0.35+0.65*Math.pow(dd,0.6));
      d[i]=255;d[i+1]=130;d[i+2]=45;d[i+3]=clamp(a,0,1)*255|0;}
    g.putImageData(im,0,0);coneGlow=c;}
}
const FT_RANGE=4,FT_HALF=17.5*Math.PI/180;

// ---- pools (fixed typed arrays; no allocation after construction) ----
class Pool{
  constructor(cap){this.cap=cap;this.n=0;this.cur=0;this.al=new Uint8Array(cap);
    for(const f of['x','y','vx','vy','age','life','s','s1','seed','a','z','vz','rot','vr'])this[f]=new Float32Array(cap);
    this.mode=0;this.r0=0;this.rk=1;}
  spawn(){if(this.n>=this.cap)return -1;for(let k=0;k<this.cap;k++){const i=(this.cur+k)%this.cap;if(!this.al[i]){this.al[i]=1;this.n++;this.cur=(i+1)%this.cap;this.age[i]=0;this.seed[i]=FXR();this.a[i]=1;this.z[i]=0;this.vz[i]=0;this.rot[i]=0;this.vr[i]=0;return i;}}return -1;}
  clear(){this.al.fill(0);this.n=0;}
}
function put(P,x,y,vx,vy,s,s1,life){const i=P.spawn();if(i<0)return -1;if(s1>0)P.a[i]=0.6+0.4*FXR();P.x[i]=x;P.y[i]=y;P.vx[i]=vx;P.vy[i]=vy;P.s[i]=s;P.s1[i]=s1;P.life[i]=life;return i;}
function age(P,i,dt){const a=(P.age[i]+=dt);if(a>=P.life[i]){P.al[i]=0;P.n--;return false;}return true;}
const WIND_X=0.55,WIND_Y=0.32;
function stepFlames(P,dt,T,buoy,turb,lean,drag){const dd=Math.max(0,1-drag*dt);
  for(let i=0;i<P.cap;i++){if(!P.al[i]||!age(P,i,dt))continue;const x=P.x[i],y=P.y[i],s=P.seed[i];
    const tx=Math.sin(T*5.3+y*3.1+s*40)+0.6*Math.sin(T*11.7+x*5.3+s*17),ty=Math.cos(T*4.1+x*2.7+s*23);
    P.vx[i]=(P.vx[i]+(tx*turb+WIND_X*lean)*dt)*dd;P.vy[i]=(P.vy[i]+(ty*turb*0.5-buoy+WIND_Y*lean*0.5)*dt)*dd;P.x[i]=x+P.vx[i]*dt;P.y[i]=y+P.vy[i]*dt;}}
/** A jet: drag along the motion, turbulence and lift that grow with age (the core stays straight). */
function stepJet(P,dt,T,drag,turb,buoy){const dd=Math.max(0,1-drag*dt);
  for(let i=0;i<P.cap;i++){if(!P.al[i]||!age(P,i,dt))continue;const t=P.age[i]/P.life[i],x=P.x[i],y=P.y[i],s=P.seed[i];
    const tx=Math.sin(T*6.1+y*3.3+s*40)+0.6*Math.sin(T*12.7+x*4.3+s*17),ty=Math.cos(T*4.7+x*2.9+s*23)+0.5*Math.sin(T*9.3+s*11);
    P.vx[i]=(P.vx[i]+tx*turb*t*dt)*dd;P.vy[i]=(P.vy[i]+(ty*turb*t-buoy*t)*dt)*dd;P.x[i]=x+P.vx[i]*dt;P.y[i]=y+P.vy[i]*dt;}}
function stepSmoke(P,dt,T){for(let i=0;i<P.cap;i++){if(!P.al[i]||!age(P,i,dt))continue;const s=P.seed[i];const tx=Math.sin(T*0.9+P.y[i]*1.3+s*30)*0.35+(s-0.5)*0.5;
  P.vx[i]+=(WIND_X+tx-P.vx[i])*0.9*dt;P.vy[i]+=(WIND_Y-0.18-P.vy[i])*0.7*dt;P.x[i]+=P.vx[i]*dt;P.y[i]+=P.vy[i]*dt;}}
/** Slow drifting puffs (gas): little wind, strong drag, a slow swirl. */
function stepDrift(P,dt,T){const dd=Math.max(0,1-2.2*dt);for(let i=0;i<P.cap;i++){if(!P.al[i]||!age(P,i,dt))continue;const s=P.seed[i];
  P.vx[i]=(P.vx[i]+(Math.sin(T*0.7+s*20)*0.12+0.05)*dt)*dd;P.vy[i]=(P.vy[i]+(Math.cos(T*0.6+s*30)*0.12+0.03)*dt)*dd;P.x[i]+=P.vx[i]*dt;P.y[i]+=P.vy[i]*dt;P.rot[i]+=P.vr[i]*dt;}}
function stepEmbers(P,dt,T,turb){const dd=Math.max(0,1-0.9*dt);for(let i=0;i<P.cap;i++){if(!P.al[i]||!age(P,i,dt))continue;const s=P.seed[i];
  P.vx[i]=(P.vx[i]+(Math.sin(T*7+s*50+P.y[i]*4)*turb+WIND_X*0.8)*dt)*dd;P.vy[i]=(P.vy[i]+(Math.cos(T*6+s*31)*turb*0.6-0.35)*dt)*dd;P.x[i]+=P.vx[i]*dt;P.y[i]+=P.vy[i]*dt;}}
/** Ballistic bits (debris, droplets, scraps): height z with gravity, a bounce, ground friction; spin. */
function stepBallistic(P,dt,bounce){for(let i=0;i<P.cap;i++){if(!P.al[i]||!age(P,i,dt))continue;
  if(P.z[i]>0||P.vz[i]>0){P.vz[i]-=9.8*dt;P.z[i]+=P.vz[i]*dt;if(P.z[i]<=0){P.z[i]=0;P.vz[i]=-P.vz[i]*bounce;if(P.vz[i]<0.6)P.vz[i]=0;P.vx[i]*=0.45;P.vy[i]*=0.45;P.vr[i]*=0.5;}}
  else{const f=Math.max(0,1-8*dt);P.vx[i]*=f;P.vy[i]*=f;P.vr[i]*=f;}
  P.x[i]+=P.vx[i]*dt;P.y[i]+=P.vy[i]*dt;P.rot[i]+=P.vr[i]*dt;}}

// ---- the edge rule: how far the bright core may reach from (x, y) inside the zone ----
// fit = {kind: 0 none | 1 circle (cx, cy, R) | 2 sector (ox, oy, ca, sa, half, range)}
function fitAllow(f,x,y){if(f.kind===1)return f.R-Math.hypot(x-f.cx,y-f.cy);
  const dx=x-f.ox,dy=y-f.oy,lx=dx*f.ca+dy*f.sa,ly=-dx*f.sa+dy*f.ca,d=Math.hypot(lx,ly);if(d<1e-4)return 0;const a=Math.abs(Math.atan2(ly,lx));if(a>=f.half)return -1;
  return Math.min(f.range-d,d*Math.sin(f.half-a));}
function inFit(f,x,y){return f.kind===0||fitAllow(f,x,y)>0;}

// ---- drawing ----
function growLab(t){return t<0.18?0.5+0.5*(t/0.18):1-0.62*((t-0.18)/0.82);}
/** Flames (additive). P.mode 0: lab grow-then-shrink; 1: jet (s → s1 with age). Colour = ramp from P.r0, P.rk per life. */
function drawFlames(ctx,v,P,fit,am){ctx.globalCompositeOperation='lighter';const k=v.k;am=am??1;
  for(let i=0;i<P.cap;i++){if(!P.al[i])continue;const t=P.age[i]/P.life[i];
    const size=P.mode?(P.s[i]+(P.s1[i]-P.s[i])*Math.sqrt(t))*(t>0.8?1-(t-0.8)*2.2:1):P.s[i]*growLab(t);
    const vx=P.vx[i],vy=P.vy[i],sp=Math.sqrt(vx*vx+vy*vy);const st=1+Math.min(P.mode?1.3:0.9,sp*(P.mode?0.12:0.55));
    let L=size*st,H=size*(1-(st-1)*0.25);const x=P.x[i],y=P.y[i];const vi=((P.seed[i]*97)|0)%VARS;
    if(fit&&fit.kind){const allow=fitAllow(fit,x,y),core=CORE*Math.max(L,H)*0.5;if(core>allow){if(allow<0.02)continue;const f=allow/core;L*=f;H*=f;}}
    let cs=0,sn=-1;if(sp>0.05){cs=vx/sp;sn=vy/sp;}
    const step=Math.min(STEPS-1,((P.r0+t*P.rk)*STEPS)|0);
    ctx.globalAlpha=(t<0.08?t/0.08:1)*P.a[i]*am;ctx.setTransform(cs*L*k,sn*L*k,-sn*H*k,cs*H*k,v.ox+x*k,v.oy+y*k);ctx.drawImage(flameSpr[step*VARS+vi],-0.5,-0.5,1,1);}}
/** Smoke (normal blend). thinR > 0: puffs thin out within thinR of (tx, ty) so they never hide the flame core. */
function drawSmoke(ctx,v,P,pal,amax,tx,ty,thinR){ctx.globalCompositeOperation='source-over';const k=v.k,spr=smokeSpr[pal];
  for(let i=0;i<P.cap;i++){if(!P.al[i])continue;const t=P.age[i]/P.life[i],u=1-t;const size=P.s[i]+(P.s1[i]-P.s[i])*(1-u*u);
    let fz=1;if(thinR>0){const d=Math.hypot(P.x[i]-tx,P.y[i]-ty);fz=clamp((d-thinR*0.5)/thinR,0.18,1);}
    const a=amax*P.a[i]*fz*(t<0.2?t/0.2:Math.pow(u/0.8,1.2));const s=P.seed[i],rot=s*TAU+P.age[i]*(s<0.5?-0.3:0.3)+P.rot[i];
    const cs=Math.cos(rot)*size*k,sn=Math.sin(rot)*size*k;ctx.globalAlpha=Math.min(0.75,a);ctx.setTransform(cs,sn,-sn,cs,v.ox+P.x[i]*k,v.oy+P.y[i]*k);
    ctx.drawImage(spr[Math.min(STONES-1,(t*STONES*1.15)|0)*SVARS+(((s*31)|0)%SVARS)],-0.5,-0.5,1,1);}}
function drawEmbers(ctx,v,P,fit,am){ctx.globalCompositeOperation='lighter';const k=v.k;am=am??1;
  for(let i=0;i<P.cap;i++){if(!P.al[i])continue;const t=P.age[i]/P.life[i],x=P.x[i],y=P.y[i];const vx=P.vx[i],vy=P.vy[i],sp=Math.sqrt(vx*vx+vy*vy);
    const st=1+Math.min(2.2,sp*0.9),size=P.s[i]*5*(1-t*0.5),L=size*st,H=size;
    let a=(0.55+0.45*Math.sin(P.age[i]*26+P.seed[i]*40))*Math.pow(1-t,0.7);if(fit&&fit.kind&&!inFit(fit,x,y))a=Math.min(a,0.45);
    let cs=0,sn=-1;if(sp>0.05){cs=vx/sp;sn=vy/sp;}ctx.globalAlpha=a*am;ctx.setTransform(cs*L*k,sn*L*k,-sn*H*k,cs*H*k,v.ox+x*k,v.oy+y*k);ctx.drawImage(emberSpr,-0.5,-0.5,1,1);}}
/** Ballistic bits: a shadow on the ground (offset by height) and the bit lifted by z. cols = colour list chosen by seed. */
function drawBits(ctx,v,P,cols,fadeK){const k=v.k;ctx.globalCompositeOperation='source-over';
  for(let i=0;i<P.cap;i++){if(!P.al[i])continue;const t=P.age[i]/P.life[i],z=P.z[i],s=P.s[i]*(1+z*0.25);const a=fadeK?Math.min(1,(1-t)*fadeK):1;
    const cs=Math.cos(P.rot[i]),sn=Math.sin(P.rot[i]);
    if(z>0.02){ctx.globalAlpha=0.35*a;ctx.setTransform(cs*s*k,sn*s*k,-sn*s*k*0.7,cs*s*k*0.7,v.ox+(P.x[i]+z*0.35)*k,v.oy+(P.y[i]+z*0.45)*k);ctx.fillStyle='#000';ctx.fillRect(-0.5,-0.5,1,1);}
    ctx.globalAlpha=a;ctx.setTransform(cs*s*k,sn*s*k,-sn*s*k*(0.55+P.seed[i]*0.4),cs*s*k*(0.55+P.seed[i]*0.4),v.ox+P.x[i]*k,v.oy+(P.y[i]-z*0.15)*k);
    ctx.fillStyle=cols[((P.seed[i]*97)|0)%cols.length];ctx.fillRect(-0.5,-0.5,1,1);}}
function drawImg(ctx,v,img,x,y,w,h,rot,alpha,comp){const k=v.k,cs=Math.cos(rot),sn=Math.sin(rot);ctx.globalCompositeOperation=comp||'source-over';ctx.globalAlpha=alpha;
  ctx.setTransform(cs*w*k,sn*w*k,-sn*h*k,cs*h*k,v.ox+x*k,v.oy+y*k);ctx.drawImage(img,-0.5,-0.5,1,1);}
/** One edge flame at (x, y) facing outward (angle `out`), height h; its bright edge ends `REACH*h/2` outward of its centre. */
function edgeFlame(ctx,v,x,y,out,h,alpha,fr,tint){const k=v.k,rot=out+Math.PI/2,cs=Math.cos(rot),sn=Math.sin(rot),w=h*2;
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;ctx.setTransform(cs*w*k,sn*w*k,-sn*h*k,cs*h*k,v.ox+x*k,v.oy+y*k);ctx.drawImage(flameSpr[tint*VARS+fr],-0.5,-0.5,1,1);}
function flick(T,s){return 0.72+0.14*Math.sin(T*13.1+s)+0.09*Math.sin(T*29.7+s*2.3)+0.05*Math.sin(T*51.3+s*5.1);}
function resetCtx(ctx){ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.setTransform(DPR,0,0,DPR,0,0);}
/** The ring at a damage edge (logical px transform must be the view's). */
function ringLine(ctx,v,x,y,R,col,alpha,lw,dash){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;ctx.setTransform(1,0,0,1,0,0);
  ctx.strokeStyle=col;ctx.lineWidth=lw*DPR;if(dash)ctx.setLineDash(dash);ctx.beginPath();ctx.arc(v.ox+x*v.k,v.oy+y*v.k,R*v.k,0,TAU);ctx.stroke();if(dash)ctx.setLineDash(NODASH);}
const NODASH=[];

function bodyFire(){return{fl:new Pool(30),sm:new Pool(10),em:new Pool(14),acc:new Float32Array(3),burn:0};}
function stepBodyFire(B,dt,T,x,y,r,burning){B.burn=burning?Math.min(1,B.burn+dt*5):Math.max(0,B.burn-dt/0.9);const b=B.burn,k=r/0.4;
  B.acc[0]+=60*b*dt;while(B.acc[0]>=1){B.acc[0]--;const a=rr(0,TAU),d=Math.sqrt(FXR())*0.32*k;put(B.fl,x+Math.cos(a)*d,y+Math.sin(a)*d,rr(-0.2,0.2),rr(-1.1,-0.5),rr(0.26,0.42)*k*(0.6+0.4*b),0,rr(0.28,0.5));}
  B.acc[1]+=5*b*dt;while(B.acc[1]>=1){B.acc[1]--;put(B.sm,x+rr(-0.2,0.2)*k,y-0.3*k,0,-0.4,0.3*k,rr(1.1,1.5)*k,rr(1.6,2.2));}
  B.acc[2]+=12*b*dt;while(B.acc[2]>=1){B.acc[2]--;put(B.em,x+rr(-0.3,0.3)*k,y+rr(-0.3,0.3)*k,rr(-0.4,0.4),rr(-2,-0.8),rr(0.04,0.065),0,rr(0.5,1.1));}
  stepFlames(B.fl,dt,T,1.2,1.4,0.2,1.2);stepSmoke(B.sm,dt,T);stepEmbers(B.em,dt,T,2.5);}

// ================= ROUND D =================
const QS=new URLSearchParams(location.search);
const FREEZE=QS.has('t')?+QS.get('t'):null;
let STATIC=false;
const PPM=48;
function bgAsphalt(W,H,seed,o){const b=mk(W*DPR,H*DPR),g=b.getContext('2d');g.setTransform(DPR,0,0,DPR,0,0);asphalt(g,W,H,seed,o||{});return b;}
function bgCharcoal(W,H){const b=mk(W*DPR,H*DPR),g=b.getContext('2d');g.setTransform(DPR,0,0,DPR,0,0);charcoal(g,W,H);return b;}
function prep(cv,W,H){if(cv.width!==W*DPR||cv.height!==H*DPR){cv.width=W*DPR;cv.height=H*DPR;}const c=cv.getContext('2d');resetCtx(c);c.filter='none';c.setTransform(1,0,0,1,0,0);return c;}
function label(c,x,y,txt,col,align){c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';c.setTransform(DPR,0,0,DPR,0,0);c.font='500 9.5px "JetBrains Mono", ui-monospace, monospace';c.textAlign=align||'center';c.textBaseline='alphabetic';c.fillStyle=col||'rgba(230,228,220,0.62)';c.fillText(txt,x,y);c.restore();}
function scaleBar(c,x,y,ppm){ppm=ppm||48;c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';c.setTransform(DPR,0,0,DPR,0,0);c.fillStyle='rgba(230,228,220,0.6)';c.fillRect(x,y,ppm,1.5);c.fillRect(x,y-4,1.5,9);c.fillRect(x+ppm-1.5,y-4,1.5,9);c.restore();label(c,x+ppm/2,y-6,'1 m');}
function panel(c,x,y,w,h){c.save();c.setTransform(DPR,0,0,DPR,0,0);c.fillStyle='rgba(8,9,11,0.6)';c.strokeStyle='rgba(255,255,255,0.08)';c.beginPath();c.roundRect?c.roundRect(x,y,w,h,8):c.rect(x,y,w,h);c.fill();c.stroke();c.restore();}
const BAKES=new Map();
function bakeChar(key,fn,rpx,ext){if(BAKES.has(key))return BAKES.get(key);const S=Math.ceil(2*ext*rpx*DPR),cv=mk(S,S),c=cv.getContext('2d');c.setTransform(DPR,0,0,DPR,S/2,S/2);P=1;fn(c,rpx);BAKES.set(key,cv);return cv;}
/** An object drawn in metres round (0, 0), baked at ppm px/m; ext = half-size in metres. */
function bakeObj(key,fn,ppm,ext){if(BAKES.has(key))return BAKES.get(key);const S=Math.ceil(2*ext*ppm*DPR),cv=mk(S,S),c=cv.getContext('2d');c.setTransform(ppm*DPR,0,0,ppm*DPR,S/2,S/2);P=1/ppm;fn(c);BAKES.set(key,cv);return cv;}
function putImg(c,img,x,y,face,a){const w=img.width/DPR;c.setTransform(DPR,0,0,DPR,0,0);c.globalAlpha=a??1;c.globalCompositeOperation='source-over';c.translate(x,y);c.rotate(face||0);c.drawImage(img,-w/2,-w/2,w,w);c.setTransform(DPR,0,0,DPR,0,0);c.globalAlpha=1;}
function walkerBake(variant,rpx){return bakeChar('w'+variant+rpx,(c,r)=>drawWalker(c,r,variant),rpx,1.7);}
function survBake(rpx){return bakeChar('s'+rpx,(c,r)=>drawSurvivorX(c,r,{}),rpx,2.8);}
function rod(c,path,w,col){strokeP(c,path,'rgba(4,4,6,0.95)',w+2*P);strokeP(c,path,col,w);c.save();c.translate(-w*0.15,-w*0.2);strokeP(c,path,'rgba(220,228,240,0.28)',w*0.3);c.restore();}
function shadowOf(c,path,dx,dy,blur,a){castShadow(c,q=>{q.beginPath();path(q);q.fill();},dx,dy,blur,a);}
const NODASH2=[],DASH_AIM=[5,4];

// ================= FLOODLIGHTS (metres, centre 0,0, footprint ±0.5) =================
const LAMP='255,238,205';
function lensGlow(c,x,y,r,a){glow(c,x,y,r,LAMP,a);glow(c,x,y,r*0.35,'255,250,235',Math.min(1,a*1.3));}
