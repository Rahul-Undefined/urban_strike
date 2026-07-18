/* Remote-player presentation: avatar bodies, name tags, hp bars, and the
   per-weapon third-person models applied from snapshot wp indices. Pure
   rendering — no sockets, no interpolation, no game state. */
var Avatars = (function () {
  'use strict';
  function nameTag(text, color) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.font = 'bold 34px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(10,12,16,0.6)';
    var w = g.measureText(text).width + 26;
    g.fillRect(128 - w / 2, 8, w, 46);
    g.fillStyle = color;
    g.fillText(text, 128, 42);
    var t = new THREE.CanvasTexture(c);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(1.7, 0.42, 1);
    return s;
  }

  // ---------- third-person weapon models ----------
  var RGM = {
    dark: new THREE.MeshLambertMaterial({ color: 0x23262c }),
    steel: new THREE.MeshLambertMaterial({ color: 0x54595f }),
    wood: new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
    tan: new THREE.MeshLambertMaterial({ color: 0x4a4438 }),
    green: new THREE.MeshLambertMaterial({ color: 0x36402e })
  };
  function rgBox(g, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); g.add(b); return b;
  }
  function buildRemoteGun(name) {
    var w = CFG.WEAPONS[name] || CFG.WEAPONS.ak47;
    var g = new THREE.Group();
    if (w.type === 'melee') {
      rgBox(g, 0, 0, -0.12, 0.02, 0.05, 0.26, RGM.steel);
      rgBox(g, 0, -0.02, 0.04, 0.035, 0.06, 0.1, RGM.wood);
      return g;
    }
    if (name === 'pistol') {
      rgBox(g, 0, 0, -0.08, 0.05, 0.07, 0.22, RGM.dark);
      rgBox(g, 0, -0.07, 0.02, 0.045, 0.1, 0.06, RGM.dark);
      return g;
    }
    if (w.type === 'rocket') {
      rgBox(g, 0, 0.02, -0.1, 0.11, 0.11, 0.85, RGM.green);
      rgBox(g, 0, 0.02, -0.55, 0.13, 0.13, 0.1, RGM.dark);
      return g;
    }
    var LEN = { sniper: 0.9, awm: 0.98, mk14: 0.82, m249: 0.78, shotgun: 0.68, scarh: 0.66, ak47: 0.64, m4a1: 0.64, uzi: 0.4, p90: 0.44 };
    var len = LEN[name] || 0.62;
    var bodyM = (name === 'ak47' || name === 'mk14') ? RGM.wood
      : (name === 'm249' || name === 'sniper') ? RGM.green
      : (name === 'scarh' || name === 'awm') ? RGM.tan : RGM.dark;
    rgBox(g, 0, 0, -len * 0.28, 0.07, 0.095, len, bodyM);                    // body
    rgBox(g, 0, 0.005, -len * 0.78, 0.03, 0.035, len * 0.5, RGM.dark);       // barrel
    var magB = rgBox(g, 0, -0.1, -0.06, 0.05, 0.13, 0.07, RGM.dark);         // magazine
    rgBox(g, 0, -0.02, 0.2, 0.05, 0.08, 0.16, bodyM);                        // stock
    if (w.scope) rgBox(g, 0, 0.085, -0.12, 0.045, 0.05, 0.2, RGM.dark);      // scope
    if (name === 'm249') rgBox(g, 0, -0.08, 0.02, 0.1, 0.12, 0.12, RGM.green); // belt box
    if (name === 'shotgun') rgBox(g, 0, -0.045, -0.34, 0.05, 0.05, 0.16, RGM.wood); // pump
    if (name === 'p90') { magB.visible = false; rgBox(g, 0, 0.075, -0.05, 0.05, 0.03, 0.26, RGM.steel); } // top mag
    return g;
  }
  // Swap the avatar's held model whenever the snapshot weapon index changes.
  function setRemoteGun(r, wpIdx) {
    var name = CFG.WEAPON_ORDER[wpIdx] || 'ak47';
    if (r.gunName === name) return;
    r.gunName = name;
    var h = r.av.gun;
    while (h.children.length) h.remove(h.children[0]);
    h.add(buildRemoteGun(name));
  }

  function buildAvatar(name, colorHex) {
    var color = new THREE.Color(colorHex);
    var body = new THREE.MeshLambertMaterial({ color: color });
    var dark = new THREE.MeshLambertMaterial({ color: 0x23262c });
    var skin = new THREE.MeshLambertMaterial({ color: 0x9c8468 });
    var g = new THREE.Group();
    function bx(x, y, z, w, h, d, m) {
      var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z); b.castShadow = true; g.add(b); return b;
    }
    var torso = bx(0, 0.16, 0, 0.6, 0.7, 0.34, body);
    var head = bx(0, 0.66, 0, 0.3, 0.3, 0.3, skin);
    bx(0, 0.74, 0, 0.32, 0.1, 0.32, dark); // helmet band
    var legL = bx(-0.14, -0.55, 0, 0.17, 0.72, 0.2, dark);
    var legR = bx(0.14, -0.55, 0, 0.17, 0.72, 0.2, dark);
    var armL = bx(-0.4, 0.16, 0, 0.13, 0.6, 0.18, body);
    var armR = bx(0.4, 0.16, 0, 0.13, 0.6, 0.18, body);
    var gun = new THREE.Group();                 // per-weapon model holder
    gun.position.set(0.18, 0.28, -0.42);
    g.add(gun);
    var tag = nameTag(name, colorHex);
    tag.position.y = 1.18; g.add(tag);
    // floating health bar (canvas sprite, redrawn only when hp changes)
    var hc = document.createElement('canvas'); hc.width = 128; hc.height = 18;
    var htx = new THREE.CanvasTexture(hc);
    var hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: htx, depthTest: false, transparent: true }));
    hs.scale.set(0.92, 0.13, 1);
    hs.position.y = 0.98; hs.visible = false; g.add(hs);
    var hb = { sprite: hs, canvas: hc, ctx: hc.getContext('2d'), tex: htx };
    return { group: g, legL: legL, legR: legR, gun: gun, head: head, torso: torso, hb: hb };
  }

  function drawHpBar(r, ally) {
    var g = r.av.hb.ctx, W = 128, H = 18;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,14,0.78)';
    g.fillRect(0, 2, W, H - 4);
    var frac = Math.max(0, Math.min(1, r.dispHp / CFG.PLAYER.hp));
    g.fillStyle = ally ? (myTeam ? CFG.TEAMS[myTeam].color : '#63d968') : '#e8563e';
    g.fillRect(2, 4, (W - 4) * frac, H - 8);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 3, W - 2, H - 6);
    r.av.hb.tex.needsUpdate = true;
  }

  return {
    buildAvatar: buildAvatar,
    setRemoteGun: setRemoteGun,
    drawHpBar: drawHpBar
  };
})();
