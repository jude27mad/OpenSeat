# OpenSeat

OpenSeat shows which study seats are free in TMU's Student Learning Centre (SLC), on Floors 5, 7 and 8.

[Open OpenSeat](https://jude27mad.github.io/OpenSeat/) · [Live Floor 8](https://jude27mad.github.io/OpenSeat/#floor=8) · [Live Floor 7](https://jude27mad.github.io/OpenSeat/#floor=7) · [Live Floor 5](https://jude27mad.github.io/OpenSeat/#floor=5) · [CEN100 course project evidence](https://jude27mad.github.io/OpenSeat/evidence/)

## What it does

- Shows a map of the floor. Each seat is green (free), orange (taken), white (no recent info) or purple (mixed reports).
- **Find me a free seat** takes you to a free spot, starting with the most free chairs and the newest reports. **Next free spot** shows another one.
- Tap a seat or table to report it: **It's free** or **It's taken**.
- Scan the QR code of a table or seat to check in. Your spot is held for 60 minutes.
- Pick the floor from the dropdown at the top.

## Where the information comes from

| Source | How it works | Stays on the map for |
| --- | --- | --- |
| Student report | A student taps **It's free** or **It's taken** | 15 minutes |
| QR check-in | A student scans the code on a table or seat and checks in | 60 minutes. After checking out, the spot shows free for 5 minutes |
| Table sensor | A sensor on a table or seat says whether it is in use. No real sensors are installed yet: in the demo you make readings with buttons, and live floors take them from a table station | 5 minutes |
| Bluetooth scanner | Counts the Bluetooth devices (phones, watches, earbuds) near a scanner. Only strong signals count (−75 dBm or stronger). The counts travel through flespi, an online message service | 2 minutes |

Simple rules:

- For a seat, the newest report or check-in wins.
- If a table's sensor says one thing and the reports for its chairs say another, the table turns purple and shows **Mixed reports**.
- When nothing is recent, the seat says **No recent info** instead of guessing.
- Bluetooth gives a count for an area, not for a single seat.

## What counts as a seat

| Floor | Counted | Not counted |
| --- | --- | --- |
| 8 | 40 round tables with 4 chairs each, and 92 single seats (252 in total) | 20 bookable rooms |
| 7 | 196 single seats, and 3 round tables with 4 chairs in the grad space (208 in total) | 30 bookable rooms |
| 5 | 166 single seats | 11 bookable rooms, a seminar room and 3 media rooms |

## Try the demo

- The first visit opens a **demo** with example data and a banner at the top. To see the real map everyone shares, press **See live floor** in that banner.
- In the demo, reports never time out. A seat only changes when someone reports it, checks in or checks out.
- **Check-in:** select a table or seat, press **Show table QR code** (or **Show seat QR code**) and scan it with another phone.
- **Sensors:** open any table or seat and press **Sensor: free** or **Sensor: in use**. You can also use the sensors card under the map. A dot appears on the map: green for free, orange for in use.
- **Bluetooth** is never simulated. It only shows real readings from the scanner. Press **Connect scanner** to set it up.
- **Share map** shows a QR code and a link. Open either on another device to join the same demo. A demo nobody uses for 24 hours is deleted, and its link then opens an empty demo.
- **Restart demo** starts a fresh one.

## For developers

### How it's built

- The website uses React (a JavaScript library for web pages) and Vite (the tool that runs and builds it). GitHub Pages hosts it.
- Reports and readings are saved in Firebase Realtime Database, Google's online database, which updates every open page straight away.
- Visitors don't make an account. Firebase gives each browser an anonymous ID, so only the person who checked in can check out.

### Run it on your computer

Install Node.js 22.12 or newer (it includes npm) and Java 21 (the local database needs it). Then:

```
git clone https://github.com/jude27mad/OpenSeat.git
cd OpenSeat
npm ci
npm test
```

`npm ci` installs the packages. `npm test` runs the quick tests.

To run the site with a local copy of the database, open two terminals in the project folder:

1. In the first, run `npx firebase emulators:start --project demo-openseat --only auth,database` and leave it running.
2. In the second, run `VITE_OPENSEAT_EMULATORS=1 npm run dev` and open the address it prints (usually http://localhost:5173). On Windows PowerShell, use `$env:VITE_OPENSEAT_EMULATORS=1; npm run dev`.

Other tests:

- `npm run test:firebase` checks the database rules (who may read or change each piece of data). It starts its own local database, so stop the one from step 1 first.
- Browser tests that act like a phone and a desktop: run `npx playwright install chromium webkit` and `VITE_OPENSEAT_EMULATORS=1 npm run build`, then `npx firebase emulators:exec --project demo-openseat --only auth,database "npm run test:ui"`. They use WebKit (Safari's engine); set `OPENSEAT_PHONE_ENGINE=chromium` if WebKit won't install.

Every push to the `main` branch runs all of these tests on GitHub before the site is updated.

### Firebase setup

1. At console.firebase.google.com, create a project. Turn on **Realtime Database** and, under **Authentication → Sign-in method**, **Anonymous**.
2. Put the project's `apiKey`, `projectId` and `databaseURL` in `backend/firebase/web.json`. These are public settings, not secrets. Or paste the same JSON into a GitHub variable named `OPENSEAT_FIREBASE_CONFIG` (**Settings → Secrets and variables → Actions → Variables**).
3. Publish the database rules from `backend/firebase/database.rules.json`:

   ```
   npx firebase login
   npx firebase deploy --only database --project PROJECT_ID
   ```

   PROJECT_ID is the ID shown in Firebase **Project settings**. Once the `FIREBASE_SERVICE_ACCOUNT` secret is added (next section), every push to `main` publishes the rules for you.

### Deleting old demo rooms

Each demo saves its data in its own section of the database, called a demo room (not a real room). An automatic daily job on GitHub, **Delete idle demo rooms**, deletes demo rooms nobody has used in 24 hours. It never touches the live floors (`floor5`, `floor7`, `floor8`).

To turn it on:

1. In Firebase, open **Project settings → Service accounts → Generate new private key**. This downloads a .json file.
2. On GitHub, open **Settings → Secrets and variables → Actions** and add a secret named `FIREBASE_SERVICE_ACCOUNT`. Open the downloaded file in a text editor, copy all of its text and paste it as the value.
3. Delete the downloaded file. It gives full access to the project.

Without the secret, the job deletes nothing and shows a warning. To see what it would delete, open **Actions → Delete idle demo rooms → Run workflow** and tick **Only list the rooms that would be deleted**. Locally, `node backend/firebase/cleanup.mjs --emulator --dry-run` does the same against the local database.

### Connecting real hardware

**Bluetooth scanner.** The scanner is an iPhone running the BLE2MQTT app. It sends each scan to flespi under its own channel name, called a topic. In OpenSeat:

1. Press **Connect scanner** and pick the area the scanner covers.
2. Press **Connect BLE2MQTT via flespi** and enter a **flespi read token** (an access key from flespi that can read the topic) and the exact **Scanner MQTT topic** set in the app.
3. On a live floor, also enter the **OpenSeat operator key** (the same key as `OPENSEAT_FEED_KEY` below).
4. Keep the page open. It counts the devices and saves only the count and the time to OpenSeat's database. Scan times without a time zone are read as Toronto time.

**Table station.** A station is a small program that sends sensor readings. Run it with two environment variables, for example:

```
OPENSEAT_FEED_KEY=yourkey OPENSEAT_FLOOR=8 node backend/firebase/station.mjs
```

- `OPENSEAT_FEED_KEY` is the station's secret key. An administrator makes the key's SHA-256 hash in lowercase hex, with no newline (`printf '%s' 'yourkey' | sha256sum`), and saves it in the Firebase console's Realtime Database at `/private/feedDigest`. Saving a new hash cuts off every old station and scanner.
- `OPENSEAT_FLOOR` is `5`, `7` or `8` (8 if left out).

Type or pipe readings into the running station, one JSON object per line, for example:

```
{"id":"3f1c2a7e-5b9d-4c3a-9e2f-1a2b3c4d5e6f","source":"sensor","target":"T01","value":"free","measuredAt":1767225600000}
```

- `id`: a version 4 UUID (for example from `crypto.randomUUID()`). To resend a reading, keep the same `id` and the same `measuredAt` so it isn't counted twice.
- `source`: `sensor` or `ble` (Bluetooth).
- `target`: for a sensor, a table (T) or single seat (I): Floor 8 T01–T40 or I001–I092; Floor 7 T01–T03 or I001–I196; Floor 5 I001–I166. For Bluetooth, `tables` or `individuals` (Floor 5 has only `individuals`).
- `value`: `free` or `occupied` for a sensor, or a whole number for Bluetooth.
- `measuredAt`: when the reading was taken, in milliseconds since 1 January 1970 (what `Date.now()` gives).

### Moving old data

`node backend/firebase/import-archive.mjs < private-export.json` imports readings from the old version of OpenSeat, keeping their times and check-in owners. The export is a JSON array of rows with `room`, `source`, `target`, `value`, `at` (milliseconds), `simulated`, `id` and `owner_hash`. It needs the Google Cloud CLI signed in as a project admin (`gcloud auth login`), or an admin access token in `GOOGLE_OAUTH_ACCESS_TOKEN`. Keep the export private. The old version's code is in `backend/floot`.
