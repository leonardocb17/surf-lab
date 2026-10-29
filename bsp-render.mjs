import * as THREE from './vendor/three.module.min.js';
const SKIP=/^(sky|clip|origin|null|aaatrigger)$/i;
function noise(x,y){const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);}
function procedural(name){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(512,512),wood=/wood|crate|dsk/.test(name),metal=/metal|mtl|gar3|lab1|tech/.test(name),dark=/black|laser/.test(name);
  const base=dark?[28,35,43]:wood?[121,92,61]:name.includes('frostvat')?[99,118,128]:name.includes('crete')?[164,162,149]:name.includes('lab5')?[83,109,123]:name.includes('snow')?[224,230,226]:name.includes('frostsewer')?[199,212,218]:metal?[133,151,162]:[165,179,187];
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const i=(y*512+x)*4,fine=(noise(x,y)-.5)*19,broad=(noise(Math.floor(x/14),Math.floor(y/14))-.5)*7;
    const grain=wood?Math.sin(y*.18+Math.sin(x*.02)*3)*12:0;
    for(let c=0;c<3;c++)image.data[i+c]=base[c]+fine+broad+grain;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  if(name.startsWith('{')){
    ctx.clearRect(0,0,512,512);ctx.fillStyle='#c2d1d4';
    if(name.includes('ladder')){ctx.fillRect(70,0,32,512);ctx.fillRect(410,0,32,512);for(let y=25;y<512;y+=90)ctx.fillRect(70,y,372,22);}
    else{for(let x=16;x<512;x+=64)ctx.fillRect(x,0,10,512);for(let y=16;y<512;y+=96)ctx.fillRect(0,y,512,8);}
  }else if(!dark&&!wood){
    ctx.strokeStyle=metal?'#687e8980':'#7a898c50';ctx.lineWidth=2;ctx.strokeRect(1,1,510,510);
    if(metal){ctx.strokeStyle='#e4ecec80';ctx.strokeRect(9,9,494,494);for(const x of [20,492])for(const y of [20,492]){ctx.fillStyle='#52636c';ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill();}}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
  return texture;
}
function normalTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;data[i]=128+(noise(x,y)-.5)*27;data[i+1]=128+(noise(x+3,y)-.5)*27;data[i+2]=254;data[i+3]=255;}
  const map=new THREE.DataTexture(data,size,size);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.needsUpdate=true;return map;
}
function makeMaterial(texture,normal){
  const name=texture.name.toLowerCase();let map;
  if(texture.rgba&&!['snow','null','aaatrigger'].includes(name)){
    map=new THREE.DataTexture(texture.rgba,texture.width,texture.height);map.flipY=false;map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  }else map=procedural(name);
  const water=name.startsWith('!'),glass=name.includes('glass'),cutout=name.startsWith('{'),light=name.includes('spot')||name.includes('laser');
  const material=new THREE.MeshStandardMaterial({map,normalMap:texture.rgba?null:normal,normalScale:new THREE.Vector2(.28,.28),roughness:water?.14:glass?.18:.78,metalness:water?.3:glass?.2:/mtl|tech|gar3/.test(name)?.45:.08,side:THREE.DoubleSide,transparent:water||glass,opacity:water?.7:glass?.35:1,alphaTest:cutout?.45:0});
  if(water){material.color.setHex(0x45c8d0);material.normalScale.set(.8,.8);material.envMapIntensity=1.7;material.depthWrite=false;}
  if(light){material.emissive.setHex(name.includes('red')?0xec5545:name.includes('green')?0x6bd5b4:name.includes('blue')?0x5596f1:0xeacb82);material.emissiveIntensity=.5;}
  return material;
}
function smoothRampNormals(geometry){
  const p=geometry.attributes.position,n=geometry.attributes.normal,flat=n.array.slice(),groups=new Map();
  for(let i=0;i<p.count;i++){
    if(flat[i*3+2]<.2||flat[i*3+2]>.9)continue;
    const key=`${Math.round(p.getX(i)*100)},${Math.round(p.getY(i)*100)},${Math.round(p.getZ(i)*100)}`;
    const group=groups.get(key)||[];group.push(i);groups.set(key,group);
  }
  for(const group of groups.values())for(const i of group){
    let x=0,y=0,z=0;
    for(const j of group)if(flat[i*3]*flat[j*3]+flat[i*3+1]*flat[j*3+1]+flat[i*3+2]*flat[j*3+2]>.94){x+=flat[j*3];y+=flat[j*3+1];z+=flat[j*3+2];}
    const length=Math.hypot(x,y,z)||1;n.setXYZ(i,x/length,y/length,z/length);
  }
}
export function buildBspScene(map,renderer,scene){
  const group=new THREE.Group(),normal=normalTexture(),materials=map.textures.map(t=>makeMaterial(t,normal)),batches=new Map(),visible=map.visibleModels();let renderedFaces=0,triangles=0;
  for(const model of visible)for(let n=0;n<model.count;n++){
    const face=map.faces[model.first+n],info=map.texinfo[face.texinfo],texture=map.textures[info.texture];
    if(!texture||SKIP.test(texture.name))continue;
    const points=map.faceVertices(face);if(points.length<3)continue;
    const batch=batches.get(info.texture)||{positions:[],uvs:[],colors:[]};batches.set(info.texture,batch);
    const light=face.light>=0?map.lumps[8].offset+face.light:-1;
    const brightness=light>=0?.65+(map.bytes[light]+map.bytes[light+1]+map.bytes[light+2])/765*.35:1;
    for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]]){
      batch.positions.push(p.x+model.offset.x,p.y+model.offset.y,p.z+model.offset.z);
      batch.uvs.push((p.x*info.s.x+p.y*info.s.y+p.z*info.s.z+info.sOffset)/texture.width,(p.x*info.t.x+p.y*info.t.y+p.z*info.t.z+info.tOffset)/texture.height);
      batch.colors.push(brightness,brightness,brightness);
    }
    renderedFaces++;triangles+=points.length-2;
  }
  for(const [index,batch] of batches){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.colors,3));geometry.computeVertexNormals();
    smoothRampNormals(geometry);const material=materials[index];material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;mesh.userData.water=map.textures[index].name.startsWith('!');group.add(mesh);
  }
  scene.add(group);
  const skyCanvas=document.createElement('canvas');skyCanvas.width=1024;skyCanvas.height=512;const p=skyCanvas.getContext('2d'),gradient=p.createLinearGradient(0,0,0,512);
  gradient.addColorStop(0,'#3973a4');gradient.addColorStop(.48,'#9cc8e3');gradient.addColorStop(.62,'#e4eff2');gradient.addColorStop(1,'#b2c2c9');p.fillStyle=gradient;p.fillRect(0,0,1024,512);
  const sky=new THREE.CanvasTexture(skyCanvas);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;scene.background=sky;
  const generator=new THREE.PMREMGenerator(renderer),environment=generator.fromEquirectangular(sky);scene.environment=environment.texture;generator.dispose();
  scene.fog=new THREE.FogExp2(0xb8d1df,.000025);
  scene.add(new THREE.HemisphereLight(0xd5edff,0x66777e,.85));
  const sun=new THREE.DirectionalLight(0xffefd0,2.6);sun.position.set(-1800,-1800,6800);sun.target.position.set(0,0,-500);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-4300,right:4300,top:4300,bottom:-4300,near:100,far:13000});sun.shadow.normalBias=1;sun.shadow.bias=-.00012;scene.add(sun,sun.target);
  const update=time=>{for(const mesh of group.children)if(mesh.userData.water){mesh.material.map.offset.x=time*.011;mesh.material.map.offset.y=Math.sin(time*.12)*.035;}};
  return {group,sun,materials,renderedFaces,triangles,update};
}
