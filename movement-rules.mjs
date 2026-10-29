// Independent implementation of the documented CS 1.6 movement equations.
// References: Valve pm_shared.c and ReGameDLL_CS pm_shared.{cpp,h}.
export const BODY=Object.freeze({standing:36,ducked:18,eyeStanding:17,eyeDucked:12,duckTime:.4,duckMultiplier:.333});
export const JUMP_SPEED=Math.sqrt(2*800*45);
export const STAMINA_RESET=1315.789429;
export const STOCK=Object.freeze({gravity:800,airAcceleration:10,groundAcceleration:10,maxSpeed:250,friction:4,jump:JUMP_SPEED,maxVelocity:2000,stamina:true,bunnyCap:true});
export const SURF=Object.freeze({...STOCK,airAcceleration:100,maxVelocity:6000,stamina:false,bunnyCap:false});
export const PROFILES=Object.freeze({stock:STOCK,surf:SURF});
export const jumpSpeed=stamina=>JUMP_SPEED*(1-Math.max(0,stamina||0)*.00019);
export function airAccelerate(v,dx,dy,wishSpeed,acceleration,dt){
  const extra=Math.max(0,Math.min(acceleration*wishSpeed*dt,30-v.vx*dx-v.vy*dy));
  v.vx+=dx*extra;v.vy+=dy*extra;return extra;
}
export function ladderVelocity(s,input,n,maxSpeed=250){
  const speed=Math.min(200,maxSpeed)*(s.crouched?BODY.duckMultiplier:1),f=(input.forward||0)*speed,r=(input.right||0)*speed,p=s.pitch||0;
  const v={x:Math.cos(s.yaw)*Math.cos(p)*f-Math.sin(s.yaw)*r,y:Math.sin(s.yaw)*Math.cos(p)*f+Math.cos(s.yaw)*r,z:Math.sin(p)*f};
  // n x normalize(up x n) is the upward tangent to the contacted plane.
  const horizontal=Math.hypot(n.x,n.y);
  if(horizontal<1e-6)return {x:0,y:0,z:0};
  const up={x:-n.x*n.z/horizontal,y:-n.y*n.z/horizontal,z:horizontal},into=v.x*n.x+v.y*n.y+v.z*n.z;
  return {x:v.x-into*n.x-into*up.x,y:v.y-into*n.y-into*up.y,z:v.z-into*n.z-into*up.z};
}
export function bunnyLimit(s,maxSpeed){
  const speed=Math.hypot(s.vx,s.vy,s.vz),limit=1.2*maxSpeed;
  if(speed>limit){const scale=limit*.8/speed;s.vx*=scale;s.vy*=scale;s.vz*=scale;}
}
