import * as THREE from './vendor/three.module.min.js';
import {Line2} from './vendor/lines/Line2.js';
import {LineGeometry} from './vendor/lines/LineGeometry.js';
import {LineMaterial} from './vendor/lines/LineMaterial.js';
import {toRenderPoint} from './view-space.mjs';
// Official Three.js wide lines use screen-space pixels, independent of distance.
export function widePath(color,width=7,{dashed=false,opacity=1}={}){
  const group=new THREE.Group();
  const material=new LineMaterial({color,linewidth:width,worldUnits:false,depthTest:false,depthWrite:false,transparent:true,opacity,dashed,dashSize:38,gapSize:20});
  const outline=new LineMaterial({color:0x06232c,linewidth:width+4,worldUnits:false,depthTest:false,depthWrite:false,transparent:true,opacity:.88,dashed,dashSize:38,gapSize:20});
  const halo=new Line2(new LineGeometry(),outline),line=new Line2(new LineGeometry(),material);halo.renderOrder=9;line.renderOrder=10;group.add(halo,line);group.userData.wide=true;
  group.setPoints=(points=[])=>{
    const values=points.flatMap(p=>toRenderPoint(p.x,p.y,p.z));group.visible=points.length>1;group.userData.pointCount=points.length;
    for(const mesh of [halo,line]){mesh.geometry.dispose();mesh.geometry=new LineGeometry();mesh.geometry.setPositions(values.length>=6?values:[0,0,0,0,0,0]);mesh.computeLineDistances();}
  };
  group.setWidth=value=>{material.linewidth=value;outline.linewidth=value+4;};
  group.dispose=()=>{for(const mesh of [halo,line]){mesh.geometry.dispose();mesh.material.dispose();}};
  group.setPoints([]);return group;
}
