// Solmar Bay — entry point: boots the renderer and every system, runs
// the game loop, wires input to actions, and owns save/load plus the
// ?shot= scenarios the screenshot script drives.
import * as THREE from 'three';
import { CITY, COMBAT, PLAYER, SAVE_KEY, WANTED } from './config.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { World } from './world.js';
import { VehicleManager } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Player } from './player.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1337);
const shot = params.get('shot') || '';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

const rng = makeRng(seed);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(208, 80, 60);

const input = new Input(renderer.domElement);
const audio = new AudioEngine();
const world = new World(scene, rng);
const vehicles = new VehicleManager(scene, world, rng);
const traffic = new Traffic(scene, world, vehicles, rng);
const peds = new Pedestrians(scene, world, rng);
const police = new Police(scene, world, vehicles, rng, audio);
const combat = new Combat(scene, world, audio);
const hud = new HUD();
const player = new Player(scene, world, world.spawn);

vehicles.spawnParked(26);
traffic.spawn(14);
peds.spawn(28);
// A few cash pickups hidden around the city.
for (let i = 0; i < 6; i++) {
  const ix = rng.int(1, 7);
  const iz = rng.int(1, 7);
  combat.spawnPickup(ix * 52 + rng.range(-6, 6), iz * 52 + rng.range(-6, 6), rng.int(50, 150));
}

const G = {
  mode: 'menu', // menu | playing | paused | wasted | busted
  money: 250,
  health: PLAYER.MAX_HEALTH,
  time: 0,
  lastDamageT: -100,
  lastSaveT: 0,
};

// --- wiring: what happens when the world reacts to the player ---
const missions = new Missions(scene, world, rng, audio, {
  player,
  police,
  now: () => G.time,
  toast: (msg) => hud.toast(msg),
  setObjective: (text) => hud.setObjective(text),
  onReward: (amount) => {
    G.money += amount;
    hud.setMoney(G.money);
  },
  onFail: () => {},
});

peds.onKnocked = (ped, byPlayer) => {
  if (!byPlayer) return;
  police.addWanted(WANTED.HIT_PED, G.time);
  hud.toast('You hit a pedestrian! The cops noticed.');
  if (rng.chance(0.5)) combat.spawnPickup(ped.x + 1, ped.z, rng.int(40, 120));
};

police.onBusted = () => {
  if (G.mode !== 'playing') return;
  G.mode = 'busted';
  const fine = Math.min(G.money, 200);
  G.money -= fine;
  hud.setMoney(G.money);
  police.setWanted(0, G.time);
  showScreen('busted-screen');
  input.unlock();
};

police.onPlayerDamaged = (amount) => damagePlayer(amount);
police.onWantedChange = (level) => hud.setWanted(level);
combat.onPickup = (amount) => {
  G.money += amount;
  hud.setMoney(G.money);
  hud.toast(`Picked up $${amount}`);
};

function damagePlayer(amount) {
  if (G.mode !== 'playing') return;
  G.health -= amount;
  G.lastDamageT = G.time;
  hud.damageFlash();
  hud.setHealth(G.health, PLAYER.MAX_HEALTH);
  if (G.health <= 0) {
    G.health = 0;
    G.mode = 'wasted';
    showScreen('wasted-screen');
    input.unlock();
    if (audio.ready) audio.setEngine(0, false);
  }
}

function showScreen(id) {
  for (const s of ['start-screen', 'pause-screen', 'wasted-screen', 'busted-screen']) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
  document.getElementById('hud').classList.toggle('hidden', id !== null && id !== 'pause-screen' && G.mode !== 'paused');
}

function startGame() {
  audio.init();
  audio.resume();
  G.mode = 'playing';
  showScreen(null);
  input.lock();
  missions.updateStageObjective();
  hud.setMoney(G.money);
  hud.setHealth(G.health, PLAYER.MAX_HEALTH);
  hud.setWanted(police.wanted);
  hud.setWeapon(combat.weapon, combat.ammo);
}

function saveGame() {
  const data = {
    money: G.money,
    health: G.health,
    px: player.x,
    pz: player.z,
    heading: player.heading,
    mission: missions.saveState(),
    time: G.time,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    G.money = data.money ?? 250;
    G.health = data.health ?? PLAYER.MAX_HEALTH;
    player.teleport(data.px ?? world.spawn.x, data.pz ?? world.spawn.z, data.heading ?? 0);
    missions.loadState(data.mission);
    return true;
  } catch {
    return false;
  }
}

function respawn() {
  G.health = PLAYER.MAX_HEALTH;
  player.teleport(world.spawn.x, world.spawn.z, Math.PI);
  if (vehicles.playerCar) {
    vehicles.playerCar.driver = null;
    vehicles.playerCar = null;
  }
  player.inCar = false;
  police.setWanted(0, G.time);
  hud.setHealth(G.health, PLAYER.MAX_HEALTH);
  hud.setWanted(0);
  startGame();
}

// --- shooting targets: peds and cops as one list ---
function shootables() {
  const list = [];
  for (const p of peds.peds) {
    if (p.state === 'down') continue;
    list.push({
      x: p.x,
      z: p.z,
      height: 1.8,
      radius: 0.55,
      alive: true,
      group: p.group,
      damage: (amount) => {
        p.health -= amount;
        if (p.health <= 0) {
          peds.knockDown(p, true);
          police.addWanted(WANTED.KILL_PED, G.time);
          if (rng.chance(0.6)) combat.spawnPickup(p.x + 1, p.z, rng.int(40, 120));
        }
      },
    });
  }
  for (const c of police.cops) {
    list.push({
      x: c.x,
      z: c.z,
      height: 1.8,
      radius: 0.55,
      alive: true,
      group: c.group,
      damage: (amount) => {
        c.health -= amount;
        if (c.health <= 0) {
          police.removeCop(c);
          police.addWanted(WANTED.KILL_COP, G.time);
          combat.spawnPickup(c.x + 1, c.z, 100);
          hud.toast('You took down a cop! Heat is way up.');
        }
      },
    });
  }
  return list;
}

function tryEnterCar() {
  const car = vehicles.nearestCar(player.x, player.z, 4.2);
  if (!car) return;
  // Stealing a car the traffic or police were driving: it leaves their fleet.
  const tIdx = traffic.cars.findIndex((t) => t.car === car);
  if (tIdx >= 0) traffic.cars.splice(tIdx, 1);
  const pIdx = police.patrols.findIndex((p) => p.car === car);
  if (pIdx >= 0) police.patrols.splice(pIdx, 1);
  vehicles.enterCar(car);
  player.inCar = true;
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  player.group.visible = false;
  police.addWanted(WANTED.STEAL_CAR, G.time);
  if (audio.ready) audio.carDoor();
  hud.toast(car.type === 'police' ? 'You jacked a police cruiser!' : 'Nice ride. It is yours now.');
}

function tryExitCar() {
  const spot = vehicles.exitCar();
  if (!spot) return;
  player.inCar = false;
  player.teleport(spot.x, spot.z, player.camYaw);
  player.group.visible = true;
  if (audio.ready) {
    audio.carDoor();
    audio.setEngine(0, false);
  }
}

function update(dt) {
  G.time += dt;
  world.update(dt, G.time);

  if (G.mode === 'menu') {
    // Orbit the city behind the start screen.
    const a = G.time * 0.045;
    camera.position.set(208 + Math.cos(a) * 190, 95, 208 + Math.sin(a) * 190);
    camera.lookAt(208, 0, 208);
    traffic.update(dt);
    peds.update(dt, G.time, null, vehicles.cars, null);
    vehicles.separateCars();
    vehicles.syncMeshes();
    return;
  }
  if (G.mode !== 'playing') return;

  // Health regen after a quiet spell.
  if (G.health > 0 && G.health < PLAYER.MAX_HEALTH && G.time - G.lastDamageT > 6) {
    G.health = Math.min(PLAYER.MAX_HEALTH, G.health + 5 * dt);
    hud.setHealth(G.health, PLAYER.MAX_HEALTH);
  }

  // --- input actions ---
  if (input.hit('KeyE')) {
    if (player.inCar) tryExitCar();
    else tryEnterCar();
  }
  if (input.hit('KeyF') && !player.inCar) {
    combat.melee(player.pos, player.heading, shootables(), G.time);
  }
  if (input.hit('KeyR') && combat.weapon === 'pistol') {
    combat.ammo = COMBAT.PISTOL_MAG;
    hud.setWeapon('pistol', combat.ammo);
    if (audio.ready) audio.blip(440, 0.08, 'square', 0.15);
  }
  if (input.hit('Digit1')) {
    combat.switchWeapon('fists');
    hud.setWeapon('fists', 0);
  }
  if (input.hit('Digit2')) {
    combat.switchWeapon('pistol');
    hud.setWeapon('pistol', combat.ammo);
  }
  if (input.hit('KeyM')) missions.start();
  if (input.hit('KeyN') && audio.ready) {
    hud.toast(audio.toggleMusic() ? 'Music on' : 'Music off');
  }
  if (input.hit('KeyP') || input.hit('Escape')) {
    G.mode = 'paused';
    showScreen('pause-screen');
    input.unlock();
    if (audio.ready) audio.setEngine(0, false);
  }
  if (input.mouseDown && !player.inCar && combat.weapon === 'pistol' && input.locked) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone().addScaledVector(dir, 0.6);
    origin.y -= 0.15;
    const ammoBefore = combat.ammo;
    combat.shoot(origin, dir, shootables(), G.time);
    if (combat.ammo < ammoBefore) police.addWanted(WANTED.SHOOT, G.time);
    hud.setWeapon('pistol', combat.ammo);
  }

  // --- systems ---
  if (player.inCar) {
    vehicles.updatePlayerCar(dt, input, audio);
    // The player's position is the car's position while driving:
    // missions, police and the minimap all read player.x/z.
    player.x = vehicles.playerCar.x;
    player.z = vehicles.playerCar.z;
    player.heading = vehicles.playerCar.heading;
  } else {
    player.update(dt, input, camera, combat.weapon);
    if (audio.ready) audio.setEngine(0, false);
  }
  player.updateCamera(dt, camera, player.inCar ? vehicles.playerCar : null);
  traffic.update(dt);
  peds.update(dt, G.time, combat.lastShotT > G.time - 0.4 ? { x: player.x, z: player.z, radius: 18 } : null, vehicles.cars, vehicles.playerCar);
  police.update(dt, G.time, G.time, player);
  missions.update(dt, G.time);
  combat.update(dt, G.time, player.pos);
  vehicles.separateCars();
  vehicles.syncMeshes();
  vehicles.updatePoliceLights(G.time);

  // --- HUD ---
  hud.update(dt);
  hud.setSpeed(Math.abs(vehicles.playerCar ? vehicles.playerCar.speed * 3.6 : 0), player.inCar);
  hud.setWeapon(combat.weapon, combat.ammo);
  hud.setObjectiveDist(missions.markerDist(player));
  hud.drawMinimap({
    playerX: player.x,
    playerZ: player.z,
    heading: player.inCar ? vehicles.playerCar.heading : player.heading,
    traffic: traffic.cars.map((t) => t.car),
    peds: peds.peds,
    cops: police.cops,
    patrols: police.patrols,
    marker: missions.active ? missions.active.marker : null,
  });

  // Autosave every 45 seconds.
  if (G.time - G.lastSaveT > 45) {
    G.lastSaveT = G.time;
    saveGame();
  }
}

// --- screens and buttons ---
const $ = (id) => document.getElementById(id);
$('play-btn').addEventListener('click', () => {
  loadGame();
  startGame();
});
$('newgame-btn').addEventListener('click', () => {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* fresh start anyway */
  }
  G.money = 250;
  G.health = PLAYER.MAX_HEALTH;
  player.teleport(world.spawn.x, world.spawn.z, Math.PI);
  missions.index = 0;
  missions.completed = [];
  startGame();
});
$('resume-btn').addEventListener('click', () => {
  G.mode = 'playing';
  showScreen(null);
  input.lock();
});
$('save-btn').addEventListener('click', () => {
  hud.toast(saveGame() ? 'Game saved.' : 'Save failed.');
});
$('quit-btn').addEventListener('click', () => {
  G.mode = 'menu';
  showScreen('start-screen');
  input.unlock();
});
$('respawn-btn').addEventListener('click', respawn);
$('busted-btn').addEventListener('click', respawn);

// Show Continue only when a save exists.
try {
  $('play-btn').textContent = localStorage.getItem(SAVE_KEY) ? '▶ Continue' : '▶ Play';
} catch {
  $('play-btn').textContent = '▶ Play';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- screenshot scenarios (?shot=chase|street|mission|combat) ---
function applyShot(name) {
  loadGame();
  startGame();
  if (name === 'chase') {
    const car = vehicles.addCar('sports', 0xc83232, 4 * 52, 5 * 52, 0, { driver: 'player' });
    vehicles.enterCar(car);
    player.inCar = true;
    car.speed = 16;
    missions.index = 0;
    missions.start();
    police.setWanted(3, G.time);
    const p1 = police.spawnPatrol(4 * 52 + 4, 4 * 52 + 24, 0);
    // Second cruiser comes up the same road toward the player in the
    // opposite lane (scripted straight line), so the cover shows the
    // chase head-on. It starts far enough south that the shot is taken
    // before the two cars meet.
    const p2 = police.spawnPatrol(4 * 52 - 8, 8 * 52 + 4, Math.PI, { scripted: true, speed: 16 });
    p1.car.speed = 15;
    p2.car.speed = 16;
    // Clear the chase lane of civilian traffic so the player's car
    // does not stall on a taxi mid-shot.
    for (let i = traffic.cars.length - 1; i >= 0; i--) {
      const t = traffic.cars[i];
      if (t.car.x > 190 && t.car.x < 226 && t.car.z > 230 && t.car.z < 340) {
        scene.remove(t.car.group);
        vehicles.cars.splice(vehicles.cars.indexOf(t.car), 1);
        traffic.cars.splice(i, 1);
      }
    }
    player.camYaw = 0;
  } else if (name === 'street') {
    player.teleport(4 * 52 + 2, 4 * 52 + 6, Math.PI * 0.9);
    player.camYaw = Math.PI * 0.9;
    // Crowd the frame: pedestrians just ahead of the player, in view.
    peds.spawnOne(4 * 52 - 2, 4 * 52 - 12);
    peds.spawnOne(4 * 52 + 8, 4 * 52 - 16);
    peds.spawnOne(4 * 52 - 10, 4 * 52 - 8);
    peds.spawnOne(4 * 52 + 4, 4 * 52 - 22);
  } else if (name === 'mission') {
    const car = vehicles.addCar('sedan', 0x3268c8, 6 * 52, 7 * 52 - 64, 0, { driver: 'player' });
    vehicles.enterCar(car);
    player.inCar = true;
    player.x = car.x;
    player.z = car.z;
    car.speed = 10;
    missions.index = 0;
    missions.start();
    player.camYaw = 0;
  } else if (name === 'combat') {
    player.teleport(3 * 52 + 4, 3 * 52 + 4, Math.PI * 0.75);
    player.camYaw = Math.PI * 0.75;
    combat.switchWeapon('pistol');
    police.setWanted(2, G.time);
    // Cops start ~26 m away, in the player's line of sight, so the
    // shot shows a firefight instead of an arrest.
    police.spawnCop(3 * 52 + 22, 3 * 52 - 14);
    police.spawnCop(3 * 52 - 6, 3 * 52 - 22);
    hud.setWeapon('pistol', combat.ammo);
  }
  hud.setMoney(G.money);
  hud.setHealth(G.health, PLAYER.MAX_HEALTH);
  hud.setWanted(police.wanted);
}

// Debug / screenshot API (used by the headless test script only).
window.__game = {
  G,
  player,
  vehicles,
  traffic,
  peds,
  police,
  missions,
  combat,
  world,
  hud,
  teleport(x, z, heading) {
    player.teleport(x, z, heading);
  },
  setWanted(n) {
    police.setWanted(n, G.time);
  },
  startMission(i) {
    missions.index = i;
    missions.start();
  },
  setCam(yaw, pitch) {
    player.camYaw = yaw;
    if (pitch !== undefined) player.camPitch = pitch;
  },
  giveCar(type, color) {
    const car = vehicles.addCar(type || 'sports', color || 0xc83232, player.x + 4, player.z, player.heading, { driver: 'player' });
    vehicles.enterCar(car);
    player.inCar = true;
    return car;
  },
};

if (shot) {
  applyShot(shot);
} else {
  missions.updateStageObjective();
  hud.setMoney(G.money);
  hud.setHealth(G.health, PLAYER.MAX_HEALTH);
}

// --- main loop ---
const clock = new THREE.Clock();
let firstFrame = true;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  input.endFrame();
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__ready = true;
  }
}
loop();
