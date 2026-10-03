(() => {
  'use strict';
  // This renderer only paints. It has no API, device, request or result authority.
  const canvas = document.getElementById('elevatorAscent');
  const dialog = document.getElementById('elevatorDialog');
  const sheet = dialog?.querySelector('.elevator-sheet');
  const label = document.getElementById('elevatorPhase');
  if (!canvas || !sheet || !label) return;
  let ctx;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch (_) {}
  if (!ctx || !window.LW5DepthScene) { canvas.dataset.renderMode = 'fallback'; return; }
  canvas.parentElement.classList.add('ascent-rendered');
  const cycle = 9.6;
  let width = 320, height = 300, time = 0, frame = 0, previous = 0;
  let mode = 'still', wasOpen = false;
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
  const fract = n => n - Math.floor(n);
  const seed = n => fract(Math.sin(n * 127.1 + 31.7) * 43758.5453);
  // Distant nebula grains stay behind all scene geometry; wing dust has real depth.
  const grains = Array.from({length:480},(_,i)=>({a:seed(i+1)*Math.PI*2,u:seed(i+71),z:seed(i+143),s:seed(i+911),tint:i%9===0?'gold':i%5===0?'violet':'ice'}));
  const wings = Array.from({length:420},(_,i)=>({side:i%2?-1:1,f:Math.floor(seed(i+301)*16),u:seed(i+719),n:seed(i+823)-.5,size:seed(i+1311),tint:i%11===0?'gold':i%7===0?'violet':'ice'}));
  // Fixed pools: these are the same grains before and after each impact.
  // The hit time is the inverse of the cultivator's ascent curve, not a timer
  // unrelated to the crossing. No particles are spawned, retained or sent anywhere.
  const rings = [.53,.365,.21].map((level,k)=>({
    level, radius:.31-k*.062, squash:.24+k*.025,
    hit:4.1+1.45*Math.pow((.625-level)/.51,1/1.8),
    particles:Array.from({length:144},(_,i)=>{
      const a=i/144*Math.PI*2+(seed(i+k*173+4001)-.5)*.024;
      return {c:Math.cos(a),s:Math.sin(a),j:seed(i+k*181+4301)-.5,
        speed:.65+seed(i+k*197+4701)*.75,delay:seed(i+k*151+4901)*.09,
        size:1.3+seed(i+k*163+5101)*2.1,
        tint:i%8===0?'gold':i%11===0?'pearl':'ice',dust:i%9===0};
    })
  }));
  const light = window.LW5ParticleLight;
  let economy=false, slowFrames=0;
  function dot(x,y,r,a,tint='ice',kind='point'){
    if(light){light.paint(ctx,x,y,r,a,tint,kind);return;}
    // If the optional light atlas fails to load, preserve a readable low-cost scene.
    ctx.save();ctx.globalAlpha*=Math.max(0,Math.min(1,a));ctx.fillStyle='#b8dbea';ctx.beginPath();ctx.arc(x,y,Math.max(.25,r*.18),0,Math.PI*2);ctx.fill();ctx.restore();
  }
  const mix=(a,b,u)=>a+(b-a)*u;
  // Three articulated bones and separately bound feather blades. Fixed typed
  // buffers are reused every frame; the wing is never scaled as one rigid fan.
  const wingBones=[new Float32Array(12),new Float32Array(12)];
  const wingCurves=[new Float32Array(16*8),new Float32Array(16*8)];
  const delayedBones=new Float32Array(12);
  const featherDefs=Array.from({length:16},(_,f)=>{
    const segment=f<4?0:f<10?1:2;
    const u=segment===0?f/3:segment===1?(f-4)/5:(f-10)/5;
    return {segment,u:.12+u*.82,length:segment===0?18+u*14:segment===1?39+u*7:[55,61,57,50,40,23][f-10],
      rake:segment===0?1.35:segment===1?1.48:1.0,width:segment===0?3.4:5.8,
      lag:.025+f/15*.145};
  });
  function wingPose(t,side,out){
    t-=side*.025;
    const rootOpen=ease((t-.55)/1.32),middleOpen=ease((t-.85)/1.50),tipOpen=ease((t-1.13)/1.63);
    const rootSweep=ease((t-3.56)/.70),middleSweep=ease((t-3.69)/.70),tipSweep=ease((t-3.82)/.72);
    const settle=Math.max(0,t-2.2);
    const recoil=settle>0?Math.sin(settle*5)*Math.exp(-settle*3)*.045:0;
    const a0=mix(mix(-1.35,-.33,rootOpen),.98,rootSweep);
    const a1=mix(mix(1.40,-.82,middleOpen),1.48,middleSweep);
    const a2=mix(mix(1.68,-.33,tipOpen)+recoil,1.68,tipSweep);
    out[0]=6;out[1]=-10;
    out[2]=out[0]+Math.cos(a0)*26;out[3]=out[1]+Math.sin(a0)*26;
    out[4]=out[2]+Math.cos(a1)*34;out[5]=out[3]+Math.sin(a1)*34;
    out[6]=out[4]+Math.cos(a2)*43;out[7]=out[5]+Math.sin(a2)*43;
    out[8]=a0;out[9]=a1;out[10]=a2;out[11]=tipOpen*(1-tipSweep);
  }
  function prepareWings(t,quiet){
    if(quiet)t=3.1;
    for(let side=0;side<2;side++){
      wingPose(t,side,wingBones[side]);
      const curves=wingCurves[side];
      for(let f=0;f<16;f++){
        const def=featherDefs[f],p=delayedBones;
        wingPose(t-(quiet?0:def.lag),side,p);
        const seg=def.segment*2,k=f*8;
        const bx=mix(p[seg],p[seg+2],def.u),by=mix(p[seg+1],p[seg+3],def.u);
        const angle=mix(1.56,p[8+def.segment]+def.rake,p[11]);
        const len=def.length*(.68+.32*p[11]);
        const dx=Math.cos(angle)*len,dy=Math.sin(angle)*len;
        // Small tip deflection follows the blade, never an entire-wing flap.
        const curl=Math.sin(t*1.7-f*.42)*.7*p[11];
        curves[k]=bx;curves[k+1]=by;
        curves[k+2]=bx+dx*.28-dy*.09;curves[k+3]=by+dy*.28+dx*.09;
        curves[k+4]=bx+dx*.77-dy*.025;curves[k+5]=by+dy*.77+dx*.025+curl;
        curves[k+6]=bx+dx;curves[k+7]=by+dy+curl;
      }
    }
  }
  function paintBody(t){
      // Curved robe, flowing sleeves and selective rim light keep the figure calm and readable.
      ctx.globalCompositeOperation='source-over';
      const cloth=ctx.createLinearGradient(-12,-15,10,35);cloth.addColorStop(0,'#0b1729');cloth.addColorStop(.52,'#243c50');cloth.addColorStop(1,'rgba(71,100,119,.82)');
      ctx.fillStyle=cloth;
      const flow=Math.sin(t*1.3)*2.2;
      ctx.beginPath();ctx.moveTo(-4,-13);ctx.bezierCurveTo(-9,-12,-10,-8,-15,-4);ctx.quadraticCurveTo(-20,1,-22,10);ctx.quadraticCurveTo(-12,10,-5,1);ctx.bezierCurveTo(-5,14,-9,24,-11+flow,35);ctx.quadraticCurveTo(-3,31,0,27);ctx.quadraticCurveTo(5+flow,35,13+flow,31);ctx.bezierCurveTo(7,22,5,11,5,1);ctx.quadraticCurveTo(14,10,21,7);ctx.quadraticCurveTo(18,-3,13,-5);ctx.quadraticCurveTo(8,-12,4,-13);ctx.closePath();ctx.fill();
      ctx.fillStyle='#152337';ctx.beginPath();ctx.ellipse(.3,-19,3.7,5.5,-.1,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(-.2,-25,1.7,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(205,226,230,.5)';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(2,-23);ctx.quadraticCurveTo(4.5,-19,3,-15);ctx.moveTo(4,-12);ctx.quadraticCurveTo(10,-9,13,-5);ctx.quadraticCurveTo(18,-2,20,6);ctx.stroke();
      ctx.strokeStyle='rgba(179,209,222,.28)';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(-2,-10);ctx.quadraticCurveTo(1,6,-5,27);ctx.moveTo(3,3);ctx.quadraticCurveTo(5,18,10+flow,30);ctx.stroke();
      ctx.strokeStyle='rgba(229,213,165,.5)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-4,3);ctx.quadraticCurveTo(0,5,5,3);ctx.stroke();
      // Two tapered silk ribbons, filled and softly fading rather than outlined polygons.
      const silk=ctx.createLinearGradient(0,0,0,52);silk.addColorStop(0,'rgba(130,171,190,.45)');silk.addColorStop(1,'rgba(114,151,176,0)');ctx.fillStyle=silk;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*4,4);ctx.bezierCurveTo(side*15,23,side*(17+flow),38,side*9,51);ctx.bezierCurveTo(side*(12+flow),33,side*8,19,side*2,5);ctx.fill();}
  }
  const scene=new window.LW5DepthScene(1600);
  const hero={x:0,y:0,z:0,scale:1,presence:1,t:0,charge:0,quiet:false};
  const arcPoint=new Float32Array(2);
  function addDot(x,y,r,a,tint,kind,z){
    if(a<.003||r<=0)return;
    const q=scene.add(0,z);if(!q)return;
    q.x=x;q.y=y;q.r=r;q.a=a;q.tint=tint;q.sprite=kind||'point';
  }
  function addLine(x,y,tx,ty,w,a,tint,z){
    if(a<.003)return;const q=scene.add(1,z);if(!q)return;
    q.x=x;q.y=y;q.tx=tx;q.ty=ty;q.w=w;q.a=a;q.tint=tint;
  }
  function curvePoint(a,k,u,out){
    const v=1-u;
    out[0]=v*v*v*a[k]+3*v*v*u*a[k+2]+3*v*u*u*a[k+4]+u*u*u*a[k+6];
    out[1]=v*v*v*a[k+1]+3*v*v*u*a[k+3]+3*v*u*u*a[k+5]+u*u*u*a[k+7];
  }
  function spinePoint(u,p,out){
    const mx=(p[2]+p[4])*.5,my=(p[3]+p[5])*.5;
    const a=u<.53?u/.53:(u-.53)/.47,v=1-a;
    out[0]=u<.53?v*v*p[0]+2*v*a*p[2]+a*a*mx:v*v*mx+2*v*a*p[4]+a*a*p[6];
    out[1]=u<.53?v*v*p[1]+2*v*a*p[3]+a*a*my:v*v*my+2*v*a*p[5]+a*a*p[7];
  }
  function paintFeather(f,side,covert){
    const a=wingCurves[side],k=f*8;
    const dx=a[k+6]-a[k],dy=a[k+7]-a[k+1],len=Math.hypot(dx,dy)||1;
    const size=featherDefs[f].width*(covert?1.48:1);
    const nx=-dy/len*size,ny=dx/len*size;
    const reach=covert?.46:1;
    const ex=a[k]+dx*reach,ey=a[k+1]+dy*reach;
    // Translucent material has an actual silhouette; it does not brighten
    // everything below it as an additive sheet would.
    const material=ctx.createLinearGradient(a[k]-nx,a[k+1]-ny,a[k]+nx,a[k+1]+ny);
    material.addColorStop(0,'rgba(45,95,124,.18)');material.addColorStop(.42,covert?'rgba(150,194,212,.58)':'rgba(143,213,236,.34)');
    material.addColorStop(.53,covert?'rgba(216,233,233,.62)':'rgba(220,242,249,.42)');material.addColorStop(1,'rgba(44,103,139,.08)');ctx.fillStyle=material;
    ctx.beginPath();ctx.moveTo(a[k]-nx*.28,a[k+1]-ny*.28);
    ctx.bezierCurveTo(a[k]+dx*.22+nx*.75,a[k+1]+dy*.22+ny*.75,ex-dx*.22+nx*.6,ey-dy*.22+ny*.6,ex,ey);
    ctx.bezierCurveTo(ex-dx*.18-nx*.55,ey-dy*.18-ny*.55,a[k]+dx*.16-nx*.6,a[k+1]+dy*.16-ny*.6,a[k]-nx*.28,a[k+1]-ny*.28);ctx.fill();
    ctx.strokeStyle='rgba(208,233,238,'+(covert?.52:.42)+')';ctx.lineWidth=covert?.65:.5;
    ctx.beginPath();ctx.moveTo(a[k],a[k+1]);ctx.bezierCurveTo(a[k]+dx*.25-dy*.055,a[k+1]+dy*.25+dx*.055,ex-dx*.22,ey-dy*.22,ex,ey);ctx.stroke();
    // Fine vane filaments run from the silver spine into the feather edge.
    ctx.lineWidth=.34;ctx.strokeStyle='rgba(162,210,224,'+(covert?.24:.3)+')';
    for(let j=0;j<4;j++){
      const u=(.2+j*.16)*reach;
      curvePoint(a,k,u,arcPoint);
      const px=arcPoint[0],py=arcPoint[1],w=Math.sin(u*Math.PI)*.7;
      ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px+nx*w*.7+dx*.03,py+ny*w*.7+dy*.03,px+nx*w+dx*.1,py+ny*w+dy*.1);ctx.stroke();
    }
    if(!covert){
      const energy=(.22+hero.charge*.76)*Math.pow((Math.sin(hero.t*2.1-f*.69-side*.4)+1)*.5,4);
      if(energy>.045){
        ctx.lineWidth=.75;ctx.strokeStyle='rgba(228,247,255,'+energy+')';
        ctx.beginPath();
        for(let j=0;j<=15;j++){const u=.16+j/15*.72;curvePoint(a,k,u,arcPoint);const wiggle=Math.sin(u*54+hero.t*5+f)*.65*Math.sin(u*Math.PI);
          const px=arcPoint[0]+nx*wiggle*.16,py=arcPoint[1]+ny*wiggle*.16;
          if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        }ctx.stroke();
        if(f%3===0){curvePoint(a,k,.55,arcPoint);ctx.beginPath();ctx.moveTo(arcPoint[0],arcPoint[1]);ctx.lineTo(arcPoint[0]+nx*.4,arcPoint[1]+ny*.4);ctx.lineTo(arcPoint[0]+nx*.55+dx*.09,arcPoint[1]+ny*.55+dy*.09);ctx.stroke();}
      }
      dot(ex,ey,2.8,.22+hero.charge*.18,'pearl');
    }
  }
  function paintArc(side,lobe){
    const p=wingBones[side],t=hero.t;
    const center=fract(t*.38+side*.23+lobe*.5);
    const lo=Math.max(0,center-.24),hi=Math.min(1,center+.24);
    const burst=Math.exp(-Math.pow((t-4.02)/.22,2));
    const strength=Math.min(1,Math.sin(center*Math.PI)*(.28+hero.charge*.76+burst*.4));
    for(let pass=0;pass<3;pass++){
      ctx.lineWidth=pass===0?8:pass===1?2.1:.95;
      ctx.strokeStyle=pass===0?'rgba(80,159,255,'+strength*.18+')':pass===1?'rgba(123,208,250,'+strength*.26+')':'rgba(233,249,255,'+strength*.86+')';
      ctx.beginPath();
      for(let j=0;j<=28;j++){
        const u=mix(lo,hi,j/28);spinePoint(u,p,arcPoint);
        const noise=(Math.sin(u*73+t*7)*1.04+Math.sin(u*37-t*4)*.64)*Math.sin(j/28*Math.PI);
        const px=arcPoint[0],py=arcPoint[1]+noise;
        if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }ctx.stroke();
    }
    spinePoint(center,p,arcPoint);const ax=arcPoint[0],ay=arcPoint[1];
    spinePoint(Math.min(1,center+.015),p,arcPoint);const dx=arcPoint[0]-ax,dy=arcPoint[1]-ay,len=Math.hypot(dx,dy)||1;
    const nx=dy/len,ny=-dx/len,tx=dx/len,ty=dy/len,reach=8+hero.charge*9;
    // A small fork escapes the leading edge; its cyan envelope follows the
    // same travelling packet and depth as the wing rather than flashing above it.
    ctx.lineWidth=.72;ctx.strokeStyle='rgba(156,216,255,'+strength*.7+')';ctx.beginPath();ctx.moveTo(ax,ay);
    ctx.lineTo(ax+nx*reach*.38+tx*2,ay+ny*reach*.38+ty*2);
    ctx.lineTo(ax+nx*reach*.64-tx*1.6,ay+ny*reach*.64-ty*1.6);
    ctx.lineTo(ax+nx*reach+tx*1.3,ay+ny*reach+ty*1.3);ctx.stroke();
    ctx.strokeStyle='rgba(193,182,247,'+strength*.4+')';ctx.lineWidth=.48;ctx.beginPath();ctx.moveTo(ax+nx*reach*.38+tx*2,ay+ny*reach*.38+ty*2);ctx.lineTo(ax+nx*reach*.64+tx*5,ay+ny*reach*.64+ty*5);ctx.lineTo(ax+nx*reach*.71+tx*8,ay+ny*reach*.71+ty*8);ctx.stroke();
    dot(ax,ay,5,strength*.47,'ice');
  }
  function enqueueWings(t,charge,quiet,step){
    prepareWings(t,quiet);
    const h=hero,s=h.scale;
    for(let side=0;side<2;side++){
      const bone=scene.add(6,h.z-.085-side*.012);bone.side=side;
      for(let f=0;f<16;f++){
        const z=h.z-.045-f*.003-(side===0?.018:0);
        const q=scene.add(2,z);q.side=side;q.f=f;
        const cover=scene.add(5,z+.011);cover.side=side;cover.f=f;
      }
      for(let lobe=0;lobe<2;lobe++){const q=scene.add(4,h.z-.07-side*.009-lobe*.01);q.side=side;q.lobe=lobe;}
    }
    for(let i=0;i<wings.length;i+=step){
      const w=wings[i],side=w.side<0?0:1,a=wingCurves[side],u=fract(w.u+t*.028);
      curvePoint(a,w.f*8,u,arcPoint);
      const breadth=Math.sin(u*Math.PI)*featherDefs[w.f].width;
      const alpha=h.presence*(.22+charge*.30)*Math.sin(u*Math.PI)*(.55+w.size*.65);
      addDot(h.x+(arcPoint[0]*w.side+w.n*breadth*.65)*s,h.y+(arcPoint[1]+w.n*breadth)*s,(1.05+w.size*1.75)*s,alpha,w.tint,'point',h.z-.037-w.f*.003-(side===0?.018:0));
    }
  }
  function enqueueRings(t,x,quiet){
    const step=economy?2:1;
    for(let k=0;k<rings.length;k++){
      const ring=rings[k],age=quiet?-1:t-ring.hit;if(age>2.45)continue;
      const radius=width*ring.radius,cy=height*ring.level;
      const baseZ=-.7*(.625-ring.level)/.51;
      const reveal=quiet?1:ease((t-.1-k*.13)/1);
      if(age>0&&age<.32){
        const pulse=Math.sin(clamp(age/.32)*Math.PI),wave=clamp(age/.15),wr=radius*wave;
        addDot(x,cy,55,pulse*.34,'pearl','core',baseZ-.018);
        for(let i=0;i<ring.particles.length;i+=6*step){const p=ring.particles[i];
          addDot(x+p.c*wr,cy+p.s*wr*ring.squash,2.4,pulse*(1-wave*.4)*.43,'ice','point',baseZ+p.s*wr*.5/width);
        }
      }
      for(let i=0;i<ring.particles.length;i+=step){
        const p=ring.particles[i],local=age-.115-p.delay-(p.s+1)*.018;
        const a=Math.max(0,local),drag=(1-Math.exp(-a*1.65))/1.65;
        const speed=width*(.68+k*.075)*p.speed,flight=drag*speed;
        const compression=age>0&&local<0?1-.035*Math.sin(clamp(age/.22)*Math.PI):1;
        const r=(radius+p.j*4+Math.sin(t*.8+i*.7)*.5)*compression,swirl=p.j*flight*.18;
        const px=x+p.c*(r+flight)-p.s*swirl;
        const py=cy+p.s*(r*ring.squash+flight*(ring.squash+.3))+p.c*swirl*.45+a*a*height*.058+p.j*flight*.18;
        // Continuous depth follows the same current position/ballistic flight.
        // There is no permanent front-half flag, and different rings interleave.
        const z=baseZ+(p.s*(r+flight)+p.c*swirl*.45)*.5/width+a*a*.08;
        const fade=a>0?Math.pow(Math.max(0,1-a/1.85),1.45):1;
        const surge=a>0?.52+Math.exp(-a*5)*.48:.36+(p.s+1)*.06;
        const alpha=reveal*fade*surge*(p.dust?.35:1)*(.77+.23*clamp(z+.7));
        if(alpha<.004)continue;
        if(a>0&&!p.dust){
          const back=Math.max(0,a-.075),prior=(1-Math.exp(-back*1.65))/1.65*speed,ps=p.j*prior*.18;
          const tx=x+p.c*(r+prior)-p.s*ps;
          const ty=cy+p.s*(r*ring.squash+prior*(ring.squash+.3))+p.c*ps*.45+back*back*height*.058+p.j*prior*.18;
          addLine(px,py,tx,ty,.55,alpha*.42,p.tint,z-.0002);
          addDot((tx+px)*.5,(ty+py)*.5,p.size*1.4,alpha*.24,p.tint,'point',z-.0001);
        }
        addDot(px,py,p.dust?p.size*3:p.size,alpha,p.tint,p.dust?'dust':'point',z);
        if(a<.32&&!p.dust&&i%4===0)addDot(px,py,p.size*3,alpha*.12,p.tint,'dust',z-.0003);
      }
    }
  }
  function enqueueWake(t,x,y,streak,step){
    if(streak<=0)return;
    for(let lane=-3;lane<=3;lane++){
      for(let j=0;j<17;j++){
        const u=j/17,v=(j+1)/17;
        const ax=x+lane*(2*u+12*u*u),ay=y+10+(height-y)*u;
        const bx=x+lane*(2*v+12*v*v),by=y+10+(height-y)*v;
        const a=streak*Math.pow(1-u,1.8)*(lane===0?.62:.17);
        addLine(ax,ay,bx,by,lane===0?1.05:1.6,a,'ice',mix(hero.z,-.025,u)-.03);
      }
    }
    addDot(x,y+3,75,streak*(.5-hero.presence*.2),'pearl','core',hero.z-.01);
    addDot(x,y-4,8,streak*(1-hero.presence)*.92,'pearl','point',hero.z-.005);
    for(let i=0;i<110;i+=step){const u=seed(i+3401),gy=y+(height-y)*u;
      addDot(x+(seed(i+3701)-.5)*(4+u*45),gy,1+seed(i+3811)*3,streak*(1-u)*.4,i%4?'ice':'gold','point',mix(hero.z,-.025,u)-.022);
    }
  }
  function paintItem(q){
    if(q.kind===0){dot(q.x,q.y,q.r,q.a,q.tint,q.sprite);return;}
    if(q.kind===1){ctx.strokeStyle=q.tint==='gold'?'rgba(238,213,164,'+q.a+')':'rgba(177,226,240,'+q.a+')';ctx.lineWidth=q.w;ctx.beginPath();ctx.moveTo(q.tx,q.ty);ctx.lineTo(q.x,q.y);ctx.stroke();return;}
    ctx.translate(hero.x,hero.y);ctx.scale(hero.scale,hero.scale);ctx.globalAlpha=hero.presence;
    if(q.kind===3){paintBody(hero.t);return;}
    ctx.scale(q.side===0?-1:1,1);
    if(q.kind===6){
      const p=wingBones[q.side];
      ctx.lineWidth=3.2;ctx.strokeStyle='rgba(139,186,202,.14)';ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.quadraticCurveTo(p[2],p[3],(p[2]+p[4])*.5,(p[3]+p[5])*.5);ctx.stroke();
      ctx.lineWidth=1.1;ctx.strokeStyle='rgba(215,235,237,.5)';ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.quadraticCurveTo(p[2],p[3],(p[2]+p[4])*.5,(p[3]+p[5])*.5);ctx.quadraticCurveTo(p[4],p[5],p[6],p[7]);ctx.stroke();return;
    }
    if(q.kind===4)paintArc(q.side,q.lobe);else paintFeather(q.f,q.side,q.kind===5);
  }

  function draw(t, quiet=false){
    const charge=ease(t/2.6)*(1-ease((t-4)/.7));
    const rush=ease((t-3.7)/.9)*(1-ease((t-6.2)/1.7));
    const travel=t*.016+Math.max(0,t-3.9)**1.3*.19;
    const dash=quiet?0:clamp((t-4.1)/1.45),lift=dash**1.8;
    const x=width*.5+Math.sin(t*.35)*1.4;
    const y=height*(.65-.025*ease(t/2.5)-.51*lift);
    const presence=quiet?1:ease(t/.55)*(1-ease((dash-.1)/.55));
    const step=economy?2:1;
    ctx.clearRect(0,0,width,height);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.lineCap='round';ctx.lineJoin='round';
    // The nebula's clear nucleus + diffuse corona, with controlled exposure.
    dot(width*.5,height*.47,width*.73,.16,'ice','dust');
    dot(width*.72,height*.63,width*.6,.095,'violet','dust');
    dot(width*.35,height*.25,width*.56,.05,'gold','dust');
    dot(x,height*.16,140,.33+rush*.2,'ice','core');

    // All these nebula grains are in a distant background layer. Near scene
    // particles join the sorted queue below instead of being painted over it.
    for(let i=0;i<grains.length;i+=step){
      const g=grains[i], depth=.2+g.z*.8;
      const u=fract(g.u+travel*(.35+depth*.7));
      const radius=(.12+depth*.5)*width;
      const angle=g.a+Math.sin(t*.16+g.z*6)*.06;
      const gx=x+Math.cos(angle)*radius*(.5+u*.55);
      const gy=-height*.1+u*height*1.2+Math.sin(angle)*radius*.18;
      const edge=Math.sin(u*Math.PI);
      const defocus=i%17===0;
      const size=defocus?5+depth*10:1.05+g.s**3*3.7;
      const alpha=edge*(defocus?.075:.14+g.s*.36)*(quiet?.7:.70);
      dot(gx,gy,size,alpha,g.tint,defocus?'dust':'point');
      if(rush>.1&&depth>.6&&!defocus){
        const length=3+rush*depth*19;
        const grad=ctx.createLinearGradient(gx,gy-length,gx,gy);
        grad.addColorStop(0,'rgba(160,216,237,0)');grad.addColorStop(1,`rgba(176,220,235,${edge*rush*.16})`);
        ctx.strokeStyle=grad;ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(gx,gy-length);ctx.lineTo(gx,gy);ctx.stroke();
      }
    }
    // The remote destination is behind the whole scene, never a final overlay.
    const distant=quiet?0:ease((t-5.25)/.5)*(1-ease((t-8.6)/.8));
    if(distant>0){dot(x,height*.105,80,distant*.52,'ice','core');dot(x,height*.105,8,distant*.8,'pearl');}
    hero.x=x;hero.y=y;hero.z=-.7*lift;hero.scale=Math.min(width/320,1.1)*(1-lift*.75);
    hero.presence=presence;hero.t=t;hero.charge=charge;hero.quiet=quiet;
    scene.reset();enqueueRings(t,x,quiet);
    const streak=quiet?0:ease((t-4.05)/.4)*(1-ease((t-6.3)/1.5));
    enqueueWake(t,x,y,streak,step);
    if(presence>0){
      const s=hero.scale;
      addDot(x,y-6*s,137*s,presence*(.48+charge*.2),'ice','core',hero.z-.19);
      addDot(x,y-7*s,58*s,presence*(.3+charge*.2),'pearl','core',hero.z-.18);
      enqueueWings(t,charge,quiet,step);
      addDot(x,y+31*s,69*s,presence*(.065+charge*.04),'gold','dust',hero.z-.07);
      for(let i=0;i<110;i+=step){const a=i/110*Math.PI*2+t*.17,r=35+Math.sin(i*2.3)*2;
        addDot(x+Math.cos(a)*r*s,y+(31+Math.sin(a)*r*.26)*s,(1+seed(i+901)*2.2)*s,presence*(.13+charge*.13),i%3?'gold':'ice','point',hero.z+Math.sin(a)*.042);
      }
      scene.add(3,hero.z);
    }
    scene.render(ctx,paintItem);
    ctx.globalCompositeOperation='source-over';
    const fade=ease((t/cycle-.91)/.09)*.65;if(fade){ctx.fillStyle=`rgba(7,15,26,${fade})`;ctx.fillRect(0,0,width,height);}
    const phase=quiet?'静谧光场':t<1.5?'凝神':t<4.1?'风雷展翼':t<5.7?'一线凌空':t<7.5?'气浪回响':'天际余辉';if(label.textContent!==phase)label.textContent=phase;
  }

  function tick(now) {
    frame = 0;
    if (mode !== 'running') return;
    if (previous) time = (time + Math.min(100, now - previous) / 1000) % cycle;
    previous = now;
    const started=performance.now();draw(time);
    slowFrames=performance.now()-started>11?slowFrames+1:Math.max(0,slowFrames-1);
    if(slowFrames>10&&!economy){economy=true;canvas.dataset.quality='economy';}
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    const open = dialog.open;
    if (open && !wasOpen) time = 0;
    wasOpen = open;
    const state = sheet.dataset.state;
    const reduced = sheet.dataset.reducedMotion === 'true';
    const next = !open || document.hidden ? 'hidden' : reduced ? 'reduced' : state === 'preview_paused' ? 'paused' : ['preview','calling'].includes(state) ? 'running' : 'still';
    if (next === mode) return;
    mode = next;canvas.dataset.renderMode = mode;
    if (frame) cancelAnimationFrame(frame);frame = 0;previous = 0;
    if (mode === 'running') frame = requestAnimationFrame(tick);
    else if (mode === 'reduced' || mode === 'still') draw(3.1, true);
    else if (mode === 'paused') label.textContent = '已暂停';
  }
  function resize() {
    const rect = {width:canvas.clientWidth,height:canvas.clientHeight};
    if (!rect.width || !rect.height) return;
    width = rect.width;height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);draw(mode === 'reduced' || mode === 'still' ? 3.1 : time, mode === 'reduced' || mode === 'still');
  }
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(sync).observe(sheet,{attributes:true,attributeFilter:['data-state','data-reduced-motion']});
  new MutationObserver(sync).observe(dialog,{attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',sync);
  sync();
})();
