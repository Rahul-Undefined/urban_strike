/* Unit-verifies StaticMerge against the REAL three@0.128 (devDependency):
   batch composition, vertex/index accounting, rotation-correct transforms
   via bounding-box union, skip rules, and second-pass idempotence.
   Run: node tools/verify-merge.js */
let THREE;
try { THREE = require("three"); }
catch (e) { console.log("SKIP verify-merge: three not installed (npm install)"); process.exit(0); }
const StaticMerge = require("../public/src/environment/merge.js");

let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log("  PASS  " + label); } else { fail++; console.log("  FAIL  " + label); } }

const scene = new THREE.Scene();
const matA = new THREE.MeshLambertMaterial({ color: 0x888888 });
const matB = new THREE.MeshLambertMaterial({ color: 0x334455 });
function stat(mesh, x, y, z, ry) {
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  scene.add(mesh);
  return mesh;
}
const b1 = stat(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), matA), 10, 0, 0);
const b2 = stat(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1), matA), 0, 5, 0, Math.PI / 2);
const c1 = stat(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 10), matA), 0, 0, -8);
const solo = stat(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matB), 3, 0, 3);
const dyn = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA);
dyn.position.set(-5, 0, 0); scene.add(dyn); // matrixAutoUpdate stays true -> must survive
const spr = new THREE.Sprite(new THREE.SpriteMaterial({})); scene.add(spr);

const vExpected = b1.geometry.attributes.position.count + b2.geometry.attributes.position.count + c1.geometry.attributes.position.count;
const iExpected = b1.geometry.index.count + b2.geometry.index.count + c1.geometry.index.count;

const res = StaticMerge.merge(THREE, scene);
ok(res.merged === 1 && res.absorbed === 3, "one batch merged, three meshes absorbed [got " + JSON.stringify(res) + "]");
ok(!scene.children.includes(b1) && !scene.children.includes(b2) && !scene.children.includes(c1), "absorbed originals removed from the scene");
ok(scene.children.includes(solo) && scene.children.includes(dyn) && scene.children.includes(spr), "solo material, dynamic mesh, and sprite all survive untouched");
const merged = scene.children.find(o => o.isMesh && o.material === matA && o.geometry.type === "BufferGeometry");
ok(!!merged && merged.castShadow === true && merged.receiveShadow === true, "merged mesh exists with preserved shadow flags");
ok(merged.geometry.attributes.position.count === vExpected, "vertex count equals the sum of inputs (" + vExpected + ")");
ok(merged.geometry.index.count === iExpected, "index count equals the sum of inputs (" + iExpected + ")");
let maxIdx = 0;
const ia = merged.geometry.index.array;
for (let i = 0; i < ia.length; i++) if (ia[i] > maxIdx) maxIdx = ia[i];
ok(maxIdx < vExpected, "all indices reference valid merged vertices");
merged.geometry.computeBoundingBox();
const bb = merged.geometry.boundingBox;
// expected box = union of each input geometry transformed by its own matrix,
// computed with real three (immune to polygonal-approximation subtleties
// like a 10-segment cylinder only reaching x = +-sin(72deg), not +-1)
const expect = new THREE.Box3();
[b1, b2, c1].forEach(m => {
  const g = m.geometry.clone().applyMatrix4(m.matrix);
  g.computeBoundingBox();
  expect.union(g.boundingBox);
});
function near(a, b) { return Math.abs(a - b) < 1e-4; }
ok(near(bb.min.x, expect.min.x) && near(bb.min.y, expect.min.y) && near(bb.min.z, expect.min.z) &&
   near(bb.max.x, expect.max.x) && near(bb.max.y, expect.max.y) && near(bb.max.z, expect.max.z),
   "bounding box equals the union of transformed inputs (rotation honored) [merged " +
   JSON.stringify(bb.min) + ".." + JSON.stringify(bb.max) + "]");
const res2 = StaticMerge.merge(THREE, scene);
ok(res2.merged === 0 && res2.absorbed === 0, "second pass is a no-op (merged output is not re-merged)");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
