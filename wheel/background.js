import * as THREE from './vendor/three.module.min.js';
// Low-resolution animated light field; independent of the wheel's camera.
export class CosmicBackground {
  constructor(host,reduced=false){
    this.reduced=reduced;this.energy=0;this.last=0;this.time=0;
    this.renderer=new THREE.WebGLRenderer({alpha:false,antialias:false,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,.85));
    host.append(this.renderer.domElement);
    this.uniforms={uTime:{value:0},uResolution:{value:new THREE.Vector2()},uEnergy:{value:0}};
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,depthTest:false,depthWrite:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`
      precision mediump float;
      varying vec2 vUv;uniform float uTime,uEnergy;uniform vec2 uResolution;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+2.4;a*=.5;}return n;}
      void main(){
        vec2 uv=vUv, p=(uv-.5)*vec2(uResolution.x/uResolution.y,1.);float t=uTime*.024;
        float cloud=fbm(p*3.0+vec2(t,-t*.6));
        float warp=fbm(p*2.5+vec2(cloud,t*.45));
        float ribbon=exp(-abs(p.y-.36*sin(p.x*2.4+t+warp*2.8))*(5.+warp*4.));
        float ribbon2=exp(-abs(p.y+.25+.35*sin(p.x*2.7-t*.8+cloud*2.)) * 8.);
        vec3 color=vec3(.018,.027,.085);
        color+=mix(vec3(.11,.035,.32),vec3(.015,.22,.28),smoothstep(-.8,.65,p.x+cloud-.4))*ribbon*(.32+cloud*1.1);
        color+=vec3(.08,.18,.24)*ribbon2*(.14+warp*.5);
        color+=vec3(.16,.055,.25)*pow(cloud,3.)*.6;
        vec2 grid=uv*vec2(uResolution.x/uResolution.y,1.)*260.;vec2 id=floor(grid);vec2 local=fract(grid)-.5;
        float star=step(.994,hash(id));float core=exp(-dot(local,local)*140.);
        color+=star*core*(.5+.5*sin(uTime*.55+hash(id+3.)*60.))*vec3(.55,.8,1.);
        color+=vec3(.04,.19,.15)*uEnergy*ribbon;
        float vignette=1.-smoothstep(.2,.85,length(uv-.5));color*=.6+.4*vignette;
        gl_FragColor=vec4(color,1.);
      }`});
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    this.resize=()=>{this.renderer.setSize(innerWidth,innerHeight);this.uniforms.uResolution.value.set(innerWidth,innerHeight);this.render()};
    window.addEventListener('resize',this.resize);this.resize();
    this.loop=this.loop.bind(this);this.frame=requestAnimationFrame(this.loop);
  }
  render(){this.uniforms.uTime.value=this.time;this.uniforms.uEnergy.value=this.reduced?0:this.energy;this.renderer.render(this.scene,this.camera)}
  loop(now){this.frame=requestAnimationFrame(this.loop);if(document.hidden){this.last=now;return}if(now-this.last<40)return;const dt=Math.min((now-this.last)/1000,.1);this.last=now;if(!this.reduced){this.time+=dt;this.render()}}
  setEnergy(e){this.energy=e}
  setReduced(value){this.reduced=value;this.render()}
}
