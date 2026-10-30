import {spawnPlayer,stepPlayer,TICK} from './goldsrc.mjs?v=20261030-guide';
import {physicsPoint} from './bsp.mjs?v=20261030-guide';
// Original BSPs are byte-exact. Themes only affect rendering.
export const CLASSIC_MAPS=Object.freeze([
 {id:'surf_ski_2',navId:'ski2',name:'surf_ski_2',file:'./maps/surf_ski_2.bsp',author:'Super Mario',description:'O clássico das bases e rampas centrais, com escadas, piscina e teleportes.',tag:'Clássico aberto',preview:'./previews/surf_ski_2.jpg',sha256:'e45838152f7efb91d82f12bcd88793c0cb150dbc20523f0db4ec7fa3965f3524',theme:null},
 {"id":"surf_green","navId":"surf_green","name":"surf_green","file":"./maps/surf_green.bsp","preview":"./previews/surf_green.jpg","sha256":"ccf1166a69f1de556d33b5c4d76112dcef1441d39b23863f09579adf0f2589ca","source":"https://www.surfmaparchive.com/maps/cs/surf_green.zip","author":"Gamer-X","description":"Rampas verdes, plataformas abertas e escolhas de percurso. Concreto, metal e luz suave renovados.","tag":"Verde · plataformas abertas","theme":{"id":"green","skyTop":"#24566a","skyMid":"#8db9b1","skyHorizon":"#e2edd5","skyBottom":"#9fbbad","fog":12112578,"ambient":1.2,"sunColor":16773070,"sunPower":2.5,"accent":10279866,"preserve":["green1","green2","green3"]},"exposure":1.02},
 {"id":"surf_ninja","navId":"surf_ninja","name":"surf_ninja","file":"./maps/surf_ninja.bsp","preview":"./previews/surf_ninja.jpg","sha256":"fdccbf1ee501a168c6a4697d7128b98fc5c58381be747c63d84fd125f821165e","source":"https://www.surfmaparchive.com/maps/cs/surf_ninja.zip","author":"Design: Drunken Ninja · Construção: *Mario","description":"Rampas curvas e passagens no céu. Pedra polida, recortes de luz e atmosfera de fim de tarde.","tag":"Curvas · pedra e crepúsculo","theme":{"id":"ninja","skyTop":"#101b35","skyMid":"#586a8f","skyHorizon":"#bccbde","skyBottom":"#6c7d93","fog":7176859,"ambient":1.25,"sunColor":14082815,"sunPower":3.1,"accent":9882600,"preserve":["surf_credits1","surf_credits2","surf_credits3","surf_credits4","surf_ninjaa","surf_ninjaaa"]},"exposure":1.12},
 {"id":"surf_egypt","navId":"surf_egypt","name":"surf_egypt","file":"./maps/surf_egypt.bsp","preview":"./previews/surf_egypt.jpg","sha256":"33614035f8f058f1705ca13ea849004ca6713b1384221d493a9b0492890a3ccc","source":"https://www.surfmaparchive.com/maps/cs/surf_egypt.zip","author":"Autoria não autenticada no pacote consultado","description":"Arquitetura e rampas em tema egípcio. Arenito, relevos sutis e iluminação quente renovados.","tag":"Deserto · arquitetura egípcia","theme":{"id":"egypt","skyTop":"#39709c","skyMid":"#e3bc87","skyHorizon":"#fff0cc","skyBottom":"#c8ab7f","fog":14533019,"ambient":1.12,"sunColor":16768689,"sunPower":2.9,"accent":null,"preserve":[]},"exposure":1.02},
 ]);
export const findClassicMap=id=>CLASSIC_MAPS.find(map=>map.id===id)??CLASSIC_MAPS[0];
const skip=/^(sky|clip|origin|null|aaatrigger)$/i;
const area=points=>{let sum=0;for(let i=1;i<points.length-1;i++){const a={x:points[i].x-points[0].x,y:points[i].y-points[0].y,z:points[i].z-points[0].z},b={x:points[i+1].x-points[0].x,y:points[i+1].y-points[0].y,z:points[i+1].z-points[0].z};sum+=Math.hypot(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x)/2;}return sum;};
export function practiceEntry(map,id=''){
  if(id==='surf_ski_2'){
    const vertices=map.faceVertices(map.faces[925]),center=vertices.reduce((a,p)=>({x:a.x+p.x/vertices.length,y:a.y+p.y/vertices.length,z:a.z+p.z/vertices.length}),{x:0,y:0,z:0}),p=physicsPoint(center);
    const hit=map.trace({...p,z:p.z+180},{...p,z:p.z-180});return {...hit.end,z:hit.end.z+.2,vx:550,vy:0,vz:-10,yaw:0,pitch:-.12,face:925,normal:hit.normal,seeded:true};
  }
  const spawn=map.spawn('ct'),candidates=[],model=map.models[0];
  for(let index=model.first;index<model.first+model.count;index++){
    const face=map.faces[index],texture=map.textures[map.texinfo[face.texinfo].texture];if(!texture||skip.test(texture.name))continue;
    const sign=face.side?-1:1,native=map.planes[face.plane].normal,n=physicsPoint({x:native.x*sign,y:native.y*sign,z:native.z*sign});
    if(n.z<.3||n.z>.69)continue;const vertices=map.faceVertices(face);if(area(vertices)<4096)continue;
    const center=physicsPoint(vertices.reduce((a,p)=>({x:a.x+p.x/vertices.length,y:a.y+p.y/vertices.length,z:a.z+p.z/vertices.length}),{x:0,y:0,z:0}));
    const start={x:center.x+n.x*100,y:center.y+n.y*100,z:center.z+n.z*100},end={x:center.x-n.x*100,y:center.y-n.y*100,z:center.z-n.z*100};
    const hit=map.trace(start,end,1);if(hit.startSolid||hit.fraction>=1||hit.normal.z<.3||hit.normal.z>.69)continue;
    const position={x:hit.end.x+hit.normal.x*.15,y:hit.end.y+hit.normal.y*.15,z:hit.end.z+hit.normal.z*.15};if(map.trace(position,position,1).startSolid)continue;
    const normal=hit.normal,length=Math.hypot(normal.x,normal.y),tangent={x:-normal.y/length,y:normal.x/length};
    const centerMap=physicsPoint({x:(model.mins.x+model.maxs.x)/2,y:(model.mins.y+model.maxs.y)/2,z:0}),signDirection=Math.sign(tangent.x*(centerMap.x-position.x)+tangent.y*(centerMap.y-position.y))||1;
    const vx=tangent.x*signDirection*550,vy=tangent.y*signDirection*550,vz=-10;
    candidates.push({...position,vx,vy,vz,yaw:Math.atan2(vy,vx),pitch:-.12,face:index,normal,seeded:true,score:Math.hypot(position.x-spawn.x,position.y-spawn.y)+Math.abs(position.z-spawn.z)*.7});
  }
  const shortlist=candidates.sort((a,b)=>a.score-b.score).slice(0,24);let best=null;
  for(const entry of shortlist){const s=Object.assign(spawnPlayer(map),entry),right=(-Math.sin(s.yaw)*entry.normal.x+Math.cos(s.yaw)*entry.normal.y)<=0?1:-1;let contacts=0;
    for(let i=0;i<80;i++){stepPlayer(s,{right},map,TICK);if(s.stuck||s.teleports||s.pushes)break;if(s.contact&&s.contact.z>.3&&s.contact.z<.7)contacts++;}
    entry.straightContactTicks=contacts;if(!best||contacts>best.straightContactTicks)best=entry;
  }
  return best;

}
export function originalHazard(map,state){
  const hull=state.crouched?3:1;
  for(const model of map.models)if(model.entity?.classname==='trigger_hurt'&&Number(model.entity.dmg)>0&&!(Number(model.entity.spawnflags||0)&(2|8))){
    // GoldSrc first intersects the entity bounds, then tests the expanded BSP hull.
    // The feet touching a brush counts; a point-only test would miss real damage.
    const point=physicsPoint(state),half={x:16,y:16,z:state.crouched?18:36};
    if(['x','y','z'].some(k=>point[k]+half[k]<model.mins[k]+model.offset[k]||point[k]-half[k]>model.maxs[k]+model.offset[k]))continue;
    if(map.contains(model,state,model.heads[hull]>=0?hull:0))return model;
  }
  return null;
}
