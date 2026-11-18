// Solmar Bay — pedestrians: people walking the sidewalks, fleeing from
// gunfire and fast cars, and getting knocked down when a car hits them.
// Also builds the low-poly person mesh the police reuse.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { clamp, dist2D } from './random.js';

export function buildPersonMesh(opts = {}) {
  const shirt = opts.shirt ?? 0xe84848;
  const pants = opts.pants ?? 0x2a3a55;
  const skin = opts.skin ?? 0xd8a880;
  const hat = opts.hat ?? null;
  const group = new THREE.Group();

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.62, 0.3),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 })
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.32),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 })
  );
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  if (hat) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.1, 0.36),
      new THREE.MeshStandardMaterial({ color: hat, roughness: 0.9 })
    );
    cap.position.y = 1.82;
    group.add(cap);
  }

  const legMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.95 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), legMat);
  legL.position.set(-0.14, 0.4, 0);
  legL.geometry.translate(0, -0.32, 0);
  legL.position.y = 0.76;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);

  const armMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), armMat);
  armL.geometry.translate(0, -0.24, 0);
  armL.position.set(-0.34, 1.38, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.34;
  group.add(armR);

  group.userData = { legL, legR, armL, armR, torso, head };
  return group;
}

export class Pedestrians {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.peds = []; // {group,x,z,heading,speed,state,ix,iz,fromIx,fromIz,target,fleeT,downT,walkPhase}
    this.onKnocked = null; // (ped, byPlayer) => void
  }

  spawn(count) {
    for (let i = 0; i < count; i++) this.spawnOne();
  }

  spawnOne(x, z) {
    const ix = x === undefined ? this.rng.int(0, 8) : Math.round(x / 52);
    const iz = z === undefined ? this.rng.int(0, 8) : Math.round(z / 52);
    const next = this.world.pickNext(ix, iz, ix, iz, null);
    const lane = this.world.lanePoint(ix, iz, next.ix, next.iz, 8.4);
    const px = x === undefined ? lane.x : x;
    const pz = z === undefined ? lane.z : z;
    const group = buildPersonMesh({
      shirt: this.rng.pick(PALETTE.pedShirt),
      pants: this.rng.pick([0x2a3a55, 0x3a3a3a, 0x5a4a3a, 0x2a4a2a]),
      skin: this.rng.pick([0xd8a880, 0xb08050, 0xe8c8a0, 0x8a5a38]),
      hat: this.rng.chance(0.25) ? this.rng.pick([0x282828, 0xc83232, 0xe8e8e8]) : null,
    });
    group.position.set(px, 0, pz);
    this.scene.add(group);
    const ped = {
      group,
      x: px,
      z: pz,
      heading: Math.atan2(next.ix - ix, next.iz - iz),
      speed: this.rng.range(1.1, 1.9),
      state: 'walk',
      ix: next.ix,
      iz: next.iz,
      fromIx: ix,
      fromIz: iz,
      target: { x: lane.x, z: lane.z },
      fleeT: 0,
      downT: 0,
      walkPhase: this.rng.range(0, 6),
      health: 40,
    };
    this.peds.push(ped);
    return ped;
  }

  // threat: {x, z, radius} from a gunshot; cars: list of cars to dodge.
  update(dt, t, threat, cars, playerCar) {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.state === 'down') {
        p.downT -= dt;
        p.group.rotation.x += (Math.PI / 2 - p.group.rotation.x) * Math.min(1, dt * 6);
        p.group.position.y += (-0.1 - p.group.position.y) * Math.min(1, dt * 4);
        if (p.downT <= 0) {
          this.scene.remove(p.group);
          this.peds.splice(i, 1);
          this.spawnOne();
        }
        continue;
      }
      // Flee from a fresh gunshot or a fast car.
      if (threat && dist2D(p.x, p.z, threat.x, threat.z) < threat.radius && p.state !== 'flee') {
        p.state = 'flee';
        p.fleeT = 3;
        p.heading = Math.atan2(p.x - threat.x, p.z - threat.z);
      }
      if (playerCar && Math.abs(playerCar.speed) > 5) {
        const d = dist2D(p.x, p.z, playerCar.x, playerCar.z);
        if (d < 7 && p.state !== 'flee') {
          p.state = 'flee';
          p.fleeT = 2.5;
          p.heading = Math.atan2(p.x - playerCar.x, p.z - playerCar.z);
        }
        if (d < 1.7 && Math.abs(playerCar.speed) > 3) {
          this.knockDown(p, true);
          continue;
        }
      }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        p.speed = 4.2;
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        if (p.fleeT <= 0) {
          p.state = 'walk';
          const near = this.world.nearestIntersection(p.x, p.z);
          p.ix = near.ix;
          p.iz = near.iz;
          p.fromIx = near.ix;
          p.fromIz = near.iz;
          const next = this.world.pickNext(near.ix, near.iz, near.ix, near.iz, null);
          const lane = this.world.lanePoint(near.ix, near.iz, next.ix, next.iz, 8.4);
          p.target = { x: lane.x, z: lane.z };
          p.ix = next.ix;
          p.iz = next.iz;
        }
      } else {
        const dx = p.target.x - p.x;
        const dz = p.target.z - p.z;
        const dist = Math.hypot(dx, dz);
        p.heading = Math.atan2(dx, dz);
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        if (dist < 3) {
          const fromIx = p.ix;
          const fromIz = p.iz;
          const next = this.world.pickNext(p.ix, p.iz, p.fromIx, p.fromIz, null);
          p.fromIx = fromIx;
          p.fromIz = fromIz;
          p.ix = next.ix;
          p.iz = next.iz;
          const lane = this.world.lanePoint(fromIx, fromIz, next.ix, next.iz, 8.4);
          p.target = { x: lane.x, z: lane.z };
        }
      }
      // Keep peds out of buildings and inside the map.
      this.world.resolveCircle(p, 0.5);
      p.x = clamp(p.x, -10, 420);
      p.z = clamp(p.z, -10, 460);

      // Walk cycle.
      p.walkPhase += dt * p.speed * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.55;
      const u = p.group.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.heading;
    }
  }

  knockDown(ped, byPlayer) {
    ped.state = 'down';
    ped.downT = 9;
    ped.speed = 0;
    if (this.onKnocked) this.onKnocked(ped, byPlayer);
  }

  // Everyone within radius of (x,z) that is still standing.
  near(x, z, radius) {
    return this.peds.filter((p) => p.state !== 'down' && dist2D(p.x, p.z, x, z) < radius);
  }
}
