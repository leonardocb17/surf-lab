import * as THREE from './vendor/three.module.min.js';
import {BspMap} from './bsp.mjs?v=20261029-jumps';
import {spawnPlayer,stepPlayer,TICK} from './goldsrc.mjs?v=20261029-ct';
import {buildBspScene} from './bsp-render.mjs?v=20261028-remaster';
import {toRenderPoint,toRenderForward} from './view-space.mjs';
import {CT_CONFIG,TARGET,ctStart,prepareStudy,frameAt,sampleState,isInitialRamp,crossing,impactMetrics,coach} from './ct-physics.mjs?v=20261029-ct';
const $=id=>document.getElementById(id),fmt=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const edgeName=edge=>({front:'frente',ridge:'crista',corner:'quina frente/crista',side:'lateral'}[edge]??'sem saída');
const canvas=$('view'),keys=new Set(),renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,1,1,22000);camera.up.set(0,0,1);
let map,world,study,run,state,playing=false,time=0,last=null,practicing=false,finished=false,queuedJump=false,accumulator=0,context=null,lastForecast=-100,activeTrail=[];
const guideGroup=new THREE.Group(),comparisonGroup=new THREE.Group(),markerGroup=new THREE.Group();scene.add(guideGroup,comparisonGroup,markerGroup);
const routeMarkers=new THREE.Group();guideGroup.add(routeMarkers);
const ghost=new THREE.Mesh(new THREE.BoxGeometry(28,28,72),new THREE.MeshBasicMaterial({color:0x91efd0,wireframe:true,depthTest:false}));guideGroup.add(ghost);
const trail=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffffff,depthTest:false,transparent:true,opacity:.9}));scene.add(trail);
const forecast=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xefc386,dashSize:15,gapSize:12,depthTest:false,transparent:true,opacity:.85}));guideGroup.add(forecast);
let selectedLine=null,targetRing=null;
const point=p=>new THREE.Vector3(...toRenderPoint(p.x,p.y,p.z));
function disposeGroup(group){for(const child of [...group.children]){group.remove(child);child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(m=>{m.map?.dispose();m.dispose();});else{child.material?.map?.dispose();child.material?.dispose();}}}
function pathLine(frames,color,opacity=1){const points=frames.filter((_,i)=>i%3===0).map(point);if(opacity>.9){return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.min(300,points.length),5,5,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false}));}const geometry=new THREE.BufferGeometry().setFromPoints(points);return new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthTest:false}));}
function marker(p,text,color='#91efd0',group=routeMarkers){
  const board=document.createElement('canvas');board.width=512;board.height=96;const c=board.getContext('2d');c.fillStyle='#102c3ce8';c.fillRect(0,0,512,96);c.fillStyle=color;c.font='48px Segoe UI';c.textAlign='center';c.fillText(text,256,65);
  const texture=new THREE.CanvasTexture(board),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.userData.label=true;sprite.position.copy(point({...p,z:p.z+(text.includes('ALVO')?220:105)}));group.add(sprite);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(9,10,8),new THREE.MeshBasicMaterial({color,depthTest:false}));dot.position.copy(point(p));group.add(dot);
}
function selectedSet(){return $('family').value==='controlled'?study.controlled:$('family').value==='best'?[study.best]:study.cases;}
function buildPaths(){
  if(selectedLine){guideGroup.remove(selectedLine);selectedLine.geometry.dispose();selectedLine.material.dispose();}
  selectedLine=pathLine(run.frames,0x91efd0,.95);guideGroup.add(selectedLine);disposeGroup(comparisonGroup);disposeGroup(markerGroup);disposeGroup(routeMarkers);
  for(const other of selectedSet())if(other!==run)comparisonGroup.add(pathLine(other.frames,0x8fbcec,.35));
  const jump=run.frames.find(p=>p.input.jump);if(jump)marker(jump,'1 · SALTO DA BASE');
  if(run.entry)marker(run.entry,'2 · PRIMEIRO CONTATO','#8fbcec');if(run.exit)marker(run.exit,`3 · ${run.exit.edge==='corner'?'QUINA':edgeName(run.exit.edge).toUpperCase()}`,'#efc386');
  const target=study.target;targetRing=new THREE.Mesh(new THREE.TorusGeometry(target.radius,3,8,64),new THREE.MeshBasicMaterial({color:0x91efd0,depthTest:true}));targetRing.rotation.x=Math.PI/2;targetRing.position.copy(point(target));markerGroup.add(targetRing);marker(target,'◎ ALVO FIXO','#91efd0',markerGroup);
  const center=new THREE.Mesh(new THREE.SphereGeometry(5,10,8),new THREE.MeshBasicMaterial({color:0xffffff}));center.position.copy(point(target));markerGroup.add(center);
  const jumpLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([point({x:-520,y:-3340,z:6}),point({x:-290,y:-3340,z:6})]),new THREE.LineBasicMaterial({color:0x91efd0,depthTest:false}));routeMarkers.add(jumpLine);
  guideGroup.visible=$('guides').checked;comparisonGroup.visible=$('other-paths').checked;activeTrail=[];updateTrail();
}
function updateTrail(){trail.geometry.dispose();trail.geometry=new THREE.BufferGeometry().setFromPoints(activeTrail.map(point));}
function selectRun(id){
  run=selectedSet().find(r=>r.id===id)??selectedSet()[0];$('trial').value=run.id;time=0;playing=false;state=frameAt(run,0);$('timeline').max=run.duration;
  $('experiment-note').textContent=run.kind==='controlled'?'Ensaio controlado: mesmo ponto, direção e altura de contato. A velocidade é imposta na rampa. A mesma regra de giro pode terminar em outra borda quando a velocidade muda; confira a saída medida na tabela.':$('family').value==='best'?`Melhor tempo que acertou o alvo entre ${study.limits.count} linhas testadas. É uma referência reproduzível, sem garantia de ótimo global.`:'Entrada real: sai do CT sem embalo, corre e pula. Com strafe, o ponto e o ângulo do impacto também mudam. Compare a energia perdida, além da velocidade.';
  buildPaths();updateResults();updateHud();
}
function familyChanged(){const set=selectedSet();$('trial').replaceChildren(...set.map(r=>new Option(r.label,r.id)));selectRun($('family').value==='natural'?'coast-ridge':set[0].id);}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function updateResults(){
  const rows=selectedSet();$('rows').innerHTML=rows.map(r=>`<tr class="${r===run?'chosen':''}"><td>${r.label}<small style="display:block;color:#a8becb;font-size:9px;margin-top:5px">Saída: ${edgeName(r.exit?.edge)}</small></td><td>${r.entryImpact?fmt(r.entryImpact.beforeHorizontal):fmt(r.entry?.speed)+'*'}</td><td>${fmt(r.exit?.speed)}</td><td>${fmt(r.exit?.vz)}</td><td>${fmt(Math.max(0,r.exit?.vz??0)**2/(2*CT_CONFIG.gravity),1)} u</td><td>${fmt(r.gate?.error,1)} u</td><td class="${r.hit?'success':'miss'}">${r.hit?'Acertou no ar':r.gate?.landed?'Tocou chão antes':r.gate?.contacted?'Outro contato antes':r.gate?.airborne?'Passou fora':'Sem voo livre no alvo'}</td></tr>`).join('');
  $('limit-speed').textContent=`${fmt(study.limits.slowest)} / ${fmt(study.limits.fastest)}`;$('limit-height').textContent=fmt(study.limits.maxClimb,1);$('limit-hits').textContent=`${study.limits.hitCount} / ${study.limits.count}`;
  $('scan-caption').textContent=`Velocidades impostas de 200 a 850 u/s, em passos de 25, com a mesma regra de giro para a crista. A borda efetiva pode mudar com a velocidade. Verde = acerto no ar. Menor testada que acertou: ${fmt(study.limits.minSpeed)}; maior: ${fmt(study.limits.maxSpeed)} u/s. Extremos amostrados, sem garantia de continuidade ou mínimo absoluto. * Velocidade imposta após o contato.`;
  const m=run.entryImpact;$('loss-note').textContent=m?`Nesta linha: antes do choque, VH ${fmt(m.beforeHorizontal)} e velocidade total ${fmt(m.beforeTotal)} u/s; depois, VH ${fmt(m.afterHorizontal)} e total ${fmt(m.afterTotal)} u/s. Perda de energia cinética no primeiro choque: ${fmt(m.lossPercent,1)}%. Um aumento da velocidade horizontal pode coexistir com perda de energia total.`:'Neste ensaio controlado a velocidade é imposta após o contato de referência. A perda de entrada não é medida novamente.';
  if(!$('results').hidden)drawScan();
}
function drawScan(){
  const canvas=$('scan'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);
  const samples=study.speedScan,maxError=Math.max(study.target.radius*2,Math.min(400,Math.max(...samples.map(p=>Number.isFinite(p.error)?p.error:0)))),x=v=>48+(v-200)/650*(w-70),y=v=>h-29-Math.min(maxError,v)/maxError*(h-54);
  c.font='10px Segoe UI';c.fillStyle='#b6cdd8';c.fillText('Erro no plano do alvo (u)',12,16);c.strokeStyle='#6b8b67';c.setLineDash([5,4]);c.beginPath();c.moveTo(45,y(study.target.radius));c.lineTo(w-15,y(study.target.radius));c.stroke();c.setLineDash([]);c.fillText(`Raio ${study.target.radius}`,w-70,y(study.target.radius)-5);
  for(const p of samples){c.fillStyle=p.hit?'#8ce9cd':'#edbd87';c.beginPath();c.arc(x(p.speed),y(p.error),3.5,0,Math.PI*2);c.fill();}c.fillStyle='#b6cdd8';c.fillText('0',22,y(0)+3);c.fillText(fmt(maxError),10,y(maxError)+3);for(const v of [200,450,650,850])c.fillText(String(v),x(v)-9,h-10);c.fillText('Velocidade imposta →',w-135,h-10);
}
async function calculate(){
  $('loading').hidden=false;$('progress').textContent='Calculando comparações sobre as colisões reais…';await new Promise(r=>requestAnimationFrame(r));
  study=await prepareStudy(map,n=>{$('progress').textContent=`Comparando entradas e saídas · ensaio ${n}`;},{...TARGET,radius:Number($('precision').value)});
  $('target-badge').textContent=`◎ ALVO FIXO · RAIO ${study.target.radius} u`;$('loading').hidden=true;familyChanged();
}
function stopPractice(){practicing=false;keys.clear();queuedJump=false;document.body.classList.remove('practicing');if(document.pointerLockElement===canvas)document.exitPointerLock();if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});resize();state=frameAt(run,time);}
function resetPractice(){
  state=ctStart(map);let seed=null;
  if(run.kind==='controlled')seed=run.frames[0];else if($('checkpoint').value==='contact')seed=run.entry;else if($('checkpoint').value==='jump')seed=run.frames.find(p=>p.input.jump);
  if(seed)Object.assign(state,seed,{time:0,captureImpacts:true,impacts:[],contact:null,teleports:0,pushes:0,airTime:0});
  context={entry:run.kind==='controlled'||$('checkpoint').value==='contact'?sampleState(state):null,lastContact:null,gap:0,exit:null,landed:false,contacted:false,gate:null,entryImpact:null};
  finished=false;accumulator=0;keys.clear();queuedJump=false;activeTrail=[];updateTrail();lastForecast=-100;
}
async function practice(){
  $('error').hidden=true;playing=false;resetPractice();$('results').hidden=true;document.body.classList.add('practicing');resize();
  try{await Promise.resolve(canvas.requestPointerLock());document.documentElement.requestFullscreen?.().catch(()=>{});}catch(e){stopPractice();$('error').hidden=false;$('error').textContent='Não foi possível capturar o mouse. Abra o link em uma aba normal do Chrome/Edge e clique novamente em Praticar.';}
}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){practicing=true;last=null;}else if(practicing)stopPractice();});
document.addEventListener('mousemove',e=>{if(practicing){state.yaw+=e.movementX*.14*Math.PI/180;state.pitch=Math.max(-1.55,Math.min(1.55,state.pitch-e.movementY*.14*Math.PI/180));}});
document.addEventListener('keydown',e=>{
  if(!practicing)return;if(e.code==='Escape'){stopPractice();return;}if(e.code==='KeyR'&&!e.repeat){resetPractice();return;}
  if(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)queuedJump=true;}
});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{if(practicing)stopPractice();});
function practiceTick(){
  const input={forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),jump:queuedJump||keys.has('Space'),duck:keys.has('ControlLeft')||keys.has('ControlRight')};queuedJump=false;
  const previous={...state};stepPlayer(state,input,map,TICK,CT_CONFIG);
  if(isInitialRamp(state)){context.gap=0;context.lastContact=sampleState(state,input,'rampa');if(!context.entry){context.entry=context.lastContact;context.entryImpact=impactMetrics(state.impacts.find(p=>p.normal.z>.3&&p.normal.z<.7));}}
  else if(context.entry&&!context.exit){context.gap++;if(context.gap>=6&&context.lastContact)context.exit=context.lastContact;}
  if(context.exit&&(state.grounded||state.inWater))context.landed=true;
  if(context.exit&&(state.contact||state.grounded||state.inWater||state.onLadder))context.contacted=true;
  if(context.exit){context.gate=crossing(previous,state,study.target);if(context.gate){context.gate.hit=context.gate.error<=study.target.radius&&context.gate.airborne&&!context.landed&&!context.contacted;finished=true;}}
  if(state.teleports||state.pushes||state.stuck||state.z<-1800||state.time>18)finished=true;
  if(activeTrail.length===0||state.time-activeTrail.at(-1).time>=.03){activeTrail.push({x:state.x,y:state.y,z:state.z,time:state.time});updateTrail();}
}
function updateForecast(wall){
  if(!practicing||finished||wall-lastForecast<300)return;lastForecast=wall;const p={...state,captureImpacts:false},points=[point(p)];
  for(let i=0;i<110;i++){stepPlayer(p,{},map,TICK,CT_CONFIG);if(i%3===0)points.push(point(p));if(p.stuck||p.teleports||p.pushes)break;}
  forecast.geometry.dispose();forecast.geometry=new THREE.BufferGeometry().setFromPoints(points);forecast.computeLineDistances();
}
function updateHud(){
  if(!state||!run)return;const vh=Math.hypot(state.vx,state.vy),help=coach(state,run),reference=practicing?help.reference:state,phase=practicing?context.exit?'voo':context.entry?'rampa':state.grounded?'base':'entrada':state.phase;
  $('phase').textContent=finished&&practicing?'TENTATIVA ENCERRADA':{base:'1 · CORRIDA NA BASE CT',entrada:'2 · PULO DE ENTRADA',rampa:'3 · CONTATO NA RAMPA',voo:'4 · SAÍDA / VOO'}[phase];
  $('speed').textContent=fmt(vh);$('vertical').textContent=`${state.vz>=0?'+':''}${fmt(state.vz)} u/s`;$('total').textContent=`${fmt(Math.hypot(vh,state.vz))} u/s`;
  const impact=practicing?context.entryImpact:run.entryImpact;$('entry').textContent=impact?`${fmt(impact.beforeHorizontal)} u/s`:run.kind==='controlled'?`${fmt(run.entry.speed)} u/s*`:'aguardando';
  const gate=practicing?context.gate:time>=run.duration?run.gate:null;$('goal').textContent=gate?gate.hit?'ACERTOU':`${fmt(gate.error)} u · falhou`:'alvo travado';
  const title=finished&&practicing?context.gate?.hit?'Alvo atingido no ar':'Compare sua tentativa':phase==='base'?'W até a linha verde; depois pule':phase==='entrada'?'Solte W/S; coordene A/D e mouse':phase==='rampa'?'D mantém esta face; escolha a saída':'Não há sustentação: a gravidade continua';
  $('advice-title').textContent=title;
  $('advice').textContent=finished&&practicing?'R repete o estado inicial escolhido. Esc volta para comparar os ensaios.':practicing?`Guia: ${help.key}${help.jump?' + Espaço':''}; ${help.mouse}. Distância da linha: ${fmt(help.distance)} u.`:phase==='base'?'A linha do pulo fica na borda da base. A saída real começa sem velocidade imposta.':phase==='entrada'?run.options.boost?'A/D alternam com o giro da mira e acrescentam velocidade antes do impacto.':'Neste ensaio, o pulo segue sem strafe. Observe VH e velocidade total antes/depois do choque.':phase==='rampa'?run.options.exitYaw?'Perto da marca de saída, vire um pouco à direita mantendo D para subir à crista.':'A mira segue em frente e D mantém contato até a borda frontal.':'A crista pode ganhar altura com menor VH. A frente pode sair mais rápida e passar abaixo do alvo.';
  const input=practicing?{forward:keys.has('KeyW'),right:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),jump:keys.has('Space')}:reference.input;
  for(const [key,on,best] of [['w',input.forward,reference.input.forward],['a',input.right<0,reference.input.right<0],['d',input.right>0,reference.input.right>0],['jump',input.jump,help.jump||reference.input.jump]]){$('key-'+key).classList.toggle('on',Boolean(on));$('key-'+key).classList.toggle('best',Boolean(best));}
  $('mouse').textContent=practicing?help.mouse:reference.input.right?'mouse + strafe':'mira à frente';$('clock').textContent=`${fmt(time,2)} s`;$('timeline').value=time;$('toggle').textContent=playing?'Ⅱ':'▶';
}
function animate(wall){
  requestAnimationFrame(animate);if(!study)return;const elapsed=last==null?0:Math.min(.05,(wall-last)/1000);last=wall;
  if(practicing){if(!finished){accumulator+=elapsed;while(accumulator>=TICK){practiceTick();accumulator-=TICK;if(finished)break;}}updateForecast(wall);}
  else{if(playing){time=Math.min(run.duration,time+elapsed*Number($('rate').value));if(time>=run.duration)playing=false;}state=frameAt(run,time);}
  document.body.classList.toggle('overview',$('camera').value==='overview');
  const reference=practicing?coach(state,run).reference:state;ghost.position.copy(point(reference));ghost.visible=$('guides').checked&&(practicing?point(reference).distanceTo(point(state))>40:$('camera').value==='overview');
  if(practicing||$('camera').value==='first'){camera.position.set(...toRenderPoint(state.x,state.y,state.z+(state.eye??17)));const d=toRenderForward(state.yaw,state.pitch);camera.lookAt(camera.position.x+d[0],camera.position.y+d[1],camera.position.z+d[2]);}
  else{camera.position.set(...toRenderPoint(3000,-2150,1700));camera.lookAt(...toRenderPoint(-470,-2130,-450));}
  for(const group of [routeMarkers,markerGroup])for(const label of group.children)if(label.userData.label){const distance=label.position.distanceTo(camera.position),width=140*2*distance*Math.tan(camera.fov*Math.PI/360)/canvas.clientHeight;label.scale.set(width,width*96/512,1);}
  forecast.visible=practicing&&$('guides').checked;updateHud();world.update(wall/1000);renderer.render(scene,camera);
}
$('family').onchange=familyChanged;$('trial').onchange=()=>selectRun($('trial').value);$('precision').onchange=calculate;
$('toggle').onclick=()=>{if(time>=run.duration)time=0;playing=!playing;};$('demo').onclick=()=>{time=0;playing=true;};$('restart').onclick=()=>{time=0;playing=true;};$('timeline').oninput=()=>{time=Number($('timeline').value);playing=false;};$('practice').onclick=practice;
$('compare').onclick=()=>{$('results').hidden=false;updateResults();};$('close-results').onclick=()=>$('results').hidden=true;
$('guides').onchange=()=>guideGroup.visible=$('guides').checked;$('other-paths').onchange=()=>comparisonGroup.visible=$('other-paths').checked;
window.addEventListener('resize',()=>{resize();if(study&&!$('results').hidden)drawScan();});document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;if(practicing)stopPractice();}});
try{
  const response=await fetch('./maps/surf_ski_2.bsp');if(!response.ok)throw new Error(`Mapa: HTTP ${response.status}`);map=new BspMap(await response.arrayBuffer());world=buildBspScene(map,renderer,scene);resize();await calculate();
  window.ctLab=Object.freeze({snapshot:()=>({ready:true,practicing,finished,playing,time,selected:run.id,family:$('family').value,pointerLocked:document.pointerLockElement===canvas,fullscreen:!!document.fullscreenElement,target:{...study.target},config:CT_CONFIG,state:sampleState(state),manual:context?{entry:context.entry,exit:context.exit,gate:context.gate}:null,result:{hit:run.hit,entry:run.entryImpact,exit:run.exit,gate:run.gate},cases:study.cases.map(r=>({id:r.id,hit:r.hit,error:r.gate?.error,entry:r.entryImpact?.beforeHorizontal,exit:r.exit?.speed})),limits:study.limits})});requestAnimationFrame(animate);
}catch(e){$('loading').hidden=true;$('error').hidden=false;$('error').textContent=`Não foi possível preparar o estudo: ${e.message}`;console.error(e);}
