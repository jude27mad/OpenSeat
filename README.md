# OpenSeat

A live seat map for Floor 8 of Toronto Metropolitan University’s Student Learning Centre. The map covers 40 four-chair tables and 90 individual seats. The 20 bookable rooms appear as landmarks and are excluded from the 250-seat total.

[Open the prototype](https://jude27mad.github.io/OpenSeat/) · [Open the live floor](https://jude27mad.github.io/OpenSeat/#floor=8) · [CEN100 build and test evidence](https://jude27mad.github.io/OpenSeat/evidence/)

## Try it on your phone and iPad

Open **Find a seat**, select a result and inspect its source and age. The first visit opens a labelled demo with example readings. **Live floor** opens the shared, unseeded campus map. Unknown seats stay unknown until a current observation arrives.

Select a table and **Show table QR code**. Scan it with another device, choose a chair and check in. An explicit check-out ends that chair’s check-in. Students can also report a chair free or occupied. **Data sources → Device inputs** lets one tester exercise sensor and Bluetooth events in a shared demo. **Share map** opens the same session on another device. **Restart demo** starts a fresh example.

## What each input means

| Input | Location | Current for | What appears |
| --- | --- | --- | --- |
| BLE2MQTT via flespi | The scanner’s assigned section | 2 minutes | Distinct devices meeting RSSI ≥ −75 dBm in one scan |
| QR check-in | One chair or individual seat | 60 minutes in use, 5 minutes after check-out | Occupied or free |
| Self-report | One chair or individual seat | 15 minutes | Free or occupied |
| Table sensor | The mapped table or an individually instrumented seat | 5 minutes | Shared table in use or free, or an exact individual-seat reading |

Each location retains the latest observation from each source. Fresh, contradictory seat observations display **Conflicting**. Stale evidence remains visible with its age. Shared-table readings describe the whole table, and nearby-device totals describe a section. Seat totals add up to 250 across available, occupied, unknown and conflicting seats. The map does not request browser location.

## Implementation and deployment

React, shadcn/ui primitives, Tailwind, Vite, GitHub Actions and GitHub Pages. A separately hosted Floot service persists observations in PostgreSQL and sends changes over WebSocket. The repository includes the endpoint implementation and database schema under `backend/`. QR links work on GitHub Pages project paths without a server rewrite.

Use Node 22.12+ or 24. Run `npm ci`, then `npm run dev`. Run `npm test` for the model suite and `npm run build` for the production bundle. Run `npx playwright install chromium webkit` followed by `npm run test:ui` for the desktop Chromium and mobile WebKit flow against an isolated demo session on the hosted API. GitHub Actions runs these checks on changes. No API key is needed for the demo.

## Connect a real input

The iPhone publishes a full BLE2MQTT scan array to its own exact MQTT topic. Under **Device inputs → Bluetooth**, select the scanner’s actual section and enter a flespi token with read access to that topic. Keep the dashboard open as the bridge. It reduces the scan locally and sends only the count and measurement time. Saved JSON can also be counted locally. Scanner and bridge use the same local timezone for exports without an offset. Pasting a saved scan never updates live occupancy.

A physical table station sends a JSON observation to the endpoint below. Generate a stable UUID per measurement for retry. Set the same private `OPENSEAT_FEED_KEY` on the backend and station before posting to the live floor. Supply absolute measurement time in Unix milliseconds. An operator can also enter that key when using the live browser bridge. Use an environment secret on the station. No sensor credentials belong in the frontend bundle.

```text
POST https://openseat-slc-data.floot.app/_api/seat-update
Content-Type: text/plain;charset=UTF-8
```

The JSON object contains `room` (`floor8`), `source` (`sensor` or `ble`), `target` (`T01`–`T40`, `I001`–`I090`, or section `tables`/`individuals` for Bluetooth), `value` (`occupied`/`free` or device count), `id` (UUIDv4), `measuredAt` and `feedKey`. No raw Bluetooth names or addresses are retained. The frontend service URL can be overridden at build time with `VITE_OPENSEAT_API`.
