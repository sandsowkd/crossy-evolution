/** Visual-only port of CrossyGame.ts / CrossyPlayer.ts / Row/*.ts.
 * Copyright (c) 2016-present Evan Bacon. MIT notice: docs/EVAN_BACON_LICENSE.txt.
 * Physics remains exclusively in core/. */
import * as THREE from "three";
import { Assets } from "./assets";
import { followCameraAxis } from "../camera-follow";
import { insideCamera } from "../scene-visibility";
import { raceEaglePose } from "../race-eagle";
import type { Support } from "../../core/types";
import { scheduledTrainSignal } from "../../core/variant-two-rules";
import type { Row } from "../../core/types";
import type { ReplayFacing } from "../../evolution/replay";
import { trainLightVisible, type TrainBounds } from "../train-light";
export type SceneRow = {
  index: number;
  type: "grass" | "road" | "rail" | "water";
  blocked: number[];
  upstream?: true;
  trainSchedule?: Row["trainSchedule"];
  speed?: number;
  length?: number;
};
export type SceneHazard = {
  id: string;
  row: number;
  x: number;
  length: number;
  speed: number;
  kind: "car" | "train";
  variant: string;
  upstream?: true;
  trainMiddles?: number;
};
export type SceneAgent = {
  id: number;
  x: number;
  row: number;
  alive: boolean;
  hop?: number;
  facing?: ReplayFacing;
  color?: string;
  /** One density glyph represents populationCount agents at this position. */
  opacity?: number;
  populationCount?: number;
  visualY?: number;
  deathReason?: string;
  eagle?: { remainingTicks: number; warning: boolean; captured: boolean; captureTicks: number; swoopFromTop?: boolean };
};
export type SceneSnapshot = {
  rows: SceneRow[];
  hazards: SceneHazard[];
  agents: SceneAgent[];
  signals: number[];
  tick?: number;
  focus: number;
  focusX?: number;
  supports?: Support[];
};

const STARTING_ROW = 8,
  GROUND = 0.4,
  CAMERA_EASING = 0.03;
export class WorldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly ready: Promise<void>;
  private scene = new THREE.Scene();
  // These are the original CrossyCamera constructor and init values, not a new isometric camera.
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -30, 30);
  private worldWithCamera = new THREE.Group();
  private world = new THREE.Group();
  private assets = new Assets();
  private rows = new Map<number, THREE.Group>();
  private hazards = new Map<string, THREE.Group>();
  private agents = new Map<number, THREE.Group>();
  private signals = new Map<number, THREE.Group[]>();
  private supports = new Map<string, THREE.Group>();
  private eagle = new THREE.Group();
  private eagleWings: THREE.Group[] = [];
  private eagleGeometry = new THREE.BoxGeometry(1, 1, 1);
  private eagleMaterials = [0x51352a, 0x76503a, 0xf4f0dc, 0xffb524].map(
    color => new THREE.MeshLambertMaterial({ color }),
  );
  private resize: ResizeObserver;
  private frame = 0;
  private target = 0;
  private targetX = 0;
  private snapFollow = true;
  private selected = 0;
  private loaded = false;
  private disposed = false;
  private lastSnapshot?: SceneSnapshot;
  constructor(
    private host: HTMLDivElement,
    onSelect?: (id: number) => void,
    private framing: { focusScreenY?: number; focusScreenX?: number; responsiveFollow?: boolean; zoom?: number } = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0x87c6ff);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(-1, 2.8, -2.9);
    this.camera.lookAt(0, 0, 0);
    this.camera.position.z = 1;
    this.worldWithCamera.position.z = -STARTING_ROW;
    this.worldWithCamera.add(this.world);
    // The upstream asset set has no eagle. This small voxel model is original.
    const block = (parent: THREE.Group, size: number[], pos: number[], material: number) => {
      const mesh = new THREE.Mesh(this.eagleGeometry, this.eagleMaterials[material]);
      mesh.scale.set(size[0], size[1], size[2]);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.castShadow = true;
      parent.add(mesh);
    };
    block(this.eagle, [.45, .45, .85], [0, 0, 0], 0);
    block(this.eagle, [.4, .4, .4], [0, .18, .48], 2);
    block(this.eagle, [.2, .16, .3], [0, .08, .76], 3);
    block(this.eagle, [.42, .12, .5], [0, -.06, -.58], 1);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.x = side * .2;
      block(wing, [1.15, .14, .65], [side * .55, 0, -.08], 1);
      block(wing, [.48, .12, .85], [side * 1.12, -.02, -.18], 0);
      this.eagle.add(wing);
      this.eagleWings.push(wing);
      block(this.eagle, [.08, .08, .08], [side * .2, .24, .64], 0);
    }
    this.eagle.visible = false;
    this.world.add(this.eagle);
    this.scene.add(this.worldWithCamera);
    this.world.add(new THREE.AmbientLight(0xffffff, 1.8));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(20, 30, 0.05);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {
      left: -15,
      right: 9,
      top: 6,
      bottom: -6,
      far: 100,
    });
    light.shadow.bias = 0.0001;
    this.scene.add(light);
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Original Crossy Road 3D world",
    );
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.renderer.domElement.addEventListener("click", (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = ray.intersectObjects([...this.agents.values()], true)[0];
      if (hit) {
        let o: THREE.Object3D = hit.object;
        while (o.parent && o.userData.id === undefined) o = o.parent;
        if (o.userData.id !== undefined) onSelect?.(o.userData.id);
      }
    });
    this.ready = this.assets.ready.then(() => {
      if (this.disposed) return;
      this.loaded = true;
      if (this.lastSnapshot) this.update(this.lastSnapshot);
    });
    let lastFrame = performance.now();
    const draw = (now = performance.now()) => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(draw);
      if (this.framing.responsiveFollow) {
        const seconds = Math.min(.1, (now - lastFrame) / 1000);
        this.world.position.z = followCameraAxis(this.world.position.z, -this.target, seconds);
        this.world.position.x = followCameraAxis(this.world.position.x, this.targetX, seconds);
      } else {
        this.world.position.z += (-this.target - this.world.position.z) * CAMERA_EASING;
        this.world.position.x += (this.targetX - this.world.position.x) * CAMERA_EASING;
      }
      lastFrame = now;
      this.renderer.render(this.scene, this.camera);
    };
    draw();
  }
  fit() {
    const width = this.host.clientWidth,
      height = this.host.clientHeight,
      scale = window.devicePixelRatio || 1;
    if (!width || !height) return;
    this.camera.left = -width * scale;
    this.camera.right = width * scale;
    this.camera.top = height * scale;
    this.camera.bottom = -height * scale;
    this.camera.zoom = this.framing.zoom ?? 400;
    this.camera.updateProjectionMatrix();
    // The source camera was framed for a tall mobile display. On short,
    // low-DPI desktop viewports its player falls below the screen. Shift only
    // the projection centre when necessary, preserving its angle and zoom.
    this.camera.updateMatrixWorld();
    const feet = new THREE.Vector3(0, GROUND, 0).project(this.camera);
    if (this.framing.focusScreenY !== undefined || feet.y < -0.7) {
      const offset = (feet.y - (this.framing.focusScreenY ?? -0.5)) * height * scale / this.camera.zoom;
      this.camera.top += offset;
      this.camera.bottom += offset;
      this.camera.updateProjectionMatrix();
    }
    // Race views also centre the followed chicken horizontally. The source
    // camera's lateral offset otherwise pushes it outside narrow phone screens.
    if (this.framing.focusScreenX !== undefined) {
      const offset = (feet.x - this.framing.focusScreenX) * width * scale / this.camera.zoom;
      this.camera.left += offset;
      this.camera.right += offset;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(width, height);
  }
  update(snapshot: SceneSnapshot) {
    this.lastSnapshot = snapshot;
    if (!this.loaded || this.disposed) return;
    const selected = snapshot.agents.find((a) => a.id === this.selected);
    this.target = selected?.row ?? snapshot.focus;
    this.targetX = Math.max(-3, Math.min(2, selected?.x ?? snapshot.focusX ?? 0));
    if (this.snapFollow) {
      this.world.position.set(this.targetX, 0, -this.target);
      this.snapFollow = false;
    } else if (this.framing.responsiveFollow) {
      // Constrain before culling old rows, including when an entire frame was slow.
      this.world.position.z = followCameraAxis(this.world.position.z, -this.target, 0);
      this.world.position.x = followCameraAxis(this.world.position.x, this.targetX, 0);
    }
    const visibleRows = [...snapshot.rows];
    // Original map's eight starting rows are visual scenery behind logical row zero.
    for (let r = -8; r < 0; r++)
      if (snapshot.focus < 6)
        visibleRows.push({
          index: r,
          type: "grass",
          blocked: r < -3 ? Array.from({ length: 9 }, (_, i) => i - 4) : [],
        });
    const visible = new Set(visibleRows.map((r) => r.index));
    for (const [r, g] of this.rows)
      if (!visible.has(r)) {
        this.world.remove(g);
        this.rows.delete(r);
        this.signals.delete(r);
      }
    for (const row of visibleRows)
      if (!this.rows.has(row.index)) {
        const g = new THREE.Group();
        g.position.z = row.index + STARTING_ROW;
        this.world.add(g);
        this.rows.set(row.index, g);
        const previous = visibleRows.find((r) => r.index === row.index - 1);
        const floor = this.assets.node(
          row.type === "grass"
            ? "grass0"
            : row.type === "road"
              ? `road${previous?.type === "road" ? 0 : 1}`
              : row.type === "water" ? "water" : "rail",
        );
        g.add(floor);
        if (row.type === "grass") {
          for (const coreX of row.blocked) {
            const x = -coreX,
              variant = Math.abs(coreX + row.index);
            const obstacle =
              variant % 4 === 0
                ? this.assets.rock(variant)
                : this.assets.tree(variant);
            obstacle.position.set(x, GROUND, 0);
            g.add(obstacle);
          }
          for (const side of [-1, 1])
            for (let x = 5; x <= 7; x++) {
              const tree = this.assets.tree((x + row.index + 100) % 4);
              tree.position.set(side * x, GROUND, 0);
              g.add(tree);
            }
        }
        if (row.type === "rail") {
          const lights = ["signal_off", "signal0", "signal1"].map((key) => {
            const obj = this.assets.node(key);
            obj.position.z = -0.5;
            obj.rotation.y = Math.PI;
            g.add(obj);
            return obj;
          });
          this.signals.set(row.index, lights);
        }
      }
    const ids = new Set(snapshot.hazards.map((h) => h.id));
    for (const [id, g] of this.hazards)
      if (!ids.has(id)) {
        this.world.remove(g);
        this.hazards.delete(id);
      }
    for (const h of snapshot.hazards) {
      let g = this.hazards.get(h.id);
      if (!g) {
        g =
          h.kind === "train"
            ? h.upstream ? this.assets.sourceTrain(h.trainMiddles ?? 2) : this.assets.train(h.length)
            : h.upstream ? this.assets.node(h.variant)
            : this.assets.vehicle(
                h.length,
                h.variant,
                Math.abs(h.row) + Number(h.id.split(":")[1] || 0),
              );
        if (h.kind === "train") {
          g.rotation.y = h.upstream || h.speed < 0 ? 0 : Math.PI;
          const box = new THREE.Box3().setFromObject(g);
          g.userData.crossingBounds = {min: box.min.x, max: box.max.x} satisfies TrainBounds;
        }
        this.hazards.set(h.id, g);
        this.world.add(g);
      }
      g.position.set(
        -h.x,
        h.kind === "train" ? GROUND : 0.25,
        h.row + STARTING_ROW + (h.kind === "train" ? 0.1 : 0),
      );
      g.rotation.y =
        h.upstream ? (h.kind === "train" ? 0 : h.speed < 0 ? Math.PI / 2 : -Math.PI / 2) : h.kind === "train"
          ? h.speed < 0
            ? 0
            : Math.PI
          : h.speed < 0
            ? Math.PI / 2
            : -Math.PI / 2;
    }
    for (const [r, lights] of this.signals) {
      const row = snapshot.rows.find(row => row.index === r);
      const train = snapshot.hazards.find(hazard => hazard.row === r && hazard.kind === "train");
      const bounds = train && this.hazards.get(train.id)?.userData.crossingBounds as TrainBounds | undefined;
      const active = trainLightVisible(snapshot.signals.includes(r), train, bounds),
        phase = row?.trainSchedule ? scheduledTrainSignal(row as Row, snapshot.tick ?? 0).phase :
          Math.floor(((snapshot.tick ?? 0) - (row?.upstream ? 138 : 0)) / 12) % 2;
      lights[0].visible = !active;
      lights[1].visible = active && phase === 0;
      lights[2].visible = active && phase === 1;
    }
    const agentIds = new Set(snapshot.agents.map((a) => a.id));
    for (const [id, g] of this.agents)
      if (!agentIds.has(id)) {
        this.world.remove(g);
        this.releaseAgent(g);
        this.agents.delete(id);
      }
    for (const a of snapshot.agents) {
      let g = this.agents.get(a.id);
      if (!g) {
        g = new THREE.Group();
        const model = this.assets.chicken();
        if (a.opacity !== undefined) {
          const materials: THREE.Material[] = [];
          model.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            const clone = (material: THREE.Material) => {
              const own = material.clone();
              own.transparent = true;
              materials.push(own);
              return own;
            };
            child.material = Array.isArray(child.material) ? child.material.map(clone) : clone(child.material);
          });
          g.userData.densityMaterials = materials;
        }
        g.add(model);
        g.userData.id = a.id;
        g.rotation.y = Math.PI;
        g.userData.previous = { x: -a.x, row: a.row };
        this.agents.set(a.id, g);
        this.world.add(g);
      }
      if (a.opacity !== undefined) {
        for (const material of (g.userData.densityMaterials ?? []) as THREE.Material[]) {
          material.opacity = a.opacity;
          material.depthWrite = a.opacity === 1;
        }
        // A faint singleton must not cast the same dark shadow as a dense flock.
        g.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = a.opacity === 1; });
      }
      const prev = g.userData.previous as { x: number; row: number },
        dx = -a.x - prev.x,
        dr = a.row - prev.row;
      if (a.facing !== undefined) {
        g.rotation.y = a.facing === null ? Math.PI : {UP: 0, DOWN: Math.PI, LEFT: Math.PI / 2, RIGHT: -Math.PI / 2}[a.facing];
      } else if (Math.abs(dx) > 1e-5)
        g.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
      else if (Math.abs(dr) > 1e-5) g.rotation.y = dr > 0 ? 0 : Math.PI;
      const ground = (r: number) => {
        const type = snapshot.rows.find((row) => row.index === r)?.type;
        return type === "road" ? 0.3 : type === "rail" ? 0.5 : GROUND;
      };
      const fraction = a.row - Math.floor(a.row),
        height =
          ground(Math.floor(a.row)) * (1 - fraction) +
          ground(Math.ceil(a.row)) * fraction;
      g.position.set(
        -a.x,
        (a.visualY ?? height) + Math.sin((a.hop ?? 0) * Math.PI) * 0.5,
        a.row + STARTING_ROW,
      );
      // CrossyPlayer's squash on death; no renderer callback alters the core state.
      const captured = a.eagle?.captured;
      const capture = Math.min(1, (a.eagle?.captureTicks ?? 0) / 60);
      const swoop = a.eagle?.swoopFromTop ? raceEaglePose(a.eagle.captureTicks) : undefined;
      g.visible = swoop ? !swoop.finished : !captured || capture < .95;
      g.scale.set(1, a.alive || captured ? 1 : 0.2, 1);
      if (a.deathReason === "water") { g.scale.set(1,1,1); g.position.y = -.2; }
      if (swoop) g.position.y += swoop.lift;
      else if (captured && capture > .35) g.position.y += (capture - .35) * 13;
      g.userData.previous = { x: -a.x, row: a.row };
    }
    const supportIds = new Set((snapshot.supports ?? []).map(p => p.id));
    for (const [id, object] of this.supports) if (!supportIds.has(id)) { this.world.remove(object); this.supports.delete(id); }
    for (const p of snapshot.supports ?? []) {
      let object = this.supports.get(p.id);
      if (!object) { object = this.assets.node(p.kind === "lily" ? "lily" : `log${p.variant}`); this.supports.set(p.id,object); this.world.add(object); }
      object.position.set(-p.x, p.kind === "lily" ? .125 : -.1, p.row + STARTING_ROW);
      if (p.kind === "lily") object.rotation.y = Math.sin((snapshot.tick ?? 0) / 180) * .5;
    }
    const target = selected ?? snapshot.agents[0];
    const eagle = target?.eagle;
    this.eagle.visible = Boolean(eagle && (eagle.captured || (target.alive && eagle.warning)));
    if (target && eagle && this.eagle.visible) {
      const t = (snapshot.tick ?? 0) / 60;
      const capture = Math.min(1, eagle.captureTicks / 60);
      const swoop = eagle.swoopFromTop ? raceEaglePose(eagle.captureTicks) : undefined;
      if (swoop) {
        this.eagle.visible = !swoop.finished;
        this.eagle.position.set(-target.x + swoop.x, GROUND + swoop.height, target.row + STARTING_ROW + swoop.row);
      } else this.eagle.position.set(
        -target.x + (eagle.captured ? (1 - Math.min(1, capture / .35)) * 7 : Math.cos(t * 3) * 2.5),
        eagle.captured ? .9 + Math.abs(capture - .35) * 13 : 4.5,
        target.row + STARTING_ROW + (eagle.captured ? 0 : Math.sin(t * 3)),
      );
      this.eagle.rotation.y = eagle.captured ? -Math.PI / 2 : t * 3;
      this.eagleWings.forEach((wing, i) => {
        wing.rotation.z = (i === 0 ? -1 : 1) * Math.sin(t * 12 + capture * 15) * .35;
      });
    }
  }
  select(id: number) {
    this.selected = id;
  }
  /** Used only by the race's AI inset; existing replay cameras are unchanged. */
  agentOnScreen(id: number) {
    const agent = this.agents.get(id);
    if (!agent?.visible) return false;
    agent.updateWorldMatrix(true, false);
    return insideCamera(agent.getWorldPosition(new THREE.Vector3()).project(this.camera));
  }
  private releaseAgent(group: THREE.Group) {
    for (const material of (group.userData.densityMaterials ?? []) as THREE.Material[]) material.dispose();
  }
  clear() {
    this.snapFollow = true;
    for (const group of this.agents.values()) this.releaseAgent(group);
    for (const map of [this.rows, this.hazards, this.agents, this.supports]) {
      for (const g of map.values()) this.world.remove(g);
      map.clear();
    }
    this.signals.clear();
    this.eagle.visible = false;
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    for (const group of this.agents.values()) this.releaseAgent(group);
    this.assets.dispose();
    this.eagleGeometry.dispose();
    this.eagleMaterials.forEach(material => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
