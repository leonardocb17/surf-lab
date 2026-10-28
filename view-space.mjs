// Physics uses X forward, Y right, Z up. Reflect Y for Three.js's
// right-handed world so the camera, ramp faces, and input share screen sides.
export function toRenderPoint(x,y,z){return [x,-y,z];}
export function toRenderForward(yaw,pitch){
  return toRenderPoint(Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch));
}
