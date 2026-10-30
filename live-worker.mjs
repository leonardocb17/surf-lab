import {BspMap} from './bsp.mjs?v=20261030-guides';
import {liveGuide} from './live-coach.mjs?v=20261030-guides';
let map;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){map=new BspMap(data.buffer);self.postMessage({type:'ready'});return;}
    if(data.type==='catalog'&&map){const {prepareRouteCatalog}=await import('./ct-routes.mjs?v=20261030-guides');const catalog=await prepareRouteCatalog(map,data.config);self.postMessage({type:'catalog',key:data.key,catalog});return;}
    if(data.type!=='forecast'||!map)return;
    const result=liveGuide(data.state,map,data.options);
    self.postMessage({type:'forecast',epoch:data.epoch,seq:data.seq,result,source:{time:data.state.time,x:data.state.x,y:data.state.y,z:data.state.z,config:data.options.config}});
  }catch(error){self.postMessage({type:data.type==='catalog'?'catalog-error':'error',key:data.key,epoch:data.epoch,message:error.message});}
};
