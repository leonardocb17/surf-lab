import * as THREE from './vendor/three.module.min.js';
import {DT,GRAVITY,clamp,angleDelta,createCourse,rampHeight,spawn,step,policy,applyControl,recommend,coastPrediction,airMetrics,isFlightCourse} from './physics.mjs?v=20261028-arcos';
import {toRenderPoint,toRenderForward} from './view-space.mjs';

const $=id=>document.getElementById(id);
const canvas=$('view'),menu=$('menu'),error=$('error');
const held={a:false,d:false};
const requestedCourse=new URLSearchParams(location.search).get('fase');
let courseMode=requestedCourse==='fundamentos'?'basic':requestedCourse==='abismo'?'abyss':requestedCourse==='voo'?'sky':'lateral';
let destination=new URLSearchParams(location.search).get('destino')||(courseMode==='lateral'?'left':'island');
let course=createCourse(false,courseMode,destination),state=spawn(course),active=false,demo=false,checkpoint=0;
let accumulator=0,lastFrame=null,physicsCount=0,guide=null,guideVisible=true;
let rate=1,sensitivity=.14*Math.PI/180,actualInput=0,toastUntil=0,lastProgress=1;
let flight=null,lastFlight=null,coast=null,techniquesVisible=true,airFeedback=null;
let peakSpeed=0;
let flightTrail=[];
const goal=()=>course.find(r=>r.id===course.goalId);
const flightName=()=>courseMode==='lateral'?'Arcos laterais':'Voo livre';
const format=(n,digits=0)=>n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setClearColor(0x142635);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x142635,2600,16000);
const camera=new THREE.PerspectiveCamera(60,1,2,23000);camera.up.set(0,0,1);
scene.add(new THREE.AmbientLight(0xb5d4e5,1.5));
const sunlight=new THREE.DirectionalLight(0xffedce,2.8);sunlight.position.set(...toRenderPoint(-1000,-2000,5000));scene.add(sunlight);
let floorZ=course.at(-1).c-1300;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(24000,13000),new THREE.MeshStandardMaterial({color:0x132b3a,roughness:1}));floor.position.set(4500,0,floorZ);scene.add(floor);
const grid=new THREE.GridHelper(24000,120,0x3b5b6d,0x244353);grid.rotation.x=Math.PI/2;grid.position.set(4500,0,floorZ+1);grid.material.transparent=true;grid.material.opacity=.42;scene.add(grid);
const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=128;
const textureContext=textureCanvas.getContext('2d');
textureContext.fillStyle='#dde5ea';textureContext.fillRect(0,0,128,128);textureContext.fillStyle='#cad6de';textureContext.fillRect(0,0,64,64);textureContext.fillRect(64,64,64,64);
textureContext.strokeStyle='#a2b5c0';textureContext.lineWidth=1;textureContext.strokeRect(.5,.5,127,127);textureContext.beginPath();textureContext.moveTo(64,0);textureContext.lineTo(64,128);textureContext.moveTo(0,64);textureContext.lineTo(128,64);textureContext.stroke();
const texture=new THREE.CanvasTexture(textureCanvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const sideMaterial=new THREE.MeshStandardMaterial({color:0x263c4c,roughness:.95,side:THREE.DoubleSide});
const targets=[];
const levelGroup=new THREE.Group();scene.add(levelGroup);
function quad(points,material,uvs=null){
  const geometry=new THREE.BufferGeometry();const order=[0,1,2,0,2,3],positions=[],uv=[];
  for(const i of order){positions.push(...toRenderPoint(...points[i]));if(uvs)uv.push(...uvs[i]);}
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(uvs)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);levelGroup.add(mesh);return mesh;
}
function labelSprite(text,caption='RAMPA'){
  const c=document.createElement('canvas');c.width=256;c.height=128;const p=c.getContext('2d');
  p.fillStyle='#102637';p.fillRect(4,4,248,120);p.strokeStyle='#6e9aad';p.lineWidth=2;p.strokeRect(4,4,248,120);
  p.textAlign='center';p.fillStyle='#e8f3f6';p.font=`500 ${text.length>3?40:60}px Segoe UI,Arial`;p.fillText(text,128,77,230);p.fillStyle='#8caaba';p.font='16px Segoe UI,Arial';p.fillText(caption,128,106,230);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true}));sprite.scale.set(180,90,1);return sprite;
}
function buildCourse(){
  const disposed=new Set();
  for(const child of [...levelGroup.children]){
    child.geometry?.dispose();
    const material=child.material;
    if(material&&material!==sideMaterial&&!disposed.has(material)){if(material.map&&material.map!==texture)material.map.dispose();material.dispose();disposed.add(material);}
    levelGroup.remove(child);
  }
  targets.length=0;
  floorZ=course.at(-1).c-1300;floor.position.set(Math.max(...course.map(r=>r.x1))/2,0,floorZ);grid.position.set(floor.position.x,0,floorZ+1);
  floor.scale.set(isFlightCourse(course)?2.5:1,isFlightCourse(course)?3:1,1);grid.scale.setScalar(isFlightCourse(course)?2.5:1);
  floor.material.color.setHex(isFlightCourse(course)?0x357d9c:0x132b3a);grid.material.opacity=isFlightCourse(course)?.2:.42;
  const sky=isFlightCourse(course)?0x83b1ce:courseMode==='abyss'?0x161f36:0x142635;renderer.setClearColor(sky);scene.fog.color.setHex(sky);
  scene.fog.near=isFlightCourse(course)?8000:2600;scene.fog.far=isFlightCourse(course)?50000:16000;camera.far=isFlightCourse(course)?65000:23000;camera.updateProjectionMatrix();
  for(const r of course.surfaces||course){
  const a=[r.x0,r.y0,rampHeight(r,r.y0,r.x0)],b=[r.x1,r.y0,rampHeight(r,r.y0,r.x1)],c=[r.x1,r.y1,rampHeight(r,r.y1,r.x1)],d=[r.x0,r.y1,rampHeight(r,r.y1,r.x0)];
  const topMaterial=new THREE.MeshStandardMaterial({map:texture,color:isFlightCourse(course)?(r.goal?0xacc0b7:0xcad4da):r.id%2?0x7895a7:0x8d99a0,roughness:.92,side:THREE.DoubleSide});
  const top=quad([a,b,c,d],topMaterial,[[0,0],[(r.x1-r.x0)/100,0],[(r.x1-r.x0)/100,(r.y1-r.y0)/64],[0,(r.y1-r.y0)/64]]);
  const base=isFlightCourse(course)&&r.goal?floorZ+10:Math.min(a[2],b[2],c[2],d[2])-100,lowA=[r.x0,r.y0,base],lowB=[r.x1,r.y0,base],lowC=[r.x1,r.y1,base],lowD=[r.x0,r.y1,base];
  quad([a,b,lowB,lowA],sideMaterial);quad([b,c,lowC,lowB],sideMaterial);quad([c,d,lowD,lowC],sideMaterial);quad([d,a,lowA,lowD],sideMaterial);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(top.geometry),new THREE.LineBasicMaterial({color:0xbcd4dc,transparent:true,opacity:.4}));levelGroup.add(edges);
  if(isFlightCourse(course)&&r.id===1&&r.x0>0)continue;
  const sprite=labelSprite(r.name||String(r.id).padStart(2,'0'),isFlightCourse(course)?'DESTINO DE VOO':'RAMPA');
  sprite.position.set(...toRenderPoint(r.x0+160,isFlightCourse(course)?(r.y0+r.y1)/2:r.side*(r.width||450),r.c+(isFlightCourse(course)?500:800)));if(isFlightCourse(course))sprite.scale.set(700,350,1);levelGroup.add(sprite);
  const target=new THREE.Mesh(new THREE.RingGeometry(isFlightCourse(course)?160:32,isFlightCourse(course)?178:37,48),new THREE.MeshBasicMaterial({color:r.id===course.goalId?0xffc37c:0x72e4d9,transparent:true,opacity:.9,side:THREE.DoubleSide}));
  const ty=isFlightCourse(course)?(r.y0+r.y1)/2:r.side*220,tx=isFlightCourse(course)?(r.x0+r.x1)/2:r.id===course.length?r.x1-100:r.x0+300;
  target.position.set(...toRenderPoint(tx,ty,rampHeight(r,ty,tx)+5));target.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...toRenderPoint(r.n.x,r.n.y,r.n.z)));target.userData.rampId=r.id;levelGroup.add(target);targets.push(target);
  if(courseMode==='abyss'&&r.id<course.length){
    const start=r.x1-600;
    quad([[start,r.y0,rampHeight(r,r.y0)+1],[r.x1,r.y0,rampHeight(r,r.y0)+1],[r.x1,r.y1,rampHeight(r,r.y1)+1],[start,r.y1,rampHeight(r,r.y1)+1]],new THREE.MeshBasicMaterial({color:0xf2bf7c,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
    const next=course[r.id],gap=labelSprite(`${format(next.x0-r.x1)} u`,'VAZIO · PREPARE O STRAFE');
    gap.position.set(...toRenderPoint((r.x1+next.x0)/2,0,r.c+200));gap.scale.set(260,130,1);gap.userData.gapLabel=true;levelGroup.add(gap);
  }
  }
  $('ramp-dots').replaceChildren(...course.map(()=>document.createElement('i')));
  $('course-select').value=courseMode;
  $('flight-brief').hidden=courseMode==='basic';
  $('flight-brief').innerHTML=courseMode==='lateral'?'<span>ALVOS DOS DOIS LADOS</span><span>CURVAS LONGAS NO AR</span><span>MAPA DO ARCO</span>':isFlightCourse(course)?'<span>DESCIDA DE ACELERAÇÃO</span><span>VOO DE CERCA DE 6 s</span><span>3 DESTINOS</span>':`<span>${course.length} RAMPAS</span><span>VÃOS DE ATÉ ${format(Math.max(...course.slice(1).map((r,i)=>r.x0-course[i].x1)))} u</span><span>PARTIDA A ${format(Math.hypot(state.vx,state.vy))} u/s</span>`;
  $('destination-choice').hidden=!isFlightCourse(course);
  if(isFlightCourse(course))$('destination').replaceChildren(...course.filter(r=>r.goal).map(r=>new Option(r.name,r.key)));
  $('destination').value=goal()?.key||'island';
  $('long-flight-stats').hidden=!isFlightCourse(course);
  $('lateral-stats').hidden=courseMode!=='lateral';
  document.body.classList.toggle('advanced',courseMode!=='basic');document.body.classList.toggle('big-air',isFlightCourse(course));
  document.body.classList.toggle('lateral-course',courseMode==='lateral');
  document.title=`${isFlightCourse(course)?flightName():courseMode==='abyss'?'Abismo':'Fundamentos'} · Surf Lab`;
}
buildCourse();
const predictionGeometry=new THREE.BufferGeometry();const predictionData=new Float32Array(400*3);predictionGeometry.setAttribute('position',new THREE.BufferAttribute(predictionData,3));predictionGeometry.setDrawRange(0,0);
const prediction=new THREE.Line(predictionGeometry,new THREE.LineBasicMaterial({color:0x72e4d9,transparent:true,opacity:.92}));prediction.frustumCulled=false;scene.add(prediction);
const ghost=new THREE.Mesh(new THREE.IcosahedronGeometry(11,1),new THREE.MeshBasicMaterial({color:0x72e4d9,wireframe:true,transparent:true,opacity:.8}));scene.add(ghost);
const coastGeometry=new THREE.BufferGeometry(),coastData=new Float32Array(400*3);
coastGeometry.setAttribute('position',new THREE.BufferAttribute(coastData,3));coastGeometry.setDrawRange(0,0);
const coastLine=new THREE.Line(coastGeometry,new THREE.LineDashedMaterial({color:0xf2bf7c,dashSize:25,gapSize:20,transparent:true,opacity:.8}));coastLine.frustumCulled=false;scene.add(coastLine);

function setToast(text){$('toast').textContent=text;$('toast').hidden=false;toastUntil=performance.now()+2200;}
function savePreferences(){try{localStorage.setItem('surf-lab-preferences',JSON.stringify({rate,sensitivity:sensitivity*180/Math.PI,guideVisible}));}catch{}}
try{const saved=JSON.parse(localStorage.getItem('surf-lab-preferences')||'null');if(saved){if([.25,.5,1].includes(saved.rate))rate=saved.rate;if(Number.isFinite(saved.sensitivity))sensitivity=clamp(saved.sensitivity,.05,.3)*Math.PI/180;if(typeof saved.guideVisible==='boolean')guideVisible=saved.guideVisible;}}catch{}
$('rate').value=String(rate);$('sensitivity').value=String(sensitivity*180/Math.PI);$('sensitivity-value').textContent=`${format(sensitivity*180/Math.PI,2)}° / px`;$('guide-toggle').checked=guideVisible;
function updatePrediction(){
  if(!guide)return;
  let count=0;for(const p of guide.path){predictionData.set(toRenderPoint(p.x,p.y,p.z+8),count*3);count++;}
  predictionGeometry.attributes.position.needsUpdate=true;predictionGeometry.setDrawRange(0,count);
  prediction.material.color.setHex(0x72e4d9);ghost.material.color.copy(prediction.material.color);
  const p=guide.path[Math.min(14,guide.path.length-1)];if(p)ghost.position.set(...toRenderPoint(p.x,p.y,p.z+20));
}
function computeGuide(){
  guide=recommend(state,course);updatePrediction();
  coast=courseMode!=='basic'&&!state.contact?coastPrediction(state,course,isFlightCourse(course)?10:4):null;
  let count=0;for(const p of coast?.path||[]){coastData.set(toRenderPoint(p.x,p.y,p.z+8),count*3);count++;}
  coastGeometry.attributes.position.needsUpdate=true;coastGeometry.setDrawRange(0,count);coastLine.computeLineDistances();
}
function resetRun(fromStart=false){
  checkpoint=fromStart||isFlightCourse(course)?0:checkpoint;state=spawn(course,checkpoint);accumulator=0;physicsCount=0;held.a=held.d=false;actualInput=0;flight=lastFlight=airFeedback=null;flightTrail=[];peakSpeed=Math.hypot(state.vx,state.vy,state.vz);lastProgress=state.progress;computeGuide();updateHUD();
}
function updateFlightCoach(){
  $('flight-panel').hidden=courseMode==='basic'||!techniquesVisible;
  const r=course[state.progress-1],remaining=r.x1-state.x;
  let title,copy;
  if(state.contact){
    if(state.contact===course.length){title='Recepção concluída';copy='Continue estável na face até cruzar a última marca.';}
    else if(remaining<700){title='Saia subindo a face';copy='A faixa âmbar marca a saída. Suba com embalo e leve velocidade vertical para o salto.';}
    else{title='Preserve o embalo';copy='Use a parte baixa da face. Prepare a subida antes da borda; o próximo vão exige alcance.';}
  }else{
    const next=course[Math.min(state.progress,course.length-1)];
    if(state.x>next.x0-350&&state.vz<0){title='Prepare a recepção';copy='Ajuste a curva cedo, alivie o giro e procure a face da próxima rampa. Siga a troca de A/D.';}
    else if(airFeedback?.braking){title='Você está freando no ar';copy='Alivie o giro e alinhe ao ponto verde. Um giro excessivo pode retirar velocidade horizontal.';}
    else if(actualInput){title=actualInput<0?'A + mouse suave à esquerda':'D + mouse suave à direita';copy=state.vz>0?`Ápice em ${format(state.vz/GRAVITY,2)} s pelo impulso da saída. Faça um arco suave, sem chicotear a mira.`:'Você já desce. O strafe pode dar alcance e corrigir a linha, mas não interrompe a queda.';}
    else{title='Escolha seu arco de strafe';copy='Acompanhe A/D e o ponto verde. Só alternar as teclas com a mira parada não cria aceleração contínua.';}
  }
  if(isFlightCourse(course)){
    if(state.contact===1){
      title=state.x<6000?'Deixe a descida gerar embalo':state.x<8000?'Converta embalo em subida':'Prepare o grande voo';
      copy=state.x<6000?'A gravidade acelera você na descida. Segure a tecla indicada e evite atravessar a face com um giro brusco.':'A curva da rampa aponta a velocidade para cima. A subida vem da superfície; levantar a mira não cria impulso.';
    }else if(!state.contact){
      title=state.vz>0?'Subindo com o impulso da saída':'Você desce, mas ainda tem alcance';
      copy=`Destino: ${goal().name}. Faça curvas largas com A/← ou D/→. Olhe o terreno passar: você continua caindo enquanto avança.`;
      if(airFeedback?.braking){title='O giro está roubando velocidade';copy='Alivie a curva e acompanhe o guia. Com tanto embalo, pequenas correções já mudam bastante o destino.';}
    }
  }
  if(courseMode==='lateral'&&!state.contact){
    const next=policy(state,course),elapsed=flight?state.time-flight.start:0;
    title=elapsed<1.5?'Comece a curva cedo':guide?.landingTime!=null&&guide.landingTime<1.3?'Ajuste a recepção':'Faça um arco contínuo';
    copy=next.input<0?'Segure A e acompanhe o ponto verde com um giro suave à esquerda. O alvo fica fora da linha da rampa.':next.input>0?'Segure D e acompanhe o ponto verde com um giro suave à direita. Use o mapa para acompanhar o deslocamento.':'A linha está ajustada. Solte A/D por enquanto e preserve o embalo; volte a corrigir quando o guia pedir.';
    if(airFeedback?.braking){title='Alivie o giro para preservar alcance';copy='Virar rápido demais pode frear. Acompanhe o ponto verde em vez de apontar a mira de uma vez para a ilha.';}
  }
  $('technique-title').textContent=title;$('technique-copy').textContent=copy;
  const f=flight||lastFlight,elapsed=flight?state.time-flight.start:Math.max(0,f?.duration||0),gain=flight?Math.hypot(state.vx,state.vy)-flight.speed:f?.gain||0;
  $('air-time').textContent=`${format(elapsed,2)} s`;$('air-gain').textContent=`${gain>=0?'+':''}${format(gain)} u/s`;
  $('launch-vz').textContent=f?`${f.vz>=0?'↑':'↓'} ${format(Math.abs(f.vz))}`:'—';
  const efficiency=!state.contact&&actualInput?Math.round((airFeedback?.efficiency||0)*100):0;
  $('sync-value').textContent=state.contact?'NA RAMPA':!actualInput?'SEM A/D':airFeedback?.braking?'FREANDO':`${efficiency}%`;
  $('sync-label').textContent='Eficiência de aceleração';
  $('sync-fill').style.width=`${efficiency}%`;$('sync-fill').style.background=airFeedback?.braking?'#f2bf7c':'';
  const distance=flight?Math.hypot(state.x-flight.x,state.y-flight.y):lastFlight?.distance||0;
  $('flight-distance').textContent=`${format(distance)} u`;$('peak-speed').textContent=`${format(peakSpeed)} u/s`;
  $('landing-eta').textContent=flight&&guide?.landingTime!=null?`${format(guide.landingTime,1)} s`:'—';
  const lateral=flight?state.y-flight.y:lastFlight?.lateral||0;
  $('lateral-distance').textContent=`${lateral<0?'←':'→'} ${format(Math.abs(lateral))} u`;
  const remainingY=goal()?(goal().y0+goal().y1)/2-state.y:0;
  $('lateral-remaining').textContent=`${remainingY<0?'←':'→'} ${format(Math.abs(remainingY))} u`;
}
function drawRouteMap(){
  $('route-panel').hidden=courseMode!=='lateral'||!techniquesVisible;
  if(courseMode!=='lateral')return;
  const ctx=$('route-map').getContext('2d'),pads=course.filter(r=>r.goal);
  const minX=course[0].x1-1200,maxX=Math.max(...pads.map(r=>r.x1))+500,minY=Math.min(...pads.map(r=>r.y0))-700,maxY=Math.max(...pads.map(r=>r.y1))+700;
  const scale=Math.min(236/(maxY-minY),168/(maxX-minX));
  const project=p=>({x:130+(p.y-(minY+maxY)/2)*scale,y:103-(p.x-(minX+maxX)/2)*scale});
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,260,205);ctx.save();ctx.beginPath();ctx.rect(5,5,250,195);ctx.clip();
  const origin={x:course[0].x1,y:(flight||lastFlight)?.y||760*course[0].side};
  const line=(points,color,dash=[])=>{
    if(!points.length)return;
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.setLineDash(dash);
    points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.stroke();ctx.setLineDash([]);
  };
  line([{x:minX,y:origin.y},{x:maxX,y:origin.y}],'#58718680',[3,4]);
  line([{x:origin.x,y:minY},{x:origin.x,y:maxY}],'#58718680',[3,4]);
  for(const pad of pads){
    const a=project({x:pad.x1,y:pad.y0}),b=project({x:pad.x0,y:pad.y1}),selected=pad.id===course.goalId;
    ctx.fillStyle=selected?'#f2bf7c33':'#86a6b229';ctx.strokeStyle=selected?'#f2bf7c':'#7d9baa';ctx.lineWidth=selected?1.5:1;
    ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
    ctx.fillStyle=selected?'#f2bf7c':'#b4c8d2';ctx.font='10px Segoe UI,Arial';ctx.textAlign='center';
    ctx.fillText(pad.key==='left'?'E':pad.key==='right'?'D':'X',(a.x+b.x)/2,(a.y+b.y)/2+3);
  }
  if(guideVisible)line(guide?.path||[],'#72e4d9');
  line(flightTrail,'#eff7ff');
  const start=project(origin);ctx.fillStyle='#9bb4c4';ctx.beginPath();ctx.arc(start.x,start.y,3,0,Math.PI*2);ctx.fill();
  ctx.font='9px Segoe UI,Arial';ctx.textAlign='center';ctx.fillText('SAÍDA',start.x,start.y+14);
  const player=project(state);player.x=clamp(player.x,9,251);player.y=clamp(player.y,10,193);
  const speed=Math.max(1,Math.hypot(state.vx,state.vy)),dx=state.vy/speed,dy=-state.vx/speed;
  ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(player.x+dx*13,player.y+dy*13);ctx.stroke();
  ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(player.x,player.y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
}
function updateHUD(){
  $('speed').textContent=format(Math.hypot(state.vx,state.vy));$('vertical').textContent=`${state.vz>=0?'↑':'↓'} ${format(Math.abs(state.vz))} u/s vertical${isFlightCourse(course)?` · ${format(Math.hypot(state.vx,state.vy,state.vz))} total`:''}`;
  $('speed').style.color=state.airGain< -1?'#f2bf7c':'';
  $('ramp-label').textContent=isFlightCourse(course)?`${flightName()} · ${goal().name}`:`${courseMode==='abyss'?'Abismo':'Fundamentos'} · ${state.progress} / ${course.length}`;
  const stage=isFlightCourse(course)?(state.outcome==='won'?3:!state.contact?2:state.x<6000?0:1):state.progress-1;
  [...$('ramp-dots').children].forEach((dot,i)=>{dot.className=i<stage?'done':i===stage?'current':'';});
  $('key-a').classList.toggle('held',actualInput<0);$('key-d').classList.toggle('held',actualInput>0);
  const action=guide?policy(state,course,guide.params):null;
  $('key-a').classList.toggle('recommended',guideVisible&&action?.input<0);$('key-d').classList.toggle('recommended',guideVisible&&action?.input>0);
  $('input-note').textContent=demo?'Demonstração automática':guideVisible?'Contorno verde: guia':'A / D para deslizar';
  $('motion-label').textContent=state.outcome==='won'?'Percurso concluído':state.outcome?'Você caiu':state.contact?state.vz>20?'Subindo na face':state.vz< -20?'Descendo na face':'Deslizando':'No ar';
  $('checkpoint-label').textContent=isFlightCourse(course)?'R · repetir o lançamento':`Checkpoint ${checkpoint+1} · R reinicia`;
  $('session-label').textContent=demo?'DEMONSTRAÇÃO':active?(rate<1?`TREINO ${rate}×`:'MOUSE CAPTURADO'):'PAUSADO';
  document.body.classList.toggle('guide-off',!guideVisible);
  prediction.visible=ghost.visible=guideVisible;
  targets.forEach((target,i)=>{target.visible=isFlightCourse(course)?target.userData.rampId===course.goalId:i===Math.min(state.progress,course.length-1);});
  coastLine.visible=guideVisible&&courseMode!=='basic'&&!state.contact;
  updateFlightCoach();
  drawRouteMap();
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
  $('menu-kicker').textContent=isFlightCourse(course)?'VOO LIVRE · INSPIRADO NOS GRANDES SALTOS DO SKI':courseMode==='abyss'?'ABISMO · CINCO RAMPAS. QUATRO GRANDES SALTOS.':'FUNDAMENTOS · O PERCURSO ORIGINAL';
  if(kind==='won'){title.innerHTML=isFlightCourse(course)?'Destino<br><em>alcançado.</em>':courseMode==='abyss'?'Abismo<br><em>superado.</em>':'Seis rampas.<br><em>Você chegou.</em>';$('menu-copy').textContent=isFlightCourse(course)?`${course.find(r=>r.id===state.landedId)?.name}: ${format(lastFlight?.duration||0,2)} segundos sem tocar uma rampa e ${format(lastFlight?.distance||0)} unidades percorridas no ar. Pico de velocidade total: ${format(peakSpeed)} u/s.`:`Percurso completo em ${format(state.time,2)} segundos de simulação. Velocidade final: ${format(Math.hypot(state.vx,state.vy))} u/s.`;$('play').innerHTML='Jogar novamente <span>↗</span>';}
  else if(kind==='fell'){title.innerHTML='Mais uma<br><em>tentativa.</em>';$('menu-copy').textContent=`Você volta ao checkpoint ${checkpoint+1}. Use o contorno das teclas e o ponto verde para acompanhar a recomendação.`;$('play').innerHTML='Tentar o checkpoint <span>↗</span>';}
  else{title.innerHTML=state.time?'Retome o<br><em>seu embalo.</em>':isFlightCourse(course)?'Ganhe embalo.<br><em>Atravesse o céu.</em>':courseMode==='abyss'?'Domine<br><em>o vazio.</em>':'Encontre o<br><em>seu embalo.</em>';$('menu-copy').textContent=isFlightCourse(course)?'Uma longa descida, uma curva de lançamento e cerca de seis segundos inteiros no ar. Escolha onde pousar e veja como altura, velocidade e strafe se combinam para chegar longe.':courseMode==='abyss'?'Vãos enormes e recepções estreitas. Saia subindo, faça um arco de strafe suave e preserve velocidade até a próxima face. Veja a demonstração para estudar o caminho.':'Olhe livremente com o mouse. Use A e D para conduzir a trajetória. O guia mostra uma previsão dos próximos movimentos.';$('play').innerHTML=state.time?'Continuar em tela cheia <span>↗</span>':'Jogar em tela cheia <span>↗</span>';}
  if(courseMode==='lateral'){
    $('menu-kicker').textContent='ARCOS LATERAIS · ESCOLHA UM ALVO FORA DA LINHA';
    if(kind==='won')$('menu-copy').textContent+=` Deslocamento lateral: ${format(Math.abs(lastFlight?.lateral||0))} u.`;
    else if(kind!=='fell'){
      title.innerHTML=state.time?'Retome<br><em>o seu arco.</em>':'Vire no ar.<br><em>Chegue do outro lado.</em>';
      $('menu-copy').textContent='Ilhas muito afastadas para a esquerda e para a direita. Comece a curva cedo, dosando A/D e o mouse. O mapa de cima mostra o arco previsto e a trajetória que você realmente fez.';
    }
  }
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
  if(event.code==='KeyH'&&!event.repeat){techniquesVisible=!techniquesVisible;updateHUD();return;}
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
function changeCourse(){
  courseMode=$('course-select').value;destination=$('destination').value;course=createCourse(false,courseMode,destination);state=spawn(course);checkpoint=0;demo=false;
  destination=goal()?.key||destination;
  buildCourse();resetRun(true);setMenu();
  const url=new URL(location.href);url.searchParams.set('fase',courseMode==='lateral'?'lateral':isFlightCourse(course)?'voo':courseMode==='abyss'?'abismo':'fundamentos');if(isFlightCourse(course))url.searchParams.set('destino',destination);else url.searchParams.delete('destino');history.replaceState(null,'',url);
}
$('course-select').addEventListener('change',changeCourse);$('destination').addEventListener('change',changeCourse);
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
      if(demo){
        const action=policy(state,course,guide.params);actualInput=applyControl(state,action);
        state.pitch=isFlightCourse(course)?(state.contact===1?clamp(Math.atan2(state.vz,Math.hypot(state.vx,state.vy))-.08,-.8,.7):clamp(Math.atan2(goal().c-state.z,Math.hypot((goal().x0+goal().x1)/2-state.x,(goal().y0+goal().y1)/2-state.y)),-.8,.3)):-12*Math.PI/180;
      }
      const hadContact=state.contact;airFeedback=airMetrics(state,actualInput);
      step(state,actualInput,course);accumulator-=DT;physicsCount++;
      peakSpeed=Math.max(peakSpeed,Math.hypot(state.vx,state.vy,state.vz));
      if(hadContact&&!state.contact){flight={start:state.time,speed:Math.hypot(state.vx,state.vy),vz:state.vz,z:state.z,x:state.x,y:state.y};computeGuide();}
      if(flight&&physicsCount%5===0)flightTrail.push({x:state.x,y:state.y});
      if(!hadContact&&state.contact&&flight){lastFlight={...flight,duration:state.time-flight.start,gain:Math.hypot(state.vx,state.vy)-flight.speed,distance:Math.hypot(state.x-flight.x,state.y-flight.y),lateral:state.y-flight.y};flightTrail.push({x:state.x,y:state.y});flight=null;computeGuide();}
      if(state.progress>lastProgress){checkpoint=isFlightCourse(course)?0:state.progress-1;lastProgress=state.progress;if(!isFlightCourse(course))setToast(`Checkpoint ${state.progress} / ${course.length}`);}
    }
    if(state.outcome)setMenu(state.outcome==='won'?'won':'fell');
  }
  camera.position.set(...toRenderPoint(state.x,state.y,state.z+64));
  for(const child of levelGroup.children)if(child.isSprite){
    const distance=courseMode==='lateral'?child.position.distanceTo(camera.position):child.position.x-state.x,minDistance=courseMode==='lateral'?800:child.userData.gapLabel?450:180;
    child.visible=distance>minDistance;child.material.opacity=clamp((distance-minDistance)/(courseMode==='lateral'?800:child.userData.gapLabel?600:220),0,1);
  }
  const forward=toRenderForward(state.yaw,state.pitch);
  look.set(camera.position.x+forward[0],camera.position.y+forward[1],camera.position.z+forward[2]);camera.lookAt(look);
  updateHUD();renderer.render(scene,camera);
}
window.surfLab=Object.freeze({snapshot:()=>({...state,active,demo,checkpoint,courseMode,destination:goal()?.key,peakSpeed,flight:flight?{...flight,elapsed:state.time-flight.start}:null,lastFlight,coastVisible:coastLine.visible,coastLanding:coast?.landed,airFeedback,pointerLocked:document.pointerLockElement===canvas,fullscreen:!!document.fullscreenElement,ramps:course.length,guideInput:guide?.input,guideSafe:guide?.safe,cameraForward:camera.getWorldDirection(new THREE.Vector3()).toArray()})});
computeGuide();setMenu();$('loading').hidden=true;requestAnimationFrame(frame);
