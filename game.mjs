import * as THREE from './vendor/three.module.min.js';
import {DT,clamp,angleDelta,createCourse,rampHeight,spawn,step,policy,applyControl,recommend} from './physics.mjs';
import {toRenderPoint,toRenderForward} from './view-space.mjs';

const $=id=>document.getElementById(id);
const canvas=$('view'),menu=$('menu'),error=$('error');
const held={a:false,d:false};
let course=createCourse(),state=spawn(course),active=false,demo=false,checkpoint=0;
let accumulator=0,lastFrame=null,physicsCount=0,guide=null,guideVisible=true;
let rate=1,sensitivity=.14*Math.PI/180,actualInput=0,toastUntil=0,lastProgress=1;
const format=(n,digits=0)=>n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setClearColor(0x142635);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x142635,2600,16000);
const camera=new THREE.PerspectiveCamera(60,1,2,23000);camera.up.set(0,0,1);
scene.add(new THREE.AmbientLight(0xb5d4e5,1.5));
const sunlight=new THREE.DirectionalLight(0xffedce,2.8);sunlight.position.set(...toRenderPoint(-1000,-2000,5000));scene.add(sunlight);
const floorZ=course.at(-1).c-720;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(24000,13000),new THREE.MeshStandardMaterial({color:0x132b3a,roughness:1}));floor.position.set(4500,0,floorZ);scene.add(floor);
const grid=new THREE.GridHelper(24000,120,0x3b5b6d,0x244353);grid.rotation.x=Math.PI/2;grid.position.set(4500,0,floorZ+1);grid.material.transparent=true;grid.material.opacity=.42;scene.add(grid);
const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=128;
const textureContext=textureCanvas.getContext('2d');
textureContext.fillStyle='#dde5ea';textureContext.fillRect(0,0,128,128);textureContext.fillStyle='#cad6de';textureContext.fillRect(0,0,64,64);textureContext.fillRect(64,64,64,64);
textureContext.strokeStyle='#a2b5c0';textureContext.lineWidth=1;textureContext.strokeRect(.5,.5,127,127);textureContext.beginPath();textureContext.moveTo(64,0);textureContext.lineTo(64,128);textureContext.moveTo(0,64);textureContext.lineTo(128,64);textureContext.stroke();
const texture=new THREE.CanvasTexture(textureCanvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const sideMaterial=new THREE.MeshStandardMaterial({color:0x263c4c,roughness:.95,side:THREE.DoubleSide});
const targets=[];
function quad(points,material,uvs=null){
  const geometry=new THREE.BufferGeometry();const order=[0,1,2,0,2,3],positions=[],uv=[];
  for(const i of order){positions.push(...toRenderPoint(...points[i]));if(uvs)uv.push(...uvs[i]);}
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(uvs)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);return mesh;
}
function labelSprite(text){
  const c=document.createElement('canvas');c.width=256;c.height=128;const p=c.getContext('2d');
  p.fillStyle='#102637';p.fillRect(4,4,248,120);p.strokeStyle='#6e9aad';p.lineWidth=2;p.strokeRect(4,4,248,120);
  p.textAlign='center';p.fillStyle='#e8f3f6';p.font='500 60px Segoe UI,Arial';p.fillText(text,128,77);p.fillStyle='#8caaba';p.font='16px Segoe UI,Arial';p.fillText('RAMPA',128,106);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true}));sprite.scale.set(180,90,1);return sprite;
}
for(const r of course){
  const a=[r.x0,r.y0,rampHeight(r,r.y0)],b=[r.x1,r.y0,rampHeight(r,r.y0)],c=[r.x1,r.y1,rampHeight(r,r.y1)],d=[r.x0,r.y1,rampHeight(r,r.y1)];
  const topMaterial=new THREE.MeshStandardMaterial({map:texture,color:r.id%2?0x7895a7:0x8d99a0,roughness:.92,side:THREE.DoubleSide});
  const top=quad([a,b,c,d],topMaterial,[[0,0],[13.5,0],[13.5,7.2],[0,7.2]]);
  const base=r.c-70,lowA=[r.x0,r.y0,base],lowB=[r.x1,r.y0,base],lowC=[r.x1,r.y1,base],lowD=[r.x0,r.y1,base];
  quad([a,b,lowB,lowA],sideMaterial);quad([b,c,lowC,lowB],sideMaterial);quad([c,d,lowD,lowC],sideMaterial);quad([d,a,lowA,lowD],sideMaterial);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(top.geometry),new THREE.LineBasicMaterial({color:0xbcd4dc,transparent:true,opacity:.4}));scene.add(edges);
  const sprite=labelSprite(String(r.id).padStart(2,'0'));sprite.position.set(...toRenderPoint(r.x0+160,r.side*450,r.c+700));scene.add(sprite);
  const target=new THREE.Mesh(new THREE.RingGeometry(32,37,48),new THREE.MeshBasicMaterial({color:0x72e4d9,transparent:true,opacity:.9,side:THREE.DoubleSide}));
  const ty=r.side*220;target.position.set(...toRenderPoint(r.id===6?r.x1-100:r.x0+400,ty,rampHeight(r,ty)+5));target.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...toRenderPoint(r.n.x,r.n.y,r.n.z)));scene.add(target);targets.push(target);
}
const predictionGeometry=new THREE.BufferGeometry();const predictionData=new Float32Array(400*3);predictionGeometry.setAttribute('position',new THREE.BufferAttribute(predictionData,3));predictionGeometry.setDrawRange(0,0);
const prediction=new THREE.Line(predictionGeometry,new THREE.LineBasicMaterial({color:0x72e4d9,transparent:true,opacity:.92}));prediction.frustumCulled=false;scene.add(prediction);
const ghost=new THREE.Mesh(new THREE.IcosahedronGeometry(11,1),new THREE.MeshBasicMaterial({color:0x72e4d9,wireframe:true,transparent:true,opacity:.8}));scene.add(ghost);
for(let i=0;i<6;i++)$('ramp-dots').appendChild(document.createElement('i'));

function setToast(text){$('toast').textContent=text;$('toast').hidden=false;toastUntil=performance.now()+2200;}
function savePreferences(){try{localStorage.setItem('surf-lab-preferences',JSON.stringify({rate,sensitivity:sensitivity*180/Math.PI,guideVisible}));}catch{}}
try{const saved=JSON.parse(localStorage.getItem('surf-lab-preferences')||'null');if(saved){if([.25,.5,1].includes(saved.rate))rate=saved.rate;if(Number.isFinite(saved.sensitivity))sensitivity=clamp(saved.sensitivity,.05,.3)*Math.PI/180;if(typeof saved.guideVisible==='boolean')guideVisible=saved.guideVisible;}}catch{}
$('rate').value=String(rate);$('sensitivity').value=String(sensitivity*180/Math.PI);$('sensitivity-value').textContent=`${format(sensitivity*180/Math.PI,2)}° / px`;$('guide-toggle').checked=guideVisible;
function updatePrediction(){
  if(!guide)return;
  let count=0;for(const p of guide.path){predictionData.set(toRenderPoint(p.x,p.y,p.z+8),count*3);count++;}
  predictionGeometry.attributes.position.needsUpdate=true;predictionGeometry.setDrawRange(0,count);
  prediction.material.color.setHex(guide.safe?0x72e4d9:0xf2bf7c);ghost.material.color.copy(prediction.material.color);
  const p=guide.path[Math.min(14,guide.path.length-1)];if(p)ghost.position.set(...toRenderPoint(p.x,p.y,p.z+20));
}
function computeGuide(){guide=recommend(state,course);updatePrediction();}
function resetRun(fromStart=false){
  checkpoint=fromStart?0:checkpoint;state=spawn(course,checkpoint);accumulator=0;physicsCount=0;held.a=held.d=false;actualInput=0;lastProgress=state.progress;computeGuide();updateHUD();
}
function updateHUD(){
  $('speed').textContent=format(Math.hypot(state.vx,state.vy));$('vertical').textContent=`${state.vz>=0?'↑':'↓'} ${format(Math.abs(state.vz))} u/s vertical`;
  $('speed').style.color=state.airGain< -1?'#f2bf7c':'';
  $('ramp-label').textContent=`Rampa ${state.progress} / 6`;
  [...$('ramp-dots').children].forEach((dot,i)=>{dot.className=i<state.progress-1?'done':i===state.progress-1?'current':'';});
  $('key-a').classList.toggle('held',actualInput<0);$('key-d').classList.toggle('held',actualInput>0);
  const action=guide?policy(state,course,guide.params):null;
  $('key-a').classList.toggle('recommended',guideVisible&&action?.input<0);$('key-d').classList.toggle('recommended',guideVisible&&action?.input>0);
  $('input-note').textContent=demo?'Demonstração automática':guideVisible?'Contorno verde: guia':'A / D para deslizar';
  $('motion-label').textContent=state.outcome==='won'?'Percurso concluído':state.outcome?'Você caiu':state.contact?state.vz>20?'Subindo na face':state.vz< -20?'Descendo na face':'Deslizando':'No ar';
  $('checkpoint-label').textContent=`Checkpoint ${checkpoint+1} · R reinicia`;
  $('session-label').textContent=demo?'DEMONSTRAÇÃO':active?(rate<1?`TREINO ${rate}×`:'MOUSE CAPTURADO'):'PAUSADO';
  document.body.classList.toggle('guide-off',!guideVisible);
  prediction.visible=ghost.visible=guideVisible;
  targets.forEach((target,i)=>{target.visible=i===Math.min(state.progress,5);});
  if(action){
    $('coach-action').textContent=action.input<0?'Segure A':action.input>0?'Segure D':'Solte A / D';
    const delta=angleDelta(action.yaw,state.yaw),degrees=Math.abs(delta)*180/Math.PI;
    $('coach-mouse').textContent=degrees<.8?'Mira alinhada':`${delta>0?'→ direita':'← esquerda'} · ${format(degrees,1)}° para alinhar`;
    const x=innerWidth/2+innerWidth/2*Math.tan(clamp(delta,-1.2,1.2));
    $('aim-guide').style.left=`${clamp(x,24,innerWidth-24)}px`;
  }
  if(performance.now()>toastUntil)$('toast').hidden=true;
}
function setMenu(kind='pause'){
  active=false;held.a=held.d=false;actualInput=0;
  document.body.classList.remove('playing');document.body.classList.add('menu-open');menu.hidden=false;
  if(document.pointerLockElement)document.exitPointerLock();
  const title=menu.querySelector('h1');
  if(kind==='won'){title.innerHTML='Seis rampas.<br><em>Você chegou.</em>';$('menu-copy').textContent=`Percurso completo em ${format(state.time,2)} segundos de simulação. Velocidade final: ${format(Math.hypot(state.vx,state.vy))} u/s.`;$('play').innerHTML='Jogar novamente <span>↗</span>';}
  else if(kind==='fell'){title.innerHTML='Mais uma<br><em>tentativa.</em>';$('menu-copy').textContent=`Você volta ao checkpoint ${checkpoint+1}. Use o contorno das teclas e o ponto verde para acompanhar a recomendação.`;$('play').innerHTML='Tentar o checkpoint <span>↗</span>';}
  else{title.innerHTML=state.time?'Retome o<br><em>seu embalo.</em>':'Encontre o<br><em>seu embalo.</em>';$('menu-copy').textContent='Olhe livremente com o mouse. Use A e D para conduzir a trajetória. O guia mostra uma previsão dos próximos movimentos.';$('play').innerHTML=state.time?'Continuar em tela cheia <span>↗</span>':'Jogar em tela cheia <span>↗</span>';}
  updateHUD();
}
async function engage(watch=false){
  error.hidden=true;demo=watch;
  if(watch||state.outcome==='won')resetRun(true);else if(state.outcome)resetRun(false);
  if(!canvas.requestPointerLock){error.textContent='Este navegador não oferece captura de mouse. Abra o jogo no Chrome ou Edge para jogar.';error.hidden=false;return;}
  try{
    const lock=canvas.requestPointerLock();
    let full;
    if(!document.fullscreenElement&&document.documentElement.requestFullscreen)full=document.documentElement.requestFullscreen({navigationUI:'hide'});
    const outcomes=await Promise.allSettled([Promise.resolve(lock),Promise.resolve(full)]);
    if(outcomes[0].status==='rejected')throw outcomes[0].reason;
    if(outcomes[1].status==='rejected')setToast('Mouse capturado. Use F para tentar entrar em tela cheia.');
  }catch(e){error.textContent='O navegador não liberou a captura. Clique novamente em Jogar ou abra este endereço em uma aba do Chrome/Edge.';error.hidden=false;setMenu();}
}
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas){active=true;lastFrame=null;accumulator=0;menu.hidden=true;document.body.classList.add('playing');document.body.classList.remove('menu-open');computeGuide();}
  else if(active)setMenu();
});
document.addEventListener('pointerlockerror',()=>{if(!document.pointerLockElement){error.textContent='Não foi possível capturar o mouse. Abra o jogo em uma aba normal do Chrome/Edge e clique em Jogar.';error.hidden=false;}});
document.addEventListener('mousemove',event=>{
  if(!active||demo||document.pointerLockElement!==canvas)return;
  state.yaw+=event.movementX*sensitivity;state.pitch=clamp(state.pitch-event.movementY*sensitivity,-1.25,1.25);
});
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.code==='KeyG'&&!event.repeat){guideVisible=!guideVisible;$('guide-toggle').checked=guideVisible;savePreferences();updateHUD();return;}
  if(event.code==='KeyF'&&active&&!document.fullscreenElement){document.documentElement.requestFullscreen?.().catch(()=>setToast('Tela cheia não disponível neste navegador.'));return;}
  if(event.code==='KeyR'&&!event.repeat){event.preventDefault();demo=false;resetRun(event.shiftKey);if(!active)setMenu();return;}
  if(event.code==='Escape'&&active){event.preventDefault();setMenu();return;}
  if(!active)return;
  if(event.code==='KeyA'||event.code==='KeyD'){event.preventDefault();if(demo){demo=false;setToast('Você assumiu o controle.');}held[event.code==='KeyA'?'a':'d']=true;}
  if(['KeyW','KeyS','Space'].includes(event.code))event.preventDefault();
});
document.addEventListener('keyup',event=>{if(event.code==='KeyA')held.a=false;if(event.code==='KeyD')held.d=false;});
window.addEventListener('blur',()=>{if(active)setMenu();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)setMenu();});
$('play').addEventListener('click',()=>engage(false));$('demo').addEventListener('click',()=>engage(true));
$('restart').addEventListener('click',()=>{demo=false;resetRun(true);setMenu();setToast('Percurso reiniciado.');});
$('rate').addEventListener('change',event=>{rate=Number(event.target.value);savePreferences();});
$('sensitivity').addEventListener('input',event=>{sensitivity=Number(event.target.value)*Math.PI/180;$('sensitivity-value').textContent=`${format(Number(event.target.value),2)}° / px`;savePreferences();});
$('guide-toggle').addEventListener('change',event=>{guideVisible=event.target.checked;savePreferences();updateHUD();});
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.fov=2*Math.atan(1/camera.aspect)*180/Math.PI;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();
const look=new THREE.Vector3();
function frame(wall){
  requestAnimationFrame(frame);
  const elapsed=lastFrame===null?0:Math.min(.05,(wall-lastFrame)/1000);lastFrame=wall;
  if(active){
    accumulator+=elapsed*rate;
    while(accumulator>=DT&&!state.outcome){
      if(physicsCount%20===0)computeGuide();
      actualInput=Number(held.d)-Number(held.a);
      if(demo){const action=policy(state,course,guide.params);actualInput=applyControl(state,action);state.pitch=-12*Math.PI/180;}
      step(state,actualInput,course);accumulator-=DT;physicsCount++;
      if(state.progress>lastProgress){checkpoint=state.progress-1;lastProgress=state.progress;setToast(`Checkpoint ${state.progress} / 6`);}
    }
    if(state.outcome)setMenu(state.outcome==='won'?'won':'fell');
  }
  camera.position.set(...toRenderPoint(state.x,state.y,state.z+64));
  const forward=toRenderForward(state.yaw,state.pitch);
  look.set(camera.position.x+forward[0],camera.position.y+forward[1],camera.position.z+forward[2]);camera.lookAt(look);
  updateHUD();renderer.render(scene,camera);
}
window.surfLab=Object.freeze({snapshot:()=>({...state,active,demo,checkpoint,pointerLocked:document.pointerLockElement===canvas,fullscreen:!!document.fullscreenElement,ramps:course.length,guideInput:guide?.input,guideSafe:guide?.safe,cameraForward:camera.getWorldDirection(new THREE.Vector3()).toArray()})});
computeGuide();document.body.classList.add('menu-open');$('loading').hidden=true;updateHUD();requestAnimationFrame(frame);
