import {sensorView} from './portrait-core.js';
export function attachRoomMotion(scene,button,status){
 let base=null,pending=false,active=false,timer=null,generation=0;
 const stop=(text='')=>{generation++;window.removeEventListener('deviceorientation',update);clearTimeout(timer);active=pending=false;button.disabled=false;button.textContent='开启体感';button.setAttribute('aria-pressed','false');scene.host.dataset.motion='off';if(text)status.textContent=text;};
 const update=e=>{
  if(document.hidden||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma)||scene.entered)return;
  if(!base)base={beta:e.beta,gamma:e.gamma};
  const v=sensorView(e.beta,e.gamma,base,screen.orientation?.angle??window.orientation??0);if(!v)return;
  if(pending){pending=false;active=true;clearTimeout(timer);button.disabled=false;button.textContent='体感已开启';button.setAttribute('aria-pressed','true');scene.host.dataset.motion='on';status.textContent='轻轻倾斜手机 · 点击轮盘走近';}
  if(active)scene.roomTarget.set(v.yaw*1.75*Math.PI/180,v.pitch*1.5*Math.PI/180);
 };
 button.addEventListener('click',async()=>{
  if(active){stop('拖动微调视角 · 点击轮盘走近');return;}if(pending)return;
  if(!window.isSecureContext||!window.DeviceOrientationEvent){status.textContent='当前环境不支持体感，可以拖动查看';return;}
  pending=true;button.disabled=true;button.textContent='连接体感';const id=++generation;
  try{
   if(typeof DeviceOrientationEvent.requestPermission==='function'){
    const permission=await DeviceOrientationEvent.requestPermission();
    if(id!==generation)return;
    if(permission!=='granted'){stop('未开启体感权限，仍可拖动查看');return;}
   }
   if(scene.entered){stop();return;}base=null;window.addEventListener('deviceorientation',update,{passive:true});
   timer=setTimeout(()=>{if(pending)stop('暂未收到体感数据，可以拖动查看');},3500);
  }catch{stop('此打开方式暂不支持体感，可以拖动查看');}
 });
 window.addEventListener('orientationchange',()=>{base=null;scene.roomTarget.set(0,0)});
 document.addEventListener('visibilitychange',()=>{base=null});scene.stopMotion=()=>stop();return stop;
}
