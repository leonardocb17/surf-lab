import * as THREE from './vendor/three.module.min.js';
import {BspMap,physicsPoint} from './bsp.mjs?v=20261030-guide';
import {spawnPlayer,stepPlayer,ladderPracticeEntry,TICK} from './goldsrc.mjs?v=20261030-guide';
import {PROFILES} from './movement-rules.mjs?v=20261030-guide';
import {buildBspScene} from './bsp-render.mjs?v=20261030-guide';
import {toRenderPoint,toRenderForward} from './view-space.mjs';
import {createClassicGuide} from './classic-guide-ui.mjs?v=20261030-guide';
import {CLASSIC_MAPS,findClassicMap,practiceEntry,originalHazard} from './classic-maps.mjs?v=20261030-guide';
const $=id=>document.getElementById(id),canvas=$('view'),keys=new Set();
const fmt=(n,d=0)=>n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const requestedMap=new URLSearchParams(location.search).get('map')??(document.body.classList.contains('classic-viewer')?'surf_green':'surf_ski_2'),mapInfo=findClassicMap(requestedMap);
let training=null,viewCenter=new THREE.Vector3(),viewDistance=6000,hazardResets=0,hazardWarnings=0,lastHazardId=-1,guide=null;
let map,world,state,active=false,freeFly=false,accumulator=0,lastFrame=null,sensitivity=.14*Math.PI/180,noticeUntil=0,jumpQueued=false,timeScale=1;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=mapInfo.exposure??.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,1,1,22000);camera.up.set(0,0,1);const look=new THREE.Vector3();
function notice(text){$('notice').textContent=text;$('notice').hidden=false;noticeUntil=performance.now()+2500;}
function reset(visit=false){
  guide?.reset();lastHazardId=-1;freeFly=visit;state=spawnPlayer(map,$('entry').value==='t'?'t':'ct');keys.clear();jumpQueued=false;accumulator=0;
  if(visit){if(mapInfo.id==='surf_ski_2')Object.assign(state,{x:-4400,y:-5000,z:4100,yaw:.89,pitch:-.63});else{const eye=viewCenter.clone().add(new THREE.Vector3(-1,1,.8).normalize().multiplyScalar(viewDistance)),p=physicsPoint(eye),target=physicsPoint(viewCenter);Object.assign(state,p,{yaw:Math.atan2(target.y-p.y,target.x-p.x),pitch:Math.atan2(target.z-p.z,Math.hypot(target.x-p.x,target.y-p.y))});}}
  else if($('entry').value==='ladder'){const p=ladderPracticeEntry(map);if(p)Object.assign(state,p);}
  else if($('entry').value==='route'&&guide?.start())Object.assign(state,guide.start());
  else if($('entry').value==='ramp'&&training)Object.assign(state,training);
}
function menu(){guide?.reset();active=false;keys.clear();if(document.pointerLockElement)document.exitPointerLock();$('menu').hidden=false;document.body.classList.add('menu-open');}
async function play(visit){
  $('error').hidden=true;reset(visit);
  try{const results=await Promise.allSettled([Promise.resolve(canvas.requestPointerLock()),Promise.resolve(!document.fullscreenElement?document.documentElement.requestFullscreen?.({navigationUI:'hide'}):null)]);if(results[0].status==='rejected')throw results[0].reason;if(results[1].status==='rejected')notice('Mouse capturado. F tenta entrar em tela cheia.');}
  catch(e){$('error').textContent='Não foi possível capturar o mouse. Abra o endereço em uma aba normal do Chrome/Edge e clique novamente em Jogar.';$('error').hidden=false;menu();}
}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){active=true;lastFrame=null;$('menu').hidden=true;document.body.classList.remove('menu-open');}else if(!guide?.state.watching)menu();});
document.addEventListener('mousemove',e=>{if(active){state.yaw+=e.movementX*sensitivity;guide?.mouse(e.movementX*sensitivity);state.pitch=clamp(state.pitch-e.movementY*sensitivity,-89*Math.PI/180,89*Math.PI/180);}});
document.addEventListener('keydown',e=>{
  if(e.code==='Escape'){menu();return;}
  if(['INPUT','SELECT'].includes(e.target.tagName))return;
  if(e.code==='KeyH'&&!e.repeat&&guide){$('live-guide').checked=!$('live-guide').checked;return;}
  if(e.code==='Space'&&guide?.state.watching){e.preventDefault();guide.state.playing=!guide.state.playing;return;}
  if(e.code==='KeyR'&&!e.repeat&&guide?.state.watching){guide.state.time=0;guide.state.playing=true;return;}
  if(e.code==='KeyR'&&!e.repeat){reset(freeFly);notice('Entrada reiniciada.');return;}
  if((active||guide?.state.watching)&&['Digit1','Digit2','Digit3'].includes(e.code)&&!e.repeat){timeScale=({Digit1:1,Digit2:.5,Digit3:.25})[e.code];$('time-scale').value=String(timeScale);if($('replay-rate'))$('replay-rate').value=String(timeScale);notice(`Tempo ${fmt(timeScale,2)}×`);return;}
  if(e.code==='KeyF'&&(active||guide?.state.watching)&&!document.fullscreenElement){document.documentElement.requestFullscreen?.().catch(()=>{});return;}
  if(active){if(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();if(e.code==='Space'&&!e.repeat)jumpQueued=true;keys.add(e.code);}
});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{if(active)menu();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)menu();});
$('time-scale').onchange=e=>{timeScale=Number(e.target.value);if($('replay-rate'))$('replay-rate').value=String(timeScale);};
if($('replay-rate'))$('replay-rate').onchange=e=>{timeScale=Number(e.target.value);$('time-scale').value=String(timeScale);};
$('play').onclick=()=>play(false);$('fly').onclick=()=>play(true);$('entry').onchange=()=>reset(false);$('sensitivity').oninput=e=>sensitivity=Number(e.target.value)*Math.PI/180;
$('profile').onchange=()=>{reset(false);guide?.reconfigure();};
$('shadows').onchange=e=>{renderer.shadowMap.enabled=e.target.checked;world.materials.forEach(m=>m.needsUpdate=true);};
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();
function hud(){
  $('time-scale-badge').textContent=`Tempo ${fmt(timeScale,timeScale===1?0:2)}× · 1 / 2 / 3`;
  const speed=Math.hypot(state.vx,state.vy);$('speed').textContent=fmt(speed);$('vertical').textContent=`horizontal · ${state.vz>=0?'↑':'↓'} ${fmt(Math.abs(state.vz))} u/s vertical`;
  $('status').textContent=guide?.state.watching?'GABARITO COMPLETO':active?freeFly?'EXPLORAÇÃO AÉREA':'MOUSE CAPTURADO':'PAUSADO';$('air').textContent=`No ar: ${fmt(state.airTime,2)} s`;$('counts').textContent=`Impulsos ${state.pushes} · Teleportes ${state.teleports}${guide?` · Dano ${hazardWarnings}`:''}`;
  for(const key of ['w','a','s','d']){$('key-'+key).classList.toggle('on',keys.has('Key'+key.toUpperCase()));$('key-'+key).classList.remove('best');}
  if($('key-jump')){$('key-jump').classList.toggle('on',keys.has('Space'));$('key-jump').classList.remove('best');}
  let title,tip;
  if(freeFly){title='Exploração aérea';tip='WASD conduz o voo. Espaço sobe, Ctrl desce. Este modo permite observar o mapa sem colisões.';}
  else if(state.waterJumpTime>0){title='Saída automática da água';tip='Ao encostar numa borda com espaço acima, o motor ajuda a sair da piscina. Este impulso é temporário; ao deixar a água, a gravidade volta a agir.';}
  else if(state.onLadder){const n=state.ladderNormal,intoRight=Math.sin(state.yaw)*n.x-Math.cos(state.yaw)*n.y,key=intoRight>=0?'d':'a';$('key-'+key).classList.add('best');title='Escada · movimento por projeção';tip=`O movimento contra a face vira subida. De lado, pressione ${key.toUpperCase()} contra a escada, olhe para baixo e combine S. O ângulo determina o ganho; Espaço salta para fora.`;}
  else if(state.inWater){title='Na água';tip='Use WASD para nadar e Espaço para subir. Procure a borda ou uma saída do mapa.';}
  else if(state.contact&&state.contact.z>.05&&state.contact.z<.7){
    const right={x:-Math.sin(state.yaw),y:Math.cos(state.yaw)},n=state.contact,uphill=-n.x*right.x-n.y*right.y,key=uphill>0?'d':'a';
    $('key-'+key).classList.add('best');title=`Face à ${key==='d'?'direita · segure D':'esquerda · segure A'}`;tip='Solte W/S e faça curvas suaves com o mouse. Mantenha o embalo para escolher a saída da rampa.';
  }else if(state.grounded){title='No chão';tip='WASD movimenta você pela base. Espaço pula. Ao entrar na rampa, conduza com A/D.';}
  else{title=state.vz>0?'Subindo pelo impulso':'No ar';tip=state.airGain<-.2?'Você está perdendo velocidade horizontal. Alivie o giro e sincronize A/← ou D/→.':'A/← ou D/→ para corrigir a curva. A gravidade continua agindo; olhar para cima não sustenta o voo.';}
  $('motion').textContent=title;$('tip').textContent=tip;if(performance.now()>noticeUntil)$('notice').hidden=true;
}
function frame(wall){
  requestAnimationFrame(frame);if(!state)return;
  const elapsed=lastFrame==null?0:Math.min(.05,(wall-lastFrame)/1000);lastFrame=wall;
  if(guide?.state.watching){state=guide.replay(elapsed*timeScale);}
  else if(active){accumulator+=elapsed*timeScale;while(accumulator>=TICK){
    const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),jump=jumpQueued||keys.has('Space'),duck=keys.has('ControlLeft')||keys.has('ControlRight');jumpQueued=false;
    if(freeFly){const c=Math.cos(state.yaw),s=Math.sin(state.yaw),speed=900;state.vx=(c*forward-s*right)*speed;state.vy=(s*forward+c*right)*speed;state.vz=(Number(jump)-Number(duck))*speed;state.x+=state.vx*TICK;state.y+=state.vy*TICK;state.z+=state.vz*TICK;state.time+=TICK;}
    else{stepPlayer(state,{forward,right,jump,duck},map,TICK,PROFILES[$('profile').value]);if(state.event)notice(state.event);const hazard=mapInfo.id!=='surf_ski_2'&&originalHazard(map,state),id=hazard?map.models.indexOf(hazard):-1;if(id!==lastHazardId&&hazard){hazardWarnings++;if($('damage-mode')?.value==='training')notice('Zona original de dano: no CS esta queda mata. Treino contínuo ativo.');}lastHazardId=id;if((hazard&&$('damage-mode')?.value==='original')||state.z<map.models[0].mins.z-500||!Number.isFinite(state.x+state.y+state.z)){hazardResets++;reset(false);notice(hazard?'Zona original de dano. Você voltou à entrada escolhida.':'Você voltou à entrada escolhida.');break;}}
    accumulator-=TICK;
  }}
  if(guide?.camera(camera)){}
  else if(!active&&!guide?.state.watching&&state.time===0){if(mapInfo.id==='surf_ski_2'){camera.position.set(-4400,5000,4100);camera.lookAt(-100,300,-500);}else{camera.position.copy(viewCenter).add(new THREE.Vector3(-1,1,.8).normalize().multiplyScalar(viewDistance));camera.lookAt(viewCenter);}}
  else{camera.position.set(...toRenderPoint(state.x,state.y,state.z+(freeFly?0:state.eye)));const dir=toRenderForward(state.yaw,state.pitch);look.set(camera.position.x+dir[0],camera.position.y+dir[1],camera.position.z+dir[2]);camera.lookAt(look);}
  hud();guide?.update(state,{forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),jump:keys.has('Space'),duck:keys.has('ControlLeft')||keys.has('ControlRight')},wall,active,freeFly);world.update(wall/1000);renderer.render(scene,camera);
}
try{
  document.title=`${mapInfo.name} · Surf Lab Remaster`;
  for(const [id,value] of [['map-title',mapInfo.name],['map-name',mapInfo.name],['map-description',mapInfo.description],['map-author',mapInfo.author]])if($(id))$(id).textContent=value;
  if($('classic-map')){$('classic-map').replaceChildren(...CLASSIC_MAPS.map(m=>new Option(m.name,m.id)));$('classic-map').value=mapInfo.id;$('classic-map').onchange=()=>{const next=findClassicMap($('classic-map').value);location.href=next.id==='surf_ski_2'?'./ski2.html?v=20261030-guide':`./remaster.html?map=${next.id}&v=20261029-classics`;};}
  const response=await fetch(mapInfo.file);if(!response.ok)throw new Error(`Mapa: HTTP ${response.status}`);
  map=new BspMap(await response.arrayBuffer());world=buildBspScene(map,renderer,scene,{theme:mapInfo.theme});training=practiceEntry(map,mapInfo.id);
  const bounds=new THREE.Box3().setFromObject(world.group),size=bounds.getSize(new THREE.Vector3());viewCenter=bounds.getCenter(new THREE.Vector3());viewDistance=Math.max(size.x,size.y,size.z,1000)*1.18;camera.far=Math.max(22000,viewDistance*3);camera.updateProjectionMatrix();
  $('entry').querySelector('option[value=ramp]').disabled=!training;$('entry').querySelector('option[value=ladder]').disabled=!map.triggers.some(t=>t.entity.classname==='func_ladder');
  if(mapInfo.id!=='surf_ski_2'){$('entry').value='ct';$('entry').querySelector('option[value=ramp]').textContent='Treino rápido · rampa com 550 u/s horizontais';}
  reset(false);
  if(mapInfo.id!=='surf_ski_2'){createClassicGuide({map,mapInfo,scene,config:()=>PROFILES[$('profile').value],onWatch:()=>{active=false;freeFly=false;keys.clear();if(document.pointerLockElement)document.exitPointerLock();$('menu').hidden=true;document.body.classList.remove('menu-open');lastFrame=null;},onTrain:()=>{$('entry').value='route';play(false);}}).then(value=>guide=value).catch(error=>{$('guide-note').textContent=error.message;console.warn(error.message);});}
  const api=Object.freeze({snapshot:()=>({...state,triggerIds:undefined,active,freeFly,timeScale,mapId:mapInfo.id,mapName:mapInfo.name,theme:world.theme,preservedTextures:world.preservedTextures,hazardResets,hazardWarnings,damageMode:$('damage-mode')?.value??'original',guide:guide?.snapshot(),originalHash:mapInfo.sha256,practiceFace:training?.face,entry:$('entry').value,pointerLocked:document.pointerLockElement===canvas,fullscreen:!!document.fullscreenElement,faces:map.faces.length,renderedFaces:world.renderedFaces,triangles:world.triangles,models:map.models.length,collisionSolids:map.solids.length,config:PROFILES[$('profile').value]}),capturePreview:()=>{const savedPosition=camera.position.clone(),savedQuaternion=camera.quaternion.clone();camera.position.copy(viewCenter).add(new THREE.Vector3(-1,1,.8).normalize().multiplyScalar(viewDistance));camera.lookAt(viewCenter);renderer.render(scene,camera);const data=canvas.toDataURL('image/jpeg',.88);camera.position.copy(savedPosition);camera.quaternion.copy(savedQuaternion);return data;}});window.surfMap=api;if(mapInfo.id==='surf_ski_2')window.ski2=api;
  $('loading').hidden=true;requestAnimationFrame(frame);
}catch(error){$('loading').hidden=true;$('error').hidden=false;$('error').textContent=`Falha ao preparar o mapa: ${error.message}`;console.error(error);}
