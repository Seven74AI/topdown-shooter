// ================= COLLAPSE (stage 5) =================
// Real slice: the apartments' corner, the north crosswalk and the gas station forecourt (24 × 13.5 m).
const CO_V={x0:10,y0:2,w:VW,h:VH};
const CO_ME=[22.4,9.3];            // the local player = centre of the screen
let FOGTEX=null;
function buildFogTex(){const S=192;FOGTEX=mk(S,S);const g=FOGTEX.getContext('2d'),im=g.createImageData(S,S),d=im.data;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const u=x/S,v=y/S;// tileable: blend 4 shifted samples
    const f=(a,b)=>fbm(a*4,b*4,5);const n=f(u,v)*(1-u)*(1-v)+f(u-1,v)*u*(1-v)+f(u,v-1)*(1-u)*v+f(u-1,v-1)*u*v;const i=(y*S+x)*4;d[i]=d[i+1]=d[i+2]=255;d[i+3]=clamp((n-0.25)*1.9,0,1)*255|0;}
  g.putImageData(im,0,0);}
function deadLampHead(c,x,y){fillP(c,q=>E(q,x,y,0.16,0.16),'#1b1c1f');strokeP(c,q=>E(q,x,y,0.16,0.16),'rgba(0,0,0,0.9)',1.2*P);fillP(c,q=>E(q,x-0.03,y-0.03,0.07,0.07),'rgba(160,170,190,0.25)');}
function fallenLamp(c,x,y,a,L){c.save();c.translate(x,y);c.rotate(a);castShadow(c,q=>{q.beginPath();R(q,0,-0.06,L,0.12);q.fill();},0.12,0.16,0.05,0.6);
  part(c,q=>R(q,0,-0.06,L,0.12,0.04),{base:'#3d4046',lit:'top',box:[0,-0.06,L,0.06],tex:steelTex(41,0.8),hi:0.4,lo:0.5,line:1.1});
  part(c,q=>R(q,L-0.1,-0.17,0.5,0.34,0.08),{base:'#2a2c30',lit:'top',box:[L-0.1,-0.17,L+0.4,0.17],tex:steelTex(43,0.6),line:1.2});
  fillP(c,q=>E(q,L+0.15,0,0.12,0.1),'rgba(190,200,215,0.35)');for(let i=0;i<8;i++)fillP(c,q=>E(q,L+0.5+Math.cos(i)*0.3,Math.sin(i*2.3)*0.3,0.03,0.02),'rgba(200,215,230,0.4)');
  strokeP(c,q=>{q.moveTo(0,0);q.bezierCurveTo(-0.5,0.4,-0.9,-0.2,-1.4,0.3);},'#0e0e10',0.035);c.restore();}
function collapseExtra(){return g=>{
  // a burnt-out car at the north curb (curb_car_north 20–22 × 0–4.5, nose down): the fire lights the top of the screen
  g.save();g.translate(21*MPX,2.25*MPX);g.rotate(Math.PI/2);CITY.drawCharredCar(g,4.5*MPX,2*MPX,3);g.restore();
  inMetres(g,c=>{const m='concrete';
    brokenRoof(c,[14.2,10,18,10,18,6.4,17.1,6.9,16.6,6.2,15.8,7.4,15.0,7.2,14.6,8.6,14.0,8.9],121,m); // apartments' SE corner
    rubblePile(c,16.4,10.9,3.0,1.1,221,m);rubblePile(c,13.1,10.7,1.6,0.8,223,m);
    rubblePile(c,26.6,13.1,2.0,1.5,231,m);rubblePile(c,11.6,14.6,2.0,1.5,233,m);
    fallenLamp(c,19.85,11.8,0.45,3.2);
    for(const[x,y]of LAMPS_M)if(x>CO_V.x0&&x<CO_V.x0+VW&&y>CO_V.y0&&y<CO_V.y0+VH&&!(Math.abs(x-19.8)<0.4&&Math.abs(y-11.8)<0.4))deadLampHead(c,x,y);
    const r=mulberry(78);for(let i=0;i<46;i++){const x=10+r()*24,y=2+r()*13.5;if(x>11&&x<18&&y<10)continue;if(x>28&&y<12&&r()<0.5)continue;chunk(c,x,y,0.04+r()*0.07,r()*3,MATS[m].cols[i%4],960+i);}
    // papers and glass on the forecourt
    for(let i=0;i<14;i++){const x=28.5+r()*5,y=9+r()*3;c.save();c.translate(x,y);c.rotate(r()*3);fillP(c,q=>R(q,-0.09,-0.06,0.18,0.12),'rgba(205,200,185,0.55)');c.restore();}
  });};}
const COS=[
  {id:'CO1',name:'Dead grid',fog:'haze',desc:'Power out everywhere: dead lamp heads, black shop windows, a streetlight fallen across the sidewalk. The only warm light is fire. The fog is a soft grey-blue haze closing in beyond 10 m: Walkers out there fade into it.'},
  {id:'CO2',name:'Rolling fog bank',fog:'bank',desc:'The same dead street, but the fog is a living bank of mist that drifts with the wind and sends thin wisps inside the 10 m circle. Most atmospheric; the 10 m edge feels like a wall you can almost see.'},
  {id:'CO3',name:'Ash fall',fog:'ash',desc:'The rain has turned to falling ash: grey flakes drift down, the fog is brown smoke, and the sky over one edge of the map glows orange from the city burning beyond the district.'},
  {id:'CO4',name:'Flooded street',fog:'flood',desc:'A burst water main has flooded the gutters: big black puddles mirror the fires and flashlights, heavy rain hisses on them. The fog is low and white over the water.'},
];
function fogLayer(c,o,v,W,H,F,R,T){const me=CO_ME;const k=v.k;const[mx,my]=[v.ox+me[0]*k,v.oy+me[1]*k];c.setTransform(1,0,0,1,0,0);
  const col=F.fog==='ash'?'40,33,28':F.fog==='flood'?'70,78,90':F.fog==='bank'?'44,50,60':'30,35,45';
  const inner=(R-1.6)*k,outer=R*k;
  if(F.fog==='bank'){if(!FOGTEX)buildFogTex();const ts=6*k;// two drifting noise layers, masked by distance
    if(!o._fg||o._fg.width!==c.canvas.width||o._fg.height!==c.canvas.height)o._fg=mk(c.canvas.width,c.canvas.height);const f=o._fg.getContext('2d');f.setTransform(1,0,0,1,0,0);f.globalCompositeOperation='source-over';f.clearRect(0,0,o._fg.width,o._fg.height);
    for(let L=0;L<2;L++){const p=f.createPattern(FOGTEX,'repeat');const ox=(T*(0.35+L*0.2)*k)%ts,oy=(T*0.12*k)%ts;p.setTransform(new DOMMatrix().translate(v.ox+ox+L*97,v.oy+oy+L*53).scale(ts/FOGTEX.width));f.globalAlpha=L?0.55:0.8;f.fillStyle=p;f.fillRect(0,0,o._fg.width,o._fg.height);}
    f.globalAlpha=1;f.globalCompositeOperation='source-in';f.fillStyle=`rgb(${col})`;f.fillRect(0,0,o._fg.width,o._fg.height);
    f.globalCompositeOperation='destination-in';const g=f.createRadialGradient(mx,my,inner*0.55,mx,my,outer);g.addColorStop(0,'rgba(0,0,0,0.12)');g.addColorStop(0.75,'rgba(0,0,0,0.6)');g.addColorStop(1,'rgba(0,0,0,1)');f.fillStyle=g;f.fillRect(0,0,o._fg.width,o._fg.height);
    c.drawImage(o._fg,0,0);
    const g2=c.createRadialGradient(mx,my,inner,mx,my,outer*1.05);g2.addColorStop(0,`rgba(${col},0)`);g2.addColorStop(1,`rgba(${col},0.78)`);c.fillStyle=g2;c.fillRect(0,0,c.canvas.width,c.canvas.height);}
  else{const g=c.createRadialGradient(mx,my,inner,mx,my,outer);g.addColorStop(0,`rgba(${col},0)`);g.addColorStop(1,`rgba(${col},${F.fog==='flood'?0.8:0.9})`);c.fillStyle=g;c.fillRect(0,0,c.canvas.width,c.canvas.height);}
  resetCtx(c);}
function ashFall(c,v,W,H,T){c.setTransform(DPR,0,0,DPR,0,0);const kk=v.k/DPR,N=Math.round(W*H/kk/kk*0.35);
  for(let i=0;i<N;i++){const ph=hash(i*7.7),sp=0.35+hash(i*3.3)*0.3,tt=T*sp+ph,cyc=Math.floor(tt),u=tt-cyc;const x=(hash(cyc*2.1+i*5.3)*W+Math.sin(T*0.8+i)*kk*0.4+u*kk*1.2)%W,y=hash(cyc*4.7+i*1.9)*H+u*kk*0.8;
    const s=(0.03+hash(i)*0.04)*kk;c.globalAlpha=0.55*Math.sin(u*Math.PI);c.fillStyle=hash(i*9)<0.15?'#ff9a4a':'#b8b2a8';c.beginPath();c.ellipse(x,y,s,s*0.6,i,0,TAU);c.fill();}
  c.globalAlpha=1;}
/** the zombies of a scene that walk toward the local player on a loop; each [x,y,variant,speed] */
function crowd(list,T,me,loop){return list.map(([x,y,vv,sp],i)=>{const L=loop||9,u=((T*(sp||0.25)/L+hash(i*3.1))%1);const d=Math.hypot(me[0]-x,me[1]-y)||1,trav=Math.max(0,Math.min(d-2.2-hash(i)*1.5,u*L*1.1));return[x+(me[0]-x)/d*trav,y+(me[1]-y)/d*trav,vv,Math.atan2(me[1]-y,me[0]-x),u];});}
function eyes(c,v,x,y,face,col){setW(c,v);const ex=x+Math.cos(face)*0.13,ey=y+Math.sin(face)*0.13,px=-Math.sin(face)*0.08,py=Math.cos(face)*0.08;c.fillStyle=col||'rgba(236,226,150,0.9)';c.beginPath();c.arc(ex+px,ey+py,0.035,0,TAU);c.arc(ex-px,ey-py,0.035,0,TAU);c.fill();resetCtx(c);}
function inCone(px,py,f,half,len,x,y){const dx=x-px,dy=y-py,d=Math.hypot(dx,dy);if(d>len)return false;return(dx*Math.cos(f)+dy*Math.sin(f))/(d||1)>Math.cos(half);}
const CO_ZS=[[30.5,6.2,0,0.3],[33.4,11.6,1,0.25],[11.2,4.4,2,0.22],[10.6,12.4,3,0.3],[27.4,14.8,0,0.28],[16.4,14.6,1,0.24],[33.6,3.2,2,0.2],[12.8,7.6,3,0.26],[25.8,4.0,1,0.3]];
function makeCollapseCard(F,i){return{kind:'map',id:F.id,name:F.name,desc:F.desc,F,seed:2000+i*13,anim:true,V:CO_V,focus:CO_ME,stripH:320,mode:'wave',
  segs:[{key:'mode',aria:'phase',opts:[['wave','wave · blackout + fog 10 m'],['build','build · half dark + fog 14 m']]}],stripR:'fog edge 10 m from you',
  bake:()=>cityBake('co',{stage:5,power:'off',...CO_V,extra:collapseExtra()}),
  init(o){o.fire=carFire(21,2.6,2);o.fire.R=2;},
  step(o,dt){o.T+=dt;stepCarFire(o.fire,dt,o.T,0.8);},
  scene(c,o,v,W,H){const T=o.T,F=o.F,wave=o.mode==='wave';drawBakeV(c,v,o.bake(),CO_V.x0,CO_V.y0);
    if(F.fog==='flood')floodPuddles(c,v,T);
    if(F.fog==='ash'){c.setTransform(1,0,0,1,0,0);const g=c.createLinearGradient(c.canvas.width,0,c.canvas.width*0.55,c.canvas.height*0.3);g.addColorStop(0,'rgba(255,110,40,0.28)');g.addColorStop(1,'rgba(255,110,40,0)');c.globalCompositeOperation='lighter';c.fillStyle=g;c.fillRect(0,0,c.canvas.width,c.canvas.height);resetCtx(c);}
    const me=CO_ME,face=Math.atan2(6.5-me[1],31-me[0])+Math.sin(T*0.6)*0.25,R=wave?10:14;
    const mates=[[18.6,12.6,Math.PI*0.95+Math.sin(T*0.5)*0.3,SLOT[1]],[26.2,11.6,0.4+Math.sin(T*0.7)*0.3,SLOT[2]]];
    const zs=crowd(CO_ZS,T,me,10);
    for(const z of zs){const d=Math.hypot(z[0]-me[0],z[1]-me[1]);const seen=d<=R||inCone(me[0],me[1],face,Math.PI/6,8,z[0],z[1]);if(seen)walkerAt(c,v,z[0],z[1],z[3],z[2]);}
    drawCarFire(c,v,o.fire,T,0.35);
    survAt(c,v,me[0],me[1],face);for(const m of mates)survAt(c,v,m[0],m[1],m[2]);
    const lights=[{r:[o.fire.x,o.fire.y,4,0.95]},{r:[me[0],me[1],1.6,0.75]},{cone:[me[0],me[1],face,Math.PI/6,8,0.95]}];for(const m of mates){lights.push({r:[m[0],m[1],1.6,0.75]},{cone:[m[0],m[1],m[2],Math.PI/6,8,0.95]});}
    const BLK=BL_REC;darkness(c,o,v,W,H,wave?BLK.alpha:BLK.alpha*0.5,BLK.tint,lights);
    warmLight(c,v,o.fire.x,o.fire.y,4,'255,130,50',0.16*flick(T,2));
    beamLight(c,v,me[0],me[1],face,Math.PI/6,8,'255,240,210',0.1);for(const m of mates)beamLight(c,v,m[0],m[1],m[2],Math.PI/6,8,'255,240,210',0.08);
    // above the darkness: teammates (rings) and zombie eyes within 14 m (or the fog edge)
    for(const z of zs){const d=Math.hypot(z[0]-me[0],z[1]-me[1]);const seen=d<=Math.min(14,R)||inCone(me[0],me[1],face,Math.PI/6,8,z[0],z[1]);if(seen&&wave)eyes(c,v,z[0],z[1],z[3]);}
    fogLayer(c,o,v,W,H,F,R,T);
    survAt(c,v,me[0],me[1],face);slotRing(c,v,me[0],me[1],SLOT[0]);for(const m of mates){survAt(c,v,m[0],m[1],m[2]);slotRing(c,v,m[0],m[1],m[3]);}
    if(F.fog==='ash')ashFall(c,v,W,H,T);else rainV(c,v,W,H,T,F.fog==='flood'?1.2:0.8);
    setW(c,v);c.globalAlpha=0.35;c.strokeStyle='#e8e6e0';c.lineWidth=1.2/v.k*DPR;c.setLineDash([0.3,0.25]);c.beginPath();c.arc(me[0],me[1],R,0,TAU);c.stroke();c.setLineDash([]);resetCtx(c);
    lbl(c,v,me[0]+R*0.72,me[1]-R*0.72,`fog ${R} m`,'rgba(232,230,224,0.6)');}};}
function floodPuddles(c,v,T){setW(c,v);const P_=[[23,13.6,4.2,1.1],[14.5,11.3,2.6,0.7],[31,12.8,2.8,0.9],[20.8,6.2,1.4,1.8]];
  for(const[x,y,rx,ry]of P_){c.save();c.beginPath();blobPath(c,x,y,rx,ry,(x*7)|0,0.25,48);c.fillStyle='rgba(4,6,10,0.72)';c.fill();c.clip();
    // reflections of the fire (top) and of the sky
    const g=c.createRadialGradient(21,2.6+(y-2.6)*1.6,0,21,2.6+(y-2.6)*1.6,6);g.addColorStop(0,'rgba(255,140,60,0.3)');g.addColorStop(1,'rgba(255,140,60,0)');c.fillStyle=g;c.globalCompositeOperation='lighter';c.fillRect(x-rx,y-ry,2*rx,2*ry);
    c.globalCompositeOperation='source-over';for(let i=0;i<10;i++){const u=(T*1.3+hash(i+x))%1;const px=x+(hash(i*3+x)-0.5)*rx*1.6,py=y+(hash(i*5+y)-0.5)*ry*1.4;c.strokeStyle=`rgba(190,205,230,${0.22*(1-u)})`;c.lineWidth=0.02;c.beginPath();c.ellipse(px,py,0.05+u*0.3,(0.05+u*0.3)*0.6,0,0,TAU);c.stroke();}
    c.restore();strokeP(c,q=>blobPath(q,x,y,rx,ry,(x*7)|0,0.25,48),'rgba(150,170,205,0.12)',0.03);}resetCtx(c);}

// ================= BLACKOUT LIGHTING (6.3) =================
// The intersection (24 × 13.5 m) at stage 5 in a blackout wave.
const BL_V={x0:12,y0:9.25,w:VW,h:VH};
const BL_ME=[24.2,16.3],BL_FL=[21.6,12.4],BL_FIRE=[16.25,15.5];
const BLS=[
  {id:'BL1',name:'Spec: 10 % light',alpha:0.9,tint:'4,6,12',beam:'soft',desc:'The story’s number: unlit ground keeps 10 % of its light (buildings faintly there), lights are clean soft-edged cut-outs with a faint warm tint. Plain and readable; the beam’s edge is soft.'},
  {id:'BL2',name:'Moonlit 20 %',alpha:0.8,tint:'6,12,30',beam:'soft',desc:'Twice the light and a cold blue cast, as if a moon were behind the clouds: the street layout and cover stay readable everywhere, the lights matter less. Easiest to play, least scary.'},
  {id:'BL3',name:'Pitch 5 %',alpha:0.95,tint:'2,2,4',beam:'hard',desc:'Almost black outside the lights, beams with a crisp edge. Maximum tension: you only know what your light touches and the eyes in the dark. Hardest to read on a dim phone screen.'},
  {id:'BL4',name:'Beams in the rain',alpha:0.9,tint:'4,6,12',beam:'volume',desc:'BL1’s 10 % plus light you can see: rain streaks sparkle inside every beam and the floodlight pool, a bright hot core runs down the beam and the torch lens flares. Costs a few more particles per light.'},
];
let BL_REC=BLS[0];
const BL_ZS=[[35.2,15.4,0,0.3],[34.6,19.8,1,0.26],[33.4,11,2,0.24],[13,20.8,3,0.25],[12.6,11.4,0,0.28],[28.6,22.2,1,0.3],[19.2,21.8,2,0.22],[30.2,10,3,0.3],[36,13,1,0.25],[26.4,9.8,2,0.24],[14.2,18.6,0,0.27],[31.4,21.6,3,0.29]];
function blackoutExtra(){return g=>{g.save();g.translate(BL_FIRE[0]*MPX,BL_FIRE[1]*MPX);CITY.drawCharredCar(g,4.5*MPX,2*MPX,1);g.restore();
  inMetres(g,c=>{rubblePile(c,26.6,13.1,2.0,1.5,231,'concrete');rubblePile(c,19.4,18.4,2.1,1.5,300,'concrete');
    for(const[x,y]of LAMPS_M)if(x>BL_V.x0&&x<BL_V.x0+VW&&y>BL_V.y0&&y<BL_V.y0+VH)deadLampHead(c,x,y);});};}
function rainInLight(c,v,W,H,T,lights,str){// rain streaks lit only inside lights (additive)
  c.setTransform(DPR,0,0,DPR,0,0);c.globalCompositeOperation='lighter';c.lineCap='round';c.strokeStyle='rgb(235,240,255)';const kk=v.k/DPR;
  for(const L of lights){const isC=!!L.cone;const[x,y]=isC?L.cone:L.r;const Rm=isC?L.cone[4]:L.r[2];const N=Math.round(Rm*Rm*(isC?0.9:2.4)*str);
    for(let i=0;i<N;i++){const ph=hash(i*1.37+x),tt=T*3+ph,cyc=Math.floor(tt),u=tt-cyc;let px,py;
      if(isC){const a=L.cone[2]+(hash(cyc*1.7+i*3.1)-0.5)*2*L.cone[3],d=Math.sqrt(hash(cyc*2.3+i*5.7))*Rm;px=x+Math.cos(a)*d;py=y+Math.sin(a)*d;}else{const a=hash(cyc*1.7+i*3.1)*TAU,d=Math.sqrt(hash(cyc*2.3+i*5.7))*Rm;px=x+Math.cos(a)*d;py=y+Math.sin(a)*d;}
      const dd=Math.hypot(px-x,py-y)/Rm;const[cx,cy]=cssOf(v,px,py);c.globalAlpha=(1-dd)*0.55*(1-u);c.lineWidth=Math.max(0.7,0.03*kk);c.beginPath();c.moveTo(cx,cy);c.lineTo(cx-0.1*kk,cy+0.42*kk);c.stroke();
      if(u<0.3&&hash(i*9.1)<0.25){c.globalAlpha=(1-dd)*0.4*(1-u/0.3);c.beginPath();c.ellipse(cx,cy+0.5*kk,0.06*kk+u*0.3*kk,(0.06*kk+u*0.3*kk)*0.6,0,0,TAU);c.stroke();}}}
  c.globalCompositeOperation='source-over';c.globalAlpha=1;}
function muzzle(c,v,x,y,f,a){const mx=x+Math.cos(f)*0.75,my=y+Math.sin(f)*0.75;drawImg(c,v,flashSpr,mx,my,0.7,0.5,f,a,'lighter');resetCtx(c);}
function makeBlackoutCard(F,i){return{kind:'map',id:F.id,name:F.name,desc:F.desc,F,seed:3000+i*13,anim:true,V:BL_V,focus:[22.6,15.2],stripH:340,flood:6,
  segs:[{key:'flood',aria:'floodlight',opts:[[6,'floodlight 6 m · blackout'],[4,'4 m · normal waves']]}],stripR:'flashlight 60° · 8 m · tactical 80° · 12 m',
  bake:()=>cityBake('bl',{stage:5,power:'off',...BL_V,extra:blackoutExtra()}),
  init(o){o.fire=carFire(BL_FIRE[0],BL_FIRE[1],2);},
  step(o,dt){o.T+=dt;stepCarFire(o.fire,dt,o.T,0.85);},
  scene(c,o,v,W,H){const T=o.T,F=o.F;drawBakeV(c,v,o.bake(),BL_V.x0,BL_V.y0);
    const me=BL_ME,face=0.05+Math.sin(T*0.55)*0.35;
    const tac=[22.4,18.9,Math.PI*0.82+Math.sin(T*0.45)*0.3];const m3=[21.4,13.7,-Math.PI*0.62+Math.sin(T*0.6)*0.35];
    const zs=crowd(BL_ZS,T,[23.4,16.4],11);
    // floodlight FL1 (5.10) with its pool
    const fr=o.flood;lightPool(c,...cssOf(v,BL_FL[0],BL_FL[1]),fr*v.k/DPR,0.18);
    for(const z of zs)walkerAt(c,v,z[0],z[1],z[3],z[2]);
    drawCarFire(c,v,o.fire,T,0.35);
    const flAt=cssOf(v,BL_FL[0],BL_FL[1]);putImg(c,bakeObj('fl1'+RPX(v.k/DPR),q=>CITY.drawFloodlightFL1(q),RPX(v.k/DPR),0.65),flAt[0],flAt[1],0);
    const shots=[[me,face,0.33,0],[tac,tac[2],0.21,0.1]];const flashes=[];
    for(const[p,f,per,off]of shots){const ph=(T+off)%per;if(ph<0.1)flashes.push([p[0],p[1],f,1-ph/0.1]);}
    survAt(c,v,me[0],me[1],face);survAt(c,v,tac[0],tac[1],tac[2]);survAt(c,v,m3[0],m3[1],m3[2]);
    const lights=[{r:[o.fire.x,o.fire.y,4,0.95]},{r:[BL_FL[0],BL_FL[1],fr,1]},{r:[me[0],me[1],1.6,0.75]},{r:[tac[0],tac[1],1.6,0.75]},{r:[m3[0],m3[1],1.6,0.75]},
      {cone:[me[0],me[1],face,Math.PI/6,8,0.95]},{cone:[tac[0],tac[1],tac[2],40*Math.PI/180,12,0.95]},{cone:[m3[0],m3[1],m3[2],Math.PI/6,8,0.95]}];
    for(const f of flashes)lights.push({r:[f[0]+Math.cos(f[2])*0.8,f[1]+Math.sin(f[2])*0.8,3,0.85*f[3]]});
    if(F.beam==='hard'){for(const L of lights)if(L.cone)L.cone[5]=1;}
    darkness(c,o,v,W,H,F.alpha,F.tint,lights);
    // light colour on top
    warmLight(c,v,o.fire.x,o.fire.y,4,'255,120,45',0.18*flick(T,2));warmLight(c,v,BL_FL[0],BL_FL[1],fr,'255,236,200',0.1);
    const tint=F.beam==='volume'?0.16:0.08;beamLight(c,v,me[0],me[1],face,Math.PI/6,8,'255,240,210',tint);beamLight(c,v,tac[0],tac[1],tac[2],40*Math.PI/180,12,'235,242,255',tint);beamLight(c,v,m3[0],m3[1],m3[2],Math.PI/6,8,'255,240,210',tint);
    if(F.beam==='volume'){rainInLight(c,v,W,H,T,[{cone:[me[0],me[1],face,Math.PI/6,8]},{cone:[tac[0],tac[1],tac[2],40*Math.PI/180,12]},{cone:[m3[0],m3[1],m3[2],Math.PI/6,8]},{r:[BL_FL[0],BL_FL[1],fr]}],1);
      for(const[p,f]of[[me,face],[tac,tac[2]],[m3,m3[2]]]){setW(c,v);c.globalCompositeOperation='lighter';const g=c.createLinearGradient(p[0],p[1],p[0]+Math.cos(f)*6,p[1]+Math.sin(f)*6);g.addColorStop(0,'rgba(255,250,235,0.35)');g.addColorStop(1,'rgba(255,250,235,0)');c.strokeStyle=g;c.lineWidth=0.25;c.lineCap='round';c.beginPath();c.moveTo(p[0]+Math.cos(f)*0.6,p[1]+Math.sin(f)*0.6);c.lineTo(p[0]+Math.cos(f)*6,p[1]+Math.sin(f)*6);c.stroke();resetCtx(c);
        drawImg(c,v,blueSpr,p[0]+Math.cos(f)*0.62,p[1]+Math.sin(f)*0.62,0.5,0.5,0,0.5,'lighter');resetCtx(c);}}
    for(const f of flashes){muzzle(c,v,f[0],f[1],f[2],f[3]);warmLight(c,v,f[0]+Math.cos(f[2])*0.8,f[1]+Math.sin(f[2])*0.8,3,'255,200,120',0.22*f[3]);}
    for(const z of zs){if(Math.hypot(z[0]-me[0],z[1]-me[1])<=14)eyes(c,v,z[0],z[1],z[3]);}
    survAt(c,v,me[0],me[1],face);slotRing(c,v,me[0],me[1],SLOT[0]);survAt(c,v,tac[0],tac[1],tac[2]);slotRing(c,v,tac[0],tac[1],SLOT[1]);survAt(c,v,m3[0],m3[1],m3[2]);slotRing(c,v,m3[0],m3[1],SLOT[2]);
    rainV(c,v,W,H,T,F.alpha>0.85?0.35:0.6);
    setW(c,v);c.globalAlpha=0.3;c.strokeStyle='rgba(255,236,200,1)';c.lineWidth=1/v.k*DPR;c.setLineDash([0.25,0.2]);c.beginPath();c.arc(BL_FL[0],BL_FL[1],fr,0,TAU);c.stroke();c.setLineDash([]);resetCtx(c);}};}
