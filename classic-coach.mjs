import {spawnPlayer,stepPlayer,TICK} from './goldsrc.mjs?v=20261030-guide';
import {originalHazard} from './classic-maps.mjs?v=20261030-guide';
export const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const speed=s=>Math.hypot(s.vx,s.vy);
export const ramp=s=>s.contact&&s.contact.z>.05&&s.contact.z<.7;
export const supportKey=(s,yaw=s.yaw)=>(-Math.sin(yaw)*s.contact.x+Math.cos(yaw)*s.contact.y)<=0?1:-1;
export function routeStart(map,route){return {...spawnPlayer(map,route.team??'ct'),...route.start};}
function snapshot(s,input={}){return {...s,triggerIds:[...(s.triggerIds??[])],input:{...input}};}
export function replayRoute(map,route,config){
  if(!route?.destination||!['x','y','z'].every(k=>Number.isFinite(route.destination[k]))||!Number.isFinite(route.radius)||route.radius<=0||!Array.isArray(route.commands)||!route.commands.length)return {verified:false,reason:'Dados de chegada ou comandos inválidos.'};
  if(Object.keys(route.config).some(k=>route.config[k]!==config[k]))return {verified:false,reason:'Este gabarito foi validado no perfil Surf. Selecione Surf para assistir.'};
  const state=routeStart(map,route),frames=[snapshot(state)],checkpoints=new Map(route.checkpoints.map(c=>[c.tick,c]));
  const spawn=spawnPlayer(map,route.team??'ct');
  if(distance(state,spawn)>.001||Math.hypot(state.vx,state.vy,state.vz)>.001)return {verified:false,reason:'O mapa completo deve começar na base original, sem impulso artificial.'};
  let contacts=0,maxAir=0,reason=null,portal=0;
  for(let i=0;i<route.commands.length;i++){
    const [yaw,pitch,forward,right,jump,duck]=route.commands[i],input={forward,right,jump:Boolean(jump),duck:Boolean(duck)};
    if(!route.commands[i].every(Number.isFinite)||![forward,right].every(n=>[-1,0,1].includes(n))||![jump,duck].every(n=>[0,1].includes(n))){reason='O gabarito precisa usar teclas reais e ângulos finitos.';break;}
    state.yaw=yaw;state.pitch=pitch;stepPlayer(state,input,map,TICK,config);
    if(ramp(state))contacts++;
    maxAir=Math.max(maxAir,state.airTime);
    if(state.stuck||map.trace(state,state,state.crouched?3:1).startSolid){reason='O percurso entrou numa colisão sólida.';break;}
    if(originalHazard(map,state)){reason='O percurso tocou uma zona original de dano.';break;}
    if(state.event===`Teleporte: ${route.expectedTeleports?.[portal]}`)portal++;
    const checkpoint=checkpoints.get(i+1);
    if(checkpoint&&distance(state,checkpoint)>1e-5){reason='A reprodução não confirmou os pontos físicos gravados.';break;}
    frames.push({...snapshot(state,input),commandYaw:yaw,commandPitch:pitch});
  }
  if(!reason&&distance(state,route.destination)>route.radius)reason='A chegada não foi confirmada neste perfil.';
  if(!reason&&portal<(route.expectedTeleports?.length??0))reason='O percurso não completou as etapas originais na ordem esperada.';
  if(!reason&&contacts<30)reason='Contato de surf insuficiente.';
  return {verified:!reason,reason,frames,duration:state.time,contacts,maxAir,definition:route};
}
export function frameAt(run,time){
  const f=clamp(time/TICK,0,run.frames.length-1),index=Math.floor(f),a=run.frames[index],b=run.frames[Math.min(index+1,run.frames.length-1)],t=f-index;
  if(a.teleports!==b.teleports)return {...a,input:{...b.input},mouseRate:0,time};
  const state={...a,input:{...(b.input??a.input)}};
  for(const k of ['x','y','z','vx','vy','vz','eye','pitch'])state[k]=a[k]+(b[k]-a[k])*t;
  state.yaw=a.yaw+wrap(b.yaw-a.yaw)*t;state.time=time;
  state.mouseRate=index&&b.teleports===run.frames[index-1].teleports?wrap((b.commandYaw??b.yaw)-(run.frames[index-1].commandYaw??run.frames[index-1].yaw))/(2*TICK):0;
  return state;
}
export function routeAnchor(state,run){
  let index=0,nearest=Infinity;
  for(let i=0;i<run.frames.length;i+=4){const d=distance(state,run.frames[i]);if(d<nearest){nearest=d;index=i;}}
  // Progress is spatial: restarting, pausing or leaving the line never advances a clock-based coach.
  const lookAhead=clamp(Math.round((110+speed(state)*.3)/Math.max(100,speed(run.frames[index]))/TICK),15,85);
  const targetIndex=Math.min(run.frames.length-1,index+lookAhead);
  return {index,nearest,targetIndex,target:run.frames[targetIndex],progress:index/Math.max(1,run.frames.length-1)};
}
export function suggestedAction(state,run,offset=0){
  const anchor=routeAnchor(state,run),target=anchor.target,bearing=Math.atan2(target.y-state.y,target.x-state.x),heading=speed(state)>30?Math.atan2(state.vy,state.vx):state.yaw;
  let input={},yaw=state.yaw,stage='air';
  if(state.waterJumpTime>0){stage='waterjump';input={};}
  else if(state.onLadder){stage='ladder';const n=state.ladderNormal;yaw=Math.atan2(-n.y,-n.x);input={forward:1};}
  else if(state.inWater){stage='water';yaw=bearing;input={forward:1,jump:true};}
  else if(state.grounded){stage='ground';yaw=bearing+offset;const next=run.frames.slice(anchor.index,anchor.index+12).find(f=>f.input?.jump),aligned=Math.abs(wrap(yaw-state.yaw))<.65;input={forward:aligned?1:0,jump:Boolean(aligned&&next&&distance(state,next)<45)};}
  else if(ramp(state)){stage='ramp';yaw=bearing+offset;input.right=supportKey(state,state.yaw);}
  else{
    const error=wrap(bearing-heading);input.right=Math.abs(error)<.035?0:Math.sign(error);
    yaw=heading+offset;
    if(Math.abs(wrap(yaw-state.yaw))>.35)input.right=0;
  }
  return {input,yaw,stage,anchor};
}
function hydrate(state,map){return {...spawnPlayer(map),...structuredClone(state),captureImpacts:false,impacts:[]};}
function rollout(state,map,run,config,policy,steps){
  const s=hydrate(state,map),points=[{x:s.x,y:s.y,z:s.z}];let danger=false,invalid=false,teleported=false;
  const start=routeAnchor(state,run);
  for(let i=0;i<steps;i++){
    let input;
    if(policy.held){s.yaw+=(Number.isFinite(policy.turnRate)?policy.turnRate:0)*TICK;input=policy.input;}
    else{const action=suggestedAction(s,run,policy.offset);s.yaw+=clamp(wrap(action.yaw-s.yaw),-1.8*TICK,1.8*TICK);input=action.input;}
    const priorTeleport=s.teleports;stepPlayer(s,input,map,TICK,config);
    if(s.teleports!==priorTeleport){teleported=true;break;}
    if(i%5===0)points.push({x:s.x,y:s.y,z:s.z});
    danger=Boolean(originalHazard(map,s));
    if(danger||s.stuck||!Number.isFinite(s.x+s.y+s.z)){invalid=true;break;}
  }
  const end=routeAnchor(s,run),loss=Math.max(0,speed(state)-speed(s));
  return {points,danger,invalid,teleported,progress:end.progress,error:end.nearest,score:end.nearest+(invalid?10000:0)+Math.max(0,start.index-end.index)*3-loss*.05,final:{x:s.x,y:s.y,z:s.z}};
}
export function liveGuide(state,map,run,config,{input={},turnRate=0,steps=120}={}){
  const start=performance.now(),current=rollout(state,map,run,config,{held:true,input,turnRate},steps);
  const candidates=[0,-.12,.12,-.3,.3].map(offset=>({offset,...rollout(state,map,run,config,{offset},steps)})).sort((a,b)=>a.score-b.score);
  const best=candidates[0],action=suggestedAction(state,run,best.offset);
  return {current,suggested:best,action,ms:performance.now()-start,candidates:candidates.length};
}
