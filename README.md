# HiveWatch Utah

**Listen carefully. Know your sources. Route tips to people who can act.** A calm, static site for neighborhood awareness along the Wasatch Front (Salt Lake, Utah, Davis, and Weber counties), at hivewatchutah.com. Sister site to [Prepare Utah](https://prepareutah.com/) (household readiness) and [FaultLine Utah](https://faultlineutah.com/) (earthquake hazards by address).

- **Home** (`index.html`): the hand-typed Hive Status strip, a note from the desk, and the three paths.
- **Listen** (`listen.html`): public Broadcastify scanner feeds for the four counties, and why radio is not confirmed crime.
- **Know** (`know.html`): named X accounts, the Salt Lake City crime map, and how to read a scanner tip.
- **Route** (`route.html`): hard rules, a first-yes-wins question walk, and the six agency tip doors.
- **About** (`about.html`): placeholder founder note, what this is and isn't, and privacy.

It's a plain static site: HTML, CSS, and a little JavaScript, with no build step and nothing to install. No accounts, cookies, analytics, outside fonts, or network calls. The Route questions never leave the browser tab.

HiveWatch Utah is for education and neighborhood awareness only. It is not an official alert system and is not affiliated with Be Ready Utah, any police department, or any government agency. In an emergency, call 911.

## Folders

```
site/                     ← the website; this folder is what gets published
  *.html                  one file per page, edited by hand
  assets/css/style.css    all styling (every color is at the top), plus print styles
  assets/js/common.js     mobile menu
  assets/js/route.js      first-yes door highlight; no network calls
  assets/favicon.svg
  sitemap.xml, robots.txt, _headers
scripts/
  serve.py                local preview server
```

## Preview it on this Mac

```bash
python3 scripts/serve.py
```

Then open http://localhost:8739. Press Ctrl+C in the terminal to stop it. (FaultLine Utah uses port 8737 and Prepare Utah 8738, so all three can run at once.)

Unknown addresses show the browser's plain "File not found" locally. GitHub Pages serves `site/404.html` for them instead; its links start with `/` so it works at any depth.

## Change the words

There is no build step: edit the HTML file and reload.

| What | Where |
|---|---|
| Hive Status strip | `site/index.html` (see below) |
| Broadcastify feeds | `site/listen.html` |
| X accounts and the Salt Lake City crime map | `site/know.html` |
| Route questions and tip doors | `site/route.html`; the question-to-door order is in `site/assets/js/route.js` |
| Header menu and footer | repeated in every `site/*.html` file; change all six together |
| Founder note, privacy | `site/about.html` |

When you change a link, change the `href` and the visible URL under it together. If a feed, account, or form disappears, remove the row. Don't guess a replacement.

When `style.css` or a `.js` file changes after launch, bump the `?v=2026-10-23` on its `<link>`/`<script>` tags in every page so browsers fetch the new file.

## Update the Hive Status strip

The strip on the home page is typed by hand. Nothing fetches it.

1. Open `site/index.html`.
2. Find `id="hive-status"` (or the comment that starts with `HIVE STATUS`).
3. Replace the text inside `<p class="status-line">`. Keep this shape, including the middle dots:

   `As of [time] · [quiet|watch] · [one dry sentence] · Source: […]`

4. Set `data-level` on that same paragraph to the same word you wrote in the line.
   - `quiet` gives the bar a sage edge. Use it when there is nothing countywide you would ask a neighbor to notice.
   - `watch` gives the bar a honey edge. Use it for one dry thing worth a second look. It is still not an alert, and it is not a list of people.
5. Write one sentence in the third slot. Name the source in the fourth. If you cannot name a source, do not change the line.
6. Do not add a third level. If someone is in danger, the strip is the wrong tool. Every page already tells people to call 911.
7. Save, commit, and push. The strip does not update itself.

An unknown `data-level` (a typo, a third word) leaves the bar neutral gray so a misspelled watch does not look quiet.

The page ships with one quiet sample:

`As of Thursday, October 22, 2026, 6:00 p.m. Mountain Time · quiet · No countywide pattern on the public feeds worth a watch note. · Source: founder desk, public Broadcastify feeds (unconfirmed radio).`

A watch line, when you have one, looks like this (with `data-level="watch"`):

`As of Friday, October 23, 2026, 8:10 a.m. Mountain Time · watch · Davis feed mentioned repeat alarms on the same block overnight, nothing confirmed. · Source: founder desk, Davis County Broadcastify feed (unconfirmed radio).`

## Colors

HiveWatch shares Prepare Utah's chrome (serif headings, sticky header, emergency strip, cards) but in a dark night palette: blue-black ground, warm cream type, honey accents, sky-blue links, sage for "quiet," and red-rock eyebrows. Prepare Utah and FaultLine Utah stay light.

Every color is a variable in the `:root` block at the top of `site/assets/css/style.css`, including the home page's night ridges (`--sky-top`, `--ridge-*`). Text colors meet WCAG AA contrast against their backgrounds; check any new pair before using it. Printing switches to a light palette (the `@media print` block at the bottom) so pages stay legible on paper.

## Publishing (GitHub Pages)

Set up the same way as FaultLine Utah and Prepare Utah. The code lives at https://github.com/prepareutah/hivewatchutah (public). **Every push to `main` republishes the site** within a minute or two through `.github/workflows/pages.yml`, which uploads the `site/` folder. Watch deploys under the repo's **Actions** tab.

```bash
git add -A
git commit -m "Describe the change"
git push
```

**Git and iCloud.** This folder is in iCloud Drive, which corrupts Git's internal files if it syncs them. So Git's database lives outside iCloud at `~/.git-repos/hivewatchutah.git`, and the `.git` here is a one-line pointer to it. On another computer, clone from GitHub instead of opening this iCloud folder. iCloud conflict copies (`file 2.html`) are kept out of commits by `.gitignore` and are safe to delete.

**Domain.** hivewatchutah.com is registered at GoDaddy (Oct 22, 2026). To point it at GitHub Pages, set these DNS records in GoDaddy and remove the default parked `A` records:

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | prepareutah.github.io |

In the repo's Settings → Pages, set Source to **GitHub Actions** and the custom domain to `hivewatchutah.com`. Once DNS is in place and GitHub issues the certificate, turn on **Enforce HTTPS** there. If the certificate stalls, remove the custom domain and add it back about an hour after the DNS change, as with FaultLine.

## To-do before public launch

**Accounts and setup**
- [x] Register **hivewatchutah.com** (GoDaddy, Oct 22, 2026).
- [ ] Create the GitHub repo, push, and turn on GitHub Pages with the custom domain.
- [ ] Point GoDaddy DNS at GitHub Pages (table above), then turn on Enforce HTTPS.
- [ ] Set up a contact mailbox (for example `hello@hivewatchutah.com`) and add it to the About page.
- [ ] Add reciprocal links to HiveWatch Utah from Prepare Utah and FaultLine Utah (footers and About).

**Content**
- [ ] Replace the placeholder founder note on About (look for `TODO: Replace this placeholder founder bio`).
- [ ] A share image (`og:image`) for links posted on social media.
- [ ] Re-check the feeds, accounts, and tip doors every few months. Checked Oct 22, 2026: every Broadcastify ID opens the county its card names, and the SLCPD, SIAC, Tip A Cop, and Crime Stoppers pages load. X profiles and fbi.gov can't be checked by script (X answers every handle; FBI blocks scripts), so open those by hand.
- [ ] Listen: the Weber County feed (47808) is titled "Box Elder and Weber County Public Safety" on Broadcastify. Decide whether the card should say so.
- [ ] Route: confirm whether the Utah Crime Stoppers online form is live, and update door 6.

**Review**
- [ ] Lawyer: disclaimer, privacy section, and the Route "hard rules" wording.
- [ ] A Utah public information officer or dispatcher: the Route question order and which door each kind of tip belongs at.

## Disclaimer

For education and neighborhood awareness only. Not an official alert system and not a substitute for 911. Not affiliated with Be Ready Utah, any police department, any sheriff's office, or any government agency. Feeds, posts, and maps belong to their publishers.
