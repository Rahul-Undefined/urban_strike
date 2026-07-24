/* V4.7 Urban accessibility pass — converts two decorative roofs into playable
   positions. Heights are DERIVED from the collider set (garage top 4.30,
   warehouse top 9.15), not guessed; the map validator proves the roof loot
   points rest on real geometry. Metal stairs = metal footsteps. */
World._buildAccess = function (T) {
  var seg = T.seg, box = T.box, stairFlight = T.stairFlight, M = T.M;

  /* ---- GARAGE (roof slab x[-16.5,-7.5] z[34,42], top 4.30) ---- */
  // exterior stair up the west face, landing bridges onto the roof edge
  stairFlight(-17.6, 0, 41.5, 0, -1, 14, 0.31, 0.5, 1.4, M.metal);
  seg(-18.3, -16.9, 0, 1.5, 39.2, 41.6, M.metal);
  seg(-18.3, -16.9, 0, 2.95, 36.9, 39.2, M.metal);
  seg(-18.3, -16.9, 0, 4.3, 34.5, 36.9, M.metal);
  seg(-18.3, -16.4, 4.3, 4.45, 33.6, 35.4, M.metal);            // landing
  seg(-18.4, -18.3, 4.45, 5.35, 33.5, 35.5, M.metal);           // landing outer rail
  // roof edge rails (west rail leaves a gap at the landing)
  seg(-16.5, -7.5, 4.3, 5.2, 33.9, 34.0, M.trim);
  seg(-16.5, -7.5, 4.3, 5.2, 41.9, 42.0, M.trim);
  seg(-7.6, -7.5, 4.3, 5.2, 34, 42, M.trim);
  seg(-16.5, -16.4, 4.3, 5.2, 35.6, 42, M.trim);

  /* ---- WAREHOUSE (roof x[-46,-18] z[-37,-19], top 9.15) ---- */
  // two-flight fire escape on the south face with a mid landing
  stairFlight(-19.0, 0, -17.3, -1, 0, 15, 0.31, 0.5, 1.4, M.metal);
  seg(-21.6, -19.1, 0, 1.6, -18.0, -16.6, M.metal);
  seg(-24.1, -21.6, 0, 3.15, -18.0, -16.6, M.metal);
  seg(-26.6, -24.1, 0, 4.65, -18.0, -16.6, M.metal);
  seg(-28.4, -26.4, 4.65, 4.8, -18.2, -16.4, M.metal);          // mid landing
  seg(-28.5, -26.3, 4.8, 5.7, -16.5, -16.4, M.metal);           // mid landing rail
  stairFlight(-28.6, 4.65, -17.3, -1, 0, 15, 0.31, 0.5, 1.4, M.metal);
  seg(-31.2, -28.7, 4.65, 6.25, -18.0, -16.6, M.metal);
  seg(-33.7, -31.2, 4.65, 7.8, -18.0, -16.6, M.metal);
  seg(-36.2, -33.7, 4.65, 9.15, -18.0, -16.6, M.metal);
  seg(-37.8, -35.6, 9.15, 9.3, -19.5, -16.6, M.metal);          // top landing onto the roof
  seg(-37.9, -35.5, 9.3, 10.2, -16.7, -16.6, M.metal);          // top landing rail
  // roof edge rails (south rail gapped at the entry)
  seg(-46, -18, 9.15, 10.05, -37.0, -36.9, M.trim);
  seg(-46, -45.9, 9.15, 10.05, -37, -19, M.trim);
  seg(-18.1, -18, 9.15, 10.05, -37, -19, M.trim);
  seg(-46, -37.9, 9.15, 10.05, -19.1, -19, M.trim);
  seg(-35.5, -18, 9.15, 10.05, -19.1, -19, M.trim);

  /* roof furniture — the payoff for climbing */
  box(-14, 4.75, 36.5, 1.4, 0.9, 1.1, M.metal);
  box(-10.5, 4.62, 40, 1.0, 0.65, 0.9, M.metal);
  box(-40, 9.75, -30, 1.6, 1.2, 1.2, M.metal);
  box(-26, 9.6, -33, 1.1, 0.9, 1.0, M.metal);
  box(-33, 9.55, -22, 0.9, 0.8, 0.9, M.metal);
};
