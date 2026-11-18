// Playback is a view of confirmed snapshots. No media event changes a job or a count.
(() => {
  'use strict';
  const legacy = window.LW5LightsUniverse;
  const manifest = window.LW5LightsFilmManifest;
  const phases = new Set(['idle', 'queued', 'connecting', 'running', 'verifying', 'succeeded', 'failed']);
  const config = window.LW5LightsFilmConfig || {};

  function create(host) {
    if (!host || typeof host.append !== 'function') throw new TypeError('A film host is required');
    const hadUniverse = host.classList.contains('lights-universe');
    host.classList.add('lights-universe', 'lights-film');
    const backdrop = document.createElement('div');
    backdrop.className = 'lights-film-backdrop';
    const poster = document.createElement('img');
    poster.className = 'lights-film-poster';
    poster.alt = '';
    poster.draggable = false;
    poster.addEventListener('error', () => {
      if (destroyed || poster.currentSrc !== manifest.levels[state.completed].poster) return;
      failedPosterLevel = state.completed; poster.style.visibility = 'hidden';
      if (faultLevel === state.completed || motion.matches || state.status === 'failed') restoreLegacy();
    });
    host.append(backdrop, poster);
    const slots = Array.from({ length: 2 }, () => {
      const video = document.createElement('video');
      video.className = 'lights-film-video';
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'none';
      video.disablePictureInPicture = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('tabindex', '-1');
      host.append(video);
      return { video, level: null, cleanup: null, frame: null };
    });
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let state = { status: 'idle', completed: 0, currentIndex: null };
    let active = null, pending = null, generation = 0, fadeTimer = null;
    let destroyed = false, intersecting = true, pageHidden = false, faultLevel = null, failedPosterLevel = null, fallback = null;
    let phase = 0;

    function visible() {
      if (destroyed || pageHidden || document.hidden || !intersecting || !host.isConnected || !host.getClientRects().length) return false;
      for (let node = host; node instanceof Element; node = node.parentElement) {
        if (node.hidden || (node.tagName === 'DIALOG' && !node.open)) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    }
    function animated() { return visible() && !motion.matches && state.status !== 'failed'; }
    function currentPhase() {
      const time = active?.video.currentTime;
      return (Number.isFinite(time) ? time : phase) % manifest.duration;
    }
    function release(slot) {
      slot.cleanup?.(); slot.cleanup = null;
      if (slot.frame !== null) slot.video.cancelVideoFrameCallback?.(slot.frame);
      slot.frame = null;
      slot.video.pause();
      slot.video.style.opacity = '0';
      if (slot.video.hasAttribute('src')) {
        slot.video.removeAttribute('src');
        slot.video.load();
      }
      slot.level = null;
    }
    function cancelPending() {
      generation += 1;
      if (pending) release(pending);
      pending = null;
    }
    function staticView() {
      phase = currentPhase();
      cancelPending();
      clearTimeout(fadeTimer);
      slots.forEach(release);
      active = null;
      host.dataset.filmState = 'poster';
      host.dataset.filmLevel = String(state.completed);
    }
    function failMedia(slot, token) {
      if (destroyed || token !== generation || (pending !== slot && active !== slot)) return;
      faultLevel = state.completed;
      staticView();
      host.dataset.filmState = 'unavailable';
      if (failedPosterLevel === state.completed) restoreLegacy();
    }
    function loadLevel() {
      cancelPending();
      clearTimeout(fadeTimer);
      const slot = slots.find(candidate => candidate !== active);
      release(slot);
      pending = slot;
      const token = generation;
      slot.level = state.completed;
      const video = slot.video;
      let aligned = false, starting = false, presented = false, alignmentAttempts = 0;
      let firstFrameTimer = null;
      const timeout = setTimeout(() => failMedia(slot, token), 10000);
      const valid = () => !destroyed && token === generation && pending === slot && slot.level === state.completed;
      function present() {
        if (!valid() || !animated() || video.readyState < 2 || video.seeking || video.paused) return;
        presented = true;
        clearTimeout(timeout); clearTimeout(firstFrameTimer);
        const previous = active;
        active = slot; pending = null;
        video.style.zIndex = '3'; video.style.opacity = '1';
        host.dataset.filmState = 'playing';
        host.dataset.filmLevel = String(slot.level);
        if (previous) {
          previous.video.style.zIndex = '2';
          fadeTimer = setTimeout(() => { if (active !== previous && pending !== previous) release(previous); }, 200);
        }
      }
      function ready() {
        if (!valid() || starting || video.readyState < 2 || video.seeking || !animated()) return;
        const target = currentPhase();
        const distance = Math.abs(video.currentTime - target);
        const circularDistance = Math.min(distance, Math.abs(manifest.duration - distance));
        // Both films share a timeline. Seek before unveiling, never restart a new level at zero.
        if ((!aligned || circularDistance > .16) && alignmentAttempts < 3) {
          aligned = true; alignmentAttempts += 1;
          if (circularDistance > 1 / manifest.fps) {
            try { video.currentTime = Math.min(target, manifest.duration - 1 / manifest.fps); return; }
            catch { failMedia(slot, token); return; }
          }
        }
        starting = true;
        Promise.resolve(video.play()).then(() => {
          if (!valid()) return;
          if (!animated()) { video.pause(); return; }
          if (typeof video.requestVideoFrameCallback === 'function') slot.frame = video.requestVideoFrameCallback(() => { slot.frame = null; present(); });
          firstFrameTimer = setTimeout(present, 180);
        }).catch(() => failMedia(slot, token));
      }
      function metadata() {
        if (!valid()) return;
        if (!Number.isFinite(video.duration) || Math.abs(video.duration - manifest.duration) > .1) { failMedia(slot, token); return; }
        ready();
      }
      function error() {
        if (presented && active === slot && slot.level === state.completed) {
          faultLevel = state.completed; staticView(); host.dataset.filmState = 'unavailable';
          if (failedPosterLevel === state.completed) restoreLegacy();
        } else failMedia(slot, token);
      }
      video.addEventListener('loadedmetadata', metadata);
      video.addEventListener('loadeddata', ready);
      video.addEventListener('canplay', ready);
      video.addEventListener('seeked', ready);
      video.addEventListener('error', error);
      slot.cleanup = () => {
        clearTimeout(timeout); clearTimeout(firstFrameTimer);
        video.removeEventListener('loadedmetadata', metadata);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('canplay', ready);
        video.removeEventListener('seeked', ready);
        video.removeEventListener('error', error);
      };
      video.preload = 'auto'; video.src = manifest.levels[slot.level].video;
      video.load();
      host.dataset.filmState = 'loading';
    }
    function reconcile() {
      if (destroyed) return;
      if (motion.matches || state.status === 'failed') { staticView(); return; }
      if (!visible()) {
        phase = currentPhase(); cancelPending();
        slots.forEach(slot => slot.video.pause());
        if (active) host.dataset.filmState = 'paused';
        return;
      }
      if (faultLevel === state.completed) return;
      if (active?.level === state.completed) {
        if (active.video.paused) {
          const slot = active;
          Promise.resolve(slot.video.play()).then(() => {
            if (active !== slot || !animated()) slot.video.pause();
            else host.dataset.filmState = 'playing';
          }).catch(() => { if (active === slot) { faultLevel = state.completed; staticView(); host.dataset.filmState = 'unavailable'; if (failedPosterLevel === state.completed) restoreLegacy(); } });
        }
        return;
      }
      if (pending?.level !== state.completed) loadLevel();
    }
    function update(next = {}) {
      if (fallback) { fallback.update(next); return; }
      if (destroyed) return;
      const completed = Number.isFinite(next.completed) ? Math.max(0, Math.min(9, Math.floor(next.completed))) : 0;
      let status = phases.has(next.status) ? next.status : 'idle';
      if (status === 'succeeded' && completed !== 9) status = 'failed';
      const lower = completed < state.completed;
      const changed = completed !== state.completed;
      state = { status, completed, currentIndex: Number.isInteger(next.currentIndex) ? next.currentIndex : null };
      host.dataset.phase = status;
      host.dataset.completed = String(completed);
      if (changed) { faultLevel = null; failedPosterLevel = null; }
      const asset = manifest.levels[completed];
      if (poster.getAttribute('src') !== asset.poster) {
        poster.style.visibility = ''; poster.src = asset.poster;
        backdrop.style.backgroundImage = 'url(' + JSON.stringify(asset.poster) + ')';
      }
      // A failed final verification can reduce the count. Never retain a brighter old film.
      if (lower) staticView();
      reconcile();
    }
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      intersecting = entries[0]?.isIntersecting !== false; reconcile();
    }) : null;
    observer?.observe(host);
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.target === host || !host.contains(record.target))) reconcile();
    });
    mutations.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'open'] });
    function onPageHide() { pageHidden = true; reconcile(); }
    function onPageShow() { pageHidden = false; reconcile(); }
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    motion.addEventListener('change', reconcile);
    function disposeFilm() {
      if (destroyed) return;
      destroyed = true; cancelPending(); clearTimeout(fadeTimer);
      slots.forEach(slot => { release(slot); slot.video.remove(); });
      backdrop.remove(); poster.remove(); observer?.disconnect(); mutations.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      motion.removeEventListener('change', reconcile);
      host.classList.remove('lights-film');
      if (!hadUniverse) host.classList.remove('lights-universe');
      for (const key of ['renderer', 'phase', 'completed', 'filmState', 'filmLevel']) delete host.dataset[key];
    }
    function restoreLegacy() {
      if (destroyed || !legacy?.create) return;
      disposeFilm();
      try { fallback = legacy.create(host); fallback.update(state); } catch { host.dataset.renderer = 'unavailable'; }
    }
    function destroy() {
      if (fallback) { fallback.destroy(); fallback = null; }
      else disposeFilm();
    }
    host.dataset.renderer = 'film';
    update(state);
    return Object.freeze({ update, destroy });
  }
  window.LW5LightsFilm = Object.freeze({ create });
  window.LW5LightsWebGL = legacy;
  window.LW5LightsUniverse = Object.freeze({ create(host) {
    const choice = host?.dataset.sceneRenderer || config.renderer || new URLSearchParams(location.search).get('sceneRenderer');
    return choice === 'webgl' || !manifest ? legacy.create(host) : create(host);
  } });
})();
