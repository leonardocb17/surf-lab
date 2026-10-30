import {spawnPlayer,stepPlayer,TICK} from './goldsrc.mjs?v=20261030-guide';
import {SURF} from './movement-rules.mjs?v=20261030-guide';
export const CT_CONFIG=Object.freeze({...SURF,groundAcceleration:5,stopSpeed:75,maxVelocity:2000});
export const TARGET=Object.freeze({x:-550,y:-700,z:-860,radius:80});
export const RAMP=Object.freeze({ridgeX:-495,frontY:-1000,minY:-3300,maxY:-950,minX:-760,maxX:-230});
const speed=s=>Math.hypot(s.vx,s.vy),total=s=>Math.hypot(s.vx,s.vy,s.vz);
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const point=s=>({x:s.x,y:s.y,z:s.z});
export function sampleState(s,input={},phase='base'){
  return {x:s.x,y:s.y,z:s.z,vx:s.vx,vy:s.vy,vz:s.vz,yaw:s.yaw,pitch:s.pitch,time:s.time,grounded:s.grounded,crouched:s.crouched,eye:s.eye,stamina:s.stamina,jumpHeld:s.jumpHeld,airTime:s.airTime,contact:s.contact?{...s.contact}:null,phase,input:{...input},speed:speed(s),total:total(s)};
}
export function ctStart(map,config=CT_CONFIG){
  const s=spawnPlayer(map,'ct');for(let i=0;i<300;i++){stepPlayer(s,{},map,TICK,config);if(i>=49&&s.grounded)break;}
  s.time=0;s.yaw=Math.PI/2;s.pitch=-.14;s.captureImpacts=true;return s;
}
export function isInitialRamp(s){return s.contact&&s.contact.z>.3&&s.contact.z<.7&&s.y>RAMP.minY&&s.y<RAMP.maxY&&s.x>RAMP.minX&&s.x<RAMP.maxX;}
export function pilot(s,context,options,tick){
  const input={};
  if(!context.jumped){s.yaw=Math.PI/2;input.forward=1;if(s.y>=(options.jumpY??-3340)&&s.grounded){input.jump=true;context.jumped=true;}}
  else if(!context.entry){s.yaw=Math.PI/2;if(options.boost){s.yaw=Math.atan2(s.vy,s.vx);input.right=Math.floor(tick/6)%2?1:-1;}}
  else{s.yaw=Math.PI/2+(s.y>(options.turnY??-1500)?(options.exitYaw??0):0);input.right=1;}
  s.pitch=context.entry?-.12:-.16;return input;
}
export function crossing(previous,current,target=TARGET){
  if(previous.y>=target.y||current.y<target.y)return null;
  const f=(target.y-previous.y)/(current.y-previous.y),at={};
  for(const k of ['x','y','z','vx','vy','vz','time'])at[k]=previous[k]+(current[k]-previous[k])*f;
  at.error=Math.hypot(at.x-target.x,at.z-target.z);at.airborne=!previous.grounded&&!current.grounded&&!current.contact&&!current.inWater&&current.airTime>.05;
  return at;
}
export function impactMetrics(impact,config=CT_CONFIG){
  if(!impact)return null;const {before:v,after:w,normal:n}=impact,v2=v.x*v.x+v.y*v.y+v.z*v.z,normalComponent=v.x*n.x+v.y*n.y+v.z*n.z;
  return {before:{...v},after:{...w},normal:{...n},beforeHorizontal:Math.hypot(v.x,v.y),afterHorizontal:Math.hypot(w.x,w.y),beforeTotal:Math.sqrt(v2),afterTotal:Math.hypot(w.x,w.y,w.z),normalComponent,lossPercent:v2?100*impact.loss/(v2/2):0,lossHeight:impact.loss/config.gravity};
}
export function runTrial(map,options={},seed=null){
  const config=options.config??CT_CONFIG,s=ctStart(map,config),context={jumped:false,entry:null},frames=[];let entry=null,entryImpact=null,exit=null,lastContact=null,gap=0,touched=0,gate=null,landedAfterExit=false,contactAfterExit=false;
  if(seed){
    Object.assign(s,seed,{time:0,grounded:false,captureImpacts:true,impacts:[],teleports:0,pushes:0,airTime:0});
    const ratio=(options.imposedSpeed??speed(s))/speed(s);s.vx*=ratio;s.vy*=ratio;s.vz*=ratio;
    context.jumped=true;context.entry=sampleState(s);entry=sampleState(s);
  }
  frames.push(sampleState(s,{},seed?'rampa':'base'));
  for(let tick=0;tick<1100;tick++){
    const input=pilot(s,context,options,tick),previous={...s};stepPlayer(s,input,map,TICK,config);
    const contact=isInitialRamp(s);
    if(contact){touched++;gap=0;lastContact=sampleState(s,input,'rampa');
      if(!entry){entry=lastContact;context.entry=entry;entryImpact=impactMetrics(s.impacts.find(i=>i.normal.z>.3&&i.normal.z<.7),config);}
    }else if(entry&&!exit){gap++;if(gap>=6&&lastContact){const front=lastContact.y>-1020,ridge=Math.abs(lastContact.x-RAMP.ridgeX)<35;exit={...lastContact,edge:front&&ridge?'corner':front?'front':ridge?'ridge':'side'};}}
    if(exit&&(s.grounded||s.inWater))landedAfterExit=true;
    if(exit&&(s.contact||s.grounded||s.inWater||s.onLadder))contactAfterExit=true;
    const phase=!context.jumped?'base':!entry?'entrada':exit?'voo':'rampa';frames.push(sampleState(s,input,phase));
    if(!gate&&exit){gate=crossing(previous,s,options.target??TARGET);if(gate){gate.hit=gate.error<=(options.target??TARGET).radius&&gate.airborne&&!contactAfterExit&&!landedAfterExit;gate.landed=landedAfterExit;gate.contacted=contactAfterExit;}}
    if(gate||s.teleports||s.pushes||s.stuck||s.z<-1800)break;
  }
  const apex=exit?exit.z+Math.max(0,exit.vz)**2/(2*config.gravity):null;
  return {id:options.id??'',label:options.label??'',options:{...options},kind:seed?'controlled':'natural',frames,entry,entryImpact,exit,gate,apex,touched,duration:s.time,valid:!s.teleports&&!s.pushes&&!s.stuck,final:sampleState(s),hit:Boolean(gate?.hit)};
}
export function frameAt(run,time){const i=Math.max(0,Math.min(run.frames.length-1,Math.floor((time+1e-8)/TICK)));return run.frames[i];}
export function candidateSummary(run){return {id:run.id,label:run.label,options:run.options,hit:run.hit,error:run.gate?.error??Infinity,airborne:Boolean(run.gate?.airborne),exitSpeed:run.exit?.speed??0,exitVz:run.exit?.vz??0,apex:run.apex??-Infinity,time:run.gate?.time??Infinity};}
export async function prepareStudy(map,onProgress=()=>{},target=TARGET,config=CT_CONFIG){
  const cases=[];let completed=0;const advance=async()=>{onProgress(++completed);if(completed%5===0)await new Promise(r=>setTimeout(r,0));};
  for(const boost of [false,true])for(const edge of ['front','ridge']){
    cases.push(runTrial(map,{config,id:`${boost?'strafe':'coast'}-${edge}`,label:`${boost?'Com strafe':'Sem strafe'} · ${edge==='ridge'?'crista':'frente'}`,boost,exitYaw:edge==='ridge'?.15:0,target}));await advance();
  }
  const base=cases[0],controlled=[];
  if(base.entry)for(const imposedSpeed of [250,450,650])for(const edge of ['front','ridge']){controlled.push(runTrial(map,{config,id:`speed-${imposedSpeed}-${edge}`,label:`${imposedSpeed} u/s · ${edge==='ridge'?'giro p/ crista':'mira reta'}`,imposedSpeed,exitYaw:edge==='ridge'?.15:0,target},base.entry));await advance();}
  const candidates=[];
  for(const boost of [false,true])for(const turnY of [-1700,-1500,-1300])for(const exitYaw of [0,.05,.1,.15,.2,.25,.3,.35]){
    const run=runTrial(map,{config,id:`search-${candidates.length}`,label:'Linha amostrada',boost,turnY,exitYaw,target});candidates.push(candidateSummary(run));await advance();
  }
  const hits=candidates.filter(r=>r.hit).sort((a,b)=>a.time-b.time),ranked=[...candidates].sort((a,b)=>a.error-b.error),bestSpec=hits[0]??ranked[0];
  const best=runTrial(map,{...bestSpec.options,id:'best',label:'Melhor tempo entre as amostras'});
  const speedScan=[];
  if(base.entry)for(let imposedSpeed=200;imposedSpeed<=850;imposedSpeed+=25){const r=runTrial(map,{config,imposedSpeed,exitYaw:.15,target},base.entry);speedScan.push({speed:imposedSpeed,...candidateSummary(r)});await advance();}
  const hitSpeeds=speedScan.filter(r=>r.hit).map(r=>r.speed);
  return {cases,controlled,best,candidates,speedScan,limits:{count:candidates.length,hitCount:hits.length,fastest:Math.max(...candidates.map(r=>r.exitSpeed)),slowest:Math.min(...candidates.filter(r=>r.exitSpeed>0).map(r=>r.exitSpeed)),highest:Math.max(...candidates.map(r=>r.apex)),maxClimb:Math.max(...candidates.map(r=>Math.max(0,r.exitVz)**2/(2*config.gravity))),minError:ranked[0].error,minSpeed:hitSpeeds.length?Math.min(...hitSpeeds):null,maxSpeed:hitSpeeds.length?Math.max(...hitSpeeds):null},config,target};
}
export function coach(state,run){
  let index=0,best=Infinity;for(let i=0;i<run.frames.length;i+=3){const p=run.frames[i],d=(p.x-state.x)**2+(p.y-state.y)**2+(p.z-state.z)**2;if(d<best){best=d;index=i;}}
  const reference=run.frames[Math.min(index+4,run.frames.length-1)],desiredYaw=reference.yaw,error=wrap(desiredYaw-state.yaw),input=reference.input;
  return {reference,index,distance:Math.sqrt(best),yawError:error,mouse:Math.abs(error)<.02?'mantenha a direção':error>0?'gire → direita':'gire ← esquerda',key:input.right>0?'D':input.right<0?'A':input.forward?'W':'solte W/S',jump:state.grounded&&state.y>-3370&&state.y<-3310};
}
