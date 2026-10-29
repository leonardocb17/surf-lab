// GoldSrc BSP v30 reader. Layout: Valve Half-Life SDK utils/common/bspfile.h.
const SOLID=-2,EPS=.03125;
const vec=(x=0,y=0,z=0)=>({x,y,z});
const add=(a,b)=>vec(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a,b)=>vec(a.x-b.x,a.y-b.y,a.z-b.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const lerp=(a,b,t)=>vec(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
export const nativePoint=p=>vec(p.x,-p.y,p.z);
export const physicsPoint=nativePoint;
export class BspMap{
  constructor(buffer){
    this.buffer=buffer;this.view=new DataView(buffer);this.bytes=new Uint8Array(buffer);
    if(this.view.getInt32(0,true)!==30)throw new Error('Expected GoldSrc BSP version 30');
    this.lumps=Array.from({length:15},(_,i)=>{
      const offset=this.view.getInt32(4+i*8,true),length=this.view.getInt32(8+i*8,true);
      if(offset<0||length<0||offset+length>buffer.byteLength)throw new Error('Invalid BSP lump');return {offset,length};
    });
    const f=(o)=>this.view.getFloat32(o,true),i=(o)=>this.view.getInt32(o,true),h=(o)=>this.view.getInt16(o,true),u=(o)=>this.view.getUint16(o,true);
    const v=o=>vec(f(o),f(o+4),f(o+8));
    const read=(l,size,fn)=>{const a=this.lumps[l];if(a.length%size)throw new Error('Invalid record size');return Array.from({length:a.length/size},(_,n)=>fn(a.offset+n*size,n));};
    this.planes=read(1,20,o=>({normal:v(o),dist:f(o+12),type:i(o+16)}));
    this.vertices=read(3,12,v);
    this.nodes=read(5,24,o=>({plane:i(o),children:[h(o+4),h(o+6)]}));
    this.texinfo=read(6,40,o=>({s:v(o),sOffset:f(o+12),t:v(o+16),tOffset:f(o+28),texture:i(o+32),flags:i(o+36)}));
    this.faces=read(7,20,o=>({plane:u(o),side:h(o+2),first:i(o+4),count:h(o+8),texinfo:h(o+10),light:i(o+16)}));
    this.clipnodes=read(9,8,o=>({plane:i(o),children:[h(o+4),h(o+6)]}));
    this.leaves=read(10,28,o=>({contents:i(o)}));
    this.edges=read(12,4,o=>[u(o),u(o+2)]);this.surfedges=read(13,4,i);
    this.models=read(14,64,o=>({mins:v(o),maxs:v(o+12),origin:v(o+24),heads:[i(o+36),i(o+40),i(o+44),i(o+48)],first:i(o+56),count:i(o+60),offset:vec(),entity:null}));
    const e=this.lumps[0],text=new TextDecoder('windows-1252').decode(this.bytes.subarray(e.offset,e.offset+e.length));
    this.entities=[...text.matchAll(/\{([^}]+)\}/g)].map(match=>Object.fromEntries([...match[1].matchAll(/"([^"\n]+)"\s*"([^"\n]*)"/g)].map(m=>[m[1],m[2]])));
    this.entities.forEach(entity=>{if(/^\*\d+$/.test(entity.model||'')){const model=this.models[Number(entity.model.slice(1))];if(model){model.entity=entity;model.offset=this.parseVector(entity.origin);}}});
    this.textures=[];const tx=this.lumps[2],count=i(tx.offset);
    for(let n=0;n<count;n++){
      const relative=i(tx.offset+4+n*4);if(relative<0){this.textures.push({name:'missing',width:64,height:64});continue;}
      const o=tx.offset+relative,name=new TextDecoder().decode(this.bytes.subarray(o,o+16)).split('\0')[0],width=i(o+16),height=i(o+20),mips=[i(o+24),i(o+28),i(o+32),i(o+36)];
      const texture={name,width,height,rgba:null};
      if(mips[0]>0&&width>0&&height>0){
        const palette=o+mips[3]+Math.floor(width/8)*Math.floor(height/8)+2,rgba=new Uint8Array(width*height*4);
        for(let p=0;p<width*height;p++){const index=this.bytes[o+mips[0]+p];rgba[p*4]=this.bytes[palette+index*3];rgba[p*4+1]=this.bytes[palette+index*3+1];rgba[p*4+2]=this.bytes[palette+index*3+2];rgba[p*4+3]=name.startsWith('{')&&index===255?0:255;}texture.rgba=rgba;
      }
      this.textures.push(texture);
    }
    this.solids=[this.models[0],...this.models.slice(1).filter(m=>['func_wall','func_breakable','func_door','func_door_rotating','func_button','func_pushable'].includes(m.entity?.classname))];
    this.triggers=this.models.filter(m=>['trigger_push','trigger_teleport','func_ladder','func_water'].includes(m.entity?.classname));
    this.targets=new Map(this.entities.filter(e=>e.targetname&&e.origin).map(e=>[e.targetname,e]));
    this.spawns=this.entities.filter(e=>['info_player_start','info_player_deathmatch'].includes(e.classname));
  }
  parseVector(text){const a=(text||'0 0 0').trim().split(/\s+/).map(Number);return vec(a[0]||0,a[1]||0,a[2]||0);}
  faceVertices(face){return Array.from({length:face.count},(_,n)=>{const edge=this.surfedges[face.first+n];return this.vertices[this.edges[Math.abs(edge)][edge<0?1:0]];});}
  contents(model,p,hull=1){
    const local=sub(p,model.offset),nodes=hull?this.clipnodes:this.nodes;let node=model.heads[hull],guard=0;
    while(node>=0&&guard++<512){const n=nodes[node];if(!n)return SOLID;const plane=this.planes[n.plane];node=n.children[dot(local,plane.normal)-plane.dist<0?1:0];}
    return hull?node:(this.leaves[-node-1]?.contents??SOLID);
  }
  contains(model,p,hull=0){const contents=this.contents(model,nativePoint(p),hull);return contents===SOLID||(model.entity?.classname==='func_water'&&contents===-3);}
  traceModel(model,start,end,hull=1){
    const a=sub(nativePoint(start),model.offset),b=sub(nativePoint(end),model.offset),delta=sub(b,a),nodes=hull?this.clipnodes:this.nodes;
    const beganSolid=this.contents(model,nativePoint(start),hull)===SOLID,result={fraction:1,end:{...end},normal:vec(),startSolid:false,model};let visits=0;
    const walk=(node,t0,t1,p0,p1,entry)=>{
      if(++visits>8192)return true;
      if(node<0){
        const contents=hull?node:this.leaves[-node-1]?.contents;
        if(contents!==SOLID)return true;
        if(t0<=0&&beganSolid){result.startSolid=true;return false;}
        const normal=entry||vec(0,0,1),back=EPS/Math.max(.000001,Math.abs(dot(delta,normal)));
        result.fraction=Math.max(0,t0-back);result.end=lerp(start,end,result.fraction);result.normal=physicsPoint(normal);return false;
      }
      const n=nodes[node];if(!n)return true;const plane=this.planes[n.plane],d0=dot(p0,plane.normal)-plane.dist,d1=dot(p1,plane.normal)-plane.dist;
      if(d0>=0&&d1>=0)return walk(n.children[0],t0,t1,p0,p1,entry);
      if(d0<0&&d1<0)return walk(n.children[1],t0,t1,p0,p1,entry);
      const side=d0<0?1:0,fraction=Math.max(0,Math.min(1,d0/(d0-d1))),tm=t0+(t1-t0)*fraction,mid=lerp(p0,p1,fraction);
      if(!walk(n.children[side],t0,tm,p0,mid,entry))return false;
      const normal=side?vec(-plane.normal.x,-plane.normal.y,-plane.normal.z):plane.normal;
      return walk(n.children[1-side],tm,t1,mid,p1,normal);
    };
    walk(model.heads[hull],0,1,a,b,null);return result;
  }
  trace(start,end,hull=1){
    let best={fraction:1,end:{...end},normal:vec(),startSolid:false,model:null};
    for(const model of this.solids){
      const a=nativePoint(start),b=nativePoint(end),margin=hull===1?36:hull===3?18:0;
      if(model!==this.models[0]&&['x','y','z'].some(k=>Math.min(a[k],b[k])>model.maxs[k]+model.offset[k]+margin||Math.max(a[k],b[k])<model.mins[k]+model.offset[k]-margin))continue;
      const hit=this.traceModel(model,start,end,hull);if(hit.startSolid)best.startSolid=true;
      if(hit.fraction<best.fraction)best={...hit,startSolid:best.startSolid||hit.startSolid};
    }
    return best;
  }
  visibleModels(){return this.models.filter((m,i)=>i===0||!['trigger_push','trigger_teleport','func_buyzone'].includes(m.entity?.classname));}
  spawn(team='ct',index=0){
    const list=this.spawns.filter(e=>e.classname===(team==='t'?'info_player_deathmatch':'info_player_start')),e=list[index%list.length]||this.spawns[0],p=physicsPoint(this.parseVector(e.origin));
    return {...p,yaw:-(this.parseVector(e.angles).y||Number(e.angle)||0)*Math.PI/180};
  }
}
