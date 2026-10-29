import {BspMap} from './bsp.mjs?v=20261029-jumps';
import {liveGuide} from './live-coach.mjs?v=20261029-live';
let map;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){map=new BspMap(data.buffer);self.postMessage({type:'ready'});return;}
    if(data.type!=='forecast'||!map)return;
    const result=liveGuide(data.state,map,data.options);
    self.postMessage({type:'forecast',epoch:data.epoch,seq:data.seq,result,source:{time:data.state.time,x:data.state.x,y:data.state.y,z:data.state.z}});
  }catch(error){self.postMessage({type:'error',epoch:data.epoch,message:error.message});}
};
