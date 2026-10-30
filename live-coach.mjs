// State-based advisory only. Forecasts use the same movement controller as play.
// No recorded trajectory is consulted and inputs are never mutated.
import {stepPlayer,TICK,spawnPlayer} from './goldsrc.mjs?v=20261030-guide';
import {CT_CONFIG,TARGET,wrap} from './ct-physics.mjs?v=20261030-guide';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const speed=s=>Math.hypot(s.vx,s.vy);
const ramp=s=>s.contact&&s.contact.z>.03&&s.contact.z<.7;
export function sideForFace(s,yaw=s.yaw){
  const n=s.contact??s.ladderNormal;if(!n)return 0;
  const into=-Math.sin(yaw)*n.x+Math.cos(yaw)*n.y;
  return into<=0?1:-1;
}
function desired(s,target,plan){
  const bearing=Math.atan2(target.y-s.y,target.x-s.x),heading=speed(s)>20?Math.atan2(s.vy,s.vx):s.yaw;
  if(plan.kind==='hold')return plan.yaw;
  if(plan.kind==='velocity')return heading+plan.offset;
  if(plan.kind==='late')return bearing+(distance(s,target)>900?-.15:plan.offset);
  return bearing+plan.offset;
}
export function suggestedAction(s,target,plan={kind:'target',offset:-.05},config=CT_CONFIG){
  let yaw=s.yaw,input={},stage='air';
  if(s.onLadder){const side=sideForFace(s);return {input:{right:side,forward:s.pitch<-.8?-1:1},yaw,stage:'ladder'};}
  if(s.inWater)return {input:{forward:1,jump:true},yaw,stage:'water'};
  if(s.grounded){
    stage='ground';const ct=s.x>-750&&s.x<-200&&s.y>-3800&&s.y<-3150;
    yaw=ct?Math.PI/2:s.yaw;input.forward=1;
    if(ct&&s.y>-3355&&s.y<-3230&&speed(s)>110)input.jump=true;
  }else if(ramp(s)){
    stage='ramp';yaw=desired(s,target,plan);input.right=sideForFace(s,s.yaw);
  }else{
    const bearing=Math.atan2(target.y-s.y,target.x-s.x),heading=speed(s)>20?Math.atan2(s.vy,s.vx):s.yaw;
    const side=plan.free?plan.side:wrap(bearing-heading)>=0?1:-1;
    // AA100/250/.01 has an optimal zero projection for max scalar speed gain.
    const projection=Math.max(0,30-config.airAcceleration*config.maxSpeed*TICK);
    yaw=heading-side*Math.asin(Math.min(1,projection/Math.max(1,speed(s))))+(plan.airOffset??0);input.right=side;
  }
  return {input,yaw,stage};
}
function hydrate(state,map){return {...spawnPlayer(map),...structuredClone(state),captureImpacts:false,impacts:[]};}
export function surfaceAdvice(state,config=CT_CONFIG){
  const vh=speed(state),up=Math.max(0,state.vz),isRamp=Boolean(ramp(state));
  return {stage:state.onLadder?'ladder':state.inWater?'water':state.grounded?'ground':isRamp?'ramp':'air',
    rampKey:isRamp?sideForFace(state):0,falling:state.vz<0,
    secondsToApex:up/config.gravity,
    ballisticApex:state.z+up*up/(2*config.gravity),
    energyHeight:state.z+(vh*vh+state.vz*state.vz)/(2*config.gravity),
    code:isRamp?'press-into-face':state.grounded?'accelerate-before-entry':state.vz<0?'air-strafe-gravity-continues':'air-strafe-climbing'};
}
function cross(a,b,target){
  if((a.y-target.y)*(b.y-target.y)>0||Math.abs(b.y-a.y)<1e-9)return null;
  const f=(target.y-a.y)/(b.y-a.y);if(f<0||f>1)return null;
  const x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f;
  return {x,y:target.y,z,error:Math.hypot(x-target.x,z-target.z),airborne:!a.grounded&&!b.grounded&&!b.contact&&!b.inWater&&b.airTime>.05,time:b.time};
}
function rollout(initial,map,target,policy,{steps=280,hasDeparted=false,config=CT_CONFIG}={}){
  const s=hydrate(initial,map),points=[],startTime=s.time,baseTeleport=s.teleports,basePushes=s.pushes;
  let gate=null,closest=distance(s,target),hadSurface=Boolean(ramp(s)),leftSurface=hasDeparted,gap=0,recontact=false,invalidReason=null;
  for(let i=0;i<steps;i++){
    const prior={...s};let input;
    if(policy.current){s.yaw+=clamp(policy.turnRate??0,-2,2)*TICK;input=policy.input;}
    else{const action=suggestedAction(s,target,policy,config);s.yaw+=clamp(wrap(action.yaw-s.yaw),-1*TICK,1*TICK);input=action.input;}
    stepPlayer(s,input,map,TICK,config);
    if(ramp(s)){hadSurface=true;gap=0;}else if(hadSurface&&!leftSurface){gap++;if(gap>=6)leftSurface=true;}
    if(leftSurface&&(s.contact||s.grounded||s.inWater))recontact=true;
    if(i%4===0)points.push({x:s.x,y:s.y,z:s.z});
    closest=Math.min(closest,distance(s,target));
    if(s.stuck||s.teleports!==baseTeleport||s.pushes!==basePushes){
      invalidReason=s.stuck?'stuck':s.teleports!==baseTeleport?'teleport':'push';break;
    }
    const candidate=cross(prior,s,target);
    if(candidate){gate={...candidate,clean:!recontact,hit:candidate.error<=target.radius&&candidate.airborne&&!recontact};break;}
    if(s.z<-1800)break;
  }
  const usable=gate?.airborne&&gate.clean;
  const targetError=gate?.error??null;
  // A real unobstructed crossing beats a no-crossing near miss in this search.
  const score=invalidReason?10000+closest:gate?(targetError+(usable?0:800)):(600+closest+Math.max(0,target.z-(s.z+Math.max(0,s.vz)**2/(2*config.gravity)))*.5);
  return {points,gate,score,closest,elapsed:s.time-startTime,final:{x:s.x,y:s.y,z:s.z,vx:s.vx,vy:s.vy,vz:s.vz},valid:!invalidReason,invalidReason};
}
export function liveGuide(state,map,{target=TARGET,input={},turnRate=0,goalEnabled=true,steps=280,hasDeparted=false,config=CT_CONFIG}={}){
  const start=performance.now(),targetBehind=(target.y-state.y)*(state.vy||1)<-80;
  const plans=[{kind:'hold',yaw:state.yaw},{kind:'target',offset:-.15},{kind:'target',offset:-.05},{kind:'target',offset:.05},{kind:'velocity',offset:.12},{kind:'late',offset:.05},{kind:'late',offset:.15}];
  const current=rollout(state,map,target,{current:true,input,turnRate},{steps,hasDeparted,config});
  if(!goalEnabled||targetBehind){
    const plan={kind:'velocity',offset:0,free:true,side:input.right||Math.sign(turnRate)||1};
    const suggested=rollout(state,map,target,plan,{steps,hasDeparted,config});
    return {current,suggested,action:suggestedAction(state,target,plan,config),advice:surfaceAdvice(state,config),targetBehind,status:targetBehind?'target-behind':'free',candidateCount:1,ms:performance.now()-start};
  }
  const candidates=plans.map(plan=>({plan,...rollout(state,map,target,plan,{steps,hasDeparted,config})})).sort((a,b)=>a.score-b.score);
  const best=candidates[0],action=suggestedAction(state,target,best.plan,config);
  return {current,suggested:best,action,advice:surfaceAdvice(state,config),targetBehind:false,status:!best.valid?'invalid':best.gate?.hit?'reachable':best.gate?'predicted-miss':'no-crossing',candidateCount:candidates.length,ms:performance.now()-start};
}
