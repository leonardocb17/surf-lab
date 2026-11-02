import * as THREE from './vendor/three.module.min.js';
import {physicsPoint} from './bsp.mjs?v=20261102-ski-study';
const fmt=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const speed=s=>Math.hypot(s.vx,s.vy,s.vz),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),ramp=s=>s.contact&&s.contact.z>.05&&s.contact.z<.7;
export const MARIO_ACCESS=Object.freeze({x:3696,y:-3840,z:166.03125,radius:70});
export function restoreCheckpoint(saved){return {...structuredClone(saved),lastTeleport:(saved.lastTeleport??-10)-(saved.time??0),time:0,event:null,stuck:false,impacts:[]};}
export function launchForecast(s,gravity,target=MARIO_ACCESS){
  const vx=s.vx||0,vy=s.vy||0,vz=s.vz||0,v2=vx*vx+vy*vy,dx=target.x-s.x,dy=target.y-s.y;
  const gap=Math.max(0,target.z-s.z),required=Math.sqrt(2*gravity*gap),apex=s.z+Math.max(0,vz)**2/(2*gravity),time=v2>1?(dx*vx+dy*vy)/v2:null;
  const usable=time!==null&&time>0&&time<15;
  return {distance:Math.hypot(dx,dy),requiredVz:required,apexMargin:apex-target.z,time:usable?time:null,miss:usable?Math.hypot(dx-vx*time,dy-vy*time):null,heightAtClosest:usable?s.z+vz*time-gravity*time*time/2-target.z:null};
}
export function faceCheckpoint(map,index,label,axis='x'){
  const face=map.faces[index],vertices=map.faceVertices(face).map(physicsPoint),p=vertices.reduce((a,b)=>({x:a.x+b.x/vertices.length,y:a.y+b.y/vertices.length,z:a.z+b.z/vertices.length}),{x:0,y:0,z:0});
  const pl=map.planes[face.plane],sign=face.side?-1:1,n=physicsPoint({x:pl.normal.x*sign,y:pl.normal.y*sign,z:pl.normal.z*sign});
  for(const direction of ['normal','vertical']){
    const a=direction==='normal'?{x:p.x+n.x*120,y:p.y+n.y*120,z:p.z+n.z*120}:{...p,z:p.z+120},b=direction==='normal'?{x:p.x+n.x*5,y:p.y+n.y*5,z:p.z+n.z*5}:{...p,z:p.z-80},hit=map.trace(a,b,1);
    if(hit.startSolid||hit.fraction===1||hit.normal.x*n.x+hit.normal.y*n.y+hit.normal.z*n.z<.99)continue;
    const entry={...hit.end,x:hit.end.x+n.x*.15,y:hit.end.y+n.y*.15,z:hit.end.z+n.z*.15,yaw:axis==='x'?0:Math.PI/2,pitch:-.12,face:index,normal:n,label,axis};
    if(!map.trace(entry,entry,1).startSolid)return entry;
  }
  return null;
}
export function createSkiStudy({map,scene,config,select,notice}){
  const entries=new Map();
  for(const [face,label,axis] of [[1947,'Rampa CT · face direita','y'],[1975,'Rampa CT · face esquerda','y'],[925,'Rampa alta · trecho reto','x'],[856,'Rampa lateral baixa','y'],[1532,'Rampa transversal baixa','x']]){const e=faceCheckpoint(map,face,label,axis);if(e)entries.set('ski-ramp-'+face,e);}
  const upper={x:2900,y:-1000,z:1164.514779511503,yaw:0,pitch:-.12,normal:{x:-.479298,y:-.735218,z:.479298},axis:'x',label:'Rampa alta · antes da curva final',face:325};
  if(!map.trace(upper,upper,1).startSolid)entries.set('ski-ramp-325',upper);
  for(const [id,e] of entries)select.add(new Option('Treino · '+e.label,id));
  const settings=document.createElement('section');settings.className='ski-study-settings';settings.innerHTML='<h2>Treino de saída e acesso ao Mario</h2><p>O jogo começa na base. Para repetir uma rampa, escolha uma entrada de treino acima. A velocidade dessas entradas é imposta, para comparar tentativas.</p><label>Velocidade horizontal nos checkpoints de rampa <input id="ski-entry-speed" type="number" min="250" max="2000" step="50" value="600"> u/s</label><p>C salva sua posição e embalo; V repete esse checkpoint. R repete a entrada selecionada. J mostra ou oculta o diagnóstico.</p><div class="buttons"><button id="ski-save">Salvar meu checkpoint · C</button><button id="ski-issue">Marcar problema · B</button><button id="ski-download" disabled>Baixar diagnóstico</button></div><p id="ski-saved">Nenhum checkpoint pessoal salvo nesta sessão.</p><details><summary>Curva fechada ou aberta?</summary><p>O que importa é a trajetória da velocidade sobre a face, não olhar para cima. Mais velocidade contra a rampa pode virar perda no impacto. Um giro que reduz a horizontal enquanto aumenta a altura pode ser uma troca útil. Compare o ângulo de entrada, a perda no contato e a saída vertical.</p><p>O Mario fica numa sala subterrânea. O alvo marcado é a plataforma do teleporte original. Ter ápice acima dela não garante alcance: observe também o desvio e a altura na passagem. As previsões abaixo supõem saída imediata, sem strafe nem novos contatos.</p></details>';
  document.querySelector('.content .settings').after(settings);
  const panel=document.createElement('aside');panel.id='ski-study';panel.className='hud ski-study';panel.innerHTML='<span class="eyebrow">DIAGNÓSTICO DA SAÍDA · J</span><strong id="ski-verdict">Prepare o embalo na base</strong><dl><div><dt>Subida sobre a face</dt><dd id="ski-uphill">—</dd></div><div><dt>Curva da trajetória</dt><dd id="ski-turn">—</dd></div><div><dt>Último impacto</dt><dd id="ski-impact">—</dd></div><div><dt>Última saída VH / VZ</dt><dd id="ski-exit">—</dd></div><div><dt>Mario · distância</dt><dd id="ski-distance">—</dd></div><div><dt>Ápice acima do alvo</dt><dd id="ski-margin">—</dd></div><div><dt>Distância mínima prevista</dt><dd id="ski-miss">—</dd></div><div><dt>Altura na aproximação</dt><dd id="ski-height">—</dd></div></dl><p id="ski-reason">Alvo: plataforma do teleporte original. Previsão sem novos comandos ou contatos.</p><small>C salva · V repete · B marca problema</small>';
  document.body.append(panel);
  const beacon=document.createElement('div');beacon.id='ski-mario-beacon';beacon.textContent='◎ ACESSO AO MARIO';document.body.append(beacon);
  const marker=new THREE.Mesh(new THREE.TorusGeometry(80,6,8,40),new THREE.MeshBasicMaterial({color:0xf1c389,depthTest:false}));marker.position.set(MARIO_ACCESS.x,-MARIO_ACCESS.y,MARIO_ACCESS.z);marker.renderOrder=10;scene.add(marker);
  let saved=null,last=null,lastContact=null,entry=null,exit=null,impact=null,turn=0,trace=[],issue=null,hidden=false,current=null,physical=true;
  const $=id=>document.getElementById(id),put=(id,v)=>{if($(id).textContent!==v)$(id).textContent=v;};
  const clone=s=>structuredClone(s);
  function save(){if(!current)return;if(!physical){notice('Use Jogar para salvar um checkpoint de movimento com física.');return;}saved=clone(current);if(![...select.options].some(o=>o.value==='ski-saved'))select.add(new Option('Meu checkpoint · posição e embalo salvos','ski-saved'));select.value='ski-saved';put('ski-saved',`Salvo: VH ${fmt(Math.hypot(saved.vx,saved.vy))}, VZ ${fmt(saved.vz)} u/s. V repete.`);notice('Checkpoint salvo. V repete a mesma posição e velocidade.');}
  function mark(){if(!current)return;issue={version:1,map:'surf_ski_2',config:{...config()},state:clone(current),ticks:clone(trace),impact:clone(impact),note:'User-marked local movement issue; no automatic diagnosis.'};$('ski-download').disabled=false;notice(`Problema marcado em X${fmt(current.x)} Y${fmt(current.y)} Z${fmt(current.z)}. Esc → Baixar diagnóstico.`);}
  $('ski-save').onclick=save;$('ski-issue').onclick=mark;$('ski-download').onclick=()=>{if(!issue)return;const url=URL.createObjectURL(new Blob([JSON.stringify(issue)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='surf-ski2-diagnostico.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return {
    key(code){if(code==='KeyC'){save();return 'handled';}if(code==='KeyV'&&saved){select.value='ski-saved';return 'reset';}if(code==='KeyB'){mark();return 'handled';}if(code==='KeyJ'){hidden=!hidden;return 'handled';}return null;},
    seed(id){if(id==='ski-saved'&&saved)return restoreCheckpoint(saved);const e=entries.get(id);if(!e)return null;const v=Math.max(250,Math.min(2000,Number($('ski-entry-speed').value)||600)),vx=e.axis==='x'?v:0,vy=e.axis==='y'?v:0;return {...e,vx,vy,vz:-(e.normal.x*vx+e.normal.y*vy)/e.normal.z,time:0};},
    reset(s){last=null;lastContact=null;entry=exit=impact=null;turn=0;trace=[];current=clone(s);},
    tick(s,input){current=clone(s);if(last&&s.teleports!==last.teleports){entry=exit=lastContact=null;}
      const dt=last?s.time-last.time:0;if(dt>0){const a=Math.atan2(s.vy,s.vx),b=Math.atan2(last.vy,last.vx);turn=turn*.85+Math.abs(wrap(a-b))/dt*.15;}
      if(ramp(s)){if(!lastContact)entry={vh:Math.hypot(s.vx,s.vy),vz:s.vz,z:s.z};lastContact=clone(s);}
      else if(lastContact){exit={vh:Math.hypot(lastContact.vx,lastContact.vy),vz:lastContact.vz,z:lastContact.z,rise:Math.max(0,lastContact.vz)**2/(2*config().gravity)};lastContact=null;}
      for(const hit of s.impacts??[]){const v=speed({vx:hit.before.x,vy:hit.before.y,vz:hit.before.z}),loss=v?100*hit.loss/(v*v/2):0;if(loss>1)impact={loss,angle:Math.asin(Math.min(1,Math.max(0,-(hit.before.x*hit.normal.x+hit.before.y*hit.normal.y+hit.before.z*hit.normal.z)/(v||1))))*180/Math.PI,wall:Math.abs(hit.normal.z)<.05,time:s.time};}
      trace.push({state:{x:s.x,y:s.y,z:s.z,vx:s.vx,vy:s.vy,vz:s.vz,yaw:s.yaw,pitch:s.pitch,time:s.time,stuck:s.stuck},input:{...input},impacts:clone(s.impacts??[])});if(trace.length>300)trace.shift();last=clone(s);
    },
    draw(s,camera,active,freeFly){current=clone(s);physical=!freeFly;panel.hidden=!active||hidden||freeFly;beacon.hidden=!active||freeFly;marker.visible=active&&!freeFly;
      const p=marker.position.clone().project(camera);beacon.style.left=`${(p.x+1)*innerWidth/2}px`;beacon.style.top=`${(1-p.y)*innerHeight/2}px`;beacon.hidden=beacon.hidden||p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
      const f=launchForecast(s,config().gravity),onRamp=ramp(s),n=s.contact,h=n?Math.hypot(n.x,n.y):0,up=h?(-n.x*n.z/h*s.vx-n.y*n.z/h*s.vy+h*s.vz):null;
      put('ski-uphill',onRamp?`${up>=0?'↑':'↓'} ${fmt(Math.abs(up))} u/s`:'Sem contato com rampa');
      put('ski-turn',`${fmt(turn*180/Math.PI)}°/s${turn>.05?' · raio '+fmt(Math.hypot(s.vx,s.vy)/turn)+' u':''}`);
      put('ski-impact',impact?`${fmt(impact.loss,1)}% · ${fmt(impact.angle)}°${impact.wall?' · parede':''}`:'Sem perda relevante');
      put('ski-exit',exit?`${fmt(exit.vh)} / ${exit.vz>=0?'+':''}${fmt(exit.vz)} u/s`:'Ainda na primeira entrada');
      put('ski-distance',fmt(f.distance)+' u');put('ski-margin',(f.apexMargin>=0?'+':'')+fmt(f.apexMargin)+' u');put('ski-miss',f.miss===null?'Alvo fora da direção atual':fmt(f.miss)+' u');put('ski-height',f.heightAtClosest===null?'—':(f.heightAtClosest>=0?'+':'')+fmt(f.heightAtClosest)+' u');
      let verdict,reason;if(s.stuck){verdict='Travamento detectado';reason='B marca este caso e os últimos comandos. V repete seu checkpoint; R reinicia a entrada.';}
      else if(s.grounded){verdict='Prepare o embalo na base';reason='W para correr e Espaço para pular. Os checkpoints de rampa permitem repetir só a transferência.';}
      else if(impact&&s.time-impact.time<.5&&impact.loss>15){verdict=impact.wall?'Você acertou uma parede':'Entrada com perda forte';reason=`O contato removeu ${fmt(impact.loss)}% da energia de movimento. Procure alinhar a velocidade à face antes de encostar.`;}
      else if(onRamp){verdict=up>0?'Subindo pela face':'Acumulando embalo na descida';reason=up>0?'Horizontal menor pode ser troca por altura. Compare a saída vertical e o último impacto; curva mais fechada sozinha não garante altura.':'Mais velocidade contra a superfície não é garantia de ganho: a componente normal se perde no contato.';}
      else if(f.apexMargin<0){verdict='Falta altura para o acesso';reason=`Se sair assim, faltam ${fmt(-f.apexMargin)} u até a altura do alvo. VZ mínima teórica agora: +${fmt(f.requiredVz)} u/s.`;}
      else if(f.miss===null||f.miss>MARIO_ACCESS.radius){verdict='Altura disponível; falta alinhar o alcance';reason='Seu ápice pode superar o acesso, mas a direção atual passa ao lado. O strafe pode corrigir a curva; esta previsão mantém a velocidade horizontal atual.';}
      else{verdict=f.heightAtClosest< -36?'O voo chega baixo no acesso':'Direção próxima do acesso';reason='Compare altura na passagem e desvio. É previsão sem strafe e sem colisões futuras, não uma chegada garantida.';}
      put('ski-verdict',verdict);put('ski-reason',reason);
    },
    snapshot:()=>({checkpoints:[...entries.keys()],saved:!!saved,entry,exit,impact,turnRate:turn,markedIssue:!!issue,target:{...MARIO_ACCESS}})
  };
}
