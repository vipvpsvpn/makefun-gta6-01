// Solmar Bay — HUD: health, money, wanted stars, speed, weapon, mission
// objective, toasts, damage flash, crosshair, and the canvas minimap.
import { CITY } from './config.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.healthFill = this.el('health-fill');
    this.healthNum = this.el('health-num');
    this.money = this.el('money');
    this.stars = this.el('stars');
    this.speed = this.el('speed');
    this.speedRow = this.el('speed-row');
    this.objective = this.el('objective');
    this.objectiveDist = this.el('objective-dist');
    this.ammo = this.el('ammo');
    this.weaponName = this.el('weapon-name');
    this.toastBox = this.el('toast');
    this.flash = this.el('damage-flash');
    this.crosshair = this.el('crosshair');
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.toastTimer = null;
    this.flashLevel = 0;
    this.lastStars = -1;
  }

  toast(msg, ms = 4200) {
    this.toastBox.textContent = msg;
    this.toastBox.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastBox.classList.remove('show'), ms);
  }

  damageFlash() {
    this.flashLevel = 0.55;
  }

  setHealth(hp, max) {
    const pct = Math.max(0, Math.round((hp / max) * 100));
    this.healthFill.style.width = pct + '%';
    this.healthFill.style.background = pct > 50 ? '#37c86a' : pct > 25 ? '#e8a838' : '#e83838';
    this.healthNum.textContent = pct;
  }

  setMoney(amount) {
    this.money.textContent = '$' + amount.toLocaleString('en-US');
  }

  setWanted(level) {
    if (level === this.lastStars) return;
    this.lastStars = level;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < level ? '★' : '☆';
    this.stars.textContent = s;
    this.stars.classList.toggle('hot', level >= 3);
  }

  setSpeed(kmh, inCar) {
    this.speedRow.style.display = inCar ? 'flex' : 'none';
    if (inCar) this.speed.textContent = Math.round(kmh);
  }

  setObjective(text) {
    this.objective.textContent = text;
  }

  setObjectiveDist(meters) {
    this.objectiveDist.textContent = meters === null ? '' : meters + ' m';
  }

  setWeapon(name, ammo) {
    this.weaponName.textContent = name === 'pistol' ? 'Pistol' : 'Fists';
    this.ammo.textContent = name === 'pistol' ? ammo + ' / ∞' : '—';
    this.crosshair.style.display = name === 'pistol' ? 'block' : 'none';
  }

  update(dt) {
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - dt * 1.4);
      this.flash.style.opacity = String(this.flashLevel);
    }
  }

  // state: {playerX, playerZ, heading, inCar, traffic, peds, cops,
  // patrols, marker, wanted}
  drawMinimap(state) {
    const ctx = this.mm;
    const size = 200;
    const scale = size / 460; // world 0..416 plus margin
    const toMap = (x, z) => [10 + x * scale, 10 + z * scale];
    ctx.clearRect(0, 0, size, size);
    // Sea and sand at the bottom.
    ctx.fillStyle = '#0d5a80';
    const [, seaY] = toMap(0, CITY.SEA_START);
    ctx.fillRect(0, seaY, size, size - seaY);
    ctx.fillStyle = '#e8d49a';
    const [, beachY] = toMap(0, CITY.BEACH_START);
    ctx.fillRect(0, beachY, size, seaY - beachY);
    // City ground.
    ctx.fillStyle = '#23262c';
    ctx.fillRect(0, 0, size, beachY);
    // Roads.
    ctx.strokeStyle = '#565b64';
    ctx.lineWidth = 5;
    for (let i = 0; i < CITY.GRID; i++) {
      const [x] = toMap(i * CITY.BLOCK, 0);
      const [, z] = toMap(0, i * CITY.BLOCK);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, beachY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, z);
      ctx.lineTo(size, z);
      ctx.stroke();
    }
    // Mission marker.
    if (state.marker) {
      const [mx, mz] = toMap(state.marker.x, state.marker.z);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(mx, mz - 7);
      ctx.lineTo(mx + 6, mz);
      ctx.lineTo(mx, mz + 7);
      ctx.lineTo(mx - 6, mz);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic (white), peds (grey), police (blue).
    ctx.fillStyle = '#e8e8e8';
    for (const c of state.traffic) {
      const [x, z] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    ctx.fillStyle = '#9a9a9a';
    for (const p of state.peds) {
      const [x, z] = toMap(p.x, p.z);
      ctx.fillRect(x - 1, z - 1, 2, 2);
    }
    ctx.fillStyle = '#4a90ff';
    for (const c of state.cops) {
      const [x, z] = toMap(c.x, c.z);
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of state.patrols) {
      const [x, z] = toMap(p.car.x, p.car.z);
      ctx.beginPath();
      ctx.arc(x, z, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow. The arrow is drawn pointing up (map north, -z);
    // heading 0 faces +z (map south), so rotate by PI - heading.
    const [px, pz] = toMap(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.PI - state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial';
    ctx.fillText('N', size - 14, 14);
  }
}
