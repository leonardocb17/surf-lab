import {physicsPoint} from './bsp.mjs?v=20261030-guides';
import {BODY,SURF,STAMINA_RESET,jumpSpeed,ladderVelocity,bunnyLimit,airAccelerate} from './movement-rules.mjs?v=20261030-guides';
export const TICK=.01;
export const CONFIG=SURF;
const dot=(v,n)=>v.x*n.x+v.y*n.y+v.z*n.z;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const position=s=>({x:s.x,y:s.y,z:s.z});
function clip(velocity,normal){const d=dot(velocity,normal);return {x:velocity.x-d*normal.x,y:velocity.y-d*normal.y,z:velocity.z-d*normal.z};}
export function spawnPlayer(map,team='ct'){
  const p=map.spawn(team);return {...p,vx:0,vy:0,vz:0,pitch:-.08,time:0,grounded:false,crouched:false,duckElapsed:0,stamina:0,eye:BODY.eyeStanding,contact:null,airGain:0,airTime:0,maxAirTime:0,waterLevel:0,waterJumpTime:0,waterJumpDir:null,teleports:0,pushes:0,lastTeleport:-10,jumpHeld:false,triggerIds:[],event:null,stuck:false};
}
function wetPoint(map,p){return map.contents?.(map.models?.[0],physicsPoint(p),0)===-3||(map.triggers??[]).some(m=>m.entity.classname==='func_water'&&map.contains(m,p,0));}
function waterDepth(s,map){
  const half=s.crouched?BODY.ducked:BODY.standing;
  if(!wetPoint(map,{x:s.x,y:s.y,z:s.z-half+1}))return 0;
  if(!wetPoint(map,position(s)))return 1;
  return wetPoint(map,{x:s.x,y:s.y,z:s.z+s.eye})?3:2;
}
function tryWaterExit(s,map){
  if(s.onLadder||s.waterJumpTime>0||s.waterLevel!==2||s.vz< -180)return;
  const forward={x:Math.cos(s.yaw),y:Math.sin(s.yaw)},along=s.vx*forward.x+s.vy*forward.y;
  if(along<0)return;
  const point={x:s.x,y:s.y,z:s.z+8},end={x:s.x+forward.x*24,y:s.y+forward.y*24,z:point.z},lower=map.trace(point,end,0);
  if(lower.startSolid||lower.fraction===1||Math.abs(lower.normal.z)>=.1)return;
  const top=s.z+(s.crouched?BODY.ducked:BODY.standing),upper=map.trace({...point,z:top},{...end,z:top},0);
  if(upper.startSolid||upper.fraction!==1)return;
  s.waterJumpTime=2;s.waterJumpDir={x:-50*lower.normal.x,y:-50*lower.normal.y};s.vz=225;s.jumpHeld=true;s.grounded=false;s.event='Saída da água pela borda';
}
export function ladderPracticeEntry(map){
  for(const model of map.triggers.filter(m=>m.entity.classname==='func_ladder')){
    for(let i=model.first;i<model.first+model.count;i++){
      const face=map.faces[i],plane=map.planes[face.plane],sign=face.side?-1:1,normal=physicsPoint({x:plane.normal.x*sign,y:plane.normal.y*sign,z:plane.normal.z*sign});
      if(Math.abs(normal.z)>.01)continue;
      const points=map.faceVertices(face),center=points.reduce((a,p)=>({x:a.x+p.x/points.length,y:a.y+p.y/points.length,z:a.z+p.z/points.length}),{x:0,y:0,z:0});
      const base=physicsPoint({x:center.x+model.offset.x,y:center.y+model.offset.y,z:center.z+model.offset.z});
      for(const fraction of [.2,.5,.8]){
        const p={x:base.x+normal.x*15.5,y:base.y+normal.y*15.5,z:model.offset.z+model.mins.z+(model.maxs.z-model.mins.z)*fraction};
        if(map.contains(model,p,1)&&!map.trace(p,p,1).startSolid)return {...p,yaw:Math.atan2(normal.x,-normal.y),pitch:-89*Math.PI/180};
      }
    }
  }
  return null;
}
function slide(s,map,dt,hull){
  let left=dt;const planes=[];const original={x:s.vx,y:s.vy,z:s.vz};
  for(let bump=0;bump<4&&left>1e-6;bump++){
    const target={x:s.x+s.vx*left,y:s.y+s.vy*left,z:s.z+s.vz*left},hit=map.trace(position(s),target,hull);
    if(hit.startSolid){s.stuck=true;s.vx=s.vy=s.vz=0;return;}
    if(hit.fraction>0){Object.assign(s,hit.end);planes.length=0;}
    if(hit.fraction===1)break;
    s.contact=hit.normal;left*=1-hit.fraction;planes.push(hit.normal);
    const before={x:s.vx,y:s.vy,z:s.vz};
    let velocity={x:s.vx,y:s.vy,z:s.vz},found=false;
    for(const plane of planes){
      const candidate=clip(velocity,plane);
      if(planes.every(other=>dot(candidate,other)>=-.001)){velocity=candidate;found=true;break;}
    }
    if(!found){
      if(planes.length===2){const [a,b]=planes,d={x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x},len=Math.hypot(d.x,d.y,d.z)||1;d.x/=len;d.y/=len;d.z/=len;const scale=dot(velocity,d);velocity={x:d.x*scale,y:d.y*scale,z:d.z*scale};}
      else velocity={x:0,y:0,z:0};
    }
    if(dot(velocity,original)<=0)velocity={x:0,y:0,z:0};
    if(s.captureImpacts)s.impacts.push({position:{...hit.end},normal:{...hit.normal},before,after:{...velocity},loss:Math.max(0,(dot(before,before)-dot(velocity,velocity))/2)});
    if(!velocity.x&&!velocity.y&&!velocity.z){s.vx=s.vy=s.vz=0;break;}
    s.vx=velocity.x;s.vy=velocity.y;s.vz=velocity.z;
  }
}
function triggers(s,map){
  // Some maps compile pools into the world BSP instead of a func_water model.
  const active=[];s.inWater=map.contents?.(map.models?.[0],physicsPoint(position(s)),0)===-3;s.onLadder=false;s.ladderNormal=null;
  s.waterLevel=waterDepth(s,map);
  for(const model of map.triggers){
    const kind=model.entity.classname;
    if(kind==='func_water'){
      if(map.contains(model,position(s),0))s.inWater=true;continue;
    }
    if(!map.contains(model,position(s),model.heads[s.crouched?3:1]>=0?(s.crouched?3:1):0))continue;
    const id=map.models.indexOf(model);active.push(id);
    if(kind==='func_ladder'){const normal=map.ladderNormal(model,position(s));if(normal){s.onLadder=true;s.ladderNormal=normal;}continue;}
    if(kind==='trigger_teleport'&&s.time-s.lastTeleport>.35){
      const target=map.targets.get(model.entity.target);if(!target)continue;
      const p=physicsPoint(map.parseVector(target.origin));p.z+=37;
      for(let i=0;i<36&&map.trace(p,p,s.crouched?3:1).startSolid;i++)p.z+=2;
      Object.assign(s,p);s.vx=s.vy=s.vz=0;s.lastTeleport=s.time;s.teleports++;s.event=`Teleporte: ${model.entity.target}`;
      s.waterJumpTime=0;s.waterJumpDir=null;
      if(target.angles)s.yaw=-map.parseVector(target.angles).y*Math.PI/180;
      s.triggerIds=[];return;
    }
    if(kind==='trigger_push'){
      const angles=map.parseVector(model.entity.angles),pitch=angles.x*Math.PI/180,yaw=angles.y*Math.PI/180,speed=Number(model.entity.speed)||100;
      // Map-specified push direction and speed, applied as a launch velocity.
      // This is deliberately an adapted jump-pad integration, not server basevelocity emulation.
      const dir={x:Math.cos(pitch)*Math.cos(yaw),y:-Math.cos(pitch)*Math.sin(yaw),z:-Math.sin(pitch)},projection=s.vx*dir.x+s.vy*dir.y+s.vz*dir.z,impulse=Math.max(0,speed-projection);
      s.vx+=dir.x*impulse;s.vy+=dir.y*impulse;s.vz+=dir.z*impulse;
      if(!s.triggerIds.includes(id)){s.pushes++;s.event=`Impulsionador: ${Math.round(speed)} u/s`;}
    }
  }
  s.triggerIds=active;
}
export function stepPlayer(s,input,map,dt=TICK,config=CONFIG){
  s.time+=dt;s.event=null;s.stuck=false;s.contact=null;
  if(s.captureImpacts)s.impacts=[];
  s.stamina=Math.max(0,(s.stamina||0)-dt*1000);
  const hull=s.crouched?3:1,ground=map.trace(position(s),{x:s.x,y:s.y,z:s.z-2},hull);
  s.grounded=!ground.startSolid&&ground.fraction<1&&ground.normal.z>.7&&s.vz<=180;
  if(s.grounded)Object.assign(s,ground.end);
  if(s.grounded&&s.vz<0)s.vz=0;
  s.duckElapsed=input.duck?(s.duckElapsed||0)+dt:0;
  const wantDuck=Boolean(input.duck)&&(s.crouched||!s.grounded||s.duckElapsed>=BODY.duckTime);
  if(wantDuck!==s.crouched){
    const next=wantDuck,p={x:s.x,y:s.y,z:s.z+(s.grounded?(next?-18:18):0)};
    if(!map.trace(p,p,next?3:1).startSolid){Object.assign(s,p);s.crouched=next;}
  }
  const duckFraction=Math.min(1,s.duckElapsed/BODY.duckTime),smooth=duckFraction*duckFraction*(3-2*duckFraction);
  s.eye=s.crouched?BODY.eyeDucked:input.duck&&s.grounded?BODY.eyeStanding+(BODY.eyeDucked-18-BODY.eyeStanding)*smooth:BODY.eyeStanding;
  triggers(s,map);const speedBefore=Math.hypot(s.vx,s.vy);
  if(!s.grounded)tryWaterExit(s,map);else s.waterJumpTime=0;
  if(s.waterJumpTime>0){
    s.waterJumpTime=Math.max(0,s.waterJumpTime-dt);if(!s.waterLevel)s.waterJumpTime=0;
    s.vx=s.waterJumpDir.x;s.vy=s.waterJumpDir.y;s.jumpHeld=Boolean(input.jump);s.airGain=Math.hypot(s.vx,s.vy)-speedBefore;
    slide(s,map,dt,s.crouched?3:1);
    const floor=map.trace(position(s),{x:s.x,y:s.y,z:s.z-2},s.crouched?3:1);
    s.grounded=!floor.startSolid&&floor.fraction<1&&floor.normal.z>.7&&s.vz<=180;
    if(s.grounded){Object.assign(s,floor.end);s.vz=0;s.contact=floor.normal;s.waterJumpTime=0;}
    s.waterLevel=waterDepth(s,map);
    if(s.contact||s.inWater)s.airTime=0;else{s.airTime+=dt;s.maxAirTime=Math.max(s.maxAirTime,s.airTime);}
    for(const k of ['vx','vy','vz'])s[k]=clamp(s[k],-config.maxVelocity,config.maxVelocity);
    return s;
  }
  const jumpPressed=input.jump&&!s.jumpHeld;
  if(!s.onLadder&&(s.inWater||(s.grounded&&!jumpPressed))){
    const speed=Math.hypot(s.vx,s.vy),drop=(s.inWater?speed*3:Math.max(config.stopSpeed??100,speed)*config.friction)*dt,scale=Math.max(0,speed-drop)/(speed||1);s.vx*=scale;s.vy*=scale;
  }
  if(jumpPressed&&s.grounded&&!s.onLadder){if(config.bunnyCap)bunnyLimit(s,config.maxSpeed);s.vz=config.stamina?jumpSpeed(s.stamina):config.jump;s.stamina=STAMINA_RESET;s.grounded=false;}
  const f=input.forward||0,right=input.right||0,wx=Math.cos(s.yaw)*f-Math.sin(s.yaw)*right,wy=Math.sin(s.yaw)*f+Math.cos(s.yaw)*right,len=Math.hypot(wx,wy),wishSpeed=config.maxSpeed*((input.duck||s.crouched)?BODY.duckMultiplier:1);
  if(len>0&&!s.onLadder){const dx=wx/len,dy=wy/len;
    if(!s.grounded&&!s.inWater)airAccelerate(s,dx,dy,wishSpeed,config.airAcceleration,dt);
    else{const amount=Math.max(0,Math.min(config.groundAcceleration*wishSpeed*dt,wishSpeed-s.vx*dx-s.vy*dy));s.vx+=dx*amount;s.vy+=dy*amount;}
  }
  s.airGain=Math.hypot(s.vx,s.vy)-speedBefore;
  if(s.inWater&&input.jump)s.vz=Math.max(s.vz,180);
  s.jumpHeld=Boolean(input.jump);
  if(s.onLadder&&input.jump){s.vx=s.ladderNormal.x*270;s.vy=s.ladderNormal.y*270;s.vz=s.ladderNormal.z*270;s.onLadder=false;}
  else if(s.onLadder){const v=ladderVelocity(s,input,s.ladderNormal,config.maxSpeed);s.vx=v.x;s.vy=v.y;s.vz=v.z;
    const into=dot({x:Math.cos(s.yaw)*Math.cos(s.pitch)*f-Math.sin(s.yaw)*right,y:Math.sin(s.yaw)*Math.cos(s.pitch)*f+Math.cos(s.yaw)*right,z:Math.sin(s.pitch)*f},s.ladderNormal);
    if(s.grounded&&into>0){s.vx+=200*s.ladderNormal.x;s.vy+=200*s.ladderNormal.y;s.vz+=200*s.ladderNormal.z;}
  }
  if(!s.onLadder)s.vz-=config.gravity*(s.inWater?.25:1)*dt/2;
  const start={...s};slide(s,map,dt,s.crouched?3:1);
  if(start.grounded&&!s.stuck&&s.contact&&s.contact.z<.7){
    const elevated={...start,z:start.z+18,impacts:[]};
    const clearance=map.trace(position(start),position(elevated),s.crouched?3:1);
    if(!clearance.startSolid&&clearance.fraction===1){
      slide(elevated,map,dt,s.crouched?3:1);const down=map.trace(position(elevated),{x:elevated.x,y:elevated.y,z:elevated.z-18},s.crouched?3:1);
      if(!down.startSolid&&down.normal.z>.7&&Math.hypot(elevated.x-start.x,elevated.y-start.y)>Math.hypot(s.x-start.x,s.y-start.y)){Object.assign(s,down.end);s.vx=elevated.vx;s.vy=elevated.vy;s.vz=0;s.contact=down.normal;if(s.captureImpacts)s.impacts=elevated.impacts;}
    }
  }
  if(!s.onLadder)s.vz-=config.gravity*(s.inWater?.25:1)*dt/2;
  const floor=map.trace(position(s),{x:s.x,y:s.y,z:s.z-2},s.crouched?3:1);
  s.grounded=!floor.startSolid&&floor.fraction<1&&floor.normal.z>.7&&s.vz<=180;
  if(s.grounded){Object.assign(s,floor.end);s.vz=0;s.contact=floor.normal;}
  if(s.contact||s.onLadder||s.inWater)s.airTime=0;else{s.airTime+=dt;s.maxAirTime=Math.max(s.maxAirTime,s.airTime);}
  for(const k of ['vx','vy','vz'])s[k]=clamp(s[k],-config.maxVelocity,config.maxVelocity);
  return s;
}
