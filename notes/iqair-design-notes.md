# Design notes: IQAir's Salt Lake City page

Looked at https://www.iqair.com/air-quality/usa/utah/salt-lake-city on Oct 29, 2026, at desktop and phone widths. These are notes on layout and ideas, not copied content.

**Done Oct 29, 2026:** the Right now box above the county cards (with today's tips), AQI-by-pollutant chips, the 24-hour history strip, source credit in the Today meta line, and Common questions on Seasons. FAQ structured data was left out: since 2023 Google shows FAQ rich results only for well-known government and health sites.

## What the page does

From top to bottom:

1. **One big "right now" card.** The AQI number in a colored square, the category word ("Good"), a face icon, and the main pollutant with its concentration. The whole card is tinted in the category color, with a soft glow of that color behind the page header. Under it is a strip with temperature, wind and humidity. On a phone this card fills the first screen, so the question "is the air OK?" is answered before any scrolling.
2. **Data attribution card**, near the top: how many stations and contributors feed the number. It opens a list.
3. **Hourly forecast**: a sideways-scrolling row of hour columns, each with a colored AQI chip, a weather icon, temperature, wind and humidity.
4. **Daily forecast**: seven rows, each with a colored AQI chip and the weather.
5. **Pollutant tiles**: six small tiles (PM2.5, PM10, ozone, NO₂, SO₂, CO), each with a colored dot and a concentration in µg/m³.
6. **A one-line comparison banner**: whether today's PM2.5 meets the WHO annual guideline.
7. **Health tips for the current level**: two icon-and-sentence tips (go outside; open the windows).
8. **Map and pollen, side by side.** The pollen widget has a round index dial (1, "Low") and tree, grass and weed bars. Its source is wetter.com, a commercial model forecast, not a counting station.
9. **A store section** for purifiers, masks and monitors.
10. **History**: an hourly bar chart colored by category, with Hourly, Daily and Monthly toggles.
11. **Rankings**: the cleanest and most polluted stations in the city, and US cities ranked by AQI, as tables with colored chips.
12. **Links out**: their app, their globe view, a pitch to host a sensor, and news cards.
13. **FAQ** at the bottom with city questions written the way people search: "Is Salt Lake City polluted?", "When is Salt Lake City's worst air quality?", "What causes air pollution in Salt Lake City?"

Look: light and airy, with white cards on pale gray, rounded corners, a plain sans-serif typeface, and generous spacing. The category color does almost all of the visual work. Everything else stays neutral.

## Worth borrowing

- **A "right now" answer before the county cards.** For example, a summary line for the whole Front: the worst county right now, its AQI and its category word, tinted in the category color. Today the visitor has to scan eight cards to get that answer.
- **Per-pollutant chips.** `air.json` already carries the AQI for each pollutant (`now.params`: PM2.5, PM10, ozone), but a card shows only the top one. Small chips would show *why* a day is bad: ozone in July, particles in January.
- **Today's tips by level.** One or two short actions for the current level on each card or in the summary, linked to the matching level on Breathe. The Breathe page already has the words.
- **A short 24-hour history.** A tiny bar strip per card. This needs `fetch_data.py` to keep the last 24 hourly readings in `air.json`, which it can do from the previous file. It's moderate work.
- **An FAQ block written the way people search.** Seasons and Air already answer most of these questions. Wrapping a few in question headings (with FAQ structured data) would help search without new research.
- **Data attribution near the top.** HiveAir credits its sources in the small print. A one-line "From Utah DAQ and EPA AirNow monitors" next to the numbers builds trust.

## Where HiveAir should stay different

- **Burn days.** IQAir has nothing on Utah's action levels or the winter burn rule. That's the most local, most useful thing HiveAir shows. Keep it prominent.
- **Official monitors, official colors.** IQAir blends low-cost sensors into its own "AQI⁺" scale and softens the EPA colors. HiveAir shows AirNow's numbers unchanged in EPA's colors, which AirNow's terms require. Say so plainly; it's a selling point.
- **No store and no tracking.** IQAir sells purifiers on the same page and opens with a cookie banner. HiveAir's independence is part of its trust.
- **Honest pollen.** Their pollen dial is a model forecast. HiveAir's calendar plus a link to the real count is more honest. If a licensed pollen forecast is ever added, label it as a model.
- **The calm dark look.** No need to copy the light theme. The ideas that transfer are the structure (answer first, details after) and letting the category color do the work.

## Not possible with current data

- An hourly forecast. DAQ and AirNow publish daily forecasts only.
- Station rankings. The AirNow file the site reads gives one number per reporting area (Salt Lake City, Ogden, Provo). AirNow also publishes hourly files by monitoring site, which could add station-level readings, but that's a bigger change.
