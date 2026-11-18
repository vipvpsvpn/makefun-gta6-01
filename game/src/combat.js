// Solmar Bay — combat: pistol shooting with ray tests against people and
// buildings, melee punches, muzzle flash, tracers, impact particles,
// and the cash pickups the player collects.
import * as THREE from 'three';
import { COMBAT } from './config.js';

function rayHitsAABB(ox, oz, dx, dz, box) {
  // 2D slab test; returns the distance along the ray or Infinity.
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-8) {
    if (ox < box.minX || ox > box.maxX) return Infinity;
  } else {
    let t1 = (box.minX - ox) / dx;
    let t2 = (box.maxX - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < box.minZ || oz > box.maxZ) return Infinity;
  } else {
    let t1 = (box.minZ - oz) / dz;
    let t2 = (box.maxZ - oz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export class Combat {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.weapon = 'fists';
    this.ammo = COMBAT.PISTOL_MAG;
    this.lastShotT = -10;
    this.lastMeleeT = -10;
    this.muzzle = new THREE.PointLight(0xffc860, 0, 14);
    scene.add(this.muzzle);
    this.tracers = []; // {line, life}
    this.particles = []; // {mesh, vx, vy, vz, life}
    this.pickups = []; // {mesh, x, z, amount}
    this.onPickup = null; // (amount) => void
  }

  switchWeapon(name) {
    if (name !== 'fists' && name !== 'pistol') return;
    this.weapon = name;
  }

  // origin: Vector3 at the muzzle; dir: normalised Vector3.
  // shootables: [{x, z, height, radius, alive, damage(amount)}]
  shoot(origin, dir, shootables, now) {
    if (this.weapon !== 'pistol') return null;
    if (now - this.lastShotT < COMBAT.PISTOL_FIRE_MS / 1000) return null;
    if (this.ammo <= 0) {
      if (this.audio) this.audio.blip(140, 0.08, 'square', 0.15);
      return null;
    }
    this.lastShotT = now;
    this.ammo -= 1;
    if (this.audio) this.audio.gunshot();

    // Muzzle flash at the camera.
    this.muzzle.position.copy(origin);
    this.muzzle.intensity = 26;

    // How far the bullet flies before a building stops it.
    let maxDist = COMBAT.PISTOL_RANGE;
    for (const box of this.world.colliders) {
      const t = rayHitsAABB(origin.x, origin.z, dir.x, dir.z, box);
      if (t < maxDist) maxDist = t;
    }

    // Nearest person the ray passes close to.
    let hit = null;
    let hitDist = maxDist;
    for (const s of shootables) {
      if (!s.alive) continue;
      const rx = s.x - origin.x;
      const rz = s.z - origin.z;
      const along = rx * dir.x + rz * dir.z;
      if (along < 0.5 || along > hitDist) continue;
      const px = origin.x + dir.x * along;
      const pz = origin.z + dir.z * along;
      const perp = Math.hypot(s.x - px, s.z - pz);
      if (perp < s.radius + 0.25) {
        // The bullet must also pass through the body's height.
        const hy = origin.y + dir.y * along;
        if (hy > 0 && hy < s.height + 0.4) {
          hit = s;
          hitDist = along;
        }
      }
    }

    const end = new THREE.Vector3(
      origin.x + dir.x * hitDist,
      origin.y + dir.y * hitDist,
      origin.z + dir.z * hitDist
    );
    this.spawnTracer(origin, end);
    if (hit) {
      this.spawnBurst(end, 0xc83232);
      hit.damage(COMBAT.PISTOL_DAMAGE);
    } else if (hitDist < COMBAT.PISTOL_RANGE) {
      this.spawnBurst(end, 0xd8d8c8);
    }
    return hit;
  }

  melee(playerPos, heading, shootables, now) {
    if (now - this.lastMeleeT < COMBAT.MELEE_MS / 1000) return null;
    this.lastMeleeT = now;
    if (this.audio) this.audio.punch();
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let hit = null;
    for (const s of shootables) {
      if (!s.alive) continue;
      const dx = s.x - playerPos.x;
      const dz = s.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > COMBAT.MELEE_RANGE) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot > 0.4) {
        hit = s;
        break;
      }
    }
    if (hit) {
      hit.damage(COMBAT.MELEE_DAMAGE);
      // Shove the target away from the player.
      hit.x += fx * 0.8;
      hit.z += fz * 0.8;
      if (hit.group) {
        hit.group.position.set(hit.x, 0, hit.z);
      }
    }
    return hit;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  spawnBurst(pos, color) {
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color })
      );
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 5,
        vy: Math.random() * 3 + 1,
        vz: (Math.random() - 0.5) * 5,
        life: 0.45,
      });
    }
  }

  spawnPickup(x, z, amount) {
    const mesh = new THREE.Group();
    const bill = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2ea84a, emissive: 0x1a7a2a, emissiveIntensity: 0.9 })
    );
    mesh.add(bill);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.02, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x58e878, transparent: true, opacity: 0.4 })
    );
    glow.position.y = -0.2;
    mesh.add(glow);
    mesh.position.set(x, 0.5, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, x, z, amount });
  }

  update(dt, t, playerPos) {
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 320);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.95;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy -= 12 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.life <= 0 || p.mesh.position.y < 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.mesh.rotation.y += dt * 2.4;
      pk.mesh.position.y = 0.5 + Math.sin(t * 3 + i) * 0.12;
      if (playerPos && Math.hypot(pk.x - playerPos.x, pk.z - playerPos.z) < 1.7) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
        if (this.audio) this.audio.pickup();
        if (this.onPickup) this.onPickup(pk.amount);
      }
    }
  }
}
