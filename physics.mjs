export const DT=0.01;
export const GRAVITY=800;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function createCourse(mirrored=false){
  const mirror=mirrored?-1:1;
  return Array.from({length:6},(_,i)=>{
    const side=(i%2?-1:1)*mirror,k=side*1.25,c=70-i*220;
    const r={id:i+1,x0:i*1550,x1:i*1550+1350,y0:Math.min(0,450*side),y1:Math.max(0,450*side),side,k,c};
    const n=Math.hypot(k,1);r.n={x:0,y:-k/n,z:1/n};return r;
  });
}
export const rampHeight=(r,y)=>r.k*y+r.c;
export function spawn(course,index=0){
  const r=course[index],y=350*r.side;
  return {x:r.x0+100,y,z:rampHeight(r,y)+.02,vx:600,vy:-120*r.side,vz:-150,yaw:-10*r.side*Math.PI/180,pitch:-12*Math.PI/180,time:0,contact:r.id,progress:r.id,outcome:null,airGain:0};
}
export function clipVelocity(s,n){const dot=s.vx*n.x+s.vy*n.y+s.vz*n.z;if(dot<0){s.vx-=dot*n.x;s.vy-=dot*n.y;s.vz-=dot*n.z;}}
export function step(s,input,course,dt=DT){
  if(s.outcome)return s;
  s.time+=dt;s.contact=null;s.vz-=GRAVITY*dt/2;s.airGain=0;
  if(input){
    const dx=-Math.sin(s.yaw)*input,dy=Math.cos(s.yaw)*input,p=s.vx*dx+s.vy*dy;
    const before=Math.hypot(s.vx,s.vy),q=Math.max(0,Math.min(100*250*dt,30-p));
    s.vx+=q*dx;s.vy+=q*dy;s.airGain=Math.hypot(s.vx,s.vy)-before;
  }
  let left=dt;
  for(let iteration=0;iteration<4&&left>1e-7;iteration++){
    const end={x:s.x+s.vx*left,y:s.y+s.vy*left,z:s.z+s.vz*left};let hit=null;
    for(const r of course){
      const a=s.z-r.k*s.y-r.c,b=end.z-r.k*end.y-r.c;
      if(a>=-.001&&b<0){
        const f=Math.max(0,a/(a-b)),x=s.x+(end.x-s.x)*f,y=s.y+(end.y-s.y)*f;
        if(x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1&&(!hit||f<hit.f))hit={r,f,x,y,z:rampHeight(r,y)};
      }
    }
    if(!hit){s.x=end.x;s.y=end.y;s.z=end.z;break;}
    const {r,f}=hit;s.x=hit.x;s.y=hit.y+r.n.y*.002;s.z=hit.z+r.n.z*.002;clipVelocity(s,r.n);s.contact=r.id;left*=1-f;
    if(r.id===s.progress+1)s.progress=r.id;
    else if(r.id>s.progress+1)s.outcome='missed';
  }
  s.vz-=GRAVITY*dt/2;
  for(const r of course){const d=s.z-r.k*s.y-r.c;if(s.x>=r.x0&&s.x<=r.x1&&s.y>=r.y0&&s.y<=r.y1&&d>=-.01&&d<.08){s.contact=r.id;break;}}
  const last=course.at(-1);
  if(s.progress===course.length&&s.contact===last.id&&s.x>last.x1-90)s.outcome='won';
  if(s.z<last.c-650||Math.abs(s.y)>2400||s.x< -600||s.x>last.x1+500||s.time>60)s.outcome='fell';
  return s;
}
const DEFAULT={launchDistance:550,launchVy:180,cruise:100,landingY:150};
export function policy(s,course,p=DEFAULT){
  if(s.outcome)return {input:0,yaw:s.yaw};
  if(s.contact){
    const r=course[s.contact-1],localY=s.y*r.side,remaining=r.x1-s.x,last=r.id===course.length;
    let target=last?clamp((230-localY)*1.3,-120,120):remaining<p.launchDistance?p.launchVy:clamp((65-localY)*1.2,-p.cruise,100);
    if(localY>390)target=Math.min(target,(425-localY)*2);
    if(localY<50)target=Math.max(target,70);
    target=Math.min(target,Math.max(50,s.vx*.18));
    const vy=target*r.side,speed=Math.hypot(Math.max(s.vx,80),vy);
    const yaw=Math.atan2(vy,Math.max(s.vx,80))-Math.asin(clamp(r.side*30/speed,-1,1));
    return {input:Math.abs(angleDelta(yaw,s.yaw))>10*Math.PI/180?0:r.side,yaw};
  }
  const next=course[Math.min(s.progress,course.length-1)],targetY=next.side*p.landingY,targetZ=rampHeight(next,targetY);
  const distance=s.z-next.k*s.y-next.c,closing=s.vz-next.k*s.vy;
  if(s.x>next.x0-60&&s.x<next.x1&&s.y>next.y0&&s.y<next.y1&&distance>=0&&closing<0&&distance/(-closing)<.25)return policy({...s,contact:next.id,progress:next.id},course,p);
  const disc=s.vz*s.vz+2*GRAVITY*(s.z-targetZ);
  const flight=disc>0?clamp((s.vz+Math.sqrt(disc))/GRAVITY,.2,1.6):.5;
  const lateralLimit=Math.max(120,Math.abs(s.vx)*.65);
  const wantedVy=clamp((targetY-s.y)/flight,-lateralLimit,lateralLimit),error=wantedVy-s.vy;
  if(Math.abs(error)<8)return {input:0,yaw:Math.atan2(s.vy,Math.max(s.vx,40))};
  const input=Math.sign(error),speed=Math.max(50,Math.hypot(s.vx,s.vy));
  const q=Math.min(30,Math.abs(error)*.12),projection=30-q;
  const yaw=Math.atan2(s.vy,s.vx)+input*(Math.acos(clamp(projection/speed,-1,1))-Math.PI/2);
  return {input:Math.abs(angleDelta(yaw,s.yaw))>15*Math.PI/180?0:input,yaw};
}
export function applyControl(s,action,maxTurn=100*Math.PI/180,dt=DT){s.yaw+=clamp(angleDelta(action.yaw,s.yaw),-maxTurn*dt,maxTurn*dt);return action.input;}
export function score(s,course){
  if(s.outcome==='won')return 1000000+s.vx;
  if(s.outcome)return -100000+s.progress*1000;
  const speed=Math.hypot(s.vx,s.vy);
  let value=s.progress*6000+s.x*.45+speed*.12-Math.max(0,-s.vx)*10;
  const next=course[Math.min(s.progress,course.length-1)];
  if(!s.contact&&s.x>next.x0&&s.z<Math.min(rampHeight(next,next.y0),rampHeight(next,next.y1))-100)value-=8000;
  if(Math.abs(s.y)>530)value-=(Math.abs(s.y)-530)*8;
  return value;
}
const CANDIDATES=[];
for(const launchDistance of [200,350,500])for(const launchVy of [60,100,150])for(const landingY of [220,320])CANDIDATES.push({launchDistance,launchVy,cruise:140,landingY});
export function recommend(state,course,{horizon=2.8,trace=true}={}){
  let best=null;
  for(const params of CANDIDATES){
    const s={...state};
    for(let i=0;i<Math.round(horizon/DT)&&!s.outcome;i++){const a=policy(s,course,params);step(s,applyControl(s,a),course);}
    const value=score(s,course);
    if(!best||value>best.score)best={params,score:value,end:s};
  }
  const action=policy(state,course,best.params),path=[];
  if(trace){const s={...state};path.push({x:s.x,y:s.y,z:s.z});for(let i=0;i<Math.round(horizon/DT)&&!s.outcome;i++){const a=policy(s,course,best.params);step(s,applyControl(s,a),course);if(i%5===0)path.push({x:s.x,y:s.y,z:s.z});}}
  return {...action,params:best.params,path,predictedProgress:best.end.progress,safe:!best.end.outcome||best.end.outcome==='won'};
}
