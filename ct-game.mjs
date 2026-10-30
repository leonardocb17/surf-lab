import * as THREE from './vendor/three.module.min.js';
import {BspMap} from './bsp.mjs?v=20261030-guide';
import {spawnPlayer,stepPlayer,TICK} from './goldsrc.mjs?v=20261030-guide';
import {buildBspScene} from './bsp-render.mjs?v=20261028-remaster';
import {toRenderPoint,toRenderForward} from './view-space.mjs';
import {CT_CONFIG,TARGET,ctStart,prepareStudy,frameAt,sampleState,isInitialRamp,crossing,impactMetrics,wrap} from './ct-physics.mjs?v=20261030-guide';
import {widePath} from './wide-path.mjs?v=20261030-guide';
import {CFG_FIELDS,CFG_PRESETS,normalizeConfig,configKey} from './ct-settings.mjs?v=20261030-guide';
import {suggestedAction,surfaceAdvice} from './live-coach.mjs?v=20261030-guide';
const $=id=>document.getElementById(id),fmt=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const edgeName=edge=>({front:'frente',ridge:'crista',corner:'quina frente/crista',side:'lateral'}[edge]??'sem saída');
const canvas=$('view'),keys=new Set(),renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,1,1,22000);camera.up.set(0,0,1);
let activeConfig=normalizeConfig(),cfgDirty=false;
const atlas={status:'loading',catalog:null,key:null};
let map,world,study,run,state,playing=false,time=0,last=null,practicing=false,finished=false,queuedJump=false,accumulator=0,context=null,lastForecast=-100,activeTrail=[];
const guideGroup=new THREE.Group(),comparisonGroup=new THREE.Group(),markerGroup=new THREE.Group();scene.add(guideGroup,comparisonGroup,markerGroup);
const routeMarkers=new THREE.Group();guideGroup.add(routeMarkers);
const ghost=new THREE.Mesh(new THREE.BoxGeometry(28,28,72),new THREE.MeshBasicMaterial({color:0x91efd0,wireframe:true,depthTest:false}));guideGroup.add(ghost);
const trail=widePath(0xffffff,4,{opacity:.8});trail.userData.widthScale=.55;scene.add(trail);
const forecast=widePath(0xffb347,7,{dashed:true});guideGroup.add(forecast);
const suggestion=widePath(0x63ffce,7);guideGroup.add(suggestion);
const live={ready:false,busy:false,seq:0,epoch:0,updates:0,result:null,source:null,error:null};
let worker=null,selectedLine=null,targetRing=null,mouseTurn=0,turnRate=0,lastTrail=-100,noticeUntil=0;
function heldInput(){return {forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),jump:keys.has('Space'),duck:keys.has('ControlLeft')||keys.has('ControlRight')};}
function notice(text){$('live-notice').textContent=text;$('live-notice').hidden=false;noticeUntil=performance.now()+3200;}
function setForecast(line,points=[]){line.setPoints(points);}
function clearForecast(){live.epoch++;live.result=null;live.source=null;lastForecast=-100;mouseTurn=0;turnRate=0;setForecast(forecast);setForecast(suggestion);}
function setupWorker(){
  worker=new Worker(new URL('./live-worker.mjs?v=20261030-guide',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){live.ready=true;requestCatalog();return;}
    if(data.type==='catalog'){if(data.key===configKey(activeConfig)){atlas.catalog=data.catalog;atlas.key=data.key;atlas.status='ready';renderCatalog();}return;}
    if(data.type==='catalog-error'){if(data.key===configKey(activeConfig)){atlas.status='error';$('route-coverage').textContent='Não foi possível validar os gabaritos nesta cfg.';console.warn(data.message);}return;}
    live.busy=false;
    if(data.type==='error'){live.error=data.message;console.warn('Live forecast:',data.message);return;}
    if(data.epoch!==live.epoch||!practicing)return;
    live.result=data.result;live.source=data.source;live.updates++;
    setForecast(forecast,data.result.current.points);setForecast(suggestion,data.result.suggested?.points);
  };
  worker.onerror=()=>{live.ready=false;live.busy=false;live.error='Previsão indisponível';};
  const buffer=map.buffer.slice(0);worker.postMessage({type:'init',buffer},[buffer]);
}
function liveAction(){
  const packet=live.result,plan=packet?.suggested?.plan??{kind:'target',offset:-.05};
  if(!$('goal-enabled').checked||packet?.targetBehind)return suggestedAction(state,study.target,{kind:'velocity',offset:0,free:true,side:heldInput().right||Math.sign(turnRate)||1},activeConfig);
  return suggestedAction(state,study.target,plan,activeConfig);
}
const point=p=>new THREE.Vector3(...toRenderPoint(p.x,p.y,p.z));
function disposeGroup(group){for(const child of [...group.children]){group.remove(child);if(child.dispose){child.dispose();continue;}child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(m=>{m.map?.dispose();m.dispose();});else{child.material?.map?.dispose();child.material?.dispose();}}}
function pathLine(frames,color,opacity=1){
  const group=new THREE.Group(),chunks=[[]];
  for(let i=0;i<frames.length;i++){if(i&&Math.hypot(frames[i].x-frames[i-1].x,frames[i].y-frames[i-1].y,frames[i].z-frames[i-1].z)>220)chunks.push([]);if(i%3===0||i===frames.length-1)chunks.at(-1).push(frames[i]);}
  for(const chunk of chunks)if(chunk.length>1){const path=widePath(color,Number($('line-width').value),{opacity});path.userData.widthScale=opacity<.9?.55:1;path.setPoints(chunk);group.add(path);}
  group.dispose=()=>{for(const child of group.children)child.dispose();};return group;
}
function updateLineWidth(){const width=Number($('line-width').value);$('line-width-label').textContent=`${width} px` ;scene.traverse(p=>{if(p.userData.wide)p.setWidth(width*(p.userData.widthScale??1));});}
function marker(p,text,color='#91efd0',group=routeMarkers){
  const board=document.createElement('canvas');board.width=512;board.height=96;const c=board.getContext('2d');c.fillStyle='#102c3ce8';c.fillRect(0,0,512,96);c.fillStyle=color;c.font='48px Segoe UI';c.textAlign='center';c.fillText(text,256,65);
  const texture=new THREE.CanvasTexture(board),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.userData.label=true;sprite.position.copy(point({...p,z:p.z+(text.includes('ALVO')?220:105)}));group.add(sprite);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(9,10,8),new THREE.MeshBasicMaterial({color,depthTest:false}));dot.position.copy(point(p));group.add(dot);
}
function selectedSet(){return $('family').value==='controlled'?study.controlled:$('family').value==='best'?[study.best]:study.cases;}
function buildPaths(){
  if(selectedLine){guideGroup.remove(selectedLine);selectedLine.dispose();}
  selectedLine=pathLine(run.frames,0x91efd0,.95);guideGroup.add(selectedLine);disposeGroup(comparisonGroup);disposeGroup(markerGroup);disposeGroup(routeMarkers);
  for(const other of selectedSet())if(other!==run)comparisonGroup.add(pathLine(other.frames,0x8fbcec,.35));
  const jump=run.frames.find(p=>p.input.jump);if(jump)marker(jump,'1 · SALTO DA BASE');
  if(run.entry)marker(run.entry,'2 · PRIMEIRO CONTATO','#8fbcec');if(run.exit)marker(run.exit,`3 · ${run.exit.edge==='corner'?'QUINA':edgeName(run.exit.edge).toUpperCase()}`,'#efc386');
  const target=run.kind==='route'?{...run.destination.position,radius:run.destination.radius??45}:study.target;targetRing=new THREE.Mesh(new THREE.TorusGeometry(target.radius,3,8,64),new THREE.MeshBasicMaterial({color:0x91efd0,depthTest:true}));targetRing.rotation.x=Math.PI/2;targetRing.position.copy(point(target));markerGroup.add(targetRing);marker(target,run.kind==='route'?'◎ CHEGADA':'◎ ALVO FIXO','#91efd0',markerGroup);
  const center=new THREE.Mesh(new THREE.SphereGeometry(5,10,8),new THREE.MeshBasicMaterial({color:0xffffff}));center.position.copy(point(target));markerGroup.add(center);
  const jumpLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([point({x:-520,y:-3340,z:6}),point({x:-290,y:-3340,z:6})]),new THREE.LineBasicMaterial({color:0x91efd0,depthTest:false}));routeMarkers.add(jumpLine);
  guideGroup.visible=$('guides').checked;comparisonGroup.visible=$('other-paths').checked;activeTrail=[];updateTrail();
}
function updateTrail(){trail.setPoints(activeTrail);}
function selectRun(id){
  run=selectedSet().find(r=>r.id===id)??selectedSet()[0];$('trial').value=run.id;time=0;playing=false;state=frameAt(run,0);$('timeline').max=run.duration;
  $('experiment-note').textContent=run.kind==='controlled'?'Ensaio controlado: mesmo ponto, direção e altura de contato. A velocidade é imposta na rampa. A mesma regra de giro pode terminar em outra borda quando a velocidade muda; confira a saída medida na tabela.':$('family').value==='best'?run.hit?`Melhor tempo que acertou o alvo entre ${study.limits.count} linhas testadas. Sem garantia de ótimo global.`:'Nenhuma linha amostrada acertou nesta cfg. Esta é a de menor erro entre as testadas.':'Entrada real: sai do CT sem embalo, corre e pula. Com strafe, o ponto e o ângulo do impacto também mudam. Compare a energia perdida, além da velocidade.';
  buildPaths();updateResults();updateHud();
}
function familyChanged(){if(!selectedSet().length)$('family').value='natural';const set=selectedSet();$('trial').replaceChildren(...set.map(r=>new Option(r.label,r.id)));selectRun($('family').value==='natural'?'coast-ridge':set[0].id);}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function updateResults(){
  $('family').querySelector('option[value=controlled]').disabled=!study.controlled.length;
  const rows=selectedSet();$('rows').innerHTML=rows.map(r=>`<tr class="${r===run?'chosen':''}"><td>${r.label}<small style="display:block;color:#a8becb;font-size:9px;margin-top:5px">Saída: ${edgeName(r.exit?.edge)}</small></td><td>${r.entryImpact?fmt(r.entryImpact.beforeHorizontal):fmt(r.entry?.speed)+'*'}</td><td>${fmt(r.exit?.speed)}</td><td>${fmt(r.exit?.vz)}</td><td>${fmt(Math.max(0,r.exit?.vz??0)**2/(2*activeConfig.gravity),1)} u</td><td>${fmt(r.gate?.error,1)} u</td><td class="${r.hit?'success':'miss'}">${r.hit?'Acertou no ar':r.gate?.landed?'Tocou chão antes':r.gate?.contacted?'Outro contato antes':r.gate?.airborne?'Passou fora':'Sem voo livre no alvo'}</td></tr>`).join('');
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
  study=await prepareStudy(map,n=>{$('progress').textContent=`Comparando entradas e saídas · ensaio ${n}`;},{...TARGET,radius:Number($('precision').value)},activeConfig);
  $('target-badge').textContent=`◎ ALVO OPCIONAL · RAIO ${study.target.radius} u`;$('loading').hidden=true;familyChanged();updateLineWidth();requestCatalog();
}
function stopPractice(){practicing=false;keys.clear();queuedJump=false;document.body.classList.remove('practicing');if(document.pointerLockElement===canvas)document.exitPointerLock();if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});resize();state=frameAt(run,time);}
function resetPractice(){
  state=ctStart(map,activeConfig);let seed=null;
  if($('checkpoint').value==='contact')seed=run.entry;else if($('checkpoint').value==='jump')seed=run.frames.find(p=>p.input.jump);
  if(seed)Object.assign(state,seed,{time:0,captureImpacts:true,impacts:[],contact:null,teleports:0,pushes:0,airTime:0});
  context={entry:$('checkpoint').value==='contact'?sampleState(state):null,lastContact:null,gap:0,exit:null,landed:false,contacted:false,gate:null,entryImpact:null,hits:0};
  finished=false;accumulator=0;keys.clear();queuedJump=false;activeTrail=[];updateTrail();clearForecast();$('live-notice').hidden=true;
}
async function practice(){
  $('error').hidden=true;playing=false;resetPractice();$('results').hidden=true;document.body.classList.add('practicing');resize();
  try{await Promise.resolve(canvas.requestPointerLock());document.documentElement.requestFullscreen?.().catch(()=>{});}catch(e){stopPractice();$('error').hidden=false;$('error').textContent='Não foi possível capturar o mouse. Abra o link em uma aba normal do Chrome/Edge e clique novamente em Praticar.';}
}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){practicing=true;last=null;}else if(practicing)stopPractice();});
document.addEventListener('mousemove',e=>{if(practicing){const delta=e.movementX*.14*Math.PI/180;state.yaw+=delta;mouseTurn+=delta;state.pitch=Math.max(-1.55,Math.min(1.55,state.pitch-e.movementY*.14*Math.PI/180));}});
document.addEventListener('keydown',e=>{
  if(!practicing)return;if(e.code==='Escape'){stopPractice();return;}if(e.code==='KeyR'&&!e.repeat){resetPractice();return;}
  if(['Digit1','Digit2','Digit3'].includes(e.code)&&!e.repeat){$('play-rate').value=({Digit1:'1',Digit2:'0.5',Digit3:'0.25'})[e.code];notice(`Tempo ${$('play-rate').selectedOptions[0].textContent}`);return;}
  if(['KeyH','KeyG'].includes(e.code)&&!e.repeat){const toggle=$(e.code==='KeyH'?'guides':'goal-enabled');toggle.checked=!toggle.checked;toggle.dispatchEvent(new Event('change'));return;}
  if(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)queuedJump=true;}
});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{if(practicing)stopPractice();});
function practiceTick(){
  const input=heldInput();input.jump ||= queuedJump;queuedJump=false;
  const previous={...state};stepPlayer(state,input,map,TICK,activeConfig);
  if(!Number.isFinite(state.x+state.y+state.z+state.vx+state.vy+state.vz)){resetPractice();notice('Estado inválido: voltamos ao início.');return;}
  if(isInitialRamp(state)){context.gap=0;context.lastContact=sampleState(state,input,'rampa');if(!context.entry){context.entry=context.lastContact;context.entryImpact=impactMetrics(state.impacts.find(p=>p.normal.z>.3&&p.normal.z<.7),activeConfig);}}
  else if(context.entry&&!context.exit){context.gap++;if(context.gap>=6&&context.lastContact)context.exit=context.lastContact;}
  if(context.exit&&(state.grounded||state.inWater))context.landed=true;
  if(context.exit&&(state.contact||state.grounded||state.inWater||state.onLadder))context.contacted=true;
  const gate=$('goal-enabled').checked?crossing(previous,state,study.target):null;
  if(gate){
    gate.hit=gate.error<=study.target.radius&&gate.airborne&&!state.onLadder;context.gate=gate;if(gate.hit)context.hits++;
    notice(gate.hit?'Alvo atingido no ar! Continue surfando.':`Passou a ${fmt(gate.error)} u do centro. Continue ou use R para tentar outra saída.`);
  }
  if(state.teleports!==previous.teleports||state.pushes!==previous.pushes){clearForecast();notice(state.teleports!==previous.teleports?'Teleporte do mapa. O guia acompanha seu novo embalo.':'Impulso do mapa. Continue escolhendo sua linha.');}
  if(activeTrail.length===0||state.time-activeTrail.at(-1).time>=.04){activeTrail.push({x:state.x,y:state.y,z:state.z,time:state.time});if(activeTrail.length>600)activeTrail.shift();}
}
function updateForecast(wall){
  if(!practicing)return;
  if(wall-lastTrail>100){updateTrail();lastTrail=wall;}
  if(!live.ready||live.busy||wall-lastForecast<280)return;
  const interval=lastForecast>0?(wall-lastForecast)/1000:.28;turnRate=Math.max(-2,Math.min(2,mouseTurn/interval));mouseTurn=0;lastForecast=wall;live.busy=true;
  worker.postMessage({type:'forecast',seq:++live.seq,epoch:live.epoch,state,options:{target:study.target,input:heldInput(),turnRate,config:activeConfig,goalEnabled:$('goal-enabled').checked,hasDeparted:Boolean(context.exit&&!context.contacted)}});
}
function forecastText(result){
  if(!result)return live.error?'indisponível':'calculando…';
  if(!result.valid)return 'nova previsão…';
  if(!result.gate)return 'sem cruzar · 2,8 s';
  return `${fmt(result.gate.error)} u${result.gate.hit?' · dentro':' · fora'}`;
}
function updateLiveHud(){
  const action=liveAction(),info=surfaceAdvice(state,activeConfig),input=heldInput(),packet=live.result;
  const phase={ground:'NO CHÃO · PREPARE O EMBALO',ramp:'NA RAMPA · LEIA A FACE',air:'NO AR · CURVE COM O EMBALO',ladder:'NA ESCADA',water:'NA ÁGUA'}[info.stage];
  $('phase').textContent=phase;$('play-rate-badge').textContent=`Tempo ${fmt(Number($('play-rate').value),Number($('play-rate').value)===1?0:2)}×`;$('entry-label').textContent='PREVISÃO · SEUS COMANDOS';$('goal-label').textContent='PREVISÃO · SUGESTÃO';
  const targeting=$('goal-enabled').checked&&!packet?.targetBehind;
  $('entry').textContent=targeting?forecastText(packet?.current):'voo livre';$('goal').textContent=targeting?forecastText(packet?.suggested):'sem alvo à frente';
  const right=action.input.right??0,key=right>0?'D':right<0?'A':'',delta=wrap(action.yaw-state.yaw),angle=delta*180/Math.PI;
  const turn=Math.abs(angle)<2?'Alinhe com o embalo':`Mouse ${angle>0?'à direita':'à esquerda'} · ${fmt(Math.min(180,Math.abs(angle)))}°`;
  const title={ground:action.input.jump?'Pule agora e solte W/S':'W para ganhar embalo; escolha a entrada',ramp:`${key} para pressionar esta face`,air:`${key} + giro suave para aproveitar o embalo`,ladder:'A direção da mira muda a subida',water:'W + Espaço para sair da água'}[info.stage];
  $('advice-title').textContent=title;
  $('advice').textContent=info.stage==='ramp'?`${turn}. Experimente sair mais alto ou mais à frente e compare as previsões.`:info.stage==='air'?`${turn}. ${state.vz>0?`Ápice em cerca de ${fmt(info.secondsToApex,1)} s sem nova colisão.`:'Você está descendo; strafe curva o voo, mas não suspende a queda.'}`:info.stage==='ground'?'Na base CT, a sugestão marca o salto perto da borda. O guia acompanha a linha que você escolher.':info.stage==='ladder'?'A/S/D dependem de qual face você toca e do ângulo da mira. Siga a tecla contornada e experimente o mouse.':'A previsão usa o mesmo movimento e as colisões do jogo.';
  if(live.error)$('advice').textContent+=' Previsão indisponível; os controles continuam livres.';
  showKeys(input,action.input);$('mouse').textContent='Contorno = sugestão';$('turn-arrow').textContent=Math.abs(angle)<2?'↑':angle>0?'→':'←';$('turn-label').textContent=turn;$('turn-needle').style.left=`${50+Math.max(-45,Math.min(45,angle))}%`;
}
function showKeys(input,best={}){
  for(const [key,on,recommended] of [['w',input.forward>0,best.forward>0],['a',input.right<0,best.right<0],['s',input.forward<0,best.forward<0],['d',input.right>0,best.right>0],['jump',input.jump,best.jump]]){
    $('key-'+key).classList.toggle('on',Boolean(on));$('key-'+key).classList.toggle('best',Boolean(recommended));
  }
}
function updateHud(){
  if(!state||!run)return;
  const vh=Math.hypot(state.vx,state.vy);$('speed').textContent=fmt(vh);$('vertical').textContent=`${state.vz>=0?'+':''}${fmt(state.vz)} u/s`;$('total').textContent=`${fmt(Math.hypot(vh,state.vz))} u/s`;
  if(practicing){updateLiveHud();return;}
  if(run.kind==='route'){updateRouteHud();return;}
  const phase=state.phase,impact=run.entryImpact,gate=time>=run.duration?run.gate:null;
  $('phase').textContent={base:'EXEMPLO · CORRIDA NA BASE CT',entrada:'EXEMPLO · PULO DE ENTRADA',rampa:'EXEMPLO · CONTATO NA RAMPA',voo:'EXEMPLO · SAÍDA / VOO'}[phase]??'EXEMPLO GRAVADO';
  $('entry-label').textContent='ANTES DO IMPACTO';$('goal-label').textContent='RESULTADO NO ALVO';
  $('entry').textContent=impact?`${fmt(impact.beforeHorizontal)} u/s`:run.kind==='controlled'?`${fmt(run.entry.speed)} u/s*`:'aguardando';
  $('goal').textContent=gate?gate.hit?'ACERTOU':`${fmt(gate.error)} u · fora`:'alvo opcional';
  $('advice-title').textContent='Exemplo gravado · você pode escolher outra linha';
  $('advice').textContent=phase==='base'?'Observe o salto perto da borda. Entre no jogo para receber sugestões sobre o seu movimento.':phase==='rampa'?'D mantém esta face nesta direção. A crista troca parte da velocidade horizontal por subida.':'Observe VH e VZ separadamente. A gravidade continua agindo durante o voo.';
  showKeys(state.input??{});$('mouse').textContent='Comandos deste exemplo';$('turn-arrow').textContent='↑';$('turn-label').textContent='Reprodução';$('turn-needle').style.left='50%';
  $('clock').textContent=`${fmt(time,2)} s`;$('timeline').value=time;$('toggle').textContent=playing?'Ⅱ':'▶';
}
function animate(wall){
  requestAnimationFrame(animate);if(!study)return;const elapsed=last==null?0:Math.min(.05,(wall-last)/1000);last=wall;
  if(practicing){accumulator+=elapsed*Number($('play-rate').value);while(accumulator>=TICK){practiceTick();accumulator-=TICK;}updateForecast(wall);}
  else{if(playing){time=Math.min(run.duration,time+elapsed*Number($('rate').value));if(time>=run.duration)playing=false;}state=frameAt(run,time);}
  document.body.classList.toggle('overview',$('camera').value==='overview');
  ghost.position.copy(point(state));ghost.visible=!practicing&&$('guides').checked&&$('camera').value==='overview';
  selectedLine.visible=routeMarkers.visible=!practicing;guideGroup.visible=$('guides').checked;comparisonGroup.visible=!practicing&&$('other-paths').checked;markerGroup.visible=$('goal-enabled').checked;
  document.body.classList.toggle('guide-hidden',!$('guides').checked);$('target-badge').hidden=!$('goal-enabled').checked;
  $('target-badge').textContent=run.kind==='route'&&!practicing?`GABARITO · ${run.label}`:`◎ ALVO OPCIONAL · RAIO ${study.target.radius} u`;
  if(performance.now()>noticeUntil)$('live-notice').hidden=true;
  if(practicing||$('camera').value==='first'){camera.position.set(...toRenderPoint(state.x,state.y,state.z+(state.eye??17)));const d=toRenderForward(state.yaw,state.pitch);camera.lookAt(camera.position.x+d[0],camera.position.y+d[1],camera.position.z+d[2]);}
  else if(run.kind==='route'){const distance=run.viewSpan*1.35/Math.min(1,camera.aspect);camera.position.copy(run.viewCenter).add(new THREE.Vector3(1,.28,.75).normalize().multiplyScalar(distance));camera.lookAt(run.viewCenter);}
  else{camera.position.set(...toRenderPoint(3000,-2150,1700));camera.lookAt(...toRenderPoint(-470,-2130,-450));}
  for(const group of [routeMarkers,markerGroup])for(const label of group.children)if(label.userData.label){const distance=label.position.distanceTo(camera.position),width=140*2*distance*Math.tan(camera.fov*Math.PI/360)/canvas.clientHeight;label.scale.set(width,width*96/512,1);}
  forecast.visible=practicing&&$('guides').checked&&forecast.userData.pointCount>1;suggestion.visible=practicing&&$('guides').checked&&suggestion.userData.pointCount>1;updateHud();world.update(wall/1000);renderer.render(scene,camera);
}
function requestCatalog(){
  if(!worker||!live.ready)return;const key=configKey(activeConfig);if(atlas.status==='loading'&&atlas.key===key)return;
  atlas.status='loading';atlas.key=key;atlas.catalog=null;$('watch-route').disabled=true;$('route-destination').disabled=true;$('route-coverage').textContent='Validando percursos nesta cfg…';
  worker.postMessage({type:'catalog',key,config:activeConfig});
}
function catalogChoice(){
  const destination=atlas.catalog?.destinations.find(d=>d.id===$('route-destination').value),route=atlas.catalog?.routes.find(r=>r.id===destination?.routeId);
  $('watch-route').disabled=cfgDirty||!route;$('route-note').textContent=route?`${route.via??'Percurso físico'} · ${fmt(route.duration,2)} s · ${route.complexity?.switches??0} trocas de comando · giro horizontal ${fmt((route.complexity?.yawRadians??0)*180/Math.PI)}°. ${route.description??''}`:destination?.reason??'Sem rota verificada nesta cfg.';
}
function renderCatalog(){
  const catalog=atlas.catalog,prior=$('route-destination').value;
  $('route-destination').replaceChildren(...catalog.destinations.map(d=>new Option(`${d.routeId?'✓':'○'} ${d.label}`,d.id)));$('route-destination').disabled=false;
  if(catalog.destinations.some(d=>d.id===prior))$('route-destination').value=prior;else $('route-destination').value=(catalog.destinations.find(d=>d.routeId)??catalog.destinations[0]).id;
  const verified=catalog.destinations.filter(d=>d.routeId).length;$('route-coverage').textContent=`${verified} de ${catalog.destinations.length} destinos com gabarito verificado nesta cfg. Todos os ${catalog.sampleCount??catalog.routes.length} candidatos foram simulados.`;
  $('route-list').replaceChildren(...catalog.destinations.map(d=>{const row=document.createElement('div');row.className=d.routeId?'success':'unverified';row.textContent=`${d.routeId?'✓':'○'} ${d.label}${d.routeId?'':' · sem rota verificada'}`;return row;}));catalogChoice();
}
function watchRoute(){
  if(cfgDirty||atlas.key!==configKey(activeConfig))return;
  const destination=atlas.catalog?.destinations.find(d=>d.id===$('route-destination').value),route=atlas.catalog?.routes.find(r=>r.id===destination?.routeId);if(!route)return;
  run=route;const bounds=new THREE.Box3().setFromPoints(run.frames.map(point));run.viewCenter=bounds.getCenter(new THREE.Vector3());const size=bounds.getSize(new THREE.Vector3());run.viewSpan=Math.max(size.x,size.y,size.z,600);time=0;playing=true;state=frameAt(run,0);$('timeline').max=run.duration;$('rate').value='1';$('camera').value=$('route-camera').value;buildPaths();$('results').hidden=true;updateHud();
}
function updateRouteHud(){
  const step=run.steps?.find(p=>time>=p.start&&time<=p.end)??run.steps?.at(-1),input=state.input??{};
  $('phase').textContent=`GABARITO · ${run.label.toUpperCase()}`;$('entry-label').textContent='TEMPO DO PERCURSO';$('entry').textContent=`${fmt(time,2)} / ${fmt(run.duration,2)} s`;$('goal-label').textContent='DESTINO';$('goal').textContent=time>=run.duration?'CHEGOU':'em percurso';
  $('advice-title').textContent=time>=run.duration?`Chegada · ${run.label}`:step?.label??'Observe os comandos deste percurso';$('advice').textContent=time>=run.duration?'Sequência verificada nesta cfg. Use a barra para rever o giro e cada troca de comando.':run.description??'A reprodução mostra comandos, colisões e teleportes realmente simulados, sem deslocamento artificial.';
  showKeys(input,input);const next=frameAt(run,Math.min(run.duration,time+.1)),delta=wrap(next.yaw-state.yaw)*180/Math.PI;
  $('mouse').textContent=Math.abs(delta)<.15?'mantenha o mouse':delta>0?'mouse → direita':'mouse ← esquerda';$('turn-arrow').textContent=Math.abs(delta)<.15?'↑':delta>0?'→':'←';$('turn-label').textContent=Math.abs(delta)<.15?'Direção constante':`Giro: ${fmt(Math.abs(delta),1)}° / 0,1 s`;$('turn-needle').style.left=`${50+Math.max(-45,Math.min(45,delta*3))}%`;
  $('clock').textContent=`${fmt(time,2)} s`;$('timeline').value=time;$('toggle').textContent=playing?'Ⅱ':'▶';
}
$('watch-route').onclick=watchRoute;$('route-destination').onchange=catalogChoice;$('route-camera').onchange=()=>{if(run?.kind==='route')$('camera').value=$('route-camera').value;};
function fillConfig(config){
  for(const field of CFG_FIELDS)$('cfg-'+field.key).value=config[field.key];
  for(const key of ['stamina','bunnyCap'])$('cfg-'+key).checked=config[key];
}
function draftConfig(){
  const values={};for(const field of CFG_FIELDS){const input=$('cfg-'+field.key);if(!input.reportValidity())throw new Error(`${field.cvar}: confira o valor.`);values[field.key]=Number(input.value);}
  for(const key of ['stamina','bunnyCap'])values[key]=$('cfg-'+key).checked;
  return normalizeConfig(values);
}
function markConfig(){cfgDirty=true;$('watch-route').disabled=true;$('practice').disabled=true;$('demo').disabled=true;$('cfg-status').textContent='Alterações pendentes. Clique em Aplicar cfg antes de jogar ou assistir.';$('cfg-preset').value='custom';}
function initSettings(){
  $('cfg-fields').innerHTML=CFG_FIELDS.map(f=>`<label>${f.label}<small>${f.cvar}</small><input id="cfg-${f.key}" aria-label="${f.cvar}" type="number" min="${f.min}" max="${f.max}" step="any" required></label>`).join('');
  fillConfig(activeConfig);
  for(const input of $('cfg-settings').querySelectorAll('input'))input.addEventListener('input',markConfig);
  $('cfg-preset').onchange=()=>{const preset=$('cfg-preset').value;if(CFG_PRESETS[preset]){fillConfig(CFG_PRESETS[preset]);markConfig();$('cfg-preset').value=preset;}};
  $('cfg-apply').onclick=async()=>{
    const previous=activeConfig;
    try{const next=draftConfig();activeConfig=next;clearForecast();$('cfg-apply').disabled=true;await calculate();cfgDirty=false;$('cfg-summary').textContent=`gravidade ${fmt(next.gravity)} / ar ${fmt(next.airAcceleration)}`;$('cfg-status').textContent='Cfg aplicada ao jogador, previsões, comparações e gabaritos.';$('practice').disabled=$('demo').disabled=false;if(atlas.catalog)catalogChoice();}
    catch(error){activeConfig=previous;$('cfg-status').textContent=error.message;}
    finally{$('cfg-apply').disabled=false;}
  };
  $('line-width').oninput=updateLineWidth;
}
initSettings();
$('family').onchange=familyChanged;$('trial').onchange=()=>selectRun($('trial').value);$('precision').onchange=calculate;
$('toggle').onclick=()=>{if(time>=run.duration)time=0;playing=!playing;};$('demo').onclick=()=>{time=0;playing=true;};$('restart').onclick=()=>{time=0;playing=true;};$('timeline').oninput=()=>{time=Number($('timeline').value);playing=false;};$('practice').onclick=practice;
$('compare').onclick=()=>{if(run.kind==='route')familyChanged();$('results').hidden=false;updateResults();};$('close-results').onclick=()=>$('results').hidden=true;
$('guides').onchange=()=>guideGroup.visible=$('guides').checked;
$('goal-enabled').onchange=()=>{clearForecast();if(practicing)notice($('goal-enabled').checked?'Alvo ligado. Escolha a saída que quiser.':'Alvo desligado. Continue surfando com o guia.');};$('other-paths').onchange=()=>comparisonGroup.visible=$('other-paths').checked;
window.addEventListener('resize',()=>{resize();if(study&&!$('results').hidden)drawScan();});document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;if(practicing)stopPractice();}});
try{
  const response=await fetch('./maps/surf_ski_2.bsp');if(!response.ok)throw new Error(`Mapa: HTTP ${response.status}`);map=new BspMap(await response.arrayBuffer());world=buildBspScene(map,renderer,scene);resize();setupWorker();await calculate();
  window.ctLab=Object.freeze({snapshot:()=>({ready:true,practicing,finished,playing,time,selected:run.id,replayKind:run.kind,family:$('family').value,pointerLocked:document.pointerLockElement===canvas,fullscreen:!!document.fullscreenElement,target:{...study.target},config:activeConfig,cfgDirty,lineWidth:Number($('line-width').value),timeScale:Number($('play-rate').value),atlas:{status:atlas.status,key:atlas.key,destinations:atlas.catalog?.destinations,routes:atlas.catalog?.routes.map(r=>({id:r.id,label:r.label,duration:r.duration,verified:r.verified,complexity:r.complexity}))},state:sampleState(state),guide:{ready:live.ready,updates:live.updates,source:live.source,status:live.result?.status,action:practicing?liveAction():null,goalEnabled:$('goal-enabled').checked,error:live.error},manual:context?{entry:context.entry,exit:context.exit,gate:context.gate,hits:context.hits}:null,result:{hit:run.hit,entry:run.entryImpact,exit:run.exit,gate:run.gate},cases:study.cases.map(r=>({id:r.id,hit:r.hit,error:r.gate?.error,entry:r.entryImpact?.beforeHorizontal,exit:r.exit?.speed})),limits:study.limits})});requestAnimationFrame(animate);
}catch(e){$('loading').hidden=true;$('error').hidden=false;$('error').textContent=`Não foi possível preparar o estudo: ${e.message}`;console.error(e);}
