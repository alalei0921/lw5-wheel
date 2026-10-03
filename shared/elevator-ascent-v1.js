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
  if (!ctx) { canvas.dataset.renderMode = 'fallback'; return; }
  canvas.parentElement.classList.add('ascent-rendered');
  const cycle = 9.6;
  let width = 320, height = 300, time = 0, frame = 0, previous = 0;
  let mode = 'still', wasOpen = false;
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
  const fract = n => n - Math.floor(n);
  const seed = n => fract(Math.sin(n * 127.1 + 31.7) * 43758.5453);
  // Three light layers: distant grains, defocused foreground dust, and wing filaments.
  const grains = Array.from({length:620},(_,i)=>({a:seed(i+1)*Math.PI*2,u:seed(i+71),z:seed(i+143),s:seed(i+911),tint:i%9===0?'gold':i%5===0?'violet':'ice'}));
  const wings = Array.from({length:420},(_,i)=>({side:i%2?-1:1,f:Math.floor(seed(i+301)*15),u:seed(i+719),n:seed(i+823)-.5,size:seed(i+1311),tint:i%11===0?'gold':i%7===0?'violet':'ice'}));
  const light = window.LW5ParticleLight;
  let economy=false, slowFrames=0;
  function dot(x,y,r,a,tint='ice',kind='point'){
    if(light){light.paint(ctx,x,y,r,a,tint,kind);return;}
    // If the optional light atlas fails to load, preserve a readable low-cost scene.
    ctx.save();ctx.globalAlpha*=Math.max(0,Math.min(1,a));ctx.fillStyle='#b8dbea';ctx.beginPath();ctx.arc(x,y,Math.max(.25,r*.18),0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function feather(u,f,t,spread){
    const a=1-u;
    return {x:(a*a*a*6+3*a*a*u*(21+f*.6)+3*a*u*u*(33+f*2)+u*u*u*(40+f*3.8))*spread,
      y:a*a*a*-4+3*a*a*u*(-17-f*1.3)+3*a*u*u*(-4-f*.7)+u*u*u*(13-f*4.6)+Math.sin(u*4+t*.9)*u*1.4};
  }
  function draw(t, quiet=false){
    const charge=ease(t/2.6)*(1-ease((t-4)/.7));
    const rush=ease((t-3.7)/.9)*(1-ease((t-6.2)/1.7));
    const travel=t*.016+Math.max(0,t-3.9)**1.3*.19;
    const dash=quiet?0:clamp((t-4.1)/1.45),lift=dash**1.8;
    const x=width*.5+Math.sin(t*.35)*1.4;
    const y=height*(.65-.025*ease(t/2.5)-.51*lift);
    const presence=quiet?1:ease(t/.55)*(1-ease((dash-.1)/.55));
    const spread=quiet?1:.35+.65*ease((t-.4)/2.1)*(1-ease(dash/.6));
    const step=economy?2:1;
    ctx.clearRect(0,0,width,height);ctx.globalAlpha=1;ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';ctx.lineJoin='round';
    // The nebula's clear nucleus + diffuse corona, with controlled exposure.
    dot(width*.5,height*.47,width*.73,.16,'ice','dust');
    dot(width*.72,height*.63,width*.6,.095,'violet','dust');
    dot(width*.35,height*.25,width*.56,.05,'gold','dust');
    dot(x,height*.16,140,.33+rush*.2,'ice','core');

    // Projected depth changes point size, opacity and speed rather than using a wire grid.
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
      const alpha=edge*(defocus?.075:.14+g.s*.36)*(quiet?.7:1);
      dot(gx,gy,size,alpha,g.tint,defocus?'dust':'point');
      if(rush>.1&&depth>.6&&!defocus){
        const length=3+rush*depth*19;
        const grad=ctx.createLinearGradient(gx,gy-length,gx,gy);
        grad.addColorStop(0,'rgba(160,216,237,0)');grad.addColorStop(1,`rgba(176,220,235,${edge*rush*.16})`);
        ctx.strokeStyle=grad;ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(gx,gy-length);ctx.lineTo(gx,gy);ctx.stroke();
      }
    }
    // Broken, grainy circulation bands suggest depth without hard perfect circles.
    for(let band=0;band<3;band++){
      const radius=width*(.22+band*.16),cy=height*(.43+band*.18);
      for(let i=0;i<96;i+=step){
        const a=i/96*Math.PI*2+t*(.045+band*.015),r=radius+Math.sin(i*2.7)*1.8;
        const alpha=(.06+charge*.065)*(1+Math.sin(i*1.7)*.5);
        dot(x+Math.cos(a)*r,cy+Math.sin(a)*r*.27,1.8,alpha,band===1?'gold':'ice');
      }
    }

    // A luminous dust wake fades continuously from the spear into the lower scene.
    const streak=quiet?0:ease((t-4.05)/.4)*(1-ease((t-6.3)/1.5));
    if(streak>0){
      for(let lane=-3;lane<=3;lane++){
        const trail=ctx.createLinearGradient(0,y,0,height);
        trail.addColorStop(0,`rgba(226,242,242,${streak*(lane===0?.8:.23)})`);
        trail.addColorStop(.24,`rgba(145,213,231,${streak*.25})`);trail.addColorStop(1,'rgba(134,162,205,0)');
        ctx.strokeStyle=trail;ctx.lineWidth=lane===0?1.2:2.5;
        ctx.beginPath();ctx.moveTo(x,y-11);ctx.bezierCurveTo(x+lane*2,height*.35,x+lane*7+Math.sin(t+lane)*3,height*.67,x+lane*14,height);ctx.stroke();
      }
      dot(x,y,120,streak*.65,'pearl','core');
      for(let i=0;i<110;i+=step){const u=seed(i+3401),gy=y+(height-y)*u;dot(x+(seed(i+3701)-.5)*(4+u*45),gy,1+seed(i+3811)*3,streak*(1-u)*.45,i%4?'ice':'gold');}
    }

    if(presence>0){
      ctx.save();ctx.translate(x,y);const scale=Math.min(width/320,1.1)*(1-lift*.75);ctx.scale(scale,scale);ctx.globalAlpha=presence;
      dot(0,-6,137,.58+charge*.23,'ice','core');
      dot(0,-7,58,.45+charge*.25,'gold','core');
      // Tapered organic feather filaments, with dust concentrated along each spline.
      for(const side of [-1,1]){
        ctx.save();ctx.scale(side,1);
        for(let f=0;f<15;f++){
          const grad=ctx.createLinearGradient(7,0,93,-36);
          grad.addColorStop(0,'rgba(219,238,236,.025)');grad.addColorStop(.55,`rgba(142,210,231,${.15+charge*.06})`);grad.addColorStop(1,'rgba(209,230,239,.06)');
          ctx.strokeStyle=grad;ctx.lineWidth=.5+(f/15)*.15;
          ctx.beginPath();for(let j=0;j<=24;j++){const q=feather(j/24,f,t,spread);if(j===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);}ctx.stroke();
        }
        // Subtle multi-pass edge corona; no sawtooth lightning outline.
        for(const pass of [{w:5,a:.025},{w:1.6,a:.08},{w:.55,a:.45}]){
          ctx.lineWidth=pass.w;ctx.strokeStyle=`rgba(203,231,239,${pass.a*(.65+charge*.35)})`;
          ctx.beginPath();for(let j=0;j<=60;j++){const u=j/60,q=feather(u,14,t,spread);const ripple=Math.sin(u*31+t*1.1)*.55+Math.sin(u*11-t*.8)*.35;if(!j)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y+ripple);}ctx.stroke();
        }
        const tip=feather(1,14,t,spread);dot(tip.x,tip.y,8,.34+charge*.22,'pearl');
        ctx.restore();
      }
      for(let i=0;i<wings.length;i+=step){
        const w=wings[i],u=fract(w.u+t*.015),q=feather(u,w.f,t,spread);
        const depth=w.f/14,alpha=(.24+charge*.31)*Math.sin(u*Math.PI)*(.5+w.size*.7);
        dot(q.x*w.side+w.n*2,q.y+w.n*(2+depth*2),1.2+w.size*2.3,alpha,w.tint);
      }
      // The charging ring is dust and a feathered underside glow rather than a rune outline.
      dot(0,31,69,.085+charge*.055,'gold','dust');
      for(let i=0;i<110;i+=step){const a=i/110*Math.PI*2+t*.17,r=35+Math.sin(i*2.3)*2;dot(Math.cos(a)*r,31+Math.sin(a)*r*.26,1+seed(i+901)*2.2,.15+charge*.16,i%3?'gold':'ice');}
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
      ctx.restore();ctx.globalCompositeOperation='lighter';
    }

    // Pressure fronts carry a soft edge, internal fine grains and decaying haze.
    if(!quiet)for(let ring=0;ring<3;ring++){
      const age=(t-4.35-ring*.4)/2.05;if(age<=0||age>=1)continue;
      const r=12+ease(age)*width*(.78+ring*.1),cy=height*(.28+age**1.2*.76),a=Math.sin(age*Math.PI);
      ctx.save();ctx.translate(x,cy);ctx.scale(1,.32);
      for(const pass of [{w:9,a:.018},{w:3,a:.035},{w:.65,a:.23}]){ctx.lineWidth=pass.w;ctx.strokeStyle=`rgba(174,221,235,${a*pass.a})`;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
      for(let i=0;i<100;i+=step){const angle=i/100*Math.PI*2,rr=r+(seed(i+ring*111)-.5)*3;dot(x+Math.cos(angle)*rr,cy+Math.sin(angle)*rr*.32,1.6,a*.3,i%7?'ice':'gold');}
    }
    const distant=quiet?0:ease((t-5.25)/.5)*(1-ease((t-8.6)/.8));
    if(distant>0){dot(x,height*.105,105,distant*.7,'ice','core');dot(x,height*.105,12,distant,'gold');ctx.lineWidth=.5;ctx.strokeStyle=`rgba(223,235,231,${distant*.4})`;ctx.beginPath();ctx.moveTo(x-7,height*.105);ctx.lineTo(x+7,height*.105);ctx.moveTo(x,height*.105-14);ctx.lineTo(x,height*.105+14);ctx.stroke();}
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
