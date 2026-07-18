# Urban Strike — V4.0 Architecture

## Module map

    public/src/
      config/           # THE balance layer — edit these, never source
        weapons.config.js    WEAPONS, WEAPON_ORDER, THROWS, ATTACH
        gameplay.config.js   PLAYER, ARMOR, MOVE, SPAWNS, NET, MATCH
        loot.config.js       LOOT_ITEMS/WEIGHTS/RESPAWN/POINTS, AIRDROP
        world.config.js      COLORS, TEAMS, MODES, MINIMAP
        index.js             merges parts -> global CFG (browser) / module.exports (node)
      core/game.js        boot, input, main loop, match lifecycle glue
      player/controller.js  movement, collision, stance, landing detection
      weapons/
        viewmodels.js     WeaponModels.build() -> first-person model per WEAPON_ORDER entry
        system.js         firing, ammo, attachments (eff stats), grenades, grants
      networking/
        avatars.js        Avatars.buildAvatar/setRemoteGun/drawHpBar (render-only)
        net.js            socket, snapshots, interpolation, event handlers
      loot/pickups.js     loot meshes, airdrop crates, beacons
      environment/  (merge.js: post-build static draw-call collapse, ~1500 -> ~20)
        world.js          materials, build helpers, districts 1-2, exposes T contract
        districts-south.js  World._buildPart3(T) — the district template
      effects/effects.js  particles, tracers, damage numbers, decals
      audio/audio.js      synthesized SFX (Web Audio, zero assets)
      audio/voice.js      WebRTC mesh voice: PTT, glare-free newcomer-initiates signaling
      ui/ui.js, ui/minimap.js

    server.js             express/socket wiring, match flow, snapshots, spawns
    server/lib/
      rooms.js            codes, membership, team balancing, lobby payloads
      loot.js             loot rolls, collection, respawns, airdrops
      combat.js           damage model, armor soak, assists, hit validation
      mines.js            server-authoritative AP mines (place/arm/trigger/splash)

## Contracts (do not break without bumping all sides)
- **CFG**: merged config object; server and client read identical values.
- **Snapshot wp**: `CFG.WEAPON_ORDER[wp]` — Avatars.setRemoteGun consumes it.
- **District T**: world.js hands districts its material + builder helpers; every
  V4.2 zone is a new `districts-*.js` file implementing `World._buildPartN(T)`.
- **Voice signaling**: voiceJoin/voiceLeave/voiceSignal relay, room-scoped and
  gated on both peers having opted in; media is pure P2P (server never sees audio).
- **Server ctx**: lib modules receive `{ io, rooms, now, modeInfo, pushLobby,
  endMatch }` — they never touch globals.

## Extension points (Phase 12 — reserved, not implemented)
- Bots: new `server/lib/ai.js` driving the same `st`/`hit` events as clients.
- Vehicles: `environment/` prop + `player/` mount state + snapshot field.
- Spectator: net.js snapshot fan-out already carries full player state.
- Battle royale / new modes: `MODES` config + match-flow hooks in server.js.
- Lobby v2 / chat: core/game.js UI seam + rooms.js payload extension.

## Config completion status
Gameplay-critical values are fully config-driven. Visual/audio literals
(light colors, fog, synth params) migrate to config alongside V4.1 graphics
work, where each value will be touched anyway.
