// ================= SPECIAL EVENTS (6.8–6.10) =================
/** A marker pin drawn above everything (CSS px): disc with an icon fn(c, s) and a pulse ring. */
function pin(c,v,x,y,col,icon,T,pulse){const[cx,cy]=cssOf(v,x,y);c.setTransform(DPR,0,0,DPR,0,0);const s=11,by=cy-24-Math.sin(T*4)*2;
  if(pulse!==false){const u=(T*0.9)%1;c.globalAlpha=0.6*(1-u);c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.arc(cx,cy,6+u*22,0,TAU);c.stroke();c.globalAlpha=1;}
  c.fillStyle='rgba(0,0,0,0.45)';c.beginPath();c.ellipse(cx,cy,5,2.5,0,0,TAU);c.fill();
  c.fillStyle=col;c.beginPath();c.moveTo(cx,cy-3);c.lineTo(cx-6,by+6);c.lineTo(cx+6,by+6);c.closePath();c.fill();
  c.beginPath();c.arc(cx,by,s+2,0,TAU);c.fill();c.fillStyle='#101114';c.beginPath();c.arc(cx,by,s,0,TAU);c.fill();
  c.save();c.translate(cx,by);icon(c,s,col);c.restore();resetCtx(c);}
const IC={
  bell:(c,s,col)=>{c.fillStyle=col;c.beginPath();c.moveTo(-s*0.55,s*0.35);c.quadraticCurveTo(-s*0.5,-s*0.6,0,-s*0.62);c.quadraticCurveTo(s*0.5,-s*0.6,s*0.55,s*0.35);c.closePath();c.fill();c.beginPath();c.arc(0,s*0.45,s*0.16,0,TAU);c.fill();},
  bang:(c,s,col)=>{c.fillStyle=col;c.fillRect(-s*0.11,-s*0.6,s*0.22,s*0.75);c.beginPath();c.arc(0,s*0.42,s*0.13,0,TAU);c.fill();},
  flame:(c,s,col)=>{c.fillStyle=col;c.beginPath();c.moveTo(0,-s*0.65);c.quadraticCurveTo(s*0.6,-s*0.05,s*0.35,s*0.45);c.quadraticCurveTo(0,s*0.7,-s*0.35,s*0.45);c.quadraticCurveTo(-s*0.6,-s*0.05,0,-s*0.65);c.fill();},
  person:(c,s,col)=>{c.fillStyle=col;c.beginPath();c.arc(0,-s*0.32,s*0.22,0,TAU);c.fill();c.beginPath();c.moveTo(-s*0.38,s*0.55);c.quadraticCurveTo(-s*0.36,-s*0.06,0,-s*0.06);c.quadraticCurveTo(s*0.36,-s*0.06,s*0.38,s*0.55);c.closePath();c.fill();},
  flag:(c,s,col)=>{c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.moveTo(-s*0.35,s*0.6);c.lineTo(-s*0.35,-s*0.6);c.stroke();c.fillStyle=col;c.beginPath();c.moveTo(-s*0.3,-s*0.6);c.lineTo(s*0.5,-s*0.35);c.lineTo(-s*0.3,-s*0.08);c.closePath();c.fill();},
  gun:(c,s,col)=>{c.fillStyle=col;c.fillRect(-s*0.7,-s*0.14,s*1.25,s*0.24);c.fillRect(-s*0.7,-s*0.14,s*0.32,s*0.5);c.fillRect(s*0.1,-s*0.32,s*0.4,s*0.16);c.fillRect(-s*0.2,s*0.06,s*0.14,s*0.3);},
  torch:(c,s,col)=>{c.fillStyle=col;c.fillRect(-s*0.7,-s*0.08,s*0.9,s*0.16);c.beginPath();c.moveTo(s*0.15,-s*0.3);c.lineTo(s*0.6,-s*0.42);c.lineTo(s*0.6,s*0.42);c.lineTo(s*0.15,s*0.3);c.closePath();c.fill();c.fillRect(-s*0.72,-s*0.34,s*0.22,s*0.68);},
};
function soundRing(c,v,x,y,R,a,col,lw,dash){setW(c,v);c.globalAlpha=a;c.strokeStyle=col;c.lineWidth=lw;if(dash)c.setLineDash(dash);c.beginPath();c.arc(x,y,R,0,TAU);c.stroke();c.setLineDash([]);resetCtx(c);}
function tracer(c,v,ax,ay,bx,by,u){const hu=Math.min(1,u),tu=Math.max(0,u-0.45);setW(c,v);c.globalCompositeOperation='lighter';const g=c.createLinearGradient(lerp(ax,bx,tu),lerp(ay,by,tu),lerp(ax,bx,hu),lerp(ay,by,hu));g.addColorStop(0,'rgba(255,220,150,0)');g.addColorStop(1,'rgba(255,240,200,0.95)');c.strokeStyle=g;c.lineWidth=0.05;c.beginPath();c.moveTo(lerp(ax,bx,tu),lerp(ay,by,tu));c.lineTo(lerp(ax,bx,hu),lerp(ay,by,hu));c.stroke();resetCtx(c);}
function evCard(o){return{kind:'map',anim:true,stripH:300,v1:o.vars[0][0],segs:[{key:'v1',aria:'variant',opts:o.vars}],...o};}

// ---- car alarm: a parked car (curb_car_south, 26–28 × 24–28.5) armed 20 s, alarm pulls zombies within 15 m ----
const CA_CAR=[27,26.25],CA_V={x0:14,y0:17.5,w:24,h:13.5},CA_LOOP=10;
const CA_ZS=[[16.5,21,0],[36.5,19.8,1],[33.6,29.5,2],[19.2,29.2,3],[35.4,24,0],[22.2,18.6,1]];
function makeAlarmCard(){return evCard({id:'EV1',name:'Car alarm',vars:[['CA1','CA1 hazard blink'],['CA2','CA2 headlight strobe'],['CA3','CA3 icon only']],
  desc:'A parked car goes “armed” (20 s, sped up here): its lights blink and a ring counts down. Shoot it (or wait) and the alarm sounds for 15 s, pulling every zombie within 15 m. CA1 amber hazard lights + amber countdown ring + sound rings; CA2 white headlight strobe and a red dash light, thin white rings; CA3 no rings, a pulsing bell marker only.',
  V:CA_V,focus:[25,24],stripR:'alarm radius 15 m',seed:5100,
  bake:()=>cityBake('ca',{stage:4,power:'ruins',...CA_V}),step(o,dt){o.T+=dt;},
  scene(c,o,v,W,H){const T=o.T,t=T%CA_LOOP,on=t>=4,V1=o.v1;drawBakeV(c,v,o.bake(),CA_V.x0,CA_V.y0);
    const S=[20.6,23.4],f=Math.atan2(CA_CAR[1]-S[1],CA_CAR[0]-S[0]);
    const corners=[[26.25,24.35],[27.75,24.35],[26.25,28.15],[27.75,28.15]];
    if(V1==='CA1'){const b=Math.floor(T*(on?6:2))%2===0;if(b)for(const[x,y]of corners){drawImg(c,v,blueSpr,x,y,0.01,0.01,0,0,'lighter');warmLight(c,v,x,y,on?1.6:1.1,'255,160,40',0.55);}}
    if(V1==='CA2'){if(on&&Math.floor(T*8)%2===0){warmLight(c,v,27,24.2,3.2,'240,245,255',0.4);for(const x of[26.4,27.6])warmLight(c,v,x,24.3,0.8,'255,255,255',0.9);}const d=Math.floor(T*(on?4:1.5))%2===0;if(d)warmLight(c,v,27,25.4,0.5,'255,40,30',0.9);}
    // zombies: wander, then turn to the car once the alarm sounds
    for(const[zx,zy,vv]of CA_ZS){let x=zx,y=zy,fc=Math.atan2(S[1]-zy,S[0]-zx);if(on){const u=Math.min(1,(t-4)/6),d=Math.hypot(CA_CAR[0]-zx,CA_CAR[1]-zy);if(d<15){const k_=Math.min(u*3.2,d-1.8)/d;x=zx+(CA_CAR[0]-zx)*k_;y=zy+(CA_CAR[1]-zy)*k_;fc=Math.atan2(CA_CAR[1]-zy,CA_CAR[0]-zx);}}walkerAt(c,v,x,y,fc,vv);}
    survAt(c,v,S[0],S[1],f);slotRing(c,v,S[0],S[1],SLOT[0]);
    if(t>=3.85&&t<4.05)tracer(c,v,S[0]+Math.cos(f)*0.8,S[1]+Math.sin(f)*0.8,CA_CAR[0],CA_CAR[1],(t-3.85)/0.12);
    if(!on){const k_=1-t/4;if(V1!=='CA3'){setW(c,v);c.strokeStyle=V1==='CA1'?'rgba(255,170,50,0.85)':'rgba(240,240,240,0.8)';c.lineWidth=0.09;c.beginPath();c.arc(CA_CAR[0],CA_CAR[1],2.9,-Math.PI/2,-Math.PI/2+TAU*k_);c.stroke();resetCtx(c);}
      lbl(c,v,CA_CAR[0],CA_CAR[1]-3.2,`ARMED · ${Math.ceil(k_*20)} s`,V1==='CA2'?'#e8e8e8':'#ffb648');}
    else if(V1!=='CA3'){for(let i=0;i<4;i++){const u=((t-4)*0.9+i/4)%1;soundRing(c,v,CA_CAR[0],CA_CAR[1],1.5+u*13.5,(1-u)*0.55,V1==='CA1'?'rgb(255,170,60)':'rgb(240,240,240)',V1==='CA1'?0.1:0.05,V1==='CA1'?[0.6,0.35]:null);}lbl(c,v,CA_CAR[0],CA_CAR[1]-3.2,'ALARM · 15 s',V1==='CA2'?'#e8e8e8':'#ffb648');}
    soundRing(c,v,CA_CAR[0],CA_CAR[1],15,0.22,'rgb(230,228,220)',0.04,[0.3,0.3]);
    pin(c,v,CA_CAR[0],CA_CAR[1]-1.4,V1==='CA2'?'#e8e8e8':'#ffb648',IC.bell,T,V1==='CA3'||on);
    rainV(c,v,W,H,T,0.7);}});}

// ---- stampede: 3 s warning, then Runners cross an 8 m lane at 5 m/s, not chasing ----
const ST_V={x0:12,y0:0,w:24,h:13.5},ST_LOOP=8;
function makeStampedeCard(){return evCard({id:'EV2',name:'Stampede',vars:[['ST1','ST1 dust + chevrons'],['ST2','ST2 amber lane'],['ST3','ST3 rumble only']],
  desc:'3 s warning, then 30 Runners (4 players) run straight down an 8 m lane at 5 m/s, 8 damage on contact. ST1 a dust cloud rises at the map edge and amber chevrons point down the lane; ST2 the lane is hatched amber and black (boss danger is red, so it never reads as a boss attack); ST3 no ground mark: puddles ripple, dust falls and the screen shakes.',
  V:ST_V,focus:[24,6.5],stripR:'lane 8 m · 5 m/s',seed:5200,
  bake:()=>cityBake('st',{stage:4,power:'ruins',...ST_V}),init(o){o.dust=new Pool(70);o.acc=0;},
  step(o,dt){o.T+=dt;const t=o.T%ST_LOOP;if(t<3.6&&o.v1!=='ST2'){o.acc+=40*dt;while(o.acc>=1){o.acc--;put(o.dust,rr(20,28),rr(-0.4,0.6),rr(-0.4,0.4),rr(0.2,0.9),rr(0.6,1.0),rr(2,3),rr(1.6,2.6));}}stepDrift(o.dust,dt,o.T);},
  scene(c,o,v,W,H){const T=o.T,t=T%ST_LOOP,V1=o.v1;let shake=0;if(t<3)shake=V1==='ST3'?0.08*Math.sin(T*60):0.03*Math.sin(T*50);
    const vs={...v,ox:v.ox+shake*v.k,oy:v.oy+shake*0.6*v.k};drawBakeV(c,vs,o.bake(),ST_V.x0,ST_V.y0);
    if(t<3.2){const a=Math.min(1,t*3)*(t<3?1:(3.2-t)*5);
      if(V1==='ST1'){setW(c,vs);for(let row=0;row<4;row++)for(let col=0;col<3;col++){const x=21.2+col*2.8,y=2+row*3+((T*3)%3)-1.5;if(y<0.5||y>13)continue;c.globalAlpha=0.55*a;c.fillStyle='#ffb648';c.beginPath();c.moveTo(x-0.6,y-0.35);c.lineTo(x,y+0.35);c.lineTo(x+0.6,y-0.35);c.lineTo(x+0.6,y-0.05);c.lineTo(x,y+0.65);c.lineTo(x-0.6,y-0.05);c.closePath();c.fill();}resetCtx(c);}
      if(V1==='ST2'){setW(c,vs);c.save();c.beginPath();c.rect(20,0,8,13.5);c.clip();c.globalAlpha=0.5*a;c.fillStyle='rgba(255,170,40,0.25)';c.fillRect(20,0,8,13.5);c.strokeStyle='rgba(20,16,10,0.6)';c.lineWidth=0.3;c.beginPath();for(let i=-20;i<30;i+=0.9){c.moveTo(20+i,0);c.lineTo(20+i-13.5,13.5);}c.stroke();c.restore();c.globalAlpha=a;c.strokeStyle='#ffb648';c.lineWidth=0.1;c.setLineDash([0.5,0.3]);c.strokeRect(20,0,8,13.5);c.setLineDash([]);resetCtx(c);}
      if(V1==='ST3'){for(let i=0;i<5;i++){const u=(T*1.6+i/5)%1;soundRing(c,vs,19+i*2.5,7+Math.sin(i)*3,0.1+u*0.8,(1-u)*0.4,'rgb(190,205,230)',0.03);}}
      const[cx]=cssOf(vs,24,0);c.setTransform(DPR,0,0,DPR,0,0);c.font='700 16px Oswald, sans-serif';c.textAlign='center';c.fillStyle=`rgba(255,182,72,${a})`;c.fillText(`STAMPEDE · ${Math.ceil(3-t)}`,cx,H*0.42);resetCtx(c);}
    drawSmoke(c,vs,o.dust,'dust',0.6,0,0,0);resetCtx(c);
    // Runners in a straight lane
    if(t>=3){const tt=t-3;for(let i=0;i<30;i++){const y=-1+tt*5-(i%10)*1.1-Math.floor(i/10)*0.4-hash(i)*1.2,x=20.6+((i*2.7+hash(i*3)*3)%6.8);if(y<-0.6||y>14)continue;walkerAt(c,vs,x+Math.sin(T*9+i)*0.06,y,Math.PI/2,i%4);}}
    const S=[17.4,7.6];survAt(c,vs,S[0],S[1],0);slotRing(c,vs,S[0],S[1],SLOT[0]);survAt(c,vs,30.2,9.4,Math.PI);slotRing(c,vs,30.2,9.4,SLOT[1]);
    pin(c,vs,24,1.4,'#ffb648',IC.bang,T,t<3);rainV(c,vs,W,H,T,0.6);}});}

// ---- gas leak: the forecourt tank hisses 10 s (6 m ring), then explodes; shootable after 3 s ----
const GL_V={x0:24,y0:0,w:24,h:13.5},GL_TANK=[38.6,10.2],GL_LOOP=9,GL_BOOM=6.2;
function makeGasCard(){return evCard({id:'EV3',name:'Gas leak',vars:[['GL1','GL1 vapour + ring'],['GL2','GL2 hazard ring'],['GL3','GL3 propane tank']],
  desc:'The gas station’s tank starts hissing (10 s, sped up here) with a visible 6 m ring, then explodes: zombies inside die, players take 60. Shoot the tank after its first 3 s to set it off early. GL1 a yellow-green vapour cloud pours out of a fill cap, dashed ring and countdown arc; GL2 heat shimmer and a black-and-yellow hazard ring; GL3 a white propane tank venting a frosty jet. The blast is round C’s EX1 fireball at 6 m.',
  V:GL_V,focus:[37,8.2],stripR:'blast 6 m · 60 damage',seed:5300,
  bake:()=>cityBake('gl',{stage:4,power:'ruins',...GL_V}),
  init(o){o.gas=new Pool(80);o.fl=new Pool(260);o.sm=new Pool(60);o.em=new Pool(60);o.db=new Pool(50);o.acc=new Float32Array(3);o.cyc=-1;o.boom=false;o.fit={kind:1,cx:GL_TANK[0],cy:GL_TANK[1],R:6};},
  step(o,dt){o.T+=dt;const T=o.T,t=T%GL_LOOP,cyc=Math.floor(T/GL_LOOP);if(cyc!==o.cyc){o.cyc=cyc;o.boom=false;o.fl.clear();o.sm.clear();o.em.clear();o.db.clear();o.gas.clear();}
    const[x,y]=GL_TANK;if(t<GL_BOOM){o.acc[0]+=(o.v1==='GL2'?6:28)*dt;while(o.acc[0]>=1){o.acc[0]--;const a=rr(-0.6,0.6)-Math.PI*0.7;const j=put(o.gas,x+rr(-0.1,0.1),y+rr(-0.1,0.1),Math.cos(a)*rr(0.6,1.6),Math.sin(a)*rr(0.6,1.6),rr(0.3,0.5),rr(1.4,2.4),rr(2,3.4));}}
    if(t>=GL_BOOM&&!o.boom){o.boom=true;o.gas.clear();for(let i=0;i<200;i++){const a=rr(0,TAU),d=Math.sqrt(FXR())*5.4;put(o.fl,x+Math.cos(a)*d*0.3,y+Math.sin(a)*d*0.3,Math.cos(a)*d*1.6,Math.sin(a)*d*1.6,rr(0.7,1.3),0,rr(0.5,1.0));}
      for(let i=0;i<30;i++){const a=rr(0,TAU);put(o.sm,x+Math.cos(a)*rr(0,3),y+Math.sin(a)*rr(0,3),Math.cos(a)*rr(0.5,2),Math.sin(a)*rr(0.5,2),rr(1,1.6),rr(3.5,5),rr(2.5,4));}
      for(let i=0;i<50;i++){const a=rr(0,TAU),sp=rr(3,9);const j=put(o.db,x,y,Math.cos(a)*sp,Math.sin(a)*sp,rr(0.06,0.14),0,rr(1.2,2.2));if(j>=0){o.db.vz[j]=rr(1,5);o.db.z[j]=0.2;o.db.vr[j]=rr(-20,20);}}
      for(let i=0;i<40;i++)put(o.em,x+rr(-2,2),y+rr(-2,2),rr(-2,2),rr(-3,-1),rr(0.05,0.09),0,rr(0.8,1.6));}
    stepDrift(o.gas,dt,T);stepFlames(o.fl,dt,T,0.6,1.6,0.3,2.6);stepSmoke(o.sm,dt,T);stepEmbers(o.em,dt,T,2.5);stepBallistic(o.db,dt,0.3);},
  scene(c,o,v,W,H){const T=o.T,t=T%GL_LOOP,V1=o.v1,[x,y]=GL_TANK,te=t-GL_BOOM;drawBakeV(c,v,o.bake(),GL_V.x0,GL_V.y0);
    if(te>0){drawImg(c,v,scorchSpr,x,y,12,12,0.4,0.8*Math.min(1,te*5),'source-over');resetCtx(c);}
    // the tank
    setW(c,v);const p0=P;P=1/PPM;
    if(V1==='GL3'){castShadow(c,q=>{q.beginPath();R(q,x-1.1,y-0.45,2.2,0.9,0.45);q.fill();},0.12,0.18,0.06,0.6);part(c,q=>R(q,x-1.1,y-0.45,2.2,0.9,0.45),{base:'#d8d6cf',lit:'top',box:[x-1.1,y-0.45,x+1.1,y+0.45],tex:steelTex(5,0.6),hi:0.4,lo:0.5,line:1.3});
      part(c,q=>E(q,x,y,0.16,0.16),{base:'#9a9a94',lit:'radial',box:[x-0.16,y-0.16,x+0.16,y+0.16],line:1});fillP(c,q=>R(q,x-0.6,y+0.2,1.2,0.08),'rgba(200,40,30,0.85)');}
    else{for(const dx of[-0.5,0.5]){part(c,q=>E(q,x+dx,y,0.22,0.22),{base:'#5d6066',lit:'radial',box:[x+dx-0.22,y-0.22,x+dx+0.22,y+0.22],tex:steelTex(7,0.8),hi:0.4,lo:0.5,line:1.2});fillP(c,q=>E(q,x+dx,y,0.08,0.08),dx<0?'#b8261c':'#c99a1f');}}
    if(V1==='GL2'&&te<0){c.save();c.beginPath();c.arc(x,y,6,0,TAU);c.arc(x,y,5.75,0,TAU,true);c.clip();for(let a=0;a<TAU;a+=TAU/48){c.fillStyle=(Math.round(a/(TAU/48))%2)?'rgba(20,18,12,0.8)':'rgba(240,190,40,0.8)';c.beginPath();c.moveTo(x,y);c.arc(x,y,6.2,a,a+TAU/48);c.closePath();c.fill();}c.restore();}
    P=p0;resetCtx(c);
    drawSmoke(c,v,o.gas,'gas',V1==='GL3'?0.32:0.5,0,0,0);resetCtx(c);
    if(V1==='GL3'&&te<0){setW(c,v);c.globalCompositeOperation='lighter';for(let i=0;i<6;i++){const u=(T*3+i/6)%1;c.globalAlpha=0.3*(1-u);c.fillStyle='#dfe8f2';c.beginPath();c.ellipse(x-0.2-u*1.4,y-0.5-u*0.8,0.1+u*0.4,0.06+u*0.2,-0.5,0,TAU);c.fill();}resetCtx(c);}
    if(V1==='GL2'&&te<0){setW(c,v);c.globalCompositeOperation='lighter';for(let i=0;i<5;i++){const a=T*0.6+i*1.3;c.globalAlpha=0.06;c.fillStyle='#fff';c.beginPath();c.ellipse(x+Math.cos(a)*2.4,y+Math.sin(a)*1.6,1.6,0.5,a,0,TAU);c.fill();}resetCtx(c);}
    const zs=[[33.2,8.2,0],[42.6,6.8,1],[36.4,4.4,2],[44.4,11.6,3],[31,12.6,1]];
    for(const[zx,zy,vv]of zs){const inside=Math.hypot(zx-x,zy-y)<6;if(te>0.15&&inside)continue;walkerAt(c,v,zx+Math.sin(T+zx)*0.2,zy,Math.atan2(9-zy,30-zx),vv);}
    const S=[29.4,9.6];survAt(c,v,S[0],S[1],Math.atan2(y-S[1],x-S[0]));slotRing(c,v,S[0],S[1],SLOT[0]);
    if(te<0){const k_=1-t/GL_BOOM;if(V1!=='GL2')soundRing(c,v,x,y,6,0.55+0.3*Math.sin(T*8),'rgb(220,230,120)',0.08,[0.5,0.3]);
      setW(c,v);c.strokeStyle='rgba(220,230,120,0.9)';c.lineWidth=0.1;c.beginPath();c.arc(x,y,1.3,-Math.PI/2,-Math.PI/2+TAU*k_);c.stroke();resetCtx(c);
      lbl(c,v,x,y-1.7,t<GL_BOOM*0.3?'GAS LEAK':'GAS LEAK · shoot to blow it','#dfe878');pin(c,v,x,y-0.6,'#dfe878',IC.flame,T,true);}
    if(te>0){drawFlames(c,v,o.fl,o.fit);drawSmoke(c,v,o.sm,'black',0.6,x,y,2);drawEmbers(c,v,o.em,o.fit);drawBits(c,v,o.db,DEBRIS_C,1.5);
      if(te<0.12){const f=1-te/0.12;drawImg(c,v,flashSpr,x,y,15,15,0,f,'lighter');}const r_=6*Math.min(1,te/0.12),ra=te<0.12?0.9:Math.max(0,0.9-(te-0.12)/0.6);if(ra>0)ringLine(c,v,x,y,r_,'#ffe3b0',ra,3);resetCtx(c);}
    rainV(c,v,W,H,T,0.6);}});}
const DEBRIS_C=['#1b1c1f','#2a2b2f','#3a3c40','#111214','#4a4c50','#8a8e94'];

// ---- supply drop: a smoke flare marks the spot, 5 s later a crate lands showing its weapon ----
const SD_V={x0:0,y0:9.25,w:24,h:13.5},SD_AT=[9.6,17.4],SD_LOOP=10;
const SD_STY={SD1:{smoke:'200,40,30',crate:'#7a5a36',chute:'#c9c2b0',name:'red flare, wooden crate'},SD2:{smoke:'70,190,90',crate:'#4b5536',chute:'#5f6b48',name:'green smoke, military case'},SD3:{smoke:'255,140,40',crate:'#6b4a2c',chute:'#d6d0c0',name:'orange smoke, pallet'}};
function makeSupplyCard(){return evCard({id:'EV4',name:'Supply drop',vars:[['SD1','SD1 red flare'],['SD2','SD2 green smoke'],['SD3','SD3 orange pallet']],
  desc:'A smoke flare lands ≥ 12 m from the team; 5 s later a crate drops there on a small chute (its shadow shrinks as it falls). Its marker shows the weapon inside (D7: the team decides who runs). Stand on it 1 s: the weapon at level II. SD1 red flare and a wooden crate; SD2 green smoke and an olive military case; SD3 orange smoke and a crate strapped to a pallet.',
  V:SD_V,focus:[9,16.4],stripR:'pick up: stand 1 s',seed:5400,
  bake:()=>cityBake('sd',{stage:4,power:'ruins',...SD_V}),init(o){o.sm=new Pool(90);o.acc=0;o.cyc=-1;},
  step(o,dt){o.T+=dt;const t=o.T%SD_LOOP,cyc=Math.floor(o.T/SD_LOOP);if(cyc!==o.cyc){o.cyc=cyc;o.sm.clear();}if(t<8){o.acc+=22*dt;while(o.acc>=1){o.acc--;put(o.sm,SD_AT[0]+0.5+rr(-0.08,0.08),SD_AT[1]+0.4,WIND_X*1.2+rr(-0.2,0.2),WIND_Y-0.3+rr(-0.2,0.2),rr(0.15,0.25),rr(1.4,2.4),rr(2.4,3.6));}}stepSmoke(o.sm,dt,o.T);},
  scene(c,o,v,W,H){const T=o.T,t=T%SD_LOOP,St=SD_STY[o.v1],[x,y]=SD_AT;drawBakeV(c,v,o.bake(),SD_V.x0,SD_V.y0);
    // flare on the ground
    warmLight(c,v,x+0.5,y+0.4,1.4,St.smoke,0.5*flick(T,3));setW(c,v);c.fillStyle='#222';c.fillRect(x+0.38,y+0.36,0.26,0.07);c.fillStyle=`rgb(${St.smoke})`;c.beginPath();c.arc(x+0.64,y+0.395,0.05,0,TAU);c.fill();resetCtx(c);
    // smoke tinted
    c.save();drawSmoke(c,v,o.sm,'grey',0.55,0,0,0);resetCtx(c);c.restore();
    setW(c,v);c.globalCompositeOperation='source-atop';resetCtx(c);
    tintSmoke(c,v,o.sm,St.smoke);
    const land=5,fall=Math.min(1,Math.max(0,(t-3.8)/1.2));const picked=t>8.2;
    if(t>=3.8&&!picked){const z=(1-fall)*8;const s=1+z*0.08;setW(c,v);c.globalAlpha=0.4*(0.4+fall*0.6);c.fillStyle='#000';c.beginPath();c.ellipse(x+z*0.15+0.1,y+z*0.2+0.12,0.55*s,0.4*s,0,0,TAU);c.fill();resetCtx(c);
      setW(c,v);const p0=P;P=1/PPM;c.translate(x,y-z*0.2);c.scale(s,s);
      if(fall<1){part(c,q=>{q.arc(0,-0.2,1.0,Math.PI,0);q.closePath();},{base:St.chute,lit:'top',box:[-1,-1.2,1,0],tex:clothTex(3),hi:0.3,lo:0.4,line:1.1});strokeP(c,q=>{q.moveTo(-0.9,-0.2);q.lineTo(-0.35,0.15);q.moveTo(0.9,-0.2);q.lineTo(0.35,0.15);},'rgba(20,20,20,0.6)',0.02);}
      if(o.v1==='SD3')part(c,q=>R(q,-0.55,-0.42,1.1,0.84,0.02),{base:'#8a6b45',lit:'top',box:[-0.55,-0.42,0.55,0.42],tex:woodTex(9,0,0.8),line:1.1});
      part(c,q=>R(q,-0.42,-0.32,0.84,0.64,0.04),{base:St.crate,lit:'top',box:[-0.42,-0.32,0.42,0.32],tex:o.v1==='SD2'?steelTex(11,0.5):woodTex(12,0,0.8),hi:0.35,lo:0.5,line:1.3});
      if(o.v1==='SD1'){strokeP(c,q=>{q.moveTo(-0.42,-0.32);q.lineTo(0.42,0.32);q.moveTo(0.42,-0.32);q.lineTo(-0.42,0.32);},'rgba(40,26,12,0.8)',0.04);}
      if(o.v1==='SD2'){fillP(c,q=>R(q,-0.3,-0.06,0.6,0.12),'#d8d4c4');for(const sx of[-0.3,0.3])rivet(c,sx,-0.22,0.03,'#8a8f80');}
      if(o.v1==='SD3'){for(const sx of[-0.18,0.18])fillP(c,q=>R(q,sx-0.03,-0.42,0.06,0.84),'#c9772a');}
      P=p0;resetCtx(c);}
    // the team: the blue player runs for it after it lands
    const pk=[[0,20.6,19.3],[5.2,20.6,19.3],[7.2,x+0.05,y+0.05],[8.4,x+0.05,y+0.05],[10,20.6,19.3]];const p=keyAt(pk,t);
    survAt(c,v,p[0],p[1],p[2]);slotRing(c,v,p[0],p[1],SLOT[0]);survAt(c,v,22,20.8,-2.6);slotRing(c,v,22,20.8,SLOT[1]);
    for(const[zx,zy,vv]of[[1.6,11.4,0],[22.8,12.6,1],[2.2,21.6,2]])walkerAt(c,v,zx+Math.sin(T+zx)*0.2,zy,Math.atan2(19-zy,15-zx),vv);
    if(t>=7.2&&t<8.2){setW(c,v);c.strokeStyle='#e8e6e0';c.lineWidth=0.08;c.beginPath();c.arc(x,y,0.75,-Math.PI/2,-Math.PI/2+TAU*(t-7.2));c.stroke();resetCtx(c);}
    if(t>=5&&!picked){pin(c,v,x,y-0.6,'#e8e6e0',IC.gun,T,true);lbl(c,v,x,y-2.4,'FLAMETHROWER · II','#e8e6e0');}
    else if(t<5)lbl(c,v,x,y-2.4,`SUPPLY DROP · ${Math.ceil(5-t)} s`,`rgb(${St.smoke})`);
    if(picked&&t<9.4)lbl(c,v,p[0],p[1]-1.2,'+ Flamethrower II','#b8f04a');
    rainV(c,v,W,H,T,0.6);}});}
function tintSmoke(c,v,P_,rgb){c.globalCompositeOperation='lighter';const k=v.k;for(let i=0;i<P_.cap;i++){if(!P_.al[i])continue;const t=P_.age[i]/P_.life[i];const s=P_.s[i]+(P_.s1[i]-P_.s[i])*t;c.globalAlpha=0.07*(1-t);c.setTransform(s*k,0,0,s*k,v.ox+P_.x[i]*k,v.oy+P_.y[i]*k);c.drawImage(coalSpr,-0.5,-0.5,1,1);}
  c.globalCompositeOperation='source-over';c.globalAlpha=1;resetCtx(c);
  const k2=v.k;c.globalCompositeOperation='source-over';for(let i=0;i<P_.cap;i++){if(!P_.al[i])continue;const t=P_.age[i]/P_.life[i];const s=(P_.s[i]+(P_.s1[i]-P_.s[i])*t)*0.7;c.globalAlpha=0.12*(1-t);c.fillStyle=`rgb(${rgb})`;c.setTransform(1,0,0,1,0,0);c.beginPath();c.arc(v.ox+P_.x[i]*k2,v.oy+P_.y[i]*k2,s*k2*0.5,0,TAU);c.fill();}resetCtx(c);}

// ---- survivor NPC: follows the nearest player within 3 m to a safe point ≥ 20 m away ----
const SV_V={x0:0,y0:17,w:24,h:13.5},SV_LOOP=10;
const NPCS={SV1:{coat:'#c9a21c',name:'yellow raincoat',hood:true},SV2:{coat:'#2f7f7a',name:'nurse in scrubs',hood:false},SV3:{coat:'#d8d6d0',name:'office worker',hood:false,tie:true}};
function drawNPC(c,r,look,crouch){const L=NPCS[look];c.lineJoin='round';c.strokeStyle=CHAR.outline;c.lineWidth=Math.max(1,r*0.08);
  const s=crouch?0.82:1;c.scale(s,s);
  c.strokeStyle=L.coat;c.lineCap='round';c.lineWidth=r*0.28;c.beginPath();if(crouch){c.moveTo(0,-r*0.55);c.lineTo(r*0.35,-r*0.25);c.moveTo(0,r*0.55);c.lineTo(r*0.35,r*0.25);}else{c.moveTo(-r*0.1,-r*0.62);c.lineTo(r*0.25,-r*0.7);c.moveTo(-r*0.1,r*0.62);c.lineTo(r*0.25,r*0.7);}c.stroke();
  c.lineCap='butt';c.strokeStyle=CHAR.outline;c.lineWidth=Math.max(1,r*0.08);
  c.fillStyle=L.coat;ell(c,-r*0.05,0,r*0.5,r*0.86);c.fill();c.stroke();
  if(L.tie){c.fillStyle='#7a1f1a';c.fillRect(-r*0.1,-r*0.05,r*0.42,r*0.1);}
  if(look==='SV2'){c.fillStyle='#e8e6e0';c.fillRect(-r*0.3,-r*0.06,r*0.22,r*0.12);c.fillRect(-r*0.25,-r*0.11,r*0.12,r*0.22);}
  c.fillStyle="#c49a7c";circ(c,r*0.12,0,r*0.38);c.fill();c.stroke();
  c.fillStyle=L.hood?shade(L.coat,-0.2):look==='SV2'?'#2a2420':'#4a3a2a';ell(c,L.hood?0.02*r:-0.02*r,0,r*(L.hood?0.42:0.32),r*(L.hood?0.44:0.36));c.fill();if(L.hood)c.stroke();}
function makeSurvivorCard(){return evCard({id:'EV5',name:'Survivor',vars:[['SV1','SV1 yellow raincoat'],['SV2','SV2 nurse'],['SV3','SV3 office worker']],
  desc:'An unarmed survivor appears ≥ 15 m from the team with a marker; a safe point appears ≥ 20 m from it (here off screen: edge arrow). It crouches when alone and follows the nearest player within 3 m at 4 m/s; zombies go for it like a player. Reach the safe point: +100 each. The NPC must never look like a teammate: no gun, no slot ring, a bright coat. SV1 yellow raincoat (reads best at night), SV2 teal scrubs, SV3 white shirt and tie.',
  V:SV_V,focus:[12,22],stripR:'NPC 50 HP · follows within 3 m',seed:5500,
  bake:()=>cityBake('sv',{stage:4,power:'ruins',...SV_V,extra:ruinsExtra(RUS[0])}),step(o,dt){o.T+=dt;},
  scene(c,o,v,W,H){const T=o.T,t=T%SV_LOOP;drawBakeV(c,v,o.bake(),SV_V.x0,SV_V.y0);
    const pk=[[0,17.2,19.4],[2.6,13.6,21.0],[4.4,13.6,21.0],[10,22.6,19.0]];const p=keyAt(pk,t);
    const npcAt=[11.8,21.6];let n=npcAt.slice(),crouch=true,nf=0.3;if(t>3.6){const u=Math.min(1,(t-3.6)/6.4);const q=keyAt(pk,t-0.5);n=[lerp(npcAt[0],q[0]-0.9,Math.min(1,u*4)),lerp(npcAt[1],q[1]+0.6,Math.min(1,u*4))];if(u*4>=1){n=[q[0]-0.9,q[1]+0.6];}crouch=false;nf=Math.atan2(p[1]-n[1],p[0]-n[0]);}
    survAt(c,v,p[0],p[1],p[2]);slotRing(c,v,p[0],p[1],SLOT[0]);
    const[nx,ny]=cssOf(v,n[0],n[1]);const img=bakeChar('npc'+o.v1+(crouch?1:0)+RPX(0.4*v.k/DPR),(q,r)=>drawNPC(q,r,o.v1,crouch),RPX(0.4*v.k/DPR),2.2);putImg(c,img,nx,ny,nf);
    for(const[zx,zy,vv]of[[3.2,20.4,0],[5.4,19.0,1],[20.4,25.6,2]])walkerAt(c,v,zx+Math.sin(T+zx)*0.2,zy,Math.atan2(n[1]-zy,n[0]-zx),vv);
    if(!crouch){setW(c,v);c.globalAlpha=0.3;c.strokeStyle='#e8e6e0';c.lineWidth=0.03;c.setLineDash([0.15,0.12]);c.beginPath();c.arc(p[0],p[1],3,0,TAU);c.stroke();c.setLineDash([]);resetCtx(c);}
    pin(c,v,n[0],n[1]-0.4,'#ffffff',IC.person,T,crouch);lbl(c,v,n[0],n[1]+0.95,crouch?'HELP!':'following','rgba(255,255,255,0.75)');
    // safe point off screen to the east: edge arrow
    const ax=W-26,ay=H*0.42;c.setTransform(DPR,0,0,DPR,0,0);c.fillStyle='#34c759';c.beginPath();c.moveTo(ax+14,ay);c.lineTo(ax-4,ay-11);c.lineTo(ax-4,ay+11);c.closePath();c.fill();c.fillStyle='#101114';c.beginPath();c.arc(ax-12,ay,11,0,TAU);c.fill();c.strokeStyle='#34c759';c.lineWidth=2;c.stroke();c.translate(ax-12,ay);IC.flag(c,10,'#34c759');resetCtx(c);
    label(c,ax-12,ay+26,'safe point 22 m','#34c759');rainV(c,v,W,H,T,0.6);}});}
