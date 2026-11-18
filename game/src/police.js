// Solmar Bay — wanted level and police: foot cops who chase and arrest,
// patrol cars that hunt the player down the road grid, and the slow
// decay of heat when the player stays quiet and out of sight.
import { WANTED } from './config.js';
import { buildPersonMesh } from './pedestrians.js';
import { clamp, dist2D } from './random.js';

export class Police {
  constructor(scene, world, vehicles, rng, audio) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.rng = rng;
    this.audio = audio;
    this.wanted = 0;
    this.lastCrimeT = -100;
    this.decayT = 0;
    this.cops = []; // {group,x,z,heading,speed,arrestT,shootT,health,state}
    this.patrols = []; // {car,ix,iz,fromIx,fromIz,target,speed,stuckT,lastX,lastZ,reverseT}
    this.onBusted = null;
    this.onPlayerDamaged = null; // (amount) => void
    this.onWantedChange = null;
    this.sirenOn = false;
  }

  setWanted(level, now) {
    const next = clamp(level, 0, WANTED.MAX);
    if (next !== this.wanted) {
      this.wanted = next;
      this.lastCrimeT = now;
      this.decayT = 0;
      if (this.onWantedChange) this.onWantedChange(next);
    }
  }

  addWanted(stars, now) {
    this.setWanted(this.wanted + stars, now);
  }

  spawnCop(x, z) {
    const group = buildPersonMesh({
      shirt: 0x1d2f55,
      pants: 0x14181f,
      skin: this.rng.pick([0xd8a880, 0xb08050, 0xe8c8a0]),
      hat: 0x1d2f55,
    });
    group.position.set(x, 0, z);
    this.scene.add(group);
    const cop = {
      group,
      x,
      z,
      heading: 0,
      speed: 6.4,
      arrestT: 0,
      shootT: this.rng.range(0.5, 1.5),
      health: 60,
      state: 'chase',
      walkPhase: this.rng.range(0, 6),
    };
    this.cops.push(cop);
    return cop;
  }

  spawnPatrol(x, z, heading, opts = {}) {
    const car = this.vehicles.addCar('police', 0xf2f2f2, x, z, heading, { driver: 'police' });
    const near = this.world.nearestIntersection(x, z);
    const next = this.world.pickNext(near.ix, near.iz, near.ix, near.iz, null);
    const lane = this.world.lanePoint(near.ix, near.iz, next.ix, next.iz, 3.2);
    const patrol = {
      car,
      ix: next.ix,
      iz: next.iz,
      fromIx: near.ix,
      fromIz: near.iz,
      target: { x: lane.x, z: lane.z },
      speed: 0,
      stuckT: 0,
      lastX: x,
      lastZ: z,
      reverseT: 0,
      // A scripted patrol drives straight at a fixed speed (used by the
      // chase screenshot so the cruiser stays in frame); normal patrols
      // follow the road grid toward the player instead.
      scripted: !!opts.scripted,
      scriptSpeed: opts.speed || 14,
    };
    this.patrols.push(patrol);
    return patrol;
  }

  // Find a spawn point on a road, 45-75 m from the player.
  roadSpawnNear(px, pz) {
    for (let tries = 0; tries < 12; tries++) {
      const ix = this.rng.int(0, 8);
      const iz = this.rng.int(0, 8);
      const x = ix * 52 + this.rng.range(-3, 3);
      const z = iz * 52 + this.rng.range(-3, 3);
      const d = dist2D(x, z, px, pz);
      if (d > 45 && d < 80) return { x, z };
    }
    return { x: px + 55, z: pz };
  }

  ensureUnits(px, pz, now) {
    const want = WANTED.UNITS[this.wanted] || 0;
    const have = this.cops.length + this.patrols.length;
    if (have >= want) return;
    const spot = this.roadSpawnNear(px, pz);
    if (this.wanted >= 2 && this.patrols.length < Math.ceil(want / 2)) {
      this.spawnPatrol(spot.x, spot.z, this.rng.range(0, Math.PI * 2));
    } else {
      this.spawnCop(spot.x + 2, spot.z + 2);
    }
  }

  removeCop(cop) {
    this.scene.remove(cop.group);
    this.cops.splice(this.cops.indexOf(cop), 1);
  }

  removePatrol(patrol) {
    this.scene.remove(patrol.car.group);
    this.vehicles.cars.splice(this.vehicles.cars.indexOf(patrol.car), 1);
    this.patrols.splice(this.patrols.indexOf(patrol), 1);
  }

  update(dt, t, now, player) {
    // Wanted decay: stay quiet and unseen and the heat fades.
    if (this.wanted > 0 && now - this.lastCrimeT > WANTED.DECAY_AFTER) {
      const nearest = this.nearestUnitDist(player.x, player.z);
      if (nearest > 45 || nearest < 0) {
        this.decayT += dt;
        if (this.decayT >= WANTED.DECAY_EVERY) {
          this.decayT = 0;
          this.setWanted(this.wanted - 1, now);
        }
      } else {
        this.decayT = 0;
      }
    }

    if (this.wanted > 0) this.ensureUnits(player.x, player.z, now);
    this.sirenOn = this.wanted > 0 && this.patrols.length > 0;
    if (this.audio) this.audio.setSiren(this.sirenOn);

    // --- foot cops ---
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      const d = dist2D(c.x, c.z, player.x, player.z);
      if (this.wanted === 0) {
        // Stood down: walk off and leave.
        c.state = 'leave';
        c.heading += dt * 0.5;
        c.x += Math.sin(c.heading) * 2 * dt;
        c.z += Math.cos(c.heading) * 2 * dt;
        if (d > 120) this.removeCop(c);
        continue;
      }
      c.heading = Math.atan2(player.x - c.x, player.z - c.z);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      this.world.resolveCircle(c, 0.5);
      c.walkPhase += dt * c.speed * 3;
      const swing = Math.sin(c.walkPhase) * 0.5;
      const u = c.group.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.6;
      u.armR.rotation.x = swing * 0.6;
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = c.heading;

      // Arrest: stay close to the player for a moment.
      if (d < 2.4 && !player.inCar) {
        c.arrestT += dt;
        if (c.arrestT > 1.2 && this.onBusted) this.onBusted();
      } else {
        c.arrestT = Math.max(0, c.arrestT - dt * 2);
      }
      // Armed response at 3 stars and up.
      if (this.wanted >= 3 && d < 30 && d > 4) {
        c.shootT -= dt;
        if (c.shootT <= 0) {
          c.shootT = this.rng.range(1.1, 1.8);
          if (this.audio) this.audio.gunshot();
          if (this.rng.chance(0.42) && this.onPlayerDamaged) this.onPlayerDamaged(8);
        }
      }
    }

    // --- patrol cars ---
    const goal = this.world.nearestIntersection(player.x, player.z);
    for (let i = this.patrols.length - 1; i >= 0; i--) {
      const p = this.patrols[i];
      const { car } = p;
      const d = dist2D(car.x, car.z, player.x, player.z);
      if (this.wanted === 0) {
        if (d > 130) this.removePatrol(p);
        continue;
      }
      if (p.scripted) {
        // Straight-line pursuit: no turns, no waypoint logic.
        car.speed = p.scriptSpeed;
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        if (this.world.resolveCircle(car, 1.7)) car.speed *= 0.4;
        if (!player.inCar && d < 2.1 && Math.abs(car.speed) > 4) {
          if (this.onPlayerDamaged) this.onPlayerDamaged(14);
          car.speed *= 0.3;
        }
        continue;
      }
      const direct = d < 32;
      let desired;
      if (direct) {
        desired = Math.atan2(player.x - car.x, player.z - car.z);
      } else {
        desired = Math.atan2(p.target.x - car.x, p.target.z - car.z);
      }
      let turn = desired - car.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const turnRate = direct ? 3.2 : 2.4;
      car.heading += clamp(turn, -turnRate * dt, turnRate * dt);

      let want = 13 + this.wanted * 1.6;
      if (Math.abs(turn) > 0.6) want *= 0.6;
      if (p.reverseT > 0) {
        p.reverseT -= dt;
        car.speed = -6;
      } else {
        car.speed += clamp(want - car.speed, -16 * dt, 10 * dt);
      }
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (this.world.resolveCircle(car, 1.7)) car.speed *= 0.4;

      // Stuck against a building: back out.
      p.stuckT += dt;
      if (p.stuckT > 1.2) {
        const moved = dist2D(car.x, car.z, p.lastX, p.lastZ);
        if (moved < 1.2 && car.speed > 4) p.reverseT = 1.1;
        p.lastX = car.x;
        p.lastZ = car.z;
        p.stuckT = 0;
      }

      if (!direct) {
        const tdx = p.target.x - car.x;
        const tdz = p.target.z - car.z;
        if (Math.hypot(tdx, tdz) < 5) {
          const fromIx = p.ix;
          const fromIz = p.iz;
          const next = this.world.pickNext(p.ix, p.iz, p.fromIx, p.fromIz, goal);
          p.fromIx = fromIx;
          p.fromIz = fromIz;
          p.ix = next.ix;
          p.iz = next.iz;
          const lane = this.world.lanePoint(fromIx, fromIz, next.ix, next.iz, 3.2);
          p.target = { x: lane.x, z: lane.z };
        }
      }

      // Ram the player on foot.
      if (!player.inCar && d < 2.1 && Math.abs(car.speed) > 4) {
        if (this.onPlayerDamaged) this.onPlayerDamaged(14);
        car.speed *= 0.3;
      }
    }
  }

  nearestUnitDist(px, pz) {
    let best = -1;
    for (const c of this.cops) best = best < 0 ? dist2D(c.x, c.z, px, pz) : Math.min(best, dist2D(c.x, c.z, px, pz));
    for (const p of this.patrols) best = best < 0 ? dist2D(p.car.x, p.car.z, px, pz) : Math.min(best, dist2D(p.car.x, p.car.z, px, pz));
    return best;
  }
}
