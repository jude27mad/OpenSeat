# OpenSeat

A live seat map for Floor 8 of Toronto Metropolitan University’s Student Learning Centre. The map covers 40 four-chair tables and 92 individual seats. The 20 bookable rooms appear as landmarks and are excluded from the 252-seat total.

[Open the prototype](https://jude27mad.github.io/OpenSeat/) · [Open the live floor](https://jude27mad.github.io/OpenSeat/#floor=8) · [CEN100 build and test evidence](https://jude27mad.github.io/OpenSeat/evidence/)

## Try it on your phone and iPad

On a phone, the first screen shows how many seats are free and a **Find me a free seat** button. Tap any seat or table on the map, or pick one from the list, and a sheet slides up with its status, where that status came from and two buttons: **It's free** and **It's taken**. A table can be reported in one tap with **All free** or **All taken**. A tap on a crowded part of the map zooms in first, so the seat you pick is the one you meant. The first visit opens a demo with example readings, marked by a banner. **Live floor** opens the shared, unseeded campus map. Seats with nothing recent say **No recent info** until a current reading arrives.

Select a table and **Show table QR code**. Scan it with another device. The code opens straight to the check-in for that table: choose a chair and check in. The chair is held for 60 minutes and a banner shows when the hold ends. **Check out** ends it from the banner or the sheet. **Data sources → Device inputs** (**Menu → How the data works** on a phone) lets one tester exercise sensor and Bluetooth events in a shared demo. **Share map** opens the same session on another device. **Restart demo** starts a fresh example.

## What each input means

| Input | Location | Current for | What appears |
| --- | --- | --- | --- |
| BLE2MQTT via flespi | The scanner’s assigned section | 2 minutes | Distinct devices meeting RSSI ≥ −75 dBm in one scan |
| QR check-in | One chair or individual seat | 60 minutes in use, 5 minutes after check-out | Occupied or free |
| Student report | One chair or individual seat | 15 minutes | Free or taken |
| Table sensor | The mapped table or an individually instrumented seat | 5 minutes | Shared table in use or free, or an exact individual-seat reading |

Each location retains the latest observation from each source. Fresh, contradictory seat observations display **Mixed reports**. Stale evidence remains visible with its age. Shared-table readings describe the whole table, and nearby-device totals describe a section. Seat totals add up to 252 across free, taken, no-recent-info and mixed seats. The map does not request browser location.

## Implementation and deployment

GitHub Pages serves the React dashboard and evidence. Firebase Realtime Database on Spark streams each room’s latest observations. Visitors can read the map immediately. On the first write, Firebase Authentication assigns the browser an anonymous identity so the same visitor can release their chair. Users never have to register. The public readings contain a source, target, observation ID, value, time and simulation flag. QR ownership and station authorization are private.

Use Node 22.12+ or 24 and Java 21. Run `npm ci` and `npm test`. The browser tests drive the phone with WebKit; set `OPENSEAT_PHONE_ENGINE=chromium` where WebKit is not installed. To work locally, start `npx firebase emulators:start --project demo-openseat --only auth,database` and run `VITE_OPENSEAT_EMULATORS=1 npm run dev` in another terminal. `npm run test:firebase` starts a fresh emulator for the ownership, validation, retry and station tests. GitHub Actions runs the mobile WebKit and desktop Chromium sharing test against the emulators before a Pages release.

The public web settings (apiKey, projectId and databaseURL) belong in `backend/firebase/web.json`. A deployment can override them with the `OPENSEAT_FIREBASE_CONFIG` GitHub repository variable. A production build requires registered settings. On the Firebase project, enable Realtime Database and anonymous authentication, then publish the access rules with `npx firebase deploy --only database --project PROJECT_ID`. GitHub Pages remains the public address for both the dashboard and its QR codes.

## Connect a real input

The iPhone publishes a full BLE2MQTT scan array to its own exact MQTT topic. Under **Device inputs → Bluetooth**, select the scanner’s actual section and enter a flespi token with read access to that topic. Keep the dashboard open as the bridge. It reduces the scan locally and sends only the count and measurement time. Saved JSON can also be counted locally. Scanner and bridge use the same local timezone for exports without an offset. Pasting a saved scan never updates live occupancy.

A physical table station runs `node backend/firebase/station.mjs` with `OPENSEAT_FEED_KEY` in its environment. On the database, an administrator sets the private `/private/feedDigest` to the lowercase hex SHA-256 of that key. The same key authorizes the iPhone bridge. The database checks it on every live hardware write, so replacing the digest revokes earlier station authorizations.

The station reads one JSON object per line on standard input. Each line supplies a stable UUIDv4 `id`, a `source` of `sensor` or `ble`, its mapped `target`, a `value`, and `measuredAt` in Unix milliseconds. A sensor reports `free` or `occupied` for T01–T40 or I001–I092. Bluetooth reports an integer count for `tables` or `individuals`. Keep the process open between measurements and reuse the original ID and time if retrying a sample.

## Moving existing sessions

The owner can run `node backend/firebase/import-archive.mjs < private-export.json` with an authenticated Google Cloud CLI or an administrator access token in `GOOGLE_OAUTH_ACCESS_TOKEN`. Export the original database rows with room, source, target, value, at (Unix milliseconds), simulated, id and owner_hash. Keep the export private. The importer preserves times and QR ownership and can be rerun while newer observations arrive. The original service implementation is archived under `backend/floot`.
