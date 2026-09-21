// Visuals only. Device state and gesture-to-command mapping stay in the host page.
export function createNebulaVisuals(THREE) {
  const root = new THREE.Group();
  const uniforms = {
    uTime: { value: 0 }, uEnergy: { value: 0 }, uDrag: { value: 0 },
    uPulse: { value: 0 }, uDirection: { value: 1 }, uMini: { value: 0 },
    uPixels: { value: 500 }, uMotion: { value: 1 },
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  uniforms.uMotion.value = reducedMotion ? .2 : 1;
  let previousPulse = 0;
  let pulseStartedAt = -10000;
  let seed = 73421;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const vertexShader = `
    attribute vec4 aSeed;
    attribute float aKind;
    uniform float uTime, uEnergy, uDrag, uPulse, uDirection, uMini, uPixels, uMotion;
    varying vec3 vColor;
    varying float vAlpha, vKind, vGlint;
    mat2 rotate2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    void main() {
      vec3 p = position;
      float radius = length(p);
      float time = uTime * uMotion;
      float speed = .07 + .14 / (.3 + radius);
      p.xz = rotate2(time * speed + sin(time * .27 + aSeed.x * 6.28) * .06) * p.xz;
      p.y += sin(p.x * 3.4 + time * .45 + aSeed.x * 6.28) * .045;
      float waveRadius = uDirection > 0. ? (1. - uPulse) * 2.7 : uPulse * 2.7;
      float wave = exp(-pow((radius - waveRadius) * 5., 2.)) * uPulse;
      p += normalize(p + .001) * (wave * .12 + sin(time + radius * 4.) * .008);
      p.xz = rotate2(uDrag * .12 * sin(radius * 4. + time)) * p.xz;
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_Position = projectionMatrix * mv;
      float bright = pow(uEnergy, 1.25);
      vec3 cool = mix(vec3(.18,.45,.68), vec3(.28,.70,.76), aSeed.z);
      vec3 warm = mix(vec3(1.,.24,.025), vec3(1.,.68,.25), aSeed.z);
      vec3 ion = mix(vec3(.18,.57,.66), vec3(.64,.88,1.), aSeed.z);
      vec3 lit = mix(warm, ion, smoothstep(1.1,1.6,radius) * step(.35,aSeed.z));
      float center = 1. - smoothstep(.08, .55, radius);
      lit = mix(lit, vec3(1.,.88,.61), center * .85);
      vColor = mix(cool, lit, bright);
      vColor = mix(vColor, warm, uMini * .95);
      vColor += wave * vec3(.6,.45,.23);
      float twinkle = .76 + .24 * sin(time * (1. + aSeed.x * 1.5) + aSeed.y * 40.);
      float fade = 1. - smoothstep(1.5, 2.3, radius);
      vAlpha = (.45 + uEnergy * .72 + uMini * .24 + wave * .5) * twinkle * fade;
      float size = mix(.016, .041, pow(aSeed.y, 3.));
      if (aKind > .5 && aKind < 1.5) {
        size = mix(.16, .38, aSeed.y);
        vAlpha *= .043 + uEnergy * .033;
      }
      if (aKind > 1.5) {
        size = .032 + aSeed.y * .035;
        vAlpha *= 1.25;
      }
      size *= (1. + uMini * .65 + wave * .8) * length(modelMatrix[0].xyz);
      gl_PointSize = clamp(size * uPixels / max(.1, -mv.z), 1., 90.);
      vAlpha *= clamp(size * uPixels / max(.1, -mv.z), .15, 1.);
      vKind = aKind;
      vGlint = step(.975, aSeed.w) * (.15 + uEnergy * .85);
    }
  `;
  const fragmentShader = `
    varying vec3 vColor;
    varying float vAlpha, vKind, vGlint;
    void main() {
      vec2 uv = gl_PointCoord * 2. - 1.;
      float r2 = dot(uv, uv);
      if (r2 > 1.) discard;
      float light = exp(-r2 * 7.) * .60 + exp(-r2 * 28.) * .72;
      if (vKind > .5 && vKind < 1.5) light = exp(-r2 * 4.) * .55;
      float spike = exp(-abs(uv.x) * 45.) * exp(-abs(uv.y) * 3.5)
                  + exp(-abs(uv.y) * 45.) * exp(-abs(uv.x) * 3.5);
      light += spike * vGlint * .18;
      float edge = 1. - smoothstep(.62, 1., r2);
      gl_FragColor = vec4(vColor, light * vAlpha * edge);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  // Interleaved spiral filaments, diffuse dust, and a sparse outer particle halo.
  const count = 11800;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const kinds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x, y, z;
    let kind = 0;
    if (i < 7300) {
      const lane = i % 5;
      const t = random();
      const radius = .10 + Math.pow(t, .8) * 1.57;
      const angle = lane / 5 * Math.PI * 2 + t * 5.9 + (random() - .5) * (.16 + t * .32);
      const width = (random() + random() - 1) * (.025 + radius * .095);
      x = Math.cos(angle) * (radius + width);
      z = Math.sin(angle) * (radius + width);
      y = Math.sin(angle * 1.6 + lane) * radius * .25 + (random() + random() - 1) * (.04 + radius * .10);
      const tilt = (lane - 2) * .40;
      const vertical = y * Math.cos(tilt) - z * Math.sin(tilt);
      z = y * Math.sin(tilt) + z * Math.cos(tilt);
      y = vertical;
    } else if (i < 9100) {
      kind = 1;
      const r = .16 + Math.pow(random(), .65) * 1.30;
      const a = random() * Math.PI * 2;
      const h = random() * 2 - 1;
      const flat = Math.sqrt(1 - h * h);
      x = Math.cos(a) * r * flat;
      y = h * r * .62;
      z = Math.sin(a) * r * flat;
    } else if (i < 11000) {
      const r = .4 + Math.pow(random(), .66) * 1.77;
      const a = random() * Math.PI * 2;
      const h = random() * 2 - 1;
      const flat = Math.sqrt(1 - h * h);
      x = Math.cos(a) * r * flat;
      y = h * r;
      z = Math.sin(a) * r * flat;
    } else {
      kind = 2;
      const band = i % 3;
      const a = random() * Math.PI * 2;
      const radius = 1.42 + band * .19 + (random() - .5) * .02;
      x = Math.cos(a) * radius;
      y = Math.sin(a) * radius * (.24 + band * .18);
      z = Math.sin(a) * radius * .55;
      const tilt = band * .94 - .85;
      const nx = x * Math.cos(tilt) - y * Math.sin(tilt);
      y = x * Math.sin(tilt) + y * Math.cos(tilt);
      x = nx;
    }
    positions.set([x, y, z], i * 3);
    seeds.set([random(), random(), random(), random()], i * 4);
    kinds[i] = kind;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, transparent: true,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  root.add(stars);

  // A feathered stellar nucleus rather than an opaque sphere surface.
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2. - 1.;
        vec4 center = modelViewMatrix * vec4(0., 0., 0., 1.);
        float scale = length(modelMatrix[0].xyz);
        center.xy += position.xy * scale;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform float uEnergy, uPulse, uMini;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float nucleus = exp(-r*r*150.);
        float corona = exp(-r*9.) * .42;
        float flare = exp(-abs(vUv.y)*100.) * exp(-abs(vUv.x)*5.) * .08 * uEnergy;
        vec3 color = mix(vec3(.12,.51,.63), vec3(1.,.65,.27), max(uEnergy, uMini*.75));
        color = mix(color, vec3(1.,.97,.82), nucleus * uEnergy);
        float alpha = (nucleus + corona + flare) * (.30 + uEnergy * .60 + uPulse * .09);
        gl_FragColor = vec4(color, alpha * (1.-smoothstep(.65,1.,r)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const nucleus = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), glowMaterial);
  nucleus.frustumCulled = false;
  root.add(nucleus);

  return {
    root,
    update({ time, energy, drag, pulse, direction, mini, renderer, camera, height }) {
      if (pulse > previousPulse + .18) pulseStartedAt = time;
      previousPulse = pulse;
      const ripple = Math.max(0, 1 - (time - pulseStartedAt) / 850);
      uniforms.uTime.value = time * .001;
      uniforms.uEnergy.value = energy;
      uniforms.uDrag.value = Math.min(1.8, drag);
      uniforms.uPulse.value = reducedMotion ? ripple * .25 : ripple;
      uniforms.uDirection.value = direction;
      uniforms.uMini.value = mini;
      uniforms.uPixels.value = height * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
    },
  };
}
