(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* ===== v2.13 - VEHICLES (Rahul: "bike, car, bus, tank, auto in the urban big
     map ... PUBG style mei road pe khade rahenge, usko lekar drive kar sakte
     hai") =====
     Urban only. Parked at generated kerb-side spots (vehicle-spots.config.js);
     walk up, press the use key, drive. One table, read by the server
     (server/lib/vehicles.js) and the client (src/vehicles/vehicles.js), so the
     two cannot disagree about a top speed or a seat.

     Units: metres, seconds, metres per second. `max` is top speed forward
     (bike 27 m/s = 97 km/h), `rev` in reverse, `turn` the yaw rate at speed in
     rad/s. `len/wid/hgt` are the hull box both sides use for collision and
     for bullets. `armor` multiplies a bullet's damage on the hull (the tank
     takes 12%). `sealed` means bullets cannot reach the people inside.
     `sill` is how high the steel goes: a rider is only hit above it (the glass);
     vehicles without one are open. `big` needs a long parking bay. `seatsAt` is [metres to the right,
     metres toward the nose] per seat; seat 0 drives (right-hand drive).
     SEATS (v2.16, Rahul: "Car mei 4 ... Bike mei 2 ... Bus mei 6"): sedan 4,
     motorbike 2, bus 6 (it was 8), auto 3, tank 2. `dial` is the top of that
     vehicle's speedometer in km/h — about twice what it can do, as on a real
     dashboard, so the needle works the middle of the dial. */
  var VEHICLES = {
    maps: ['urban'],
    count: 22,              // parked at match start
    respawnSec: 60,         // a destroyed vehicle is replaced after this, somewhere nobody is standing
    enterDist: 3.2,         // metres from the hull
    ramMin: 4.5,            // m/s before a hit on a player counts
    ramKill: 9,             // m/s at which it is a kill outright
    ramDmg: 9,              // damage per m/s below that
    useKey: 'KeyN', hornKey: 'KeyH', lightKey: 'KeyL', radioKey: 'KeyB',   // N in/out; while driving H is the horn and L the headlights
    /* PETROL (Rahul: "petrol ho"). A tank holds 100; `burn` is units a second at full
       throttle (a third of that idling along). A vehicle is found with fuelMin..100
       in it. Empty: the engine dies and it coasts to a stop — it is still cover, and
       still a bomb if somebody shoots it. */
    fuelMin: 45, idleBurn: 0.3,
    smokeAt: 0.45, fireAt: 0.18,   // hull fraction below which it smokes, then burns
    mix: ['car', 'bike', 'car', 'auto', 'bike', 'car', 'bus', 'bike', 'car', 'auto', 'car', 'bike', 'tank',
          'car', 'auto', 'bike', 'bus', 'car', 'bike', 'auto', 'car', 'bus'],
    paints: [0xb8312f, 0x1f4e8c, 0xe9e6df, 0x1c1f24, 0x8a8f96, 0xd9a21b, 0x2f6b46, 0x6b2f8a],
    types: {
      bike: { label: 'Motorbike',     seats: 2, dial: 160, hp: 260, burn: 0.26,  max: 27, rev: 4, accel: 16,  brake: 28, turn: 2.6,  len: 2.2,  wid: 0.8,  hgt: 1.25, r: 0.5,
              armor: 1.0, ram: 0.8, boom: 5.5, seatY: 0.45, seatsAt: [[0, -0.05], [0, -0.6]] },
      auto: { label: 'Auto Rickshaw', seats: 3, dial: 100, hp: 380, burn: 0.3,  max: 15, rev: 4, accel: 8,   brake: 18, turn: 2.2,  len: 2.9,  wid: 1.45, hgt: 1.85, r: 0.75,
              armor: 1.0, boom: 6.5, seatY: 0.58, seatsAt: [[0, 0.10], [-0.36, -0.95], [0.36, -0.95]] },   // v2.16.2: ON the driver's seat and the bench the model has (they were 45 cm ahead of both)
      car:  { label: 'Sedan',         seats: 4, dial: 160, hp: 650, burn: 0.36,  max: 25, rev: 7, accel: 11,  brake: 24, turn: 1.9,  len: 4.4,  wid: 1.9,  hgt: 1.5,  r: 0.98,
              armor: 0.8, boom: 7.5, sill: 0.95, seatY: 0.2, seatsAt: [[0.42, 0.25], [-0.42, 0.25], [0.42, -0.75], [-0.42, -0.75]] },
      bus:  { label: 'City Bus',      seats: 6, dial: 100, hp: 1400, burn: 0.48, max: 15, rev: 4, accel: 5,   brake: 14, turn: 1.05, len: 10.5, wid: 2.6,  hgt: 3.1,  r: 1.35, big: 1,
              armor: 0.6, boom: 12, sill: 1.72, seatY: 0.75, paints: [0xd9a21b, 0xb8312f, 0x1f4e8c, 0x2f6b46], seatsAt: [[0.75, 4.1], [-0.75, 2.4], [0.75, 1.2], [-0.75, 0.0], [0.75, -1.2], [-0.75, -2.4]] },
      tank: { label: 'Battle Tank',   seats: 2, dial: 60, hp: 4200, burn: 0.6, max: 9,  rev: 4, accel: 4.5, brake: 12, turn: 1.0,  len: 7.0,  wid: 3.4,  hgt: 2.6,  r: 1.75, big: 1,
              armor: 0.12, blast: 6, sealed: 1, pivot: 1, ram: 1.4, boom: 11, seatY: 0.9, seatsAt: [[0.6, 1.2], [-0.6, 0.2]] }
    }
  };
  return { VEHICLES: VEHICLES };
});
