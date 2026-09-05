import {segments,slice,TAU,pickIndex,targetAngle,indexAtPointer,spinEase} from './wheel-core.js';
import {Soundtrack} from './audio.js';
const $=id=>document.getElementById(id);
if(window.self!==window.top)document.body.classList.add('embedded');
const preference=(key,fallback)=>{try{return localStorage.getItem(key)??fallback}catch{return fallback}};
const save=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
const reduceQuery=matchMedia('(prefers-reduced-motion: reduce)');
let reduced=preference('lw5-reduced-motion',String(reduceQuery.matches))==='true';
let muted=preference('lw5-sound-muted','false')==='true';
const audio=new Soundtrack(muted);
let scene=null,background=null,angle=0,spinning=false,ready=false,lastResult=null,spinFrame=0;
let fallbackTexture=null;
function renderPrefs(){$('soundText').textContent=muted?'音效关闭':'音效开启';$('muteBtn').classList.toggle('muted',muted);$('muteBtn').setAttribute('aria-pressed',String(muted));$('muteBtn').setAttribute('aria-label',muted?'开启音效':'关闭音效');$('motionText').textContent=reduced?'柔和模式':'动态光影';$('motionBtn').setAttribute('aria-pressed',String(reduced));$('motionBtn').setAttribute('aria-label',reduced?'开启动态光影':'切换柔和模式');document.body.classList.toggle('reduced-motion',reduced);scene?.setReduced(reduced);background?.setReduced(reduced)}
renderPrefs();$('spinBtn').disabled=true;$('centerStart').disabled=true;
import('./background.js').then(({CosmicBackground})=>{try{background=new CosmicBackground($('cosmicBackground'),reduced)}catch(error){console.warn('Using the static nebula background.',error)}});
$('muteBtn').addEventListener('click',()=>{muted=!muted;audio.unlock();audio.setMuted(muted);save('lw5-sound-muted',String(muted));renderPrefs()});
$('motionBtn').addEventListener('click',()=>{reduced=!reduced;save('lw5-reduced-motion',String(reduced));renderPrefs()});
reduceQuery.addEventListener('change',e=>{reduced=e.matches;renderPrefs()});
function cryptorandom(){if(globalThis.crypto?.getRandomValues){const b=new Uint32Array(1);crypto.getRandomValues(b);return b[0]/4294967296}return Math.random()}
function setStatus(text){$('status').replaceChildren();const dot=document.createElement('span');dot.className='status-dot';$('status').append(dot,document.createTextNode(text))}
function setAngle(value){angle=value;if(scene)scene.setAngle(angle);else drawFallback()}
function drawFallback(){const c=$('fallbackCanvas').getContext('2d');c.clearRect(0,0,900,900);c.save();c.translate(450,450);c.rotate(-angle);c.drawImage(fallbackTexture,-450,-450,900,900);c.restore();}
async function init(){try{const {WheelScene,makeWheelTexture}=await import('./scene.js');fallbackTexture=makeWheelTexture(900);try{scene=new WheelScene($('scene'),{reduced,onStart:startSpin});}catch(error){console.warn('3D unavailable; using the accessible canvas wheel.',error);$('scene').replaceChildren();$('fallbackWheel').hidden=false;$('resetView').hidden=true;$('dragHint').textContent='轻量转盘';drawFallback();$('controlHint').textContent='轻量转盘已就绪 · 点击开启今天的美味';}}catch(error){console.error('Wheel could not load',error);setStatus('星空暂时没有连上，请刷新重试');$('loadingMark').querySelector('span').textContent='加载失败，请刷新页面';return}ready=true;$('spinBtn').disabled=false;$('centerStart').disabled=false;$('loadingMark').classList.add('loaded');setTimeout(()=>$('loadingMark').hidden=true,450)}
init();
function startSpin(){if(spinning||!ready)return;spinning=true;scene?.setSpinning(true);$('centerStart').disabled=true;audio.unlock();audio.stop();audio.start();$('spinBtn').disabled=true;$('spinText').textContent='正在蓄积星光';$('spinProgress').style.width='0%';setStatus('让宇宙想一想…');
  const resultIndex=pickIndex(cryptorandom),startAngle=angle,goal=targetAngle(resultIndex,angle,reduced?0:6+Math.floor(cryptorandom()*2),(cryptorandom()-.5)*2);
  const start=performance.now(),duration=reduced?900:6500,charge=reduced?0:450;
  let lastTick=indexAtPointer(angle),lastPhase='charge';
  function frame(now){const elapsed=now-start,t=Math.min(1,Math.max(0,(elapsed-charge)/duration));
    const eased=reduced?t:spinEase(t);setAngle(startAngle+(goal-startAngle)*eased);
    const energy=elapsed<charge?elapsed/charge:Math.pow(Math.sin(t*Math.PI),.7);scene?.setEnergy(reduced?0:energy);background?.setEnergy(energy);if(t>.90)scene?.resetView();
    $('spinProgress').style.width=`${t*100}%`;
    const phase=elapsed<charge?'charge':t<.52?'spin':t<.9?'slow':'stop';if(phase!==lastPhase){lastPhase=phase;$('spinText').textContent=phase==='spin'?'美味穿梭中':phase==='slow'?'答案越来越近':'即将揭晓';setStatus(phase==='spin'?'星光流转，好事将近':phase==='slow'?'命运正在靠近你的那一格':'准备好迎接今天的美味')}
    const at=indexAtPointer(angle);if(at!==lastTick){lastTick=at;audio.tick(energy);scene?.tick()}
    if(t<1){spinFrame=requestAnimationFrame(frame)}else{scene?.setEnergy(0);background?.setEnergy(0);lastResult=segments[resultIndex];audio.reveal(lastResult.tier==='gold');scene?.celebrate(lastResult.tier==='gold');$('flash').className=`celebration-flash ${lastResult.tier==='gold'?'gold ':''}fire`;setStatus(`今天的美味：${lastResult.label}`);setTimeout(()=>{showResult(lastResult);spinning=false;scene?.setSpinning(false);$('centerStart').disabled=false;$('spinBtn').disabled=false;$('spinText').textContent='再让命运安排';$('spinProgress').style.width='0%'},reduced?80:650)}
  }
  spinFrame=requestAnimationFrame(frame);
}
function showResult(result){const gold=result.tier==='gold';$('resultDialog').classList.toggle('gold',gold);$('resultTitle').textContent=result.label;$('resultKicker').textContent=gold?'宇宙给你的特别偏爱':'今天的美味是';$('resultEyebrow').textContent=gold?'A GOLDEN LITTLE SURPRISE':'THE UNIVERSE HAS DECIDED';$('resultDescription').textContent=result.label==='➕奶茶'?'今天的快乐，加一杯奶茶。':result.label==='尊贵蛋包饭'?'专属蛋包饭，藏着只属于你的偏爱。':gold?'今天值得一顿特别的大餐。':'和你一起，吃什么都是好日子。';$('acceptBtn').replaceChildren(document.createTextNode(result.label==='➕奶茶'?'就喝这杯 ♡':result.label==='尊贵蛋包饭'?'就吃这个 ♡':'就吃这家 ♡'));$('resultDialog').showModal();$('acceptBtn').focus();$('flash').classList.remove('fire')}
$('spinBtn').addEventListener('click',startSpin);
$('centerStart').addEventListener('click',startSpin);$('resetView').addEventListener('click',()=>scene?.resetView());
$('resultClose').addEventListener('click',()=>$('resultDialog').close());
$('acceptBtn').addEventListener('click',()=>{audio.confirm();$('resultDialog').close();setStatus(`就决定了：${lastResult.label} ♡`)});
$('againBtn').addEventListener('click',()=>{$('resultDialog').close();startSpin()});
$('resultDialog').addEventListener('close',()=>$('spinBtn').focus());
$('menuList').replaceChildren(...segments.map((seg,i)=>{const item=document.createElement('div');item.className=`menu-item ${seg.tier}`;const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');item.append(number,document.createTextNode(seg.label));return item}));
let menuOpener=null;function openMenu(e){menuOpener=e.currentTarget;$('menuDialog').showModal()}
$('menuBtn').addEventListener('click',openMenu);$('mobileMenuBtn').addEventListener('click',openMenu);$('menuClose').addEventListener('click',()=>$('menuDialog').close());$('menuDialog').addEventListener('close',()=>menuOpener?.focus());
for(const dialog of [$('menuDialog'),$('resultDialog')])dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close()});
window.addEventListener('pagehide',()=>{audio.stop()});
