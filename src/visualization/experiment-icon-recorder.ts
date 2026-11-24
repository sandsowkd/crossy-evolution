/** Bake the original game models into small transparent assets, never live homepage canvases. */
import * as THREE from "three";
import { Assets } from "./three/assets";

export async function renderExperimentIcons(sink: string, status: HTMLElement) {
  const assets = new Assets();
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(256,256); renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  try {
    await assets.ready;
    for(const [id,key,position] of [
      ["blue-car-left","blue_car",[3,2.5,4]],
      ["chicken","chicken",[3,2.5,4]],
      ["population-formation","population",[3,2.5,4]],
    ] as const) {
      status.textContent=`Rendering ${id}`;
      const scene=new THREE.Scene(), object=new THREE.Group();
      if(key === "population") {
        const size=new THREE.Box3().setFromObject(assets.chicken()).getSize(new THREE.Vector3());
        // A real 3x3 world-space formation, with neighboring silhouettes overlapping.
        for(let row=0;row<3;row++) for(let column=0;column<3;column++) {
          const chicken=assets.chicken();
          chicken.position.set((column-1)*size.x*.82,0,(row-1)*size.z*.82);
          object.add(chicken);
        }
      } else object.add(assets.node(key));
      const box=new THREE.Box3().setFromObject(object), center=box.getCenter(new THREE.Vector3());
      const size=box.getSize(new THREE.Vector3()), scale=1/Math.max(size.x,size.y,size.z);
      object.scale.setScalar(scale); object.position.copy(center.multiplyScalar(-scale));
      scene.add(object,new THREE.AmbientLight(0xffffff,1.8));
      const light=new THREE.DirectionalLight(0xffffff,1); light.position.set(-3,7,5); scene.add(light);
      const camera=new THREE.OrthographicCamera(-.8,.8,.8,-.8,.1,30);
      camera.position.set(position[0],position[1],position[2]); camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
      // Fit the complete model with a small transparent margin, regardless of its native axes.
      const projected=new THREE.Box3().setFromObject(object), corners: THREE.Vector3[]=[];
      for(const x of [projected.min.x,projected.max.x]) for(const y of [projected.min.y,projected.max.y])
        for(const z of [projected.min.z,projected.max.z]) corners.push(new THREE.Vector3(x,y,z).project(camera));
      const extent=Math.max(...corners.flatMap(point=>[Math.abs(point.x),Math.abs(point.y)]));
      camera.zoom=.94/extent; camera.updateProjectionMatrix();
      renderer.render(scene,camera);
      const blob=await new Promise<Blob>((resolve,reject)=>renderer.domElement.toBlob(value=>value?resolve(value):reject(new Error("Empty icon")),"image/png"));
      const response=await fetch(`${sink}/icon/${id}`,{method:"POST",body:blob});
      if(!response.ok) throw new Error(await response.text());
    }
    status.textContent="All 3 transparent icons complete.";
  } finally { renderer.dispose(); assets.dispose(); }
}
