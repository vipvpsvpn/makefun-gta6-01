// Solmar Bay — vehicles: procedural car meshes, arcade driving physics,
// entering and exiting cars, and the registry every system shares.
import * as THREE from 'three';
import { CAR } from './config.js';
import { clamp } from './random.js';

const TYPES = {
  sedan: { len: 4.4, wid: 1.9, bodyH: 0.72, cabH: 0.62, max: CAR.MAX_SPEED },
  taxi: { len: 4.4, wid: 1.9, bodyH: 0.72, cabH: 0.62, max: CAR.MAX_SPEED },
  sports: { len: 4.6, wid: 2.0, bodyH: 0.55, cabH: 0.5, max: CAR.SPORT_MAX },
  van: { len: 5.2, wid: 2.1, bodyH: 1.15, cabH: 0.9, max: CAR.MAX_SPEED * 0.82 },
};

export function buildCarMesh(type, colorHex) {
  const spec = TYPES[type] || TYPES.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a38, roughness: 0.15, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.len, spec.bodyH, spec.wid), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.len * 0.5, spec.cabH, spec.wid * 0.88), glass);
  cabin.position.set(-spec.len * 0.05, 0.55 + spec.bodyH / 2 + spec.cabH / 2, 0);
  cabin.castShadow = true;
  group.add(cabin);

  // Bumpers.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, spec.wid), dark);
  bumperF.position.set(spec.len / 2, 0.42, 0);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.x = -spec.len / 2;
  group.add(bumperR);

  // Headlights and taillights.
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0xfff2b0, emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc02020, emissive: 0xa01010, emissiveIntensity: 0.8 });
  for (const sz of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.42), lightMat);
    head.position.set(spec.len / 2 + 0.02, 0.62, sz);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.42), tailMat);
    tail.position.set(-spec.len / 2 - 0.02, 0.62, sz);
    group.add(tail);
  }

  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffe040, emissive: 0xa08000, emissiveIntensity: 0.5 })
    );
    sign.position.set(0, 0.55 + spec.bodyH / 2 + spec.cabH + 0.12, 0);
    group.add(sign);
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, spec.wid * 0.95), dark);
    spoiler.position.set(-spec.len / 2 + 0.1, 1.05, 0);
    group.add(spoiler);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 1.2), dark);
    bar.position.set(0, 0.55 + spec.bodyH / 2 + spec.cabH + 0.1, 0);
    group.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 })
    );
    red.position.set(0, 0.55 + spec.bodyH / 2 + spec.cabH + 0.2, -0.3);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x1020ff, emissiveIntensity: 2 })
    );
    blue.position.set(0, 0.55 + spec.bodyH / 2 + spec.cabH + 0.2, 0.3);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const wheels = [];
  for (const [wx, wz] of [
    [spec.len * 0.32, spec.wid / 2],
    [spec.len * 0.32, -spec.wid / 2],
    [-spec.len * 0.32, spec.wid / 2],
    [-spec.len * 0.32, -spec.wid / 2],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.spec = spec;
  return group;
}

export class VehicleManager {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.cars = [];
    this.playerCar = null;
  }

  addCar(type, colorHex, x, z, heading, opts = {}) {
    const group = buildCarMesh(type, colorHex);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    const car = {
      group,
      type,
      colorHex,
      x,
      z,
      heading,
      speed: 0,
      steer: 0,
      maxSpeed: (TYPES[type] || TYPES.sedan).max,
      driver: opts.driver || null, // 'player' | 'traffic' | 'police' | null (parked)
      parked: opts.parked || false,
      hp: 100,
      honkT: 0,
    };
    this.cars.push(car);
    return car;
  }

  spawnParked(count) {
    const colors = [0xc83232, 0x3268c8, 0xe8c832, 0x38a868, 0xe8e8e8, 0x282828, 0xd87828, 0x38b8c8];
    const types = ['sedan', 'sedan', 'sedan', 'sports', 'van'];
    for (let i = 0; i < count; i++) {
      const horizontal = this.rng.chance(0.5);
      const road = this.rng.int(0, 8);
      const along = this.rng.range(30, 380);
      const lane = this.rng.chance(0.5) ? 4.6 : -4.6;
      const x = horizontal ? along : road * 52 + lane;
      const z = horizontal ? road * 52 + lane : along;
      const heading = horizontal ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : lane > 0 ? Math.PI : 0;
      // Keep the spawn plaza clear.
      if (Math.abs(x - 208) < 14 && Math.abs(z - 208) < 14) continue;
      this.addCar(this.rng.pick(types), this.rng.pick(colors), x, z, heading, { parked: true });
    }
  }

  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  enterCar(car) {
    if (this.playerCar) return false;
    car.driver = 'player';
    car.parked = false;
    this.playerCar = car;
    return true;
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return null;
    car.driver = null;
    car.parked = true;
    car.speed = 0;
    this.playerCar = null;
    // Step out on the right side of the car: right of heading
    // (sin h, cos h) is (-cos h, sin h).
    const sideX = car.x - Math.cos(car.heading) * 1.9;
    const sideZ = car.z + Math.sin(car.heading) * 1.9;
    return { x: sideX, z: sideZ };
  }

  // Arcade driving for the player's car only. Traffic and police steer
  // their own cars through their update functions.
  updatePlayerCar(dt, input, audio) {
    const car = this.playerCar;
    if (!car) return;
    const throttle = input.down('KeyW') || input.down('ArrowUp') ? 1 : 0;
    const brake = input.down('KeyS') || input.down('ArrowDown') ? 1 : 0;
    const steerIn = (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) - (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
    const forward = car.speed >= 0 ? 1 : -1;

    if (throttle) car.speed += CAR.ACCEL * dt;
    if (brake) {
      if (car.speed > 0.5) car.speed -= CAR.BRAKE * dt;
      else car.speed -= CAR.ACCEL * 0.55 * dt; // reverse
    }
    if (!throttle && !brake) {
      car.speed -= Math.sign(car.speed) * 6 * dt;
      if (Math.abs(car.speed) < 0.2) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CAR.REVERSE_MAX, car.maxSpeed);

    const steerTarget = steerIn * 0.55 * clamp(Math.abs(car.speed) / 8, 0, 1);
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    car.heading += car.steer * CAR.STEER * forward * dt * clamp(Math.abs(car.speed) / 6, 0, 1);

    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Note: heading 0 faces +z; mesh forward is +x, so the group is
    // rotated by heading - PI/2 below. Keep x/z as the source of truth.

    // Buildings stop the car with a thud.
    if (this.world.resolveCircle(car, 1.7)) {
      const hitSpeed = Math.abs(car.speed);
      car.speed *= 0.35;
      if (hitSpeed > 8 && audio) audio.punch();
    }
    // World bounds.
    car.x = clamp(car.x, -14, 430);
    car.z = clamp(car.z, -14, 470);

    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading - Math.PI / 2; // mesh +x forward
    const wheels = car.group.userData.wheels;
    if (wheels) {
      for (const w of wheels) w.rotation.z -= (car.speed * dt) / 0.36;
    }
    if (audio) audio.setEngine(Math.abs(car.speed) / car.maxSpeed, true);
  }

  // Simple pairwise push so cars do not overlap each other.
  separateCars() {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.4 && d > 0.01) {
          const push = (3.4 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
          if (a.driver === 'player' || b.driver === 'player') {
            a.speed *= 0.7;
            b.speed *= 0.7;
          }
        }
      }
    }
  }

  syncMeshes() {
    for (const car of this.cars) {
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading - Math.PI / 2;
    }
  }

  // Flash the police light bar of every police car.
  updatePoliceLights(t) {
    const on = Math.sin(t * 14) > 0;
    for (const car of this.cars) {
      if (car.type !== 'police') continue;
      const red = car.group.userData.lightRed;
      const blue = car.group.userData.lightBlue;
      if (!red || !blue) continue;
      red.material.emissiveIntensity = on ? 3 : 0.2;
      blue.material.emissiveIntensity = on ? 0.2 : 3;
    }
  }
}
