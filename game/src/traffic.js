// Solmar Bay — traffic: civilian cars that drive the road grid, keep
// their lane, slow down for the car ahead and turn at intersections.
import { angleLerp, clamp } from './random.js';

export class Traffic {
  constructor(scene, world, vehicles, rng) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.rng = rng;
    this.cars = []; // {car, ix, iz, fromIx, fromIz, target, speed, targetSpeed}
  }

  spawn(count) {
    const colors = [0xc83232, 0x3268c8, 0xe8c832, 0x38a868, 0xe8e8e8, 0x282828, 0xd87828, 0x8838a8, 0x38b8c8];
    const types = ['sedan', 'sedan', 'taxi', 'sedan', 'van'];
    for (let i = 0; i < count; i++) {
      const ix = this.rng.int(1, 7);
      const iz = this.rng.int(1, 7);
      const next = this.world.pickNext(ix, iz, ix, iz, null);
      const lane = this.world.lanePoint(ix, iz, next.ix, next.iz, 3.2);
      const heading = Math.atan2(next.ix - ix, next.iz - iz);
      const car = this.vehicles.addCar(this.rng.pick(types), this.rng.pick(colors), lane.x, lane.z, heading, {
        driver: 'traffic',
      });
      this.cars.push({
        car,
        ix: next.ix,
        iz: next.iz,
        fromIx: ix,
        fromIz: iz,
        target: { x: lane.x, z: lane.z },
        speed: this.rng.range(7, 11),
        targetSpeed: this.rng.range(8, 12),
      });
      // Place the car at the start of its leg, not on the intersection.
      const start = this.world.lanePoint(ix, iz, next.ix, next.iz, 3.2);
      car.x = start.x;
      car.z = start.z;
    }
  }

  update(dt) {
    for (const t of this.cars) {
      const { car } = t;
      const dx = t.target.x - car.x;
      const dz = t.target.z - car.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let turn = desired - car.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      car.heading += clamp(turn, -2.4 * dt, 2.4 * dt);

      // Slow for a turn and for the car ahead.
      let want = t.targetSpeed;
      if (Math.abs(turn) > 0.5) want *= 0.55;
      for (const other of this.vehicles.cars) {
        if (other === car) continue;
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const od = Math.hypot(ox, oz);
        if (od < 11 && od > 0.1) {
          const ahead = (ox * Math.sin(car.heading) + oz * Math.cos(car.heading)) / od;
          if (ahead > 0.6) want = Math.min(want, Math.abs(other.speed) * 0.9 + 1);
        }
      }
      car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
      car.speed = clamp(car.speed, 0, 14);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;

      if (dist < 5) {
        // Reached the intersection: pick the next leg.
        const fromIx = t.ix;
        const fromIz = t.iz;
        const next = this.world.pickNext(t.ix, t.iz, t.fromIx, t.fromIz, null);
        t.fromIx = fromIx;
        t.fromIz = fromIz;
        t.ix = next.ix;
        t.iz = next.iz;
        const lane = this.world.lanePoint(fromIx, fromIz, next.ix, next.iz, 3.2);
        t.target = { x: lane.x, z: lane.z };
      }
    }
  }
}
