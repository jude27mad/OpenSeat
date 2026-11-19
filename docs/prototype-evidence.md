# OpenSeat · CEN100 prototype record

Milestone 5 prototype: how it was built and tested.

## Concept and scope

Find a free study seat before walking over. One map, four inputs: student reports, QR check-in, Bluetooth counts and table sensors. Each reading shows its source and age. Scope: SLC Floor 8, demoed on an iPhone and iPad.

## Build plan and materials

| Step | What | Evidence |
| --- | --- | --- |
| 1. Scope | Trace Floor 8: 40 tables, 92 seats, 20 bookable rooms | Nov 17 · Stage 1 |
| 2. Bluetooth rule | Count devices at −75 dBm or stronger | Nov 17 · Calibration |
| 3. Map | Seat IDs, search, timestamps, expiry | Nov 17 · Stage 2 |
| 4. Inputs | QR check-in, reports, sensor receiver, Bluetooth counts | Nov 17 · Stage 3 |
| 5. Testing | Automated tests of the app, data and QR codes | Nov 17 · Verification |

Extra hardware cost: $0. Sensors were simulated. Hosted on GitHub Pages and Firebase.

## Process evidence

**Stage 1.** Floor plan: 252 open seats, all unknown.

![Floor 8 plan with all chairs marked unknown](evidence/01-floor-trace.png)

**Stage 2.** Full demo with all four inputs. Example readings are marked simulated.

![Integrated Floor 8 dashboard with all four inputs](evidence/02-dashboard.jpg)

**Stage 3.** Each table's QR code opens check-in for that table.

![Public Table 17 QR code and shareable link](evidence/03-table-qr.jpg)

## Calibration already completed

| Reading (same device) | Power | Counted at −75 dBm |
| --- | ---: | --- |
| First | −80 dBm | No |
| Second | −82 dBm | No |
| Third | −80 dBm | No |
| Fourth | −73 dBm | Yes |
| Fifth | −72 dBm | Yes |

Taken in the library. It sets the threshold but doesn't measure people on Floor 8.

## Verification

Every release is tested automatically in desktop and phone browsers. [Release checks](https://github.com/jude27mad/OpenSeat/actions/workflows/pages.yml)

| Test | Result | Evidence |
| --- | --- | --- |
| 252 seats counted, 20 rooms excluded | Pass | Automated check |
| −75 dBm cutoff, each device counted once | Pass | Automated tests |
| All four inputs saved together | Pass | API and database rule tests |
| Check-in shows on a second screen within 10 s | Pass | 1.38 s in an earlier build |
| A phone can scan a table QR and use the map | Pass | 1.46 s phone to desktop · [test run](https://github.com/jude27mad/OpenSeat/actions/runs/44208568779) |
| Area counts don't fake seat counts | Pass | 128 devices left all seats unknown |
| Sensor conflicts and old readings handled | Pass | Automated tests |
| A student finds a seat within 10 s | Not measured | Needs a timed trial |
| Real sensors and campus-wide accuracy | Not measured | No installed hardware |

## Attribution

**Student design work** included the integration concept, the choice of Floor 8 and dashboard reference, the furniture inventory and map, and the Bluetooth calibration and cutoff.

**AI-assisted development** implemented the React prototype, shared service, QR codes, simulator and tests from those design decisions, and produced this build record and screenshots.
