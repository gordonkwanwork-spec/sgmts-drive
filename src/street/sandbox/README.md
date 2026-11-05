# Sandbox street details

Ported on 2026-10-07 from Gordon's `city-rules-sandbox/src` in
`Documents/Codex/2026-10-04/task-2/city-rules-sandbox`.

- `kerbs.js`: K1 section, battered upper face and rounded arrises.
- `paving-patterns.js`: block/slab patterns at their physical module sizes.
- `railing-details.js`: Type 2 flats, rounds, rounded panels and dome post fixings. Curve tessellation is reduced for the full city; section dimensions are unchanged. Post parts are merged by material in the game's furniture adapter.
- `street-rules.js`: crossing markings and dimensions.

Game adapters use the existing road frames and authored junctions. `../kerbs.js`
sweeps straight, curved and variable-height K1 units, with recessed joints;
`../paving.js` creates 5 m texture tiles; `../city-details.js` furnishes the
actual kerb edges and keeps complete crossing ramp footprints clear.

Station platforms follow drawing ST-5301 Section C: 300 mm. The previous extra
330 mm lift has been removed from the station builder and all seven assets
rebuilt. The existing ART model floor remains higher; the drawing height is the
user's explicit choice, rather than a claim of level boarding.
