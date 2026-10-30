import {BspMap} from './bsp.mjs?v=20261030-guide';
import {replayRoute,liveGuide} from './classic-coach.mjs?v=20261030-guide';
let map,routes=[],run,config;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){map=new BspMap(data.buffer);routes=data.routes;}
    if(data.type==='init'||data.type==='route'){
      config=data.config;const definition=routes.find(r=>r.id===data.id)??routes[0];run=replayRoute(map,definition,config);
      self.postMessage({type:'route',epoch:data.epoch,run});return;
    }
    if(data.type==='forecast'&&run?.verified){const result=liveGuide(data.state,map,run,config,data.options);self.postMessage({type:'forecast',epoch:data.epoch,result,source:{time:data.state.time,x:data.state.x,y:data.state.y,z:data.state.z}});}
  }catch(error){self.postMessage({type:'error',epoch:data.epoch,message:error.message});}
};
