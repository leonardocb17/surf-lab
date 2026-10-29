import {physicsPoint} from './bsp.mjs?v=20261028-remaster';
export const TICK=.01;
export const CONFIG=Object.freeze({gravity:800,airAcceleration:100,groundAcceleration:10,maxSpeed:250,friction:4,jump:270});
const dot=(v,n)=>v.x*n.x+v.y*n.y+v.z*n.z;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const position=s=>({x:s.x,y:s.y,z:s.z});
function clip(velocity,normal){const d=dot(velocity,normal);return {x:velocity.x-d*normal.x,y:velocity.y-d*normal.y,z:velocity.z-d*normal.z};}
export function spawnPlayer(map,team='ct'){
  const p=map.spawn(team);return {...p,vx:0,vy:0,vz:0,pitch:-.08,time:0,grounded:false,crouched:false,contact:null,airGain:0,airTime:0,maxAirTime:0,teleports:0,pushes:0,lastTeleport:-10,jumpHeld:false,triggerIds:[],event:null,stuck:false};
}
function slide(s,map,dt,hull){
  let left=dt;const planes=[];const original={x:s.vx,y:s.vy,z:s.vz};
  for(let bump=0;bump<4&&left>1e-6;bump++){
    const target={x:s.x+s.vx*left,y:s.y+s.vy*left,z:s.z+s.vz*left},hit=map.trace(position(s),target,hull);
    if(hit.startSolid){s.stuck=true;s.vx=s.vy=s.vz=0;return;}
    if(hit.fraction>0){Object.assign(s,hit.end);planes.length=0;}
    if(hit.fraction===1)break;
    s.contact=hit.normal;left*=1-hit.fraction;planes.push(hit.normal);
    let velocity={x:s.vx,y:s.vy,z:s.vz},found=false;
    for(const plane of planes){
      const candidate=clip(velocity,plane);
      if(planes.every(other=>dot(candidate,other)>=-.001)){velocity=candidate;found=true;break;}
    }
    if(!found){
      if(planes.length===2){const [a,b]=planes,d={x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x},len=Math.hypot(d.x,d.y,d.z)||1;d.x/=len;d.y/=len;d.z/=len;const scale=dot(velocity,d);velocity={x:d.x*scale,y:d.y*scale,z:d.z*scale};}
      else velocity={x:0,y:0,z:0};
    }
    if(dot(velocity,original)<=0){s.vx=s.vy=s.vz=0;break;}
    s.vx=velocity.x;s.vy=velocity.y;s.vz=velocity.z;
  }
}
function triggers(s,map){
  const active=[];s.inWater=false;s.onLadder=false;
  for(const model of map.triggers){
    const kind=model.entity.classname;
    if(kind==='func_water'){
      if(map.contains(model,position(s),0))s.inWater=true;continue;
    }
    if(!map.contains(model,position(s),model.heads[1]>=0?1:0))continue;
    const id=map.models.indexOf(model);active.push(id);
    if(kind==='func_ladder'){s.onLadder=s.time>(s.ladderExitUntil||0);continue;}
    if(kind==='trigger_teleport'&&s.time-s.lastTeleport>.35){
      const target=map.targets.get(model.entity.target);if(!target)continue;
      const p=physicsPoint(map.parseVector(target.origin));p.z+=37;
      for(let i=0;i<36&&map.trace(p,p,s.crouched?3:1).startSolid;i++)p.z+=2;
      Object.assign(s,p);s.vx=s.vy=s.vz=0;s.lastTeleport=s.time;s.teleports++;s.event=`Teleporte: ${model.entity.target}`;
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
export function stepPlayer(s,input,map,dt=TICK){
  s.time+=dt;s.event=null;s.stuck=false;s.contact=null;
  const hull=s.crouched?3:1,ground=map.trace(position(s),{x:s.x,y:s.y,z:s.z-2},hull);
  s.grounded=!ground.startSolid&&ground.fraction<1&&ground.normal.z>.7&&s.vz<=180;
  if(s.grounded&&s.vz<0)s.vz=0;
  if(Boolean(input.duck)!==s.crouched){
    const next=Boolean(input.duck),p={x:s.x,y:s.y,z:s.z+(s.grounded?(next?-18:18):0)};
    if(!map.trace(p,p,next?3:1).startSolid){Object.assign(s,p);s.crouched=next;}
  }
  triggers(s,map);const speedBefore=Math.hypot(s.vx,s.vy);
  if(s.grounded||s.inWater){
    const speed=Math.hypot(s.vx,s.vy),drop=(s.inWater?speed*3:Math.max(100,speed)*CONFIG.friction)*dt,scale=Math.max(0,speed-drop)/(speed||1);s.vx*=scale;s.vy*=scale;
  }
  const f=input.forward||0,right=input.right||0,wx=Math.cos(s.yaw)*f-Math.sin(s.yaw)*right,wy=Math.sin(s.yaw)*f+Math.cos(s.yaw)*right,len=Math.hypot(wx,wy),wishSpeed=CONFIG.maxSpeed*(s.crouched&&s.grounded?.34:1);
  if(len>0){const dx=wx/len,dy=wy/len,current=s.vx*dx+s.vy*dy,cap=s.grounded||s.inWater?wishSpeed:30,accel=s.grounded||s.inWater?CONFIG.groundAcceleration:CONFIG.airAcceleration,amount=Math.max(0,Math.min(accel*wishSpeed*dt,cap-current));s.vx+=dx*amount;s.vy+=dy*amount;}
  s.airGain=Math.hypot(s.vx,s.vy)-speedBefore;
  const jumpPressed=input.jump&&!s.jumpHeld;
  if(jumpPressed&&s.grounded){s.vz=CONFIG.jump;s.grounded=false;}
  if(s.inWater&&input.jump)s.vz=Math.max(s.vz,180);
  s.jumpHeld=Boolean(input.jump);
  if(s.onLadder&&jumpPressed){s.vz=200;s.vx=-Math.cos(s.yaw)*180;s.vy=-Math.sin(s.yaw)*180;s.onLadder=false;s.ladderExitUntil=s.time+.35;}
  else if(s.onLadder){s.vz=f*200;s.vx=-Math.sin(s.yaw)*right*140;s.vy=Math.cos(s.yaw)*right*140;}
  else s.vz-=CONFIG.gravity*(s.inWater?.25:1)*dt/2;
  const start={...s};slide(s,map,dt,s.crouched?3:1);
  if(start.grounded&&!s.stuck&&s.contact&&s.contact.z<.7){
    const elevated={...start,z:start.z+18};
    const clearance=map.trace(position(start),position(elevated),s.crouched?3:1);
    if(!clearance.startSolid&&clearance.fraction===1){
      slide(elevated,map,dt,s.crouched?3:1);const down=map.trace(position(elevated),{x:elevated.x,y:elevated.y,z:elevated.z-18},s.crouched?3:1);
      if(!down.startSolid&&down.normal.z>.7&&Math.hypot(elevated.x-start.x,elevated.y-start.y)>Math.hypot(s.x-start.x,s.y-start.y)){Object.assign(s,down.end);s.vx=elevated.vx;s.vy=elevated.vy;s.vz=0;s.contact=down.normal;}
    }
  }
  if(!s.onLadder)s.vz-=CONFIG.gravity*(s.inWater?.25:1)*dt/2;
  const floor=map.trace(position(s),{x:s.x,y:s.y,z:s.z-2},s.crouched?3:1);
  s.grounded=!floor.startSolid&&floor.fraction<1&&floor.normal.z>.7&&s.vz<=180;
  if(s.grounded){s.vz=0;s.contact=floor.normal;}
  if(s.contact)s.airTime=0;else{s.airTime+=dt;s.maxAirTime=Math.max(s.maxAirTime,s.airTime);}
  for(const k of ['vx','vy','vz'])s[k]=clamp(s[k],-6000,6000);
  return s;
}
