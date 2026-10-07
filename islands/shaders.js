// Procedural patterns in world coordinates: stable under camera movement.
export const noiseGLSL = `
float hash12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec2 hash22(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.103,.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+1.),f.x),f.y);}
float fbm(vec2 p){return noise2(p)*.55+noise2(p*2.03)*.28+noise2(p*4.09)*.13;}
float islandRadius(vec2 p){float back=1.-smoothstep(-.12,.48,p.y),a=atan(p.y,p.x);return length(p/vec2(1.45+.13*back,1.16+.30*back))*(1.+.042*sin(a*3.+.4)+.026*sin(a*5.-.8));}
float sandClearing(vec2 p,vec2 center,vec2 halfSize,float top,float margin,float h){float d=length(max(abs(p-center)-halfSize,0.));float blend=1.-smoothstep(0.,margin,d);return max(h,mix(h,top,blend));}
float bedHeight(vec2 p){float r=islandRadius(p);float h=-.32+.98*exp(-pow(r,5.))+.014*sin(p.x*8.+p.y*3.)*sin(p.y*9.)*exp(-r*r);h=sandClearing(p,vec2(-.16,-.40),vec2(.58,.46),.638,.28,h);return sandClearing(p,vec2(.84,.15),vec2(.255,.205),.615,.20,h);}
// The light-ray pass evolves with the same surface waves as the visible water.
uniform sampler2D uCaustic;
float caustics(vec2 p,float t){
 vec2 uv=vec2(p.x,-p.y)/7.2+.5;
 // A tiny reconstruction filter makes the focused rays soft below phone pixel size.
 vec2 texel=vec2(1./768.,0.);
 float c=texture2D(uCaustic,uv).r*.5;
 c+=(texture2D(uCaustic,uv+texel.xy).r+texture2D(uCaustic,uv-texel.xy).r+texture2D(uCaustic,uv+texel.yx).r+texture2D(uCaustic,uv-texel.yx).r)*.125;
 float focused=max(c-.16,0.);
 // Smooth highlight compression retains delicate filaments without chalk-white knots.
 return focused*1.55/(1.+focused*1.75);
}

`;
export const waveGLSL = `
uniform sampler2D uInteraction;
uniform vec2 uInteractionTexel;
vec3 interactionField(vec2 p){
 // Height and both world-space derivatives come from the same simulated surface.
 return texture2D(uInteraction,clamp(p/5.6+.5,vec2(0.),vec2(1.))*(1.-uInteractionTexel)+uInteractionTexel*.5).rgb;
}

// Smoothly warped, incommensurate wave directions avoid a repeated crosshatch.
// Height and gradient share this analytic field, keeping the visible surface and
// physical light-ray pass coherent as either time or the camera moves.
vec3 waveTerm(vec2 p,vec2 k,float phase,float amplitude){
 float a=dot(p,k)+phase;return vec3(amplitude*sin(a),amplitude*k*cos(a));
}
vec3 surfaceField(vec2 p,float t){
 t*=1.45;
 vec3 swell=waveTerm(p,vec2(2.8,1.6),-t*.52,.020)
           +waveTerm(p,vec2(-2.2,4.1),t*.43,.013)
           +waveTerm(p,vec2(6.8,3.7),t*.59,.0055);
 float a=dot(p,vec2(1.2,1.7))+t*.09;
 float b=dot(p,vec2(-1.6,.85))-t*.075;
 float c=dot(p,vec2(2.3,-.9))-t*.06;
 float d=dot(p,vec2(.7,2.6))+t*.08;
 vec2 q=p+vec2(.17*sin(a)+.075*sin(c),.15*cos(b)+.055*sin(d));
 vec2 dqx=vec2(1.,0.)+.17*cos(a)*vec2(1.2,1.7)+.075*cos(c)*vec2(2.3,-.9);
 vec2 dqy=vec2(0.,1.)-.15*sin(b)*vec2(-1.6,.85)+.055*cos(d)*vec2(.7,2.6);
 vec3 ripple=waveTerm(q,vec2(24.44,6.35),-t*.42,.00323)
            +waveTerm(q,vec2(-9.99,28.49),t*.35+1.7,.002465)
            +waveTerm(q,vec2(17.15,-22.01),-t*.31+2.8,.00204)
            +waveTerm(q,vec2(-33.89,-7.83),t*.27+.4,.001275)
            +waveTerm(q,vec2(7.29,39.56),-t*.37+3.7,.000935);
 return swell+vec3(ripple.x,ripple.y*dqx+ripple.z*dqy)*.72+interactionField(p);
}
float waveHeight(vec2 p,float t){return surfaceField(p,t).x;}
vec2 waveSlope(vec2 p,float t){return surfaceField(p,t).yz;}
`;
