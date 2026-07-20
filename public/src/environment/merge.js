/* Static draw-call collapse: bakes every static Lambert Box/Cylinder mesh
   (identified by matrixAutoUpdate === false) into one merged mesh per
   material+shadow combination. ~1500 draw calls -> ~20. Pure geometry math,
   no visual change. Toggle: CFG.RENDER.mergeStatic = false.
   UMD so tools/verify-merge.js can unit-test it against real three. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StaticMerge = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function merge(THREE, sc) {
    var batches = {}, victims = [];
    for (var i = 0; i < sc.children.length; i++) {
      var o = sc.children[i];
      if (!o.isMesh || o.matrixAutoUpdate !== false) continue;
      var gt = o.geometry && o.geometry.type;
      if (gt !== "BoxGeometry" && gt !== "CylinderGeometry") continue;
      if (!o.material || o.material.type !== "MeshLambertMaterial") continue;
      if (!o.geometry.index || !o.geometry.attributes.uv) continue;
      var key = o.material.uuid + "|" + (o.castShadow ? 1 : 0) + "|" + (o.receiveShadow ? 1 : 0);
      (batches[key] = batches[key] || { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] }).list.push(o);
    }
    var made = 0;
    for (var k in batches) {
      var b = batches[k];
      if (b.list.length < 2) continue;
      var vTot = 0, iTot = 0;
      b.list.forEach(function (m) { vTot += m.geometry.attributes.position.count; iTot += m.geometry.index.count; });
      var pos = new Float32Array(vTot * 3), nor = new Float32Array(vTot * 3), uv = new Float32Array(vTot * 2);
      var idx = new Uint32Array(iTot);
      var vo = 0, io = 0;
      b.list.forEach(function (m) {
        var e = m.matrix.elements;
        var pa = m.geometry.attributes.position.array, na = m.geometry.attributes.normal.array;
        var ua = m.geometry.attributes.uv.array, ia = m.geometry.index.array;
        var n = m.geometry.attributes.position.count;
        for (var j = 0; j < n; j++) {
          var x = pa[j * 3], y = pa[j * 3 + 1], z = pa[j * 3 + 2];
          pos[(vo + j) * 3]     = e[0] * x + e[4] * y + e[8] * z + e[12];
          pos[(vo + j) * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          pos[(vo + j) * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          var nx = na[j * 3], ny = na[j * 3 + 1], nz = na[j * 3 + 2];
          nor[(vo + j) * 3]     = e[0] * nx + e[4] * ny + e[8] * nz;
          nor[(vo + j) * 3 + 1] = e[1] * nx + e[5] * ny + e[9] * nz;
          nor[(vo + j) * 3 + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
          uv[(vo + j) * 2] = ua[j * 2]; uv[(vo + j) * 2 + 1] = ua[j * 2 + 1];
        }
        for (var q = 0; q < ia.length; q++) idx[io + q] = ia[q] + vo;
        vo += n; io += ia.length;
        victims.push(m);
      });
      var mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      mg.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      mg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      mg.setIndex(new THREE.BufferAttribute(idx, 1));
      var mm = new THREE.Mesh(mg, b.mat);
      mm.castShadow = b.cast; mm.receiveShadow = b.recv;
      mm.matrixAutoUpdate = false; mm.updateMatrix();
      sc.add(mm);
      made++;
    }
    victims.forEach(function (m) { sc.remove(m); m.geometry.dispose(); });
    return { merged: made, absorbed: victims.length };
  }
  return { merge: merge };
});
