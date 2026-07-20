(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  var WEAPONS = {
    // Base loadout (keys 1-8) — every player always carries these.
    ak47:    { label: 'AK-47',    type: 'auto',  key: 1, dmg: 33, head: 2.4, rpm: 600, mag: 30, reserve: 120, reload: 2.5, spread: 0.022, ads: 0.006,  recoil: 0.030, drift: 0.55, range: 80,  speed: 0.93, adsFov: 55 },
    m4a1:    { label: 'M4A1',     type: 'auto',  key: 2, dmg: 26, head: 2.2, rpm: 780, mag: 30, reserve: 150, reload: 2.2, spread: 0.017, ads: 0.0045, recoil: 0.021, drift: 0.35, range: 85,  speed: 0.95, adsFov: 55 },
    sniper:  { label: 'AWM-S',    type: 'bolt',  key: 3, dmg: 95, head: 2.5, rpm: 34,  mag: 5,  reserve: 20,  reload: 3.4, spread: 0.09,  ads: 0.0006, recoil: 0.090, drift: 0.2, range: 220, speed: 0.88, adsFov: 16, scope: true, boltTime: 1.25, scopeZoom: [10, 26] },
    uzi:     { label: 'Uzi',      type: 'auto',  key: 4, dmg: 18, head: 1.8, rpm: 950, mag: 32, reserve: 160, reload: 1.8, spread: 0.030, ads: 0.016,  recoil: 0.013, drift: 0.8, range: 38,  speed: 1.02, adsFov: 62 },
    shotgun: { label: 'Pump 870', type: 'pump',  key: 5, dmg: 11, head: 1.5, rpm: 68,  mag: 6,  reserve: 30,  reload: 0.55, pellets: 8, spread: 0.05, ads: 0.035, recoil: 0.075, drift: 0.3, range: 20, speed: 0.94, adsFov: 60, shellReload: true },
    pistol:  { label: 'P-9',      type: 'semi',  key: 6, dmg: 24, head: 2.2, rpm: 420, mag: 12, reserve: 72,  reload: 1.5, spread: 0.012, ads: 0.005,  recoil: 0.015, drift: 0.3, range: 55,  speed: 1.05, adsFov: 60 },
    rocket:  { label: 'RPG-L',    type: 'rocket',key: 7, dmg: 120, radius: 6.5, rpm: 30, mag: 1, reserve: 2, reload: 3.6, spread: 0.008, ads: 0.004, recoil: 0.120, drift: 0.2, range: 300, speed: 0.85, adsFov: 58, projSpeed: 30 },
    knife:   { label: 'Knife',    type: 'melee', key: 8, dmg: 55, head: 1.0, rpm: 82,  mag: 0,  reserve: 0,   reload: 0,   spread: 0, ads: 0, recoil: 0.01, drift: 0, range: 2.3, speed: 1.08, adsFov: 70 },
    // Exclusive loot weapons (key 9) — found on the map / in airdrops only.
    scarh:   { label: 'SCAR-H',   type: 'auto',  key: 9, ex: 1, dmg: 38, head: 2.3, rpm: 560, mag: 25, reserve: 100, reload: 2.4, spread: 0.020, ads: 0.005, recoil: 0.034, drift: 0.45, range: 90, speed: 0.92, adsFov: 55 },
    mk14:    { label: 'MK14 EBR', type: 'semi',  key: 9, ex: 1, dmg: 46, head: 2.3, rpm: 340, mag: 20, reserve: 80,  reload: 2.6, spread: 0.014, ads: 0.002, recoil: 0.045, drift: 0.3, range: 120, speed: 0.92, adsFov: 38 },
    p90:     { label: 'P90',      type: 'auto',  key: 9, ex: 1, dmg: 16, head: 1.8, rpm: 1000, mag: 50, reserve: 150, reload: 2.3, spread: 0.026, ads: 0.012, recoil: 0.011, drift: 0.75, range: 42, speed: 1.05, adsFov: 62 },
    m249:    { label: 'M249',     type: 'auto',  key: 9, ex: 1, dmg: 28, head: 2.0, rpm: 720, mag: 100, reserve: 200, reload: 4.6, spread: 0.030, ads: 0.009, recoil: 0.026, drift: 0.7, range: 75, speed: 0.84, adsFov: 58 },
    awm:     { label: 'AWM',      type: 'bolt',  key: 9, ex: 1, dmg: 118, head: 2.5, rpm: 30, mag: 5, reserve: 15, reload: 3.6, spread: 0.09, ads: 0.0005, recoil: 0.100, drift: 0.2, range: 240, speed: 0.86, adsFov: 14, scope: true, boltTime: 1.35, scopeZoom: [8, 24] }
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
