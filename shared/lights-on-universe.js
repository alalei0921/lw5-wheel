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
    // A periodic height field of overlapping cloud lobes. The same field supplies
    // several scales of real surface relief in the ray / cloud intersection.
    const lobes = Array.from({length: 64}, () => ({
      x: .16 + .68 * random(), y: .16 + .68 * random(),
      radius: .62 + .30 * random(), height: .59 + .37 * random()
    }));
    const pixels = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const u = (x + .5) / 16, v = (y + .5) / 16;
      const cellX = Math.floor(u), cellY = Math.floor(v);
      let top = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const lobe = lobes[((cellY + j + 8) % 8) * 8 + (cellX + i + 8) % 8];
        const dx = u - (cellX + i + lobe.x), dy = v - (cellY + j + lobe.y);
        const depth = 1 - (dx * dx + dy * dy) / (lobe.radius * lobe.radius);
        if (depth <= 0) continue;
        const h = lobe.height * Math.sqrt(depth);
        const blend = Math.max(0, 1 - Math.abs(h - top) / .07);
        top = Math.max(top, h) + .0175 * blend * blend;
      }
      const offset = (y * side + x) * 4;
      pixels[offset] = values[y * side + x];
      pixels[offset + 1] = values[((y + 17) % side) * side + (x + 37) % side];
      pixels[offset + 2] = Math.round(Math.min(1, top) * 255);
      pixels[offset + 3] = 255;
    }
    noisePixels = pixels;
    return pixels;
  }
  const PHASES = new Set(['idle', 'queued', 'connecting', 'running', 'verifying', 'succeeded', 'failed']);
  const VERTEX = 'attribute vec2 aPos; void main(){gl_Position=vec4(aPos,0.,1.);}';
  const FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform sampler2D uNoise;
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
  float fibers=pow(.5+.5*sin(radial*36.+n*10.+fine*3.),5.);
  float thin=exp(-abs(height)/(.016+radial*.003));
  float inner=exp(-abs(radial-1.60)*1.65);
  float whiteRidge=exp(-pow((radial-1.52-(n-.5)*.10)/.13,2.));
  plasma=rim*thin*(.025+fibers*.48+fine*fine*.17+whiteRidge*.40)*inner;
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
    stream+=sheet*cap*weight*(.10+fibers*.24*beads+flowing*flowing*.20+vein*(.62+.20*flowing))*.62;
    stream+=sheet*cap*weight*exp(-t*16.)*.14;
    density+=sheet*cap*weight*(.035+flowing*.055);
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
  d=rim*exp(-pow(abs(p.y)/(.035+radial*.009),1.65))*(.018+smoothstep(.25,.74,n)*.32)*exp(-max(radial-2.0,0.)*1.6);
 }
 return d;
}
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
 float packet=thermalPackets(a,1.65+max(edge,0.)*1.2);
 float shoulder=exp(-pow((a-2.26)*3.2,2.));
 vec3 outerWarm=mix(hot,vec3(1.26,.54,.49),progress*.74*smoothstep(.035,.36,edge));
 vec3 lensHot=mix(outerWarm,vec3(1.20,1.46,1.76),progress*shoulder*.57);
 vec3 col=lensHot*envelope*imageDensity*upper*approaching*(power+packet*2.2)*.67;
 col+=copper*pow(n,2.)*envelope*upper*.12*power;
 float photon=exp(-abs(edge)/max(.006,pixel*.8));
 col+=lensHot*photon*(.42+.58*upper)*approaching*(power+packet)*1.3;
 col+=vec3(.025,.056,.105)*exp(-abs(edge-.025)*65.)*upper*power;
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

// Rounded cloud heads bound this volume. Inside each bank, three-dimensional
// turbulence opens gullies between lobes and breaks up the illuminated margins.
float oceanDensity(vec3 p,vec2 drift) {
 vec2 q=p.xz*1.65+drift;
 vec2 warp=vec2(noise3(vec3(q*.55,12.1)),noise3(vec3(q*.53,33.7)))-.5;
 q+=warp*.80;
 float bank=noise3(vec3(q*.67,4.2));
 // Advance the wrapped relief towards the camera. Exactly one full texture
 // period per lap gives the foreground real parallax without reversing.
 vec2 travel=vec2(0.,-uTime/16.);
 float heads=texture2D(uNoise,q*.148+vec2(.13,.62)+travel).b;
 float folds=texture2D(uNoise,turn(.72)*q*.363+heads*.032+vec2(.41,.27)+travel).b;
 // Tall low-frequency billows break the oblique bank into individual rising heads.
 float towers=smoothstep(.27,.79,bank);
 float ceiling=-4.02+1.02*towers+1.10*heads+.36*folds;
 float below=ceiling-p.y;
 if(below<-.43)return 0.;
 vec3 detail=vec3(q.x,p.y*2.25,q.y);
 float n=.55*noise3(detail*2.33)+.29*noise3(detail*4.91+16.7)+.16*noise3(detail*10.21+6.1);
 return clamp(below*1.18+(n-.50)*1.07,0.,1.9);
}
vec4 cloudOcean(vec3 ro,vec3 rd,float stopDepth,float progress,float power,vec3 sky,out vec4 nearT,out vec4 farT,out vec2 sampledDepths) {
 nearT=vec4(0.);farT=vec4(0.);sampledDepths=vec2(0.);
 if(rd.y>=-.001)return vec4(0.,0.,0.,-1.);
 float phi=uTime*.3926990817;
 vec2 drift=vec2(.070*cos(phi),.082*sin(phi));
 float first=(-1.50-ro.y)/rd.y;
 float last=min(stopDepth,min((-5.4-ro.y)/rd.y,16.0));
 if(last<=first)return vec4(0.,0.,0.,-1.);
 sampledDepths=vec2(first,last);
 float stepSize=(last-first)/40.;
 float transmission=1.,surface=-1.;
 vec3 scatter=vec3(0.);
 vec3 sun=normalize(vec3(.62,.65,-.44));
 vec3 rose=mix(vec3(.45,.12,.085),vec3(1.,.49,.39),progress);
 vec3 ivory=mix(vec3(.84,.45,.31),vec3(1.26,1.04,.92),progress);
 for(int i=0;i<40;i++){
  // Keep eight transmittance samples so filaments fade into the soft cloud
  // boundary at their own depth, rather than stopping at an opaque cutout.
  if(i==5)nearT.x=transmission;else if(i==10)nearT.y=transmission;
  else if(i==15)nearT.z=transmission;else if(i==20)nearT.w=transmission;
  else if(i==25)farT.x=transmission;else if(i==30)farT.y=transmission;
  else if(i==35)farT.z=transmission;
  float depth=first+(float(i)+.5)*stepSize;
  vec3 p=ro+rd*depth;
  float density=oceanDensity(p,drift)*(1.-smoothstep(11.1,16.,depth));
  if(density<.005)continue;
  float alpha=1.-exp(-5.8*density*stepSize);
  float dx=density-oceanDensity(p+vec3(.095,0.,0.),drift);
  float dy=density-oceanDensity(p+vec3(0.,.095,0.),drift);
  float dz=density-oceanDensity(p+vec3(0.,0.,.095),drift);
  vec3 normal=normalize(vec3(dx,dy,dz)+vec3(0.,.012,0.));
  float slopeLight=clamp(dot(normal,sun),0.,1.);
  float closeShadow=oceanDensity(p+sun*.34,drift);
  float distantShadow=oceanDensity(p+sun*.93,drift);
  float sunlit=exp(-6.1*closeShadow-3.45*distantShadow);
  float rim=clamp((density-closeShadow)*2.35,0.,1.);
  float height=smoothstep(-3.55,-2.14,p.y);
  vec3 smoke=mix(vec3(.0034,.0041,.0083),vec3(.027,.013,.023),height*.77+.10);
  vec3 light=smoke*(.45+.57*power);
  light+=rose*(.033+.48*rim)*sunlit*(.17+.57*power);
  light+=ivory*(.11*sunlit*sunlit+.41*rim*rim*sunlit)*(.035+power*.54);
  // Localized diffusion where the gas stream meets the cloud tops.
  float feedDistance=length((p-vec3(-.20,-2.82,1.85))*vec3(.85,.78,.90));
  float root=exp(-feedDistance*2.55);
  light*=(.075+.62*exp(-.62*feedDistance))*(.18+.91*slopeLight);
  light+=mix(rose,ivory,.67)*root*(.045+.55*sunlit+.17*rim)*power*.58*(.28+.72*slopeLight);
  // Fine condensate at the sunward edge gives the crown a broken silver lining.
  float lining=pow(slopeLight,3.)*sunlit*smoothstep(.30,.75,noise3(p*12.7));
  light+=ivory*lining*(.01+.050*root)*power;
  scatter+=transmission*light*alpha;
  transmission*=1.-alpha;
  if(transmission<.014){surface=depth;break;}
 }
 farT.w=transmission;
 if(surface<0.&&transmission<.999)surface=last;
 return vec4(scatter+transmission*sky,surface);
}
void main(){
 float aspect=uRes.x/uRes.y,phi=uTime*.3926990817;
 vec2 screenUv=(gl_FragCoord.xy*2.-uRes)/uRes.y;
 float framing=min(.38,aspect*.44);
 vec2 view=(screenUv-vec2(-.06*aspect,.24))/framing;
 view=turn(.49+sin(phi)*.004)*view;
 vec3 ro=vec3(0.,.80,8.4);
 float cameraDistance=length(ro),focal=sqrt(cameraDistance*cameraDistance-1.);
 vec3 forward=-ro/cameraDistance,right=vec3(1.,0.,0.),up=normalize(cross(right,forward));
 vec3 rd=normalize(forward*focal+right*view.x+up*view.y);
 vec2 core=sphereSpan(ro,rd,1.);
 bool hitsCore=core.x>0.&&core.y>core.x;
 vec2 bounds=sphereSpan(ro,rd,7.0);
 float entry=max(0.,bounds.x),exitDepth=bounds.y;
 if(hitsCore)exitDepth=min(exitDepth,core.x);
 float progress=clamp(uProgress,0.,1.);
 float power=(.19+progress*1.92+progress*progress*.70)*(1.+smoothstep(.88,1.,progress)*sin(phi*2.)*.025);
 vec3 hot=mix(vec3(1.,.28,.15),vec3(1.52,1.13,.96),progress);
 vec3 copper=mix(vec3(.55,.13,.075),vec3(.94,.32,.255),progress);
 float pixel=2./max(1.,uRes.y)/framing;
 vec3 sky=vec3(0.);
 if(!hitsCore)sky=gravitySky(view,pixel);
 vec4 nearT,farT;vec2 sampledDepths;
 vec4 ocean=cloudOcean(ro,rd,hitsCore?core.x:1e4,progress,power,sky,nearT,farT,sampledDepths);
 if(ocean.w>0.){sky=ocean.rgb;exitDepth=min(exitDepth,ocean.w);}
 float foregroundLimit=min(hitsCore?core.x:1e4,ocean.w>0.?ocean.w:1e4);
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
    float alpha=1.-exp(-field.x*stepSize*2.6);
    vec3 emission=localHot*field.y*beaming*(power+packet*2.4)*2.3;
    emission+=localHot*field.z*(power+packet)*2.4;
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
 float vignette=1.-smoothstep(.75,2.05,length(screenUv*vec2(1./max(aspect,.4),.78)))*.16;
 col=aces(col*vignette*1.35);
 col=pow(col,vec3(.4545));
 float grain=(hash13(vec3(gl_FragCoord.xy,4.1))-.5)/510.;
 gl_FragColor=vec4(max(vec3(0.),col+grain),1.);
}
`;

  function create(host) {
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
      const visual=createFallback(host);
      return Object.freeze({update:visual.update,destroy(){
        visual.destroy();if(!hadClass)host.classList.remove('lights-universe');
        delete host.dataset.renderer;delete host.dataset.rendererReason;
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      }});
    }
    if (!gl) return compatibility('unavailable');
    // Some WebViews expose a CPU-based WebGL implementation. Keep its initial
    // volume pass small enough to respond to input before frame adaptation starts.
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const software = info && /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    const pixelBudget = software ? 100000 : 520000;
    let program, buffer, texture, shaders=[], uniforms={};
    let destroyed=false, contextLost=false, fallback=null, frame=0, intersecting=true;
    let width=0, height=0, quality=1, lastPaint=-Infinity, lastTick=null, slowFrames=0;
    let heatWaveUntil=0;
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
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Lights visual link failed');
      gl.useProgram(program);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      const attribute=gl.getAttribLocation(program,'aPos');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      uniforms={};
      for(const name of ['uRes','uTime','uNoise','uSuccess','uProgress','uFailed','uImpacts[0]']) uniforms[name]=gl.getUniformLocation(program,name);
      // Repeatable 3D value noise, packed into two channels for a single lookup.
      texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,128,128,0,gl.RGBA,gl.UNSIGNED_BYTE,getNoisePixels());
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.uniform1i(uniforms.uNoise,0);
      host.dataset.renderer='webgl';delete host.dataset.rendererReason;
    }
    function release() {
      if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);if(texture)gl.deleteTexture(texture);
      for(const shader of shaders)gl.deleteShader(shader);
      program=null;buffer=null;texture=null;shaders=[];
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
      if(!visible()){stop();return;}
      if(motion.matches)stop();
      paint(performance.now());
      if(!motion.matches&&!frame)frame=requestAnimationFrame(tick);
    }
    function resize(){
      if(destroyed)return;
      const rect=host.getBoundingClientRect();width=rect.width;height=rect.height;
      const scale=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(pixelBudget/Math.max(1,width*height)))*quality;
      const w=Math.max(2,Math.round(width*scale)),h=Math.max(2,Math.round(height*scale));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      if(!contextLost)gl.viewport(0,0,w,h);
      reconcile();
    }
    function paint(time){
      if(destroyed||contextLost||!program||!width||!height)return;
      lastPaint=time;
      // Only camera and orbital motion loop. Confirmation ages use wall time.
      const t=motion.matches?3:((time-epoch)/1000)%16;
      // Each confirmation warms its share of the disk. Overlapping responses
      // finish their own ramps even if another poll arrives in the meantime.
      let light=state.completed;
      for(let i=0;i<impactTimes.length;i++){
        const age=(time-impactTimes[i])/1000;
        const active=!motion.matches && i<state.completed && age>=0 && age<9;
        impactAges[i]=active?age:-1;
        if(!active)continue;
        const x=Math.min(1,age/.9);
        light-=1-x*x*(3-2*x);
      }
      let success=state.status==='succeeded'?(motion.matches?1:Math.min(1,(time-successAt)/1000)):0;
      success=success*success*(3-2*success);
      gl.useProgram(program);gl.uniform2f(uniforms.uRes,canvas.width,canvas.height);gl.uniform1f(uniforms.uTime,t);
      gl.uniform1f(uniforms.uSuccess,success);
      gl.uniform1f(uniforms.uProgress,light/9);
      gl.uniform1f(uniforms.uFailed,state.status==='failed'?1:0);
      gl.uniform1fv(uniforms['uImpacts[0]'],impactAges);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    function tick(time){
      frame=0;if(!visible()||motion.matches)return;
      if(lastTick!==null){slowFrames=time-lastTick>50?slowFrames+1:Math.max(0,slowFrames-1);}
      lastTick=time;
      if(slowFrames>=12&&quality>.52){quality=Math.max(.5,quality*.8);slowFrames=0;resize();}
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
      }else if(completed>state.completed&&!motion.matches){
        for(let i=state.completed;i<completed;i++)impactTimes[i]=time;
        heatWaveUntil=time+2200;
      }
      if(status==='succeeded'&&state.status!=='succeeded')successAt=time;
      else if(status!=='succeeded')successAt=null;
      state={status,completed,currentIndex};host.dataset.phase=status;host.dataset.completed=String(completed);
      fallback?.update(state);reconcile();
    }
    function lost(event){
      event.preventDefault();contextLost=true;stop();canvas.style.visibility='hidden';
      if(!fallback){try{fallback=createFallback(host,state);host.dataset.renderer='compatibility';}catch{}}
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
    return Object.freeze({update,destroy});
  }

  function createFallback(host, initialState) {
    if (!host || typeof host.append !== 'function') throw new TypeError('A universe host is required');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.layer = 'space-compatibility';
    const hadClass = host.classList.contains('lights-universe');
    host.classList.add('lights-universe'); host.append(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let state = { status: 'idle', completed: 0, currentIndex: null };
    let width = 0, height = 0, dpr = 1, frame = 0, destroyed = false, intersecting = true;
    let lastPaint = -Infinity, lastMotionTime = 0, orbitTime = 0;
    let progressFrom = 0, progressAt = 0, successAt = null, confirmationAt = null, confirmationPower = 0;
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
      const map = document.createElement('canvas'); map.width = map.height = 384;
      const painter = map.getContext('2d'); if (!painter) return map;
      const data = painter.createImageData(384, 384);
      for (let y = 0; y < 384; y += 1) for (let x = 0; x < 384; x += 1) {
        const px = (x + .5) / 192 - 1, py = (y + .5) / 192 - 1, r = Math.hypot(px, py);
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
        const offset = (y * 384 + x) * 4;
        data.data[offset] = hot ? 190 + ridge * 65 : 43 + ridge * 104;
        data.data[offset + 1] = hot ? 123 + ridge * 119 : 29 + ridge * 76;
        data.data[offset + 2] = hot ? 103 + ridge * 121 : 27 + ridge * 63;
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
        radius: .13 + row * .024 + random() * .075, aspect: .61 + random() * .46,
        phase: random() * TAU, highlight: random(), texture: i % 3 };
    });
    function puffMap(hot, variant) {
      const map = document.createElement('canvas'); map.width = map.height = 128;
      const painter = map.getContext('2d'); if (!painter) return map;
      const data = painter.createImageData(128, 128);
      for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
        const px = (x + .5) / 64 - 1, py = (y + .5) / 64 - 1, r = Math.hypot(px, py);
        if (r > 1) continue;
        const n = fbm(px * 5.7 + 11 + variant * 13, py * 5.7 + 28 + variant * 9), grain = noise(px * 19.3 + 3, py * 19.3 + 5);
        const alpha = smooth((1 - r) * 3.7) * clamp(.87 + (n - .5) * .72);
        const height = Math.sqrt(Math.max(0, 1 - r * r));
        const light = clamp(.32 - px * .23 - py * .39 + height * .34 + (n - .5) * .24 + (grain - .5) * .045);
        const crest = smooth((light - .43) / .43), white = smooth((light - .45) / .28);
        const j = (y * 128 + x) * 4;
        data.data[j] = hot ? 235 + white * 20 : 8 + light * 75;
        data.data[j + 1] = hot ? 139 + white * 108 : 8 + light * 48;
        data.data[j + 2] = hot ? 121 + white * 113 : 14 + light * 44;
        data.data[j + 3] = alpha * (hot ? crest : 1) * 245;
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
      if (!visible()) { stop(); return; }
      paint(performance.now());
      if (motion.matches) stop(); else if (!frame) frame = requestAnimationFrame(tick);
    }
    function tick(time) {
      frame = 0;
      if (!visible() || motion.matches) { lastMotionTime = 0; return; }
      if (time - lastPaint >= 30) paint(time);
      frame = requestAnimationFrame(tick);
    }
    function resize() {
      if (destroyed) return;
      const rect = host.getBoundingClientRect(); width = rect.width; height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(800000 / Math.max(1, width * height)));
      const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      reconcile();
    }
    function progress(time) {
      const target = state.completed / 9;
      if (motion.matches || target <= progressFrom) return target;
      return progressFrom + (target - progressFrom) * smooth((time - progressAt) / 900);
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
        const tail = .09 + thread.spread * .12;
        ctx.lineWidth = .48 + thread.spread * .95;
        const tailPoint = bezier(start, c1, c2, end, Math.max(0, travel - tail));
        const headPoint = bezier(start, c1, c2, end, travel);
        const glow = (.025 + energy * .95) * Math.sin(travel * Math.PI) * thread.strength;
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
      }
      ctx.restore();
    }
    function cloudSea(time, energy, foreground) {
      ctx.save();
      for (const cloud of clouds) {
        if ((cloud.row >= 3) !== foreground) continue;
        const x = width * (cloud.x + Math.sin(time * TAU / 16 + cloud.phase) * .012);
        const y = height * (cloud.y + Math.cos(time * TAU / 16 + cloud.phase) * .004);
        const r = Math.min(width, height * .95) * cloud.radius;
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .74 + cloud.row * .055;
        ctx.drawImage(shadowPuffs[cloud.texture], x - r, y - r * cloud.aspect, r * 2, r * cloud.aspect * 2);
        const sourceDistance = Math.hypot((cloud.x - .77) * 1.4, (cloud.y - .68) * 2.1);
        const illumination = (.12 + .88 * Math.exp(-sourceDistance * 2.4)) * (.7 + cloud.highlight * .3);
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
      if (!motion.matches && lastMotionTime) orbitTime += Math.max(0, (time - lastMotionTime) / 1000);
      lastMotionTime = time; lastPaint = time;
      const t = motion.matches ? 3.5 : orbitTime % 16, theta = t * TAU / 16, energy = progress(time);
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
      ctx.save(); ctx.translate(cx, cy);
      diskHalf(radius, t, energy, false);
      lensArc(radius, t, energy);
      // Every far-side layer is now behind this fully opaque silhouette.
      ctx.fillStyle = '#010204'; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
      diskHalf(radius, t, energy, true);
      ctx.restore();
      streamVolume(radius, cx, cy, t, energy, true);
      infall(radius, cx, cy, t, energy, true);
      radial(cx + radius * .128, cy + radius * .241, 0, radius * .22, [[0, 'rgba(255,247,223,' + energy * .40 + ')'], [.28, 'rgba(247,181,144,' + energy * .14 + ')'], [1, 'rgba(130,70,50,0)']]);
      radial(width * .78, height * .69, 0, width * .145, [[0, 'rgba(255,247,225,' + energy * .48 + ')'], [.24, 'rgba(255,208,169,' + energy * .19 + ')'], [1, 'rgba(147,78,52,0)']]);
      cloudSea(t, energy, true);
      forwardDust(radius, cx, cy, t, energy);
      if (!motion.matches && confirmationAt !== null && state.status !== 'failed') {
        const age = (time - confirmationAt) / 1050;
        if (age >= 0 && age < 1) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(TILT); ctx.globalCompositeOperation = 'screen';
          const alpha = Math.sin(Math.PI * age) * confirmationPower;
          orbitStroke(radius * 1.42, .06 + age * 2.5, .44, 0, true,
            'rgba(255,239,215,' + alpha * .75 + ')', 1.1 + energy * .8);
          ctx.restore();
        }
      }
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
      const time = performance.now(), shown = progress(time);
      if (completed !== state.completed) { progressFrom = Math.min(shown, completed / 9); progressAt = time; }
      if (completed < state.completed || ['idle', 'queued', 'connecting', 'failed'].includes(status)) confirmationAt = null;
      else if (completed > state.completed) { confirmationAt = time; confirmationPower = Math.min(1, .45 + (completed - state.completed) * .2); }
      if (status === 'succeeded' && completed === 9 && state.status !== 'succeeded') successAt = time;
      else if (status !== 'succeeded' || completed !== 9) successAt = null;
      state = { status, completed, currentIndex };
      host.dataset.phase = status; host.dataset.completed = String(completed);
      reconcile();
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
      progressFrom = state.completed / 9; progressAt = performance.now();
    }
    host.dataset.phase = state.status; host.dataset.completed = String(state.completed); resize();
    return Object.freeze({ update, destroy });
  }

  window.LW5LightsUniverse=Object.freeze({create});
})();
