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
uniform float uSuccess,uPulse,uProgress,uCompleted,uCurrent,uFailed,uFinishAge;
uniform float uImpacts[9];
float hash13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;vec2 v=texture2D(uNoise,(uv+.5)/128.).rg;return mix(v.x,v.y,f.z);}
float fbm(vec3 p){float n=.5*noise3(p);p=p*2.02+17.3;n+=.25*noise3(p);p=p*2.04+11.7;n+=.125*noise3(p);p=p*2.01+7.2;n+=.0625*noise3(p);p=p*2.03+11.7;n+=.03125*noise3(p);return n;}
mat2 turn(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float dust(vec3 p){
 // Advect a coherent volume around the hole; inner clouds overtake the outer bank.
 vec2 orbit=p.xz-vec2(0.,10.);
 float radial=length(orbit);
 // Bounded differential shear avoids winding the clouds into finer stripes over time.
 float angle=uTime*.24+.22*radial+.55*exp(-radial*.13)*sin(uTime*.35);
 vec2 q=turn(angle)*orbit;
 float n=fbm(vec3(q.x*1.35,p.y*2.2,q.y*1.35));
 float strand=sin(radial*1.9+atan(orbit.y,orbit.x)*2.-uTime*.32)*.028;
 return max(0.,n-.47-p.y*.31+strand);
}
vec3 aces(vec3 c){return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);}
// Original procedural stellar studies. Linear HDR output; compose before ACES.
// Requires existing noise3/hash13, uTime/uCompleted/uCurrent/uFailed/uImpacts.
mat2 stRotate(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

vec3 stPhotosphere(vec2 p,vec3 ember,vec3 hot,float seed,float strength,float pixel){
 float rr=length(p),ang=atan(p.y,p.x),edge=rr-1.;
 vec3 colour=vec3(0.);
 // Uneven coronal streamers are rooted to the rotating sphere, not a soft disk.
 vec2 orbit=stRotate(uTime*.075+seed)*vec2(cos(ang),sin(ang));
 float stream=noise3(vec3(orbit*7.4,seed+uTime*.11));
 float fine=noise3(vec3(orbit*19.,seed-uTime*.15));
 float corona=exp(-max(edge,0.)*(4.6+stream*4.))*smoothstep(-pixel,pixel,edge);
 colour+=mix(ember,hot,.38)*corona*(.10+stream*.21+pow(fine,4.)*.48)*strength;
 colour+=hot*.055*exp(-rr*1.35)*strength;
 if(rr<1.+pixel){
  float z=sqrt(max(0.,1.-rr*rr));
  vec3 surface=vec3(p,z);
  surface.xz=stRotate(uTime*.16+seed)*surface.xz;
  float convection=noise3(surface*7.8+vec3(seed,0.,uTime*.22));
  float granules=noise3(surface*29.+vec3(seed*3.,uTime*.48,0.));
  float cells=pow(smoothstep(.18,.86,granules),1.35);
  float filaments=pow(1.-abs(sin((convection*3.+granules)*10.)),10.);
  float spots=smoothstep(.67,.89,noise3(surface*5.4+seed*2.))*smoothstep(.3,.8,z);
  float limb=.36+.64*pow(max(z,0.),.55);
  vec3 plasma=mix(ember*.34,hot,.26+cells*.61);
  plasma*=limb*(.72+convection*.7)*(1.-spots*.72);
  plasma+=hot*filaments*.27*limb;
  colour+=plasma*strength*(1.-smoothstep(1.-pixel,1.+pixel,rr));
 }
 // Three real projected magnetic loops: elliptical arcs outside the photosphere.
 for(int f=0;f<3;f++){
  float q=float(f),a=seed*.81+q*2.19+sin(uTime*.19+q)*.13;
  vec2 radial=vec2(cos(a),sin(a)),tangent=vec2(-radial.y,radial.x);
  float rise=.29+.11*sin(uTime*.32+seed+q);
  vec2 loop=vec2((dot(p,radial)-1.035)/(.23+rise),dot(p,tangent)/(.13+q*.025));
  float curve=abs(length(loop)-1.);
  float thread=exp(-curve*31.)+.23*exp(-curve*9.);
  float flicker=.63+.37*sin(uTime*.58+q+seed);
  float mask=smoothstep(.96,1.04,rr)*(1.-smoothstep(1.72,1.93,rr));
  colour+=mix(ember,hot,.64)*thread*mask*(.46+.25*flicker)*strength;
 }
 return colour;
}

vec3 stCluster(vec2 p,float seed,vec3 gas,vec3 stars,float variant,float strength){
 vec2 turn=stRotate(uTime*(.018+variant*.006)+seed)*p;
 float dist=length(turn*vec2(.86,1.14));
 float fog=noise3(vec3(turn*2.3,seed+uTime*.06));
 fog+=.5*noise3(vec3(turn*5.1+13.,seed-uTime*.08));
 float veil=pow(max(0.,fog-.24),2.)*exp(-dist*dist*1.4);
 vec3 colour=gas*veil*.27*strength;
 if(variant>1.5){
  float a=atan(turn.y,turn.x);
  float tendril=pow(.5+.5*sin(a*3.+dist*6.-uTime*.12),4.);
  colour+=mix(gas,stars,.3)*tendril*exp(-abs(dist-.9)*4.)*.045*strength;
 }
 // Fixed seeded stars have depth, unequal temperatures and individual scintillation.
 // Only evaluated inside this cluster's small screen-space bounding disk.
 for(int s=0;s<38;s++){
  float k=float(s),h=hash13(vec3(k,seed,8.1)),h2=hash13(vec3(seed,k,3.7));
  float a=k*2.399963+seed;
  float r=pow(h,variant<.5?.48:.85)*(variant<.5?1.42:1.22);
  vec2 at=vec2(cos(a),sin(a))*r;
  at.y*=.72+.12*variant;
  at.x+=sin(k*1.7)*.07;
  float d=length(turn-at);
  float core=exp(-d*(140.-h2*45.));
  float glow=exp(-d*22.)*.055;
  float life=.82+.18*sin(uTime*(.7+h2)+k*3.1);
  vec3 temperature=mix(vec3(1.,.57,.23),stars,h2*.84+.16);
  colour+=temperature*(core*(.40+h2*.62)+glow)*life*strength;
  if(s<4){
   vec2 off=turn-at;
   float ray=exp(-abs(off.x)*260.-abs(off.y)*24.)+exp(-abs(off.y)*260.-abs(off.x)*24.);
   colour+=temperature*ray*.085*strength;
  }
 }
 return colour;
}

vec3 stellarField(vec2 screenUv,float aspect,float unit){
 vec3 sum=vec3(0.);
 float landscape=step(1.35,aspect),sizeBoost=mix(1.,1.55,landscape);
 float spread=min(aspect*.62,.82);
 for(int j=0;j<9;j++){
  float k=float(j),row=floor(k/3.),column=mod(k,3.);
  vec2 at=vec2((column-1.)*spread+sin(k*1.8)*spread*.065,
    -.14-row*.235+sin(k*1.71)*.025);
  if(landscape>.5){
   float second=step(4.5,k),col=k-second*5.;
   float count=mix(5.,4.,second);
   float reach=min(aspect*.73,1.85);
   at=vec2((col-(count-1.)*.5)*(reach*2./(count-1.)),mix(-.18,-.58,second)+sin(k*1.5)*.018);
  }
  float radius=(.031+hash13(vec3(k,6.,2.))*.008)*sizeBoost;
  if(j==2)radius*=1.18;
  if(j==4||j==5||j==7||j==8)radius=.054*sizeBoost;
  vec2 p=(screenUv-at)/radius;
  float dist=length(p);
  // No detailed noise/particle work elsewhere on the screen.
  if(dist<3.8){
   float lit=1.-step(uCompleted,k);
   float selected=1.-step(.4,abs(uCurrent-k-1.));
   float failed=uFailed*selected;
   float age=uImpacts[j];
   float grow=age<0.?1.:smoothstep(0.,.85,age);
   float strength=lit*grow;
   float pixel=max(.018,2./max(1.,unit)/radius);
   float seed=k*1.73+2.6;
   vec3 ember=vec3(.98,.20,.025),hot=vec3(1.6,.94,.28);
   if(j==1){ember=vec3(.06,.29,.95);hot=vec3(.78,1.15,1.65);}
   if(j==2){ember=vec3(.66,.025,.008);hot=vec3(1.5,.37,.10);}
   if(j==3){ember=vec3(.43,.35,.76);hot=vec3(1.35,1.43,1.65);}
   if(j==6){ember=vec3(.02,.29,.52);hot=vec3(.32,1.45,1.65);}
   vec3 body=vec3(0.);
   if(strength>.001){
    if(j==4){
     body=stCluster(p,seed,vec3(.8,.23,.025),vec3(1.35,1.01,.49),0.,strength);
    }else if(j==5){
     body=stCluster(p,seed,vec3(.49,.10,.79),vec3(.79,.82,1.6),2.,strength);
     body+=stPhotosphere((p-vec2(.10,.02))/.29,vec3(.21,.10,.66),vec3(.82,.63,1.6),seed,strength*.38,pixel/.29);
    }else if(j==7){
     body=stCluster(p,seed,vec3(.64,.09,.26),vec3(1.4,.77,.74),1.,strength);
     body+=vec3(1.2,.56,.34)*exp(-dot(p,p)*18.)*.20*strength;
    }else if(j==8){
     body=stCluster(p,seed,vec3(.07,.32,.60),vec3(.67,1.08,1.65),2.,strength);
     body+=stPhotosphere((p+vec2(.12,.01))/.34,vec3(.96,.19,.02),vec3(1.65,.98,.34),seed,strength*.65,pixel/.34);
    }else if(j==1){
     vec2 orbit=vec2(cos(uTime*.16+.4),sin(uTime*.16+.4)*.52)*.68;
     body=stPhotosphere((p-orbit)/.67,ember,hot,seed,strength,pixel/.67);
     body+=stPhotosphere((p+orbit)/.43,vec3(.60,.20,.035),vec3(1.4,.86,.35),seed+2.,strength*.8,pixel/.43);
     float belt=abs(length(p/vec2(1.35,.73))-1.);
     body+=vec3(.24,.46,.88)*exp(-belt*30.)*.018*strength;
    }else{
     body=stPhotosphere(p,ember,hot,seed,strength,pixel);
     if(j==3){
      float cross=exp(-abs(p.x)*55.-abs(p.y)*1.7)+exp(-abs(p.y)*55.-abs(p.x)*1.7);
      body+=hot*cross*.15*strength;
     }
     if(j==6){
      vec2 beam=stRotate(-.45+sin(uTime*.14)*.12)*p;
      float jets=exp(-abs(beam.x)*28.)*exp(-abs(beam.y)*.92)*smoothstep(.8,1.22,abs(beam.y));
      float belt=exp(-abs(length(p/vec2(1.75,.56))-1.)*42.);
      body+=hot*(jets*.42+belt*.085)*strength;
     }
    }
   }
   // Dim unlit seeds and a restrained current-item breath never imply completion.
   float waiting=.0028+selected*(1.-lit)*(1.-uFailed)*(.006+.005*sin(uTime*2.));
   sum+=vec3(.44,.51,.64)*exp(-dist*23.)*waiting;
   sum+=body*(1.-smoothstep(2.8,3.8,dist));
   if(lit>.5&&age>=0.&&age<1.25){
    float front=age*2.2+.95;
    float ripple=exp(-abs(dist-front)*36.)*pow(1.-age/1.25,2.);
    sum+=hot*ripple*.11;
   }
   if(failed>.5){
    float edge=exp(-abs(dist-1.15)*25.);
    sum+=vec3(1.1,.10,.018)*(edge*.11+exp(-dist*9.)*.3);
   }
  }
 }
 return sum;
}

void main(){
 float unit=uRes.y,aspect=uRes.x/uRes.y;
 vec2 screenUv=(gl_FragCoord.xy*2.-uRes)/unit;
 // Keep the complete horizon inside a phone, independent of its aspect ratio.
 float framing=min(.49,aspect*.84);
 vec2 uv=(screenUv-vec2(0.,.34))*1.30/framing;
 float roll=-.045+sin(uTime*.085)*.009;
 uv=mat2(cos(roll),-sin(roll),sin(roll),cos(roll))*uv;
 uv.x+=sin(uTime*.095)*.018;
 float radius=1.30+sin(uTime*.06)*.012;
 float r=length(uv),edge=r-radius;
 float outer=smoothstep(-.004,.006,edge);
 float a=atan(uv.y,uv.x);
 vec3 flow=vec3(turn(uTime*.18)*uv*2.2,uTime*.025);
 float n=fbm(flow);
 float wisps=fbm(vec3(cos(a+uTime*.22)*4.,sin(a+uTime*.22)*4.,sqrt(max(edge,0.))*9.));
 float side=.24+1.7*exp(-length(uv-vec2(-1.26,-.10))*1.9);
 vec3 col=vec3(.0005,.0007,.001);
 // Background dust is stretched into the lens halo; the black core stays clear.
 float halo=exp(-max(edge,0.)*3.4)*(.02+pow(n,2.)*.34+pow(wisps,3.)*.3)*outer;
 col+=vec3(.92,.76,.60)*halo*side;
 float horizonVisibility=smoothstep(-.12,.20,uv.y);
 float photon=exp(-abs(edge)/max(.0035,1.2/unit))*horizonVisibility;
 col+=vec3(1.,.94,.83)*photon*2.7*side*(1.+uSuccess*.65);
 col+=vec3(.92,.77,.58)*exp(-abs(edge)*22.)*.28*side*mix(.15,1.,outer)*horizonVisibility;
 col+=vec3(.75,.55,.35)*exp(-abs(edge)*5.)*.07*side*outer*horizonVisibility;
 // Sparse stars only outside the silhouette.
 vec2 grid=uv*135.;vec2 cell=floor(grid);float star=hash13(vec3(cell,3.));
 float dotStar=exp(-length(fract(grid)-.5)*17.)*step(.994,star);
 col+=vec3(.8,.86,1.)*dotStar*outer*.8;
 // A single powerful backlight at the left horizon, soft enough to bloom.
 vec2 lightPosition=vec2(-1.25,-.18);
 float lightDistance=length((uv-lightPosition)*vec2(.8,1.));
 col+=vec3(1.,.88,.72)*(.13*exp(-lightDistance*3.1)+.7*exp(-lightDistance*13.));
 float diskY=uv.y+.23;
 col+=vec3(.82,.68,.51)*exp(-abs(diskY)*36.)*(.045+.2*exp(-abs(uv.x+.8)*2.));
 // World-space foreground: nearer formations move faster and absorb the light.
 vec3 ro=vec3(sin(uTime*.07)*.1,1.2,0.);
 vec3 rd=normalize(vec3(uv.x,uv.y*.7-.08,1.95));
 float travel=1.7,transmittance=1.;vec3 scatter=vec3(0.);
 vec3 lightDir=normalize(vec3(-.8,.5,.15));
 for(int i=0;i<48;i++){
  vec3 p=ro+rd*travel;
  float stepSize=.23+travel*.027;
  if(p.y<1.2){
   float density=dust(p);
   if(density>.007){
    float diff=clamp((density-dust(p+lightDir*.34))*5.,0.,1.);
    float shadow=exp(-dust(p+lightDir*.8)*4.);
    float left=1.8*exp(-abs(p.x+travel*.48)*.45)+.05;
    float illumination=.006+diff*shadow*left*.26;
    vec3 colour=vec3(.79,.68,.55)*illumination;
    colour+=vec3(.24,.21,.17)*exp(-travel*.1)*.014;
    colour*=1.+uSuccess*.35+uPulse*.08;
    float alpha=1.-exp(-density*stepSize*5.5);
    scatter+=transmittance*colour*alpha;
    transmittance*=1.-alpha;
    if(transmittance<.018)break;
   }
  }
  travel+=stepSize;
  if(travel>30.)break;
 }
 // The near cloud bank falls into shadow so the foreground stars keep their colour.
 scatter*=mix(.20,1.,smoothstep(-.82,.1,screenUv.y));
 col=col*transmittance+scatter;
 // An original small navigation ring gives the scene a human scale.
 vec2 ship=uv-vec2(.20+sin(uTime*.12)*.13,-.03+cos(uTime*.16)*.015);
 float sa=.3+sin(uTime*.15)*.1;
 ship=mat2(cos(sa),-sin(sa),sin(sa),cos(sa))*ship;
 float hull=abs(length(ship/vec2(.014,.030))-1.);
 float metal=exp(-hull*12.);
 col+=vec3(.35,.32,.27)*metal*(.24+.65*step(ship.x,0.));
 // A single confirmation wave travels through the foreground, never fake progress.
 if(uFinishAge>=0.&&uFinishAge<3.&&uSuccess>0.){
  float front=exp(-abs(length(uv-lightPosition)-uFinishAge*.82)*35.);
  col+=vec3(.9,.65,.32)*front*max(0.,1.-uFinishAge/3.)*.24*(1.-smoothstep(.0,.25,uv.y));
 }
 col+=vec3(1.,.86,.68)*exp(-lightDistance*7.)*.16;
 // Local optical glow spills across the lit ridge, with a faint anamorphic streak.
 float streak=exp(-abs(uv.y+.23)*200.)*exp(-abs(uv.x+.8)*1.5);
 col+=vec3(.75,.61,.43)*streak*.05;
 col+=stellarField(screenUv,aspect,unit);
 col=aces(col*1.3);
 col=pow(col,vec3(.4545));
 float grain=(hash13(vec3(gl_FragCoord.xy,fract(uTime)*32.))-.5)/255.;
 gl_FragColor=vec4(col+grain,1.);
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
    let state={status:'idle',completed:0,currentIndex:null}, successAt=null;
    const impactTimes=Array(9).fill(-Infinity), epoch=performance.now();
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
      for(const name of ['uRes','uTime','uNoise','uSuccess','uPulse','uProgress','uCompleted','uCurrent','uFailed','uFinishAge','uImpacts[0]']) uniforms[name]=gl.getUniformLocation(program,name);
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
      const ages=impactTimes.map(start=>motion.matches?-1:Math.min(9,(time-start)/1000));
      let success=state.status==='succeeded'?(motion.matches?1:Math.min(1,(time-successAt)/1000)):0;
      success=success*success*(3-2*success);
      gl.useProgram(program);gl.uniform2f(uniforms.uRes,canvas.width,canvas.height);gl.uniform1f(uniforms.uTime,t);
      gl.uniform1f(uniforms.uFinishAge,state.status==='succeeded'&&!motion.matches?(time-successAt)/1000:-1);gl.uniform1f(uniforms.uSuccess,success);gl.uniform1f(uniforms.uProgress,state.completed/9);
      gl.uniform1f(uniforms.uPulse,Math.max(0,...ages.map(a=>a>=0?1-a*2:0)));
      gl.uniform1f(uniforms.uCompleted,state.completed);gl.uniform1f(uniforms.uCurrent,state.currentIndex||0);gl.uniform1f(uniforms.uFailed,state.status==='failed'?1:0);
      gl.uniform1fv(uniforms['uImpacts[0]'],ages);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    function tick(time){
      frame=0;if(!visible()||motion.matches)return;
      if(lastTick!==null){slowFrames=time-lastTick>68?slowFrames+1:Math.max(0,slowFrames-1);}
      lastTick=time;
      if(slowFrames>=12&&quality>.52){quality=Math.max(.5,quality*.8);slowFrames=0;resize();}
      if(time-lastPaint>=30)paint(time);
      if(!frame)frame=requestAnimationFrame(tick);
    }
    function update(next={}){
      if(destroyed)return;
      const status=PHASES.has(next.status)?next.status:'idle';
      const completed=Math.min(9,Math.max(0,Number.isFinite(next.completed)?Math.floor(next.completed):0));
      const currentIndex=Number.isInteger(next.currentIndex)&&next.currentIndex>=1&&next.currentIndex<=9?next.currentIndex:null;
      const time=performance.now();
      if(completed<state.completed||['idle','connecting','queued'].includes(status))impactTimes.fill(-Infinity);
      else if(status!=='failed')for(let i=state.completed;i<completed;i++)impactTimes[i]=time;
      if(status==='succeeded'&&state.status!=='succeeded')successAt=time;
      else if(status!=='succeeded')successAt=null;
      state={status,completed,currentIndex};host.dataset.phase=status;host.dataset.completed=String(completed);
      fallback?.update(state);reconcile();
    }
    function lost(event){
      event.preventDefault();contextLost=true;stop();canvas.style.visibility='hidden';
      if(!fallback){try{fallback=createFallback(host);fallback.update(state);host.dataset.renderer='compatibility';}catch{}}
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

  function createFallback(host) {
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

  window.LW5LightsUniverse=Object.freeze({create});
})();
