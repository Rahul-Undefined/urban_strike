/* Merges the config parts into the single CFG contract.
   Browser: parts register into __CFG_PARTS via their UMD wrappers (load them
   before this file). Node: this file requires them directly. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory([
      require('./weapons.config.js'),
      require('./gameplay.config.js'),
      require('./loot.config.js'),
      require('./world.config.js')
    ]);
  } else {
    root.CFG = factory(root.__CFG_PARTS || []);
  }
})(typeof self !== 'undefined' ? self : this, function (parts) {
  var C = {};
  parts.forEach(function (p) { for (var k in p) C[k] = p[k]; });
  return C;
});
