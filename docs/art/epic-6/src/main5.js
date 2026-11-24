// ================= EVACUATION VOTE, EXTRACT, DAWN (6.11) =================
const HELI=[24,15.9];
function drawHeliTop(c,v,x,y,s,rot,T){setW(c,v);c.translate(x,y);c.scale(s,s);const p0=P;P=1/PPM;
  castShadow(c,q=>{q.beginPath();E(q,0.2,0,2.2,0.95);q.fill();},0.3*s,0.45*s,0.2,0.55);
  part(c,q=>R(q,1.6,-0.17,3.3,0.34,0.12),{base:'#3e4636',lit:'top',box:[1.6,-0.17,4.9,0.17],tex:steelTex(31,0.6),hi:0.35,lo:0.5,line:1.2});
  part(c,q=>R(q,4.5,-0.8,0.26,1.6,0.08),{base:'#353c2f',lit:'top',box:[4.5,-0.8,4.76,0.8],line:1.1});
  for(const sy of[-1,1])part(c,q=>R(q,-1.6,sy*1.0-0.05,2.6,0.1,0.05),{base:'#222',lit:'top',box:[-1.6,sy-0.05,1,sy+0.05],line:1});
  part(c,q=>E(q,0,0,2.1,0.92),{base:'#4a5440',lit:'radial',box:[-2.1,-0.92,2.1,0.92],tex:steelTex(33,0.5),hi:0.4,lo:0.55,rim:0.35,line:1.5});
  part(c,q=>E(q,-1.25,0,0.62,0.56),{base:'#182028',lit:'radial',box:[-1.87,-0.56,-0.63,0.56],hi:0.6,lo:0.4,rim:0.5,line:1.2});
  fillP(c,q=>R(q,0.2,-0.5,0.9,1.0,0.1),'rgba(20,24,18,0.5)');fillP(c,q=>R(q,0.35,-0.15,0.6,0.3),'rgba(230,230,220,0.6)');
  // rotor: blurred disc + 4 blades
  c.globalCompositeOperation='source-over';fillP(c,q=>E(q,0,0,3.7,3.7),'rgba(200,205,210,0.07)');strokeP(c,q=>E(q,0,0,3.7,3.7),'rgba(200,205,210,0.12)',0.03);
  for(let i=0;i<4;i++){const a=rot+i*Math.PI/2;c.save();c.rotate(a);fillP(c,q=>R(q,0,-0.1,3.65,0.2,0.05),'rgba(25,27,28,0.8)');c.restore();}
  fillP(c,q=>E(q,0,0,0.22,0.22),'#1a1c1e');fillP(c,q=>E(q,4.75,0,0.09,0.09),Math.floor(T*2)%2?'#ff3b3b':'#5a1010');
  P=p0;resetCtx(c);}
function pad(c,v,T){setW(c,v);c.globalAlpha=0.55;c.strokeStyle='#e8e6e0';c.lineWidth=0.12;c.setLineDash([0.5,0.35]);c.beginPath();c.arc(HELI[0],HELI[1],3,0,TAU);c.stroke();c.setLineDash([]);c.globalAlpha=1;resetCtx(c);
  for(let i=0;i<8;i++){const a=i/8*TAU,x=HELI[0]+Math.cos(a)*3,y=HELI[1]+Math.sin(a)*3;warmLight(c,v,x,y,0.6,'255,60,40',0.55*flick(T,i));}}
function searchlight(c,v,T,a){const f=Math.sin(T*0.5)*0.8+0.4;warmLight(c,v,HELI[0]-2.2,HELI[1],1,'240,245,255',0.4*a);
  const x=HELI[0]+Math.cos(f)*7,y=HELI[1]+Math.sin(f)*5;warmLight(c,v,x,y,3.2,'235,242,255',0.35*a);}
const VOTE_T=[[1.2,0,'E'],[2.3,1,'S'],[3.4,2,'E'],[4.6,3,'E']];const VOTE_LOOP=8.5;
const EXS=[
  {id:'EX1',name:'Two big buttons',desc:'Bottom centre, under the thumbs: a green EXTRACT and a red STAY button (140 × 56 px), a 15 s ring timer between them, and four slot-coloured chips above that fill with each player’s choice as it comes in (downed players’ chips are dimmed but still vote). The plainest and fastest to read.'},
  {id:'EX2',name:'Field radio',desc:'A rugged military radio slides up from the bottom: two big toggle switches (EXTRACT / STAY), a green LCD countdown and four slot lamps that light in the voter’s colour. Diegetic and in the Dead City mood; the switches are as big as EX1’s buttons.'},
  {id:'EX3',name:'Evidence tags',desc:'Two large cards in the shop’s “police evidence tag” style (C3, Story 5.13): EXTRACT with a helicopter stamp, STAY with a skull stamp. Each vote pins a slot-coloured clip on its card. Matches the card shop the players already know.'},
];
function voteState(t){const v=[null,null,null,null];for(const[tt,i,c]of VOTE_T)if(t>=tt)v[i]=c;return v;}
function rr2(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):c.rect(x,y,w,h);}
function voteUI(c,W,H,style,t){c.setTransform(DPR,0,0,DPR,0,0);const vs=voteState(t),left=Math.max(0,15-t*2),done=t>6.4;const nE=vs.filter(x=>x==='E').length,nS=vs.filter(x=>x==='S').length;
  c.font='600 20px Oswald, sans-serif';c.textAlign='center';c.fillStyle='#e8e4da';c.fillText(done?`EXTRACT · ${nE} – ${nS}`:'EVAC IS HERE',W/2,40);c.font='500 12px Inter, sans-serif';c.fillStyle='rgba(232,228,218,0.7)';c.fillText(done?'Get to the helicopter':'Extract now, or stay and fight on (endless)?',W/2,58);
  const names=['You','Kai','Jess','Rafa'];
  if(style==='EX1'){const bw=140,bh=56,y=H-bh-22;[[W/2-bw-46,'EXTRACT','#2f9e52','E'],[W/2+46,'STAY','#b3261e','S']].forEach(([x,txt,col,k])=>{rr2(c,x,y,bw,bh,10);c.fillStyle=col;c.globalAlpha=done&&k==='S'?0.35:1;c.fill();c.globalAlpha=1;c.strokeStyle=vs[0]===k?'#fff':'rgba(0,0,0,0.5)';c.lineWidth=vs[0]===k?3:1;c.stroke();c.font='700 20px Oswald, sans-serif';c.fillStyle='#fff';c.fillText(txt,x+bw/2,y+35);});
    c.beginPath();c.arc(W/2,y+bh/2,22,0,TAU);c.fillStyle='rgba(0,0,0,0.6)';c.fill();c.strokeStyle='#e8e4da';c.lineWidth=4;c.beginPath();c.arc(W/2,y+bh/2,20,-Math.PI/2,-Math.PI/2+TAU*left/15);c.stroke();c.font='700 16px Oswald, sans-serif';c.fillStyle='#e8e4da';c.fillText(Math.ceil(left),W/2,y+bh/2+6);
    vs.forEach((k,i)=>{const x=W/2-118+i*62,yy=y-40;rr2(c,x,yy,52,26,13);c.fillStyle=k?SLOT[i]:'rgba(0,0,0,0.55)';c.globalAlpha=i===3?0.7:1;c.fill();c.globalAlpha=1;c.strokeStyle=SLOT[i];c.lineWidth=2;c.stroke();c.font='600 11px Inter, sans-serif';c.fillStyle=k?'#0c0d0f':SLOT[i];c.fillText(k?(k==='E'?'⬆ EXT':'✕ STAY'):names[i]+(i===3?' ↓':''),x+26,yy+17);});}
  if(style==='EX2'){const pw=380,ph=110,x=(W-pw)/2,y=H-ph-12;rr2(c,x,y,pw,ph,10);const g=c.createLinearGradient(0,y,0,y+ph);g.addColorStop(0,'#4a4f3c');g.addColorStop(1,'#2c3024');c.fillStyle=g;c.fill();c.strokeStyle='#14160f';c.lineWidth=3;c.stroke();
    for(const sx of[x+10,x+pw-16])for(const sy of[y+10,y+ph-16]){c.fillStyle='#8a8e80';c.beginPath();c.arc(sx+3,sy+3,3,0,TAU);c.fill();}
    rr2(c,x+pw/2-50,y+14,100,34,4);c.fillStyle='#1f3b1c';c.fill();c.font='700 22px "JetBrains Mono", monospace';c.fillStyle='#8cff6a';c.fillText('00:'+String(Math.ceil(left)).padStart(2,'0'),x+pw/2,y+40);
    [[x+40,'EXTRACT','E'],[x+pw-130,'STAY','S']].forEach(([sx,txt,k])=>{rr2(c,sx,y+20,90,62,6);c.fillStyle='#1d2018';c.fill();const on=vs[0]===k;rr2(c,sx+30,on?y+26:y+48,30,28,5);c.fillStyle=on?'#d8d4c4':'#8a8e80';c.fill();c.font='700 13px Oswald, sans-serif';c.fillStyle=k==='E'?'#7bdc6c':'#ff7a6a';c.fillText(txt,sx+45,y+98);});
    vs.forEach((k,i)=>{const lx=x+pw/2-36+i*24,ly=y+70;c.beginPath();c.arc(lx,ly,7,0,TAU);c.fillStyle=k?SLOT[i]:'#15170f';c.fill();if(k){c.globalCompositeOperation='lighter';c.fillStyle=SLOT[i]+'55';c.beginPath();c.arc(lx,ly,13,0,TAU);c.fill();c.globalCompositeOperation='source-over';}c.font='500 9px Inter';c.fillStyle='#c8ccb8';c.fillText(k?k:'·',lx,ly+22);});}
  if(style==='EX3'){[[W/2-170,'EXTRACT','E','#d9cfb2'],[W/2+20,'STAY','S','#d9cfb2']].forEach(([x,txt,k,col],j)=>{const y=H-150,w=150,h=128;c.save();c.translate(x+w/2,y+h/2);c.rotate(j?0.04:-0.04);c.translate(-w/2,-h/2);
      c.fillStyle='rgba(0,0,0,0.4)';rr2(c,4,6,w,h,6);c.fill();c.fillStyle=col;rr2(c,0,0,w,h,6);c.fill();c.strokeStyle='#5b5240';c.lineWidth=1;c.stroke();c.beginPath();c.arc(w/2,14,6,0,TAU);c.fillStyle='#2a2620';c.fill();
      c.font='600 10px "JetBrains Mono", monospace';c.fillStyle='#5b5240';c.fillText('EVIDENCE · WAVE 10',w/2,36);c.font='700 26px Oswald, sans-serif';c.fillStyle=k==='E'?'#1f6b34':'#8f1d17';c.fillText(txt,w/2,70);
      c.strokeStyle=k==='E'?'rgba(31,107,52,0.6)':'rgba(143,29,23,0.6)';c.lineWidth=2;c.beginPath();c.arc(w/2,98,16,0,TAU);c.stroke();c.font='700 14px Inter';c.fillStyle=c.strokeStyle;c.fillText(k==='E'?'✈':'☠',w/2,104);
      vs.forEach((v_,i)=>{if(v_!==k)return;const n=vs.slice(0,i).filter(q=>q===k).length;c.fillStyle=SLOT[i];rr2(c,10+n*20,h-26,14,30,3);c.fill();c.strokeStyle='#111';c.stroke();});c.restore();});
    c.font='700 18px Oswald, sans-serif';c.fillStyle='#e8e4da';c.fillText(Math.ceil(left)+' s',W/2,H-80);}
  resetCtx(c);}
function makeVoteCard(F,i){return{id:F.id,name:F.name,desc:F.desc,F,W:844,H:390,seed:6000+i*7,anim:true,stripR:'helicopter on the 6 m pad · real size',stripL:'phone 844 × 390 (above) · 48 px/m (below)',
  step:(o,dt)=>{o.T+=dt;},still:5.2,
  drawMain(o){const W=o.W,H=o.H,c=prep(o.cv,W,H),t=o.T%VOTE_LOOP,k=W/24*DPR,v={k,ox:-(HELI[0]-12)*k,oy:-(HELI[1]-H/2/(W/24))*k};
    voteScene(c,o,v,W,H);voteUI(c,W,H,F.id,t);},
  drawStrip(o){const W=Math.max(300,Math.round(o.sv.clientWidth||540)),H=300,c=prep(o.sv,W,H),k=DEV,v={k,ox:W*DPR/2-HELI[0]*k,oy:H*DPR/2-HELI[1]*k};voteScene(c,o,v,W,H);scaleBar(c,W-62,H-8);}};}
function voteScene(c,o,v,W,H){const T=o.T;c.fillStyle='#050608';c.fillRect(0,0,c.canvas.width,c.canvas.height);drawBakeV(c,v,cityBake('bl',{stage:5,power:'off',...BL_V,extra:blackoutExtra()}),BL_V.x0,BL_V.y0);
  pad(c,v,T);const ps=[[20.4,18.4],[27.4,18.8],[21,12.8],[26.6,13.4]];ps.forEach((p,i)=>{survAt(c,v,p[0],p[1],Math.atan2(HELI[1]-p[1],HELI[0]-p[0]),i===3?0.6:1);});
  const lights=[{r:[HELI[0],HELI[1],5.5,0.9]}].concat(ps.map(p=>({r:[p[0],p[1],1.6,0.75]})));darkness(c,o,v,W,H,0.82,'4,6,12',lights);
  drawHeliTop(c,v,HELI[0],HELI[1],1,T*14,T);searchlight(c,v,T,1);ps.forEach((p,i)=>{survAt(c,v,p[0],p[1],Math.atan2(HELI[1]-p[1],HELI[0]-p[0]),i===3?0.6:1);slotRing(c,v,p[0],p[1],SLOT[i],i===3?0.5:0.9);});
  rainV(c,v,W,H,T,0.5);}

// ---- dawn on extract: the helicopter lifts off, 4 s of first light, then Results "Extracted" ----
const DWS=[
  {id:'DW1',name:'Warm sunrise',desc:'A warm orange-pink light sweeps in from the east edge over 4 s, the darkness lifts to a soft morning grey, wet asphalt catches the gold, the rain thins to nothing. The classic “we made it” moment.'},
  {id:'DW2',name:'Blue hour',desc:'No sun yet: the whole district lifts from black to a cold grey-blue, mist settles low on the street, the rain stops and the fires look small. Quiet, bleak, more “Dead City” than triumphant.'},
  {id:'DW3',name:'Light through smoke',desc:'Shafts of pale gold break through the smoke from the top right and sweep across the intersection as the helicopter climbs into them; dust and ash glitter in the beams. The most cinematic, a few more particles for 4 s.'},
];
const DW_LOOP=8;
function makeDawnCard(F,i){return{kind:'map',id:F.id,name:F.name,desc:F.desc,F,seed:6500+i*13,anim:true,V:BL_V,focus:[24,15.6],stripH:300,still:4.4,stripR:'4 s dawn, then Results',
  bake:()=>cityBake('bl',{stage:5,power:'off',...BL_V,extra:blackoutExtra()}),init(o){o.fire=carFire(BL_FIRE[0],BL_FIRE[1],2);},step(o,dt){o.T+=dt;stepCarFire(o.fire,dt,o.T,0.6);},
  scene(c,o,v,W,H,which){const T=o.T,t=T%DW_LOOP,F=o.F,dawn=smooth((t-1)/4);drawBakeV(c,v,o.bake(),BL_V.x0,BL_V.y0);drawCarFire(c,v,o.fire,T,0.3*(1-dawn*0.6));
    const ps=[[20.4,18.4],[27.4,18.8],[21,12.8],[26.6,13.4]];const gone=t>1.2;
    if(!gone)ps.forEach((p,i)=>survAt(c,v,p[0],p[1],0));
    const lights=[{r:[o.fire.x,o.fire.y,4,0.95]},{r:[HELI[0],HELI[1],5.5,0.9]}];darkness(c,o,v,W,H,0.85*(1-dawn*(F.id==='DW2'?0.75:0.82)),F.id==='DW2'?'14,22,40':'4,6,12',lights);
    c.setTransform(1,0,0,1,0,0);const cw=c.canvas.width,ch=c.canvas.height;
    if(F.id==='DW1'){c.globalCompositeOperation='soft-light';const g=c.createLinearGradient(cw,0,0,ch);g.addColorStop(0,`rgba(255,170,90,${0.9*dawn})`);g.addColorStop(Math.min(0.99,0.2+dawn*0.7),`rgba(255,140,120,${0.5*dawn})`);g.addColorStop(1,'rgba(80,90,140,0)');c.fillStyle=g;c.fillRect(0,0,cw,ch);
      c.globalCompositeOperation='lighter';const g2=c.createLinearGradient(cw,0,cw*0.3,ch);g2.addColorStop(0,`rgba(255,160,80,${0.22*dawn})`);g2.addColorStop(1,'rgba(255,160,80,0)');c.fillStyle=g2;c.fillRect(0,0,cw,ch);}
    if(F.id==='DW2'){c.globalCompositeOperation='screen';c.fillStyle=`rgba(70,88,120,${0.35*dawn})`;c.fillRect(0,0,cw,ch);if(!FOGTEX)buildFogTex();const p=c.createPattern(FOGTEX,'repeat');p.setTransform(new DOMMatrix().translate(T*20,0).scale(v.k*8/FOGTEX.width));c.globalCompositeOperation='source-over';c.globalAlpha=0.25*dawn;c.fillStyle=p;c.fillRect(0,0,cw,ch);c.globalAlpha=1;}
    if(F.id==='DW3'){c.globalCompositeOperation='soft-light';c.fillStyle=`rgba(200,180,140,${0.5*dawn})`;c.fillRect(0,0,cw,ch);c.globalCompositeOperation='lighter';
      for(let i=0;i<5;i++){const a=2.2+i*0.14+Math.sin(T*0.3+i)*0.03,sx=cw*1.05,sy=-ch*0.1,L=cw*1.6,w=0.035+hash(i)*0.03;const g=c.createLinearGradient(sx,sy,sx+Math.cos(a)*L,sy+Math.sin(a)*L);g.addColorStop(0,`rgba(255,220,150,${0.22*dawn})`);g.addColorStop(1,'rgba(255,220,150,0)');c.fillStyle=g;c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+Math.cos(a-w)*L,sy+Math.sin(a-w)*L);c.lineTo(sx+Math.cos(a+w)*L,sy+Math.sin(a+w)*L);c.closePath();c.fill();}}
    resetCtx(c);
    // helicopter lifts off: grows (closer to the camera) and leaves to the north-east
    const u=smooth((t-0.6)/3.4);drawHeliTop(c,v,HELI[0]+u*9,HELI[1]-u*11,1+u*0.7,T*16,T);
    if(F.id==='DW3')ashFall(c,v,W,H,T);else rainV(c,v,W,H,T,0.6*(1-dawn));
    if(which==='main'&&t>5){const a=Math.min(1,(t-5)*2);c.setTransform(DPR,0,0,DPR,0,0);c.globalAlpha=a;c.fillStyle='rgba(8,9,11,0.72)';c.fillRect(0,0,W,H);c.textAlign='center';c.font='700 44px Oswald, sans-serif';c.fillStyle='#e8e4da';c.fillText('EXTRACTED',W/2,H*0.38);
      c.font='500 14px Inter, sans-serif';c.fillStyle='rgba(232,228,218,0.75)';c.fillText('Wave 10 · 1,284 kills · the Behemoth down in 1:12',W/2,H*0.38+30);
      ['You  412 kills  $2,140','Kai  355 kills  $1,980','Jess  301 kills  $1,720','Rafa  216 kills  $1,390'].forEach((s,i)=>{c.fillStyle=SLOT[i];c.font='600 15px "JetBrains Mono", monospace';c.fillText(s,W/2,H*0.38+70+i*24);});c.globalAlpha=1;resetCtx(c);}}};}
