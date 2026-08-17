/* A trimmed THREE for the headless gates — WITH GEOMETRY PARAMETERS.

   HANDOFF §4.5 records that the map gates run a cut-down THREE and that
   Float32BufferAttribute, Box3 and Group.traverse are absent. What it does not
   record, and what cost real time in v10, is that the existing stubs also
   dropped `geometry.parameters`.

   That matters more than it sounds. viewmodels.js measures each weapon's
   muzzle by walking its parts and reading `o.geometry.parameters.depth`:

       if (!o.geometry || !o.geometry.parameters) return;

   Under a stub with no parameters that guard skips EVERY part, minZ stays
   Infinity, and the fallback fires. So every weapon measured -0.700 in the
   gates and something else entirely in the browser — the gates were reading a
   constant and reporting it as a measurement. Any assertion about barrel
   length, muzzle position or hand placement was therefore vacuous.

   This stub stores the constructor arguments the same way real THREE does, so
   a measurement taken here is the measurement the browser takes. Use it for
   anything that reads geometry; the older inline stubs remain valid for tests
   that only care about tree structure. */

function Vec(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
Vec.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
Vec.prototype.clone = function () { return new Vec(this.x, this.y, this.z); };
Vec.prototype.copy = function (o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; };
Vec.prototype.add = function (o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; };
Vec.prototype.sub = function (o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; };
Vec.prototype.multiplyScalar = function (s) { this.x *= s; this.y *= s; this.z *= s; return this; };
Vec.prototype.addScaledVector = function (o, s) { this.x += o.x * s; this.y += o.y * s; this.z += o.z * s; return this; };
Vec.prototype.length = function () { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); };
Vec.prototype.normalize = function () { var l = this.length() || 1; return this.multiplyScalar(1 / l); };
Vec.prototype.applyQuaternion = function () { return this; };
Vec.prototype.setScalar = function (s) { this.x = this.y = this.z = s; return this; };

function Obj() {
  this.children = []; this.position = new Vec(); this.rotation = new Vec();
  this.scale = new Vec(1, 1, 1); this.userData = {}; this.visible = true;
  this.castShadow = false; this.receiveShadow = false;
}
Obj.prototype.add = function () {
  for (var i = 0; i < arguments.length; i++) this.children.push(arguments[i]);
  return this;
};
Obj.prototype.remove = function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return this; };
Obj.prototype.getWorldQuaternion = function (q) { return q; };
Obj.prototype.getWorldDirection = function (v) { return v; };
/* Present here even though the map gates' THREE lacks it, because a gate that
   needs to walk a tree should not have to reimplement the walk. Production
   code must still avoid it — see viewmodels.js, which uses an explicit stack. */
Obj.prototype.traverse = function (fn) {
  fn(this);
  for (var i = 0; i < this.children.length; i++) this.children[i].traverse(fn);
};

/* THE POINT OF THIS FILE. Real THREE geometries expose the arguments they were
   built from on `.parameters`, and production code reads them. */
function Box(w, h, d) { this.parameters = { width: w, height: h, depth: d }; this.type = 'BoxGeometry'; }
function Cyl(rt, rb, h, s) { this.parameters = { radiusTop: rt, radiusBottom: rb, height: h, radialSegments: s }; this.type = 'CylinderGeometry'; }
function Sph(r, w, h) { this.parameters = { radius: r, widthSegments: w, heightSegments: h }; this.type = 'SphereGeometry'; }
function Pln(w, h) { this.parameters = { width: w, height: h }; this.type = 'PlaneGeometry'; }
function Con(r, h, s) { this.parameters = { radius: r, height: h, radialSegments: s }; this.type = 'ConeGeometry'; }

function Mat(o) { o = o || {}; this.color = o.color; this.opacity = o.opacity; this.transparent = o.transparent; this.side = o.side; this.map = o.map; }
function Noop() { }

function Mesh(geometry, material) { Obj.call(this); this.geometry = geometry; this.material = material; }
Mesh.prototype = Object.create(Obj.prototype);
Mesh.prototype.constructor = Mesh;

var THREE = {
  Group: Obj, Object3D: Obj, Scene: Obj, Sprite: Obj, Mesh: Mesh,
  Vector3: Vec, Vector2: Vec,
  BoxGeometry: Box, BufferGeometry: Box, CylinderGeometry: Cyl,
  SphereGeometry: Sph, PlaneGeometry: Pln, ConeGeometry: Con,
  MeshLambertMaterial: Mat, MeshBasicMaterial: Mat, MeshPhongMaterial: Mat,
  MeshStandardMaterial: Mat, SpriteMaterial: Mat, LineBasicMaterial: Mat,
  CanvasTexture: Noop, Texture: Noop, Color: Noop, Quaternion: Noop,
  Raycaster: Noop, Matrix4: Noop, Euler: Noop,
  DoubleSide: 2, FrontSide: 0, BackSide: 1, AdditiveBlending: 2, NormalBlending: 1,
  RepeatWrapping: 1000, NearestFilter: 1003, LinearFilter: 1006
};

/* Half-extents of a part as production code computes them, including the
   x-rotation swap that turns an upright cylinder into a barrel. */
function halfExtents(o) {
  if (!o.geometry || !o.geometry.parameters) return null;
  var p = o.geometry.parameters;
  var hx = (p.width !== undefined ? p.width : (p.radius !== undefined ? p.radius * 2 : (p.radiusTop || 0) * 2)) / 2;
  var hy = (p.height !== undefined ? p.height : 0) / 2;
  var hz = (p.depth !== undefined ? p.depth : (p.height || 0)) / 2;
  if (o.rotation && Math.abs(o.rotation.x) > 1) { var t = hz; hz = hy; hy = t; }
  return { hx: hx, hy: hy, hz: hz };
}

/* Iterative walk — matches the explicit-stack style production uses. */
function walk(root, fn) {
  var stack = (root.children || []).slice(), o;
  while (stack.length) {
    o = stack.pop();
    if (o.children && o.children.length) stack.push.apply(stack, o.children);
    fn(o);
  }
}

module.exports = { THREE: THREE, Vec: Vec, Obj: Obj, Mesh: Mesh, halfExtents: halfExtents, walk: walk };
