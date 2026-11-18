// Solmar Bay — the player on foot: third-person movement, jumping,
// walk animation, and the chase camera (on foot and in a car).
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { buildPersonMesh } from './pedestrians.js';
import { clamp } from './random.js';

export class Player {
  constructor(scene, world, spawn) {
    this.world = world;
    this.group = buildPersonMesh({ shirt: 0x2a8a8a, pants: 0x2a3a55, skin: 0xd8a880, hat: 0x222228 });
    scene.add(this.group);
    this.x = spawn.x;
    this.z = spawn.z;
    this.y = 0;
    this.vy = 0;
    this.heading = spawn.heading;
    this.camYaw = spawn.heading;
    this.camPitch = 0.45; // 0 low .. 1 high
    this.inCar = false;
    this.walkPhase = 0;
    this.moveSpeed = 0;
    this.aiming = false;
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  teleport(x, z, heading) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    if (heading !== undefined) {
      this.heading = heading;
      this.camYaw = heading;
    }
  }

  update(dt, input, camera, weapon) {
    const mouse = input.consumeMouse();
    this.camYaw -= mouse.dx * 0.0028;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0016, 0.05, 1);
    this.aiming = weapon === 'pistol';

    if (this.inCar) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Movement relative to the camera.
    const axis = input.moveAxis();
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * -axis.z + rx * axis.x;
    let mz = fz * -axis.z + rz * axis.x;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) {
      mx /= mLen;
      mz /= mLen;
    }
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const targetSpeed = mLen > 0.05 ? (running ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED) : 0;
    this.moveSpeed += (targetSpeed - this.moveSpeed) * Math.min(1, dt * 10);
    this.x += mx * this.moveSpeed * dt;
    this.z += mz * this.moveSpeed * dt;

    // Face where we go, or face the camera while aiming the pistol.
    if (this.aiming) {
      this.heading = this.camYaw;
    } else if (this.moveSpeed > 0.5) {
      this.heading = Math.atan2(mx, mz);
    }

    // Jump and gravity.
    if (input.hit('Space') && this.y <= 0.01) {
      this.vy = PLAYER.JUMP_SPEED;
    }
    this.vy -= PLAYER.GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
    }

    this.world.resolveCircle(this, PLAYER.RADIUS);
    this.x = clamp(this.x, -14, 430);
    this.z = clamp(this.z, -14, 470);

    // Walk cycle.
    this.walkPhase += dt * this.moveSpeed * 2.4;
    const swing = Math.sin(this.walkPhase) * (this.moveSpeed > 0.5 ? 0.6 : 0);
    const u = this.group.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
  }

  // Third-person camera, pulled in when a building blocks the view.
  updateCamera(dt, camera, car) {
    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    let dist;
    let height;
    if (car) {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      target.set(car.x - fx * 8.5, 3.4, car.z - fz * 8.5);
      look.set(car.x + fx * 6, 1.3, car.z + fz * 6);
      dist = 8.5;
      height = 3.4;
    } else {
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      dist = 6.4 - this.camPitch * 1.6;
      height = 1.6 + this.camPitch * 2.6;
      target.set(this.x - fx * dist, this.y + height, this.z - fz * dist);
      look.set(this.x + fx * 1.6, this.y + 1.6, this.z + fz * 1.6);
    }
    // Pull the camera in until it clears the buildings.
    const test = { x: target.x, z: target.z };
    if (this.world.collides(test.x, test.z, 0.6)) {
      const base = car ? { x: car.x, z: car.z } : { x: this.x, z: this.z };
      for (let d = dist - 1; d >= 2.4; d -= 1) {
        const fx = car ? Math.sin(car.heading) : Math.sin(this.camYaw);
        const fz = car ? Math.cos(car.heading) : Math.cos(this.camYaw);
        const cx = base.x - fx * d;
        const cz = base.z - fz * d;
        if (!this.world.collides(cx, cz, 0.6)) {
          target.x = cx;
          target.z = cz;
          break;
        }
      }
    }
    const k = 1 - Math.exp(-dt * 14);
    camera.position.lerp(target, k);
    camera.lookAt(look);
  }
}
