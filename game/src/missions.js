// Solmar Bay — story missions: three jobs with stages, a pulsing beacon
// in the world, objective text for the HUD and cash rewards.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { buildPersonMesh } from './pedestrians.js';
import { dist2D } from './random.js';

const DOCKS = { x: 6 * 52, z: 8 * 52 - 4 };
const MARA_SPOT = { x: 2 * 52 + 8, z: 2 * 52 + 8 };
const SAFEHOUSE = { x: 7 * 52, z: 7 * 52 };

export class Missions {
  constructor(scene, world, rng, audio, hooks) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.audio = audio;
    this.hooks = hooks; // {player, police, toast, setObjective, onReward, onFail}
    this.index = 0; // next mission to run
    this.completed = [];
    this.active = null; // {def, stage, timer, marker, mara}
    this.beacon = this.makeBeacon();
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.mara = null;
  }

  makeBeacon() {
    const group = new THREE.Group();
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    column.position.y = 17;
    group.add(column);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.8, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e })
    );
    arrow.rotation.x = Math.PI;
    arrow.position.y = 8;
    group.add(arrow);
    group.userData = { column, ring, arrow };
    return group;
  }

  setMarker(x, z) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
    if (this.active) this.active.marker = { x, z };
  }

  hideMarker() {
    this.beacon.visible = false;
  }

  start() {
    if (this.active) {
      this.hooks.toast('A job is already running — finish it first.');
      return false;
    }
    if (this.index >= MISSIONS.length) {
      this.hooks.toast('All jobs done. Solmar Bay is yours — free roam!');
      return false;
    }
    const def = MISSIONS[this.index];
    this.active = { def, stage: 0, timer: 0, marker: null, mara: null };
    this.hooks.toast(`New job: ${def.name} — ${def.giver}`);
    if (this.audio) this.audio.blip(523, 0.15, 'triangle', 0.25);
    this.updateStageObjective();
    return true;
  }

  updateStageObjective() {
    const a = this.active;
    if (!a) {
      this.hooks.setObjective(this.index >= MISSIONS.length ? 'Free roam — Solmar Bay is yours.' : 'Press M to start the next job.');
      this.hideMarker();
      return;
    }
    if (a.def.id === 'hot-wheels') {
      if (a.stage === 0) {
        this.hooks.setObjective('JOB: Hot Wheels — steal any car (walk up and press E).');
        this.hideMarker();
      } else {
        this.hooks.setObjective('JOB: Hot Wheels — drive the car to the docks marker.');
        this.setMarker(DOCKS.x, DOCKS.z);
      }
    } else if (a.def.id === 'maras-getaway') {
      if (a.stage === 0) {
        this.hooks.setObjective("JOB: Mara's Getaway — pick up Mara on Coral Avenue.");
        this.setMarker(MARA_SPOT.x, MARA_SPOT.z);
        this.spawnMara();
      } else {
        this.hooks.setObjective("JOB: Mara's Getaway — lose the cops, get Mara to the safehouse.");
        this.setMarker(SAFEHOUSE.x, SAFEHOUSE.z);
      }
    } else if (a.def.id === 'pier-drop') {
      if (a.stage === 0) {
        this.hooks.setObjective('JOB: Pier Drop — get in a car, then race to the pier.');
        this.hideMarker();
      } else {
        this.hooks.setObjective(`JOB: Pier Drop — reach the end of the pier! ${Math.ceil(a.timer)}s left.`);
        this.setMarker(this.world.pierEnd.x, this.world.pierEnd.z);
      }
    }
  }

  spawnMara() {
    if (this.mara) return;
    const group = buildPersonMesh({ shirt: 0xe83a7a, pants: 0x222228, skin: 0xe8c8a0, hat: null });
    group.position.set(MARA_SPOT.x, 0, MARA_SPOT.z);
    this.scene.add(group);
    this.mara = { group, x: MARA_SPOT.x, z: MARA_SPOT.z };
  }

  removeMara() {
    if (!this.mara) return;
    this.scene.remove(this.mara.group);
    this.mara = null;
  }

  complete() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.completed.push(a.def.id);
    this.index += 1;
    this.hideMarker();
    this.removeMara();
    if (this.audio) this.audio.missionDone();
    this.hooks.toast(`Job complete: ${a.def.name} — $${a.def.reward}`);
    this.hooks.onReward(a.def.reward, a.def.name);
    this.updateStageObjective();
  }

  fail(reason) {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.hideMarker();
    this.removeMara();
    if (this.audio) this.audio.missionFail();
    this.hooks.toast(`Job failed: ${a.def.name} — ${reason}`);
    this.hooks.onFail(a.def.name);
    this.updateStageObjective();
  }

  update(dt, t) {
    // Beacon pulse.
    if (this.beacon.visible) {
      const s = 1 + Math.sin(t * 3) * 0.12;
      this.beacon.userData.ring.scale.set(s, s, 1);
      this.beacon.userData.arrow.position.y = 8 + Math.sin(t * 2.5) * 0.8;
      this.beacon.userData.arrow.rotation.y += dt;
    }
    const a = this.active;
    if (!a) return;
    const p = this.hooks.player;
    if (a.def.id === 'hot-wheels') {
      if (a.stage === 0 && p.inCar) {
        a.stage = 1;
        this.updateStageObjective();
      } else if (a.stage === 1 && p.inCar && dist2D(p.x, p.z, DOCKS.x, DOCKS.z) < 10) {
        this.complete();
      }
    } else if (a.def.id === 'maras-getaway') {
      if (a.stage === 0) {
        if (this.mara && dist2D(p.x, p.z, this.mara.x, this.mara.z) < 5) {
          this.removeMara();
          a.stage = 1;
          this.hooks.police.setWanted(3, this.hooks.now());
          this.hooks.toast('Mara is in. The whole SBPD is coming — drive!');
          this.updateStageObjective();
        }
      } else if (a.stage === 1 && p.inCar && dist2D(p.x, p.z, SAFEHOUSE.x, SAFEHOUSE.z) < 11) {
        this.complete();
      }
    } else if (a.def.id === 'pier-drop') {
      if (a.stage === 0 && p.inCar) {
        a.stage = 1;
        a.timer = 90;
        this.updateStageObjective();
      } else if (a.stage === 1) {
        a.timer -= dt;
        this.hooks.setObjective(`JOB: Pier Drop — reach the end of the pier! ${Math.max(0, Math.ceil(a.timer))}s left.`);
        if (dist2D(p.x, p.z, this.world.pierEnd.x, this.world.pierEnd.z) < 11) {
          this.complete();
        } else if (a.timer <= 0) {
          this.fail('Out of time.');
        }
      }
    }
  }

  markerDist(player) {
    if (!this.active || !this.active.marker) return null;
    return Math.round(dist2D(player.x, player.z, this.active.marker.x, this.active.marker.z));
  }

  saveState() {
    return { index: this.index, completed: this.completed };
  }

  loadState(s) {
    if (!s) return;
    this.index = s.index || 0;
    this.completed = s.completed || [];
  }
}
