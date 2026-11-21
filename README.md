# OpenSeat

A live seat map for Floors 5, 7 and 8 of Toronto Metropolitan University’s Student Learning Centre. Floor 8 covers 40 four-chair tables and 92 individual seats; its 20 bookable rooms appear as landmarks and are excluded from the 252-seat total. Floor 5 covers 166 individual seats; its 11 bookable rooms, seminar room and 3 media rooms appear as landmarks and are not counted. Floor 7 covers 196 individual seats and the 3 four-chair round tables in the grad space, 208 seats in all; its 30 bookable rooms appear as landmarks and are not counted.

[Open the prototype](https://jude27mad.github.io/OpenSeat/) · [Open live Floor 8](https://jude27mad.github.io/OpenSeat/#floor=8) · [Open live Floor 7](https://jude27mad.github.io/OpenSeat/#floor=7) · [Open live Floor 5](https://jude27mad.github.io/OpenSeat/#floor=5) · [CEN100 build and test evidence](https://jude27mad.github.io/OpenSeat/evidence/)

## Try it on your phone and iPad

On a phone, the first screen has a floor dropdown, shows how many seats are free and has a **Find me a free seat** button. The sheet it opens offers **Next free spot** for the next suggestion. Tap any seat or table on the map, or pick one from the list, and a sheet slides up with two buttons, **It's free** and **It's taken**, followed by where the status came from. A table can be reported in one tap with **All free** or **All taken**. A tap on a crowded part of the map, or between two tables, zooms in first, so the seat you pick is the one you meant. Seat and table numbers appear once the map is zoomed in. Under the map, **Live sources** shows what each of the four inputs knows right now: chairs checked in, recent reports, the Bluetooth count for each area with a **Connect scanner** shortcut, and the tables with a sensor reading, which also show as a dot on the map. Example readings are tagged **Demo**. Messages appear at the top of the screen. Drag the sheet up or down to open, shrink or close it. The phone's Back button closes the sheet, the menu or the list before it leaves OpenSeat. The first visit opens a demo with example readings, marked by a banner. In the demo nothing expires: a seat changes only when someone reports it, checks in or checks out, so the example floor stays as it is until people use it. **Live floor** opens the shared, unseeded campus map. Seats with nothing recent say **No recent info** until a current reading arrives.

Select a table and **Show table QR code**. Scan it with another device. The code opens straight to the check-in for that table, on a chair nobody holds: check in with one tap. The chair is held for 60 minutes and a banner shows when the hold ends. In the last ten minutes, **Keep it** holds it for another hour. **Check out** ends it from the banner or the sheet, and **Undo** takes it back. Checking in somewhere new ends your earlier hold. If someone checked in and left, tap **It's free** and confirm. The chair then shows as free, and the student sitting there can check in. In the demo, a table's sheet has **Sensor: free** and **Sensor: in use** under its chairs, so a sensor reading can be tried where it shows: a dot on the table, green for free and orange for in use. Bluetooth is never simulated: its counts come only from the real scanner through flespi, connected under **Device inputs**. **Share map** opens the same session on another device. **Restart demo** starts a fresh example.

## What each input means

| Input | Location | Current for | What appears |
| --- | --- | --- | --- |
| BLE2MQTT via flespi | The scanner’s assigned section | 2 minutes | Distinct devices meeting RSSI ≥ −75 dBm in one scan |
| QR check-in | One chair or individual seat | 60 minutes in use, 5 minutes after check-out | Occupied or free |
| Student report | One chair or individual seat | 15 minutes | Free or taken |
| Table sensor | The mapped table or an individually instrumented seat | 5 minutes | Shared table in use or free, or an exact individual-seat reading |

Each location retains the latest observation from each source. For a seat, the newer of a student report and a check-in wins, so a confirmed free report releases an older check-in and a check-in after a free report shows the seat taken. A table whose sensor disagrees with its chairs displays **Mixed reports**. Stale evidence remains visible with its age. Shared-table readings describe the whole table, and nearby-device totals describe a section. Seat totals add up to 252 across free, taken, no-recent-info and mixed seats. The map does not request browser location.

## Implementation and deployment

GitHub Pages serves the React dashboard and evidence. Firebase Realtime Database on Spark streams each room’s latest observations. Visitors can read the map immediately. On the first write, Firebase Authentication assigns the browser an anonymous identity so the same visitor can release their chair. Users never have to register. The public readings contain a source, target, observation ID, value, time and simulation flag. QR ownership and station authorization are private.

Use Node 22.12+ or 24 and Java 21. Run `npm ci` and `npm test`. The browser tests drive the phone with WebKit; set `OPENSEAT_PHONE_ENGINE=chromium` where WebKit is not installed. To work locally, start `npx firebase emulators:start --project demo-openseat --only auth,database` and run `VITE_OPENSEAT_EMULATORS=1 npm run dev` in another terminal. `npm run test:firebase` starts a fresh emulator for the ownership, validation, retry and station tests. GitHub Actions runs the mobile WebKit and desktop Chromium sharing test against the emulators before a Pages release.

The public web settings (apiKey, projectId and databaseURL) belong in `backend/firebase/web.json`. A deployment can override them with the `OPENSEAT_FIREBASE_CONFIG` GitHub repository variable. A production build requires registered settings. On the Firebase project, enable Realtime Database and anonymous authentication, then publish the access rules with `npx firebase deploy --only database --project PROJECT_ID`. Publish them again whenever `backend/firebase/database.rules.json` changes. For example, a newer free report releasing an older check-in needs the current rules. GitHub Pages remains the public address for both the dashboard and its QR codes.

### Cleaning up demo rooms

Each demo session writes to its own room, `rooms/<id>`, and the release check adds a few more after every deploy. The live floors, `rooms/floor8`, `rooms/floor7` and `rooms/floor5`, keep only the newest reading per seat, so they do not grow. Demo rooms would otherwise stay forever. The **Delete idle demo rooms** workflow runs every day and deletes each demo room with no report, check-in or reading in the last 24 hours. It never touches `floor8`, `floor7` or `floor5`. A shared demo link older than that opens an empty demo.

To switch it on:

1. In the Firebase console, open **Project settings → Service accounts** and choose **Generate new private key**. This downloads a JSON file.
2. On GitHub, open **Settings → Secrets and variables → Actions** and add a repository secret named `FIREBASE_SERVICE_ACCOUNT` whose value is the whole JSON file.
3. Delete the downloaded file. The key has full access to the project, so keep it only in that secret.

To check what it would delete, open **Actions → Delete idle demo rooms → Run workflow** and tick **dry run**. Without the secret, the workflow deletes nothing and shows a warning. Locally, `node backend/firebase/cleanup.mjs --emulator --dry-run` runs it against the emulator.

## Connect a real input

The iPhone publishes a full BLE2MQTT scan array to its own exact MQTT topic. Under **Device inputs → Bluetooth**, select the scanner’s actual section and enter a flespi token with read access to that topic. Keep the dashboard open as the bridge. It reduces the scan locally and sends only the count and measurement time. Saved JSON can also be counted locally. Scanner and bridge use the same local timezone for exports without an offset. Pasting a saved scan never updates live occupancy.

A physical table station runs `node backend/firebase/station.mjs` with `OPENSEAT_FEED_KEY` in its environment, and `OPENSEAT_FLOOR=5` or `OPENSEAT_FLOOR=7` for a station on those floors (Floor 8 is the default). On the database, an administrator sets the private `/private/feedDigest` to the lowercase hex SHA-256 of that key. The same key authorizes the iPhone bridge. The database checks it on every live hardware write, so replacing the digest revokes earlier station authorizations.

The station reads one JSON object per line on standard input. Each line supplies a stable UUIDv4 `id`, a `source` of `sensor` or `ble`, its mapped `target`, a `value`, and `measuredAt` in Unix milliseconds. A sensor reports `free` or `occupied` for T01–T40 or I001–I092 on Floor 8, T01–T03 or I001–I196 on Floor 7, and I001–I166 on Floor 5. Bluetooth reports an integer count for `tables` or `individuals`; Floor 5 has only `individuals`. Keep the process open between measurements and reuse the original ID and time if retrying a sample.

## Moving existing sessions

The owner can run `node backend/firebase/import-archive.mjs < private-export.json` with an authenticated Google Cloud CLI or an administrator access token in `GOOGLE_OAUTH_ACCESS_TOKEN`. Export the original database rows with room, source, target, value, at (Unix milliseconds), simulated, id and owner_hash. Keep the export private. The importer preserves times and QR ownership and can be rerun while newer observations arrive. The original service implementation is archived under `backend/floot`.
