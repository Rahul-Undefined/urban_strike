(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  var WEAPONS = {
    // Base loadout (keys 1-8) — every player always carries these.
    ak47:    { key: 1, label: 'AK-47', type: 'auto', dmg: 30, rpm: 590, mag: 30, reserve: 120, reload: 2.3, spread: 0.017, ads: 0.006, range: 46, head: 1.9, legs: 0.72, speed: 0.94, recoil: 0.012, drift: 0.55, adsFov: 50, trc: 0xffb060 },
    m4a1:    { key: 2, label: 'M4A1', type: 'auto', dmg: 26, rpm: 700, mag: 30, reserve: 150, reload: 2.0, spread: 0.014, ads: 0.005, range: 44, head: 1.8, legs: 0.72, speed: 0.95, recoil: 0.009, drift: 0.4, adsFov: 50, trc: 0xffe2b0 },
    sniper:  { key: 3, label: 'AWM-S', type: 'bolt', dmg: 88, rpm: 42, mag: 5, reserve: 25, reload: 3.2, spread: 0.0015, ads: 0.0004, range: 999, head: 2.0, legs: 0.6, speed: 0.85, recoil: 0.03, drift: 0.2, adsFov: 16, scope: true, boltTime: 1.25, scopeZoom: [10, 26], bullet: true, bulletSpeed: 240, bulletDrop: 4.2, sway: 0.0038, trc: 0xcfe8ff },
    uzi:     { key: 4, label: 'UZI-9', type: 'auto', dmg: 17, rpm: 950, mag: 32, reserve: 128, reload: 1.9, spread: 0.030, ads: 0.014, range: 22, head: 1.5, legs: 0.72, speed: 1.02, recoil: 0.010, drift: 0.9, adsFov: 55, trc: 0xffc46a, snd: { body: { f0: 2100, f1: 800, dur: 0.05, vol: 0.5 }, crack: { f: 2600, dur: 0.03, vol: 0.3 } } },
    shotgun: { key: 5, shellReload: true, label: 'M870', type: 'semi', dmg: 11, pellets: 9, rpm: 75, mag: 6, reserve: 30, reload: 3.4, spread: 0.075, ads: 0.05, range: 9, head: 1.4, legs: 0.8, speed: 0.96, recoil: 0.05, drift: 0.2, adsFov: 58, trc: 0xffa050, snd: { body: { f0: 700, f1: 140, dur: 0.22, vol: 0.95 }, crack: { f: 900, dur: 0.06, vol: 0.4 }, boom: { f0: 130, f1: 55, dur: 0.3, vol: 0.5 } } },
    pistol:  { key: 6, label: 'P92', type: 'semi', dmg: 24, rpm: 380, mag: 12, reserve: 60, reload: 1.2, spread: 0.011, ads: 0.004, range: 28, head: 1.8, legs: 0.72, speed: 1.0, recoil: 0.0075, drift: 0.3, adsFov: 52, trc: 0xffd9a0 },
    rocket:  { label: 'RPG-L',    type: 'rocket',key: 7, dmg: 120, radius: 6.5, rpm: 30, mag: 1, reserve: 2, reload: 3.6, spread: 0.008, ads: 0.004, recoil: 0.120, drift: 0.2, range: 300, speed: 0.85, adsFov: 58, projSpeed: 30 },
    knife:   { key: 8, label: 'KA-BAR', type: 'melee', dmg: 55, rpm: 110, mag: 0, reserve: 0, reload: 0, spread: 0, ads: 0, range: 2.4, head: 1.4, legs: 1.0, speed: 1.08, recoil: 0, drift: 0, adsFov: 60 },
    // Exclusive loot weapons (key 9) — found on the map / in airdrops only.
    scarh:   { key: 9, ex: 1, label: 'SCAR-H', type: 'auto', dmg: 33, rpm: 560, mag: 25, reserve: 100, reload: 2.4, spread: 0.015, ads: 0.005, range: 50, head: 1.9, legs: 0.72, speed: 0.92, recoil: 0.013, drift: 0.5, adsFov: 48, trc: 0xffcf80 },
    mk14:    { key: 9, ex: 1, label: 'MK-14 EBR', type: 'semi', dmg: 46, rpm: 300, mag: 15, reserve: 60, reload: 2.6, spread: 0.008, ads: 0.0018, range: 70, head: 2.1, legs: 0.65, speed: 0.90, recoil: 0.02, drift: 0.35, adsFov: 34, trc: 0xd8f0ff },
    p90:     { key: 9, ex: 1, label: 'P90', type: 'auto', dmg: 19, rpm: 900, mag: 50, reserve: 150, reload: 2.4, spread: 0.026, ads: 0.012, range: 26, head: 1.5, legs: 0.72, speed: 1.0, recoil: 0.009, drift: 0.8, adsFov: 54, trc: 0xffd070 },
    m249:    { key: 9, ex: 1, label: 'M249 SAW', type: 'auto', dmg: 27, rpm: 680, mag: 100, reserve: 200, reload: 5.2, spread: 0.024, ads: 0.010, range: 42, head: 1.6, legs: 0.72, speed: 0.84, recoil: 0.014, drift: 1.0, adsFov: 50, trc: 0xffa860, snd: { body: { f0: 1500, f1: 300, dur: 0.11, vol: 0.8 }, crack: { f: 1700, dur: 0.05, vol: 0.35 }, boom: { f0: 170, f1: 90, dur: 0.14, vol: 0.3 } } },
    awm:     { key: 9, ex: 1, label: 'AWM .338', type: 'bolt', dmg: 118, rpm: 32, mag: 5, reserve: 15, reload: 3.6, spread: 0.001, ads: 0.0003, range: 999, head: 2.0, legs: 0.6, speed: 0.82, recoil: 0.035, drift: 0.2, adsFov: 14, scope: true, boltTime: 1.35, scopeZoom: [8, 24], bullet: true, bulletSpeed: 300, bulletDrop: 3.4, sway: 0.0030, trc: 0xbfe0ff },
  };

  var WEAPON_ORDER = ['ak47', 'm4a1', 'sniper', 'uzi', 'shotgun', 'pistol', 'rocket', 'knife',
    'scarh', 'mk14', 'p90', 'm249', 'awm'];

  var THROWS = {
    frag:  { label: 'Frag',  dmg: 110, radius: 7.0, fuse: 2.8, count: 2, throwVel: 16, cook: true },
    smoke: { label: 'Smoke', dur: 12, radius: 5.5, fuse: 1.4, count: 1, throwVel: 14 },
    molotov: { label: 'Molotov', dmg: 80, burnDps: 12, burnSec: 5, radius: 3.4, tickSec: 0.45, fuse: 99, count: 3, maxCarry: 6, throwVel: 13, impact: true },
    flash: { label: 'Flash', radius: 15, blind: 3.2, fuse: 1.4, count: 1, throwVel: 16 }
  };

  // Deployable gear (mines are fully server-authoritative)
  var GEAR = {
    mine: { label: 'AP Mine', start: 5, maxCarry: 8, dmg: 250, radius: 3.2, trigger: 1.0, armSec: 1.0 }
  };

  var ATTACH = {
    reddot: { cat: 'sight',  label: 'Red Dot',       spreadMult: 0.85 },
    x2:     { cat: 'sight',  label: '2x Scope',      adsFov: 40, spreadMult: 0.9 },
    x4:     { cat: 'sight',  label: '4x Scope',      adsFov: 22, spreadMult: 0.9 },
    extmag: { cat: 'mag',    label: 'Ext. Mag',      magMult: 1.4 },
    quick:  { cat: 'mag',    label: 'Quickdraw Mag', reloadMult: 0.72 },
    supp:   { cat: 'muzzle', label: 'Suppressor',    quiet: 1, noFlash: 1, detectMs: 1200 },
    flashh: { cat: 'muzzle', label: 'Flash Hider',   noFlash: 1 },
    comp:   { cat: 'muzzle', label: 'Compensator',   recoilMult: 0.8 }
  };

  return { WEAPONS: WEAPONS, WEAPON_ORDER: WEAPON_ORDER, THROWS: THROWS, ATTACH: ATTACH, GEAR: GEAR };
});
