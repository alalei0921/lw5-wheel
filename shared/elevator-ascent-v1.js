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
  const particles = Array.from({ length: 56 }, (_, i) => ({
    angle: seed(i + 1) * Math.PI * 2,
    offset: seed(i + 71), rate: .65 + seed(i + 143) * .55,
    tint: i % 5 === 0 ? '255,221,169' : i % 3 === 0 ? '169,148,255' : '124,225,255',
  }));

  function draw(t, quiet = false) {
    const p = t / cycle;
    const charge = ease(t / 2.6) * (1 - ease((t - 4) / .7));
    const rush = ease((t - 3.6) / 1.1) * (1 - ease((t - 6.3) / 1.8));
    const travel = .025 * t + .22 * Math.max(0, t - 3.9) ** 1.45;
    const veil = Math.sin(clamp((t - 5.2) / 1.9) * Math.PI);
    const vanishX = width * .5 + Math.sin(t * .35) * width * .014;
    const vanishY = height * (.18 - .045 * rush);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    const aura = ctx.createRadialGradient(vanishX, vanishY, 0, vanishX, vanishY, height * .83);
    aura.addColorStop(0, `rgba(147,216,255,${.2 + rush * .14})`);
    aura.addColorStop(.23, 'rgba(57,82,139,.21)');
    aura.addColorStop(.6, 'rgba(85,42,130,.12)');
    aura.addColorStop(1, 'rgba(15,20,40,0)');
    ctx.fillStyle = aura; ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    // Broad spectral ribbons establish the shaft without filling it with noise.
    const shaftGlow = ctx.createLinearGradient(0, vanishY, 0, height);
    shaftGlow.addColorStop(0, 'rgba(183,235,255,.26)');
    shaftGlow.addColorStop(.4, 'rgba(120,155,255,.065)');
    shaftGlow.addColorStop(1, 'rgba(117,82,200,0)');
    ctx.fillStyle = shaftGlow;
    ctx.beginPath();ctx.moveTo(vanishX - 4, vanishY);ctx.lineTo(width * .84, height);ctx.lineTo(width * .16, height);ctx.lineTo(vanishX + 4, vanishY);ctx.closePath();ctx.fill();
    for (const side of [-1, 1]) {
      const wing = ctx.createLinearGradient(0, vanishY, 0, height);
      wing.addColorStop(0, 'rgba(205,239,255,.04)');
      wing.addColorStop(.45, side < 0 ? 'rgba(97,214,255,.23)' : 'rgba(187,131,255,.23)');
      wing.addColorStop(1, 'rgba(113,112,241,0)');
      ctx.strokeStyle = wing;
      for (const thickness of [15, 5, 1.2]) {
        ctx.lineWidth = thickness;
        ctx.beginPath();ctx.moveTo(vanishX + side * 8, vanishY);
        ctx.bezierCurveTo(vanishX + side * width * .06, height * .42, vanishX + side * width * (.42 + Math.sin(t * .5) * .02), height * .56, vanishX + side * width * .56, height * 1.1);ctx.stroke();
      }
    }

    // Perspective rings grow and sweep down past the camera: the viewer rises.
    const project = (u, angle) => {
      const radius = 7 + u ** 2.1 * width * 1.3;
      return { x: vanishX + Math.cos(angle) * radius, y: vanishY + u ** 1.6 * height * .66 + Math.sin(angle) * radius * .4, radius };
    };
    for (let i = 0; i < 11; i++) {
      const u = fract(i / 11 + travel * .36);
      const c = project(u, 0), alpha = Math.sin(u * Math.PI) * (.18 + rush * .42);
      const cy = vanishY + u ** 1.6 * height * .66;
      ctx.lineWidth = 6 + u * 4;
      ctx.strokeStyle = `rgba(111,181,255,${alpha * .12})`;
      ctx.beginPath(); ctx.ellipse(vanishX, cy, c.radius, c.radius * .4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = .9 + u * 1.7;
      ctx.strokeStyle = `rgba(${i % 3 === 0 ? '216,185,255' : '101,212,255'},${alpha})`;
      ctx.beginPath(); ctx.ellipse(vanishX, cy, c.radius, c.radius * .4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(215,242,255,${alpha * .55})`;
      ctx.beginPath(); ctx.ellipse(vanishX, cy + 3, c.radius, c.radius * .4, 0, Math.PI * .1, Math.PI * .72); ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2;
      const start = project(.1, angle), end = project(.97, angle);
      ctx.strokeStyle = `rgba(129,153,244,${.06 + rush * .08})`;ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.quadraticCurveTo(vanishX + (end.x - vanishX) * .35, vanishY + height * .32, end.x, end.y);ctx.stroke();
    }

    // A bounded, deterministic field; no DOM particles and no external textures.
    if (!quiet) for (const particle of particles) {
      const u = fract(particle.offset + travel * particle.rate);
      const end = project(u, particle.angle);
      const start = project(Math.max(0, u - .006 - rush * .09), particle.angle);
      const alpha = Math.sin(u * Math.PI) * (.22 + rush * .64);
      ctx.lineWidth = .5 + u * .9;
      ctx.strokeStyle = `rgba(${particle.tint},${alpha})`;
      ctx.beginPath();ctx.moveTo(start.x, start.y);ctx.lineTo(end.x, end.y);ctx.stroke();
      if (u > .45) { ctx.fillStyle = `rgba(221,243,255,${alpha})`;ctx.fillRect(end.x, end.y, 1.3, 1.3); }
    }

    // An original robed cultivator. The silhouette stays legible before the dash.
    const dash = quiet ? 0 : clamp((t - 4.1) / 1.45);
    const lift = dash ** 1.8;
    const heroY = height * (.66 - .035 * ease(t / 2.5) - .51 * lift);
    const heroX = vanishX + Math.sin(t * .7) * 1.8;
    const presence = quiet ? 1 : ease(t / .55) * (1 - ease((dash - .1) / .55));
    const unfold = quiet ? 1 : ease((t - .55) / 2.1) * (1 - ease(dash / .6));
    const power = quiet ? .65 : .3 + charge * .7;
    const glow = ctx.createRadialGradient(heroX, heroY - 7, 1, heroX, heroY, width * .27);
    glow.addColorStop(0, `rgba(151,227,255,${.25 + charge * .3})`);
    glow.addColorStop(.3, 'rgba(116,165,255,.13)');glow.addColorStop(1, 'rgba(115,125,255,0)');
    ctx.fillStyle = glow;ctx.fillRect(heroX - width * .3, heroY - width * .3, width * .6, width * .6);

    // A single upward line replaces the character during acceleration.
    const streak = quiet ? 0 : ease((t - 4.05) / .45) * (1 - ease((t - 6.4) / 1.3));
    if (streak > 0) {
      const trail = ctx.createLinearGradient(0, heroY, 0, height * .92);
      trail.addColorStop(0, `rgba(234,249,255,${streak})`);
      trail.addColorStop(.32, `rgba(141,209,255,${streak * .65})`);
      trail.addColorStop(1, 'rgba(146,121,248,0)');
      ctx.strokeStyle = trail;
      for (const thickness of [14, 5, 1.5]) {
        ctx.globalAlpha = thickness > 5 ? .16 : thickness > 2 ? .36 : 1;
        ctx.lineWidth = thickness;ctx.beginPath();ctx.moveTo(heroX, heroY - 14);
        ctx.bezierCurveTo(heroX + 1, height * .35, heroX - 4, height * .65, heroX - 6, height * .94);ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The reverse-moving pressure rings show the burst without a white flash.
    if (!quiet) for (let i = 0; i < 3; i++) {
      const age = (t - 4.35 - i * .4) / 2.05;
      if (age <= 0 || age >= 1) continue;
      const radius = 10 + ease(age) * width * (.85 + i * .12);
      const cy = height * (.28 + age ** 1.2 * .76);
      const alpha = Math.sin(age * Math.PI) * .75;
      for (const thickness of [10, 2]) {
        ctx.lineWidth = thickness;
        ctx.strokeStyle = `rgba(${i === 1 ? '216,190,255' : '164,233,255'},${alpha * (thickness > 2 ? .12 : 1)})`;
        ctx.beginPath();ctx.ellipse(heroX, cy, radius, radius * .32, -.045, 0, Math.PI * 2);ctx.stroke();
      }
    }

    if (presence > 0) {
      ctx.save();ctx.translate(heroX, heroY);const scale = Math.min(width / 320, 1.1) * (1 - lift * .75);ctx.scale(scale, scale);
      ctx.globalAlpha = presence;
      // Feather-like wind ribbons and slow, continuous lightning filaments.
      for (const side of [-1, 1]) {
        ctx.save();ctx.scale(side, 1);
        const spread = .25 + unfold * .75;
        ctx.scale(spread, .7 + unfold * .3);
        const wing = ctx.createLinearGradient(7, 0, 68, -36);
        wing.addColorStop(0, 'rgba(154,229,255,.29)');wing.addColorStop(.6, side < 0 ? 'rgba(103,217,255,.13)' : 'rgba(177,139,255,.2)');wing.addColorStop(1, 'rgba(235,245,255,.42)');
        ctx.fillStyle = wing;ctx.strokeStyle = side < 0 ? 'rgba(130,228,255,.88)' : 'rgba(200,176,255,.88)';ctx.lineWidth = 1;
        ctx.beginPath();ctx.moveTo(5,-5);ctx.bezierCurveTo(21,-30,48,-29,70,-48);ctx.quadraticCurveTo(61,-21,48,-10);ctx.lineTo(52,-24);ctx.quadraticCurveTo(39,-7,30,-2);ctx.lineTo(35,-17);ctx.quadraticCurveTo(18,1,5,-5);ctx.closePath();ctx.fill();ctx.stroke();
        for (let feather = 0; feather < 4; feather++) {
          ctx.strokeStyle = `rgba(196,232,255,${.28 + power * .24})`;ctx.lineWidth = .7;
          ctx.beginPath();ctx.moveTo(8 + feather * 2, -6);ctx.quadraticCurveTo(27 + feather * 7, -20 + feather * 2, 66 - feather * 11, -44 + feather * 10);ctx.stroke();
        }
        // The arc bends gently; its brightness never flickers on/off.
        ctx.strokeStyle = `rgba(226,242,255,${power * .8})`;ctx.lineWidth = 1.2;
        ctx.beginPath();ctx.moveTo(9,-6);
        for (let j = 1; j <= 7; j++) {
          const x = 9 + j * 7.7, y = -6 - j * 4.8 + (j % 2 ? 4 : -3) + Math.sin(t * 1.8 + j) * 1.4;
          ctx.lineTo(x,y);
        }
        ctx.stroke();ctx.restore();
      }
      // Charging seal under the robe, with a few restrained geometric runes.
      ctx.strokeStyle = `rgba(237,218,172,${.18 + charge * .4})`;ctx.lineWidth = 1;
      ctx.beginPath();ctx.ellipse(0,32,37+charge*8,10+charge*2,-.1,0,Math.PI*2);ctx.stroke();
      for (let i=0;i<8;i++) {const a=i*Math.PI/4+t*.18;ctx.fillStyle='rgba(211,229,249,.45)';ctx.fillRect(Math.cos(a)*42-1,32+Math.sin(a)*12-1,2,2);}
      // Dark ink against the halo gives the tiny person a readable head and robe.
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#111b32';ctx.strokeStyle = 'rgba(192,227,250,.95)';ctx.lineWidth = .85;
      const flutter = Math.sin(t * 2.3) * 2.5;
      ctx.beginPath();ctx.moveTo(-5,-12);ctx.lineTo(5,-12);ctx.lineTo(10,-7);ctx.lineTo(21,6);ctx.lineTo(15,14);ctx.lineTo(6,6);ctx.lineTo(15+flutter,34);ctx.lineTo(3,27);ctx.lineTo(-4+flutter,39);ctx.lineTo(-13,32);ctx.lineTo(-5,7);ctx.lineTo(-16,15);ctx.lineTo(-22,7);ctx.lineTo(-10,-7);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,-19,4.3,5.7,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(0,-26,2.3,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(255,226,172,.85)';ctx.beginPath();ctx.moveTo(-5,4);ctx.lineTo(6,4);ctx.stroke();
      ctx.strokeStyle='rgba(176,211,246,.55)';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(-1,24);ctx.lineTo(-5+flutter,34);ctx.moveTo(3,-23);ctx.quadraticCurveTo(15,-18,15+flutter,-5);ctx.stroke();
      ctx.restore();ctx.globalCompositeOperation = 'lighter';
    }

    // After the dash the person is only a distant point and fading wake.
    const distant = quiet ? 0 : ease((t - 5.25) / .5) * (1 - ease((t - 8.6) / .8));
    if (distant > 0) {
      const starY = height * .105;
      const star = ctx.createRadialGradient(vanishX, starY, 0, vanishX, starY, 22);
      star.addColorStop(0, `rgba(255,246,215,${distant})`);star.addColorStop(.12, `rgba(198,237,255,${distant * .7})`);star.addColorStop(1,'rgba(149,167,255,0)');
      ctx.fillStyle=star;ctx.fillRect(vanishX-22,starY-22,44,44);
      ctx.strokeStyle=`rgba(226,245,255,${distant*.8})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(vanishX,starY-11);ctx.lineTo(vanishX,starY+11);ctx.moveTo(vanishX-5,starY);ctx.lineTo(vanishX+5,starY);ctx.stroke();
    }

    // One soft passage per 9.6 s. No strobe or full-screen white flash.
    if (veil > 0 && !quiet) {
      const r = 15 + ease((t - 5.2) / 1.9) * width * 1.3;
      ctx.strokeStyle = `rgba(210,239,255,${veil * .55})`;ctx.lineWidth = 2 + veil * 3;
      ctx.beginPath();ctx.ellipse(vanishX, vanishY + r * .43, r, r * .43, 0, 0, Math.PI * 2);ctx.stroke();
      const wash = ctx.createRadialGradient(vanishX, vanishY, 0, vanishX, vanishY, height);
      wash.addColorStop(0, `rgba(213,236,255,${veil * .2})`);wash.addColorStop(1, 'rgba(125,134,242,0)');ctx.fillStyle = wash;ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
    // A quiet dissolve hides the cycle reset; it cannot change the call status.
    const fade = ease((p - .91) / .09) * .65;
    if (fade) { ctx.fillStyle = `rgba(8,12,29,${fade})`;ctx.fillRect(0,0,width,height); }
    const phase = quiet ? '静谧光场' : t < 1.5 ? '凝神' : t < 4.1 ? '风雷展翼' : t < 5.7 ? '一线凌空' : t < 7.5 ? '气浪回响' : '天际余辉';
    if (label.textContent !== phase) label.textContent = phase;
  }

  function tick(now) {
    frame = 0;
    if (mode !== 'running') return;
    if (previous) time = (time + Math.min(100, now - previous) / 1000) % cycle;
    previous = now;draw(time);frame = requestAnimationFrame(tick);
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
    const rect = canvas.getBoundingClientRect();
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
