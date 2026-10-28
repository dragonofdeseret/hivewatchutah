# HiveWatch Utah

**The air we all share.** A calm, plain-language air quality and pollen site for the Wasatch Front (Salt Lake, Davis, Utah and Weber counties, plus Cache, Box Elder, Tooele and Wasatch), at hivewatchutah.com. Sister site to [Prepare Utah](https://prepareutah.com/) (household readiness) and [FaultLine Utah](https://faultlineutah.com/) (earthquake hazards by address).

- **Home** (`index.html`): **Today along the Front**, live county cards built every 30 minutes from Utah DAQ and EPA AirNow (AQI now, 3-day health forecast, burn level, smoke and dust alerts), plus the hand-typed Hive Status line and the four guides.
- **Air** (`air.html`): the AQI in six colors, health level versus action (burn) level, the burn rules, monitors versus sensors versus models, and which forecast covers each county.
- **Seasons** (`seasons.html`): winter inversions, summer ozone, wildfire smoke, Great Salt Lake dust, who breathes the worst air, and what Utah is doing.
- **Pollen** (`pollen.html`): the pollen calendar, local plants, how to read a count, where to find a real one, and when to get care.
- **Breathe** (`breathe.html`): what to do at each level, a clean-air room, filters, masks, timing, schools, and when to get care.
- **About** (`about.html`): placeholder founder note, where the numbers come from, and privacy.

It's a plain static site: HTML, CSS and a little JavaScript. One Python script turns three public feeds into a small `site/data/air.json`. Visitors' browsers load only this site: no accounts, cookies, analytics, outside fonts, or calls to the agencies.

HiveWatch Utah is for education only. It is not medical advice, not an official alert, and not affiliated with Utah DEQ, EPA, AirNow, the National Weather Service, AAAAI, or any government agency.

> The first version of HiveWatch (Oct 22, 2026, commit `8de8be4`) was a scanner and tip-routing site. That content moved to its own project, **Wasatch Wire** (`Websites/WasatchWire`).

## Folders

```
site/                     ← the website; this folder is what gets published
  *.html                  one file per page, edited by hand
  assets/css/style.css    all styling (every color is at the top), plus print styles
  assets/js/air.js        the Today panel; reads data/air.json and nothing else
  assets/js/common.js     mobile menu
  assets/favicon.svg
  data/air.json           built by scripts/fetch_data.py (not committed)
  sitemap.xml, robots.txt, _headers
scripts/
  fetch_data.py           builds site/data/air.json from Utah DAQ, AirNow and NWS
  serve.py                local preview server
.github/workflows/
  pages.yml               fetches data and publishes site/ on every push and every 30 minutes
  keepalive.yml           weekly; keeps GitHub from switching the 30-minute schedule off
```

## Preview it on this Mac

```bash
python3 scripts/fetch_data.py
```

```bash
python3 scripts/serve.py
```

Then open http://localhost:8739. Press Ctrl+C in the terminal to stop it. (FaultLine Utah uses port 8737, Prepare Utah 8738 and Wasatch Wire 8740, so they can all run at once.) Run `fetch_data.py` again whenever you want fresh numbers; without it the Today panel says the readings didn't load.

Unknown addresses show the browser's plain "File not found" locally. GitHub Pages serves `site/404.html` instead; its links start with `/` so it works at any depth.

## Change the words

There is no build step for the pages: edit the HTML file and reload.

| What | Where |
|---|---|
| Hive Status line | `site/index.html` (see below) |
| Guide pages | `site/air.html`, `seasons.html`, `pollen.html`, `breathe.html` |
| Pollen calendar | the `<table class="cal">` in `site/pollen.html`; each month cell's `data-lvl` is 0 (none), 1 (some), 2 (in season) or 3 (peak) |
| Burn-day wording on the county cards | `burnLine()` in `site/assets/js/air.js` |
| Which counties get cards, and their notes | `COUNTIES` in `scripts/fetch_data.py` |
| Header menu and footer | repeated in every `site/*.html` file; change all seven together |
| Founder note, data sources, privacy | `site/about.html` |

Each guide cites its sources next to the claim (the small rounded links) and ends with "Checked [date]". When you re-check a page, update that date.

When `style.css` or a `.js` file changes after launch, bump the `?v=2026-10-24` on its `<link>`/`<script>` tags in every page so browsers fetch the new file.

## Update the Hive Status line

The live cards cover the AQI and burn levels. The Hive Status line is the desk's hand-typed note on what they don't: pollen season, smoke on its way, a long inversion coming. Nothing fetches it.

1. Open `site/index.html` and find `id="hive-status"`.
2. Replace the text inside `<p class="status-line">`, keeping the shape and the middle dots:

   `As of [time] · [quiet|watch] · [one dry sentence] · Source: […]`

3. Set `data-level` on that paragraph to the same word: `quiet` (sage edge: nothing to plan around) or `watch` (honey edge: one thing worth planning around; still not an alert). An unknown word leaves the edge gray.
4. One sentence. Name a source; if you can't, leave the line alone. Don't add a third level: anyone having trouble breathing should call 911, and every page says so.
5. Commit and push.

## How the live data works

`scripts/fetch_data.py` (Python standard library only) reads:

| Feed | What it gives | Notes |
|---|---|---|
| [Utah DAQ forecast CSV](https://air.utah.gov/csvFeed.php?id=forecast) | 3-day health level and action (burn) level per county | The authority on burn days. Only `good`/`unrestricted` had been seen when this was written (Oct 24, 2026); other words come from DAQ's legend. Any unexpected word is shown as received with a link to DAQ. |
| [AirNow reportingarea.dat](https://files.airnowtech.org/airnow/today/reportingarea.dat) | Current NowCast AQI per reporting area | Shown unchanged. "Salt Lake City" is the worst of eight Salt Lake and Davis monitors; Ogden is Harrisville; Provo is Lindon and Spanish Fork; no area covers Wasatch or Summit. |
| [NWS active alerts](https://api.weather.gov/alerts/active?area=UT) | Air Quality Alert, Air Stagnation, Dense Smoke, Blowing Dust and Dust Storm alerts | Filtered to the counties above plus Summit and Morgan. |

GitHub Actions runs it every 30 minutes (`pages.yml`) and publishes the result with the site:

- If one feed is down, that part of the last published `air.json` is reused, and the page says which source is older. Forecast days and alerts that have already passed are dropped, never carried forward.
- If DAQ is down (or leaves a county out), a card falls back to AirNow's forecast, which has health levels but no burn level, and says so on the card.
- If both DAQ and AirNow are down on a scheduled run, nothing is published and the previous site stays live. GitHub emails you about the failed run.
- If the DAQ or AirNow data is more than 3 hours old (`data_at` in the file), the page shows a "these numbers are N hours old" warning and points to air.utah.gov. A single reading older than 3 hours is dimmed. A tab left open refreshes itself every 15 minutes.
- Repeated DAQ rows for one county and day are merged, keeping the worse level. Unreadable AirNow rows are skipped, not fatal.
- GitHub turns off scheduled workflows in public repos after 60 days without a commit. `keepalive.yml` re-enables them weekly. If the warning ever appears and stays, open the repo's **Actions** tab and re-enable **Deploy site**.
- Pollen has no live data. The only active certified counter (AAAAI National Allergy Bureau, Intermountain's Riverton station) forbids reuse without written permission, so the site links to it.

AirNow's [Data Exchange Guidelines](https://docs.airnowapi.org/docs/DataUseGuidelines.pdf) ask for credit (in every footer), "preliminary" labels (on the home page and footer), official AQI colors (in `style.css`, not themed), unaltered values, and notice to AirNow and the state agency. See the to-do list.

## Colors

The dark night palette (blue-black ground, cream type, honey accents) and every other color are variables in the `:root` block at the top of `site/assets/css/style.css`. Two sets are fixed on purpose:

- **AQI colors** (`--aqi-*`) are EPA's official values, which AirNow asks sites to use unchanged.
- **Pollen calendar** (`--pollen-1` to `--pollen-3`) is one honey hue from dim to bright, checked as an ordered scale against the card color. Each cell also carries text for screen readers.

Text meets WCAG AA contrast on the dark background. Printing switches to a light palette.

## Publishing (GitHub Pages)

Set up the same way as FaultLine Utah and Prepare Utah. The code lives at https://github.com/prepareutah/hivewatchutah (public). **Every push to `main` republishes the site**, and so does the 30-minute data schedule. Watch deploys under the repo's **Actions** tab.

```bash
git add -A
git commit -m "Describe the change"
git push
```

**Git and iCloud.** This folder is in iCloud Drive, which corrupts Git's internal files if it syncs them. So Git's database lives outside iCloud at `~/.git-repos/hivewatchutah.git`, and the `.git` here is a one-line pointer to it. On another computer, clone from GitHub instead of opening this iCloud folder. iCloud conflict copies (`file 2.html`) are kept out of commits by `.gitignore` and are safe to delete.

**Domain.** hivewatchutah.com is registered at GoDaddy (Oct 22, 2026). Its DNS points at GitHub Pages (set Oct 27, 2026), with the default parked `A` records removed:

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | prepareutah.github.io |

The repo's Settings → Pages has Source set to **GitHub Actions**, `hivewatchutah.com` as the custom domain, and **Enforce HTTPS** on. The Let's Encrypt certificate covers hivewatchutah.com and www.hivewatchutah.com and renews automatically. The first one didn't start on its own after the DNS change; removing the custom domain and adding it back got it issued at once, as with FaultLine. Do the same if DNS ever changes and the certificate stalls.

## To-do before public launch

**Accounts and setup**
- [x] Register **hivewatchutah.com** (GoDaddy, Oct 22, 2026).
- [x] Create the GitHub repo, push, and turn on GitHub Pages with the custom domain (Oct 27, 2026).
- [x] Point GoDaddy DNS at GitHub Pages (table above), then turn on Enforce HTTPS (Oct 27, 2026).
- [ ] Set up a contact mailbox (for example `hello@hivewatchutah.com`). Add it to About and to `USER_AGENT` in `scripts/fetch_data.py` (NWS asks API users for contact details).
- [ ] AirNow: register a free AirNow API account (its fact sheet says one is required, even for the files this site reads), sign and return the Data Exchange Guidelines form to dmc@airnowtech.org, and tell Utah DAQ the site uses its data.
- [ ] Optional: ask AAAAI (nab@aaaai.org) and Intermountain's Southridge allergy clinic for written permission to show the Riverton pollen counts with credit.
- [ ] Ask Prepare Utah and FaultLine Utah to link here (footers, and Prepare Utah's air guide, which doesn't cover pollen). Add Wasatch Wire to the sister links once its domain is set.

**Content**
- [ ] Replace the placeholder founder note on About (look for `TODO: Replace this placeholder founder note`).
- [ ] A share image (`og:image`) for links posted on social media.
- [ ] Spanish, human-translated: about 10% of Utahns speak Spanish at home, and almost no Utah air source offers it. Start with the Today panel, the level-by-level actions and the pollen basics.
- [ ] Watch the first winter: confirm DAQ's forecast feed uses the health and action words the script expects (it keeps unknown words as received).

**Re-check on a schedule** (each guide shows its "Checked" date)
- [ ] January: inversion season, the Great Salt Lake level.
- [ ] February–March: the Legislature (air bills), and the pollen calendar as trees start.
- [ ] June–July: EPA AirData refresh, UCAIR grants.
- [ ] Whenever EPA acts: the Northern Wasatch Front ozone classification (repeal proposed Apr 30, 2026) and the PM2.5 standard (upheld in court Jun 26, 2026; further appeals possible).

**Review**
- [ ] Clinician (allergist or pulmonologist): the medical wording listed below.
- [ ] Utah DAQ or an air-quality scientist: the Air and Seasons pages, the burn-day wording in `air.js`, and the questions below.
- [ ] Lawyer: disclaimer, privacy section, and the data-use terms (Utah.gov, AirNow, NWS).

**For the clinician.** All of it paraphrases EPA, AirNow, CDC, NHLBI, AAAAI, ACAAI, Utah DHHS, University of Utah Health or Intermountain Health, but none of it has had a clinician's eye:
- *Breathe:* the "Everyone" and "Sensitive groups" lines on the six level cards; the sensitive-group lists; the whole Masks section (N95/P100 fit, ear-loop and surgical masks, heat risk, children 2 and older, ask first with heart or lung disease or pregnancy); the recess "sensitive" list; When to get care, including the 911 lines for asthma, a young child, heart attack and stroke. NHLBI's asthma page contradicts itself (911 at the top, "call your provider" in a later list); the page uses the 911 line.
- *Pollen:* masks for yard work; starting medicine about a month before the season (Intermountain); HEPA cleaners "may help"; when to see an allergist; the 911 lines; the epinephrine line for oral allergy syndrome; thunderstorm asthma in people without diagnosed asthma; "mild symptoms at around 10 to 20 grains per cubic meter."
- *Seasons and Air:* the ozone symptom list, the sensitive groups for ozone and particles, and the lake-dust and air-toxics health findings (framed as research results, not exposure measurements).

**Questions for Utah DAQ** (the fact-checkers found these unresolved on Oct 24, 2026):
- Box Elder: its forecast page says DAQ "does not forecast for Box Elder at this time," but the forecast feed (and AirNow) carry Box Elder days. Which is right? The card says both until DAQ answers.
- The burn rule's area in Utah County: DEQ's page says west of the Wasatch; the rule text says the whole county. And is the exemption for sources above 7,000 feet still in force? (The rule text was read from Cornell's mirror, which shows amendments through 2017; the official eRules page didn't load.)
- Fines: DEQ's page says up to $150; a 2018 DEQ release says $150 for a first violation and up to $299 a day.
- Which Severity and Action words the forecast feed uses besides `good` and `unrestricted`, and what an action level means for Wasatch County, which is outside R307-302.

## Disclaimer

For education only. Not medical advice and not an official alert or forecast. Air data from the Utah DEQ Division of Air Quality and U.S. EPA AirNow, preliminary and not quality assured. Trouble breathing? Call 911.
