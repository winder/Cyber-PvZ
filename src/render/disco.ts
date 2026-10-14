import {
  Color3, Constants, InstancedMesh, Matrix, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer,
} from '@babylonjs/core';
import type { BlockCharacter } from './blockModel';

// The Disco boss. Looks only (ADR 0002): a mirror ball bounces around inside
// the boss's body. You see it as a glow through the skin, the body lights up
// in its color wherever it is, and beams of colored light sweep out of it.

/** Beams of light thrown out by the ball. */
const BEAMS = 12;
/** How fast the colors go round (turns of the color wheel per second). */
const HUE_SPEED = 0.35;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const hue = (turns: number, value = 1) => Color3.FromHSV((((turns % 1) + 1) % 1) * 360, 0.85, value);

export class DiscoBall {
  /** The ball, in the boss's own space (so it rides along with the boss). */
  private ball: TransformNode;
  private spinner: TransformNode;
  private orb: Mesh;
  private orbMat: StandardMaterial;
  private beamMats: StandardMaterial[] = [];
  /** A see-through copy of each body part that lights up as the ball comes near. */
  private shells: { mesh: Mesh; mat: StandardMaterial }[] = [];
  private light: PointLight;
  /** The box it bounces around in, and how fast it's going. */
  private min: Vector3;
  private max: Vector3;
  private velocity: Vector3;
  private reach: number;
  private time = Math.random() * 10;

  constructor(scene: Scene, name: string, character: BlockCharacter) {
    const root = character.root;

    // The body's size, in the boss's own space.
    root.computeWorldMatrix(true);
    const toLocal = Matrix.Invert(root.getWorldMatrix());
    let lo = new Vector3(Infinity, Infinity, Infinity), hi = lo.scale(-1);
    for (const m of character.meshes) {
      m.computeWorldMatrix(true);
      for (const corner of m.getBoundingInfo().boundingBox.vectorsWorld) {
        const p = Vector3.TransformCoordinates(corner, toLocal);
        lo = Vector3.Minimize(lo, p);
        hi = Vector3.Maximize(hi, p);
      }
    }
    // Stay inside the trunk: not out along the arms, or down in the feet.
    const center = lo.add(hi).scale(0.5), size = hi.subtract(lo);
    const half = new Vector3(size.x * 0.2, size.y * 0.34, size.z * 0.22);
    center.y = lo.y + size.y * 0.55;
    this.min = center.subtract(half);
    this.max = center.add(half);
    this.reach = size.y * 0.5;
    const radius = size.y * 0.075;
    const sign = () => (Math.random() < 0.5 ? -1 : 1);
    this.velocity = new Vector3(sign() * size.y * rand(0.5, 0.7), sign() * size.y * rand(0.8, 1.1), sign() * size.y * rand(0.4, 0.6));

    this.ball = new TransformNode(`${name}-disco`, scene);
    this.ball.parent = root;
    this.ball.position.copyFrom(center);
    this.spinner = new TransformNode(`${name}-discoSpin`, scene);
    this.spinner.parent = this.ball;

    // The mirror ball: faceted, and drawn over the body so it shows through.
    this.orb = MeshBuilder.CreateIcoSphere(`${name}-discoBall`, { radius, subdivisions: 2, flat: true }, scene);
    this.orb.parent = this.spinner;
    this.orb.isPickable = false;
    this.orbMat = new StandardMaterial(`${name}-discoBallMat`, scene);
    this.orbMat.diffuseColor = Color3.White();
    this.orbMat.specularColor = Color3.White();
    this.orbMat.specularPower = 24;
    this.orbMat.alpha = 0.9;
    this.orbMat.depthFunction = Constants.ALWAYS;
    this.orbMat.disableDepthWrite = true;
    this.orb.material = this.orbMat;

    // Beams: narrow and bright at the ball, widening and fading out as they go.
    // Each points its own way and the whole lot turns with the ball.
    for (let i = 0; i < 3; i++) {
      const m = new StandardMaterial(`${name}-discoBeam${i}`, scene);
      m.disableLighting = true;
      m.alpha = 0.3;
      m.alphaMode = Constants.ALPHA_ADD;
      m.backFaceCulling = false;
      m.disableDepthWrite = true;
      this.beamMats.push(m);
    }
    const length = size.y * 1.5;
    for (let i = 0; i < BEAMS; i++) {
      const aim = new TransformNode(`${name}-discoAim${i}`, scene);
      aim.parent = this.spinner;
      // Spread evenly over a sphere (a spiral from pole to pole).
      const up = 1 - (2 * (i + 0.5)) / BEAMS;
      aim.rotation.set(Math.acos(up), i * 2.4, 0);
      const beam = MeshBuilder.CreateCylinder(`${name}-discoBeam${i}`, {
        height: length, diameterTop: length * 0.05, diameterBottom: radius * 0.3, tessellation: 8, cap: Mesh.NO_CAP,
      }, scene);
      const points = beam.getVerticesData(VertexBuffer.PositionKind)!;
      const colors: number[] = [];
      for (let v = 0; v < points.length; v += 3) colors.push(1, 1, 1, points[v + 1] < 0 ? 1 : 0);
      beam.setVerticesData(VertexBuffer.ColorKind, colors);
      beam.hasVertexAlpha = true;
      beam.parent = aim;
      beam.position.y = length / 2;
      beam.isPickable = false;
      beam.material = this.beamMats[i % this.beamMats.length];
      // Soft shafts of light, not neon tubes.
      scene.getGlowLayerByName('glow')?.addExcludedMesh(beam);
    }

    for (const part of character.meshes) {
      const source = part instanceof InstancedMesh ? part.sourceMesh : null;
      if (!source) continue;
      const mesh = source.clone(`${part.name}-discoShell`, part);
      mesh.position.setAll(0);
      mesh.rotation.setAll(0);
      mesh.rotationQuaternion = null;
      mesh.scaling.setAll(1);
      mesh.isPickable = false;
      mesh.setEnabled(true);
      const mat = new StandardMaterial(`${part.name}-discoShellMat`, scene);
      mat.disableLighting = true;
      mat.diffuseColor = Color3.Black();
      mat.specularColor = Color3.Black();
      // Only where the skin has something painted.
      const skin = (source.material as StandardMaterial | null)?.diffuseTexture;
      if (skin) mat.opacityTexture = skin;
      mat.alphaMode = Constants.ALPHA_ADD;
      mat.alpha = 0;
      mat.backFaceCulling = false;
      mat.disableDepthWrite = true;
      mat.zOffset = -2;
      mesh.material = mat;
      this.shells.push({ mesh, mat });
    }

    // Colored light spilling onto the ground and whatever's nearby.
    this.light = new PointLight(`${name}-discoLight`, Vector3.Zero(), scene);
    this.light.parent = this.ball;
    this.light.range = 9;
    this.light.intensity = 1.4;
    this.light.specular = Color3.Black();

    this.tick(0);
  }

  /** Every frame while the boss lives. */
  tick(dt: number): void {
    this.time += dt;
    const p = this.ball.position, v = this.velocity;
    p.addInPlace(v.scale(dt));
    // Bounce off the inside of the body, never quite the same way twice.
    for (const axis of ['x', 'y', 'z'] as const) {
      if (p[axis] < this.min[axis] && v[axis] < 0) {
        p[axis] = this.min[axis];
        v[axis] *= -rand(0.85, 1.15);
      } else if (p[axis] > this.max[axis] && v[axis] > 0) {
        p[axis] = this.max[axis];
        v[axis] *= -rand(0.85, 1.15);
      }
      // Keep it lively: the nudges above mustn't add up to a crawl or a blur.
      const span = this.max[axis] - this.min[axis];
      const speed = Math.min(span * 4, Math.max(span * 1.2, Math.abs(v[axis])));
      v[axis] = Math.sign(v[axis] || 1) * speed;
    }
    this.spinner.rotation.y = this.time * 2.2;
    this.spinner.rotation.x = Math.sin(this.time * 0.7) * 0.5;

    const turns = this.time * HUE_SPEED;
    const color = hue(turns);
    // The ball flickers as its mirrors catch the light.
    const flicker = 0.75 + 0.25 * Math.sin(this.time * 31);
    this.orbMat.emissiveColor = Color3.Lerp(color, Color3.White(), 0.45).scale(flicker);
    this.beamMats.forEach((m, i) => {
      m.emissiveColor = hue(turns + i / this.beamMats.length);
    });
    this.light.diffuse = color;

    // Body parts light up in the ball's color, brightest where it is.
    const at = this.ball.getAbsolutePosition();
    const reach = this.reach * (this.ball.parent as TransformNode).scaling.y;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 9);
    for (const { mesh, mat } of this.shells) {
      const d = Vector3.Distance(mesh.getBoundingInfo().boundingSphere.centerWorld, at);
      const near = Math.max(0, 1 - d / reach);
      mat.emissiveColor = color;
      mat.alpha = (0.08 + 0.45 * near * near) * pulse;
    }
  }

  dispose(): void {
    for (const { mesh, mat } of this.shells) {
      mesh.dispose();
      mat.dispose();
    }
    this.light.dispose();
    this.ball.dispose();
    this.orbMat.dispose();
    for (const m of this.beamMats) m.dispose();
  }
}
