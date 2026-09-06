import {segments,TAU} from './wheel-core.js';
import {RoulettePhysics} from './physics.js';
import {Soundtrack} from './audio.js';
const $=id=>document.getElementById(id);
if(window.self!==window.top)document.body.classList.add('embedded');
const preference=(key,fallback)=>{try{return localStorage.getItem(key)??fallback}catch{return fallback}};
const save=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
const reduceQuery=matchMedia('(prefers-reduced-motion: reduce)');
let reduced=preference('lw5-reduced-motion',String(reduceQuery.matches))==='true';
let muted=preference('lw5-sound-muted','false')==='true';
const audio=new Soundtrack(muted);
let room=null,entered=false,scene=null,background=null,angle=0,spinning=false,ready=false,lastResult=null,spinFrame=0;
let fallbackTexture=null;const simulation=new RoulettePhysics({onCollision:hit=>audio.impact(hit)});
function renderPrefs(){$('soundText').textContent=muted?'音效关闭':'音效开启';$('muteBtn').classList.toggle('muted',muted);$('muteBtn').setAttribute('aria-pressed',String(muted));$('muteBtn').setAttribute('aria-label',muted?'开启音效':'关闭音效');document.body.classList.toggle('reduced-motion',reduced);scene?.setReduced(reduced);background?.setReduced(reduced)}
renderPrefs();$('spinBtn').disabled=true;$('centerStart').disabled=true;
$('muteBtn').addEventListener('click',()=>{muted=!muted;audio.unlock();audio.setMuted(muted);save('lw5-sound-muted',String(muted));renderPrefs()});
reduceQuery.addEventListener('change',e=>{reduced=e.matches;renderPrefs()});
function cryptorandom(){if(globalThis.crypto?.getRandomValues){const b=new Uint32Array(1);crypto.getRandomValues(b);return b[0]/4294967296}return Math.random()}
function setStatus(text){$('status').replaceChildren();const dot=document.createElement('span');dot.className='status-dot';$('status').append(dot,document.createTextNode(text))}
function drawFallback(){const c=$('fallbackCanvas').getContext('2d');c.clearRect(0,0,900,900);c.save();c.translate(450,450);c.rotate(angle);c.drawImage(fallbackTexture,-279.45,-279.45,558.9,558.9);c.restore();const p=simulation.ball.position;c.beginPath();c.arc(450+p.x*115,450-p.z*115,13,0,TAU);c.fillStyle='#fff5d6';c.shadowColor='#ffe1a4';c.shadowBlur=12;c.fill();c.shadowBlur=0;}
async function init(){try{const {WheelScene,makeWheelTexture}=await import('./scene.js');fallbackTexture=makeWheelTexture(900);try{scene=new WheelScene($('scene'),{reduced,onStart:startSpin});}catch(error){console.warn('3D unavailable; using the accessible canvas wheel.',error);$('scene').replaceChildren();$('fallbackWheel').hidden=false;$('resetView').hidden=true;drawFallback();}}catch(error){console.error('Wheel could not load',error);setStatus('轮盘加载失败，请刷新重试');$('loadingMark').querySelector('span').textContent='加载失败，请刷新页面';return}ready=true;$('spinBtn').disabled=false;$('centerStart').disabled=false;$('loadingMark').classList.add('loaded');setTimeout(()=>$('loadingMark').hidden=true,450)}
async function initRoom(){
 await init();
 try{const {CasinoRoom}=await import('./room.js');room=new CasinoRoom($('casinoRoom'),{reduced,onEnter:enterWheel})}catch(error){console.warn('Room relief unavailable',error);$('casinoRoom').addEventListener('click',enterWheel);$('casinoRoom').addEventListener('keydown',e=>{if(e.key==='Enter')enterWheel()})}
}
function enterWheel(){if(entered||!ready)return;entered=true;audio.unlock();document.body.classList.add('approaching');scene?.enter();setTimeout(()=>{document.body.classList.remove('room-view','approaching');document.body.classList.add('table-view');document.querySelector('.casino-dock').inert=false;$('casinoRoom').hidden=true;$('scene').tabIndex=0;$('centerStart').tabIndex=0;$('scene').focus({preventScroll:true});room?.dispose()},reduced?60:1650)}
$('homeBtn').href=location.pathname.includes('/wheel/')?'../':'https://alalei0921.github.io/lw5-wheel/';
initRoom();
function startSpin(){
 if(spinning||!ready||!entered)return;spinning=true;scene?.setSpinning(true);$('centerStart').disabled=true;$('spinBtn').disabled=true;audio.unlock();audio.stop();audio.start();$('spinText').textContent='蓄力中';$('spinProgress').style.width='0%';setStatus('准备投球…');
 const charge=reduced?0:480;let last=performance.now(),chargeElapsed=0,accumulator=0,launched=false,phase='charge';
 function frame(now){
  if(document.hidden){last=now;spinFrame=requestAnimationFrame(frame);return}
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(!launched){chargeElapsed+=dt*1000;scene?.setEnergy(charge?chargeElapsed/charge:0);if(chargeElapsed>=charge){simulation.launch(cryptorandom);launched=true;audio.startRolling()}}
  else{
   accumulator+=dt;while(accumulator>=1/120&&simulation.running){simulation.step(1/120);accumulator-=1/120}
   angle=simulation.angle;if(scene)scene.updatePhysics(simulation);else drawFallback();
   const p=simulation.ball.position,r=Math.hypot(p.x,p.z),speed=simulation.ball.velocity.length();audio.updateRolling(speed,p.x,p.y);const energy=Math.min(1,speed/7);scene?.setEnergy(reduced?0:energy);background?.setEnergy(reduced?0:energy);$('spinProgress').style.width=`${Math.min(96,simulation.time/13*100)}%`;
   const next=r>2.45?'roll':simulation.stableTime>.12?'settle':'bounce';if(next!==phase){phase=next;$('spinText').textContent=next==='roll'?'滚动中':next==='bounce'?'碰撞中':'落定中';setStatus('')}
   if(!simulation.running){
    audio.stopRolling();scene?.setEnergy(0);background?.setEnergy(0);$('spinProgress').style.width='100%';
    if(simulation.failed||simulation.result===null){spinning=false;scene?.setSpinning(false);$('spinBtn').disabled=false;$('centerStart').disabled=false;$('spinText').textContent='重新投球';setStatus('这次小球没有落稳，再投一次吧');return}
    lastResult=segments[simulation.result];$('scene').dataset.resultIndex=String(simulation.result);audio.reveal(lastResult.tier==='gold');scene?.celebrate(lastResult.tier==='gold',simulation.result);setStatus(`小球落在：${lastResult.label}`);$('flash').className=`celebration-flash ${lastResult.tier==='gold'?'gold ':''}fire`;
    setTimeout(()=>{showResult(lastResult);spinning=false;scene?.setSpinning(false);$('centerStart').disabled=false;$('spinBtn').disabled=false;$('spinText').textContent='投球';$('spinProgress').style.width='0%'},reduced?150:950);return;
   }
  }
  spinFrame=requestAnimationFrame(frame);
 }
 spinFrame=requestAnimationFrame(frame);
}
function showResult(result){const gold=result.tier==='gold';$('resultDialog').classList.toggle('gold',gold);$('resultTitle').textContent=result.label;$('resultKicker').textContent=gold?'今晚的特别惊喜':'今天的美味是';$('resultEyebrow').textContent=gold?'A GOLDEN LITTLE SURPRISE':'THE UNIVERSE HAS DECIDED';$('resultDescription').textContent=result.label==='➕奶茶'?'今天的快乐，加一杯奶茶。':result.label==='尊贵蛋包饭'?'专属蛋包饭，藏着只属于你的偏爱。':gold?'今天值得一顿特别的大餐。':'和你一起，吃什么都是好日子。';$('acceptBtn').replaceChildren(document.createTextNode(result.label==='➕奶茶'?'就喝这杯 ♡':result.label==='尊贵蛋包饭'?'就吃这个 ♡':'就吃这家 ♡'));$('resultDialog').showModal();$('acceptBtn').focus();$('flash').classList.remove('fire')}
$('spinBtn').addEventListener('click',startSpin);
$('centerStart').addEventListener('click',startSpin);$('resetView').addEventListener('click',()=>scene?.resetView());
$('resultClose').addEventListener('click',()=>$('resultDialog').close());
$('acceptBtn').addEventListener('click',()=>{audio.confirm();$('resultDialog').close();setStatus(`就决定了：${lastResult.label} ♡`)});
$('againBtn').addEventListener('click',()=>{$('resultDialog').close();startSpin()});
$('resultDialog').addEventListener('close',()=>$('spinBtn').focus());
$('menuList').replaceChildren(...segments.map((seg,i)=>{const item=document.createElement('div');item.className=`menu-item ${seg.tier}`;const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');item.append(number,document.createTextNode(seg.label));return item}));
let menuOpener=null;function openMenu(e){menuOpener=e.currentTarget;$('menuDialog').showModal()}
$('menuBtn').addEventListener('click',openMenu);$('menuClose').addEventListener('click',()=>$('menuDialog').close());$('menuDialog').addEventListener('close',()=>menuOpener?.focus());
for(const dialog of [$('menuDialog'),$('resultDialog')])dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close()});
window.addEventListener('pagehide',()=>{audio.stop()});
