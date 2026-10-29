// Reproducible CT command policies. Every accepted route is replayed through stepPlayer.
import {stepPlayer,TICK} from './goldsrc.mjs?v=20261029-ct';
import {CT_CONFIG,TARGET,ctStart,isInitialRamp,sampleState,crossing,wrap} from './ct-physics.mjs?v=20261029-final';
const labels={ramp:'Primeiro contato na rampa CT',connector:'Plataforma após a rampa CT',airtarget:'Alvo no ar · raio 80 u',basin:'Piscina na base da torre',central:'Impulsionador central',jailed:'Prisão pelo teleporte do chão'};
const descriptions={ramp:'W, salto na borda, soltura de W e primeiro contato.',connector:'W, salto, D na face e um giro de0,25rad após Y=-1400.',airtarget:'W, salto, D na face e um giro de0,15rad após Y=-1500.',basin:'Saída pela crista, curva para contornar a plataforma e entrada na água.',central:'Saída para a plataforma, novo salto e curva até o impulsionador original.',jailed:'W até cair no teleporte original do chão. A prisão tem porta estática nesta adaptação.'};
const point=s=>({x:s.x,y:s.y,z:s.z});
function complexity(frames){let switches=0,yawRadians=0,last='';for(let i=0;i<frames.length;i++){const f=frames[i],signature=`${f.input.forward||0},${f.input.right||0},${f.input.jump?1:0},${f.input.duck?1:0}`;if(last&&signature!==last)switches++;last=signature;if(i)yawRadians+=Math.abs(wrap(f.yaw-frames[i-1].yaw));}return {switches,yawRadians};}
export function simulateRoute(map,mode,config=CT_CONFIG,policy={}){
  const s=ctStart(map,config),frames=[sampleState(s,{},'Corrida na base CT')],events=[],phases=[],ctx={jumped:false,entry:false,exit:false,gap:0,landed:false};
  let verified=false,reason='Nenhuma chegada verificada dentro do limite de20s.',phase='Corrida na base CT';
  const turnY=policy.turnY??(mode==='connector'||mode==='central'?-1400:mode==='basin'?-1200:-1500),offset=policy.offset??(mode==='connector'||mode==='central'?.25:mode==='basin'?.3:mode==='airtarget'?.15:0);
  function setPhase(next){phase=next;}
  for(let tick=0;tick<2000;tick++){
    let input={};const previous={...s};
    if(mode==='jailed'){s.yaw=Math.PI/2;input.forward=1;}
    else{
      s.yaw=Math.PI/2+(ctx.entry&&s.y>turnY?offset:0);
      if(!ctx.jumped){input.forward=1;if(s.y>=(policy.jumpY??-3340)&&s.grounded){input.jump=true;ctx.jumped=true;setPhase('Pulo da borda · solte W/S');}}
      else if(ctx.entry&&!ctx.exit){input.right=1;setPhase(s.y>turnY?'D + giro para a crista':'D para pressionar a face');}
      if(mode==='central'&&ctx.exit&&s.grounded){input.jump=true;ctx.landed=true;setPhase('Salte da plataforma mantendo o embalo');}
      let target=null;
      if(mode==='basin'&&ctx.exit)target=s.y>-550?{x:-750,y:820}:{x:-1100,y:-500};
      if(mode==='central'&&ctx.landed&&!s.grounded)target={x:-650,y:820};
      if(target){const heading=Math.atan2(s.vy,s.vx),bearing=Math.atan2(target.y-s.y,target.x-s.x),error=wrap(bearing-heading);s.yaw=heading;if(Math.abs(error)>.02)input.right=error>0?1:-1;setPhase(mode==='basin'?'Curve para a piscina da torre':'Curve após o salto da plataforma');}
    }
    const commandYaw=s.yaw,commandPitch=s.pitch;stepPlayer(s,input,map,TICK,config);
    if(isInitialRamp(s)){ctx.entry=true;ctx.gap=0;}else if(ctx.entry&&++ctx.gap>=6)ctx.exit=true;
    const frame=sampleState(s,input,phase);frame.commandYaw=commandYaw;frame.commandPitch=commandPitch;frame.event=s.event;frame.onLadder=s.onLadder;frame.inWater=s.inWater;frame.teleports=s.teleports;frame.pushes=s.pushes;frames.push(frame);
    if(s.event)events.push({time:s.time,label:s.event,position:point(s)});
    if(mode==='ramp'&&ctx.entry)verified=true;
    if(mode==='connector'&&ctx.exit&&s.grounded&&s.y>-610&&s.y<-480&&s.z>-860)verified=true;
    if(mode==='airtarget'){const gate=crossing(previous,s,TARGET);if(gate?.airborne&&gate.error<=TARGET.radius)verified=true;}
    if(mode==='basin'&&s.inWater)verified=true;
    if(mode==='central'&&s.pushes>0)verified=true;
    if(mode==='jailed'&&s.event==='Teleporte: jailed')verified=true;
    if(verified){reason=null;break;}
    if(s.teleports||s.stuck){reason=s.stuck?'Colisão sem saída nesta política.':`A linha caiu em ${s.event}, antes do destino.`;break;}
  }
  let start=0;for(let i=1;i<frames.length;i++){if(frames[i].phase!==frames[start].phase){phases.push({start:frames[start].time,end:frames[i].time,label:frames[start].phase});start=i;}}
  phases.push({start:frames[start].time,end:s.time,label:frames[start].phase});
  return {id:`ct-${mode}`,label:labels[mode],kind:'route',destination:{id:mode,label:labels[mode],position:mode==='airtarget'?point(TARGET):point(s),radius:mode==='airtarget'?TARGET.radius:45},frames,duration:Number(s.time.toFixed(2)),steps:phases.filter(p=>p.end-p.start>.011),verified,reason,complexity:complexity(frames),teleports:s.teleports,pushes:s.pushes,description:mode==='connector'||mode==='airtarget'?`Corra, pule, solte W/S e pressione D na face. Giro final de ${Math.round(offset*180/Math.PI)}°.`:descriptions[mode],policy:{...policy},via:s.teleports?'Teleporte original do mapa':s.pushes?'Surf + impulsionador original':'Movimento e colisões do mapa',config:{...config}};
}
const destinationLabels={top1:'Topo 1 · top1',top2:'Topo 2 · top2',jail:'Prisão superior · jail',tspawn:'Base T · tspawn',ctspawn:'Retorno CT · ctspawn',groom:'Sala G · groom',sroom:'Sala secreta · sroom',outs:'Área superior · outs',boost:'Área do boost · boost'};
export function replayVerified(map,route){
  const s=ctStart(map,route.config);for(let i=1;i<route.frames.length;i++){
    const frame=route.frames[i];s.yaw=frame.commandYaw;s.pitch=frame.commandPitch;stepPlayer(s,frame.input,map,TICK,route.config);
    for(const key of ['x','y','z','vx','vy','vz','yaw','pitch'])if(Math.abs(s[key]-frame[key])>1e-7)return false;
    if(s.stuck)return false;
  }
  return true;
}
const rank=(a,b)=>a.complexity.switches-b.complexity.switches||a.complexity.yawRadians-b.complexity.yawRadians||a.duration-b.duration;
export function prepareRouteCatalog(map,config=CT_CONFIG){
  const routes=[],attempts=[];let sampleCount=0;
  for(const mode of ['ramp','connector','airtarget','basin','central','jailed']){
    const policies=[{}];
    if(mode!=='jailed'&&config.groundAcceleration>0){
      if(mode==='ramp')for(const jumpY of [-3360,-3320])policies.push({jumpY});
      else{
        const turn=mode==='connector'||mode==='central'?-1400:mode==='basin'?-1200:-1500;
        for(const jumpY of [-3340,-3320])for(const turnY of [turn-100,turn,turn+100])for(const offset of [0,.1,.15,.2,.25,.3,.35])policies.push({jumpY,turnY,offset});
      }
    }
    let best=null,last=null;for(const policy of policies){const run=simulateRoute(map,mode,config,policy);sampleCount++;last=run;if(run.verified&&(!best||rank(run,best)<0))best=run;}
    const chosen=best??last;attempts.push({id:chosen.id,verified:Boolean(best),reason:chosen.reason});if(best){best.verified=replayVerified(map,best);if(best.verified)routes.push(best);else best=null;}
    if(!best)routes.push({...chosen,frames:[],steps:[],verified:false});
  }
  for(const mode of ['roof','top2']){const route=ladderRoute(map,mode,config);sampleCount++;if(route.verified&&!replayVerified(map,route)){route.verified=false;route.reason='A reprodução independente não confirmou a chegada.';}attempts.push({id:route.id,verified:route.verified,reason:route.reason});routes.push(route.verified?route:{...route,frames:[],steps:[]});}
  const destinations=routes.map(route=>({...route.destination,routeId:route.verified?route.id:null,reason:route.reason}));
  for(const [id,target] of map.targets){if(target.classname!=='info_target'||destinations.some(d=>d.id===id))continue;const p=map.parseVector(target.origin),position={x:p.x,y:-p.y,z:p.z+37};destinations.push({id,label:destinationLabels[id]??id,position,routeId:null,reason:'Sem rota verificada na busca atual. A réplica ainda mantém portas, botões e objetos quebráveis estáticos.'});}
  return {routes:routes.filter(r=>r.verified),attempts,destinations,sampleCount,config:{...config}};
}

export function ladderRoute(map,mode='roof',config=CT_CONFIG){
 const prefix=simulateRoute(map,'basin',config);if(!prefix.verified)return {...prefix,id:'ct-'+mode,label:mode==='roof'?'Cobertura da torre pela escada':'Região top2 · piso da torre',destination:{id:mode,label:mode==='roof'?'Cobertura da torre pela escada':'Região top2 · piso da torre',position:prefix.destination.position},verified:false,reason:'A entrada na piscina não foi validada nesta cfg.'};
 const s=ctStart(map,config),frames=prefix.frames.slice();for(const f of frames.slice(1)){s.yaw=f.commandYaw??f.yaw;s.pitch=f.commandPitch??f.pitch;stepPlayer(s,f.input,map,TICK,config);}
 let roof=false,jumped=false,drop=false,verified=false,phase='Nade até o canal da escada';
 for(let i=0;i<3500;i++){
  let input={forward:1,jump:true};const target=s.y<790?{x:-850,y:820}:{x:-783,y:820};s.yaw=Math.atan2(target.y-s.y,target.x-s.x);s.pitch=0;
  if(s.x>-805&&s.y>790)input.jump=false;
  if(s.onLadder){s.yaw=Math.atan2(-s.ladderNormal.y,-s.ladderNormal.x);input={forward:1};phase='W contra a face da escada · solte Espaço';}
  if(s.z>87&&!roof){input={forward:1,duck:true};s.yaw=0;phase='Ctrl + W para sair sobre a cobertura';}
  if(s.grounded&&s.z>60){roof=true;if(mode==='roof')verified=true;}
  if(roof&&mode==='top2'){
   phase='Caminhe sobre a torre até top2';s.yaw=Math.atan2(815.621-s.y,21.6859-s.x);input={forward:1};
   if(!jumped&&s.x>-248&&s.grounded){input.jump=true;jumped=true;phase='Salte o canal da escada e continue';}
   if(jumped&&!s.grounded){s.yaw=Math.atan2(s.vy,s.vx);input={right:Math.floor(i/6)%2?1:-1};phase='A/D suave no salto da cobertura';}
   if(s.grounded&&Math.hypot(s.x-21.6859,s.y-815.621)<28&&Math.abs(s.z-144)<80)verified=true;
  }
  if(roof&&mode==='groom'){
   if(!drop){s.yaw=Math.atan2(815-s.y,-140-s.x);input={forward:1};phase='Caminhe até o canal aberto da cobertura';if(!s.grounded&&s.x>-225)drop=true;}
   else if(s.grounded&&s.z<0){s.yaw=Math.atan2(659.341-s.y,-677.883-s.x);input={forward:1};phase='Caminhe por dentro da sala de armas';}
   else{let h=Math.atan2(s.vy,s.vx),dir=Math.atan2(820-s.y,-420-s.x),e=wrap(dir-h);s.yaw=h+Math.sign(e)*.35;input={right:Math.sign(e)};phase='Curve para baixo da cobertura';}
   if(s.grounded&&Math.hypot(s.x+677.883,s.y-659.341)<75&&Math.abs(s.z+61.5342)<100)verified=true;
  }
  const commandYaw=s.yaw,commandPitch=s.pitch;stepPlayer(s,input,map,TICK,config);const f=sampleState(s,input,phase);f.commandYaw=commandYaw;f.commandPitch=commandPitch;f.onLadder=s.onLadder;f.inWater=s.inWater;f.event=s.event;f.teleports=s.teleports;f.pushes=s.pushes;frames.push(f);
  if(verified||s.teleports||s.stuck)break;
 }
 const labels={roof:'Cobertura da torre pela escada',top2:'Região top2 · piso da torre',groom:'Sala de armas (groom) pela borda da torre'};let steps=[],start=0,switches=0,yawRadians=0;for(let i=1;i<frames.length;i++){if(frames[i].phase!==frames[start].phase){steps.push({start:frames[start].time,end:frames[i].time,label:frames[start].phase});start=i;}if(`${frames[i].input.forward||0},${frames[i].input.right||0},${frames[i].input.jump?1:0},${frames[i].input.duck?1:0}`!==`${frames[i-1].input.forward||0},${frames[i-1].input.right||0},${frames[i-1].input.jump?1:0},${frames[i-1].input.duck?1:0}`)switches++;yawRadians+=Math.abs(wrap(frames[i].yaw-frames[i-1].yaw));}steps.push({start:frames[start].time,end:s.time,label:frames[start].phase});
 return {id:'ct-'+mode,label:labels[mode],destination:{id:mode,label:labels[mode],position:point(s)},kind:'route',description:mode==='top2'?'Chegue ao piso da região top2: raio horizontal28u e tolerância vertical80u em torno do destino original. W na escada e salto sobre o canal.':'Da piscina, nade até a escada, solte Espaço e suba com W; Ctrl + W leva ao piso superior.',via:'Surf + nado + escada original',verified,reason:verified?null:'Sem chegada verificada.',frames,steps,duration:Number(s.time.toFixed(2)),teleports:s.teleports,pushes:s.pushes,complexity:{switches,yawRadians},config:{...config}};
}
