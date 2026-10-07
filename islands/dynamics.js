// A 2-D damped heightfield, not a full fluid solver. This keeps the visible
// surface, normals and optical distortion on the same physical state.
// Coordinates include both box edges: i/(size-1)*extent - extent/2.
export function createWaterDynamics({size = 112, extent = 5.6, waterLevel = .38, bedHeight = () => -1, stirDepthFraction = 1 / 3} = {}) {
  size = Math.max(16, Math.min(256, Math.round(size)));
  if (!Number.isFinite(extent) || extent <= 0) throw new RangeError('Water extent must be positive');
  const count = size * size, half = extent * .5, spacing = extent / (size - 1);
  const speed = .94; // world units/s; a touch ring crosses the visible water in a few seconds.
  // 2-D CFL is c*dt/dx < 1/sqrt(2). Use <= .32, including alternate grid sizes.
  const fixedDt = Math.min(1 / 120, spacing * .32 / speed);
  const invSpacingSq = 1 / (spacing * spacing), damping = Math.exp(-.62 * fixedDt);
  const heightDamping = Math.exp(-.045 * fixedDt);
  const data = new Float32Array(count * 4), h = new Float32Array(count), v = new Float32Array(count);
  const wet = new Float32Array(count), active = new Uint8Array(count);
  const depths = new Float32Array(count);
  // Deep stirring has its own pressure-driven wave field. It never changes the
  // approved light-touch solver, its damping, its limits, or the slosh modes.
  const deepH = new Float32Array(count), deepV = new Float32Array(count);
  const flowX = new Float32Array(count), flowZ = new Float32Array(count);
  const pressureBase = new Float32Array(count), pressureMove = new Float32Array(count);
  const contactWeight = new Float32Array(count);
  const neighbors = new Int32Array(count * 4), sinX = new Float32Array(size), sinZ = new Float32Array(size);
  // Neumann box walls and dry shoreline reflect waves. A 14 cm shore taper
  // turns the static shoreline into a smooth contact region and avoids flooding.
  const smooth = x => { const a = Math.max(0, Math.min(1, x)); return a * a * (3 - 2 * a); };
  let wetCount = 0;
  for (let j = 0; j < size; j++) {
    const z = j * spacing - half;
    sinX[j] = sinZ[j] = Math.sin(Math.PI * z / extent);
    for (let i = 0; i < size; i++) {
      const n = j * size + i, depth = waterLevel - bedHeight(i * spacing - half, z);
      depths[n] = Number.isFinite(depth) ? Math.max(0, depth) : 0;
      wet[n] = Number.isFinite(depth) ? smooth((depth - .008) / .14) : 0;
      active[n] = wet[n] > .002 ? 1 : 0;
      wetCount += active[n];
      data[n * 4 + 3] = wet[n];
    }
  }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const n = j * size + i, b = n * 4;
    neighbors[b] = i > 0 && active[n - 1] ? n - 1 : n;
    neighbors[b + 1] = i < size - 1 && active[n + 1] ? n + 1 : n;
    neighbors[b + 2] = j > 0 && active[n - size] ? n - size : n;
    neighbors[b + 3] = j < size - 1 && active[n + size] ? n + size : n;
  }
  const slosh = {x: 0, z: 0, vx: 0, vz: 0};
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const depthFraction = Number.isFinite(stirDepthFraction) ? clamp(stirDepthFraction, 0, .45) : 1 / 3;
  const deepDamping = Math.exp(-.94 * fixedDt), deepHeightDamping = Math.exp(-.12 * fixedDt), flowDamping = Math.exp(-1.6 * fixedDt);
  const deep = {active: false, x: 0, z: 0, localDepth: 0, targetDepth: 0, pressure: 0,
    vx: 0, vz: 0, speed: 0, dirX: 1, dirZ: 0, contacts: 0, moves: 0};
  let deepEnabled = false, deepAmplitude = 0, deepEnergy = 0, maxFlowSpeed = 0;
  let moveAge = 10, releaseAge = 1, releasePressure = 0;
  let accumulator = 0, steps = 0, disturbances = 0, simulatedTime = 0;
  let amplitude = 0, maxHeight = 0, minHeight = 0, maxSlope = 0, energy = 0;

  function interpolate(array, x, z, stride = 1, channel = 0) {
    const fi = clamp((x + half) / spacing, 0, size - 1), fj = clamp((z + half) / spacing, 0, size - 1);
    const i = Math.min(size - 2, Math.floor(fi)), j = Math.min(size - 2, Math.floor(fj));
    const u = fi - i, w = fj - j, n = j * size + i;
    return (array[n * stride + channel] * (1 - u) + array[(n + 1) * stride + channel] * u) * (1 - w)
      + (array[(n + size) * stride + channel] * (1 - u) + array[(n + size + 1) * stride + channel] * u) * w;
  }

  function wetPoint(x, z) {
    return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= half && Math.abs(z) <= half
      && interpolate(wet, x, z) >= .08 && waterLevel - bedHeight(x, z) > .025;
  }

  function rebuildPressure() {
    pressureBase.fill(0); pressureMove.fill(0); contactWeight.fill(0);
    // The finger is a virtual pressure contact; no hardware depth is inferred.
    // A compact depression and raised rim approximately redistribute its volume.
    // Motion adds a positive bow crest and negative wake aligned with actual drag.
    const radius = .265, range = Math.ceil(radius * 3.8 / spacing);
    const ci = Math.round((deep.x + half) / spacing), cj = Math.round((deep.z + half) / spacing);
    const motion = deep.speed / (deep.speed + .6);
    for (let j = Math.max(0, cj - range); j <= Math.min(size - 1, cj + range); j++) {
      for (let i = Math.max(0, ci - range); i <= Math.min(size - 1, ci + range); i++) {
        const n = j * size + i;
        if (!active[n]) continue;
        const dx = i * spacing - half - deep.x, dz = j * spacing - half - deep.z;
        const q = (dx * dx + dz * dz) / (radius * radius);
        const footprint = Math.exp(-q * .5), edge = 1 - smooth((q - 9) / 5.44);
        const shoreDepthScale = Math.min(1, depths[n] / Math.max(.025, deep.localDepth));
        const depth = deep.targetDepth * shoreDepthScale;
        const along = dx * deep.dirX + dz * deep.dirZ, across = -dx * deep.dirZ + dz * deep.dirX;
        const front = Math.exp(-.5 * ((along - .39) / .17) ** 2 - .5 * (across / .28) ** 2);
        const wake = Math.exp(-.5 * ((along + .43) / .29) ** 2 - .5 * (across / .18) ** 2);
        pressureBase[n] = -depth * (1 - q * .5) * footprint * edge;
        pressureMove[n] = depth * motion * (.58 * front - .27 * wake) * (1 - Math.exp(-q * 2)) * edge;
        contactWeight[n] = footprint * edge * wet[n];
      }
    }
  }

  function beginStir(x, z) {
    if (!wetPoint(x, z) || depthFraction === 0) return false;
    deepEnabled = true; deep.active = true; deep.x = x; deep.z = z;
    deep.localDepth = waterLevel - bedHeight(x, z); deep.targetDepth = deep.localDepth * depthFraction;
    deep.vx = deep.vz = deep.speed = 0; deep.dirX = 1; deep.dirZ = 0;
    deep.contacts++; moveAge = 10; releaseAge = 0; releasePressure = 0;
    rebuildPressure(); return true;
  }

  function moveStir(x, z, dtSeconds = 1 / 60) {
    if (!deep.active) return false;
    if (!wetPoint(x, z)) { endStir(); return false; }
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? clamp(dtSeconds, 1 / 240, .2) : 1 / 60;
    const dx = x - deep.x, dz = z - deep.z;
    // Input speed is bounded before filtering; a teleported pointer cannot inject
    // unbounded momentum. The latest direction is retained while motion decays.
    const inputLength = Math.hypot(dx, dz), inputSpeed = Math.min(2.8, inputLength / dt);
    const mix = 1 - Math.exp(-dt * 22);
    deep.vx += ((inputLength > 1e-8 ? dx / inputLength * inputSpeed : 0) - deep.vx) * mix;
    deep.vz += ((inputLength > 1e-8 ? dz / inputLength * inputSpeed : 0) - deep.vz) * mix;
    deep.speed = Math.hypot(deep.vx, deep.vz);
    if (deep.speed > .015) { deep.dirX = deep.vx / deep.speed; deep.dirZ = deep.vz / deep.speed; }
    deep.x = x; deep.z = z; deep.localDepth = waterLevel - bedHeight(x, z);
    deep.targetDepth = deep.localDepth * depthFraction;
    deep.moves++; moveAge = 0; rebuildPressure(); return true;
  }

  function endStir() {
    if (!deep.active) return;
    deep.active = false; releaseAge = 0; releasePressure = deep.pressure;
  }

  function integrateDeep() {
    if (!deepEnabled) return;
    const dt = fixedDt;
    moveAge += dt;
    const motionFade = Math.exp(-moveAge / .16);
    if (deep.active) deep.pressure += (1 - deep.pressure) * (1 - Math.exp(-55 * dt));
    else { releaseAge += dt; deep.pressure = releasePressure * (1 - smooth(releaseAge / .20)); }
    const acceleration = speed * speed * invSpacingSq * dt;
    // Wave propagation remains explicit and CFL-bounded. A local exact critically
    // damped pressure constraint follows the finger without a bouncy spring mesh.
    // After its 200 ms release, the very same displaced field propagates freely.
    for (let n = 0; n < count; n++) if (active[n]) {
      const b = n * 4, lap = deepH[neighbors[b]] + deepH[neighbors[b + 1]] + deepH[neighbors[b + 2]] + deepH[neighbors[b + 3]] - 4 * deepH[n];
      deepV[n] = clamp((deepV[n] + acceleration * lap) * deepDamping, -3.2, 3.2);
    }
    for (let n = 0; n < count; n++) if (active[n]) {
      const weight = deep.pressure * contactWeight[n];
      let next;
      if (weight > .001) {
        const omega = 54 * Math.sqrt(weight), e = Math.exp(-omega * dt);
        const target = pressureBase[n] + pressureMove[n] * motionFade;
        const offset = deepH[n] - target, momentum = deepV[n] + omega * offset;
        next = target + (offset + momentum * dt) * e;
        deepV[n] = (deepV[n] - omega * momentum * dt) * e;
      } else next = deepH[n] + deepV[n] * dt;
      // Local depth, not a global tanh, bounds the separate deeper interaction.
      // The output has an additional bottom-clearance guard after combining waves.
      const lo = -depths[n] * .68, hi = Math.min(.17, depths[n] * .48);
      deepH[n] = clamp(next * deepHeightDamping, lo, hi);
      if (next < lo && deepV[n] < 0 || next > hi && deepV[n] > 0) deepV[n] *= .35;
    }
    // Approximate linear shallow-water horizontal flow. This is a future consumer
    // interface, not a 3-D fluid velocity or a mass-conserving advection solver.
    // Static imposed pressure balances its depression; movement imparts bounded
    // horizontal momentum, and released surface slopes continue driving the wake.
    for (let n = 0; n < count; n++) if (active[n]) {
      const b = n * 4, left = neighbors[b], right = neighbors[b + 1], back = neighbors[b + 2], front = neighbors[b + 3];
      const gx = (deepH[right] - deepH[left] - deep.pressure * (pressureBase[right] - pressureBase[left] + motionFade * (pressureMove[right] - pressureMove[left]))) / (2 * spacing);
      const gz = (deepH[front] - deepH[back] - deep.pressure * (pressureBase[front] - pressureBase[back] + motionFade * (pressureMove[front] - pressureMove[back]))) / (2 * spacing);
      const drive = 1 - Math.exp(-8 * contactWeight[n] * deep.pressure * dt);
      flowX[n] = clamp((flowX[n] - gx * 1.3 * dt) * flowDamping, -1.4, 1.4);
      flowZ[n] = clamp((flowZ[n] - gz * 1.3 * dt) * flowDamping, -1.4, 1.4);
      flowX[n] += (deep.vx * motionFade * .42 - flowX[n]) * drive;
      flowZ[n] += (deep.vz * motionFade * .42 - flowZ[n]) * drive;
      if (left === n || right === n) flowX[n] = 0;
      if (back === n || front === n) flowZ[n] = 0;
    }
  }

  function sampleFlow(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > half || Math.abs(z) > half) {
      return {x: 0, z: 0, speed: 0, height: 0, depth: 0, wet: 0};
    }
    const mask = interpolate(wet, x, z), fx = interpolate(flowX, x, z) * mask, fz = interpolate(flowZ, x, z) * mask;
    return {x: fx, z: fz, speed: Math.hypot(fx, fz), height: interpolate(data, x, z, 4),
      depth: interpolate(depths, x, z), wet: mask};
  }

  function integrateSlosh(dt) {
    // Exact damped spring: period ~1.5 s, amplitude e-folding time ~1.5 s.
    // Sine standing modes have zero outward slope at the four box walls.
    const decay = .68, omega = 4.05, wd = Math.sqrt(omega * omega - decay * decay);
    const e = Math.exp(-decay * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    for (const axis of ['x', 'z']) {
      const velocity = axis === 'x' ? 'vx' : 'vz', p = slosh[axis], u = slosh[velocity];
      slosh[axis] = e * (p * c + (u + decay * p) * s / wd);
      slosh[velocity] = e * (u * c - (omega * omega * p + decay * u) * s / wd);
    }
    const magnitude = Math.hypot(slosh.x, slosh.z);
    if (magnitude > .165) {
      const scale = .165 / magnitude;
      slosh.x *= scale; slosh.z *= scale; slosh.vx *= scale; slosh.vz *= scale;
    }
  }

  function publish() {
    amplitude = 0; maxHeight = 0; minHeight = 0; maxSlope = 0; energy = 0;
    deepAmplitude = 0; deepEnergy = 0; maxFlowSpeed = 0;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const n = j * size + i, b = n * 4;
      // Smooth saturation preserves continuity under repeated fast interaction.
      const raw = (h[n] + slosh.x * sinX[i] + slosh.z * sinZ[j]) * wet[n];
      let height = .22 * Math.tanh(raw / .22);
      if (deepEnabled) {
        const offset = deepH[n] * wet[n];
        height = Math.max(-Math.max(0, depths[n] - .018), height + offset);
        deepAmplitude = Math.max(deepAmplitude, Math.abs(offset));
      }
      data[b] = height;
      amplitude = Math.max(amplitude, Math.abs(height));
      maxHeight = Math.max(maxHeight, height); minHeight = Math.min(minHeight, height);
    }
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const n = j * size + i, b = n * 4;
      // Derivatives are measured from the exact uploaded height, including shore
      // taper, standing modes and saturation; optical normals cannot drift away.
      const left = i > 0 ? n - 1 : n, right = i < size - 1 ? n + 1 : n;
      const back = j > 0 ? n - size : n, front = j < size - 1 ? n + size : n;
      const gx = (data[right * 4] - data[left * 4]) / (spacing * (i > 0 && i < size - 1 ? 2 : 1));
      const gz = (data[front * 4] - data[back * 4]) / (spacing * (j > 0 && j < size - 1 ? 2 : 1));
      data[b + 1] = gx; data[b + 2] = gz;
      maxSlope = Math.max(maxSlope, Math.hypot(gx, gz));
      if (active[n]) energy += v[n] * v[n] + speed * speed * (gx * gx + gz * gz);
      if (deepEnabled && active[n]) {
        const dgx = (deepH[right] * wet[right] - deepH[left] * wet[left]) / (spacing * (i > 0 && i < size - 1 ? 2 : 1));
        const dgz = (deepH[front] * wet[front] - deepH[back] * wet[back]) / (spacing * (j > 0 && j < size - 1 ? 2 : 1));
        deepEnergy += deepV[n] * deepV[n] + speed * speed * (dgx * dgx + dgz * dgz);
        maxFlowSpeed = Math.max(maxFlowSpeed, Math.hypot(flowX[n], flowZ[n]) * wet[n]);
      }
    }
    energy = energy / Math.max(1, wetCount) + slosh.vx * slosh.vx + slosh.vz * slosh.vz;
    deepEnergy /= Math.max(1, wetCount);
  }

  function step(dtSeconds) {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    let elapsed = dtSeconds;
    // Never replay minutes of queued physics after a background tab resumes.
    // Decay the skipped interval, then integrate at most 250 ms of current state.
    if (elapsed > .25) {
      const skipped = elapsed - .125, fade = Math.exp(-Math.min(skipped, 60) * .8);
      for (let n = 0; n < count; n++) { h[n] *= fade; v[n] *= fade; }
      if (deepEnabled) {
        for (let n = 0; n < count; n++) { deepH[n] *= fade; deepV[n] *= fade; flowX[n] *= fade; flowZ[n] *= fade; }
        moveAge += skipped;
        if (elapsed > 1) { endStir(); deep.pressure = 0; releasePressure = 0; }
      }
      integrateSlosh(Math.min(skipped, 60)); accumulator = 0; elapsed = .125;
    }
    accumulator += elapsed;
    const acceleration = speed * speed * invSpacingSq * fixedDt;
    while (accumulator + 1e-10 >= fixedDt) {
      // Symplectic Euler evaluates all velocities before advancing any heights.
      for (let n = 0; n < count; n++) if (active[n]) {
        const b = n * 4, lap = h[neighbors[b]] + h[neighbors[b + 1]] + h[neighbors[b + 2]] + h[neighbors[b + 3]] - 4 * h[n];
        v[n] = clamp((v[n] + acceleration * lap) * damping, -2, 2);
      }
      for (let n = 0; n < count; n++) if (active[n]) {
        const next = (h[n] + v[n] * fixedDt) * heightDamping;
        h[n] = clamp(next, -.135, .135);
        if (Math.abs(next) > .135) v[n] *= .65;
      }
      integrateSlosh(fixedDt);
      integrateDeep();
      accumulator -= fixedDt; steps++; simulatedTime += fixedDt;
    }
    publish();
  }

  function disturb(x, z, strength = 1, radius = .16) {
    if (![x, z, strength, radius].every(Number.isFinite) || Math.abs(x) > half || Math.abs(z) > half) return false;
    const ci = clamp(Math.round((x + half) / spacing), 0, size - 1);
    const cj = clamp(Math.round((z + half) / spacing), 0, size - 1);
    if (wet[cj * size + ci] < .08 || strength === 0) return false;
    const amount = clamp(strength, -1.8, 1.8), r = clamp(radius, spacing * 1.8, .55);
    const range = Math.ceil(r * 3.5 / spacing), invRadiusSq = 1 / (r * r);
    for (let j = Math.max(0, cj - range); j <= Math.min(size - 1, cj + range); j++) {
      for (let i = Math.max(0, ci - range); i <= Math.min(size - 1, ci + range); i++) {
        const n = j * size + i;
        if (!active[n]) continue;
        const dx = i * spacing - half - x, dz = j * spacing - half - z;
        const q = (dx * dx + dz * dz) * invRadiusSq;
        // A depression with a raised rim has almost zero displaced volume.
        // This initial displacement propagates through the PDE; it is not an
        // expanding analytic ring or a moving highlight texture.
        const impulse = -.077 * amount * (1 - q * .5) * Math.exp(-q * .5) * wet[n];
        h[n] = .125 * Math.tanh((h[n] + impulse) / .125);
      }
    }
    disturbances++; publish(); return true;
  }

  function rock(dx, dz) {
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
    slosh.vx = clamp(slosh.vx + clamp(dx, -2, 2) * .82, -1.05, 1.05);
    slosh.vz = clamp(slosh.vz + clamp(dz, -2, 2) * .82, -1.05, 1.05);
  }

  function reset() {
    h.fill(0); v.fill(0); slosh.x = slosh.z = slosh.vx = slosh.vz = 0;
    deepH.fill(0); deepV.fill(0); flowX.fill(0); flowZ.fill(0);
    pressureBase.fill(0); pressureMove.fill(0); contactWeight.fill(0);
    deepEnabled = false; moveAge = 10; releaseAge = 1; releasePressure = 0;
    Object.assign(deep, {active: false, x: 0, z: 0, localDepth: 0, targetDepth: 0, pressure: 0,
      vx: 0, vz: 0, speed: 0, dirX: 1, dirZ: 0, contacts: 0, moves: 0});
    accumulator = 0; steps = 0; disturbances = 0; simulatedTime = 0; publish();
  }

  function getState() {
    const flow = sampleFlow(deep.x, deep.z), motionFade = Math.exp(-moveAge / .16);
    return {size, spacing, fixedDt, waveSpeed: speed, simulatedTime, amplitude, maxHeight,
      minHeight, maxSlope, energy, steps, disturbances, slosh: {...slosh}, deep: {...deep,
        vx: deep.vx * motionFade, vz: deep.vz * motionFade, speed: deep.speed * motionFade,
        contactHeight: flow.height, contactDepth: Math.max(0, -flow.height), amplitude: deepAmplitude,
        energy: deepEnergy, maxFlowSpeed, flow: {x: flow.x, z: flow.z, speed: flow.speed}}};
  }
  publish();
  return {data, size, step, disturb, rock, reset, getState, beginStir, moveStir, endStir, sampleFlow};
}
