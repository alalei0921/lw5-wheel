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

// Coherent world-space cloud matter follows an annulus around the hole.
// Rotation advects the noise itself; there is no scrolling billboard or radial bar.
float dust(vec3 p){
 vec2 orbit=p.xz-vec2(0.,10.);
 float radial=length(orbit);
 if(radial<=2.4||radial>=14.||p.y>=1.55)return 0.;
 float ring=smoothstep(2.4,3.9,radial)*(1.-smoothstep(10.5,14.,radial));
 float roof=1.-smoothstep(.25,1.55,p.y);
 if(ring*roof<.002)return 0.;
 float angle=uTime*.19+radial*.17+.32*sin(uTime*.23-radial*.19);
 vec2 q=turn(angle)*orbit;
 float volume=fbm(vec3(q.x*1.23,p.y*2.05,q.y*1.23));
 float strands=.032*sin(radial*2.4+atan(orbit.y,orbit.x)*2.-uTime*.41);
 return max(0.,volume-.43-p.y*.26+strands)*ring*roof;
}

// Each successful acknowledgement injects a short, overlapping thermal packet.
// Time never creates progress: only real uImpacts entries can launch these waves.
float thermalPackets(float angle,float radial){
 float heat=0.;
 for(int j=0;j<9;j++){
  float age=uImpacts[j];
  if(age>=0.&&age<3.8){
   float life=sin(clamp(age/3.8,0.,1.)*3.14159265);
   float front=float(j)*1.83-age*2.25;
   float arc=exp(-(1.-cos(angle-front))*17.);
   float spread=exp(-abs(radial-(1.37+age*.12))*6.5);
   heat+=arc*spread*life*.34;
  }
 }
 return min(heat,1.2);
}

void main(){
 float unit=uRes.y,aspect=uRes.x/uRes.y;
 vec2 screenUv=(gl_FragCoord.xy*2.-uRes)/unit;
 float framing=min(.62,aspect*.77);
 vec2 uv=(screenUv-vec2(0.,.10))*1.24/framing;
 uv=turn(-.095+sin(uTime*.075)*.007)*uv;
 uv.x+=sin(uTime*.061)*.009;
 float pixel=2.48/max(1.,unit)/framing;
 float r=length(uv),angle=atan(uv.y,uv.x),edge=r-1.24;
 float outside=smoothstep(-pixel,pixel,edge);
 float progress=clamp(uProgress,0.,1.);
 // Every stage raises each radiance channel. White heat appears gradually.
 float power=.19+progress*1.72+progress*progress*.62;
 float breath=1.+smoothstep(.88,1.,progress)*sin(uTime*.63)*.026;
 power*=breath;
 vec3 hot=mix(vec3(1.,.29,.075),vec3(1.46,1.08,.69),progress);
 vec3 warm=mix(vec3(.52,.16,.045),vec3(.90,.36,.13),progress);
 vec3 col=vec3(.00035,.00055,.00085);

 // Sparse distant starlight remains behind the silhouette and absorbing dust.
 vec2 grid=uv*104.;vec2 cell=floor(grid);
 float star=hash13(vec3(cell,7.3));
 float pin=exp(-length(fract(grid)-.5)*20.)*step(.996,star);
 col+=vec3(.42,.52,.70)*pin*.23*outside;
 float background=fbm(vec3(uv*.38,3.1));
 col+=vec3(.0012,.0016,.0024)*pow(background,2.)*outside;

 // Inclined accretion plane: the rear is occulted, the near bank crosses low.
 vec2 disk=vec2(uv.x,(uv.y+.36)/.225);
 float dr=length(disk),da=atan(disk.y,disk.x);
 vec2 advected=turn(uTime*.235+.19*dr)*disk;
 float diskNoise=fbm(vec3(advected*3.0,4.4));
 float filament=noise3(vec3(advected*10.2,7.1));
 float diskMask=smoothstep(1.10,1.30,dr)*(1.-smoothstep(2.8,3.75,dr));
 float rear=smoothstep(-.36,-.29,uv.y);
 float diskVisible=mix(1.,outside,rear);
 float heat=thermalPackets(da,dr);
 float beaming=.40+1.45*exp(-length(disk-vec2(-1.65,-.12))*.77);
 float bands=.34+.66*pow(.5+.5*sin(dr*22.+diskNoise*8.),2.);
 float diskBody=pow(max(0.,diskNoise-.12),1.45)*bands;
 float innerBurn=exp(-abs(dr-1.38)*5.1);
 vec2 fastSide=(disk-vec2(-1.20,-.82))*vec2(.94,1.12);
 float blueShift=exp(-dot(fastSide,fastSide)*1.9);
 vec3 diskHot=mix(hot,vec3(1.30,1.52,1.70),progress*blueShift*.78);
 vec3 diskRadiance=diskHot*(.11+diskBody*.60)*innerBurn;
 diskRadiance+=warm*diskBody*.19;
 diskRadiance*=diskMask*diskVisible*beaming*(power+heat*1.8);
 col+=diskRadiance;
 // Thermal spill is broad and asymmetric, with no anamorphic camera cross.
 float diskBloom=exp(-abs(uv.y+.36)*7.4)*exp(-abs(uv.x)*.55);
 col+=warm*diskBloom*.019*power*mix(.18,1.,outside);

 // The far side appears as a warped, turbulent lens arc above the black core.
 vec2 lensOrbit=turn(uTime*.15)*vec2(cos(angle),sin(angle));
 float lensNoise=fbm(vec3(lensOrbit*4.4,max(edge,0.)*8.));
 float threads=noise3(vec3(lensOrbit*13.,max(edge,0.)*29.-uTime*.16));
 float upper=smoothstep(-.20,.31,uv.y);
 float doppler=.34+1.18*pow(.5-.5*cos(angle),1.7);
 float arch=exp(-max(edge,0.)*7.)*outside*upper;
 float ribbon=pow(.5+.5*sin(edge*55.+lensNoise*9.+angle*1.2),5.);
 float lensTexture=.075+lensNoise*.21+threads*.065+ribbon*.12;
 float lensHeat=thermalPackets(angle,1.55);
 float shoulder=exp(-pow((angle-2.25)*3.2,2.));
 vec3 lensHot=mix(hot,vec3(1.25,1.44,1.66),progress*shoulder*.70);
 col+=lensHot*arch*lensTexture*doppler*(power+lensHeat*2.3);
 col+=warm*exp(-max(edge,0.)*2.4)*outside*upper*.047*power;
 // A narrow physical photon edge, not repeated decorative concentric rings.
 float photonWidth=max(.0042,pixel*.75);
 float photon=exp(-pow(abs(edge)/photonWidth,1.35));
 float horizon=.32+.68*upper;
 col+=lensHot*photon*horizon*doppler*(power+lensHeat*1.5)*.93;
 col+=hot*exp(-abs(edge)*38.)*outside*horizon*power*.055;
 // Barely separated cool outer light and warm inner light give optical depth.
 float dispersion=exp(-abs(edge-.018)*95.)*outside*upper;
 col+=vec3(.031,.066,.12)*dispersion*power*(.24+.36*smoothstep(-.6,.7,uv.x));

 // A long ray through thick orbiting clouds resolves ridges, troughs and shadows.
 vec3 ro=vec3(sin(uTime*.053)*.07,1.38,0.);
 vec3 rd=normalize(vec3(uv.x,uv.y*.64-.035,2.22));
 vec3 lightDir=normalize(vec3(-.75,.57,.25));
 float travel=1.55,transmittance=1.;
 vec3 scatter=vec3(0.);
 for(int i=0;i<44;i++){
  vec3 p=ro+rd*travel;
  float stepSize=.23+travel*.028;
  if(p.y>=1.6&&rd.y>=0.)break;
  if(p.y<1.6){
   float density=dust(p);
   if(density>.006){
    float toward=dust(p+lightDir*.38);
    float rim=clamp((density-toward)*5.5,0.,1.);
    float shade=exp(-toward*3.1);
    float radial=length(p.xz-vec2(0.,10.));
    float irradiance=exp(-abs(radial-4.4)*.58)*(.25+.75*smoothstep(3.,8.,travel));
    float approach=.12+1.45*exp(-abs(p.x+travel*.39)*.42);
    float backscatter=.0025+pow(rim,1.65)*shade*approach*.22;
    // Unlit troughs remain cool; illuminated fibers become copper then ivory.
    vec3 cloud=vec3(.0018,.0029,.0055)*exp(-travel*.033)*(1.-rim*.5);
    cloud+=warm*backscatter*irradiance*(.18+power*.52+heat*1.8);
    cloud+=hot*pow(rim,3.)*shade*irradiance*.039*(power+heat*2.1);
    float alpha=1.-exp(-density*stepSize*5.25);
    scatter+=transmittance*cloud*alpha;
    transmittance*=1.-alpha;
    if(transmittance<.018)break;
   }
  }
  travel+=stepSize;
  if(travel>30.)break;
 }
 col=col*transmittance+scatter;
 // The near emitting disk lies in front of much of the absorbing cloud column.
 // Its broken ridges remain readable across the lower third of the silhouette;
 // thin nearer wisps still attenuate them instead of erasing the whole disk.
 float nearDisk=1.-smoothstep(-.40,-.30,uv.y);
 float veil=.58+.42*noise3(vec3(uv*7.5,uTime*.11));
 float diskTransmission=nearDisk*(.38+.34*smoothstep(.15,.64,diskNoise))*veil;
 col+=diskRadiance*max(0.,diskTransmission-transmittance);
 // Local scattered backlight survives the near cloud bank, preserving depth.
 float leftGlow=length((uv-vec2(-1.23,-.30))*vec2(.9,1.2));
 col+=hot*exp(-leftGlow*7.5)*.022*power;
 // A final settling warmth stays localized to the disk rather than flashing white.
 col+=warm*diskBloom*.008*clamp(uSuccess,0.,1.);
 // Keep inactive failure visibly restrained; progress remains the confirmed count.
 col*=1.-uFailed*.055;
 float vignette=1.-smoothstep(.55,1.9,length(screenUv*vec2(1./max(aspect,.4),.77)))*.24;
 col=aces(col*vignette*1.28);
 col=pow(col,vec3(.4545));
 float grain=(hash13(vec3(gl_FragCoord.xy,fract(uTime)*31.))-.5)/510.;
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
      let seed=13211;const values=new Uint8Array(128*128);
      for(let i=0;i<values.length;i++){seed=(seed*16807)%2147483647;values[i]=Math.floor(seed/2147483647*256);}
      const pixels=new Uint8Array(128*128*4);
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){
        const i=(y*128+x)*4;pixels[i]=values[y*128+x];pixels[i+1]=values[((y+17)%128)*128+(x+37)%128];pixels[i+2]=pixels[i];pixels[i+3]=255;
      }
      texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,128,128,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
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
      paint(performance.now());
      if(motion.matches)stop();else if(!frame)frame=requestAnimationFrame(tick);
    }
    function resize(){
      if(destroyed)return;
      const rect=host.getBoundingClientRect();width=rect.width;height=rect.height;
      const scale=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(520000/Math.max(1,width*height)))*quality;
      const w=Math.max(2,Math.round(width*scale)),h=Math.max(2,Math.round(height*scale));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      if(!contextLost)gl.viewport(0,0,w,h);
      reconcile();
    }
    function paint(time){
      if(destroyed||contextLost||!program||!width||!height)return;
      lastPaint=time;
      const t=motion.matches?3:(time-epoch)/1000;
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
      const interval=time<heatWaveUntil && quality>=.8?15:30;
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
    const stars = Array.from({ length: 116 }, () => ({ x: random(), y: random(),
      radius: .25 + random() * .65, alpha: .06 + random() * .25 }));
    const trails = Array.from({ length: 46 }, () => ({ phase: random() * TAU,
      radius: .40 + random() * .56, speed: .72 + random() * .5, span: .018 + random() * .055 }));
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
        if (r > 1 || r < .17) continue;
        const angle = Math.atan2(py, px) + 1.35 * Math.log(r + .12);
        const sx = Math.cos(angle) * r, sy = Math.sin(angle) * r;
        const body = fbm(sx * 8.3 + 23, sy * 8.3 + 11);
        const creases = noise(sx * 36 + body * 3, sy * 36 + body * 3);
        const band = Math.exp(-Math.pow((r - .58) / .23, 2)) + .40 * Math.exp(-Math.pow((r - .84) / .10, 2));
        const edge = smooth((r - .17) / .12) * smooth((1 - r) / .13);
        const density = clamp((body - .25) * 2.25) * band * edge;
        const ridge = clamp((body - .27) * 1.7 + (creases - .5) * .15);
        const offset = (y * 384 + x) * 4;
        data.data[offset] = hot ? 175 + ridge * 80 : 48 + ridge * 110;
        data.data[offset + 1] = hot ? 105 + ridge * 137 : 27 + ridge * 78;
        data.data[offset + 2] = hot ? 42 + ridge * 171 : 15 + ridge * 42;
        data.data[offset + 3] = clamp(density * (hot ? .78 : .87)) * 255;
      }
      painter.putImageData(data, 0, 0); return map;
    }
    const copperCloud = cloudMap(false), hotCloud = cloudMap(true);
    const frontCanvas = document.createElement('canvas'), frontCtx = frontCanvas.getContext('2d');

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
      if (frontCanvas.width !== w || frontCanvas.height !== h) { frontCanvas.width = w; frontCanvas.height = h; }
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
    function cloudLayer(map, rx, ry, angle, alpha, composite, painter) {
      painter.save(); painter.globalCompositeOperation = composite; painter.globalAlpha = alpha;
      painter.scale(rx, ry); painter.rotate(angle); painter.drawImage(map, -1, -1, 2, 2); painter.restore();
    }
    function orbitalBank(radius, t, energy, foreground, painter = ctx) {
      painter.save(); painter.rotate(-.055); painter.translate(0, radius * .36);
      const turn = t * .17;
      cloudLayer(copperCloud, radius * 2.65, radius * .56, turn, .46, 'source-over', painter);
      cloudLayer(hotCloud, radius * 2.65, radius * .56, turn, .08 + energy * .46, 'screen', painter);
      cloudLayer(copperCloud, radius * 2.16, radius * .40, turn * 1.3 + 2.8, .21, 'source-over', painter);
      cloudLayer(hotCloud, radius * 2.16, radius * .40, turn * 1.3 + 2.8, .035 + energy * .33, 'screen', painter);
      if (foreground) {
        // Nearer clouds spread in perspective; the differential rotation remains coherent.
        cloudLayer(copperCloud, radius * 3.75, radius * 1.62, turn * .68 + 1.9, .42, 'source-over', painter);
        cloudLayer(hotCloud, radius * 3.75, radius * 1.62, turn * .68 + 1.9, .045 + energy * .30, 'screen', painter);
        cloudLayer(hotCloud, radius * 3.1, radius * 1.04, turn * .91 + .7, .02 + energy * .17, 'screen', painter);
      }
      // Tangential streamlines share the cloud bank's orbital motion.
      painter.globalCompositeOperation = 'screen';
      for (let i = 0; i < trails.length; i += 1) {
        const trail = trails[i], a = trail.phase + turn * trail.speed;
        const rx = radius * (1.05 + trail.radius * 1.4), ry = rx * .21;
        const brightSide = .36 + .64 * Math.pow(.5 + .5 * Math.cos(a + .5), 2);
        stroke('rgba(255,213,153,' + (.035 + energy * .27) * brightSide + ')', .45 + energy * .35,
          pen => pen.ellipse(0, 0, rx, ry, 0, a, a + trail.span), painter);
      }
      painter.restore();
    }
    function foregroundBank(radius, t, energy, cx, cy) {
      if (!frontCtx) return;
      frontCtx.setTransform(1, 0, 0, 1, 0, 0); frontCtx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
      frontCtx.setTransform(dpr, 0, 0, dpr, cx * dpr, cy * dpr); frontCtx.globalAlpha = 1;
      frontCtx.globalCompositeOperation = 'source-over'; orbitalBank(radius, t, energy, true, frontCtx);
      // A soft optical depth boundary avoids a straight clipped seam through the core.
      frontCtx.save(); frontCtx.rotate(-.055); frontCtx.globalCompositeOperation = 'destination-in';
      const mask = frontCtx.createLinearGradient(0, radius * .12, 0, radius * .52);
      mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(.40, 'rgba(0,0,0,.08)'); mask.addColorStop(1, '#000');
      frontCtx.fillStyle = mask; frontCtx.fillRect(-width * 2, -height * 2, width * 4, height * 4); frontCtx.restore();
      ctx.drawImage(frontCanvas, -cx, -cy, width, height);
    }
    function paint(time) {
      if (!ctx || !width || !height || destroyed) return;
      if (!motion.matches && lastMotionTime) orbitTime += Math.min(.1, Math.max(0, (time - lastMotionTime) / 1000));
      lastMotionTime = time; lastPaint = time;
      const t = motion.matches ? 3.5 : orbitTime, energy = progress(time);
      const radius = Math.min(height * .31, width * .385), cx = width * .5, cy = height * .45;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#030407'; ctx.fillRect(0, 0, width, height);
      for (const star of stars) {
        const x = star.x * width, y = star.y * height;
        if (Math.hypot(x - cx, y - cy) < radius * 1.04) continue;
        ctx.fillStyle = 'rgba(199,201,212,' + star.alpha + ')';
        ctx.beginPath(); ctx.arc(x, y, star.radius, 0, TAU); ctx.fill();
      }
      ctx.save(); ctx.translate(cx, cy);
      radial(-radius * .68, -radius * .18, radius * .64, radius * 2.5,
        [[0, 'rgba(117,70,29,' + (.035 + energy * .055) + ')'], [.45, 'rgba(89,52,25,' + (.018 + energy * .028) + ')'], [1, 'rgba(0,0,0,0)']]);
      orbitalBank(radius, t, energy, false);
      // The upper lensed arc gains heat in nine true increments, while the core stays black.
      radial(0, 0, radius * .94, radius * 1.35,
        [[0, 'rgba(236,158,66,0)'], [.13, 'rgba(255,199,117,' + (.12 + energy * .31) + ')'], [.27, 'rgba(223,140,54,' + (.025 + energy * .12) + ')'], [1, 'rgba(116,66,24,0)']]);
      ctx.fillStyle = '#010204'; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
      const rim = ctx.createLinearGradient(-radius, -radius, radius, radius);
      rim.addColorStop(0, 'rgba(255,234,189,' + (.40 + energy * .57) + ')');
      rim.addColorStop(.46, 'rgba(247,188,98,' + (.26 + energy * .52) + ')');
      rim.addColorStop(1, 'rgba(141,79,31,' + (.10 + energy * .28) + ')');
      stroke(rim, .65 + energy * .7, () => ctx.arc(0, 0, radius * 1.006, Math.PI * .98, Math.PI * 2.07));
      stroke('rgba(220,144,64,' + (.055 + energy * .10) + ')', .6, () => ctx.arc(0, 0, radius * 1.007, .12, Math.PI * .98));
      foregroundBank(radius, t, energy, cx, cy);
      // A warm inner arc is partially hidden by the near clouds, never divided into nodes.
      ctx.save(); ctx.rotate(-.055); ctx.globalCompositeOperation = 'screen';
      const inner = ctx.createLinearGradient(-radius * 1.9, 0, radius * 1.9, 0);
      inner.addColorStop(0, 'rgba(181,101,32,0)'); inner.addColorStop(.22, 'rgba(255,184,84,' + (.10 + energy * .32) + ')');
      inner.addColorStop(.44, 'rgba(255,240,207,' + (.17 + energy * .61) + ')'); inner.addColorStop(.73, 'rgba(221,137,51,' + (.06 + energy * .22) + ')'); inner.addColorStop(1, 'rgba(181,101,32,0)');
      stroke(inner, .8 + energy * .65, () => ctx.ellipse(0, radius * .36, radius * 1.88, radius * .30, 0, .02, Math.PI - .02));
      for (let i = 1; i <= 4; i += 1) stroke('rgba(255,200,123,' + (.015 + energy * .038) / i + ')', 1.1 + i * 1.1,
        () => ctx.ellipse(0, radius * .36, radius * (1.88 + i * .012), radius * (.30 + i * .007), 0, .08, Math.PI - .08));
      if (!motion.matches && confirmationAt !== null && state.status !== 'failed') {
        const age = (time - confirmationAt) / 1050;
        if (age >= 0 && age < 1) {
          const a = .12 + age * 2.55, alpha = Math.sin(Math.PI * age) * confirmationPower;
          stroke('rgba(255,231,180,' + alpha * .67 + ')', 1.2 + energy * .6,
            () => ctx.ellipse(0, radius * .36, radius * 1.88, radius * .30, 0, a, a + .34));
          stroke('rgba(255,185,92,' + alpha * .075 + ')', radius * .045,
            () => ctx.ellipse(0, radius * .36, radius * 1.88, radius * .30, 0, a - .1, a + .44));
        }
      }
      if (!motion.matches && successAt !== null && state.completed === 9) {
        const age = (time - successAt) / 1800;
        if (age >= 0 && age < 1) {
          const spread = radius * (1.7 + age * 1.2);
          stroke('rgba(255,219,157,' + Math.sin(Math.PI * age) * (1 - age) * .14 + ')', 1.1,
            () => ctx.ellipse(0, radius * .36, spread, spread * .23, 0, .04, Math.PI - .04));
        }
      }
      ctx.restore(); ctx.restore();
      // Leave the bottom edge calm for the existing count and status controls.
      const fade = ctx.createLinearGradient(0, height * .83, 0, height);
      fade.addColorStop(0, 'rgba(3,4,7,0)'); fade.addColorStop(1, 'rgba(3,4,7,.64)');
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = fade; ctx.fillRect(0, height * .83, width, height * .17);
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
      canvas.remove(); copperCloud.width = copperCloud.height = hotCloud.width = hotCloud.height = frontCanvas.width = frontCanvas.height = 0;
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
