export const DEFAULT_PITCH = 0;
export const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
export function dragView(yaw,pitch,dx,dy,width){
  const sensitivity=Math.PI*2/Math.max(width,240);
  return {yaw:yaw+dx*sensitivity,pitch:clamp(pitch+dy*sensitivity,-1.35,1.35)};
}
export function frontYaw(yaw){return Math.round(yaw/(Math.PI*2))*Math.PI*2;}

// Fixed-room view is intentionally bounded, but remembers a swipe after release.
export function dragRoomView(yaw,pitch,dx,dy,width,height){
 return {yaw:clamp(yaw+dx/Math.max(width,240)*.42,-.14,.14),pitch:clamp(pitch+dy/Math.max(height,240)*.30,-.095,.095)};
}
