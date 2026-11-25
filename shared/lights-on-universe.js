/* Cinematic lighting visualization. No network or device controls.
 * WebGL scaffold and hash adapted from Kartik Kabadi / blackhole (MIT),
 * commit 524af127e7a7a733f244f14d805a82398dcc1a1e.
 * Source: https://github.com/kartikkabadi/blackhole
 * Custom artistic lens halo, ray-marched volumetric dust, state-driven lighting,
 * adaptive resolution, lifecycle management and compatibility rendering.
 *
 * MIT License
 *
 * Copyright (c) 2026 Kartik Kabadi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  let noisePixels;
  function getNoisePixels() {
    if (noisePixels) return noisePixels;
    let seed = 13211;
    function random() {
      seed = seed * 16807 % 2147483647;
      return seed / 2147483647;
    }
    const side = 128;
    const values = Uint8Array.from({length: side * side}, () => Math.floor(random() * 256));
    const pixels = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const offset = (y * side + x) * 4;
      pixels[offset] = values[y * side + x];
      pixels[offset + 1] = values[((y + 17) % side) * side + (x + 37) % side];
      pixels[offset + 3] = 255;
    }
    noisePixels = pixels;
    return pixels;
  }
  // WebGL 1 has no 3D textures. Bake the billows and their light transport into
  // guttered XZ slices, so one trilinear sample carries both shape and shadow.
  const cloudSide = 96, cloudSlices = 32, cloudTile = cloudSide + 2;
  let cloudAtlas;
  function getCloudAtlas() {
    if (cloudAtlas) return cloudAtlas;
    const side = cloudSide, plane = side * side;
    const mass = new Float32Array(plane * cloudSlices);
    let seed = 54901;
    function random() { seed = seed * 16807 % 2147483647; return seed / 2147483647; }
    function wrap(x) { return (x + side) % side; }
    function billow(cx, cy, cz, rx, ry, rz) {
      for (let y = Math.max(0, Math.ceil(cy - ry)); y <= Math.min(cloudSlices - 1, cy + ry); y++) {
        const section = 1 - ((y - cy) / ry) ** 2;
        for (let z = Math.ceil(cz - rz); z <= cz + rz; z++) {
          const row = section - ((z - cz) / rz) ** 2;
          if (row <= 0) continue;
          const span = Math.sqrt(row) * rx, start = y * plane + wrap(z) * side;
          for (let x = Math.ceil(cx - span); x <= cx + span; x++) {
            const i = start + wrap(x);
            const value = Math.min(1, (row - ((x - cx) / rx) ** 2) * 1.6);
            mass[i] = Math.max(mass[i], value);
          }
        }
      }
    }
    // Each parent has a low, broad base and successively smaller turrets on
    // its flanks. Gaps between families let the light cut deep into a bank.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
      const cx = (col + .12 + random() * .76) * side / 5;
      const cz = (row + .10 + random() * .80) * side / 5;
      const height = 3.0 + random() * 11, radius = 7.2 + random() * 3.8;
      const crown = 4.5 + random() * 5.5, angle = random() * TAU;
      billow(cx, height - 1, cz, radius * 1.48, crown, radius * 1.28);
      billow(cx, height + crown * .44, cz, radius * .85, crown * 1.09, radius * .88);
      const count = 5 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const phi = angle + TAU * (i + .36 * random()) / count;
        const r = radius * (.57 + .43 * random());
        const x = cx + r * Math.cos(phi), z = cz + r * Math.sin(phi);
        const head = radius * (.42 + .33 * random());
        const y = height + crown * (.12 + .66 * random());
        billow(x, y, z, head * 1.08, head * (1 + random() * .35), head);
        const daughter = head * (.40 + .24 * random());
        billow(x + head * .59 * Math.cos(phi + .5), y + head * .47,
          z + head * .59 * Math.sin(phi + .5), daughter, daughter * 1.16, daughter);
        // Cluster small rounded turrets on the face and summit of this head.
        // They participate in the same extinction and cast their own shadows.
        for (let tip = 0; tip < 4; tip++) {
          const az = phi + tip * 1.63;
          const lift = .45 + .20 * Math.sin(az * 3.1);
          const knob = head * (.37 + .10 * Math.cos(az * 2.4));
          billow(x + head * .77 * Math.cos(az), y + head * lift,
            z + head * .77 * Math.sin(az), knob, knob * 1.22, knob);
        }
      }
    }
    const width = cloudTile * 8, output = new Uint8Array(width * cloudTile * 4 * 4);
    // March sunlight and skylight once, including the cloud casting the shadow.
    // Horizontal addressing repeats, including filtering at every atlas seam.
    const sun = new Float32Array(mass.length), sky = new Float32Array(mass.length);
    for (let y = cloudSlices - 1; y >= 0; y--) {
      const above = Math.min(y + 1, cloudSlices - 1) * plane;
      const below = Math.max(0, y - 1) * plane;
      for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
        const j = z * side + x, i = y * plane + j, rho = mass[i];
        const back = wrap(z - 1) * side, right = wrap(x + 1);
        const beam = y === cloudSlices - 1 ? 1 :
          .21 * sun[above + j] + .27 * sun[above + z * side + right] +
          .22 * sun[above + back + x] + .30 * sun[above + back + right];
        sun[i] = beam * Math.exp(-rho * .45);
        sky[i] = (y === cloudSlices - 1 ? 1 : sky[above + j]) * Math.exp(-rho * .28);
        const dx = mass[y * plane + z * side + wrap(x - 1)] - mass[y * plane + z * side + right];
        const dy = (mass[below + j] - mass[above + j]) * 1.20;
        const dz = mass[y * plane + back + x] - mass[y * plane + wrap(z + 1) * side + x];
        const facing = (.49 * dx + .76 * dy - .42 * dz) / Math.sqrt(dx * dx + dy * dy + dz * dz + .025);
        const px = (y % 8) * cloudTile + x + 1, pz = Math.floor(y / 8) * cloudTile + z + 1;
        const target = (pz * width + px) * 4;
        output[target] = Math.round(255 * rho);
        output[target + 1] = Math.round(255 * sun[i]);
        output[target + 2] = Math.round(255 * sky[i]);
        output[target + 3] = Math.round(127.5 * (1 + facing));
      }
      const left = (y % 8) * cloudTile, top = Math.floor(y / 8) * cloudTile;
      for (let z = -1; z <= side; z++) for (const x of [-1, side]) {
        const src = ((top + wrap(z) + 1) * width + left + wrap(x) + 1) * 4;
        const dst = ((top + z + 1) * width + left + x + 1) * 4;
        output.copyWithin(dst, src, src + 4);
      }
      for (const z of [-1, side]) {
        const src = ((top + wrap(z) + 1) * width + left + 1) * 4;
        const dst = ((top + z + 1) * width + left + 1) * 4;
        output.copyWithin(dst, src, src + side * 4);
      }
    }
    cloudAtlas = output;
    return output;
  }

  const PHASES = new Set(['idle', 'queued', 'connecting', 'running', 'verifying', 'succeeded', 'failed']);
  const VERTEX = 'attribute vec2 aPos; void main(){gl_Position=vec4(aPos,0.,1.);}';
  // Three seeded populations share a single point draw and the volume's camera.
  const GRAIN_VERTEX = `precision highp float;
attribute vec4 aGrain;
uniform vec2 uRes;
uniform float uTime, uProgress;
varying mediump vec3 vTint;
varying mediump float vLight, vDistance;
varying mediump vec4 vKernel;
void main() {
 const float tau=6.2831853072;
 float lane=fract(aGrain.x), phase=uTime/16.;
 vec3 ro=vec3(0.,.80,8.4), forward=normalize(-ro);
 vec3 up=normalize(cross(vec3(1.,0.,0.),forward));
 vec3 p;
 float life=1., breadth=1.;
 if(aGrain.x<1.) {
  // Sheared lanes bunch into asymmetrical knots, and merge again further
  // along their orbit. Their vertical dispersion follows the volumetric folds.
  float band=floor(aGrain.z*12.);
  float local=fract(aGrain.z*12.)-.5;
  float orbit=(band+.5+local*(.28+2.15*local*local))/12.;
  float angle=tau*(lane+phase*(1.+floor((1.-aGrain.z)*2.99)));
  angle+=.078*sin(7.*angle+band*1.27)+.029*sin(13.*angle-band*.65);
  float r=1.27+pow(orbit,.84)*3.63+.11*sin(3.*angle+band*.72)+.045*cos(7.*angle-band*.31);
  angle+=.34*r;
  float lift=.22*sin(angle*3.-r*1.8)+.10*sin(6.*angle+r);
  p=vec3(r*cos(angle),lift*(.42+.38*orbit)+(aGrain.y-.5)*(.12+.47*orbit),r*sin(angle));
  float exposed=.11+.89*smoothstep(.14,.75,abs(p.x)/r);
  life=(.54+.46*sin(angle+.65)*sin(angle+.65))*mix(1.,exposed,smoothstep(0.,1.,p.z));
 } else if(aGrain.x<2.) {
  // The far, lensed dust follows the variable-width shoulder of the photon
  // arc. Offset from the shadow by more than the projected sprite radius.
  float a=tau*(lane+phase*(1.+floor(aGrain.z*2.)));
  a+=.10*sin(5.*a+floor(aGrain.z*2.)*2.3);
  float shoulder=.065+.18*pow(aGrain.y,1.65)+.038*sin(a*3.+phase*tau);
  float r=1.032+shoulder*(.64+.36*pow(sin(a-.36),2.));
  p=(vec3(cos(a),0.,0.)+up*sin(a))*r;
  life=(.16+.62*smoothstep(-.27,.87,sin(a)))*(.45+.55*abs(sin(3.*a+2.1)));
  breadth=.77;
 } else {
  float travel=fract(phase*(2.+floor(3.*aGrain.z))+aGrain.y);
  float band=floor(aGrain.z*3.);
  travel+=.011*sin(tau*8.*travel+band)*sin(3.14159265*travel);
  float t=1.-travel*(.69+.31*travel);
  float path=min(t,.69), fold=sin(path*3.14159265);
  float centreX=-.29*path+(.05+band*.045)*sin(path*(5.+band)+phase*tau+band*2.)*fold+(band-1.)*.075*fold;
  float centreZ=.63+1.65*path+.22*path*path+(band-1.)*.16+(.025+band*.025)*sin(path*7.+phase*tau+band)*fold;
  float width=.33+.10*band+(.55+.22*band)*pow(t,.85);
  float filament=floor(lane*8.);
  float local=fract(lane*8.)-.5;
  float across=(filament+.5+local*(.23+1.6*local*local))/8.-.5;
  across=1.47*across+.071*sin(t*11.+phase*tau+.59*filament+band);
  p=vec3(centreX+across*width,-.91-t*2.6,centreZ+(aGrain.w-.48)*.23);
  // Far layers remain a cooler, finer dust veil; near grains retain their
  // individual highlights even where several filaments meet the cloud.
  life=smoothstep(.06,.37,travel)*(1.-smoothstep(.88,1.,travel))*(.66+.12*band);
  breadth=.86+.10*band;
 }
 vec3 ray=p-ro;
 float depth=dot(ray,forward), focal=sqrt(dot(ro,ro)-1.);
 vec2 view=vec2(ray.x,dot(ray,up))*focal/depth;
 float roll=.49+.004*sin(phase*tau);
 float c=cos(roll), s=sin(roll);
 vec2 screenView=mat2(c,s,-s,c)*view;
 float aspect=uRes.x/uRes.y, framing=min(.38,aspect*.44);
 vec2 ndc=(screenView*framing+vec2(-.06*aspect,.24))/vec2(aspect,1.);
 gl_Position=vec4(ndc,0.,1.);
 vec3 dir=normalize(ray);
 float closest=clamp(-dot(ro,dir),0.,length(ray));
 float visible=smoothstep(.998,1.045,length(ro+dir*closest));
 float mass=pow(aGrain.w,4.6);
 // Convolve each projected grain with a pixel footprint. At a small render
 // size the wider kernel receives the same integrated energy as the tiny core.
 float sigma=uRes.y*framing*.5*focal/depth*(.0044+.0077*mass)*breadth;
 vec2 intrinsic=vec2(1.,5.4)*sigma*sigma;
 vec2 variance=intrinsic+vec2(.19);
 gl_PointSize=clamp(ceil(5.65*sqrt(variance.y)),3.,48.);
 vKernel=vec4(.125*gl_PointSize*gl_PointSize/variance,intrinsic/variance);
 vTint=mix(vec3(.65,.65,.95),vec3(1.,.66,.42),aGrain.z);
 vTint=mix(vTint,vec3(1.,.9,.75),mass*.77);
 vLight=visible*life*(.56+.42*mass)*(.48+.52*uProgress);
 vDistance=length(p);
}`;
  const GRAIN_FRAGMENT = `precision mediump float;
uniform sampler2D uHeat;
varying mediump vec3 vTint;
varying mediump float vLight, vDistance;
varying mediump vec4 vKernel;
void main() {
 vec2 d=gl_PointCoord*2.-1.;
 float r2=dot(d,d);
 vec2 shape=exp(-r2*vKernel.xy)*vKernel.zw;
 float wave=texture2D(uHeat,vec2(vDistance/6.,.5)).r;
 vec3 colour=mix(vTint,vec3(1.,.91,.75),wave*.9);
 gl_FragColor=vec4(colour*(shape.x+.065*shape.y)*vLight*(.91+1.44*wave),0.);
}`;

  const orbitGrains = 2560, haloGrains = 640, streamGrains = 1280;
  const grainCount = orbitGrains + haloGrains + streamGrains;
  function makeGrainSeeds() {
    const seeds = new Float32Array(grainCount * 4);
    let state = 43783;
    for (let i = 0; i < seeds.length; i++) {
      state = state * 16807 % 2147483647;
      seeds[i] = state / 2147483647;
    }
    for (let i = orbitGrains; i < grainCount; i++) {
      seeds[i * 4] += i < orbitGrains + haloGrains ? 1 : 2;
    }
    return seeds;
  }

  const FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform sampler2D uNoise;
uniform sampler2D uCloudVolume, uHeat;
uniform float uSuccess,uProgress,uFailed;
uniform float uImpacts[9];
float hash13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;vec2 v=texture2D(uNoise,(uv+.5)/128.).rg;return mix(v.x,v.y,f.z);}
float fbm(vec3 p){float n=.53*noise3(p);p=p*2.02+17.3;n+=.27*noise3(p);p=p*2.04+11.7;n+=.13*noise3(p);p=p*2.01+7.2;n+=.07*noise3(p);return n;}
mat2 turn(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 aces(vec3 c){return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);}
vec2 sphereSpan(vec3 ro,vec3 rd,float radius){
 float b=dot(ro,rd),c=dot(ro,ro)-radius*radius,d=b*b-c;
 if(d<0.)return vec2(1e4,-1e4);
 float s=sqrt(d);return vec2(-b-s,-b+s);
}
float loopNoise(vec3 p,float distance){
 float phase=fract(uTime/16.),blend=phase*phase*(3.-2.*phase);
 return mix(noise3(p+vec3(0.,phase*distance,0.)),
            noise3(p+vec3(0.,(phase-1.)*distance,0.)),blend);
}

// One material coordinate runs up the curtain, around the lower lip and into
// the near disk. Four unequal condensations travel 6.8 world units per loop;
// their phase and identity survive both handoffs rather than restarting there.
float feedKnot(float distance,float across){
 float phase=distance*.9239978393-uTime*.3926990817;
 float crest=phase*4.+.27*sin(phase)+.16*sin(phase*3.);
 float knot=pow(.5+.5*cos(crest+across*.18),8.);
 float identity=.52+.48*noise3(vec3(cos(phase)*2.1,sin(phase)*2.1,5.7));
 float lane=.48+.52*exp(-pow((across-.22*sin(phase*3.))/.48,2.));
 return knot*identity*lane;
}

// x extinction, y equatorial hot fibers, z equatorial sparks, w rising stream.
// The ring, reservoir and curtain are actual world-space volumes. Their light
// can only be integrated before the central opaque sphere's near intersection.
vec4 matter(vec3 p){
 float radial=length(p.xz),phi=uTime*.3926990817;
 if(radial>6.2||p.y>1.15||p.y<-3.8)return vec4(0.);
 float density=0.,plasma=0.,spark=0.,stream=0.;
 if(radial>1.20&&abs(p.y)<1.15){
  float rim=smoothstep(1.20,1.42,radial)*(1.-smoothstep(5.0,6.2,radial));
  float a=atan(p.z,p.x);
  float spin=phi+.19*radial+.20*sin(phi*2.-radial*.6);
  vec2 orbit=turn(spin)*p.xz;
  vec3 q=vec3(orbit.x*2.1,p.y*5.1,orbit.y*2.1);
  float n=fbm(q+vec3(2.4,0.,7.1));
  float warp=.045*sin(a*3.+radial*1.7-phi*2.)+.032*(n-.5);
  float height=p.y-warp;
  float vertical=exp(-pow(abs(height)/(.035+radial*.009),1.65));
  float clumps=smoothstep(.25,.74,n);
  density=rim*vertical*(.018+clumps*.32)*exp(-max(radial-2.0,0.)*1.6);
  float fine=noise3(q*3.7+vec3(0.,sin(phi)*.28,0.));
  // Knotted condensate extends above and below the hot equator. Its large
  // folds rotate along the orbit, with a thinner, luminous sunward skin.
  float fold=.22*sin(a*3.+spin*2.-radial*1.8)+.12*sin(a*6.+spin-radial);
  float h=(height-fold*.74-(n-.5)*.51)/(.22+.09*radial);
  float bank=exp(-h*h*2.2)*smoothstep(1.28,1.75,radial)*(1.-smoothstep(3.75,5.35,radial));
  // Near-side shoulders catch the light while the central sightline opens
  // through the dust, leaving the dark horizon and hot spine legible.
  bank*=mix(1.,smoothstep(.14,.76,abs(p.x)/radial),smoothstep(0.,1.,p.z));
  float lace=noise3(q*1.63+vec3(3.*n,fine,2.*n));
  float condensate=smoothstep(.28,.73,n+.32*(lace-.5));
  // Narrow folds catch grazing light on the lit skin. Dense knots absorb
  // the light behind them; the smaller caustics share the same flowing noise.
  float vein=1.-smoothstep(.015,.14,abs(lace+.24*(fine-.5)-.51));
  float thinRim=vein*vein*(.36+.64*fine);
  density+=bank*condensate*.89;
  float fibres=pow(.5+.5*sin(17.*radial+6.*n+5.*lace+2.*a),4.);
  float skin=bank*(.15+.85*condensate)*(.22+.78*smoothstep(.28,.78,lace));
  float fibers=pow(.5+.5*sin(radial*36.+n*10.+fine*3.),5.);
  float thin=exp(-abs(height)/(.016+radial*.003));
  float inner=exp(-abs(radial-1.60)*1.65);
  float whiteRidge=exp(-pow((radial-1.52-(n-.5)*.10)/.13,2.));
  plasma=rim*thin*(.025+fibers*.48+fine*fine*.17+whiteRidge*.40)*inner;
  plasma+=skin*(.007+.048*fibres+.055*thinRim)*(.35+.65*inner);
  // The incoming stream spreads radially and loses contrast as it joins the
  // disk's shear. Its first material coordinate is the end of the lower bend.
  float diskTravel=mod(a-2.7312+6.2831853072,6.2831853072);
  if(diskTravel<1.30){
   float spread=.105+.34*smoothstep(0.,1.15,diskTravel);
   float across=(radial-(1.58+.23*diskTravel))/spread;
   float merge=exp(-across*across*1.5)*(1.-smoothstep(.22,1.30,diskTravel));
   float carried=feedKnot(1.91637+diskTravel*1.58,across);
   plasma+=merge*thin*(.10+carried*1.35)*(.75+.25*n);
  }
  vec3 grainCell=floor(q*3.2),grainOffset=fract(q*3.2)-.5;
  spark=step(.993,hash13(grainCell+9.3))*exp(-dot(grainOffset,grainOffset)*130.)*rim*vertical;
 }
 // Curved sheet converging from the right-hand cloud crest into the lower lip.
 float t=(-p.y-.91)/2.60;
 if(t>=0.&&t<1.16){
  float cap=smoothstep(-.05,.045,t)*(1.-smoothstep(1.02,1.16,t));
  for(int layer=0;layer<3;layer++){
   float k=float(layer),pathT=min(t,.69),fold=sin(pathT*3.14159265);
   float centreX=-.29*pathT+(.05+k*.045)*sin(pathT*(5.+k)+phi+k*2.)*fold;
   centreX+=(k-1.)*.075*fold;
   float centreZ=.63+1.65*pathT+.22*pathT*pathT+(k-1.)*.16+(.025+k*.025)*sin(pathT*7.+phi+k)*fold;
   float halfWidth=(.33+.10*k)+(.55+.22*k)*pow(max(t,0.),.85);
   float x=(p.x-centreX)/halfWidth;
   float z=(p.z-centreZ)/(.23+.10*t);
   float sheet=exp(-z*z*1.9)*(1.-smoothstep(.64,1.06,abs(x)));
   if(sheet>.003){
    float flowing=loopNoise(vec3(x*6.5,t*13.,z*.15+k*11.),12.);
    float grainFlow=loopNoise(vec3(x*24.+flowing*1.4,t*10.,sin(phi)*.15+k*17.),16.);
    float fibers=pow(max(0.,1.-abs(grainFlow-.51)*5.),7.);
    float beads=.40+.60*flowing;
    float veinX=(.20+k*.045)*sin(t*5.+phi+k*1.8)+.11*sin(t*11.+phi*2.+k);
    float veinWidth=.090+k*.035+.017*sin(t*9.+phi*2.);
    float vein=exp(-pow((x-veinX)/veinWidth,2.));
    vein+=exp(-pow((x+veinX*.60+.30)/.044,2.))*.34;
    float weight=layer==1?.58:layer==2?.78:1.;
    float carried=feedKnot(-t*3.05,x);
    stream+=sheet*cap*weight*(.10+fibers*.20*beads+flowing*flowing*.15+vein*(.40+.18*flowing)+carried*(.65+vein*.85))*.62;
    density+=sheet*cap*weight*(.035+flowing*.055);
   }
  }
 }
 // A front-side ribbon curves around the opaque sphere. This is a real
 // volume, clipped by the same near-sphere depth as every other gas sample.
 // Its increasing cross-section changes a narrow rising vein into disk shear.
 if(p.y<.12&&p.y>-1.75&&p.x<.30&&p.x>-2.1){
  float bend=atan(-p.x,-p.y);
  if(bend>-.12&&bend<1.68){
   float angle=clamp(bend,0.,1.570796327);
   float radius=.91+.54*smoothstep(0.,1.570796327,angle);
   float width=.075+.125*smoothstep(0.,1.570796327,angle);
   float across=(length(p.xy)-radius)/width;
   float centreZ=.63+.10*sin(angle*2.);
   float z=(p.z-centreZ)/(.235+.055*sin(angle));
   float body=exp(-across*across*1.45-z*z*1.5);
   float ends=smoothstep(-.12,.045,bend)*(1.-smoothstep(1.43,1.68,bend));
   if(body>.003){
    float distance=angle*1.22;
    float carried=feedKnot(distance,across);
    float folds=loopNoise(vec3(across*5.,distance*4.,z*.5+18.),9.);
    float silk=.18+.82*pow(max(0.,1.-abs(folds-.52)*3.2),3.);
    float threads=.22+.78*pow(.5+.5*sin(across*18.+folds*5.),6.);
    stream+=body*ends*(.075+silk*.18+carried*(.38+threads*.90));
    density+=body*ends*(.028+folds*.045);
   }
  }
 }
 return vec4(density,plasma,spark,stream);
}
float coarseDust(vec3 p){
 float radial=length(p.xz),phi=uTime*.3926990817,d=0.;
 if(radial>6.2||p.y>1.15||p.y<-3.8)return 0.;
 if(radial>1.20&&abs(p.y)<1.15){
  float rim=smoothstep(1.20,1.42,radial)*(1.-smoothstep(5.,6.2,radial));
  vec2 orbit=turn(phi+.19*radial+.20*sin(phi*2.-radial*.6))*p.xz;
  vec3 q=vec3(orbit.x*2.1,p.y*5.1,orbit.y*2.1)+vec3(2.4,0.,7.1);
  float n=.66*noise3(q)+.34*noise3(q*2.02+17.3);
  float a=atan(p.z,p.x),spin=phi+.19*radial+.20*sin(phi*2.-radial*.6);
  float fold=.22*sin(a*3.+spin*2.-radial*1.8)+.12*sin(a*6.+spin-radial);
  float h=(p.y-fold*.74-(n-.5)*.51)/(.22+.09*radial);
  float bank=exp(-h*h*2.2)*smoothstep(1.28,1.75,radial)*(1.-smoothstep(3.75,5.35,radial));
  // Near-side shoulders catch the light while the central sightline opens
  // through the dust, leaving the dark horizon and hot spine legible.
  bank*=mix(1.,smoothstep(.14,.76,abs(p.x)/radial),smoothstep(0.,1.,p.z));
  d=bank*smoothstep(.28,.73,n)*.89;
  d+=rim*exp(-pow(abs(p.y)/(.035+radial*.009),1.65))*(.018+smoothstep(.25,.74,n)*.32)*exp(-max(radial-2.0,0.)*1.6);
 }
 return d;
}
float waveHeat(float radius){return texture2D(uHeat,vec2(radius/6.,.5)).r;}
float thermalPackets(float angle,float radial){
 float heat=0.;
 for(int j=0;j<9;j++){
  float age=uImpacts[j];
  if(age>=0.&&age<3.8){
   float life=sin(age/3.8*3.14159265),front=float(j)*1.83-age*2.25;
   heat+=exp(-(1.-cos(angle-front))*17.)*exp(-abs(radial-(1.65+age*.4))*2.4)*life*.34;
  }
 }
 return min(heat,1.2);
}

// The apparent bent far-disk image has a shared world-space virtual-image depth.
// It is composited at that depth DURING integration and is absorbed by near gas.
vec3 lensImage(vec2 p,float critical,float pixel,float progress,float power,vec3 hot,vec3 copper){
 float r=length(p),edge=r-critical;
 if(edge<-.002||edge>1.35)return vec3(0.);
 float a=atan(p.y,p.x),phi=uTime*.3926990817;
 vec2 orbit=turn(phi)*vec2(cos(a),sin(a));
 float n=fbm(vec3(orbit*2.1,max(edge,0.)*13.5));
 float fine=noise3(vec3(orbit*3.8,max(edge,0.)*57.-sin(phi)*.8));
 float upper=.30+.70*smoothstep(-.18,.25,p.y);
 float approaching=.45+1.15*pow(.5-.5*cos(a),1.65);
 float breadth=.15+.16*progress;
 float envelope=exp(-max(edge,0.)/breadth)*exp(-edge*edge*2.);
 float filaments=pow(smoothstep(.28,.75,fine),1.4);
 float imageDensity=.08+n*.24+fine*.05+filaments*.21;
 float packet=thermalPackets(a,1.65+max(edge,0.)*1.2)+waveHeat(1.03+max(edge,0.)*1.4)*.30;
 float shoulder=exp(-pow((a-2.26)*3.2,2.));
 vec3 outerWarm=mix(hot,vec3(1.26,.54,.49),progress*.74*smoothstep(.035,.36,edge));
 vec3 lensHot=mix(outerWarm,vec3(1.20,1.46,1.76),progress*shoulder*.57);
 vec3 col=lensHot*envelope*imageDensity*upper*approaching*(power+packet*2.2)*.67;
 col+=copper*pow(n,2.)*envelope*upper*.12*power;
 float photon=exp(-abs(edge)/max(.006,pixel*.8));
 col+=lensHot*photon*(.42+.58*upper)*approaching*(power+packet)*1.3;
 col+=vec3(.025,.056,.105)*exp(-abs(edge-.025)*65.)*upper*power;
 // Only a faint bent image of the incoming material lives at this image
 // depth; the clearly moving ribbon itself is integrated in the near volume.
 float bend=atan(-p.x,-p.y);
 if(bend>0.&&bend<1.60){
  float spread=.055+.15*smoothstep(0.,1.60,bend);
  float carried=feedKnot(bend*1.22,edge/spread);
  float trail=exp(-max(edge,0.)/spread)*(1.-smoothstep(1.25,1.60,bend));
  col+=mix(copper,hot,.45)*trail*carried*power*.19;
 }
 return col;
}
// A thin-lens map stretches the same distant star field into tangential arcs.
// The radial and tangential footprints filter subpixel stars as the lens bends them.
vec3 skyPoints(vec2 source, vec2 radial, vec2 footprint, float cells,
               float density, float seed, float intensity) {
 vec2 field = source*cells + vec2(seed*3.9,seed*1.6);
 vec2 cell = floor(field);
 if(hash13(vec3(cell,seed))>density)return vec3(0.);
 vec2 centre = .23 + .54*vec2(hash13(vec3(cell,seed+2.)),hash13(vec3(cell,seed+5.)));
 vec2 delta = fract(field)-centre;
 float energy = hash13(vec3(cell,seed+13.));
 float width = .033+.034*energy*energy;
 vec2 offsets = vec2(dot(delta,radial),dot(delta,vec2(-radial.y,radial.x)));
 vec2 beam = cells*footprint*.42;
 vec2 variance = vec2(width*width)+beam*beam;
 float radiance = exp(-.5*dot(offsets*offsets,1./variance))*width*width*inversesqrt(variance.x*variance.y);
 float colour = hash13(vec3(cell,seed+17.));
 vec3 tint = mix(vec3(.40,.58,1.),vec3(1.,.64,.51),colour);
 return tint*radiance*(.21+1.50*energy*energy*energy)*intensity;
}
vec3 gravitySky(vec2 view,float pixel){
 float radius = max(length(view),.8);
 vec2 radial = view/radius;
 float inverseRadius2 = 1./(radius*radius);
 float bend = 1.58*inverseRadius2;
 float twist = inverseRadius2*(.15+.034*sin(uTime*.3926990817-radius));
 vec2 source = turn(twist)*(view*(1.-bend));
 vec2 sourceAxis = turn(twist)*radial;
 vec2 footprint = pixel*vec2(1.+bend,max(.018,abs(1.-bend)));
 float lane = source.y-.10*source.x-.22*sin(source.x*.8);
 float haze = exp(-lane*lane*1.5);
 float clouds = fbm(vec3(source*1.8+3.8,2.1));
 float veil = haze*smoothstep(.42,.78,clouds);
 vec3 dustColour=mix(vec3(.014,.025,.050),vec3(.062,.019,.040),clouds);
 vec3 sky = vec3(.00115,.00146,.00255)+dustColour*veil;
 sky+=skyPoints(source,sourceAxis,footprint,24.,.105+.16*haze,13.,.46);
 sky+=skyPoints(source,sourceAxis,footprint,10.7,.092+.095*veil,39.,.73);
 sky+=skyPoints(source,sourceAxis,footprint,4.5,.062,62.,.90);
 return sky;
}

// Four staggered sheets of nearby dust travel towards the camera. Fading in at
// the back and out at the near plane lets the camera keep moving through a loop.
vec3 flightDust(vec2 view,float pixel,float depthLimit){
 vec3 sum=vec3(0.);
 float cycle=uTime/16.;
 float r=length(view);
 vec2 radial=view/max(r,.001), tangent=vec2(-radial.y,radial.x);
 for(int layer=0;layer<4;layer++){
  float k=float(layer),age=fract(cycle+k*.25);
  float z=mix(1.48,.34,age);
  if(z>depthLimit)continue;
  vec2 cellUv=view*(z*2.8)+vec2(k*14.79+7.13,k*18.31+9.77);
  vec2 cell=floor(cellUv);
  float seed=hash13(vec3(cell,18.+k));
  if(seed>.11)continue;
  vec2 centre=.24+.52*vec2(hash13(vec3(cell,33.+k)),hash13(vec3(cell,65.+k)));
  vec2 delta=fract(cellUv)-centre;
  float physical=.011+.010*(seed/.11);
  float width=max(physical,pixel*z*2.8*.57);
  float lengthAlong=width*(1.+min(r*.37,1.7)*age);
  vec2 streak=vec2(dot(delta,radial)/lengthAlong,dot(delta,tangent)/width);
  float grain=exp(-.5*dot(streak,streak))*physical*physical/(width*lengthAlong);
  float life=smoothstep(.0,.17,age)*(1.-smoothstep(.81,1.,age));
  vec3 tint=mix(vec3(.58,.73,1.),vec3(1.,.72,.56),hash13(vec3(cell,79.+k)));
  sum+=tint*grain*life*(.24+.48*age)*smoothstep(1.,1.65,r);
 }
 return sum;
}

// Sample the advected cloud volume. R is condensate, G and B are integrated
// sun/sky transmittance, and A is the normal's sunward component.
vec4 billows(vec3 p,vec2 drift) {
 vec3 flow=p;flow.z-=uTime*.578125;
 vec3 land=vec3(p.x*.91,p.y*1.13,p.z*.91);
 vec3 wind=vec3(drift.x,0.,drift.y);
 float large=noise3(land+wind+3.1);
 float mid=noise3(land*2.27-wind*1.4+11.8);
 float fine=noise3(land*5.08+wind*2.1+26.3);
 // Fold strands of condensate back onto themselves at progressively finer scales.
 vec3 curl=vec3(large+mid,-large,mid)*1.42;
 vec3 crestCoord=land*9.8+curl+wind*2.6;
 float crest=noise3(crestCoord);
 float micro=noise3(crestCoord*2.13+fine*1.4);
 float rough=(large-.5)*.57+(mid-.5)*.34+(fine-.5)*.16+(crest-.5)*.10+(micro-.5)*.05;
 flow+=vec3(rough*.66+drift.x,rough,rough*.44+drift.y);
 vec2 uv=fract(flow.xz/9.25+vec2(.31,.19))*96.+1.5;
 float slice=clamp((flow.y+4.72)/3.42,0.,1.)*31.;
 vec2 layers=vec2(floor(slice),min(31.,floor(slice)+1.));
 vec4 offsets=vec4(mod(layers.x,8.),floor(layers.x/8.),mod(layers.y,8.),floor(layers.y/8.))*98.;
 vec4 coords=(uv.xyxy+offsets)/vec2(784.,392.).xyxy;
 vec4 field=mix(texture2D(uCloudVolume,coords.xy),texture2D(uCloudVolume,coords.zw),fract(slice));
 float edge=(mid-.5)*.46+(fine-.50)*.37+(crest-.5)*.21;
 float heads=smoothstep(.012,.76,field.r+edge*smoothstep(.005,.11,field.r));
 // A continuous low deck fills the ravines without closing the upper gaps.
 float bed=smoothstep(0.,.82,-3.94-flow.y+(large-.53)*.55);
 field.r=max(heads,bed*.89);
 field.g*=1.-.76*bed;
 field.b*=1.-.68*bed;
 float slope=(fine-noise3(land*5.08+wind*2.1+26.3+vec3(.32,.43,-.28)))*.66;
 slope+=(crest-noise3(crestCoord+vec3(.35,.40,-.28)))*.44;
 slope+=(micro-.5)*.16;
 field.a=clamp(field.a+slope,0.,1.);
 field.g*=clamp(.91+.70*slope+.15*(mid-.5),.27,1.);
 return field;
}
vec4 cloudOcean(vec3 ro,vec3 rd,float stopDepth,float progress,float power,vec3 sky,out vec4 nearT,out vec4 farT,out vec2 sampledDepths) {
 nearT=vec4(0.);farT=vec4(0.);sampledDepths=vec2(0.);
 if(rd.y>=-.001)return vec4(0.,0.,0.,-1.);
 float phi=uTime*.3926990817;
 vec2 drift=vec2(.22*cos(phi),.24*sin(phi));
 float first=(-1.10-ro.y)/rd.y;
 float last=min(stopDepth,min((-5.4-ro.y)/rd.y,16.0));
 if(last<=first)return vec4(0.,0.,0.,-1.);
 sampledDepths=vec2(first,last);
 // Midpoint integration keeps grazing light continuous between neighbouring
 // rays. Screen-space jitter here produces visible hatching on bright folds.
 int stride=uRes.y>=800.?12:8;
 int steps=8*stride;
 float stepSize=(last-first)/float(steps);
 float transmission=1.,surface=-1.;
 vec3 scatter=vec3(0.);
 vec3 rose=mix(vec3(.45,.12,.085),vec3(1.,.49,.39),progress);
 vec3 ivory=mix(vec3(.84,.45,.31),vec3(1.26,1.04,.92),progress);
 for(int i=0;i<96;i++){
  if(i>=steps)break;
  // Keep eight transmittance samples so filaments fade into the soft cloud
  // boundary at their own depth, rather than stopping at an opaque cutout.
  if(i==stride)nearT.x=transmission;else if(i==2*stride)nearT.y=transmission;
  else if(i==3*stride)nearT.z=transmission;else if(i==4*stride)nearT.w=transmission;
  else if(i==5*stride)farT.x=transmission;else if(i==6*stride)farT.y=transmission;
  else if(i==7*stride)farT.z=transmission;
  float depth=first+(float(i)+.5)*stepSize;
  vec3 p=ro+rd*depth;
  vec4 field=billows(p,drift);
  float density=field.r*(1.-smoothstep(9.5,15.0,depth));
  if(density<.004)continue;
  float alpha=1.-exp(-5.45*density*stepSize);
  float face=smoothstep(.32,.92,field.a);
  float direct=pow(field.g,1.45)*(.065+.935*face);
  float skyFill=field.b;
  float crown=direct*direct*skyFill;
  float feedDistance=length((p-vec3(-.20,-2.63,1.85))*vec3(.75,.64,.83));
  float feed=exp(-feedDistance*1.28);
  // Violet ambient light stays visible on the lee sides of rolling heads;
  // progressively warmer rim light models the disk shining across the crests.
  vec3 ash=mix(vec3(.0021,.0020,.0053),vec3(.019,.010,.019),skyFill);
  float altitude=smoothstep(-4.02,-2.26,p.y);
  float spill=(.14+.86*exp(-.38*feedDistance))*(.39+.61*altitude);
  vec3 light=ash*(.53+.58*power)*(.48+.52*altitude);
  light+=rose*(.008*skyFill+.19*direct)*spill*(.12+.54*power);
  light+=ivory*(.095*crown+.255*pow(crown,3.))*spill*(.048+.53*power);
  // Light permeates the thin flank before the denser central ridge.
  float flank=field.r*(1.-field.r)*field.g;
  light+=mix(vec3(.24,.23,.43),rose,.45)*flank*(.052+.074*power)*spill;
  light+=mix(rose,ivory,.53)*feed*(.034+.58*direct+.082*skyFill)*(.10+.68*power);
  float crest=waveHeat(length(p));
  light+=mix(rose,ivory,.47)*crest*(.05+.40*direct+.065*skyFill);
  scatter+=transmission*light*alpha;
  transmission*=1.-alpha;
  if(transmission<.014){surface=depth;break;}
 }
 farT.w=transmission;
 if(surface<0.&&transmission<.999)surface=last;
 return vec4(scatter+transmission*sky,surface);
}
// The foreground disk and gas use their own visibility on each ray, including
// the two subpixel rays that straddle the central shadow.
vec3 shadeRay(vec2 view,float pixel){
 float phi=uTime*.3926990817;
 vec3 ro=vec3(0.,.80,8.4);
 float cameraDistance=length(ro),focal=sqrt(cameraDistance*cameraDistance-1.);
 vec3 forward=-ro/cameraDistance,right=vec3(1.,0.,0.),up=normalize(cross(right,forward));
 vec3 rd=normalize(forward*focal+right*view.x+up*view.y);
 // With this focal length the unit sphere projects to a unit circle.
 // Factoring its discriminant preserves precision on nearly tangent rays.
 float radius=length(view);
 bool hitsCore=radius<1.;
 float chord2=focal*focal*(1.-radius)*(1.+radius)/(focal*focal+radius*radius);
 float coreDepth=-dot(ro,rd)-sqrt(max(0.,chord2));
 vec2 bounds=sphereSpan(ro,rd,7.0);
 float entry=max(0.,bounds.x),exitDepth=bounds.y;
 if(hitsCore)exitDepth=min(exitDepth,coreDepth);
 float progress=clamp(uProgress,0.,1.);
 float power=(.19+progress*1.92+progress*progress*.70)*(1.+smoothstep(.88,1.,progress)*sin(phi*2.)*.025);
 vec3 hot=mix(vec3(1.,.28,.15),vec3(1.52,1.13,.96),progress);
 vec3 copper=mix(vec3(.55,.13,.075),vec3(.94,.32,.255),progress);
 vec3 sky=vec3(0.);
 if(!hitsCore)sky=gravitySky(view,pixel);
 vec4 nearT,farT;vec2 sampledDepths;
 vec4 ocean=cloudOcean(ro,rd,hitsCore?coreDepth:1e4,progress,power,sky,nearT,farT,sampledDepths);
 if(ocean.w>0.){sky=ocean.rgb;exitDepth=min(exitDepth,ocean.w);}
 float foregroundLimit=min(hitsCore?coreDepth:1e4,ocean.w>0.?ocean.w:1e4);
 if(bounds.y>max(0.,bounds.x))foregroundLimit=min(foregroundLimit,max(0.,bounds.x));

 float planeDepth=-dot(ro,forward)/dot(rd,forward);
 vec3 planePoint=ro+rd*planeDepth;
 vec2 projected=vec2(dot(planePoint,right),dot(planePoint,up));
 float critical=cameraDistance/focal;
 vec3 farImage=vec3(0.);
 if(planeDepth>=entry&&planeDepth<exitDepth)
  farImage=lensImage(projected,critical,pixel,progress,power,hot,copper);
 float equatorDepth=abs(rd.y)>.0001?-ro.y/rd.y:-1.;
 vec3 equator=ro+rd*max(0.,equatorDepth);
 float packet=equatorDepth>0.?thermalPackets(atan(equator.z,equator.x),length(equator.xz)):0.;
 float transmittance=1.;vec3 light=vec3(0.);
 bool imageDone=false;
 if(exitDepth>entry){
  float stepSize=(exitDepth-entry)/72.;
  float jitter=.5;
  for(int i=0;i<72;i++){
   float segmentStart=entry+float(i)*stepSize;
   float depth=segmentStart+stepSize*jitter;
   if(!imageDone&&depth>=planeDepth&&planeDepth<exitDepth){
    light+=transmittance*farImage;imageDone=true;
   }
   vec3 p=ro+rd*depth;
   vec4 field=matter(p);
   if(field.x>.003||field.y>.002||field.z>.001||field.w>.001){
    float radial=length(p.xz);
    vec3 inward=normalize(-p+vec3(-.25,.10,.10));
    float toward=coarseDust(p+inward*.21);
    float rim=clamp((field.x-toward)*3.8,0.,1.),shade=exp(-toward*2.5);
    float approach=clamp(.5-.5*p.x/max(radial,.1),0.,1.);
    float beaming=.35+1.40*pow(approach,1.6);
    float innerLight=exp(-max(0.,length(p)-1.55)*.42);
    float impact=exp(-length((p-vec3(-.20,-2.20,1.85))*vec3(1.,1.25,1.))*1.55);
    float glowWidth=.15+radial*.04;
    float openLight=mix(exp(-abs(p.y)/glowWidth),exp(-abs(p.y)/(glowWidth*1.7)),progress);
    if(p.y< -1.45)openLight=.42+impact*.58;
    vec3 localHot=mix(hot,vec3(1.30,1.50,1.70),progress*pow(approach,7.)*.42);
    vec3 cloud=vec3(.0013,.0020,.0040)*(1.+progress*.40)*(1.-rim*.4);
    cloud+=copper*(.003+pow(rim,1.5)*shade*.20)*(innerLight*.55+impact*.85)*beaming*(.20+power*.53+packet*1.2)*openLight;
    cloud+=localHot*pow(rim,3.)*shade*.037*(innerLight+impact*.8)*(power+packet);
    float crest=waveHeat(length(p));
    // Shadowed cobalt folds sit behind amber and rose emissive edges.
    float bankLight=smoothstep(.16,.82,field.x)*innerLight*openLight;
    cloud+=mix(vec3(.026,.036,.095),vec3(.63,.20,.13),rim*shade)*bankLight*(.45+.65*power);
    cloud+=vec3(1.12,.55,.26)*crest*(.22+.84*rim)*shade;
    float alpha=1.-exp(-field.x*stepSize*2.6);
    vec3 emission=localHot*field.y*beaming*(power+packet*2.4)*2.3;
    emission+=localHot*field.z*(power+packet)*2.4;
    emission+=vec3(1.3,.66,.38)*crest*(field.x*.24+field.w*.66+field.y*.82);
    vec3 curtainHot=mix(copper*vec3(.90,.69,.77),hot,.15+.85*smoothstep(.13,.85,field.w));
    emission+=curtainHot*field.w*(power+packet*1.8)*1.57*(1.+clamp(uSuccess,0.,1.)*impact*.045);
    if(ocean.w>0.&&depth>sampledDepths.x){
     float bin=clamp(8.*(depth-sampledDepths.x)/(sampledDepths.y-sampledDepths.x),0.,8.);
     float visible=max(0.,1.-bin)+dot(nearT,max(vec4(0.),1.-abs(bin-vec4(1.,2.,3.,4.))))
                +dot(farT,max(vec4(0.),1.-abs(bin-vec4(5.,6.,7.,8.))));
     emission*=visible;
     alpha*=visible;
    }
    light+=transmittance*(cloud*alpha+emission*stepSize);
    transmittance*=1.-alpha;
    if(transmittance<.009)break;
   }
  }
 }
 vec3 col=light+sky*transmittance;
 // All these near grains are closer than the scene's conservative near bound.
 col+=flightDust(view,pixel,foregroundLimit);
 col*=1.-uFailed*.055;
 return col;
}
// Integrate the circular silhouette across a square framebuffer pixel. Over
// this footprint the tangent gives a triangle at the corners and a trapezoid
// in between. Its orientation is evaluated in screen coordinates before roll.
float uncoveredArea(float d,float major,float minor){
 float shoulder=.5*(major-minor);
 if(abs(d)<=shoulder)return .5+d/major;
 float tail=.5*(major+minor)-abs(d);
 float corner=tail*tail/(2.*major*max(minor,.00001));
 return d<0.?corner:1.-corner;
}
void main(){
 float aspect=uRes.x/uRes.y;
 vec2 screenUv=(gl_FragCoord.xy*2.-uRes)/uRes.y;
 float framing=min(.38,aspect*.44);
 vec2 screenView=(screenUv-vec2(-.06*aspect,.24))/framing;
 mat2 roll=turn(.49+sin(uTime*.3926990817)*.004);
 vec2 view=roll*screenView;
 float pixel=2./uRes.y/framing;
 float radius=length(screenView);
 float d=(radius-1.)/pixel;
 vec2 normalScreen=abs(screenView)/max(radius,.00001);
 float major=max(normalScreen.x,normalScreen.y),minor=min(normalScreen.x,normalScreen.y);
 float extent=.5*(major+minor);
 bool mixed=abs(d)<extent;
 float outside=mixed?uncoveredArea(d,major,minor):0.;
 float vignette=1.-smoothstep(.75,2.05,length(screenUv*vec2(1./max(aspect,.4),.78)))*.16;
 vec3 col=vec3(0.);
 for(int side=0;side<2;side++){
  if(side==1&&!mixed)break;
  vec2 sampleView=view;
  float weight=1.;
  if(mixed){
   // Sample each visible portion on its own side of the horizon. At either
   // limit the dominant sample converges back to the original pixel centre.
   float offset=side==0?-.5*(extent-d):.5*(extent+d);
   sampleView=view/radius*(1.+pixel*offset);
   weight=side==0?1.-outside:outside;
  }
  vec3 hdr=shadeRay(sampleView,pixel);
  // Resolve after tone mapping: a very bright uncovered sliver still occupies
  // only its geometric share of the output pixel.
  col+=weight*pow(aces(hdr*vignette*1.35),vec3(.4545));
 }
 float grain=(hash13(vec3(gl_FragCoord.xy,4.1))-.5)/510.;
 gl_FragColor=vec4(max(vec3(0.),col+grain),1.);
}
`;

  // The demo confirms one lamp per second. Its clock can pause or seek without
  // advancing a live controller snapshot or relying on animation callback time.
  function timelineSnapshot(seconds, completed) {
    const time = Math.max(0, Math.min(16, Number.isFinite(seconds) ? seconds : 0));
    const count = Math.max(0, Math.min(9, Math.floor(Number.isFinite(completed) ? completed : time)));
    return { seconds: time, completed: count, status: count === 9 ? 'succeeded' : count ? 'running' : 'idle' };
  }

  // Resolve only the volumetric light into the display buffer. Dust grains are
  // subsequently rasterized at the display pixel pitch, even if the gas pass
  // has scaled down to keep animation responsive on a phone.
  const RESOLVE_VERTEX = `attribute vec2 aPos;
varying vec2 uv;
void main(){uv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}`;
  const RESOLVE_FRAGMENT = `precision highp float;
uniform sampler2D uVolume;
uniform vec2 uVolumeSize;
varying vec2 uv;
void main(){
 vec2 pixel=uv*uVolumeSize-.5, f=fract(pixel);
 vec2 weight=mix(f,f*f*(3.-2.*f),.42);
 gl_FragColor=texture2D(uVolume,(floor(pixel)+weight+.5)/uVolumeSize);
}`;

  function create(host, { timeline = false, renderer, pixelBudget } = {}) {
    if (!host || typeof host.append !== 'function') throw new TypeError('A universe host is required');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.layer = 'space';
    const hadClass = host.classList.contains('lights-universe');
    host.classList.add('lights-universe');
    host.append(canvas);
    let gl;
    try { gl = canvas.getContext('webgl', { alpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:true, powerPreference:'default' }); } catch {}
    function compatibility(reason) {
      canvas.remove();host.dataset.rendererReason=reason;host.dataset.renderer='compatibility';
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      const visual=createFallback(host, undefined, timeline);
      return Object.freeze({update:visual.update,renderAt:visual.renderAt,destroy(){
        visual.destroy();if(!hadClass)host.classList.remove('lights-universe');
        delete host.dataset.renderer;delete host.dataset.rendererReason;
      }});
    }
    if (!gl) return compatibility('unavailable');
    // A software rasterizer stalls input on the volumetric ray march. The
    // Canvas renderer animates the same confirmations using cheaper geometry.
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const software = info && /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    const selectedRenderer = renderer || host.dataset.sceneRenderer || new URLSearchParams(location.search).get('sceneRenderer');
    if (software && selectedRenderer !== 'webgl') return compatibility('software');
    // An offline timeline capture can request a fixed native sample budget.
    const capturePixels = timeline && Number.isFinite(pixelBudget) && pixelBudget > 0
      ? Math.min(pixelBudget, 4096 * 2160) : 0;
    const volumeBudget = capturePixels || (software ? 100000 : 720000);
    const displayBudget = capturePixels || (software ? 100000 : 2073600);
    let resolveProgram, volumeFramebuffer, volumeColour, sizeUniform;
    let volumeWidth=0, volumeHeight=0, separateVolume=false, framebufferUnavailable=false;
    let program, buffer, texture, cloudTexture, heatTexture, shaders=[], uniforms={};
    let grainProgram, grainBuffer, grainUniforms={}, previousHeat=false;
    const heatRow = new Uint8Array(128);
    let destroyed=false, contextLost=false, fallback=null, frame=0, intersecting=true;
    let width=0, height=0, quality=1, lastPaint=-Infinity, lastTick=null, slowFrames=0;
    let heatWaveUntil=0, timelineSeconds=0, hydrated=false;
    let state={status:'idle',completed:0,currentIndex:null}, successAt=null;
    const impactTimes=Array(9).fill(-Infinity), epoch=performance.now();
    const impactAges=new Float32Array(9);
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let resizeObserver, intersectionObserver, mutationObserver;
    function allocate() {
      shaders=[];
      const compile=(type,source)=>{
        const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error('Lights visual shader: '+gl.getShaderInfoLog(shader));
        return shader;
      };
      const link=(vertex,fragment,attribute)=>{
        const p=gl.createProgram();
        gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));
        gl.bindAttribLocation(p,0,attribute);gl.linkProgram(p);
        if(!gl.getProgramParameter(p,gl.LINK_STATUS)) {
          const message=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw new Error('Lights visual link failed: '+message);
        }
        return p;
      };
      resolveProgram=link(RESOLVE_VERTEX,RESOLVE_FRAGMENT,'aPos');
      gl.useProgram(resolveProgram);
      gl.uniform1i(gl.getUniformLocation(resolveProgram,'uVolume'),3);
      sizeUniform=gl.getUniformLocation(resolveProgram,'uVolumeSize');
      volumeFramebuffer=gl.createFramebuffer();
      volumeColour=gl.createTexture();
      framebufferUnavailable=!volumeFramebuffer || !volumeColour;
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D,volumeColour);
      if(volumeColour){
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      }
      volumeWidth=0; volumeHeight=0;
      program=link(VERTEX,FRAGMENT,'aPos');
      grainProgram=link(GRAIN_VERTEX,GRAIN_FRAGMENT,'aGrain');
      gl.useProgram(grainProgram);
      for(const name of ['uRes','uTime','uProgress','uHeat']) grainUniforms[name]=gl.getUniformLocation(grainProgram,name);
      gl.uniform1i(grainUniforms.uHeat,2);
      grainBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,grainBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,makeGrainSeeds(),gl.STATIC_DRAW);
      gl.useProgram(program);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      const attribute=gl.getAttribLocation(program,'aPos');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      uniforms={};
      for(const name of ['uRes','uTime','uNoise','uCloudVolume','uHeat','uSuccess','uProgress','uFailed','uImpacts[0]']) uniforms[name]=gl.getUniformLocation(program,name);
      // Repeatable 3D value noise, packed into two channels for a single lookup.
      texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,128,128,0,gl.RGBA,gl.UNSIGNED_BYTE,getNoisePixels());
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.uniform1i(uniforms.uNoise,0);
      cloudTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,cloudTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,cloudTile*8,cloudTile*4,0,gl.RGBA,gl.UNSIGNED_BYTE,getCloudAtlas());
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.uniform1i(uniforms.uCloudVolume,1);
      heatRow.fill(0);previousHeat=false;
      heatTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,heatTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,heatRow.length,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,heatRow);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.uniform1i(uniforms.uHeat,2);gl.activeTexture(gl.TEXTURE0);
      host.dataset.renderer='webgl';delete host.dataset.rendererReason;
    }
    // Sample the radial confirmation fronts once per frame, not once per
    // lamp at every ray step. Gas and individual grains see the same light.
    function uploadHeat() {
      const active = impactAges.some(age => age >= 0 && age < 1.65);
      if (!active && !previousHeat) return;
      previousHeat = active;
      heatRow.fill(0);
      for (const age of impactAges) {
        if (age < 0 || age >= 1.65) continue;
        const p = age / 1.65;
        const front = 1.02 + 4.15 * (1 - (1 - p) ** 1.25);
        const strength = Math.min(1, p * 14, (1 - p) * 4);
        for (let i = 0; i < heatRow.length; i++) {
          const distance = (i + .5) * 6 / heatRow.length - front;
          const crest = Math.exp(-((distance / (.105 + .145 * p)) ** 2));
          const wake = .36 * Math.exp(-(((distance + .39) / .26) ** 2));
          heatRow[i] = Math.min(255, heatRow[i] + 255 * (crest + wake) * strength);
        }
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,heatRow.length,1,gl.LUMINANCE,gl.UNSIGNED_BYTE,heatRow);
      gl.activeTexture(gl.TEXTURE0);
    }
    function drawGrains(time, progress) {
      gl.useProgram(grainProgram);
      gl.uniform2f(grainUniforms.uRes,canvas.width,canvas.height);
      gl.uniform1f(grainUniforms.uTime,time);gl.uniform1f(grainUniforms.uProgress,progress);
      gl.bindBuffer(gl.ARRAY_BUFFER,grainBuffer);gl.vertexAttribPointer(0,4,gl.FLOAT,false,0,0);
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);
      gl.drawArrays(gl.POINTS,0,grainCount);
      gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      gl.useProgram(program);
    }
    function release() {
      if(volumeFramebuffer)gl.deleteFramebuffer(volumeFramebuffer);
      if(volumeColour)gl.deleteTexture(volumeColour);
      if(resolveProgram)gl.deleteProgram(resolveProgram);
      if(grainProgram)gl.deleteProgram(grainProgram);if(grainBuffer)gl.deleteBuffer(grainBuffer);if(heatTexture)gl.deleteTexture(heatTexture);
      grainProgram=null;grainBuffer=null;heatTexture=null;
      if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);if(texture)gl.deleteTexture(texture);if(cloudTexture)gl.deleteTexture(cloudTexture);
      for(const shader of shaders)gl.deleteShader(shader);
      program=null;buffer=null;texture=null;cloudTexture=null;shaders=[];
    }
    try { allocate(); } catch (failure) { console.warn(failure.message);release();return compatibility('shader'); }
    function visible() {
      if(destroyed||contextLost||document.hidden||!intersecting||!host.isConnected||!width||!height)return false;
      const dialog=host.closest('dialog');
      if((dialog&&!dialog.open)||host.closest('[hidden]')||!host.getClientRects().length)return false;
      const style=getComputedStyle(host);return style.visibility!=='hidden'&&style.display!=='none';
    }
    function stop(){if(frame)cancelAnimationFrame(frame);frame=0;lastTick=null;}
    function reconcile(){
      if(!visible()){
        stop();
        if(!timeline) impactTimes.fill(-Infinity);
        return;
      }
      if(timeline){paint(timelineSeconds*1000);return;}
      if(motion.matches){stop();impactTimes.fill(-Infinity);}
      paint(performance.now());
      if(!motion.matches&&!frame)frame=requestAnimationFrame(tick);
    }
    function resize(){
      if(destroyed)return;
      const rect=host.getBoundingClientRect();width=rect.width;height=rect.height;
      if(contextLost)return;
      const pixels=Math.max(1,width*height);
      const displayScale=Math.min(window.devicePixelRatio||1,2,Math.sqrt(displayBudget/pixels));
      const rayScale=Math.min(displayScale,Math.sqrt(volumeBudget/pixels))*quality;
      const rw=Math.max(2,Math.round(width*rayScale)), rh=Math.max(2,Math.round(height*rayScale));
      let w=Math.max(2,Math.round(width*displayScale)), h=Math.max(2,Math.round(height*displayScale));
      const needsResolve=rw!==w || rh!==h;
      if(needsResolve && !framebufferUnavailable && (!separateVolume || rw!==volumeWidth || rh!==volumeHeight)){
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D,volumeColour);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,rw,rh,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        gl.bindFramebuffer(gl.FRAMEBUFFER,volumeFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,volumeColour,0);
        framebufferUnavailable=gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        gl.activeTexture(gl.TEXTURE0);
      }
      separateVolume=needsResolve && !framebufferUnavailable;
      if(framebufferUnavailable){w=rw;h=rh;}
      volumeWidth=rw;volumeHeight=rh;
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      reconcile();
    }
    function paint(time){
      if(destroyed||contextLost||!program||!width||!height)return;
      lastPaint=time;
      // Only camera and orbital motion loop. Confirmation ages use wall time.
      const t=motion.matches?3:(timeline?timelineSeconds:(time-epoch)/1000)%16;
      // Each confirmation warms its share of the disk. Overlapping responses
      // finish their own ramps even if another poll arrives in the meantime.
      let light=state.completed;
      for(let i=0;i<impactTimes.length;i++){
        const age=(time-impactTimes[i])/1000;
        const active=!motion.matches && i<state.completed && age>=0 && age<9;
        impactAges[i]=active?age:-1;
        if(!active){
          if(!motion.matches && i<state.completed && age<0) light-=1;
          continue;
        }
        const x=Math.min(1,age/.9);
        light-=1-x*x*(3-2*x);
      }
      let success=state.status==='succeeded'?(motion.matches?1:Math.min(1,(time-successAt)/1000)):0;
      success=success*success*(3-2*success);
      gl.bindFramebuffer(gl.FRAMEBUFFER,separateVolume?volumeFramebuffer:null);
      gl.viewport(0,0,volumeWidth,volumeHeight);
      gl.useProgram(program);gl.uniform2f(uniforms.uRes,volumeWidth,volumeHeight);gl.uniform1f(uniforms.uTime,t);
      gl.uniform1f(uniforms.uSuccess,success);
      gl.uniform1f(uniforms.uProgress,light/9);
      gl.uniform1f(uniforms.uFailed,state.status==='failed'?1:0);
      uploadHeat();
      gl.uniform1fv(uniforms['uImpacts[0]'],impactAges);gl.drawArrays(gl.TRIANGLES,0,3);
      if(separateVolume){
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.useProgram(resolveProgram);
        gl.uniform2f(sizeUniform,volumeWidth,volumeHeight);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
      drawGrains(t,light/9);
    }
    function adaptResolution(time){
      if(lastTick!==null){slowFrames=time-lastTick>50?slowFrames+1:Math.max(0,slowFrames-1);}
      lastTick=time;
      if(slowFrames<12 || quality<=.52) return false;
      quality=Math.max(.5,quality*.8);slowFrames=0;resize();
      return true;
    }
    function tick(time){
      frame=0;if(!visible()||motion.matches)return;
      adaptResolution(time);
      // Spend the extra frames on a travelling heat front; the steady orbit
      // can run at half that cadence and leave the mobile GPU breathing room.
      const interval=time<heatWaveUntil && quality>=.8 && !software?15:30;
      if(time-lastPaint>=interval)paint(time);
      if(!frame)frame=requestAnimationFrame(tick);
    }
    function update(next={}){
      if(destroyed)return;
      const status=PHASES.has(next.status)?next.status:'idle';
      const completed=Math.min(9,Math.max(0,Number.isFinite(next.completed)?Math.floor(next.completed):0));
      const currentIndex=Number.isInteger(next.currentIndex)&&next.currentIndex>=1&&next.currentIndex<=9?next.currentIndex:null;
      const time=performance.now();
      if(completed<state.completed||['idle','connecting','queued','failed'].includes(status)){
        impactTimes.fill(-Infinity);
        heatWaveUntil=0;
      }else if(hydrated && completed>state.completed && visible() && !motion.matches){
        let start=Math.max(time,(impactTimes[state.completed-1] ?? -Infinity)+180);
        for(let i=state.completed;i<completed;i++, start+=180) impactTimes[i]=start;
        heatWaveUntil=impactTimes[completed-1]+2200;
      }
      if(status==='succeeded'&&state.status!=='succeeded')successAt=time;
      else if(status!=='succeeded')successAt=null;
      state={status,completed,currentIndex};host.dataset.phase=status;host.dataset.completed=String(completed);
      hydrated=true;
      fallback?.update(state);reconcile();
    }
    function renderAt(seconds, completed, playing=false){
      if(destroyed || !timeline) return;
      const next=timelineSnapshot(seconds,completed);
      timelineSeconds=next.seconds;
      if(next.completed!==state.completed || next.status!==state.status){
        host.dataset.completed=String(next.completed);
        host.dataset.phase=next.status;
      }
      state={completed:next.completed,status:next.status,currentIndex:null};
      for(let i=0;i<9;i++) impactTimes[i]=i<next.completed?(i+1)*1000:-Infinity;
      successAt=next.completed===9?9000:null;
      if(fallback) fallback.renderAt(timelineSeconds,next.completed,playing);
      else if(visible()){
        if(playing && !motion.matches && adaptResolution(performance.now())) return;
        if(!playing){lastTick=null;slowFrames=0;}
        paint(timelineSeconds*1000);
      }
    }
    function lost(event){
      event.preventDefault();contextLost=true;stop();canvas.style.visibility='hidden';
      if(!fallback){try{
        fallback=createFallback(host,state,timeline);
        host.dataset.renderer='compatibility';
        if(timeline) fallback.renderAt(timelineSeconds,state.completed);
      }catch{}}
    }
    function restored(){
      if(destroyed)return;
      try{allocate();contextLost=false;fallback?.destroy();fallback=null;canvas.style.visibility='';host.dataset.phase=state.status;host.dataset.completed=String(state.completed);resize();}catch{contextLost=true;}
    }
    function destroy(){
      if(destroyed)return;destroyed=true;stop();fallback?.destroy();
      resizeObserver?.disconnect();intersectionObserver?.disconnect();mutationObserver?.disconnect();
      window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',reconcile);
      if(motion.removeEventListener)motion.removeEventListener('change',reconcile);else motion.removeListener(reconcile);
      canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
      release();canvas.remove();if(!hadClass)host.classList.remove('lights-universe');
      delete host.dataset.phase;delete host.dataset.completed;delete host.dataset.renderer;delete host.dataset.rendererReason;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
    document.addEventListener('visibilitychange',reconcile);window.addEventListener('resize',resize,{passive:true});
    if(motion.addEventListener)motion.addEventListener('change',reconcile);else motion.addListener(reconcile);
    if(typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);}
    if(typeof IntersectionObserver==='function'){intersectionObserver=new IntersectionObserver(entries=>{intersecting=entries[0]?.isIntersecting!==false;reconcile();});intersectionObserver.observe(host);}
    if(typeof MutationObserver==='function'){
      mutationObserver=new MutationObserver(resize);
      for(let node=host;node;node=node.parentElement)mutationObserver.observe(node,{attributes:true,attributeFilter:['class','style','hidden','open']});
    }
    host.dataset.phase='idle';host.dataset.completed='0';resize();
    return Object.freeze({update,renderAt,destroy});
  }

  function createFallback(host, initialState, timeline = false) {
    if (!host || typeof host.append !== 'function') throw new TypeError('A universe host is required');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.layer = 'space-compatibility';
    const hadClass = host.classList.contains('lights-universe');
    host.classList.add('lights-universe'); host.append(canvas);
    const software = host.dataset.rendererReason === 'software';
    // Keep all paint surfaces on the CPU together. Mixing GPU-backed cloud
    // buffers with a software canvas makes each blend transfer raster data.
    const surfaceOptions = software ? { willReadFrequently: true } : {};
    const ctx = canvas.getContext('2d', { alpha: false, ...surfaceOptions });
    const pixelBudget = software ? 215000 : 1000000;
    const frameInterval = software ? 55 : 30;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let state = { status: 'idle', completed: 0, currentIndex: null };
    let width = 0, height = 0, dpr = 1, frame = 0, destroyed = false, intersecting = true;
    let lastPaint = -Infinity, lastMotionTime = 0, orbitTime = 0;
    let paintedLevel = -1, paintedStatus, paintedReduced;
    let successAt = null, elapsed = 0, hydrated = Boolean(initialState);
    const confirmationTimes = new Float64Array(9).fill(-Infinity);
    const waves = [];
    let resizeObserver, intersectionObserver, mutationObserver;

    // Seeded cloud maps are built once. Their rotation happens in the inclined
    // orbital plane, so the whole bank flows around the hole instead of drifting.
    let seed = 12873;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const values = Float32Array.from({ length: 4096 }, random);
    const stars = Array.from({ length: 680 }, () => ({ x: random(), y: random(),
      radius: .30 + random() * .55, alpha: .045 + random() * .22, hue: random(), phase: random() * TAU }));
    const trails = Array.from({ length: 46 }, () => ({ phase: random() * TAU,
      radius: .04 + random() * .94, speed: .72 + random() * .5, span: .06 + random() * .18, lift: (random() - .5) * .15 }));
    const clamp = value => Math.max(0, Math.min(1, value));
    const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
    function noise(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
      const a = values[((iy & 63) << 6) + (ix & 63)], b = values[((iy & 63) << 6) + ((ix + 1) & 63)];
      const c = values[(((iy + 1) & 63) << 6) + (ix & 63)], d = values[(((iy + 1) & 63) << 6) + ((ix + 1) & 63)];
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    }
    function fbm(x, y) {
      return noise(x, y) * .52 + noise(x * 2.03 + 7.3, y * 2.03 + 17.1) * .27 +
        noise(x * 4.11 + 19.7, y * 4.11 + 3.1) * .14 + noise(x * 8.29 + 1.8, y * 8.29 + 29.6) * .07;
    }
    function cloudMap(hot) {
      const size = software ? 256 : 384;
      const map = document.createElement('canvas'); map.width = map.height = size;
      const painter = map.getContext('2d', surfaceOptions); if (!painter) return map;
      const data = painter.createImageData(size, size);
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        const px = (x + .5) * 2 / size - 1, py = (y + .5) * 2 / size - 1, r = Math.hypot(px, py);
        if (r > 1 || r < .40) continue;
        const angle = Math.atan2(py, px) + 1.8 * Math.log(r + .12);
        const sx = Math.cos(angle) * r, sy = Math.sin(angle) * r;
        const body = fbm(sx * 8.3 + 23, sy * 8.3 + 11);
        const creases = noise(sx * 36 + body * 3, sy * 36 + body * 3);
        const band = Math.exp(-Math.pow((r - .58) / .23, 2)) + .40 * Math.exp(-Math.pow((r - .84) / .10, 2));
        const edge = smooth((r - .40) / .055) * smooth((1 - r) / .13);
        const density = clamp((body - .25) * 2.25) * band * edge;
        const filament = Math.pow(.5 + .5 * Math.sin(r * 68 - Math.atan2(py, px) * 3 + body * 4), 9);
        const ridge = clamp((body - .27) * 1.7 + (creases - .5) * .15 + filament * .11);
        const offset = (y * size + x) * 4;
        data.data[offset] = hot ? 214 + ridge * 41 : 37 + ridge * 95;
        data.data[offset + 1] = hot ? 123 + ridge * 119 : 26 + ridge * 64;
        data.data[offset + 2] = hot ? 98 + ridge * 126 : 44 + ridge * 66;
        data.data[offset + 3] = clamp(density * (hot ? .78 : .87)) * 255;
      }
      painter.putImageData(data, 0, 0); return map;
    }
    const copperCloud = cloudMap(false), hotCloud = cloudMap(true);
    const streams = Array.from({ length: 84 }, (_, i) => ({ near: i % 4 !== 0,
      angle: i % 4 !== 0 ? .27 + random() * 2.35 : Math.PI + .27 + random() * 2.35,
      phase: random(), spread: random(), lift: (random() - .5) * .12, strength: .45 + random() * .55 }));
    const foregroundDust = Array.from({ length: 110 }, (_, i) => ({ layer: i % 2, phase: random(), angle: random() * TAU, spread: random(), size: random() }));
    const clouds = Array.from({ length: 38 }, (_, i) => {
      const row = Math.floor(i / 10), x = -.10 + random() * 1.24;
      return { row, x, y: .71 + row * .105 - x * .16 + (random() - .5) * .105,
        radius: .16 + row * .021 + random() * .068, aspect: .71 + random() * .35,
        phase: random() * TAU, highlight: random(), texture: i % 3 };
    });
    // Neighbouring grains share an orbit with their luminous gas pocket.
    // Each pocket shears and breathes independently in the tilted disc.
    const pockets = Array.from({ length: 72 }, (_, i) => {
      const orbit = 1.2 + random() ** 1.4 * 2.65;
      return { orbit, angle: random() * TAU, speed: orbit < 1.9 ? 2 : 1,
        lift: (random() - .5) * .34, size: .16 + random() * .34,
        grains: Array.from({ length: 27 + i % 9 }, () => {
          // Sample a short swept lane, with a tightly packed crest and
          // looser peripheral dust. Rare larger grains catch the light.
          const lane = random() - .5;
          return { angle: lane * .82, offset: lane * .38 + (random() - .5) * .28,
            lift: (random() - .5) * (.08 + Math.abs(lane) * .32),
            size: .45 + 1.28 * random() ** 3, light: .43 + .57 * random() };
        }) };
    });
    for (const thread of streams) {
      thread.grains = Array.from({ length: 7 }, () => ({
        phase: random(), size: .40 + .94 * random() ** 2, scatter: random() - .5,
      }));
    }

    function puffMap(hot, variant) {
      const size = software ? 128 : 192, map = document.createElement('canvas'); map.width = map.height = size;
      const painter = map.getContext('2d', surfaceOptions); if (!painter) return map;
      const data = painter.createImageData(size, size);
      // Rounded overlapping lobes describe a solid cloud surface; fine noise
      // only wrinkles that surface, rather than punching holes through it.
      const lobes = [
        [-.42, .24, .51, .08], [.07, .22, .62, .04], [.50, .22, .43, .06],
        [-.40, -.23, .36, .08], [.03, -.35, .43, .12], [.43, -.24, .33, .06],
        [-.64, .08, .27, 0], [.67, .04, .25, -.03], [-.13, -.64, .23, .04],
      ].map((v, i) => [v[0] + Math.sin(i * 2.4 + variant) * .055,
        v[1] + Math.cos(i * 1.8 + variant * 2) * .045, v[2], v[3]]);
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        const px = (x + .5) / (size / 2) - 1, py = (y + .5) / (size / 2) - 1;
        const n = fbm(px * 5.4 + 11 + variant * 13, py * 5.4 + 28 + variant * 9);
        let surface = -2, edge = 0, nx = 0, ny = 0, nz = 0, weight = 0;
        for (const [lx, ly, r, z] of lobes) {
          const dx = px - lx, dy = py - ly, rr = r * (1 + (n - .5) * .21), d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const depth = Math.sqrt(rr * rr - d2), front = z + depth;
          edge = Math.max(edge, smooth((rr - Math.sqrt(d2)) / .16));
          const contribution = Math.exp(front * 11);
          nx += dx / rr * contribution; ny += dy / rr * contribution; nz += depth / rr * contribution;
          weight += contribution; surface = Math.max(surface, front);
        }
        if (surface < -1) continue;
        nx /= weight; ny /= weight; nz /= weight;
        // Sample relief along the incoming light so crests catch a sliver
        // of amber while their neighbouring folds stay in cool shadow.
        const upstream = fbm(px * 5.4 + 10.84 + variant * 13, py * 5.4 + 27.78 + variant * 9);
        const grain = noise(px * 25.3 + n * 2.7 + variant * 4, py * 25.3 + n * 1.2 + 5);
        const relief = (n - upstream) * .63 + (grain - .5) * .075;
        const light = clamp(.17 - nx * .36 - ny * .61 + nz * .50 + (n - .5) * .43 + relief);
        const crest = smooth((light - .31) / .58), white = smooth((light - .52) / .33);
        const alpha = edge * (.94 + (n - .5) * .10), j = (y * size + x) * 4;
        data.data[j] = hot ? 237 + white * 18 : 6 + light * 39;
        data.data[j + 1] = hot ? 138 + white * 108 : 9 + light * 48;
        data.data[j + 2] = hot ? 112 + white * 125 : 21 + light * 60;
        data.data[j + 3] = alpha * (hot ? crest : 1) * 255;
      }
      painter.putImageData(data, 0, 0); return map;
    }
    const shadowPuffs = [0, 1, 2].map(i => puffMap(false, i)), lightPuffs = [0, 1, 2].map(i => puffMap(true, i));

    function visible() {
      if (destroyed || !ctx || document.hidden || !intersecting || !host.isConnected || !width || !height) return false;
      const dialog = host.closest('dialog');
      if ((dialog && !dialog.open) || host.closest('[hidden]') || !host.getClientRects().length) return false;
      const style = getComputedStyle(host);
      return style.visibility !== 'hidden' && style.display !== 'none';
    }
    function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; lastMotionTime = 0; }
    function reconcile() {
      if (!visible()) {
        stop(); lastPaint = -Infinity;
        if (!timeline) { confirmationTimes.fill(-Infinity); successAt = null; }
        return;
      }
      if (motion.matches && !timeline) { confirmationTimes.fill(-Infinity); successAt = null; }
      if (lastPaint === -Infinity || paintedLevel !== state.completed || paintedStatus !== state.status || paintedReduced !== motion.matches) {
        paint(timeline ? elapsed * 1000 : performance.now());
      }
      if (motion.matches || timeline) stop(); else if (!frame) frame = requestAnimationFrame(tick);
    }
    function tick(time) {
      frame = 0;
      if (!visible() || motion.matches) { lastMotionTime = 0; return; }
      if (time - lastPaint >= frameInterval) paint(time);
      frame = requestAnimationFrame(tick);
    }
    function resize() {
      if (destroyed) return;
      const rect = host.getBoundingClientRect(); width = rect.width; height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(pixelBudget / Math.max(1, width * height)));
      const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; lastPaint = -Infinity; }
      reconcile();
    }
    function progress(time) {
      const target = state.completed / 9;
      if (motion.matches) return target;
      let light = state.completed;
      for (let i = 0; i < state.completed; i++) light -= 1 - smooth((time - confirmationTimes[i]) / 900);
      return light / 9;
    }
    function radial(x, y, inner, outer, stops) {
      const gradient = ctx.createRadialGradient(x, y, inner, x, y, outer);
      for (const [offset, colour] of stops) gradient.addColorStop(offset, colour);
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, outer, 0, TAU); ctx.fill();
    }
    function stroke(colour, lineWidth, draw, painter = ctx) {
      painter.strokeStyle = colour; painter.lineWidth = lineWidth; painter.beginPath(); draw(painter); painter.stroke();
    }
    const TILT = -.49, FLATNESS = .21;
    function cloudLayer(map, outer, angle, alpha, composite, near, lift = 0) {
      ctx.save(); ctx.translate(0, lift); ctx.scale(outer, outer * FLATNESS);
      // Split in the actual orbital plane before projection or texture rotation.
      // Upper/lower thickness slices retain the same near/far classification.
      ctx.beginPath(); ctx.rect(-1, near ? 0 : -1, 2, 1); ctx.clip();
      ctx.globalCompositeOperation = composite; ctx.globalAlpha = alpha;
      ctx.rotate(angle); ctx.drawImage(map, -1, -1, 2, 2); ctx.restore();
    }
    function orbitPoint(radius, angle, lift = 0) {
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * FLATNESS + lift };
    }
    function orbitStroke(radius, angle, span, lift, near, colour, thickness) {
      ctx.strokeStyle = colour; ctx.lineWidth = thickness; ctx.beginPath();
      let drawing = false;
      for (let i = 0; i <= 12; i += 1) {
        const a = angle + span * i / 12, correctHalf = Math.sin(a) >= 0;
        if (correctHalf !== near) { drawing = false; continue; }
        const p = orbitPoint(radius, a, lift);
        if (drawing) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
        drawing = true;
      }
      ctx.stroke();
    }
    // A light front moves across the *orbital* radius. Density comes from the
    // moving pockets themselves, so the wave breaks into glints and lit gas.
    function waveLight(orbit) {
      let light = 0;
      for (const wave of waves) {
        if (wave.age < .22) continue;
        const distance = Math.abs(orbit - wave.radius);
        light += wave.strength * Math.max(0, 1 - distance / .43) ** 2;
      }
      return Math.min(1, light);
    }
    // Tiny grains with similar luminance share one fill. Storing the circle
    // subpaths in a small set of palettes also preserves subpixel coverage.
    const grainTints = ['168,192,238', '247,157,125', '255,229,191'];
    const grainBatches = grainTints.flatMap(tint => [.13, .27, .43, .62, .84, 1].map(alpha => ({
      color: 'rgba(' + tint + ',' + alpha + ')', points: [],
    })));
    function addGrain(x, y, radius, light, tint) {
      if (light < .052) return;
      const bucket = Math.min(5, Math.floor(light * 6));
      grainBatches[tint * 6 + bucket].points.push(x, y, radius);
    }
    function drawGrains() {
      for (const { color, points } of grainBatches) {
        if (!points.length) continue;
        ctx.fillStyle = color; ctx.beginPath();
        for (let i = 0; i < points.length; i += 3) {
          const x = points[i], y = points[i + 1], r = points[i + 2];
          // Subpixel dust occupies approximately one output pixel. A small
          // quad is sufficient there; resolved grains have circular edges.
          if (r * dpr < .75) ctx.rect(x - r * .86, y - r * .86, r * 1.72, r * 1.72);
          else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
        }
        ctx.fill();
        points.length = 0;
      }
    }
    function dot(x, y, size, alpha, cool) {
      if (alpha < .024) return;
      const tint = cool ? '169,196,246' : '255,216,171';
      if (size > 1.45) {
        ctx.fillStyle = 'rgba(' + tint + ',' + alpha * .15 + ')';
        ctx.beginPath(); ctx.arc(x, y, size * 2.4, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(' + (size > 1.45 && !cool ? '255,242,216' : tint) + ',' + alpha + ')';
      ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
    }
    function orbitalDust(radius, phase, energy, near) {
      ctx.globalCompositeOperation = 'screen';
      for (const pocket of pockets) {
        const a = pocket.angle + phase * pocket.speed;
        if ((Math.sin(a) >= 0) !== near) continue;
        const lift = pocket.lift + .07 * Math.sin(a * 2 + pocket.orbit * 3);
        const at = orbitPoint(pocket.orbit * radius, a, lift * radius);
        const wave = waveLight(pocket.orbit);
        const lit = .5 + .5 * Math.cos(a - .45);
        const extent = radius * pocket.size * (1 + .14 * Math.sin(a + pocket.angle));
        ctx.save(); ctx.translate(at.x, at.y); ctx.scale(1.45, .73);
        const amber = (.037 + .14 * energy + .31 * wave) * (.50 + .50 * lit);
        radial(0, 0, 0, extent, [[0, 'rgba(254,183,140,' + amber + ')'],
          [.44, 'rgba(187,106,111,' + amber * .63 + ')'], [1, 'rgba(93,86,127,0)']]);
        ctx.restore();
        for (const grain of pocket.grains) {
          const r = pocket.orbit + grain.offset;
          const angle = a + grain.angle + grain.offset * .21 * Math.sin(phase + pocket.angle);
          const p = orbitPoint(r * radius, angle, (lift + grain.lift) * radius);
          const heat = waveLight(r);
          const size = grain.size * (near ? 1 : .83) * (1 + .28 * heat);
          const brightness = (.28 + energy * .69 + heat * .77) * (.63 + lit * .37) * grain.light;
          const tint = heat > .18 || size > 1.1 ? 2 : near ? 1 : 0;
          addGrain(p.x, p.y, size, brightness, tint);
          if (size > 1.48) addGrain(p.x, p.y, size * 2.1, brightness * .17, 1);
        }
      }
      drawGrains();
    }
    function diskHalf(radius, time, energy, near) {
      ctx.save(); ctx.rotate(TILT);
      const phase = time * TAU / 16;
      // A dense lower surface, luminous upper surface and wispy outer bank.
      for (const layer of [
        { r: 3.35, lift: .08, speed: 1, offset: 1.9, opacity: .50 },
        { r: 3.20, lift: 0, speed: 2, offset: 0, opacity: .68 },
        { r: 3.22, lift: -.075, speed: 2, offset: 0, opacity: .34 },
      ]) {
        const r = radius * layer.r, turn = phase * layer.speed + layer.offset;
        cloudLayer(copperCloud, r, turn, layer.opacity, 'source-over', near, radius * layer.lift);
        cloudLayer(hotCloud, r, turn, (.035 + energy * .43) * layer.opacity, 'screen', near, radius * layer.lift);
      }
      cloudLayer(copperCloud, radius * 5.1, phase + 2.1, .20, 'source-over', near, 0);
      cloudLayer(hotCloud, radius * (5.1 + energy * .45), phase + 2.1, .018 + energy * .15, 'screen', near, 0);
      orbitalDust(radius, phase, energy, near);
      ctx.globalCompositeOperation = 'screen';
      for (const trail of trails) {
        const a = trail.phase + phase * (trail.radius > .5 ? 1 : 2);
        const orbit = radius * (1.29 + trail.radius * 2.1), lift = radius * trail.lift;
        const alpha = (.025 + energy * .21) * (.48 + .52 * Math.cos(a + .5) ** 2);
        orbitStroke(orbit, a, trail.span, lift, near, 'rgba(255,221,196,' + alpha + ')', .4 + energy * .45);
        if ((Math.sin(a) >= 0) === near) {
          const p = orbitPoint(orbit, a, lift);
          ctx.fillStyle = 'rgba(255,228,207,' + alpha * 1.7 + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, .38 + trail.radius * .48, 0, TAU); ctx.fill();
        }
      }
      for (let i = 0; i < 14; i += 1) {
        const r = radius * (1.30 + i * .038);
        const a = phase * (1 + i % 3) + i * .61;
        orbitStroke(r, a, 1.0 + i % 3 * .24, radius * Math.sin(i * 1.7) * .035, near,
          'rgba(255,227,204,' + (.045 + energy * .23) * (1 - i / 20) + ')', i < 3 ? .9 : .5);
      }
      ctx.restore();
    }
    function lensArc(radius, time, energy) {
      radial(0, 0, radius * .91, radius * (1.38 + energy * .12),
        [[0, 'rgba(232,167,139,0)'], [.17, 'rgba(255,215,182,' + (.045 + energy * .19) + ')'], [.40, 'rgba(154,122,139,' + (.012 + energy * .06) + ')'], [1, 'rgba(35,54,69,0)']]);
      ctx.save(); ctx.rotate(TILT); ctx.globalCompositeOperation = 'screen';
      for (let layer = 12; layer >= 0; layer -= 1) {
        const r = radius * (1.012 + layer * .009);
        const alpha = (.055 + energy * .66) * (1 - layer / 15);
        ctx.strokeStyle = 'rgba(255,' + Math.round(186 + energy * 62) + ',' + Math.round(160 + energy * 77) + ',' + alpha + ')';
        ctx.lineWidth = layer < 3 ? radius * .012 : radius * .018;
        ctx.beginPath();
        for (let i = 0; i <= 64; i += 1) {
          const a = Math.PI + i / 64 * Math.PI;
          const rr = r + radius * (.0028 * Math.sin(a * 9 + time * TAU / 16 + layer) + .0015 * Math.sin(a * 19 - time * TAU / 8));
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      stroke('rgba(215,178,169,' + (.04 + energy * .13) + ')', radius * .035,
        () => ctx.arc(0, 0, radius * 1.03, .03, Math.PI - .03));
      ctx.restore();
    }
    function bezier(a, b, c, d, p) {
      const q = 1 - p;
      return { x: a.x * q ** 3 + 3 * b.x * q * q * p + 3 * c.x * q * p * p + d.x * p ** 3,
        y: a.y * q ** 3 + 3 * b.y * q * q * p + 3 * c.y * q * p * p + d.y * p ** 3 };
    }
    function streamVolume(radius, cx, cy, time, energy, near) {
      const a = { x: width * .78, y: height * .69 };
      const d = { x: cx + radius * .128, y: cy + radius * .241 };
      const b = { x: a.x - width * .13, y: a.y - height * .022 };
      const c = { x: d.x + width * .12, y: d.y + height * .23 };
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (let band = 12; band >= 1; band -= 1) {
        const edge = [];
        for (let i = 0; i <= 36; i += 1) {
          const p = i / 36, at = bezier(a, b, c, d, p);
          const ahead = bezier(a, b, c, d, Math.min(1, p + .008));
          const behind = bezier(a, b, c, d, Math.max(0, p - .008));
          const tx = ahead.x - behind.x, ty = ahead.y - behind.y, length = Math.max(1, Math.hypot(tx, ty));
          const taper = Math.sin(Math.PI * p) ** .38;
          const size = radius * (.39 - p * .19) * (band / 6) * taper * (1 + .035 * Math.sin(p * 9 + time * TAU / 16));
          edge.push({ x: at.x, y: at.y, nx: -ty / length * size, ny: tx / length * size });
        }
        const strength = (.012 + energy * energy) * (.014 + (12 - band) * .002) * (near ? 1 : .45);
        const colour = ctx.createLinearGradient(a.x, a.y, d.x, d.y);
        colour.addColorStop(0, 'rgba(255,243,219,0)');
        colour.addColorStop(.12, 'rgba(255,220,195,' + strength * 1.5 + ')');
        colour.addColorStop(.45, 'rgba(229,142,124,' + strength + ')');
        colour.addColorStop(.88, 'rgba(255,234,205,' + strength * 1.4 + ')');
        colour.addColorStop(1, 'rgba(255,234,205,0)');
        ctx.fillStyle = colour; ctx.beginPath();
        edge.forEach((point, i) => { if (i) ctx.lineTo(point.x + point.nx, point.y + point.ny); else ctx.moveTo(point.x + point.nx, point.y + point.ny); });
        for (let i = edge.length - 1; i >= 0; i -= 1) ctx.lineTo(edge[i].x - edge[i].nx, edge[i].y - edge[i].ny);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    function infall(radius, cx, cy, time, energy, near) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const turn = Math.cos(TILT), slope = Math.sin(TILT);
      for (const thread of streams) {
        if (thread.near !== near) continue;
        const a = thread.angle, point = orbitPoint(radius * (1.27 + thread.spread * .17), a, radius * thread.lift);
        const end = { x: cx + point.x * turn - point.y * slope, y: cy + point.x * slope + point.y * turn };
        const start = { x: width * .78 + (thread.spread - .5) * radius * .85, y: height * .69 + thread.lift * radius };
        const c1 = { x: start.x - width * .13, y: start.y - height * .022 };
        const c2 = { x: end.x + width * .12 + thread.spread * radius * .12, y: end.y + height * .23 };
        const baseAlpha = (.001 + energy * .013) * thread.strength;
        stroke('rgba(242,184,153,' + baseAlpha + ')', .7 + thread.spread * .9, pen => {
          pen.moveTo(start.x, start.y); pen.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
        });
        const travel = (thread.phase + time / 16 * (thread.spread > .6 ? 5 : 4)) % 1;
        const tail = .025 + thread.spread * .054;
        ctx.lineWidth = .48 + thread.spread * .95;
        const tailPoint = bezier(start, c1, c2, end, Math.max(0, travel - tail));
        const headPoint = bezier(start, c1, c2, end, travel);
        const glow = (.20 + energy * .70) * Math.sin(travel * Math.PI) * thread.strength;
        const colour = ctx.createLinearGradient(tailPoint.x, tailPoint.y, headPoint.x, headPoint.y);
        colour.addColorStop(0, 'rgba(225,133,115,0)');
        colour.addColorStop(.6, 'rgba(251,200,174,' + glow * .5 + ')');
        colour.addColorStop(1, 'rgba(255,243,224,' + glow + ')');
        ctx.strokeStyle = colour;
        ctx.beginPath();
        for (let j = 0; j <= 10; j += 1) {
          const p = Math.max(0, travel - tail + tail * j / 10), point = bezier(start, c1, c2, end, p);
          point.x += Math.sin(p * 13 + time * TAU / 16 * 2 + thread.phase * TAU) * Math.sin(p * Math.PI) * radius * .018;
          if (j) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y);
        }
        ctx.stroke();
        dot(headPoint.x, headPoint.y, .72 + 1.12 * thread.spread, glow, !near);
        for (const grain of thread.grains) {
          const p = (travel + grain.phase) % 1;
          const at = bezier(start, c1, c2, end, p);
          const envelope = Math.sin(p * Math.PI);
          // The same grains move forward on their thread while a passing
          // confirmation briefly illuminates the section they occupy.
          let flash = 0;
          for (const wave of waves) {
            if (wave.age < .38) {
              const front = .26 + .74 * wave.age / .38;
              flash = Math.max(flash, 1 - Math.abs(front - p) * 6);
            }
          }
          const x = at.x + grain.scatter * radius * .08 * envelope;
          const light = envelope * (.30 + energy * .66 + flash * .7) * thread.strength;
          addGrain(x, at.y, grain.size * (.86 + p * .29 + flash * .22), light, flash > .12 || near ? 2 : 0);
        }
        for (const wave of waves) {
          if (wave.age >= .38 || Math.abs(thread.spread - ((wave.level * .618) % 1)) > .09) continue;
          const surge = bezier(start, c1, c2, end, .26 + .74 * wave.age / .38);
          dot(surge.x, surge.y, 1.15 + thread.strength * .9, Math.sin(Math.PI * wave.age / .38), false);
        }
      }
      drawGrains();
      ctx.restore();
    }
    function capturedFlow(radius, cx, cy, time, energy, near) {
      const angle = .72, join = .57, turn = Math.cos(TILT), slope = Math.sin(TILT);
      const transform = (x, y) => ({ x: cx + x * turn - y * slope, y: cy + x * slope + y * turn });
      const end = transform(Math.cos(angle) * radius * 1.17, Math.sin(angle) * radius * 1.055);
      const tx = Math.sin(angle) * 1.17 * turn + Math.cos(angle) * 1.055 * slope;
      const ty = Math.sin(angle) * 1.17 * slope - Math.cos(angle) * 1.055 * turn;
      const start = { x: width * .78, y: height * .69 };
      const first = { x: start.x - width * .14, y: start.y - height * .025 };
      const last = { x: end.x - tx * radius * .62, y: end.y - ty * radius * .62 };
      function path(p) {
        if (p < join) return { ...bezier(start, first, last, end, p / join), near: true, spread: 0 };
        const q = (p - join) / (1 - join), a = angle - q * 4.7;
        const spread = smooth(q), expansion = 1 + spread * .16;
        return { ...transform(Math.cos(a) * radius * 1.17 * expansion,
          Math.sin(a) * radius * 1.055 * expansion), near: Math.sin(a) >= 0, spread };
      }
      // Distance sampling preserves speed at the curve-to-orbit handover.
      const samples = [path(0)]; samples[0].distance = 0;
      for (let i = 1; i <= 160; i += 1) {
        const at = path(i / 160), previous = samples[i - 1];
        at.distance = previous.distance + Math.hypot(at.x - previous.x, at.y - previous.y); samples.push(at);
      }
      function byDistance(p) {
        const target = clamp(p) * samples[160].distance;
        let lo = 0, hi = 160;
        while (hi - lo > 1) { const middle = (lo + hi) >> 1; if (samples[middle].distance < target) lo = middle; else hi = middle; }
        const a = samples[lo], b = samples[hi], mix = (target - a.distance) / Math.max(.001, b.distance - a.distance);
        return { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix,
          near: mix < .5 ? a.near : b.near, spread: a.spread + (b.spread - a.spread) * mix };
      }
      const head = (time / 16 * 2 + .08) % 1, firstP = Math.max(0, head - .16), lastP = Math.min(1, head + .035);
      const from = byDistance(firstP), to = byDistance(lastP), leading = byDistance(head);
      const envelope = smooth(head / .10) * smooth((1 - head) / .22);
      const alpha = envelope * (.012 + energy * .70), thickness = radius * (.019 + leading.spread * .095);
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let halo = 3; halo >= 1; halo -= 1) {
        const strength = alpha * (halo === 1 ? .80 : halo === 2 ? .20 : .065);
        const colour = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        const tint = halo === 1 ? '255,242,220' : '231,156,133';
        colour.addColorStop(0, 'rgba(' + tint + ',0)');
        colour.addColorStop(.48, 'rgba(' + tint + ',' + strength * .40 + ')');
        colour.addColorStop(.80, 'rgba(' + tint + ',' + strength + ')');
        colour.addColorStop(1, 'rgba(' + tint + ',0)');
        ctx.strokeStyle = colour; ctx.lineWidth = thickness * (halo === 3 ? 5 : halo === 2 ? 2.7 : 1);
        ctx.beginPath(); let drawing = false;
        for (let i = 0; i <= 48; i += 1) {
          const at = byDistance(firstP + (lastP - firstP) * i / 48);
          if (at.near !== near) { drawing = false; continue; }
          if (drawing) ctx.lineTo(at.x, at.y); else ctx.moveTo(at.x, at.y);
          drawing = true;
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    function cloudSea(time, energy, foreground) {
      ctx.save();
      for (const cloud of clouds) {
        if ((cloud.row >= 3) !== foreground) continue;
        const phase = time * TAU / 16 + cloud.phase;
        const x = width * (cloud.x + Math.sin(phase) * (.013 + cloud.row * .004));
        const y = height * (cloud.y + Math.cos(phase) * (.006 + cloud.row * .002));
        const r = Math.min(width, height * .95) * cloud.radius * (1 + .035 * Math.sin(phase + 1.2));
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .91 + cloud.row * .025;
        ctx.drawImage(shadowPuffs[cloud.texture], x - r, y - r * cloud.aspect, r * 2, r * cloud.aspect * 2);
        const sourceDistance = Math.hypot((cloud.x - .77) * 1.4, (cloud.y - .68) * 2.1);
        const illumination = (.18 + .82 * Math.exp(-sourceDistance * 2.0)) * (.72 + cloud.highlight * .28);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = (.008 + energy * .98) * illumination;
        ctx.drawImage(lightPuffs[cloud.texture], x - r, y - r * cloud.aspect, r * 2, r * cloud.aspect * 2);
      }
      ctx.restore();
    }
    function forwardDust(radius, cx, cy, time, energy) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const mote of foregroundDust) {
        const p = (mote.phase + time / 16 * (mote.layer + 1)) % 1;
        const distance = radius * (1.22 + mote.spread * .85) / (1 - p * .91);
        const x = cx + Math.cos(mote.angle) * distance, y = cy + Math.sin(mote.angle) * distance;
        if (x < -8 || x > width + 8 || y < -8 || y > height + 8) continue;
        const fade = Math.sin(Math.PI * p) ** 2;
        const size = .30 + mote.size * .32 + p * (mote.layer ? .90 : .45);
        const streak = (1.0 + p * 3.1) * (mote.layer ? 1.4 : 1);
        ctx.lineWidth = size; ctx.strokeStyle = 'rgba(' + (mote.layer ? '241,204,179' : '168,194,218') + ',' + fade * (.08 + energy * .18) + ')';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(mote.angle) * streak, y - Math.sin(mote.angle) * streak); ctx.stroke();
      }
      ctx.restore();
    }
    function paint(time) {
      if (!ctx || !width || !height || destroyed) return;
      if (!timeline && !motion.matches && lastMotionTime) orbitTime += Math.max(0, (time - lastMotionTime) / 1000);
      lastMotionTime = time; lastPaint = time;
      paintedLevel = state.completed; paintedStatus = state.status; paintedReduced = motion.matches;
      waves.length = 0;
      if (!motion.matches && state.status !== 'failed') {
        for (let i = 0; i < state.completed; i++) {
          const age = (time - confirmationTimes[i]) / 1000;
          if (age < 0 || age >= 1.65) continue;
          const p = clamp((age - .22) / 1.43);
          waves.push({ level: i + 1, age, radius: 1.10 + 2.83 * (1 - (1 - p) ** 1.35),
            strength: smooth(p * 9) * smooth((1 - p) * 4) });
        }
      }
      const t = motion.matches ? 3.5 : (timeline ? elapsed : orbitTime) % 16, theta = t * TAU / 16, energy = progress(time);
      const radius = Math.min(height * .19, width * .22) * (1 + .009 * Math.sin(theta)), cx = width * (.47 + .004 * Math.cos(theta)), cy = height * (.38 + .004 * Math.sin(theta));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#04060b'; ctx.fillRect(0, 0, width, height);
      for (const star of stars) {
        let x = star.x * width, y = star.y * height;
        const dx = x - cx, dy = y - cy, distance = Math.hypot(dx, dy);
        if (distance < radius * 1.02) continue;
        const bend = Math.exp(-Math.max(0, distance / radius - 1) * 1.6);
        const angle = Math.atan2(dy, dx) + bend * .07, r = distance + radius * bend * .065;
        x = cx + Math.cos(angle) * r; y = cy + Math.sin(angle) * r;
        const tint = star.hue < .23 ? '213,174,164' : star.hue > .73 ? '153,187,225' : '210,211,215';
        ctx.strokeStyle = 'rgba(' + tint + ',' + star.alpha * (.92 + .08 * Math.sin(theta + star.phase)) + ')'; ctx.lineWidth = star.radius;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(angle) * (star.radius + bend * 3.1), y + Math.cos(angle) * (star.radius + bend * 3.1)); ctx.stroke();
      }
      cloudSea(t, energy, false);
      radial(width * .78, height * .685, 0, Math.min(width * .38, height * .27),
        [[0, 'rgba(255,227,198,' + (.008 + energy * .42) + ')'], [.28, 'rgba(211,145,111,' + (.004 + energy * .16) + ')'], [1, 'rgba(100,59,45,0)']]);
      streamVolume(radius, cx, cy, t, energy, false);
      infall(radius, cx, cy, t, energy, false);
      capturedFlow(radius, cx, cy, t, energy, false);
      ctx.save(); ctx.translate(cx, cy);
      diskHalf(radius, t, energy, false);
      lensArc(radius, t, energy);
      // Every far-side layer is now behind this fully opaque silhouette.
      ctx.fillStyle = '#010204'; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
      diskHalf(radius, t, energy, true);
      ctx.restore();
      streamVolume(radius, cx, cy, t, energy, true);
      infall(radius, cx, cy, t, energy, true);
      capturedFlow(radius, cx, cy, t, energy, true);
      radial(cx + radius * .128, cy + radius * .241, 0, radius * .22, [[0, 'rgba(255,247,223,' + energy * .40 + ')'], [.28, 'rgba(247,181,144,' + energy * .14 + ')'], [1, 'rgba(130,70,50,0)']]);
      radial(width * .78, height * .69, 0, width * .145, [[0, 'rgba(255,247,225,' + energy * .48 + ')'], [.24, 'rgba(255,208,169,' + energy * .19 + ')'], [1, 'rgba(147,78,52,0)']]);
      cloudSea(t, energy, true);
      forwardDust(radius, cx, cy, t, energy);
      if (!motion.matches && successAt !== null && state.completed === 9) {
        const age = (time - successAt) / 1800;
        if (age >= 0 && age < 1) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(TILT); ctx.globalCompositeOperation = 'screen';
          orbitStroke(radius * (1.65 + age * 1.1), .06, Math.PI - .12, 0, true,
            'rgba(255,219,190,' + Math.sin(Math.PI * age) * (1 - age) * .14 + ')', 1.1);
          ctx.restore();
        }
      }
      const fade = ctx.createLinearGradient(0, height * .84, 0, height);
      fade.addColorStop(0, 'rgba(4,6,11,0)'); fade.addColorStop(1, 'rgba(4,6,11,.75)');
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = fade; ctx.fillRect(0, height * .84, width, height * .16);
    }
    function update(next = {}) {
      if (destroyed) return;
      const status = PHASES.has(next.status) ? next.status : 'idle';
      const completed = Math.min(9, Math.max(0, Number.isFinite(next.completed) ? Math.floor(next.completed) : 0));
      const currentIndex = Number.isInteger(next.currentIndex) && next.currentIndex >= 1 && next.currentIndex <= 9 ? next.currentIndex : null;
      const time = performance.now();
      const canPulse = hydrated && !motion.matches && visible() && !timeline;
      if (!canPulse || completed < state.completed || ['idle', 'queued', 'connecting', 'failed'].includes(status)) {
        confirmationTimes.fill(-Infinity);
      } else if (completed > state.completed) {
        let nextPulse = Math.max(time, (confirmationTimes[state.completed - 1] ?? -Infinity) + 180);
        for (let i = state.completed; i < completed; i++, nextPulse += 180) confirmationTimes[i] = nextPulse;
      }
      if (canPulse && status === 'succeeded' && completed === 9 && state.status !== 'succeeded') successAt = time;
      else if (!canPulse || status !== 'succeeded' || completed !== 9) successAt = null;
      hydrated = true;
      state = { status, completed, currentIndex };
      host.dataset.phase = status; host.dataset.completed = String(completed);
      reconcile();
    }
    function renderAt(seconds, completed, playing = false) {
      if (destroyed || !timeline) return;
      const snapshot = timelineSnapshot(seconds, completed);
      elapsed = snapshot.seconds;
      state = { status: snapshot.status, completed: snapshot.completed, currentIndex: null };
      for (let i = 0; i < 9; i++) confirmationTimes[i] = i < state.completed ? (i + 1) * 1000 : -Infinity;
      successAt = state.status === 'succeeded' ? 9000 : null;
      if (host.dataset.phase !== state.status) host.dataset.phase = state.status;
      if (host.dataset.completed !== String(state.completed)) host.dataset.completed = String(state.completed);
      const time = elapsed * 1000;
      const sameState = paintedLevel === state.completed && paintedStatus === state.status && paintedReduced === motion.matches;
      if (sameState && (time === lastPaint || (software && playing && time > lastPaint && time - lastPaint < frameInterval))) return;
      if (visible()) paint(time);
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; stop();
      resizeObserver?.disconnect(); intersectionObserver?.disconnect(); mutationObserver?.disconnect();
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', reconcile);
      if (motion.removeEventListener) motion.removeEventListener('change', reconcile); else motion.removeListener(reconcile);
      canvas.remove();
      for (const texture of [copperCloud, hotCloud, ...shadowPuffs, ...lightPuffs]) texture.width = texture.height = 0;
      if (!hadClass) host.classList.remove('lights-universe');
      delete host.dataset.phase; delete host.dataset.completed;
    }
    document.addEventListener('visibilitychange', reconcile);
    if (motion.addEventListener) motion.addEventListener('change', reconcile); else motion.addListener(reconcile);
    window.addEventListener('resize', resize, { passive: true });
    if (typeof ResizeObserver === 'function') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); }
    if (typeof IntersectionObserver === 'function') {
      intersectionObserver = new IntersectionObserver(entries => { intersecting = entries[0]?.isIntersecting !== false; reconcile(); }); intersectionObserver.observe(host);
    }
    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver(resize);
      for (let node = host; node; node = node.parentElement) mutationObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
    }
    if (initialState && typeof initialState === 'object') {
      state = {
        status: PHASES.has(initialState.status) ? initialState.status : 'idle',
        completed: Math.min(9, Math.max(0, Number.isFinite(initialState.completed) ? Math.floor(initialState.completed) : 0)),
        currentIndex: Number.isInteger(initialState.currentIndex) && initialState.currentIndex >= 1 && initialState.currentIndex <= 9 ? initialState.currentIndex : null,
      };
    }
    host.dataset.phase = state.status; host.dataset.completed = String(state.completed); resize();
    return Object.freeze(timeline ? { update, renderAt, destroy } : { update, destroy });
  }

  window.LW5LightsUniverse=Object.freeze({create});
})();
