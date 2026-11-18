// Solmar Bay — procedural city: roads, buildings, beach, sea, pier,
// palms, lamps, billboards and clouds. Also owns the collision boxes
// and the road graph the traffic, pedestrians and police drive on.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { clamp } from './random.js';

const { GRID, BLOCK, ROAD_W, BEACH_START, SEA_START, WORLD_EDGE } = CITY;

function makeFacadeTexture(baseColor, litRatio, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shade so towers read at a distance.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#2e4258';
      g.fillRect(10 + col * 19, 12 + row * 17, 12, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBillboardTexture(lines, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = fg;
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((line, i) => {
    g.fillText(line, 256, 90 + i * 70);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = []; // {minX,maxX,minZ,maxZ}
    this.buildings = [];
    this.water = null;
    this.clouds = [];
    this.spawn = { x: 4 * BLOCK, z: 4 * BLOCK + 4, heading: Math.PI };
    this.build();
  }

  roadCoord(i) {
    return i * BLOCK;
  }

  isOnRoad(x, z) {
    const half = ROAD_W / 2 + 1;
    for (let i = 0; i < GRID; i++) {
      const c = i * BLOCK;
      if (Math.abs(x - c) < half || Math.abs(z - c) < half) return true;
    }
    return false;
  }

  nearestIntersection(x, z) {
    const ix = clamp(Math.round(x / BLOCK), 0, GRID - 1);
    const iz = clamp(Math.round(z / BLOCK), 0, GRID - 1);
    return { ix, iz, x: ix * BLOCK, z: iz * BLOCK };
  }

  // Neighbouring intersections of (ix, iz), excluding the one we came from.
  nextIntersections(ix, iz, fromIx, fromIz) {
    const out = [];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dz] of dirs) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) continue;
      if (nx === fromIx && nz === fromIz) continue;
      out.push({ ix: nx, iz: nz });
    }
    return out;
  }

  // Pick the next intersection, biasing toward a goal intersection.
  pickNext(ix, iz, fromIx, fromIz, goal) {
    const options = this.nextIntersections(ix, iz, fromIx, fromIz);
    if (options.length === 0) return { ix: fromIx, iz: fromIz }; // dead end: go back
    if (goal) {
      options.sort((a, b) => {
        const da = Math.abs(a.ix - goal.ix) + Math.abs(a.iz - goal.iz);
        const db = Math.abs(b.ix - goal.ix) + Math.abs(b.iz - goal.iz);
        return da - db;
      });
      // Usually head toward the goal, sometimes wander.
      if (this.rng.next() < 0.75) return options[0];
      return this.rng.pick(options);
    }
    return this.rng.pick(options);
  }

  // Waypoint on the road toward intersection (ix,iz), on the right lane.
  lanePoint(fromIx, fromIz, toIx, toIz, lane = 3.2) {
    const dx = toIx - fromIx;
    const dz = toIz - fromIz;
    // Right-hand offset of the travel direction.
    const rx = -dz * lane;
    const rz = dx * lane;
    return { x: toIx * BLOCK + rx, z: toIz * BLOCK + rz };
  }

  collides(x, z, r) {
    for (const c of this.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return c;
    }
    return null;
  }

  // Push a circle out of every building AABB it overlaps.
  resolveCircle(pos, r) {
    for (const c of this.colliders) {
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: shove out along the smallest axis.
          const pushL = pos.x - c.minX + r;
          const pushR = c.maxX - pos.x + r;
          const pushU = pos.z - c.minZ + r;
          const pushD = c.maxZ - pos.z + r;
          const m = Math.min(pushL, pushR, pushU, pushD);
          if (m === pushL) pos.x = c.minX - r;
          else if (m === pushR) pos.x = c.maxX + r;
          else if (m === pushU) pos.z = c.minZ - r;
          else pos.z = c.maxZ + r;
        }
        return true;
      }
    }
    return false;
  }

  build() {
    const { scene, rng } = this;
    const citySize = (GRID - 1) * BLOCK;

    // --- lights and sky ---
    scene.background = new THREE.Color(PALETTE.sky);
    scene.fog = new THREE.Fog(PALETTE.fog, 180, 620);
    const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 700;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.35));

    // --- ground: sidewalk-coloured base for the whole map ---
    const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_EDGE * 2, WORLD_EDGE * 2), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(citySize / 2, 0, citySize / 2);
    ground.receiveShadow = true;
    scene.add(ground);

    // --- roads: dark strips with centre dashes ---
    const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.95 });
    const dashGeo = new THREE.BoxGeometry(0.5, 0.04, 3);
    const dashMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphaltLine, roughness: 0.8 });
    const dashSpots = [];
    for (let i = 0; i < GRID; i++) {
      const c = i * BLOCK;
      const vRoad = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W, 0.06, citySize + ROAD_W * 2), roadMat);
      vRoad.position.set(c, 0.03, citySize / 2);
      vRoad.receiveShadow = true;
      scene.add(vRoad);
      const hRoad = new THREE.Mesh(new THREE.BoxGeometry(citySize + ROAD_W * 2, 0.06, ROAD_W), roadMat);
      hRoad.position.set(citySize / 2, 0.03, c);
      hRoad.receiveShadow = true;
      scene.add(hRoad);
      for (let s = 0; s <= citySize; s += 8) {
        if (s % BLOCK < 10 || s % BLOCK > BLOCK - 10) continue; // keep intersections clear
        dashSpots.push({ x: c, z: s, rot: 0 });
        dashSpots.push({ x: s, z: c, rot: Math.PI / 2 });
      }
    }
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    dashSpots.forEach((d, i) => {
      e.set(0, d.rot, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(d.x, 0.08, d.z), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(i, m4);
    });
    scene.add(dashes);

    // --- sand and sea, south of the city ---
    const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 });
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_EDGE * 2, SEA_START - BEACH_START + 60), sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(citySize / 2, 0.05, BEACH_START + (SEA_START - BEACH_START) / 2);
    sand.receiveShadow = true;
    scene.add(sand);
    const seaMat = new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.1 });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_EDGE * 2, WORLD_EDGE), seaMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(citySize / 2, -0.4, SEA_START + WORLD_EDGE / 2);
    scene.add(this.water);

    // --- buildings, one or more per block ---
    const facadeMats = PALETTE.building.slice(0, 4).map((c) => {
      const hex = '#' + c.toString(16).padStart(6, '0');
      return new THREE.MeshStandardMaterial({ map: makeFacadeTexture(hex, 0.35, rng), roughness: 0.9 });
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6a6a66, roughness: 1 });
    const centerX = citySize / 2;
    const centerZ = citySize / 2;
    for (let bi = 0; bi < GRID - 1; bi++) {
      for (let bj = 0; bj < GRID - 1; bj++) {
        const bx = bi * BLOCK + ROAD_W / 2;
        const bz = bj * BLOCK + ROAD_W / 2;
        const inner = BLOCK - ROAD_W;
        const distC = Math.hypot(bx + inner / 2 - centerX, bz + inner / 2 - centerZ) / (citySize / 2);
        const downtown = distC < 0.45;
        const count = downtown ? rng.int(1, 2) : rng.int(1, 3);
        // Keep the spawn plaza and the beachfront clear.
        if (bi === 4 && bj === 4) continue;
        if (bj === GRID - 2) continue; // beachfront row stays open
        for (let k = 0; k < count; k++) {
          const w = rng.range(10, inner / (count === 1 ? 1 : 2) - 2);
          const d = rng.range(10, inner - 2);
          const h = downtown ? rng.range(22, 64) : rng.range(7, 26);
          const x = bx + rng.range(2, Math.max(3, inner - w - 2)) + w / 2;
          const z = bz + rng.range(2, Math.max(3, inner - d - 2)) + d / 2;
          const mat = rng.pick(facadeMats);
          const geo = new THREE.BoxGeometry(w, h, d);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x, h / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
          // Rooftop box.
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.25, 1.6, d * 0.25), roofMat);
          roof.position.set(x + w * 0.2, h + 0.8, z - d * 0.15);
          scene.add(roof);
          this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
          this.buildings.push(mesh);
        }
      }
    }

    // --- billboards on three towers ---
    const boards = [
      { lines: ['SOLMAR', 'BAY'], bg: '#0e4a6b', fg: '#ffd94a', x: 3 * BLOCK, z: 3 * BLOCK, y: 30 },
      { lines: ['VISTA', 'HOTEL'], bg: '#7a2a3a', fg: '#ffe9d0', x: 5 * BLOCK, z: 2 * BLOCK, y: 26 },
      { lines: ['PIER 9', 'EAT • PLAY'], bg: '#14532d', fg: '#d8ffd8', x: 2 * BLOCK, z: 5 * BLOCK, y: 24 },
    ];
    for (const b of boards) {
      const tex = makeBillboardTexture(b.lines, b.bg, b.fg);
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 9),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })
      );
      board.position.set(b.x, b.y, b.z);
      board.rotation.y = Math.PI / 4;
      scene.add(board);
    }

    // --- pier: wooden deck out into the sea ---
    const pierX = 6 * BLOCK;
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 130), woodMat);
    deck.position.set(pierX, 0.6, SEA_START + 60);
    deck.castShadow = true;
    scene.add(deck);
    const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 3, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 });
    for (let s = 0; s < 130; s += 10) {
      for (const sx of [-4.5, 4.5]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(pierX + sx, -0.6, SEA_START + s);
        scene.add(post);
      }
    }
    this.pierEnd = { x: pierX, z: SEA_START + 118 };

    // --- lamps along every road, instanced ---
    const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6);
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.7, metalness: 0.4 });
    const lampBulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
    const lampSpots = [];
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID - 1; j++) {
        const along = j * BLOCK + BLOCK / 2;
        lampSpots.push({ x: i * BLOCK + ROAD_W / 2 + 0.8, z: along });
        lampSpots.push({ x: along, z: i * BLOCK + ROAD_W / 2 + 0.8 });
      }
    }
    const poles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampSpots.length);
    const bulbs = new THREE.InstancedMesh(lampBulbGeo, lampBulbMat, lampSpots.length);
    lampSpots.forEach((p, i) => {
      m4.makeTranslation(p.x, 2.7, p.z);
      poles.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, 5.5, p.z);
      bulbs.setMatrixAt(i, m4);
    });
    scene.add(poles);
    scene.add(bulbs);

    // --- palms along the beach and the plaza ---
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
    const frondGeo = new THREE.ConeGeometry(1.5, 3.4, 5);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e8a4a, roughness: 1 });
    const palmSpots = [];
    for (let x = 20; x < citySize; x += 26) palmSpots.push({ x, z: BEACH_START + 8 });
    for (let x = 30; x < citySize; x += 40) palmSpots.push({ x, z: 4 * BLOCK + ROAD_W / 2 + 2 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
    palmSpots.forEach((p, i) => {
      m4.makeTranslation(p.x, 3, p.z);
      trunks.setMatrixAt(i, m4);
      e.set(Math.PI / 2.6, rng.next() * Math.PI * 2, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, 6.4, p.z), q, new THREE.Vector3(1, 1, 1));
      fronds.setMatrixAt(i, m4);
      this.colliders.push({ minX: p.x - 0.5, maxX: p.x + 0.5, minZ: p.z - 0.5, maxZ: p.z + 0.5 });
    });
    scene.add(trunks);
    scene.add(fronds);

    // --- drifting clouds (unlit so they stay bright white) ---
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Mesh(new THREE.BoxGeometry(rng.range(24, 48), 4, rng.range(12, 22)), cloudMat);
      cloud.position.set(rng.range(0, citySize), rng.range(70, 110), rng.range(0, citySize));
      scene.add(cloud);
      this.clouds.push(cloud);
    }

    // World bounds: keep the player inside the map.
    this.bounds = { min: -20, max: citySize + 20 };
  }

  update(dt, t) {
    if (this.water) {
      this.water.position.y = -0.4 + Math.sin(t * 0.7) * 0.12;
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += dt * (1.2 + i * 0.12);
      if (c.position.x > CITY.WORLD_EDGE) c.position.x = -40;
    }
  }
}
