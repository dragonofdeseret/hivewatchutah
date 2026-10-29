#!/usr/bin/env python3
"""Builds site/data/air.json, the numbers behind the home page's "Today"
panel, from three public feeds:

  Utah DAQ forecast  https://air.utah.gov/csvFeed.php?id=forecast
                     3-day health level and action (burn) level by county
  EPA AirNow         https://files.airnowtech.org/airnow/today/reportingarea.dat
                     current AQI by reporting area (NowCast, as published)
  NWS                https://api.weather.gov/alerts/active?area=UT
                     air-related alerts (smoke, dust, stagnation)

Standard library only. Run from the project root:

    python3 scripts/fetch_data.py
    python3 scripts/fetch_data.py --previous old-air.json --strict

GitHub Actions runs it every 30 minutes before publishing the site
(.github/workflows/pages.yml). When a feed is down, the matching section
of the previous air.json is kept and marked stale, minus any forecast
days or alerts that have passed. With --strict the script exits 1 if
neither DAQ nor AirNow answered, so a scheduled run leaves the last good
deployment live instead of publishing older numbers as new.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data", "air.json")

USER_AGENT = "HiveWatchUtah/1.0 (+https://hivewatchutah.com)"

DAQ_FORECAST = "https://air.utah.gov/csvFeed.php?id=forecast"
AIRNOW_AREAS = "https://files.airnowtech.org/airnow/today/reportingarea.dat"
NWS_ALERTS = "https://api.weather.gov/alerts/active?area=UT"

# One row per county card, in display order.
#   daq:   key in DAQ's forecast CSV
#   page:  id of the county's page at https://air.utah.gov/forecast.php?id=…
#   area:  AirNow reporting area that covers the county (None if there is none)
#   same:  NWS SAME code, which ties alerts to the county's card
#   rule:  inside Utah rule R307-302, which sets the burn (action) levels
#   core:  one of the four Wasatch Front counties shown first
COUNTIES = [
    {"id": "salt-lake", "name": "Salt Lake", "daq": "slc", "page": "slc", "area": "Salt Lake City", "same": "049035", "rule": True, "core": True,
     "note": "AirNow's Salt Lake City reading is the highest of eight monitors in Salt Lake and Davis counties."},
    {"id": "davis", "name": "Davis", "daq": "bv", "page": "bv", "area": "Salt Lake City", "same": "049011", "rule": True, "core": True,
     "note": "Davis has no AirNow area of its own; its Bountiful monitor is part of the Salt Lake City reading."},
    {"id": "weber", "name": "Weber", "daq": "weber", "page": "hv", "area": "Ogden", "same": "049057", "rule": True, "core": True,
     "note": "AirNow's Ogden reading comes from the Harrisville monitor."},
    {"id": "utah", "name": "Utah", "daq": "utah", "page": "ln", "area": "Provo", "same": "049049", "rule": True, "core": True,
     "note": "AirNow's Provo reading comes from the Lindon and Spanish Fork monitors."},
    {"id": "cache", "name": "Cache", "daq": "cache", "page": "sm", "area": "Logan", "same": "049005", "rule": True, "core": False, "note": None},
    {"id": "box-elder", "name": "Box Elder", "daq": "boxelder", "page": "bg", "area": "Brigham City", "same": "049003", "rule": True, "core": False,
     "note": "DAQ's Box Elder page says it does not forecast there at this time, but DAQ's data feed lists the days shown."},
    {"id": "tooele", "name": "Tooele", "daq": "tooele", "page": "ed", "area": "Tooele", "same": "049045", "rule": True, "core": False, "note": None},
    {"id": "wasatch", "name": "Wasatch", "daq": "hb", "page": "hb", "area": None, "same": "049051", "rule": False, "core": False,
     "note": "DAQ forecasts the Heber Valley, but AirNow has no reporting area here."},
]

# NWS SAME codes for the counties above plus Summit and Morgan, whose
# residents share these valleys' alerts.
ALERT_COUNTIES = {c["same"] for c in COUNTIES} | {"049043", "049029"}
ALERT_EVENTS = {"Air Quality Alert", "Air Stagnation Advisory", "Dense Smoke Advisory",
                "Blowing Dust Advisory", "Blowing Dust Warning", "Dust Advisory", "Dust Storm Warning"}

# DAQ writes health levels as run-together words (unhealthyforsensitivegroups).
HEALTH = {
    "good": ("good", "Good"),
    "moderate": ("moderate", "Moderate"),
    "unhealthyforsensitivegroups": ("usg", "Unhealthy for Sensitive Groups"),
    "usg": ("usg", "Unhealthy for Sensitive Groups"),
    "unhealthy": ("unhealthy", "Unhealthy"),
    "veryunhealthy": ("very-unhealthy", "Very Unhealthy"),
    "hazardous": ("hazardous", "Hazardous"),
}
ACTIONS = {"unrestricted", "voluntary", "mandatory"}
TZ_OFFSETS = {"MST": -7, "MDT": -6}

# When DAQ lists one county-day twice, the worse health level and the
# stricter action win. Words the script doesn't know rank highest, so
# they reach the page (shown as received, with a link to DAQ).
HEALTH_RANK = {"good": 0, "moderate": 1, "usg": 2, "unhealthy": 3, "very-unhealthy": 4, "hazardous": 5}
ACTION_RANK = {"unrestricted": 0, "voluntary": 1, "mandatory": 2}

try:
    from zoneinfo import ZoneInfo
    DENVER = ZoneInfo("America/Denver")
except Exception:  # no time zone database; standard time is close enough to pick a date
    DENVER = timezone(timedelta(hours=-7))


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(url, accept=None, max_bytes=8_000_000):
    """GET with a 20 s timeout and two retries."""
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as r:
                body = r.read(max_bytes + 1)
                if len(body) > max_bytes:
                    raise ValueError("response larger than %d bytes" % max_bytes)
                return body
        except Exception as e:  # network errors, HTTP errors, size guard
            last = e
            time.sleep(2 * (attempt + 1))
    raise last


def health_level(raw):
    key = re.sub(r"[^a-z]", "", (raw or "").lower())
    cat, label = HEALTH.get(key, (None, (raw or "").strip() or None))
    return cat, label


def stricter(a, b):
    """Merge two forecast rows for the same county and day. A blank cell
    ranks lowest; an unknown word ranks highest."""
    def health(d):
        return HEALTH_RANK.get(d["health"], 99 if d["health_label"] else -1)

    def action(d):
        return ACTION_RANK.get(d["action"], 99 if d["action"] else -1)

    out = dict(a)
    if health(b) > health(a):
        out.update(health=b["health"], health_label=b["health_label"])
    if action(b) > action(a):
        out.update(action=b["action"], action_known=b["action_known"])
    out["message"] = b["message"] or a["message"]
    return out


def read_daq_forecast():
    text = fetch(DAQ_FORECAST, max_bytes=200_000).decode("utf-8-sig", "replace")
    reader = csv.reader(text.splitlines())
    header = [h.strip().lower() for h in next(reader, [])]
    if not {"day", "county", "severity", "action"} <= set(header):
        raise ValueError("unexpected forecast CSV columns: %s" % header)
    col = {name: i for i, name in enumerate(header)}

    def cell(row, name):
        i = col.get(name)
        return row[i].strip() if i is not None and i < len(row) else ""

    days, dupes = {}, 0
    for row in reader:
        day = cell(row, "day")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            continue
        cat, label = health_level(cell(row, "severity"))
        action = cell(row, "action").lower() or None
        entry = {
            "date": day,
            "health": cat,
            "health_label": label,
            "action": action,
            "action_known": action in ACTIONS,
            "message": cell(row, "message") or None,
        }
        county = days.setdefault(cell(row, "county"), {})
        if day in county:
            dupes += 1
            entry = stricter(county[day], entry)
        county[day] = entry
    if dupes:
        print("warning: %d repeated forecast rows merged (worse level kept)" % dupes, file=sys.stderr)
    wanted = {c["daq"] for c in COUNTIES}
    if not wanted & set(days):
        raise ValueError("no Wasatch Front counties in the forecast CSV")
    return {k: [v[d] for d in sorted(v)] for k, v in days.items()}


def mdy(date_s):
    """'10/24/26' or '10/24/2026' -> (2026, 10, 24)."""
    m, d, y = (int(x) for x in date_s.split("/"))
    return (y if y >= 100 else 2000 + y), m, d


def airnow_time(date_s, time_s, tz):
    """'10/24/26', '10:00', 'MDT' -> aware datetime."""
    y, m, d = mdy(date_s)
    hh, mm = (int(x) for x in time_s.split(":")[:2])
    return datetime(y, m, d, hh, mm, tzinfo=timezone(timedelta(hours=TZ_OFFSETS[tz])))


def read_airnow():
    raw = fetch(AIRNOW_AREAS).decode("latin-1")
    if "|UT|" not in raw:
        raise ValueError("no Utah rows in reportingarea.dat")
    areas = {c["area"] for c in COUNTIES if c["area"]}
    latest = utc_now() + timedelta(hours=2)
    now, forecast, skipped = {}, {}, 0
    for line in raw.splitlines():
        f = line.split("|")
        if len(f) < 15 or f[8] != "UT" or f[7] not in areas:
            continue
        # One malformed row shouldn't cost every county its reading.
        try:
            area, kind, primary, param, aqi, category = f[7], f[5], f[6] == "Y", f[11], f[12], f[13]
            cat, label = health_level(category)
            if kind == "O" and f[2] and f[3] in TZ_OFFSETS:
                observed = airnow_time(f[1], f[2], f[3])
                if observed > latest:
                    raise ValueError("observation in the future")
                entry = now.setdefault(area, {"area": area, "observed_at": iso(observed), "params": []})
                item = {"pollutant": param, "aqi": int(aqi) if aqi.isdigit() else None, "cat": cat, "category": label}
                entry["params"].append(item)
                if primary:
                    entry.update({"aqi": item["aqi"], "cat": cat, "category": label, "pollutant": param})
            elif kind == "F" and primary:
                forecast.setdefault(area, []).append({"date": "%04d-%02d-%02d" % mdy(f[1]), "health": cat, "health_label": label})
        except (ValueError, KeyError, IndexError):
            skipped += 1
    if skipped:
        print("warning: skipped %d unreadable AirNow rows" % skipped, file=sys.stderr)
    if not now:
        raise ValueError("no current readings for the Wasatch Front areas")
    for entry in now.values():
        if "aqi" not in entry:  # no primary flag: take the highest AQI
            top = max(entry["params"], key=lambda p: p["aqi"] if p["aqi"] is not None else -1)
            entry.update({"aqi": top["aqi"], "cat": top["cat"], "category": top["category"], "pollutant": top["pollutant"]})
    return now, forecast


def read_nws_alerts():
    data = json.loads(fetch(NWS_ALERTS, accept="application/geo+json", max_bytes=3_000_000))
    alerts = []
    for feature in data.get("features", []):
        p = feature.get("properties", {})
        same = set(p.get("geocode", {}).get("SAME", []))
        if p.get("event") in ALERT_EVENTS and same & ALERT_COUNTIES:
            alerts.append({
                "event": p.get("event"),
                "headline": p.get("headline"),
                "areas": p.get("areaDesc"),
                "same": sorted(same & ALERT_COUNTIES),
                "starts": p.get("onset") or p.get("effective"),
                "ends": p.get("ends") or p.get("expires"),
                "sender": p.get("senderName"),
            })
    return alerts


def parse_time(s):
    try:
        return datetime.fromisoformat((s or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def current_alerts(alerts, when):
    """Drop alerts that have already ended."""
    keep = []
    for a in alerts or []:
        ends = parse_time(a.get("ends"))
        if ends is None or ends.tzinfo is None or ends > when:
            keep.append(a)
    return keep


def load_previous(path):
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as f:
            prev = json.load(f)
        return prev if prev.get("version") == 1 else None
    except (OSError, ValueError):
        return None


def build(previous):
    built = utc_now()
    sources = {}

    def run(name, fn):
        try:
            result = fn()
            sources[name] = {"ok": True, "stale": False, "fetched_at": iso(built), "error": None}
            return result
        except Exception as e:
            print("warning: %s failed: %s" % (name, e), file=sys.stderr)
            old = (previous or {}).get("sources", {}).get(name)
            sources[name] = {"ok": False, "stale": bool(old and old.get("fetched_at")),
                             "fetched_at": old.get("fetched_at") if old else None, "error": str(e)[:200]}
            return None

    daq = run("daq_forecast", read_daq_forecast)
    airnow = run("airnow", read_airnow)
    alerts = run("nws", read_nws_alerts)

    today = built.astimezone(DENVER).strftime("%Y-%m-%d")

    def upcoming(days):
        return [d for d in days or [] if d.get("date", "") >= today]

    prev_counties = {c["id"]: c for c in (previous or {}).get("counties", [])}
    counties = []
    for c in COUNTIES:
        old = prev_counties.get(c["id"], {})
        card = {k: c[k] for k in ("id", "name", "page", "same", "rule", "core", "note")}
        card["area"] = c["area"]

        if airnow is not None:
            card["now"] = airnow[0].get(c["area"]) if c["area"] else None
        else:
            card["now"] = old.get("now")

        # Forecast days, best source first. days_note says why a card isn't
        # showing a fresh DAQ forecast: "daq-down" (DAQ didn't answer) or
        # "not-in-daq" (DAQ answered without this county).
        fresh = upcoming(daq.get(c["daq"])) if daq is not None else []
        kept = upcoming(old.get("days")) if old.get("days_source") == "daq" else []
        backup = upcoming(airnow[1].get(c["area"])) if airnow is not None and c["area"] else []
        note = None if daq is not None else "daq-down"
        if fresh:
            days, source = fresh, "daq"
        elif daq is None and kept and kept[0]["date"] == today:
            days, source = kept, "daq"
        elif backup:
            # AirNow forecasts carry the health level only, never a burn level.
            days, source = [dict(d, action=None, action_known=False, message=None) for d in backup], "airnow"
            note = note or "not-in-daq"
        elif daq is None and kept:
            days, source = kept, "daq"
        else:
            days, source = [], None
            note = note or "not-in-daq"
        card["days"], card["days_source"], card["days_note"] = days, source, note
        counties.append(card)

    if alerts is None:
        alerts = (previous or {}).get("alerts", [])
    alerts = current_alerts(alerts, built)

    # The oldest of the two feeds the cards depend on. The page warns when
    # this gets old, even if a later run refreshed the alerts.
    stamps = [parse_time(sources[k]["fetched_at"]) for k in ("daq_forecast", "airnow") if sources[k]["fetched_at"]]
    data_at = iso(min(stamps)) if stamps else None

    return {
        "version": 1,
        "built_at": iso(built),
        "data_at": data_at,
        "sources": sources,
        "counties": counties,
        "alerts": alerts,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default=OUT, help="where to write air.json (default: site/data/air.json)")
    ap.add_argument("--previous", help="last published air.json, reused for any feed that fails")
    ap.add_argument("--strict", action="store_true", help="exit 1 if neither DAQ nor AirNow answered")
    args = ap.parse_args()

    data = build(load_previous(args.previous))
    fresh = [k for k, v in data["sources"].items() if v["ok"]]
    if args.strict and not {"daq_forecast", "airnow"} & set(fresh):
        sys.exit("error: neither DAQ nor AirNow answered; not writing %s" % args.out)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, args.out)
    print("Wrote %s (fresh: %s)" % (args.out, ", ".join(fresh) or "none"))


if __name__ == "__main__":
    main()
