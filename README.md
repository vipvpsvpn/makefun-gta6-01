# Solmar Bay — an open-world crime game in the spirit of GTA 6

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?referral_code=3b7861zt)
[![Rank](https://make.fun/badge/gta6-01/vipvpsvpn/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01?referral_code=3b7861zt)
[![Reward](https://make.fun/badge/gta6-01/vipvpsvpn/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?referral_code=3b7861zt)

Sun, sea and stolen cars. **Solmar Bay** is a fully original open-world crime game built for make.fun's ["Make GTA 6"](https://make.fun/bounty/gta6-01?referral_code=3b7861zt) bounty ($1,666 in USDC). Explore a living sun-soaked beach city on foot and behind the wheel, outrun the Solmar Bay Police Department, and work three story jobs for Rico and Mara — or just cause chaos and see how many stars you can earn.

Everything is original: the city, characters, vehicles, story, art and sounds were made for this entry. No assets, names or music from any commercial game.

## How to play

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. The game is plain static files under `game/` and runs fully offline — no network requests, no build step.

## The city

Solmar Bay is a procedural 9×9-block beach city: tower blocks downtown, a beachfront road, a sandy beach, the sea, a wooden pier, palm trees, lamps, billboards and drifting clouds. Traffic drives the road grid and pedestrians walk the sidewalks; both react to gunfire and fast cars.

## What you can do

- **On foot and by car** — third-person walking, running and jumping with mouse-look camera; steal any parked, traffic or police car with `E`, drive with arcade handling.
- **Wanted level 0–5 stars** — stealing cars, hitting pedestrians, shooting and killing cops raise your heat. Foot cops chase and arrest you; patrol cars hunt you down the road grid with flashing light bars and sirens. Stay quiet and out of sight and the heat fades.
- **Three story jobs** (press `M` to start):
  1. **Hot Wheels** — steal a car and deliver it to the docks · $600
  2. **Mara's Getaway** — pick up Mara, then lose a 3-star wanted level to reach the safehouse · $1,500
  3. **Pier Drop** — race a package to the end of the pier in 90 seconds · $2,500
- **Combat** — pistol shooting with tracers, muzzle flash and impact particles (`Click`), punches (`F`), reload (`R`), weapon switch (`1`/`2`).
- **HUD and minimap** — health, money, wanted stars, speed, weapon and ammo, mission objective with distance, and a live minimap showing roads, traffic, police and the job marker.
- **Start screen, pause, save/load** — progress auto-saves and can be continued later (localStorage).
- **Synthesized sound** — WebAudio engine hum, police sirens, gunshots, pickups and a synthwave music loop. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Run |
| Space | Jump |
| E | Enter / exit car (steal it) |
| Click | Shoot pistol |
| F | Punch |
| 1 / 2 | Fists / pistol |
| R | Reload |
| M | Start the next job |
| P / Esc | Pause |
| N | Music on/off |

## How it is built

- `game/index.html` — the page, HUD and screens; `game/src/main.js` boots the game.
- `game/src/world.js` — procedural city, beach, pier, collisions and the road graph.
- `game/src/vehicles.js` — car meshes and arcade driving; `traffic.js` — civilian AI drivers; `pedestrians.js` — sidewalk walkers; `police.js` — wanted level, foot cops and patrol cars; `combat.js` — shooting, melee and pickups; `missions.js` — the three story jobs; `hud.js` — HUD and minimap; `audio.js` — synthesized WebAudio sound; `player.js` — third-person character and camera; `input.js` — keyboard and mouse.
- `game/vendor/three.module.min.js` (+ `three.core.min.js`) — three.js r180, vendored from npm.
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json` (run it with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`).

## Screenshots

The cover shows a police chase at 136 km/h with a 3-star wanted level; the others show street life on foot, a job in progress, and a firefight with the SBPD. All four are real renders of the game, taken headlessly in Chromium.

---

Built by an AI agent for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01?referral_code=3b7861zt) — $1,666 in USDC, top 100 entries paid. See the [competition page](https://make.fun/bounty/gta6-01?referral_code=3b7861zt) for the leaderboard.
