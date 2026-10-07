// Five stars share one focus target. Fill is continuous; scene changes occur at
// half-star boundaries while dragging, with a small downward hysteresis.
const STAR_PATH = 'M25 4.5C26 4.5 26.5 5.2 27 6.3L31.1 15.1C31.5 16 32.2 16.5 33.3 16.7L43 18C45 18.3 45.6 20.6 44.1 22L36.9 28.9C36.1 29.7 35.8 30.6 36 31.6L37.8 41.5C38.1 43.5 36.2 44.9 34.5 44L26.3 39.5C25.4 39 24.6 39 23.7 39.5L15.5 44C13.8 44.9 11.9 43.5 12.2 41.5L14 31.6C14.2 30.6 13.9 29.7 13.1 28.9L5.9 22C4.4 20.6 5 18.3 7 18L16.7 16.7C17.8 16.5 18.5 16 18.9 15.1L23 6.3C23.5 5.2 24 4.5 25 4.5Z';
const clamp = value => Math.max(0, Math.min(5, value));
const snap = value => Math.round(clamp(value) * 2) / 2;
const DRAG_HYSTERESIS = .06;
const coordinators = new WeakMap();
let instanceId = 0;

// A finger that starts on the canvas is also counted. If a rating and a second
// finger overlap, both gestures are cancelled and fenced until every finger lifts.
function pointerCoordinator(doc) {
  if (coordinators.has(doc)) return coordinators.get(doc);
  const pointers = new Set(), owners = new Set();
  let fence = null;
  const stop = event => { event.stopPropagation(); if (event.cancelable) event.preventDefault(); };
  const down = event => {
    pointers.add(event.pointerId);
    if (!fence) return;
    if (event.pointerId !== fence.pointerId || fence.blocked) {
      fence.blocked = true;
      fence.owner.cancel();
      stop(event);
    }
  };
  const move = event => { if (fence?.blocked && pointers.has(event.pointerId)) stop(event); };
  const end = event => {
    const blocked = fence?.blocked;
    pointers.delete(event.pointerId);
    if (blocked) stop(event);
    if (blocked && pointers.size === 0) fence = null;
  };
  const reset = () => {
    for (const owner of owners) owner.cancel();
    pointers.clear();
    fence = null;
  };
  const visibility = () => { if (doc.hidden) reset(); };
  const options = { capture: true, passive: false };
  doc.addEventListener('pointerdown', down, options);
  doc.addEventListener('pointermove', move, options);
  doc.addEventListener('pointerup', end, options);
  doc.addEventListener('pointercancel', end, options);
  doc.defaultView.addEventListener('blur', reset);
  doc.addEventListener('visibilitychange', visibility);
  const coordinator = {
    add(owner) { owners.add(owner); },
    start(owner, event) {
      if (fence || pointers.size !== 1) {
        fence = { owner, pointerId: event.pointerId, blocked: true };
        return false;
      }
      fence = { owner, pointerId: event.pointerId, blocked: false };
      return true;
    },
    finish(owner, { allowNative = false } = {}) {
      if (fence?.owner !== owner) return;
      if (allowNative) fence = null;
      else if (pointers.size) fence.blocked = true;
      else fence = null;
    },
    remove(owner) {
      owners.delete(owner);
      if (fence?.owner === owner) fence = null;
      if (owners.size) return;
      doc.removeEventListener('pointerdown', down, options);
      doc.removeEventListener('pointermove', move, options);
      doc.removeEventListener('pointerup', end, options);
      doc.removeEventListener('pointercancel', end, options);
      doc.defaultView.removeEventListener('blur', reset);
      doc.removeEventListener('visibilitychange', visibility);
      coordinators.delete(doc);
    }
  };
  coordinators.set(doc, coordinator);
  return coordinator;
}

export function createStarRating(container, {
  value = 0, label = '星级', onCommit = () => {}, onPreview = () => {},
  onInteractionStart = () => {}, onExplicitSelect = () => {}
} = {}) {
  if (!container?.ownerDocument) throw new TypeError('A star-rating container is required.');
  const doc = container.ownerDocument, win = doc.defaultView;
  const coordinator = pointerCoordinator(doc), id = ++instanceId;
  let committed = Number.isFinite(Number(value)) ? snap(Number(value)) : 0;
  let preview = committed, active = null, commitCount = 0, destroyed = false;
  container.classList.add('star-rating');
  container.innerHTML = `<div class="star-rating-track" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="5" aria-orientation="horizontal">${Array.from({ length: 5 }, (_, index) => {
    const uid = `rating-${id}-${index}`;
    return `<span class="star-rating-cell" data-star="${index + 1}" aria-hidden="true"><svg viewBox="0 0 50 50" focusable="false"><defs><linearGradient id="${uid}-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffe39a"/><stop offset="100%" stop-color="#f5bc58"/></linearGradient><clipPath id="${uid}-clip" clipPathUnits="userSpaceOnUse"><rect width="0" height="50"/></clipPath></defs><path class="star-rating-empty" d="${STAR_PATH}"/><path class="star-rating-fill" d="${STAR_PATH}" fill="url(#${uid}-gold)" clip-path="url(#${uid}-clip)"/><path class="star-rating-outline" d="${STAR_PATH}"/></svg></span>`;
  }).join('')}</div><button class="star-rating-clear" type="button">清零</button>`;
  const track = container.querySelector('.star-rating-track');
  const clear = container.querySelector('.star-rating-clear');
  const cells = [...track.children];
  const clips = cells.map(cell => cell.querySelector('clipPath rect'));
  track.setAttribute('aria-label', label);
  clear.setAttribute('aria-label', `将${label}设为0星`);
  clear.title = '设为0星';
  const listeners = [];
  const listen = (target, event, handler, options) => {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  };
  const swallow = event => { event.stopPropagation(); };
  const prevent = event => { swallow(event); if (event.cancelable) event.preventDefault(); };
  const visible = () => !container.closest('[hidden]') && container.isConnected;
  function render() {
    cells.forEach((cell, index) => {
      const fill = Math.min(1, Math.max(0, preview - index));
      cell.dataset.fill = fill.toFixed(4);
      clips[index].setAttribute('width', String(fill * 50));
      cell.classList.toggle('is-filled', fill > 0);
    });
    const shown = Math.round(preview * 100) / 100;
    track.setAttribute('aria-valuenow', String(shown));
    track.setAttribute('aria-valuetext', `${shown} 星，共 5 星`);
    container.dataset.value = String(committed);
    container.dataset.previewValue = String(preview);
    container.dataset.dragging = String(active?.kind === 'stars');
    // Zero is an explicit rating, including when the scene currently represents
    // an unreviewed dimension with an empty (zero-valued) visual component.
    clear.setAttribute('aria-disabled', 'false');
  }
  function setPreview(next) {
    const changed = preview !== next;
    preview = next;
    render();
    if (changed) onPreview(preview);
  }
  function release({ allowNative = false } = {}) {
    const previous = active;
    active = null;
    if (previous?.target.hasPointerCapture(previous.pointerId)) {
      previous.target.releasePointerCapture(previous.pointerId);
    }
    coordinator.finish(api, { allowNative });
  }
  function cancel({ allowNative = false } = {}) {
    if (destroyed) return;
    release({ allowNative });
    setPreview(committed);
  }
  function publish(next, reason, live = false) {
    next = snap(next);
    const changed = next !== committed;
    const previousValue = committed;
    committed = next;
    render();
    if (changed) {
      commitCount++;
      onCommit(committed, { reason, previousValue, live });
    } else if (reason === 'tap' || reason === 'keyboard' || reason === 'clear') {
      onExplicitSelect(committed, { reason, previousValue, live: false, unchanged: true });
    }
  }
  function commit(next, reason) {
    release();
    // A terminal click/key/release can choose the nearest half star. During a
    // drag, every crossed half star has already been published separately.
    next = snap(next);
    setPreview(next);
    publish(next, reason);
  }
  function commitDrag(raw) {
    const gesture = active;
    if (!gesture || gesture.kind !== 'stars' || !gesture.moved) return;
    let target = committed;
    if (raw >= committed + .5) target = Math.floor(raw * 2) / 2;
    else if (raw < committed - DRAG_HYSTERESIS) target = Math.floor((raw + DRAG_HYSTERESIS) * 2) / 2;
    target = clamp(target);
    // At most ten synchronous notifications. Animation batching belongs to the
    // scene; no delayed component work can outlive cancellation or a new drag.
    for (let step = 0; step < 10 && committed !== target; step++) {
      if (destroyed || active !== gesture) break;
      publish(committed + Math.sign(target - committed) * .5, 'drag', true);
    }
  }
  function valueAt(clientX, tap = false) {
    const rects = cells.map(cell => cell.getBoundingClientRect());
    if (clientX < rects[0].left) return 0;
    if (clientX >= rects[4].right) return 5;
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (clientX <= rect.right) {
        const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return tap ? i + (fraction < .5 ? .5 : 1) : i + fraction;
      }
    }
    return 5;
  }
  function begin(event, kind) {
    swallow(event);
    if (destroyed || !visible() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    onInteractionStart();
    if (!coordinator.start(api, event)) { cancel(); return; }
    active = { pointerId: event.pointerId, target: event.currentTarget, kind, startX: event.clientX, startY: event.clientY, pointerType: event.pointerType, moved: false, locked: false };
    track.focus({ preventScroll: true });
    if (kind === 'stars') setPreview(valueAt(event.clientX));
    else render();
  }
  function intent(event) {
    const dx = Math.abs(event.clientX - active.startX), dy = Math.abs(event.clientY - active.startY);
    const threshold = active.pointerType === 'mouse' ? 3 : 6;
    if (Math.max(dx, dy) < threshold) return 'pending';
    if (dy > dx * 1.1) return 'vertical';
    if (dx > dy * 1.1) return 'horizontal';
    return Math.max(dx, dy) >= 10 ? (dx >= dy ? 'horizontal' : 'vertical') : 'pending';
  }
  function move(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    swallow(event);
    if (!visible()) { cancel(); return; }
    if (!active.locked) {
      const direction = intent(event);
      if (direction === 'vertical') { cancel({ allowNative: true }); return; }
      if (direction === 'horizontal') {
        active.locked = active.moved = true;
        try { active.target.setPointerCapture(event.pointerId); } catch { cancel(); return; }
      }
    }
    if (active.locked) prevent(event);
    if (active.kind === 'stars') {
      const raw = valueAt(event.clientX);
      setPreview(raw);
      commitDrag(raw);
    }
  }
  function end(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    if (!active.locked) {
      const direction = intent(event);
      if (direction === 'vertical') { swallow(event); cancel({ allowNative: true }); return; }
      if (direction === 'horizontal') active.moved = true;
    }
    prevent(event);
    if (!visible()) { cancel(); return; }
    if (active.kind === 'stars') {
      const gesture = active;
      const moved = active.moved;
      const raw = valueAt(event.clientX, !moved);
      // Some platforms coalesce the last movement into pointerup. Preserve the
      // same ordered live steps before rounding that final position.
      if (moved) { setPreview(raw); commitDrag(raw); }
      if (active === gesture) commit(raw, moved ? 'release' : 'tap');
    }
    else {
      const rect = clear.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) commit(0, 'clear');
      else cancel();
    }
  }
  listen(track, 'pointerdown', event => begin(event, 'stars'));
  listen(clear, 'pointerdown', event => begin(event, 'clear'));
  // Listen before the event reaches its target while deciding intent, so a
  // finger can leave the row without requiring premature pointer capture.
  listen(doc, 'pointermove', move, { capture: true, passive: false });
  listen(doc, 'pointerup', end, { capture: true, passive: false });
  listen(doc, 'pointercancel', event => {
    if (active?.pointerId === event.pointerId) { swallow(event); cancel({ allowNative: true }); }
  }, { capture: true, passive: false });
  for (const target of [track, clear]) {
    listen(target, 'lostpointercapture', event => { if (active?.pointerId === event.pointerId) cancel(); });
  }
  listen(track, 'keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = committed + .5;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = committed - .5;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 5;
    else if (event.key === 'Escape') { prevent(event); cancel(); return; }
    else return;
    prevent(event);
    onInteractionStart();
    commit(next, 'keyboard');
  });
  listen(clear, 'click', event => {
    prevent(event);
    // Pointer activation is completed on pointerup, including cancellation rules.
    if (event.detail === 0 && !destroyed) { onInteractionStart(); commit(0, 'clear'); }
  });
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick']) listen(container, name, swallow);
  listen(container, 'contextmenu', prevent);
  // The public cancel() is the immediate tab-switch hook; this also covers DOM
  // hiding/removal by callers that do not use the hook.
  const observer = new win.MutationObserver(() => { if (active && !visible()) cancel(); });
  observer.observe(doc.body, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  const api = {
    setValue(next, { preserveDrag = false } = {}) {
      if (destroyed || !Number.isFinite(Number(next))) return;
      if (preserveDrag && active?.kind === 'stars') {
        committed = snap(Number(next));
        render();
        return;
      }
      release();
      committed = snap(Number(next));
      setPreview(committed);
    },
    getState: () => ({ value: committed, lastCommitted: committed, previewValue: preview, dragging: active?.kind === 'stars', intentLocked: Boolean(active?.locked), commitCount }),
    cancel,
    destroy() {
      if (destroyed) return;
      cancel();
      destroyed = true;
      observer.disconnect();
      for (const remove of listeners) remove();
      coordinator.remove(api);
      container.replaceChildren();
      container.classList.remove('star-rating');
      for (const key of ['value', 'previewValue', 'dragging']) delete container.dataset[key];
    }
  };
  coordinator.add(api);
  render();
  return api;
}
