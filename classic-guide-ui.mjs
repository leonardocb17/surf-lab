import * as THREE from './vendor/three.module.min.js';
import {widePath} from './wide-path.mjs';
import {toRenderPoint} from './view-space.mjs';
import {frameAt,routeStart,suggestedAction,wrap} from './classic-coach.mjs?v=20261030-guide';
const $=id=>document.getElementById(id),degrees=x=>x*180/Math.PI;
const fmt=(n,d=0)=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:d});
export async function createClassicGuide({map,mapInfo,scene,config,onWatch,onTrain}){
  const response=await fetch(`./routes/${mapInfo.id}.json?v=20261030-guide`);
  if(!response.ok)throw new Error('Gabarito ainda não disponível.');
  const data=await response.json(),routes=data.routes;
  const state={run:null,result:null,ready:false,busy:false,epoch:0,updates:0,source:null,lastForecast:-1000,mouse:0,error:null,watching:false,playing:false,time:0};
  const group=new THREE.Group();scene.add(group);
  const reference=new THREE.Group();group.add(reference);
  const current=widePath(0xffb347,6,{dashed:true}),suggestion=widePath(0x7cf2cd,8),nearReference=widePath(0x68b9f2,6,{opacity:.75});group.add(current,suggestion,nearReference);
  const marker=new THREE.Mesh(new THREE.TorusGeometry(65,5,8,48),new THREE.MeshBasicMaterial({color:0x93f1d5,depthTest:false}));marker.rotation.x=Math.PI/2;group.add(marker);
  const ghost=new THREE.Mesh(new THREE.CapsuleGeometry(16,40,4,8),new THREE.MeshBasicMaterial({color:0xe9f9f3,wireframe:true}));ghost.rotation.x=Math.PI/2;group.add(ghost);
  const worker=new Worker(new URL('./classic-worker.mjs?v=20261030-guide',import.meta.url),{type:'module'});
  const resetForecast=()=>{state.result=null;state.source=null;state.busy=false;state.lastForecast=-1000;state.mouse=0;state.referenceIndex=null;current.setPoints([]);suggestion.setPoints([]);nearReference.setPoints([]);};
  const choice=()=>routes.find(r=>r.id===$('guide-route').value)??routes[0];
  function preparePaths(run){
    for(const line of [...reference.children]){line.dispose();reference.remove(line);}
    let segment=[],teleports=0;const flush=()=>{if(segment.length>1){const line=widePath(0x68b9f2,6,{opacity:.65});line.setPoints(segment);reference.add(line);}segment=[];};
    for(let i=0;i<run.frames.length;i+=4){const f=run.frames[i];if(segment.length&&f.teleports!==teleports)flush();segment.push(f);teleports=f.teleports;}flush();
    marker.position.set(...toRenderPoint(run.definition.destination.x,run.definition.destination.y,run.definition.destination.z));
    run.bounds=new THREE.Box3().setFromPoints(run.frames.map(p=>new THREE.Vector3(...toRenderPoint(p.x,p.y,p.z))));
  }
  function requestRoute(init=false){
    state.epoch++;state.ready=false;state.run=null;state.error=null;state.watching=false;resetForecast();
    $('watch-route').disabled=$('train-route').disabled=true;$('guide-note').textContent='Conferindo o percurso no mesmo motor do jogo…';
    $('entry').querySelector('option[value=route]').disabled=true;
    const message={type:init?'init':'route',id:choice().id,epoch:state.epoch,config:config()};
    if(init){message.routes=routes;message.buffer=map.buffer.slice(0);worker.postMessage(message,[message.buffer]);}else worker.postMessage(message);
  }
  worker.onmessage=({data})=>{
    if(data.epoch!==state.epoch)return;
    if(data.type==='error'){state.error=data.message;state.busy=false;$('guide-note').textContent=data.message;return;}
    if(data.type==='route'){
      state.run=data.run;state.ready=data.run.verified;state.busy=false;
      $('watch-route').disabled=$('train-route').disabled=!state.ready;
      $('entry').querySelector('option[value=route]').disabled=!state.ready;
      if(!state.ready){$('guide-note').textContent=data.run.reason;reference.visible=false;return;}
      const r=data.run.definition;preparePaths(data.run);$('replay-seek').max=data.run.duration;
      $('guide-note').textContent=`${fmt(data.run.duration,2)} s · ${r.description??'Percurso completo conferido com as colisões e a física do treino.'}`;
      $('guide-details').textContent=`${Array.isArray(r.coverage)?r.coverage.join(' → '):r.coverage}. ${r.searchNote}`;
    }
    if(data.type==='forecast'){
      state.busy=false;state.result=data.result;state.source=data.source;state.updates++;
      current.setPoints(data.result.current.points);suggestion.setPoints(data.result.suggested.points);
    }
  };
  worker.onerror=()=>{state.error='Previsão indisponível';state.busy=false;};
  $('guide-route').replaceChildren(...routes.map(r=>new Option(r.label,r.id)));$('guide-route').onchange=()=>requestRoute();
  $('watch-route').onclick=()=>{if(!state.ready)return;resetForecast();state.watching=true;state.playing=true;state.time=0;onWatch();};
  $('train-route').onclick=()=>{if(state.ready)onTrain();};
  $('replay-toggle').onclick=()=>{state.playing=!state.playing;if(state.time>=state.run.duration){state.time=0;state.playing=true;}};
  $('replay-seek').oninput=e=>{state.time=Number(e.target.value);state.playing=false;};
  $('replay-restart').onclick=()=>{state.time=0;state.playing=true;};
  $('replay-menu').onclick=()=>{state.watching=false;state.playing=false;document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));};
  requestRoute(true);
  return {
    state,
    reset(){state.watching=false;state.playing=false;if(state.ready)state.epoch++;resetForecast();},
    reconfigure(){requestRoute();},
    mouse(delta){state.mouse+=delta;},
    start(){return state.run?.verified?routeStart(map,state.run.definition):null;},
    replay(dt){if(state.playing){state.time=Math.min(state.run.duration,state.time+dt);if(state.time>=state.run.duration)state.playing=false;}return frameAt(state.run,state.time);},
    camera(camera){
      if(!state.watching||$('replay-camera').value!=='overview')return false;
      const center=state.run.bounds.getCenter(new THREE.Vector3()),size=state.run.bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,700)*1.2/Math.min(camera.aspect,1);
      camera.position.copy(center).add(new THREE.Vector3(-1,1,.8).normalize().multiplyScalar(span));camera.lookAt(center);return true;
    },
    update(player,input,wall,active,freeFly){
      const enabled=$('live-guide').checked&&!freeFly,watch=state.watching;
      document.body.classList.toggle('watching-route',watch);$('replay-controls').hidden=!watch;
      group.visible=enabled&&Boolean(state.ready)&&(!document.body.classList.contains('menu-open'));
      reference.visible=!freeFly;$('guide-panel').hidden=!enabled||document.body.classList.contains('menu-open');
      current.visible=!watch&&current.userData.pointCount>1;suggestion.visible=!watch&&suggestion.userData.pointCount>1;
      ghost.visible=watch&&$('replay-camera').value==='overview';ghost.position.set(...toRenderPoint(player.x,player.y,player.z));
      if(!state.ready){$('guide-title').textContent='Guia em preparação';$('guide-command').textContent=state.error??'Selecione o perfil Surf para usar o percurso validado.';return;}
      if(watch){$('replay-seek').value=state.time;$('replay-clock').textContent=`${fmt(state.time,2)} / ${fmt(state.run.duration,2)} s`;$('replay-toggle').textContent=state.playing?'Ⅱ Pausar':'▶ Reproduzir';}
      const fresh=state.result&&state.source&&Math.abs(state.source.time-player.time)<.8&&Math.hypot(state.source.x-player.x,state.source.y-player.y,state.source.z-player.z)<Math.max(500,Math.hypot(player.vx,player.vy)*.6);
      const action=watch?null:fresh?state.result.action:suggestedAction(player,state.run);
      const command=watch?player.input:action.input;
      const overview=watch&&$('replay-camera').value==='overview',index=watch?Math.floor(state.time/.01):action.anchor.index;
      reference.visible=overview;nearReference.visible=!overview;
      if(state.referenceIndex!==Math.floor(index/10)||state.referenceOverview!==overview){
        state.referenceIndex=Math.floor(index/10);state.referenceOverview=overview;
        const points=[];let teleports=state.run.frames[index]?.teleports;
        for(let i=index;i<Math.min(index+300,state.run.frames.length);i+=4){const f=state.run.frames[i];if(f.teleports!==teleports)break;points.push(f);}
        nearReference.setPoints(points);
      }
      nearReference.visible=!overview&&nearReference.userData.pointCount>1;
      for(const [key,on] of [['w',command.forward>0],['s',command.forward<0],['a',command.right<0],['d',command.right>0],['jump',command.jump]]){$('key-'+key)?.classList.toggle('best',Boolean(on)&&!watch);if(watch)$('key-'+key)?.classList.toggle('on',Boolean(on));}
      const angle=watch?(player.mouseRate??0):wrap(action.yaw-player.yaw),turn=degrees(angle)*(watch?Number($('replay-rate').value):1);
      const commandKeys=[command.forward>0?'W':command.forward<0?'S':'',command.right>0?'D':command.right<0?'A':'',command.jump?'Espaço':'',command.duck?'Ctrl':''].filter(Boolean);
      const mouse=Math.abs(turn)<(watch?2:2)?'Mouse alinhado ao embalo':`Mouse ${turn>0?'→ direita':'← esquerda'} · ${fmt(Math.abs(turn))}${watch?'°/s':'°'}`;
      const anchor=watch?null:action.anchor;
      $('guide-title').textContent=watch?`GABARITO · ${state.time>=state.run.duration?'CHEGADA':'ASSISTINDO'}`:state.result?.current.danger&&fresh?'SEU VOO ALCANÇA UMA ZONA DE DANO':anchor.nearest>500?'FORA DA LINHA · REORIENTE A ENTRADA':'GUIA AO VIVO · SUA POSIÇÃO';
      $('guide-command').textContent=`${commandKeys.join(' + ')||'Solte as teclas'} · ${mouse}`;
      $('guide-context').textContent=watch?stageLabel(player,state.run):action.stage==='waterjump'?'Saída automática junto à borda da água. O impulso é temporário; a gravidade volta ao deixar a piscina.':`${anchor.nearest>500?'A linha está distante; use Treinar este início para comparar. ':''}Azul: gabarito. Verde: sugestão. Laranja: seus comandos atuais. Previsões de 1,2 s do jogo; contorno nas teclas = sugestão.`;
      $('mouse-arrow').textContent=Math.abs(turn)<2?'↑':turn>0?'→':'←';$('mouse-label').textContent=mouse;
      if(!watch&&active&&!freeFly&&enabled&&!state.busy&&wall-state.lastForecast>300){
        const elapsed=state.lastForecast>0?(wall-state.lastForecast)/1000:.3,turnRate=state.mouse/elapsed/Number($('time-scale').value);state.mouse=0;state.lastForecast=wall;state.busy=true;
        worker.postMessage({type:'forecast',epoch:state.epoch,state:player,options:{input,turnRate}});
      }
    },
    snapshot(){return {ready:state.ready,watching:state.watching,playing:state.playing,time:state.time,duration:state.run?.duration,route:state.run?.definition?.id,coverage:state.run?.definition?.coverage,updates:state.updates,source:state.source,action:state.result?.action,error:state.error};}
  };
}
function stageLabel(player,run){
  const stages=run.definition.stages??[],stage=[...stages].reverse().find(s=>(s.time??s.start)<=player.time);
  return stage?.label??(player.grounded?'Ganhe embalo com W; observe o salto.':player.contact?'Pressione a face com A/D e conduza o mouse.':'Strafe curva o voo. A gravidade continua agindo.');
}
