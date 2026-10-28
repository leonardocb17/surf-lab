export const DT=0.01;
export const GRAVITY=800;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const isFlightCourse=course=>course.mode==='sky'||course.mode==='lateral';
export function createCourse(mirrored=false,mode='basic',destination='island'){
  const mirror=mirrored?-1:1;
  if(mode==='sky'||mode==='lateral')return createSkyCourse(mirror,destination,mode);
  if(mode==='abyss'){
    const layout=[[0,1800,2400,560],[3400,5100,1600,440],[6900,8600,800,420],[10550,12350,0,400],[14400,16300,-800,440]];
    const course=layout.map(([x0,x1,c,width],i)=>{
      const side=(i%2?-1:1)*mirror,k=side*1.35,n=Math.hypot(k,1);
      return {id:i+1,x0,x1,y0:Math.min(0,width*side),y1:Math.max(0,width*side),side,k,c,width,n:{x:0,y:-k/n,z:1/n}};
    });course.mode='abyss';return course;
  }
  const course=Array.from({length:6},(_,i)=>{
    const side=(i%2?-1:1)*mirror,k=side*1.25,c=70-i*220;
    const r={id:i+1,x0:i*1550,x1:i*1550+1350,y0:Math.min(0,450*side),y1:Math.max(0,450*side),side,k,c};
    const n=Math.hypot(k,1);r.n={x:0,y:-k/n,z:1/n};return r;
  });course.mode='basic';return course;
}
export function rampHeight(r,y,x=r.x0){
  if(r.profile){const surface=r.profile.find(p=>x<=p.x1)||r.profile.at(-1);return rampHeight(surface,y,x);}
  return r.k*y+r.c+(r.m||0)*(x-r.x0);
}
function createSkyCourse(mirror,destination,mode='sky'){
  let x=0,z=8000;
  const profile=[];
  for(const [length,m] of [[6000,-.8],[400,-.65],[400,-.45],[400,-.25],[400,0],[400,.25],[400,.5],[400,.75],[400,1]]){
    const k=1.25*mirror,n=Math.hypot(m,k,1);
    profile.push({id:1,x0:x,x1:x+length,y0:Math.min(0,1800*mirror),y1:Math.max(0,1800*mirror),side:mirror,k,m,c:z,width:1800,n:{x:-m/n,y:-k/n,z:1/n}});
    x+=length;z+=m*length;
  }
  const launch={...profile[0],x1:x,profile,name:'Lançador'};
  const layout=mode==='lateral'?[
    {id:2,key:'left',name:'Ilha à esquerda',x0:13500,x1:16500,y0:-7000*mirror,y1:-5200*mirror,c:200},
    {id:3,key:'right',name:'Ilha à direita',x0:14500,x1:17500,y0:6000*mirror,y1:7800*mirror,c:500},
    {id:4,key:'wide',name:'Arco extremo',x0:11000,x1:14000,y0:-9000*mirror,y1:-7200*mirror,c:-500}
  ]:[
    {id:2,key:'tower',name:'Mirante',x0:17500,x1:20300,y0:300*mirror,y1:2100*mirror,c:1100},
    {id:3,key:'island',name:'Ilha distante',x0:17200,x1:20500,y0:-1600*mirror,y1:200*mirror,c:500},
    {id:4,key:'coast',name:'Costa remota',x0:16700,x1:20000,y0:-3900*mirror,y1:-1700*mirror,c:200}
  ];
  const pads=layout.map(r=>({...r,y0:Math.min(r.y0,r.y1),y1:Math.max(r.y0,r.y1),k:0,side:mirror,n:{x:0,y:0,z:1},goal:true}));
  const course=[launch,...pads];course.mode=mode;course.surfaces=[...profile,...pads];
  course.goalId=(pads.find(p=>p.key===destination)||pads[mode==='lateral'?0:1]).id;return course;
}
export function spawn(course,index=0){
  const r=course[index],y=350*r.side;
  if(isFlightCourse(course)){
    const x=100,sy=650*r.side,vx=800,vy=0;
    return {x,y:sy,z:rampHeight(r,sy,x)+.02,vx,vy,vz:r.profile[0].m*vx,yaw:0,pitch:-.28,time:0,contact:1,progress:1,outcome:null,airGain:0};
  }
  if(course.mode==='abyss'){
    const x=r.x0+100,sy=Math.min(r.width-60,280)*r.side,vx=1050,vy=-160*r.side;
    return {x,y:sy,z:rampHeight(r,sy)+.02,vx,vy,vz:r.k*vy,yaw:Math.atan2(vy,vx),pitch:-12*Math.PI/180,time:0,contact:r.id,progress:r.id,outcome:null,airGain:0};
  }
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
    for(const r of course.surfaces||course){
      const a=s.z-rampHeight(r,s.y,s.x),b=end.z-rampHeight(r,end.y,end.x);
      if(a>=-.001&&b<0){
        const f=Math.max(0,a/(a-b)),x=s.x+(end.x-s.x)*f,y=s.y+(end.y-s.y)*f;
        if(x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1&&(!hit||f<hit.f))hit={r,f,x,y,z:rampHeight(r,y,x)};
      }
    }
    if(!hit){s.x=end.x;s.y=end.y;s.z=end.z;break;}
    const {r,f}=hit;s.x=hit.x+r.n.x*.002;s.y=hit.y+r.n.y*.002;s.z=hit.z+r.n.z*.002;clipVelocity(s,r.n);s.contact=r.id;left*=1-f;
    if(isFlightCourse(course)&&r.goal){s.progress=r.id;s.outcome='won';s.landedId=r.id;break;}
    if(r.id===s.progress+1)s.progress=r.id;
    else if(r.id>s.progress+1)s.outcome='missed';
  }
  s.vz-=GRAVITY*dt/2;
  for(const r of course.surfaces||course){const d=s.z-rampHeight(r,s.y,s.x);if(s.x>=r.x0&&s.x<=r.x1&&s.y>=r.y0&&s.y<=r.y1&&d>=-.01&&d<.08){s.contact=r.id;break;}}
  const last=course.at(-1);
  if(s.progress===course.length&&s.contact===last.id&&s.x>last.x1-90)s.outcome='won';
  const limitX=isFlightCourse(course)?Math.max(...course.map(r=>r.x1))+1500:last.x1+500;
  if(s.z<last.c-(course.mode==='basic'?650:1200)||Math.abs(s.y)>(isFlightCourse(course)?12000:2400)||s.x< -600||s.x>limitX||s.time>(course.mode==='basic'?60:90))s.outcome='fell';
  return s;
}
const DEFAULT={launchDistance:550,launchVy:180,cruise:100,landingY:150};
export function policy(s,course,p=DEFAULT){
  if(s.outcome)return {input:0,yaw:s.yaw};
  if(isFlightCourse(course))return skyPolicy(s,course);
  const advanced=course.mode==='abyss';
  if(s.contact){
    if(advanced)return flightPolicy(s,course,p);
    const r=course[s.contact-1],localY=s.y*r.side,remaining=r.x1-s.x,last=r.id===course.length;
    let target=last?clamp((230-localY)*1.3,-120,120):remaining<p.launchDistance?p.launchVy:clamp((65-localY)*1.2,-p.cruise,100);
    if(localY>390)target=Math.min(target,(425-localY)*2);
    if(localY<50)target=Math.max(target,70);
    target=Math.min(target,Math.max(50,s.vx*.18));
    const vy=target*r.side,speed=Math.hypot(Math.max(s.vx,80),vy);
    const yaw=Math.atan2(vy,Math.max(s.vx,80))-Math.asin(clamp(r.side*30/speed,-1,1));
    return {input:Math.abs(angleDelta(yaw,s.yaw))>10*Math.PI/180?0:r.side,yaw};
  }
  const next=course[Math.min(s.progress,course.length-1)],targetY=next.side*(advanced?Math.min(p.landingY,next.width-50):p.landingY),targetZ=rampHeight(next,targetY);
  const distance=s.z-rampHeight(next,s.y),closing=s.vz-next.k*s.vy;
  if(s.x>next.x0-60&&s.x<next.x1&&s.y>next.y0&&s.y<next.y1&&distance>=0&&closing<0&&distance/(-closing)<.25)return policy({...s,contact:next.id,progress:next.id},course,p);
  const disc=s.vz*s.vz+2*GRAVITY*(s.z-targetZ);
  const flight=disc>0?clamp((s.vz+Math.sqrt(disc))/GRAVITY,.2,advanced?3.5:1.6):.5;
  const lateralLimit=Math.max(120,Math.abs(s.vx)*.65);
  const wantedVy=clamp((targetY-s.y)/flight,-lateralLimit,lateralLimit),error=wantedVy-s.vy;
  if(Math.abs(error)<8)return {input:0,yaw:Math.atan2(s.vy,Math.max(s.vx,40))};
  const input=Math.sign(error),speed=Math.max(50,Math.hypot(s.vx,s.vy));
  const q=Math.min(30,Math.abs(error)*.12),projection=30-q;
  const yaw=Math.atan2(s.vy,s.vx)+input*(Math.acos(clamp(projection/speed,-1,1))-Math.PI/2);
  return {input:Math.abs(angleDelta(yaw,s.yaw))>15*Math.PI/180?0:input,yaw};
}
export function applyControl(s,action,maxTurn=100*Math.PI/180,dt=DT){s.yaw+=clamp(angleDelta(action.yaw,s.yaw),-maxTurn*dt,maxTurn*dt);return action.input;}
function skyPolicy(s,course){
  if(s.contact===1){
    const r=course[0],local=s.y*r.side;
    const target=clamp(((s.x>r.x1-1200?1050:650)-local)*1.6,-220,240),vy=target*r.side;
    const yaw=Math.atan2(vy,Math.max(100,s.vx))-Math.asin(clamp(30*r.side/Math.hypot(s.vx,vy),-1,1));
    return {input:Math.abs(angleDelta(yaw,s.yaw))>.9?0:r.side,yaw};
  }
  const goal=course.find(r=>r.id===course.goalId),targetY=(goal.y0+goal.y1)/2;
  const disc=s.vz*s.vz+2*GRAVITY*(s.z-goal.c),flight=disc>=0?clamp((s.vz+Math.sqrt(disc))/GRAVITY,.12,10):.2;
  const wanted=clamp((targetY-s.y)/flight,-1400,1400),error=wanted-s.vy;
  if(Math.abs(error)<5)return {input:0,yaw:Math.atan2(s.vy,s.vx)};
  const input=Math.sign(error),speed=Math.max(100,Math.hypot(s.vx,s.vy)),projection=30-Math.min(30,Math.abs(error)*.15);
  const yaw=Math.atan2(s.vy,s.vx)+input*(Math.acos(clamp(projection/speed,-1,1))-Math.PI/2);
  return {input:Math.abs(angleDelta(yaw,s.yaw))>.3?0:input,yaw};
}
function flightPolicy(s,course,p){
  const r=course[s.contact-1],localY=s.y*r.side,remaining=r.x1-s.x,width=r.width;
  let target;
  if(r.id===course.length)target=clamp((width*.5-localY)*1.2,-120,120);
  else if(remaining<p.launchDistance){
    const time=Math.max(.12,remaining/Math.max(200,s.vx));
    target=clamp((width-65-localY)/time,70,p.launchVy);
  }else target=clamp((65-localY)*1.2,-140,80);
  if(localY>width-30)target=Math.min(target,(width-15-localY)*2);
  if(localY<35)target=Math.max(target,85);
  const vy=target*r.side,speed=Math.hypot(Math.max(s.vx,80),vy);
  const yaw=Math.atan2(vy,Math.max(s.vx,80))-Math.asin(clamp(r.side*30/speed,-1,1));
  return {input:Math.abs(angleDelta(yaw,s.yaw))>75*Math.PI/180?0:r.side,yaw};
}
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
const FLIGHT_CANDIDATES=[];
for(const launchDistance of [600,900,1200])for(const launchVy of [180,280,380])for(const landingY of [170,270])FLIGHT_CANDIDATES.push({launchDistance,launchVy,cruise:140,landingY});
export function recommend(state,course,{horizon=course.mode==='abyss'?4:2.8,trace=true}={}){
  if(isFlightCourse(course)){
    const s={...state},path=[{x:s.x,y:s.y,z:s.z}];let landingTime=null,landingPoint=null;
    for(let i=0;i<1200&&!s.outcome;i++){
      const a=policy(s,course);step(s,applyControl(s,a),course);
      if(trace&&i%5===0)path.push({x:s.x,y:s.y,z:s.z});
      if(s.outcome==='won'){landingTime=s.time-state.time;landingPoint={x:s.x,y:s.y,z:s.z};}
    }
    return {...policy(state,course),params:{},path,predictedProgress:s.progress,safe:s.outcome==='won',landingTime,landingPoint};
  }
  let best=null;
  for(const params of course.mode==='abyss'?FLIGHT_CANDIDATES:CANDIDATES){
    const s={...state};
    for(let i=0;i<Math.round(horizon/DT)&&!s.outcome;i++){const a=policy(s,course,params);step(s,applyControl(s,a),course);}
    const value=score(s,course);
    if(!best||value>best.score)best={params,score:value,end:s};
  }
  const action=policy(state,course,best.params),path=[];
  if(trace){const s={...state};path.push({x:s.x,y:s.y,z:s.z});for(let i=0;i<Math.round(horizon/DT)&&!s.outcome;i++){const a=policy(s,course,best.params);step(s,applyControl(s,a),course);if(i%5===0)path.push({x:s.x,y:s.y,z:s.z});}}
  return {...action,params:best.params,path,predictedProgress:best.end.progress,safe:!best.end.outcome||best.end.outcome==='won'};
}

// Same physics and initial state as the guide, with no A/D acceleration.
export function coastPrediction(state,course,horizon=4){
  const s={...state},path=[{x:s.x,y:s.y,z:s.z}];let landed=null;
  for(let i=0;i<Math.round(horizon/DT)&&!s.outcome;i++){
    step(s,0,course);
    if(i%5===0)path.push({x:s.x,y:s.y,z:s.z});
    if(s.contact){landed=s.contact;break;}
  }
  return {path,landed,end:s};
}

export function airMetrics(s,input){
  const speed=Math.hypot(s.vx,s.vy),projection=input?(-Math.sin(s.yaw)*s.vx+Math.cos(s.yaw)*s.vy)*input:0;
  const acceleration=input?Math.max(0,Math.min(100*250*DT,30-projection)):0;
  const gain=Math.sqrt(Math.max(0,speed*speed+2*acceleration*projection+acceleration*acceleration))-speed;
  const bestGain=Math.hypot(speed,30)-speed;
  return {gain,efficiency:input?clamp(gain/Math.max(.00001,bestGain),0,1):0,projection,braking:gain<-.01};
}
