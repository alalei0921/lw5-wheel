// One canvas owns these gestures. Controls elsewhere on the page keep their
// ordinary browser behavior; touch-action / callout CSS belongs on the canvas.
export function bindIslandGestures(canvas, callbacks) {
  const HOLD_MS = 500;
  const MOVE_TOLERANCE = 8; // CSS pixels, independent of renderer pixel ratio.
  const pointers = new Map();
  let mode = 'idle';
  let holdTimer = null;
  let pinchDistance = 0;
  let pinchZoom = 1;

  const now = () => performance.now();
  const emit = (name, ...args) => callbacks[name]?.(...args);
  const isWater = (x, y) => Boolean(callbacks.isWater?.(x, y));

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    emit('onMode', next);
  }

  function clearHold() {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function hideHalo() {
    emit('onHalo', { visible: false, x: 0, y: 0 });
  }

  function capture(id) {
    // A pointer may already have been cancelled when a delayed event arrives.
    try { canvas.setPointerCapture(id); } catch { /* No active pointer. */ }
  }

  function release(id) {
    try {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    } catch { /* Canvas removal / platform cancellation already released it. */ }
  }

  function endOrbit(cancelled, pointer) {
    if (mode === 'orbit') {
      emit('onOrbitEnd', {
        cancelled,
        idleMs: pointer ? Math.max(0, now() - pointer.lastMove) : Infinity,
      });
    }
  }

  function beginPinch() {
    clearHold();
    hideHalo();
    endOrbit(true, pointers.values().next().value);
    emit('onStart'); // Discard orbit inertia before measuring pinch zoom.
    const [a, b] = [...pointers.values()];
    pinchDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const zoom = emit('onPinchStart');
    pinchZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    setMode('pinch');
  }

  function suppress() {
    clearHold();
    hideHalo();
    endOrbit(true, pointers.values().next().value);
    setMode(pointers.size ? 'suppressed' : 'idle');
  }

  function pointerDown(event) {
    if (event.button > 0 || pointers.has(event.pointerId)) return;
    event.preventDefault();
    const time = now();
    const pointer = {
      x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY,
      startTime: time, lastMove: time, maxTravel: 0, waterOnDown: false, tapTarget: null,
    };
    pointers.set(event.pointerId, pointer);
    capture(event.pointerId);

    // After a pinch ends, even a newly added contact must wait for all fingers
    // to lift. Reusing a remaining finger creates camera jumps and false taps.
    if (mode === 'suppressed' || pointers.size > 2) {
      suppress();
      return;
    }
    if (pointers.size === 2) {
      beginPinch();
      return;
    }

    emit('onStart');
    setMode('pending');
    pointer.tapTarget = emit('getTapTarget', pointer.x, pointer.y) ?? null;
    // A small scene object owns its short tap. Holding it cannot start the
    // water gesture behind it; moving still commits to ordinary orbit.
    pointer.waterOnDown = pointer.tapTarget === null && isWater(pointer.x, pointer.y);
    if (!pointer.waterOnDown) return;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (mode !== 'pending' || pointers.size !== 1 ||
          pointers.get(event.pointerId) !== pointer ||
          pointer.maxTravel > MOVE_TOLERANCE ||
          !isWater(pointer.x, pointer.y)) return;
      setMode('stir');
      emit('onStirStart', pointer.x, pointer.y);
      emit('onHalo', { visible: true, x: pointer.x, y: pointer.y });
    }, HOLD_MS);
  }

  function pointerMove(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const time = now();
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const elapsed = Math.max(1, time - pointer.lastMove);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.maxTravel = Math.max(pointer.maxTravel,
      Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY));

    if (mode === 'pinch') {
      const [a, b] = [...pointers.values()];
      if (a && b) {
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        emit('onPinch', pinchZoom * pinchDistance / distance);
      }
    } else if (mode === 'pending' && pointer.maxTravel > MOVE_TOLERANCE) {
      clearHold();
      // Commit to orbit for the lifetime of this contact. Pausing a drag must
      // never turn a rotating island into a long-press water gesture.
      setMode('orbit');
      emit('onOrbit', pointer.x - pointer.startX, pointer.y - pointer.startY,
        Math.max(1, time - pointer.startTime));
    } else if (mode === 'orbit' && (dx || dy)) {
      emit('onOrbit', dx, dy, elapsed);
    } else if (mode === 'stir') {
      const wet = isWater(pointer.x, pointer.y);
      emit('onHalo', { visible: wet, x: pointer.x, y: pointer.y });
      if (wet && (dx || dy)) emit('onStirMove', pointer.x, pointer.y, dx, dy);
    }
    if (dx || dy) pointer.lastMove = time;
  }

  function pointerUp(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    clearHold();
    hideHalo();
    const previousMode = mode;
    const tapTravel = Math.max(pointer.maxTravel,
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY));

    // Delete before releasing capture: lostpointercapture can be dispatched
    // immediately and must not cancel another gesture or emit a second end.
    pointers.delete(event.pointerId);
    endOrbit(false, pointer);
    setMode(pointers.size ? 'suppressed' : 'idle');
    release(event.pointerId);

    if (previousMode === 'pending' && tapTravel <= MOVE_TOLERANCE &&
        now() - pointer.startTime < HOLD_MS) {
      if (pointer.tapTarget !== null) {
        if (emit('getTapTarget', event.clientX, event.clientY) === pointer.tapTarget)
          emit('onTargetTap', pointer.tapTarget, event.clientX, event.clientY);
      } else if (pointer.waterOnDown && isWater(event.clientX, event.clientY)) {
        emit('onTap', event.clientX, event.clientY);
      }
    }
  }

  function pointerCancelled(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (event.cancelable) event.preventDefault();
    clearHold();
    hideHalo();
    pointers.delete(event.pointerId);
    endOrbit(true, pointer);
    setMode(pointers.size ? 'suppressed' : 'idle');
    release(event.pointerId);
  }

  function cancel() {
    clearHold();
    hideHalo();
    endOrbit(true, pointers.values().next().value);
    const ids = [...pointers.keys()];
    pointers.clear();
    setMode('idle');
    ids.forEach(release);
  }

  const preventCanvasDefault = event => event.preventDefault();
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', pointerCancelled, { passive: false });
  canvas.addEventListener('lostpointercapture', pointerCancelled);
  for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'gestureend']) {
    canvas.addEventListener(type, preventCanvasDefault);
  }

  return {
    cancel,
    getState: () => ({
      mode,
      pointerCount: pointers.size,
      activePointer: pointers.size === 1 && ['pending', 'orbit', 'stir'].includes(mode)
        ? pointers.keys().next().value : null,
      longPressPending: holdTimer !== null,
    }),
  };
}
