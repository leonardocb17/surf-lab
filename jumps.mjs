import {simulateJump,createStudyMap,heights,STOCK,SURF,BODY,TICK} from './jump-sim.mjs?v=20261030-guides';
import {spawnPlayer,stepPlayer} from './goldsrc.mjs?v=20261030-guides';
import {STAMINA_RESET} from './movement-rules.mjs?v=20261030-guides';
import {toRenderPoint,toRenderForward} from './view-space.mjs';
const $=id=>document.getElementById(id),colors=['#86b9f3','#efc386','#8de5d0'],fmt=(v,d=1)=>v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
let mode='duck',runs=[],focus=2,time=.335,playing=false,last=null,manualActive=false,manual=null,queuedJump=false,manualAccumulator=0;
const held=new Set();
function configuration(){return {...($('air-profile').value==='surf'?SURF:STOCK),bunnyCap:$('bunny-cap').checked,stamina:true};}
function frameAt(run,t){return run.frames[Math.min(run.frames.length-1,Math.max(0,Math.floor((t+1e-8)/TICK)))];}
function rebuild(){
  const speed=Number($('launch-speed').value),duckAt=Number($('duck-time').value)/1000,config=configuration(),stamina=$('second-jump').checked?STAMINA_RESET-650:0,base={speed,duckAt,config,stamina};
  let definitions;
  if(mode==='duck')definitions=[{label:'Pulo em pé',duck:'none'},{label:'Já agachado ao pular',duck:'before'},{label:'Agacha durante o pulo',duck:'air'}];
  if(mode==='speed')definitions=[{label:'Parado · 0 u/s',speed:0},{label:'Em movimento · 125 u/s',speed:125},{label:`Selecionado · ${speed} u/s`,speed}];
  if(mode==='strafe')definitions=[{label:'Sem strafe',strafe:'none'},{label:'Giro brusco / dessincronizado',strafe:'rough'},{label:'A/D + giro coordenado',strafe:'smooth'}];
  runs=definitions.map((d,i)=>({...simulateJump({...base,...d}),label:d.label,color:colors[i]}));focus=Math.min(focus,runs.length-1);
  $('focus').replaceChildren(...runs.map((r,i)=>new Option(r.label,i)));$('focus').value=String(focus);
  $('launch-value').textContent=`${speed} u/s`;$('duck-value').textContent=`${fmt(duckAt*1000,0)} ms`;$('duck-field').hidden=mode!=='duck';
  const copy={duck:['Quando agachar','Três saltos saem do mesmo piso. Agachar antes significa já ter concluído a contração no chão.'],speed:['Velocidade e altura','Mesmo impulso, mesma gravidade. Observe a altura e compare até onde cada salto chega.'],strafe:['Strafe no ar','A/D e a direção da mira mudam a aceleração horizontal. A componente vertical continua sob gravidade.']}[mode];
  $('experiment-title').textContent=copy[0];$('experiment-copy').textContent=copy[1];
  $('legend').innerHTML=runs.map(r=>`<span><i class="dot" style="background:${r.color}"></i>${r.label}</span>`).join('');
  const maximum=Math.max(...runs.map(r=>r.duration))+.08;$('timeline').max=maximum;time=Math.min(time,maximum);
  updateTable();updateExplanation();paint();
}
function updateTable(){
  $('results').innerHTML=runs.map((r,i)=>`<tr class="${i===focus?'selected':''}"><td><i class="dot" style="background:${r.color}"></i>${r.label}</td><td>${fmt(r.peakRise)} u</td><td>${fmt(r.peakFeet)} u</td><td>${fmt(r.duration,2)} s</td><td>${fmt(r.range)} u</td></tr>`).join('');
}
function updateExplanation(){
  let text={duck:'Agachar no ar recolhe os pés em 18 u, sem adicionar velocidade vertical. Se isso acontecer antes do ápice, os pés podem alcançar cerca de 63 u. Já totalmente agachado antes da saída, a subida dos pés continua perto de 45 u.',speed:'Em piso plano, velocidade horizontal não entra na fórmula do impulso vertical. Ela muda o alcance. Para ganhar altura com velocidade em uma rampa, é necessário que a colisão redirecione esse movimento para cima.',strafe:'O strafe coordenado acrescenta velocidade horizontal e curva o percurso. Ele não cria sustentação nem interrompe a queda. O giro brusco pode frear, mesmo segurando A ou D.'}[mode];
  if(mode==='duck'&&Number($('duck-time').value)>335)text+=' Você está agachando depois do ápice: o máximo dos pés pode ficar abaixo de 63 u.';
  if($('bunny-cap').checked&&Number($('launch-speed').value)>300)text+=' O limite de bunnyhop está ativo: acima de 300 u/s, a decolagem é reduzida para 240 u/s neste piso plano (comando máximo 250).';
  if($('second-jump').checked)text+=' A stamina de um salto recente reduz o impulso deste salto; compare com a opção desmarcada.';
  $('explanation').textContent=text;
}
function surface(canvas){
  const width=canvas.clientWidth,height=canvas.clientHeight,ratio=Math.min(devicePixelRatio,2);
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
  const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,width,height);return {c,width,height};
}
function drawSide(){
  const {c,width,height}=surface($('trajectory')),all=runs.flatMap(r=>r.frames),minX=Math.min(-22,...all.map(s=>s.x-18)),maxX=Math.max(200,...all.map(s=>s.x+20)),scale=Math.min((width-76)/(maxX-minX), (height-45)/155),left=52-minX*scale,bottom=height-27,x=v=>left+v*scale,z=v=>bottom-v*scale;
  c.font='10px Segoe UI';c.textAlign='right';
  for(const h of [0,18,45,63,90,120]){c.strokeStyle=h===0?'#7095a6':'#2a4251';c.lineWidth=1;c.setLineDash(h===0?[]:[3,5]);c.beginPath();c.moveTo(39,z(h));c.lineTo(width-10,z(h));c.stroke();c.fillStyle='#8fa7b6';c.fillText(`${h} u`,34,z(h)+3);}
  c.setLineDash([]);const key=$('measure').value;
  for(const r of runs){
    for(const ghost of [true,false]){c.strokeStyle=r.color;c.globalAlpha=ghost?.18:.9;c.lineWidth=ghost?1:2;c.beginPath();let first=true;for(const s of r.frames){if(!ghost&&s.time>time)break;if(first){c.moveTo(x(s.x),z(s[key]));first=false;}else c.lineTo(x(s.x),z(s[key]));}c.stroke();}c.globalAlpha=1;
  }
  for(const [i,r] of runs.entries()){
    const s=frameAt(r,time),half=s.crouched?18:36;c.fillStyle=r.color;c.strokeStyle=r.color;c.lineWidth=i===focus?2:1;c.globalAlpha=i===focus?.17:.06;c.fillRect(x(s.x-16),z(s.z+half),32*scale,half*2*scale);c.globalAlpha=i===focus?1:.4;c.strokeRect(x(s.x-16),z(s.z+half),32*scale,half*2*scale);
    if(i===focus){for(const [value,color,radius] of [[s.center,r.color,3],[s.feet,'#f4ffff',3],[s.eye,'#efc386',2]]){c.fillStyle=color;c.beginPath();c.arc(x(s.x),z(value),radius,0,Math.PI*2);c.fill();}}
    c.globalAlpha=1;
  }
  const s=frameAt(runs[focus],time);c.textAlign='left';c.fillStyle='#d7e7ec';c.font='10px Segoe UI';c.fillText(`${runs[focus].label} · ${s.crouched?'colisão 36 u':'colisão 72 u'}`,45,16);c.fillStyle='#a2bbc8';c.fillText('● Centro   ● Pés (branco)   ● Câmera (dourado)',45,31);
  c.textAlign='right';c.fillText(`→ distância à frente · ${fmt(maxX-minX,0)} u visíveis`,width-10,height-5);
}
function drawTop(){
  const {c,width,height}=surface($('top-path')),all=runs.flatMap(r=>r.frames),minX=Math.min(-10,...all.map(s=>s.x)),maxX=Math.max(180,...all.map(s=>s.x)),maxY=Math.max(30,...all.map(s=>Math.abs(s.y))),sx=(width-70)/(maxX-minX),sy=(height-30)/(maxY*2),scale=Math.min(sx,sy),x=v=>40+(v-minX)*scale,y=v=>height/2+v*scale;
  c.strokeStyle='#2f4958';c.beginPath();c.moveTo(15,height/2);c.lineTo(width-15,height/2);c.stroke();
  for(const r of runs){c.strokeStyle=r.color;c.globalAlpha=.2;c.beginPath();r.frames.forEach((s,i)=>i?c.lineTo(x(s.x),y(s.y)):c.moveTo(x(s.x),y(s.y)));c.stroke();c.globalAlpha=1;c.lineWidth=2;c.beginPath();r.frames.filter(s=>s.time<=time).forEach((s,i)=>i?c.lineTo(x(s.x),y(s.y)):c.moveTo(x(s.x),y(s.y)));c.stroke();const s=frameAt(r,time);c.fillStyle=r.color;c.beginPath();c.arc(x(s.x),y(s.y),3,0,Math.PI*2);c.fill();}
}
function paint(){
  if(!runs.length)return;const s=frameAt(runs[focus],time);drawSide();drawTop();
  $('feet-now').textContent=fmt(s.feet);$('rise-now').textContent=fmt(s.rise);$('speed-now').textContent=fmt(s.speed,0);$('vz-now').textContent=fmt(s.vz,0);
  $('clock').textContent=`${fmt(time,3)} s`;$('timeline').value=time;$('play').textContent=playing?'Ⅱ Pausar':'▶ Reproduzir';$('view-state').textContent=playing?'COMPARAÇÃO EM MOVIMENTO':'COMPARAÇÃO PAUSADA';
  $('frame-state').textContent=s.grounded?'Pousou':s.time===0?'Antes da saída':s.vz>0?'Subindo':'Descendo';
  for(const [id,on] of [['a',(s.input.right||0)<0],['d',(s.input.right||0)>0],['duck',s.input.duck],['jump',s.input.jump]])$('input-'+id).classList.toggle('on',Boolean(on));
  const previous=frameAt(runs[focus],Math.max(0,time-TICK)),turn=s.yaw-previous.yaw;$('mouse-now').textContent=`Mouse: ${Math.abs(turn)<.0001?'manter direção':turn>0?'→ direita':'← esquerda'} · ${fmt(s.yaw*180/Math.PI,0)}°`;
}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{mode=button.dataset.mode;playing=false;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-selected',String(b===button));rebuild();};
for(const id of ['launch-speed','duck-time','bunny-cap','second-jump'])$(id).addEventListener('input',()=>{playing=false;rebuild();});
$('air-profile').onchange=()=>{$('bunny-cap').checked=$('air-profile').value==='stock';playing=false;rebuild();};
$('focus').onchange=()=>{focus=Number($('focus').value);updateTable();paint();};$('measure').onchange=paint;
$('play').onclick=()=>{if(time>=Number($('timeline').max)-.01)time=0;playing=!playing;paint();};$('restart').onclick=()=>{time=0;playing=true;paint();};$('timeline').oninput=()=>{playing=false;time=Number($('timeline').value);paint();};
async function initializeManual(){
  const THREE=await import('./vendor/three.module.min.js'),canvas=$('manual-view'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const scene=new THREE.Scene();scene.background=new THREE.Color('#183443');scene.fog=new THREE.Fog('#183443',900,2400);scene.add(new THREE.HemisphereLight('#cde8ee','#284448',3));const light=new THREE.DirectionalLight('#ffe5ba',3);light.position.set(-200,-400,700);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(3000,2400),new THREE.MeshStandardMaterial({color:'#1e3b48',roughness:.8}));floor.position.z=-.05;scene.add(floor);
  const grid=new THREE.GridHelper(2400,48,'#63818a','#35545f');grid.rotation.x=Math.PI/2;grid.position.z=.05;scene.add(grid);
  const map=createStudyMap(true);
  for(const [i,b] of map.boxes.entries()){const box=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.d,b.h),new THREE.MeshStandardMaterial({color:i?'#86b9f3':'#efc386',roughness:.5}));box.position.set(...toRenderPoint(b.x+b.w/2,b.y+b.d/2,b.h/2));scene.add(box);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),new THREE.LineBasicMaterial({color:'#f2ffff'}));edges.position.copy(box.position);scene.add(edges);}
  const line=new THREE.Mesh(new THREE.PlaneGeometry(3,200),new THREE.MeshBasicMaterial({color:'#8de5d0'}));line.position.z=.1;scene.add(line);
  const camera=new THREE.PerspectiveCamera(70,1,1,3000);camera.up.set(0,0,1);return {THREE,renderer,scene,camera,map,state:null};
}
function resetManual(){manual.state=spawnPlayer(manual.map);manual.state.x=-180;manual.state.pitch=-.04;manual.state.peakFeet=0;held.clear();queuedJump=false;manualAccumulator=0;}
function endManual(){manualActive=false;held.clear();$('manual').hidden=true;if(document.pointerLockElement===$('manual-view'))document.exitPointerLock();if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});}
$('exit-manual').onclick=endManual;
$('train').onclick=async()=>{
  $('manual-error').hidden=true;
  try{
    if(!manual)manual=await initializeManual();$('manual').hidden=false;resetManual();
    // A second click is only necessary if asynchronous WebGL setup consumes activation.
    await Promise.resolve($('manual-view').requestPointerLock());
    document.documentElement.requestFullscreen?.().catch(()=>{});manualActive=document.pointerLockElement===$('manual-view');
  }catch(e){endManual();$('manual-error').hidden=false;$('manual-error').textContent='Não foi possível abrir a pista com mouse capturado. Clique novamente em Treinar, ou abra o link em uma aba normal do Chrome/Edge.';}
};
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===$('manual-view')){manualActive=true;last=null;}else if(manualActive)endManual();});
document.addEventListener('mousemove',e=>{if(manualActive){manual.state.yaw+=e.movementX*.0022;manual.state.pitch=Math.max(-1.55,Math.min(1.55,manual.state.pitch-e.movementY*.0022));}});
document.addEventListener('keydown',e=>{if(!manualActive)return;if(e.code==='Escape'){endManual();return;}if(e.code==='KeyR'){resetManual();return;}if(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight'].includes(e.code)){e.preventDefault();held.add(e.code);if(e.code==='Space'&&!e.repeat)queuedJump=true;}});
document.addEventListener('keyup',e=>held.delete(e.code));window.addEventListener('blur',()=>{if(manualActive)endManual();});
function manualFrame(dt){
  const {renderer,camera,scene,state:s,map,THREE}=manual;manualAccumulator+=dt;
  while(manualAccumulator>=TICK){const input={forward:Number(held.has('KeyW'))-Number(held.has('KeyS')),right:Number(held.has('KeyD'))-Number(held.has('KeyA')),jump:queuedJump||held.has('Space'),duck:held.has('ControlLeft')||held.has('ControlRight')};queuedJump=false;stepPlayer(s,input,map,TICK,configuration());s.peakFeet=Math.max(s.peakFeet,heights(s).feet);manualAccumulator-=TICK;}
  if(renderer.domElement.width!==Math.round(innerWidth*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(innerHeight*renderer.getPixelRatio())){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  camera.position.set(...toRenderPoint(s.x,s.y,s.z+s.eye));const d=toRenderForward(s.yaw,s.pitch);camera.lookAt(new THREE.Vector3(camera.position.x+d[0],camera.position.y+d[1],camera.position.z+d[2]));renderer.render(scene,camera);
  $('manual-stats').textContent=`${s.crouched?'AGACHADO':'EM PÉ'} · ${s.grounded?'NO CHÃO':'NO AR'} · ${fmt(Math.hypot(s.vx,s.vy),0)} u/s · Pés: ${fmt(heights(s).feet)} u · Máximo dos pés: ${fmt(s.peakFeet)} u`;
}
function frame(now){requestAnimationFrame(frame);const dt=last==null?0:Math.min(.05,(now-last)/1000);last=now;if(manualActive){manualFrame(dt);return;}if(playing){time=Math.min(Number($('timeline').max),time+dt*Number($('rate').value));if(time>=Number($('timeline').max))playing=false;paint();}}
window.addEventListener('resize',paint);document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;if(manualActive)endManual();}});
window.jumpLab=Object.freeze({snapshot:()=>({mode,time,playing,focus,config:configuration(),cases:runs.map(({label,peakRise,peakFeet,range,duration,peakSpeed,takeoffSpeed})=>({label,peakRise,peakFeet,range,duration,peakSpeed,takeoffSpeed})),manualActive,pointerLocked:document.pointerLockElement===$('manual-view'),fullscreen:!!document.fullscreenElement,manual:manual?.state?{...manual.state,...heights(manual.state)}:null})});
rebuild();requestAnimationFrame(frame);
