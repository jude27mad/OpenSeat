# OpenSeat

OpenSeat shows which study seats are free in TMU's Student Learning Centre (SLC), on Floors 5, 7 and 8.

[Open OpenSeat](https://jude27mad.github.io/OpenSeat/) · [Live Floor 8](https://jude27mad.github.io/OpenSeat/#floor=8) · [Live Floor 7](https://jude27mad.github.io/OpenSeat/#floor=7) · [Live Floor 5](https://jude27mad.github.io/OpenSeat/#floor=5) · [CEN100 evidence](https://jude27mad.github.io/OpenSeat/evidence/)

## What it does

- Shows a map of the floor. Each seat is green (free), orange (taken), white (no recent info) or purple (mixed reports).
- **Find me a free seat** takes you to the best free seat. **Next free spot** shows another one.
- Tap a seat or table to report it: **It's free** or **It's taken**.
- Scan a table's QR code to check in. Your chair is held for 60 minutes.
- Pick the floor from the dropdown at the top.

## Where the information comes from

| Source | How it works | Counts for |
| --- | --- | --- |
| Student report | A student taps **It's free** or **It's taken** | 15 minutes |
| QR check-in | A student scans the code on a table and checks in | 60 minutes (5 minutes after checking out) |
| Table sensor | A sensor says whether a table or seat is in use. Simulated in this prototype | 5 minutes |
| Bluetooth scanner | Counts phones nearby with a signal of −75 dBm or stronger. Sent through flespi | 2 minutes |

Simple rules:

- For a seat, the newest report or check-in wins.
- If a table sensor disagrees with the chairs, the table shows **Mixed reports**.
- When nothing is recent, the seat says **No recent info** instead of guessing.
- Bluetooth gives a count for an area, not for a single seat.

## What counts as a seat

| Floor | Counted | Not counted |
| --- | --- | --- |
| 8 | 40 round tables with 4 chairs each, and 92 single seats: 252 | 20 bookable rooms |
| 7 | 196 single seats, and 3 round tables with 4 chairs in the grad space: 208 | 30 bookable rooms |
| 5 | 166 single seats | 11 bookable rooms, a seminar room and 3 media rooms |

## Try the demo

- The first visit opens a **demo** with example data and a banner at the top. **Live floor** shows the real, shared map.
- In the demo nothing expires. A seat only changes when someone reports it, checks in or checks out.
- **Check-in:** select a table, press **Show table QR code** and scan it with another phone.
- **Sensors:** open any table or seat and press **Sensor: free** or **Sensor: in use**. You can also do it from the sensors card under the map. A dot appears on the map: green for free, orange for in use.
- **Bluetooth** is never simulated. It only shows real readings from the scanner. Press **Connect scanner** to set it up.
- **Share map** opens the same demo on another device. **Restart demo** starts a fresh one.

## For developers

### How it's built

- The website is made with React and Vite and hosted on GitHub Pages.
- Readings are stored in a Firebase Realtime Database.
- Visitors don't make an account. Firebase gives each browser an anonymous ID, so only the person who checked in can check out.

### Run it on your computer

You need Node 22.12 or newer and Java 21.

```
npm ci
npm test
```

To run the site with a local database:

```
npx firebase emulators:start --project demo-openseat --only auth,database
VITE_OPENSEAT_EMULATORS=1 npm run dev
```

Run the two commands in separate terminals. `npm run test:firebase` tests the database rules. The phone tests use WebKit; set `OPENSEAT_PHONE_ENGINE=chromium` if WebKit isn't installed. GitHub Actions runs all of these before each release.

### Firebase setup

- The site's Firebase settings are in `backend/firebase/web.json`. The `OPENSEAT_FIREBASE_CONFIG` repository variable can replace them.
- In Firebase, turn on Realtime Database and anonymous sign-in.
- The database rules are in `backend/firebase/database.rules.json`. Publish them with:

  ```
  npx firebase deploy --only database --project PROJECT_ID
  ```

  If the repository has the `FIREBASE_SERVICE_ACCOUNT` secret, each release publishes them for you.

### Deleting old demo rooms

Every demo writes to its own room in the database. A daily GitHub Action, **Delete idle demo rooms**, deletes demo rooms nobody has used in 24 hours. It never touches the live floors (`floor5`, `floor7`, `floor8`).

To turn it on:

1. In Firebase, open **Project settings → Service accounts → Generate new private key**.
2. On GitHub, open **Settings → Secrets and variables → Actions** and add a secret named `FIREBASE_SERVICE_ACCOUNT`. Paste the whole downloaded file as its value.
3. Delete the downloaded file. It gives full access to the project.

To see what it would delete without deleting anything, run the workflow by hand and tick **dry run**.

### Connecting real hardware

**Bluetooth scanner.** The iPhone scanner (BLE2MQTT) sends each scan to its own topic on flespi. In OpenSeat, press **Connect scanner**, pick the area the scanner covers and enter a flespi token that can read that topic. Keep the page open: it counts the devices and sends only the count and the time. Scan times without a time zone are read as Toronto time.

**Table station.** Run `node backend/firebase/station.mjs` with these settings:

- `OPENSEAT_FEED_KEY`: the station's secret key. An administrator stores its SHA-256 hash in the database at `/private/feedDigest`. The same key works for the Bluetooth bridge, and changing the hash cuts off old stations.
- `OPENSEAT_FLOOR`: `5`, `7` or `8` (8 if left out).

The station reads one JSON object per line, with:

- `id`: a UUID that stays the same if you resend the reading
- `source`: `sensor` or `ble`
- `target`: a table or seat for a sensor (Floor 8: T01–T40 or I001–I092; Floor 7: T01–T03 or I001–I196; Floor 5: I001–I166), or `tables` or `individuals` for Bluetooth (Floor 5 has only `individuals`)
- `value`: `free` or `occupied` for a sensor, or a whole number for Bluetooth
- `measuredAt`: the time in Unix milliseconds

### Moving old data

`node backend/firebase/import-archive.mjs < private-export.json` imports readings from the old version of OpenSeat, keeping their times and check-in owners. It needs Google Cloud sign-in or an admin token in `GOOGLE_OAUTH_ACCESS_TOKEN`. Keep the export private. The old version's code is in `backend/floot`.
