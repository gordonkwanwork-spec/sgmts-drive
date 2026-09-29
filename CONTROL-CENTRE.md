# Operations control centre

Select **Control centre / 營運控制中心** in the game's play-type chooser, then **Begin journey**. The same six (or seventeen) running trams, crossing road vehicles, pedestrians, signal heads and corridor geometry drive this mode and its surveillance views.

## Operator workflow

1. Start with **Guided operator** and **Balanced** traffic policy. Complete a five-minute shift while keeping queued road vehicles below 65 seconds.
2. Select a junction on the geographic map or in the junction button group. The three aspect indicators, queue lengths, elapsed phase, decision explanation and protected sequence show its live state.
3. Select any running tram in the map or fleet table. Set its speed ceiling, hold/release it, skip an intermediate stop before the approach, or terminate its service at A1/A7. A destination behind the tram is reached after its normal terminal turnback; commands never reverse a tram in the running lane. Restore through service to release a terminated tram.
4. Inspect the selected junction, selected tram and adjacent junction in the three live 3D camera feeds. The primary feed also offers every station. Feeds use the same world and simulation clock; they freeze on pause.
5. **Signal engineer** exposes timing settings, detector occupancy, pressure scores, starvation timers, road re-entry spacing and detector fault injection. All settings apply network-wide; stage requests/isolation apply to the selected junction.
6. Export the operations log as JSON. At shift completion, review the result and start another shift or continue in sandbox.

## Button desk

Every control-room dropdown has been replaced by a labelled button group. Blue buttons select the workspace and junction; teal buttons manage the fleet, speed and destination; violet buttons select CCTV cameras. Amber controls handle movement and recovery, while red controls isolate junctions or test detector faults. Selected buttons remain illuminated and report their pressed state to assistive technology.

Pending stage requests, active faults, isolated junctions, overdue queues and the resume button pulse slowly. **Flashing off** stops the pulses; the operating system's reduced-motion preference also keeps them steady. Text labels and status messages remain visible in either setting.

## Controller rules

Each junction has tram, road and exclusive pedestrian stages. A green stage ends through its amber interval, then all-red intergreen. Opposing traffic is only released after the conflict area clears. Pedestrians already crossing retain clearance after the walk invitation ends. Junction isolation and simulated detector faults clear current movement and hold all-red.

Tram pressure is the sum of `priority × (1 + passengers / 60 + min(stopped seconds, 90) / 30) / (1 + ETA / 25)`, plus red wait / 12. Road pressure is queued vehicles plus the greater of detector wait and red wait / 12. Pedestrian pressure is waiting people × 1.5 + red wait / 10. After minimum green, the controller can serve a stronger competing demand, an operator request, or the oldest overdue movement. Maximum green is bounded; trams may use a bounded extension. A blocked tram exit inhibits release. The starvation threshold requests service; it cannot override clearance and is not a guaranteed maximum physical wait.

## Reference basis and limits

The network overview, object selection, local controls and event journal are informed by the web-based visualisation and control-centre HMI used at [VBZ's Oerlikon tram depot (Siemens)](https://references.siemens.com/en/reference/vbz-tramdepot-oerlikon?id=35437). Detector-driven signal adjustment and bounded tram preference follow the general concepts of actuated signals, transit green extension and early green described in the [FHWA Traffic Detector Handbook, chapter 3](https://www.fhwa.dot.gov/publications/research/operations/its/06108/03.cfm) and [FHWA Traffic Signal Program Handbook](https://ops.fhwa.dot.gov/publications/fhwahop23041/fhwahop23041.pdf). No proprietary controller algorithm or branded interface is reproduced.

This is a transparent game controller, not certified railway signalling or an engineering prediction. It uses three at-grade junctions, the game's existing terminal facilities, fixed following separation, finite recycled road traffic and idealised detectors. Grade-separated roads are explicitly marked on the map and do not receive conflicting tram phases. CCTV is live rendered game imagery. Static depot vehicles and background MTR trains remain scenery. There is no surveyed interlocking, timetable optimiser, road origin/destination network or hardware interface.

Checks: `node src/checks/control-system.test.js`, included in `npm test`, verifies conflicting greens, minimum green, amber/all-red, occupied-area inhibition, pedestrian clearance, bounded priority/fairness, detector failure and input/route constraints. Browser evidence belongs in `output/playwright/control-centre/`.
