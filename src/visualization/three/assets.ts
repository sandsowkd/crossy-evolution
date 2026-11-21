/**
 * Browser adapter for Evan Bacon's original Expo-Crossy-Road assets.
 * Original source/asset attribution: public/upstream/LICENSE.txt and docs/ATTRIBUTION.md.
 * The OBJ geometry and PNG textures are copied verbatim, not recreated.
 */
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const ROOT = "/upstream/models/";
type Descriptor = {
  key: string;
  model: string;
  texture: string;
  cast?: boolean;
  receive?: boolean;
};
const descriptors: Descriptor[] = [
  {
    key: "chicken",
    model: "characters/chicken/0.obj",
    texture: "characters/chicken/0.png",
    cast: true,
    receive: true,
  },
  ...[0, 1].map((i) => ({
    key: `grass${i}`,
    model: "environment/grass/model.obj",
    texture: `environment/grass/${i ? "dark" : "light"}-grass.png`,
    receive: true,
  })),
  ...[0, 1].map((i) => ({
    key: `road${i}`,
    model: "environment/road/model.obj",
    texture: `environment/road/${i ? "blank" : "stripes"}-texture.png`,
    receive: true,
  })),
  {
    key: "rail",
    model: "environment/railroad/0.obj",
    texture: "environment/railroad/0.png",
    receive: true,
  },
  ...[{key:"water", folder:"river"}, {key:"lily", folder:"lily_pad"}].map(d => ({
    key:d.key, model:`environment/${d.folder}/0.obj`, texture:`environment/${d.folder}/0.png`, receive:true,
  })),
  ...[0,1,2,3].map(i => ({key:`log${i}`,model:`environment/log/${i}/0.obj`,texture:`environment/log/${i}/0.png`,cast:true,receive:true})),
  ...[0, 1, 2, 3].map((i) => ({
    key: `tree${i}`,
    model: `environment/tree/${i}/0.obj`,
    texture: `environment/tree/${i}/0.png`,
    cast: true,
  })),
  ...[0, 1].map((i) => ({
    key: `rock${i}`,
    model: `environment/boulder/${i}/0.obj`,
    texture: `environment/boulder/${i}/0.png`,
    cast: true,
  })),
  ...[
    "police_car",
    "blue_car",
    "blue_truck",
    "green_car",
    "orange_car",
    "purple_car",
    "red_truck",
    "taxi",
  ].map((key) => ({
    key,
    model: `vehicles/${key}/0.obj`,
    texture: `vehicles/${key}/0.png`,
    cast: true,
    receive: true,
  })),
  ...["front", "middle", "back"].map((key) => ({
    key: `train_${key}`,
    model: `vehicles/train/${key}/0.obj`,
    texture: `vehicles/train/${key}/0.png`,
    cast: true,
    receive: true,
  })),
  {
    key: "signal_off",
    model: "environment/train_light/inactive/0.obj",
    texture: "environment/train_light/inactive/0.png",
  },
  ...[0, 1].map((i) => ({
    key: `signal${i}`,
    model: `environment/train_light/active/${i}/0.obj`,
    texture: `environment/train_light/active/${i}/0.png`,
  })),
];

export class Assets {
  private templates = new Map<string, THREE.Group>();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private disposed = false;
  readonly ready: Promise<void>;
  constructor() {
    const loader = new OBJLoader(),
      textures = new THREE.TextureLoader();
    this.ready = Promise.all(
      descriptors.map(async (d) => {
        const [response, texture] = await Promise.all([
          fetch(ROOT + d.model),
          textures.loadAsync(ROOT + d.texture),
        ]);
        if (!response.ok)
          throw new Error(`Original model could not load: ${d.model}`);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        const material = new THREE.MeshLambertMaterial({ map: texture });
        const object = loader.parse(await response.text());
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const old = Array.isArray(child.material)
              ? child.material
              : [child.material];
            old.forEach((m) => m.dispose());
            child.material = material;
            child.castShadow = d.cast ?? false;
            child.receiveShadow = d.receive ?? false;
            this.geometries.add(child.geometry);
          }
        });
        this.materials.add(material);
        this.textures.add(texture);
        this.templates.set(d.key, object);
      }),
    ).then(() => {
      if (this.disposed) this.release();
    });
  }
  node(key: string) {
    const template = this.templates.get(key);
    if (!template) throw new Error(`Original model ${key} is not loaded`);
    return template.clone(true);
  }
  chicken() {
    const g = this.node("chicken");
    // CrossyPlayer.setCharacter: scale longest side to one, bottom aligned to groundLevel.
    const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    g.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
    return g;
  }
  tree(variant = 0) {
    return this.node(`tree${variant % 4}`);
  }
  rock(variant = 0) {
    return this.node(`rock${variant % 2}`);
  }
  vehicle(length: number, type: string, variant: number) {
    const names =
      type === "truck"
        ? ["blue_truck", "red_truck"]
        : [
            "police_car",
            "blue_car",
            "green_car",
            "orange_car",
            "purple_car",
            "taxi",
          ];
    const model = this.node(names[variant % names.length]);
    // Only longitudinal scale adapts the original mesh to the existing simulator hitbox.
    const size = new THREE.Box3()
      .setFromObject(model)
      .getSize(new THREE.Vector3());
    model.scale.z = length / size.z;
    const group = new THREE.Group();
    group.add(model);
    return group;
  }
  train(length: number) {
    const g = new THREE.Group();
    let offset = -length / 2;
    for (const [key, fraction] of [
      ["front", 0.34],
      ["middle", 0.32],
      ["back", 0.34],
    ] as const) {
      const part = this.node(`train_${key}`),
        span = length * fraction,
        size = new THREE.Box3()
          .setFromObject(part)
          .getSize(new THREE.Vector3());
      part.scale.x = span / size.x;
      part.position.x = offset + span / 2;
      g.add(part);
      offset += span;
    }
    return g;
  }
  sourceTrain(middles: number) {
    const group = new THREE.Group();
    group.add(this.node("train_front"));
    for (let i = 0; i < middles; i++) {
      const middle = this.node("train_middle"); middle.position.x = (i + 1) * 5; group.add(middle);
    }
    const back = this.node("train_back"); back.position.x = (middles + 1) * 5; group.add(back);
    return group;
  }
  private release() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.templates.clear();
  }
  dispose() {
    this.disposed = true;
    this.release();
  }
}
