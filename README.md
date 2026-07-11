# URBAN STRIKE — browser multiplayer FPS (2–4 players)

A Counter-Strike-inspired deathmatch you run yourself. No accounts, no downloads for your friends — you share a 5-letter room code, they open a link.

**Map:** "Sector 7" industrial district — enterable warehouse, 3-floor apartment with rooftop sniper nest, office, garage, watchtower, shipping containers, wrecked and parked vehicles as cover, craters, alleys.

**Weapons:** AK-47, M4A1, bolt-action sniper (with scope), Uzi, pump shotgun, pistol, rocket launcher, knife + frag / smoke / flash grenades.

**Netcode:** server-authoritative health with hit validation, 15 Hz snapshots, client interpolation, respawn at the spawn farthest from enemies.

**Audio:** every sound is synthesized in the browser (Web Audio) — footsteps are directional and quieter when crouched.

---

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| SHIFT (hold) | Sprint (forward only) |
| SPACE | Jump |
| C (hold) | Crouch |
| Q / E (hold) | Lean left / right |
| Mouse | Look · **Left click** fire · **Right click (hold)** aim / scope |
| 1–8 or mouse wheel | Switch weapon |
| R | Reload |
| G / T / F | Frag / Smoke / Flash grenade |
| TAB (hold) | Scoreboard |
| ESC | Pause (sensitivity, volume, shadows) |

---

## 1. Run it on your PC (5 minutes, one-time setup)

1. Install **Node.js** (LTS version) from https://nodejs.org — click Next through the installer.
2. Unzip this folder somewhere, e.g. `C:\urban-strike`.
3. Open the folder, click the address bar, type `cmd`, press Enter. A black window opens **in this folder**.
4. Type these two commands (the first one only needed once):

```
npm install
npm start
```

5. You should see `UrbanStrike server running on http://localhost:3000`.
6. Open **http://localhost:3000** in Chrome or Edge → CREATE ROOM.

> The game loads one library (three.js) from a CDN, so the playing device needs internet even on LAN.

## 2. Play with friends on the same WiFi

1. In that black window, type `ipconfig` and find your **IPv4 Address** (looks like `192.168.1.23`).
2. Friends on the same WiFi open `http://192.168.1.23:3000` and JOIN with your room code.
3. If it doesn't load, Windows Firewall is blocking Node — allow it when prompted, or temporarily allow "Node.js" in firewall settings.

## 3. Play over the internet — free (Render.com)

Friends anywhere in the world, no router setup:

1. Create a free account at https://github.com and click **New repository** → name it `urban-strike` → create.
2. On the repo page: **uploading an existing file** → drag ALL files/folders from this project **except `node_modules`** → Commit.
3. Create a free account at https://render.com → **New → Web Service** → connect that GitHub repo.
4. Settings: Runtime **Node**, Build command `npm install`, Start command `npm start`, Instance type **Free**. Click Create.
5. After ~2 minutes you get a URL like `https://urban-strike.onrender.com`. Share it — everyone plays there.

> Free tier note: the server sleeps after ~15 idle minutes; the first visit after that takes ~40 s to wake. Fine for evening sessions with friends.

---

## Tuning the game

All balance lives in **`public/js/shared-config.js`** — damage, fire rate, recoil, movement speed, grenade counts, respawn delay. Change a number, restart with `npm start`, done. The server reads the same file, so hits stay validated.

## Testing

With the server running in one window, open a second `cmd` in the folder and run `npm test` — it simulates two players (room → join → match → kills → respawn) and prints PASS/FAIL.

## Troubleshooting

- **"port 3000 in use"** → another copy is running; close old windows, or run `set PORT=3100 && npm start` and use :3100.
- **Low FPS on an old laptop** → ESC → untick *Dynamic shadows*.
- **Black screen** → the device has no internet (three.js CDN) or the browser is very old; use current Chrome/Edge/Firefox.
- **Can't aim / mouse not captured** → click the game once ("CLICK TO TAKE CONTROL"); browsers require a click before locking the mouse.
