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
    const charge = 1 - ease((t - .8) / 1.5);
    const rush = ease((t - 1.3) / 2) * (1 - ease((t - 7.1) / 1.9));
    const travel = .05 * t + .05 * Math.max(0, t - 1.5) ** 2;
    const veil = Math.sin(clamp((t - 6.1) / 1.6) * Math.PI);
    const vanishX = width * .5 + Math.sin(t * .35) * width * .014;
    const vanishY = height * (.2 - .045 * rush);
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

    // The ascent is a prism of light, with a trailing ribbon below it.
    const heroY = height * (.65 - .31 * ease((t - .7) / 4.8));
    const heroX = vanishX + Math.sin(t * .55) * 2;
    const glow = ctx.createRadialGradient(heroX, heroY, 1, heroX, heroY, width * .25);
    glow.addColorStop(0, `rgba(207,239,255,${.45 + rush * .15})`);
    glow.addColorStop(.16, 'rgba(127,198,255,.2)');glow.addColorStop(1, 'rgba(115,125,255,0)');
    ctx.fillStyle = glow;ctx.fillRect(heroX - width * .3, heroY - width * .3, width * .6, width * .6);
    const ribbon = ctx.createLinearGradient(0, heroY, 0, height);
    ribbon.addColorStop(0, `rgba(209,241,255,${.6 + rush * .3})`);
    ribbon.addColorStop(.35, 'rgba(126,183,255,.32)');ribbon.addColorStop(1, 'rgba(111,93,220,0)');
    ctx.fillStyle = ribbon;
    ctx.beginPath();ctx.moveTo(heroX - 5, heroY + 5);ctx.bezierCurveTo(heroX - 8, heroY + 75, heroX - 48, height * .8, heroX - 45, height);ctx.lineTo(heroX + 38, height);ctx.bezierCurveTo(heroX + 42, height * .8, heroX + 8, heroY + 75, heroX + 5, heroY + 5);ctx.closePath();ctx.fill();
    for (let i = -1; i <= 1; i++) {
      ctx.strokeStyle = i ? 'rgba(155,163,255,.35)' : 'rgba(229,241,255,.55)';ctx.lineWidth = i ? 1 : 1.5;
      ctx.beginPath();ctx.moveTo(heroX + i * 4, heroY + 5);ctx.bezierCurveTo(heroX + i * 13, heroY + 70, heroX + i * 35 + Math.sin(t + i) * 10, height * .8, heroX + i * 52, height);ctx.stroke();
    }
    // Warm charging ring and clean arrowhead retain the upward elevator cue.
    if (charge > 0 && !quiet) {
      ctx.strokeStyle = `rgba(255,212,155,${charge * .65})`;ctx.lineWidth = 1.2;
      ctx.beginPath();ctx.ellipse(heroX, heroY + 9, 20 + charge * 26, 7 + charge * 8, -.13, 0, Math.PI * 2);ctx.stroke();
    }
    ctx.fillStyle = '#dff6ff';ctx.beginPath();ctx.moveTo(heroX, heroY - 23);ctx.lineTo(heroX + 12, heroY + 10);ctx.lineTo(heroX, heroY + 4);ctx.lineTo(heroX - 12, heroY + 10);ctx.closePath();ctx.fill();
    ctx.fillStyle = '#918fea';ctx.beginPath();ctx.moveTo(heroX, heroY - 23);ctx.lineTo(heroX, heroY + 4);ctx.lineTo(heroX - 12, heroY + 10);ctx.closePath();ctx.fill();
    ctx.fillStyle = '#fff0ca';ctx.fillRect(heroX - .65, heroY - 18, 1.3, 30);

    // One soft passage per 9.6 s. No strobe or full-screen white flash.
    if (veil > 0 && !quiet) {
      const r = 15 + ease((t - 6.1) / 1.6) * width * 1.3;
      ctx.strokeStyle = `rgba(210,239,255,${veil * .55})`;ctx.lineWidth = 2 + veil * 3;
      ctx.beginPath();ctx.ellipse(vanishX, vanishY + r * .43, r, r * .43, 0, 0, Math.PI * 2);ctx.stroke();
      const wash = ctx.createRadialGradient(vanishX, vanishY, 0, vanishX, vanishY, height);
      wash.addColorStop(0, `rgba(213,236,255,${veil * .2})`);wash.addColorStop(1, 'rgba(125,134,242,0)');ctx.fillStyle = wash;ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
    // A quiet dissolve hides the cycle reset; it cannot change the call status.
    const fade = ease((p - .91) / .09) * .65;
    if (fade) { ctx.fillStyle = `rgba(8,12,29,${fade})`;ctx.fillRect(0,0,width,height); }
    const phase = quiet ? '静谧光场' : t < 1.5 ? '蓄光' : t < 6.1 ? '向上穿越' : t < 7.7 ? '穿过光幕' : '光流回响';
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
    else if (mode === 'reduced' || mode === 'still') draw(3.8, true);
    else if (mode === 'paused') label.textContent = '已暂停';
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);draw(mode === 'reduced' || mode === 'still' ? 3.8 : time, mode === 'reduced' || mode === 'still');
  }
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(sync).observe(sheet,{attributes:true,attributeFilter:['data-state','data-reduced-motion']});
  new MutationObserver(sync).observe(dialog,{attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',sync);
  sync();
})();
