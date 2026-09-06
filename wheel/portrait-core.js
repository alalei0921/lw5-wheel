export const MAX_YAW=4,MAX_PITCH=3;
export const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export const angleDelta=(value,base)=>((value-base+540)%360)-180;
export function sensorView(beta,gamma,base,screenAngle=0){
 if(!Number.isFinite(beta)||!Number.isFinite(gamma)||!base)return null;
 const b=angleDelta(beta,base.beta),g=angleDelta(gamma,base.gamma),a=screenAngle*Math.PI/180;
 return {yaw:clamp((g*Math.cos(a)+b*Math.sin(a))*.2,-MAX_YAW,MAX_YAW),pitch:clamp((b*Math.cos(a)-g*Math.sin(a))*.15,-MAX_PITCH,MAX_PITCH)};
}
export function dragPortrait(yaw,pitch,dx,dy,width,height){
 return {yaw:clamp(yaw-dx/Math.max(width,240)*12,-MAX_YAW,MAX_YAW),pitch:clamp(pitch+dy/Math.max(height,240)*10,-MAX_PITCH,MAX_PITCH)};
}
