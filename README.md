# OpenSeat

A study-seat map for Toronto Metropolitan University's Student Learning Centre (SLC).

[Try OpenSeat](https://jude27mad.github.io/OpenSeat/)

I kept running into the same problem at TMU: finding somewhere to study meant walking around and hoping a table was free. Our CEN100 group wanted students to know where to go *before* making the trip.

The original idea was a map updated by students themselves. I had a problem with that. Someone who finally finds a seat has little reason to keep updating the map. We talked about reminders, but a notification every five minutes would just interrupt people trying to study. Make it every twenty minutes, and the information might already be out of date.

**I thought Bluetooth could get us around the reporting problem.** I tried scanning nearby devices in the library and experimented with nRF Connect, BLE2MQTT and flespi. In one room with roughly 20 people, my scan picked up over 150 devices. That was a pretty clear warning: **detecting devices isn't the same as counting people.** Even a good estimate of how busy a floor is wouldn't identify a free chair.

So OpenSeat ended up using several approaches, each with its own limitations.

The prototype maps **626 non-bookable seats across SLC Floors 5, 7 and 8**. Students can report whether a seat is free or taken; a QR code opens that exact seat on the website; and **Find me a free seat** recommends a reported opening, including a direction from the elevators. If one floor has no reported openings, it can suggest another mapped floor.

We also designed individual seat sensors to avoid relying solely on reports, but **the sensors are simulated**, not installed. Bluetooth provides an area-level device count, never the status of a particular seat. Every seat shows where its information came from and how recent it is. When information gets old, it becomes **No recent info** instead of pretending to know.

I worked on the Bluetooth experiments, mapping, design choices, website direction and testing. AI coding tools helped implement and refine the React and Vite application; Firebase shares observations between browsers, and GitHub Pages hosts it. This is a team course project, not something I claim to have hand-coded alone.

**Did we solve the original problem? Not yet.** Automated tests show the website can quickly find a *reported* free seat and share updates across devices. We haven't established that those seats are physically empty during busy periods, or that students actually save time. False reports and unreliable measurements are still real weaknesses.

That's what we'd need to test next.
