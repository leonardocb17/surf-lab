import {spawnPlayer,stepPlayer,TICK} from './goldsrc.mjs?v=20261030-guides';
import {BODY,STOCK,SURF,JUMP_SPEED} from './movement-rules.mjs?v=20261030-guides';
export {BODY,STOCK,SURF,JUMP_SPEED,TICK};
export function createStudyMap(obstacles=false){
  const boxes=obstacles?[{x:100,y:-100,z:0,w:100,d:200,h:56},{x:440,y:-100,z:0,w:100,d:200,h:64}]:[];
  return {boxes,triggers:[],models:[],spawn:()=>({x:0,y:0,z:36,yaw:0}),trace(start,end,hull=1){
    const half=hull===3?18:36,result={fraction:1,end:{...end},normal:{x:0,y:0,z:0},startSolid:start.z<half-.001};
    const dz=end.z-start.z;
    if(dz<0&&end.z<half&&start.z>=half-.001){result.fraction=Math.max(0,(half-start.z)/dz);result.normal={x:0,y:0,z:1};}
    for(const box of boxes){
      const min={x:box.x-16,y:box.y-16,z:box.z-half},max={x:box.x+box.w+16,y:box.y+box.d+16,z:box.z+box.h+half};
      if(['x','y','z'].every(k=>start[k]>min[k]+.001&&start[k]<max[k]-.001))result.startSolid=true;
      let enter=-Infinity,exit=Infinity,normal={x:0,y:0,z:0},valid=true;
      for(const k of ['x','y','z']){
        const d=end[k]-start[k];if(Math.abs(d)<1e-9){if(start[k]<=min[k]||start[k]>=max[k])valid=false;continue;}
        let a=(min[k]-start[k])/d,b=(max[k]-start[k])/d,sign=-1;if(a>b){[a,b]=[b,a];sign=1;}
        if(a>enter){enter=a;normal={x:0,y:0,z:0};normal[k]=sign;}exit=Math.min(exit,b);
      }
      if(valid&&enter>=0&&enter<=exit&&enter<result.fraction){result.fraction=Math.max(0,enter-1e-7);result.normal=normal;}
    }
    result.end={x:start.x+(end.x-start.x)*result.fraction,y:start.y+(end.y-start.y)*result.fraction,z:start.z+(end.z-start.z)*result.fraction};return result;
  }};
}
export function heights(s){const half=s.crouched?BODY.ducked:BODY.standing;return {feet:s.z-half,center:s.z,head:s.z+half,eye:s.z+s.eye};}
export function strafeInput(s,mode,time,config=STOCK){
  if(mode==='none')return {};
  const side=Math.floor(time/.13)%2===0?1:-1,heading=Math.atan2(s.vy,s.vx);
  if(mode==='smooth'){
    const speed=Math.hypot(s.vx,s.vy),projection=Math.max(0,30-config.airAcceleration*config.maxSpeed*TICK),angle=Math.acos(Math.min(1,projection/Math.max(1,speed)));
    s.yaw=heading+side*angle-side*Math.PI/2;
  }else s.yaw=heading+side*2.3;
  return {right:side};
}
export function simulateJump({duck='none',duckAt=.16,speed=250,strafe='none',config=STOCK,stamina=0,obstacles=false}={}){
  const map=createStudyMap(obstacles),s=spawnPlayer(map);s.vx=speed;s.stamina=stamina;
  if(duck==='before'){s.crouched=true;s.z=18;s.eye=BODY.eyeDucked;s.duckElapsed=BODY.duckTime;}
  const initialCenter=s.z,frames=[],capture=input=>frames.push({...s,...heights(s),input:{...input},speed:Math.hypot(s.vx,s.vy),rise:s.z-initialCenter});
  capture({});let peakRise=0,peakFeet=0,peakSpeed=speed;
  for(let i=0;i<300;i++){
    const time=i*TICK,input={...strafeInput(s,strafe,time,config),jump:i===0,duck:duck==='before'||(duck==='air'&&time>=duckAt)};
    stepPlayer(s,input,map,TICK,config);peakRise=Math.max(peakRise,s.z-initialCenter);peakFeet=Math.max(peakFeet,heights(s).feet);peakSpeed=Math.max(peakSpeed,Math.hypot(s.vx,s.vy));capture(input);
    if(i>1&&s.grounded)break;
  }
  return {duck,duckAt,speed,strafe,frames,peakRise,peakFeet,peakSpeed,duration:s.time,range:Math.hypot(s.x,s.y),forward:s.x,takeoffSpeed:frames[1].speed};
}
