/* The visual layer is deliberately independent of requests and light controls. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const PHASES = new Set(['idle', 'queued', 'connecting', 'running', 'verifying', 'succeeded', 'failed']);

  function create(host) {
    if (!host || typeof host.append !== 'function') throw new TypeError('A universe host is required');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const hadClass = host.classList.contains('lights-universe');
    host.classList.add('lights-universe');
    host.append(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let state = { status: 'idle', completed: 0, currentIndex: null };
    let frame = 0, destroyed = false, intersecting = true, size = 0, scale = 1, lastPaint = -Infinity;
    let successAt = null, impacts = [];
    let resizeObserver, intersectionObserver, mutationObserver;

    // A fixed sky keeps every screen and resize visually stable.
    let seed = 12873;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const stars = Array.from({ length: 62 }, () => ({ x: random() * 400 - 200, y: random() * 400 - 200,
      r: .35 + random() * .65, a: .1 + random() * .36, phase: random() * TAU }));
    const particles = Array.from({ length: 76 }, () => ({ phase: random(), angle: random() * TAU,
      speed: .65 + random() * .7, size: .4 + random() * .75 }));
    const nodes = Array.from({ length: 9 }, (_, i) => {
      const angle = -Math.PI / 2 + i * TAU / 9;
      return { x: Math.cos(angle) * 147, y: Math.sin(angle) * 147, angle };
    });

    function visible() {
      if (destroyed || !ctx || document.hidden || !intersecting || !host.isConnected || !size) return false;
      const dialog = host.closest('dialog');
      if ((dialog && !dialog.open) || host.closest('[hidden]') || !host.getClientRects().length) return false;
      const style = getComputedStyle(host);
      return style.visibility !== 'hidden' && style.display !== 'none';
    }
    function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }
    function reconcile() {
      if (!visible()) { stop(); return; }
      paint(performance.now());
      if (motion.matches) stop();
      else if (!frame) frame = requestAnimationFrame(tick);
    }
    function tick(time) {
      frame = 0;
      if (!visible() || motion.matches) return;
      // Thirty frames per second is ample for these slow orbital movements.
      if (time - lastPaint >= 30) paint(time);
      frame = requestAnimationFrame(tick);
    }
    function resize() {
      if (destroyed) return;
      const rect = host.getBoundingClientRect();
      size = Math.min(rect.width, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      scale = size * dpr / 400;
      reconcile();
    }
    function glow(x, y, radius, stops) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      for (const [offset, color] of stops) gradient.addColorStop(offset, color);
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    }
    function line(color, width, draw) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); draw(); ctx.stroke();
    }
    function ring(radius, color, width = .6) { line(color, width, () => ctx.arc(0, 0, radius, 0, TAU)); }
    function sky(time) {
      glow(0, 5, 195, [[0, 'rgba(149,91,33,.09)'], [.52, 'rgba(117,73,31,.035)'], [1, 'rgba(0,0,0,0)']]);
      for (const star of stars) {
        const twinkle = motion.matches ? 1 : .83 + Math.sin(time * .0005 + star.phase) * .17;
        ctx.fillStyle = 'rgba(221,207,175,' + star.a * twinkle + ')';
        ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, TAU); ctx.fill();
      }
      ring(147, 'rgba(205,164,99,.16)');
      ring(159, 'rgba(205,164,99,.035)');
      for (let i = 0; i < 72; i += 1) {
        const angle = i * TAU / 72 - Math.PI / 2;
        const major = i % 8 === 0;
        line(major ? 'rgba(205,164,99,.2)' : 'rgba(205,164,99,.065)', .55, () => {
          ctx.moveTo(Math.cos(angle) * 157, Math.sin(angle) * 157);
          ctx.lineTo(Math.cos(angle) * (major ? 162 : 159), Math.sin(angle) * (major ? 162 : 159));
        });
      }
    }
    function inflow(time) {
      if (state.status === 'succeeded' || state.status === 'failed') return;
      const active = ['connecting', 'queued', 'running', 'verifying'].includes(state.status);
      const clock = motion.matches ? 1400 : time;
      const quantity = active ? particles.length : 24;
      for (let i = 0; i < quantity; i += 1) {
        const particle = particles[i];
        const p = (particle.phase + clock * .000052 * particle.speed) % 1;
        const radius = 51 + 113 * Math.pow(1 - p, .8);
        const angle = particle.angle + p * 3.2;
        const alpha = Math.sin(Math.PI * p) * (active ? .68 : .31);
        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .76;
        line('rgba(224,178,108,' + alpha * .5 + ')', .5, () => {
          ctx.moveTo(x, y);
          for (let step = 1; step <= 5; step += 1) {
            const q = Math.max(0, p - step * .008);
            const r = 51 + 113 * Math.pow(1 - q, .8), a = particle.angle + q * 3.2;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * .76);
          }
        });
        ctx.fillStyle = 'rgba(245,206,146,' + alpha + ')';
        ctx.beginPath(); ctx.arc(x, y, particle.size, 0, TAU); ctx.fill();
      }
    }
    function blackHole(time) {
      const t = motion.matches ? 0 : time;
      const breathing = .94 + Math.sin(t * .001) * .06;
      glow(0, 0, 86, [[0, 'rgba(249,185,93,0)'], [.57, 'rgba(249,185,93,0)'], [.66, 'rgba(244,175,78,.1)'], [.8, 'rgba(220,151,67,.025)'], [1, 'rgba(0,0,0,0)']]);
      ctx.save(); ctx.rotate(-.24);
      // Fine elliptical filaments form the accretion disk, not a spinner.
      for (let i = 15; i >= 0; i -= 1) {
        const radius = 78 + i * 2.35;
        line('rgba(229,170,87,' + (.035 + (15 - i) * .003) * breathing + ')', i % 3 === 0 ? 1 : .45,
          () => ctx.ellipse(0, 0, radius, 14 + i * .95, 0, 0, TAU));
      }
      const outer = ctx.createLinearGradient(-113, 0, 113, 0);
      outer.addColorStop(0, 'rgba(193,125,51,0)'); outer.addColorStop(.22, 'rgba(234,185,110,.45)');
      outer.addColorStop(.45, 'rgba(255,223,166,.8)'); outer.addColorStop(.75, 'rgba(219,156,71,.3)'); outer.addColorStop(1, 'rgba(193,125,51,0)');
      ctx.strokeStyle = outer; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.ellipse(0, 0, 103, 24, 0, 0, TAU); ctx.stroke();
      ctx.restore();

      // Warm lens halo surrounds a genuinely dark central silhouette.
      glow(0, 0, 64, [[0, 'rgba(0,0,0,0)'], [.76, 'rgba(0,0,0,0)'], [.81, 'rgba(254,205,135,.2)'], [.85, 'rgba(250,193,110,.55)'], [.91, 'rgba(224,145,51,.1)'], [1, 'rgba(0,0,0,0)']]);
      ctx.fillStyle = '#07090d'; ctx.beginPath(); ctx.arc(0, 0, 51, 0, TAU); ctx.fill();
      line('rgba(255,221,164,.72)', .85, () => ctx.arc(0, 0, 52, Math.PI * 1.02, Math.PI * 1.91));
      line('rgba(206,142,63,.2)', .7, () => ctx.arc(0, 0, 52, Math.PI * .02, Math.PI * .99));
      ctx.save(); ctx.rotate(-.24);
      for (let i = 0; i < 5; i += 1) {
        line('rgba(248,193,113,' + (.26 - i * .04) * breathing + ')', i === 0 ? 1.3 : .65,
          () => ctx.ellipse(0, 0, 103 + i * 2, 24 + i * 1.25, 0, .08, Math.PI - .08));
      }
      // One slowly travelling filament gives the disk depth without a loading arc.
      const phase = t * .00016;
      line('rgba(255,224,165,.35)', .85, () => ctx.ellipse(0, 0, 96, 20, 0, phase, phase + .45));
      ctx.restore();
    }
    function sun(time) {
      const breathe = motion.matches ? 1 : 1 + Math.sin(time * .0009) * .025;
      ctx.save(); ctx.scale(breathe, breathe);
      glow(0, 0, 112, [[0, 'rgba(255,203,110,.12)'], [.4, 'rgba(245,176,71,.12)'], [.7, 'rgba(211,136,44,.035)'], [1, 'rgba(0,0,0,0)']]);
      for (let i = 0; i < 72; i += 1) {
        const angle = i * TAU / 72 + (motion.matches ? 0 : time * .000015);
        const length = 5 + Math.sin(i * 2.39) * 3 + Math.cos(i * .73) * 5;
        line('rgba(249,185,89,.13)', .8, () => {
          ctx.moveTo(Math.cos(angle) * 52, Math.sin(angle) * 52);
          ctx.lineTo(Math.cos(angle) * (60 + length), Math.sin(angle) * (60 + length));
        });
      }
      glow(-4, -7, 56, [[0, '#fff1c8'], [.3, '#f8daa0'], [.67, '#eac080'], [.86, '#ca9452'], [.94, 'rgba(215,153,77,.42)'], [1, 'rgba(214,147,60,0)']]);
      ring(54, 'rgba(255,224,170,.26)', .7);
      ctx.restore();
      if (!motion.matches && successAt !== null) {
        const p = (time - successAt) / 1600;
        if (p >= 0 && p < 1) ring(58 + p * 112, 'rgba(247,204,136,' + Math.pow(1 - p, 2) * .3 + ')', .8);
      }
    }
    function satellites(time) {
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i], done = i < state.completed;
        const failed = state.status === 'failed' && state.currentIndex === i + 1;
        const current = !done && ['running', 'verifying'].includes(state.status) && state.currentIndex === i + 1;
        if (done || failed) {
          glow(node.x, node.y, failed ? 13 : 14, [[0, failed ? 'rgba(234,149,61,.42)' : 'rgba(251,203,128,.46)'], [.3, 'rgba(224,163,77,.13)'], [1, 'rgba(224,163,77,0)']]);
          ctx.fillStyle = failed ? '#e5a65b' : '#f9ddb0';
          ctx.beginPath(); ctx.arc(node.x, node.y, 2.7, 0, TAU); ctx.fill();
          line(failed ? 'rgba(223,154,68,.5)' : 'rgba(251,203,128,.3)', .65, () => ctx.arc(node.x, node.y, 5.6, 0, TAU));
        } else {
          ctx.fillStyle = 'rgba(188,157,110,.42)'; ctx.beginPath(); ctx.arc(node.x, node.y, 1.8, 0, TAU); ctx.fill();
          if (current) {
            const pulse = motion.matches ? .6 : .4 + (Math.sin(time * .004) + 1) * .2;
            line('rgba(244,202,136,' + pulse + ')', .8, () => ctx.arc(node.x, node.y, 6, 0, TAU));
          }
        }
      }
    }
    function collisionEffects(time) {
      if (motion.matches) return;
      impacts = impacts.filter(impact => time - impact.started < 1100);
      for (const impact of impacts) {
        const age = time - impact.started;
        if (age < 0) continue;
        const node = nodes[impact.index];
        if (age < 360) {
          const p = age / 360;
          line('rgba(255,217,153,' + Math.sin(p * Math.PI) * .8 + ')', 1.2, () => {
            for (let j = 0; j < 13; j += 1) {
              const q = Math.max(0, p - j * .018), radius = 55 + 92 * q;
              const angle = node.angle - .36 * Math.pow(1 - q, 2);
              const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
              if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
          });
        } else {
          const p = (age - 360) / 740, alpha = Math.pow(1 - p, 2);
          line('rgba(255,214,149,' + alpha * .6 + ')', .7, () => ctx.arc(node.x, node.y, 5 + p * 22, 0, TAU));
          glow(node.x, node.y, 15 * (1 - p) + 2, [[0, 'rgba(255,232,184,' + alpha * .65 + ')'], [1, 'rgba(255,207,128,0)']]);
          for (let j = 0; j < 6; j += 1) {
            const angle = node.angle + j * TAU / 6 + .2, radius = 5 + p * (16 + j % 3 * 4);
            ctx.fillStyle = 'rgba(255,210,140,' + alpha * .7 + ')';
            ctx.beginPath(); ctx.arc(node.x + Math.cos(angle) * radius, node.y + Math.sin(angle) * radius, .7, 0, TAU); ctx.fill();
          }
        }
      }
    }
    function paint(time) {
      if (!ctx || !size || destroyed) return;
      lastPaint = time;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2);
      sky(time); inflow(time);
      if (state.status === 'succeeded') sun(time); else blackHole(time);
      satellites(time); collisionEffects(time);
    }
    function update(next = {}) {
      if (destroyed) return;
      const status = PHASES.has(next.status) ? next.status : 'idle';
      const completed = Math.min(9, Math.max(0, Number.isFinite(next.completed) ? Math.floor(next.completed) : 0));
      const currentIndex = Number.isInteger(next.currentIndex) && next.currentIndex >= 1 && next.currentIndex <= 9 ? next.currentIndex : null;
      const time = performance.now();
      if (completed < state.completed || status === 'idle' || ['connecting', 'queued'].includes(status)) impacts = [];
      else if (!motion.matches && status !== 'failed') {
        for (let i = state.completed; i < completed; i += 1) impacts.push({ index: i, started: time + (i - state.completed) * 24 });
      }
      if (status === 'succeeded' && state.status !== 'succeeded') successAt = time;
      else if (status !== 'succeeded') successAt = null;
      state = { status, completed, currentIndex };
      host.dataset.phase = status; host.dataset.completed = String(completed);
      reconcile();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; stop();
      resizeObserver?.disconnect(); intersectionObserver?.disconnect(); mutationObserver?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', reconcile);
      if (motion.removeEventListener) motion.removeEventListener('change', reconcile);
      else motion.removeListener(reconcile);
      canvas.remove();
      if (!hadClass) host.classList.remove('lights-universe');
      delete host.dataset.phase; delete host.dataset.completed;
      impacts = [];
    }

    document.addEventListener('visibilitychange', reconcile);
    if (motion.addEventListener) motion.addEventListener('change', reconcile);
    else motion.addListener(reconcile);
    window.addEventListener('resize', resize, { passive: true });
    if (typeof ResizeObserver === 'function') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); }
    if (typeof IntersectionObserver === 'function') {
      intersectionObserver = new IntersectionObserver(entries => { intersecting = entries[0]?.isIntersecting !== false; reconcile(); });
      intersectionObserver.observe(host);
    }
    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver(() => { resize(); });
      // Attribute-only observation covers dialog open/close and ancestor hiding.
      for (let node = host; node; node = node.parentElement) mutationObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
    }
    host.dataset.phase = state.status; host.dataset.completed = '0';
    resize();
    return Object.freeze({ update, destroy });
  }

  window.LW5LightsUniverse = Object.freeze({ create });
})();
