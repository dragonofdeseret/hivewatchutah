/* Today panel on the home page. Reads data/air.json, which
   scripts/fetch_data.py builds from Utah DAQ, EPA AirNow and NWS feeds
   every hour. This file makes no other network request. */
(function () {
  "use strict";

  var body = document.getElementById("today-body");
  var meta = document.getElementById("today-meta");
  var status = document.getElementById("today-status");
  if (!body) return;

  var DAQ = "https://air.utah.gov/forecast.php?id=";
  var OLD_READING_MS = 3 * 3600 * 1000;
  var OLD_DATA_MS = 3 * 3600 * 1000;
  var REFRESH_MS = 15 * 60 * 1000;
  var POLLUTANT = { "PM2.5": "PM2.5", "PM10": "PM10", "OZONE": "ozone", "O3": "ozone", "CO": "carbon monoxide", "NO2": "nitrogen dioxide", "SO2": "sulfur dioxide" };
  var ACTION = { unrestricted: "Unrestricted", voluntary: "Voluntary", mandatory: "Mandatory" };
  // Health levels worth planning around: Unhealthy for Sensitive Groups and up.
  var WATCH_LEVEL = { usg: true, unhealthy: true, "very-unhealthy": true, hazardous: true };
  var SVG = "http://www.w3.org/2000/svg";
  var HEX = "4.5,0 2.25,3.9 -2.25,3.9 -4.5,0 -2.25,-3.9 2.25,-3.9";
  var MAX_WAVE = 7;
  var RANK = { good: 0, moderate: 1, usg: 2, unhealthy: 3, "very-unhealthy": 4, hazardous: 5 };
  var LEVEL = { good: "Good", moderate: "Moderate", usg: "Unhealthy for Sensitive Groups", unhealthy: "Unhealthy", "very-unhealthy": "Very Unhealthy", hazardous: "Hazardous" };
  var PARAM = { "PM2.5": "PM2.5", "PM10": "PM10", "OZONE": "Ozone", "O3": "Ozone", "CO": "CO", "NO2": "NO₂", "SO2": "SO₂" };
  var HOUR_MS = 3600 * 1000;
  // EPA's AQI breakpoints, for a reading whose category word we don't recognize.
  function levelOf(aqi) {
    if (typeof aqi !== "number") return null;
    return aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "usg" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very-unhealthy" : "hazardous";
  }
  // What to do at each level. Copied from the level cards on breathe.html
  // (#levels), which cite EPA; change both together.
  var TIPS = {
    good: ["Enjoy being active outside.", "The same. The air carries little or no risk."],
    moderate: ["Being active outside is still fine.", "Only people who are unusually sensitive may want to adjust, by keeping outdoor activity shorter and easier. A cough or shortness of breath means ease off (ozone) or go inside (PM2.5)."],
    usg: ["Most people are less likely to be affected. On ozone days, EPA suggests everyone consider going shorter and easier.", "Keep outdoor activity shorter and lighter, take more breaks, and watch for coughing or shortness of breath. On ozone days, plan outdoor time for the morning."],
    unhealthy: ["Cut back on long or hard outdoor activity, take more breaks, and head indoors if symptoms start. On ozone days, move it to the morning.", "Skip long or intense outdoor activity. Think about moving it indoors or to another day."],
    "very-unhealthy": ["Limit outdoor activity and head indoors if symptoms start. With ozone, avoid long or hard exertion and favor the morning.", "Skip all outdoor physical activity. Move it inside or wait for better air."],
    hazardous: ["Skip all outdoor physical activity.", "Stay indoors, keep activity light, and keep indoor particle levels low, as in a clean-air room."]
  };
  var WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] === null || attrs[k] === undefined) continue;
        if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === "") return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function link(href, text) {
    return el("a", { href: href, rel: "noreferrer", text: text });
  }

  // The shimmer marker: a hexagon whose rings ripple out once or twice, the
  // way giant honey bees shimmer to warn off hornets. Markers start a beat
  // apart, so the ripple runs across the cards like a wave, and every
  // animation is over within 5 seconds.
  var wave = 0;
  function shimmer() {
    var svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "shimmer");
    svg.setAttribute("viewBox", "-12 -12 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("style", "--i: " + Math.min(wave++, MAX_WAVE));
    ["halo", "ring", "ring", "core"].forEach(function (part) {
      var hex = document.createElementNS(SVG, "polygon");
      hex.setAttribute("class", part);
      hex.setAttribute("points", HEX);
      svg.appendChild(hex);
    });
    return svg;
  }

  // ["a"] -> "a"; ["a", "b"] -> "a and b"; ["a", "b", "c"] -> "a, b and c"
  function listOf(words) {
    return words.length < 2 ? words.join("") : words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
  }

  function inEffect(a) {
    var start = ms(a.starts), end = ms(a.ends), now = Date.now();
    return (start === null || start <= now) && (end === null || end > now);
  }

  // Why a county is worth planning around today, if it is: air at
  // Unhealthy for Sensitive Groups or worse (measured now or forecast for
  // today), a Voluntary or Mandatory action day under the state rule, or an
  // air alert in effect for the county. Unknown levels and old readings don't count.
  function watchReasons(county, todayDay, now, old, alerts) {
    var reasons = [];
    var nowCat = now ? (now.cat in RANK ? now.cat : levelOf(now.aqi)) : null;
    var nowBad = now && !old && now.aqi !== null && now.aqi !== undefined && WATCH_LEVEL[nowCat];
    var nowWords = now ? now.category || LEVEL[nowCat] : "";
    var dayBad = todayDay && WATCH_LEVEL[todayDay.health];
    if (nowBad && dayBad && nowCat === todayDay.health) {
      reasons.push(nowWords + " now and forecast today");
    } else {
      if (nowBad) reasons.push(nowWords + " now");
      if (dayBad) reasons.push(todayDay.health_label + " forecast today");
    }
    if (county.rule && todayDay && todayDay.action_known &&
        (todayDay.action === "voluntary" || todayDay.action === "mandatory")) {
      reasons.push(ACTION[todayDay.action] + " action");
    }
    alerts.forEach(function (a) {
      if (county.same && a.same && a.same.indexOf(county.same) !== -1 && inEffect(a) &&
          reasons.indexOf(a.event) === -1) {
        reasons.push(a.event || "Weather alert");
      }
    });
    return reasons;
  }

  function say(text) {
    if (status) status.textContent = text;
  }

  function fail() {
    body.textContent = "";
    body.appendChild(el("p", { "class": "stale" }, [
      "Live readings didn’t load. Check ", link(DAQ + "slc", "Utah DAQ’s forecast"), ", ",
      link("https://www.airnow.gov/", "AirNow"), " or the ", link("https://fire.airnow.gov/", "Fire and Smoke Map"), "."
    ]));
    say("Live air readings didn’t load.");
  }

  // Old browsers without fetch or time zone support get the plain links.
  var clock, dayAndClock, isoDay;
  try {
    if (typeof fetch !== "function") throw new Error("no fetch");
    clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" });
    dayAndClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", weekday: "short", hour: "numeric", minute: "2-digit" });
    isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" });
  } catch (e) {
    fail();
    return;
  }

  function ms(iso) {
    // new Date(null) is 1970, not invalid; a missing time is unknown.
    if (iso === null || iso === undefined || iso === "") return null;
    var t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
  }

  // "11:00 AM" -> "11 a.m."; a missing or bad time -> ""
  function tidy(s) {
    return s.replace(":00", "").replace(" AM", " a.m.").replace(" PM", " p.m.");
  }
  function timeOf(iso) { var t = ms(iso); return t === null ? "" : tidy(clock.format(new Date(t))); }
  function dayTimeOf(iso) { var t = ms(iso); return t === null ? "" : tidy(dayAndClock.format(new Date(t))); }

  function todayInUtah() { return isoDay.format(new Date()); }
  // Just the time for today, the weekday too for an earlier day.
  function whenOf(iso) { var t = ms(iso); return t === null ? "" : isoDay.format(new Date(t)) === todayInUtah() ? timeOf(iso) : dayTimeOf(iso); }
  // Ends a sentence once, even after "a.m."
  function stop(s) { return /\.$/.test(s) ? s : s + "."; }

  function dayLabel(date, today) {
    if (date === today) return "Today";
    var p = date.split("-");
    return WEEKDAY[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()] || date;
  }

  // Burn rules mostly matter November through February.
  function isWinter(date) {
    var m = +date.slice(5, 7);
    return m === 11 || m === 12 || m === 1 || m === 2;
  }

  function burnLine(county, day) {
    var more = link(DAQ + county.page, "Utah DAQ");
    if (!county.rule) {
      return ["Wasatch County is outside the state burn rule. Check county or city rules."];
    }
    if (!day || !day.action) {
      return ["Burn status is unavailable right now. Check ", more, "."];
    }
    if (!day.action_known) {
      return ["DAQ lists the action level as “" + day.action + ".” Check ", more, " for what it means."];
    }
    if (day.action === "unrestricted") {
      return ["No state burn restrictions today."];
    }
    // DAQ's feed doesn't say whether a day is about particles or ozone.
    // In winter it is particles; otherwise give both of DAQ's versions.
    if (day.action === "voluntary") {
      if (isWinter(day.date) && county.id === "salt-lake") {
        return ["Voluntary action. From November 1 to March 1, Salt Lake County bans wood and coal fires, fire pits and other outdoor fires on voluntary days. See ", more, "."];
      }
      if (isWinter(day.date)) {
        return ["Voluntary action: please don’t use wood or coal stoves or fireplaces today, and combine trips. See ", more, "."];
      }
      return ["Voluntary action: please combine trips. On a particle day, DAQ also asks you not to burn wood or coal. See ", more, "."];
    }
    if (isWinter(day.date)) {
      return ["Mandatory action: no wood, pellet or coal stoves or fireplaces, and no fire pits or campfires. See ", more, "."];
    }
    return ["Mandatory action. On a particle day that means no wood or coal burning and no open fires; on an ozone day, employer trip reduction. See ", more, "."];
  }

  // Why a card isn't showing a fresh DAQ forecast, in words a reader can see.
  function sourceNote(county, daqOk) {
    if (county.days_source === "airnow") {
      return (daqOk ? "Not in DAQ’s forecast feed today" : "Utah DAQ unreachable") + ", so the days below are AirNow’s forecast, without a burn level.";
    }
    if (county.days_source === "daq" && county.days_note === "daq-down") {
      return "Utah DAQ unreachable at the last update. These days are DAQ’s earlier forecast.";
    }
    if (!county.days_source && county.days_note === "not-in-daq") {
      return "Not in DAQ’s forecast feed today.";
    }
    return null;
  }

  // What a card and the Front summary both need to know about a county.
  function factsFor(county, today) {
    var now = county.now;
    var days = (county.days || []).filter(function (d) { return d.date >= today; }).slice(0, 3);
    var todayDay = days.length && days[0].date === today ? days[0] : null;
    var seen = now ? ms(now.observed_at) : null;
    var old = seen !== null && Date.now() - seen > OLD_READING_MS;
    var hasNow = !!(now && typeof now.aqi === "number");
    var cat = hasNow ? (now.cat in RANK ? now.cat : levelOf(now.aqi)) : null;
    return { today: today, now: now, days: days, todayDay: todayDay, old: old, fresh: hasNow && !old, cat: cat };
  }

  // AQI by pollutant, highest first, when AirNow reports more than one.
  function paramList(now) {
    var params = (now.params || []).filter(function (p) { return typeof p.aqi === "number"; });
    if (params.length < 2) return null;
    params.sort(function (a, b) { return b.aqi - a.aqi; });
    return el("ul", { "class": "params", "aria-label": "AQI by pollutant" }, params.map(function (p) {
      return el("li", null, [
        el("span", { "class": "dot", "data-cat": p.cat in RANK ? p.cat : null, "aria-hidden": "true" }),
        (PARAM[p.pollutant] || p.pollutant) + " " + p.aqi,
        p.category ? el("span", { "class": "sr-only", text: " (" + p.category + ")" }) : null
      ]);
    }));
  }

  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(SVG, tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  // The past 24 hours of AQI as small columns, one slot per hour, in the
  // AQI colors. A hairline marks 100, where Unhealthy for Sensitive Groups
  // starts. Hover a column for its hour and value; the caption names the high.
  function historyStrip(county) {
    var byHour = {}, last = null;
    (county.history || []).forEach(function (h) {
      var t = ms(h.t);
      if (t === null || typeof h.aqi !== "number") return;
      var hour = Math.floor(t / HOUR_MS) * HOUR_MS;
      byHour[hour] = h;
      if (last === null || hour > last) last = hour;
    });
    var hours = Object.keys(byHour).filter(function (k) { return last - k < 24 * HOUR_MS; });
    if (hours.length < 2) return null;

    var W = 240, H = 40, BASE = 38, SLOT = W / 24, BAR = SLOT - 2;
    var peak = null;
    hours.forEach(function (k) { if (!peak || byHour[k].aqi > peak.aqi) peak = byHour[k]; });
    var low = Math.min.apply(null, hours.map(function (k) { return byHour[k].aqi; }));
    var top = Math.max(150, peak.aqi);
    function y(aqi) { return BASE - (Math.min(aqi, top) / top) * (BASE - 2); }

    var marks = [];
    for (var i = 0; i < 24; i++) {
      var hour = last - (23 - i) * HOUR_MS, h = byHour[hour], x = i * SLOT + 1;
      var label = whenOf(new Date(hour).toISOString()) + ": " + (h ? "AQI " + h.aqi + ", " + LEVEL[h.cat in RANK ? h.cat : levelOf(h.aqi)] : "no reading");
      if (h) {
        var topY = Math.min(y(h.aqi), BASE - 1.5), r = Math.min(2, BAR / 2, BASE - topY);
        marks.push(svgEl("path", { "class": "bar", "data-cat": h.cat in RANK ? h.cat : levelOf(h.aqi),
          d: "M" + x + " " + BASE + "V" + (topY + r) + "Q" + x + " " + topY + " " + (x + r) + " " + topY +
             "H" + (x + BAR - r) + "Q" + (x + BAR) + " " + topY + " " + (x + BAR) + " " + (topY + r) + "V" + BASE + "Z" }));
      }
      var hit = svgEl("rect", { "class": "hit", x: i * SLOT, y: 0, width: SLOT, height: H });
      hit.appendChild(svgEl("title", {}, [document.createTextNode(label)]));
      marks.push(hit);
    }
    var y100 = y(100);
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", focusable: "false",
      "aria-label": stop("AQI over the past 24 hours: " + low + " to " + peak.aqi + ", highest " + whenOf(peak.t)) + " Readings for " + hours.length + " of 24 hours." },
      [svgEl("line", { "class": "ref", x1: 0, x2: W, y1: y100, y2: y100 }),
       svgEl("line", { "class": "base", x1: 0, x2: W, y1: BASE + .5, y2: BASE + .5 })].concat(marks));
    return el("div", { "class": "hist" }, [svg,
      el("p", { "class": "hist-cap", "aria-hidden": "true", text: "Past 24 hours · high " + peak.aqi + ", " + whenOf(peak.t) + " · line at 100" })]);
  }

  // One box above the cards that answers "how is the air?" for the four
  // Front counties: the highest current reading, today's forecast and burn
  // levels, which counties are on watch, and what to do at today's worst level.
  function frontSummary(rows) {
    var core = rows.filter(function (r) { return r.county.core; });
    if (!core.length) return null;

    var top = null;
    core.forEach(function (r) {
      if (r.f.fresh && (!top || r.f.now.aqi > top.now.aqi)) top = { now: r.f.now, cat: r.f.cat, county: r.county };
    });

    // Forecast: counties grouped by level, worst first.
    var groups = {}, odd = [], missing = [];
    core.forEach(function (r) {
      var d = r.f.todayDay;
      if (d && d.health in RANK) (groups[d.health] = groups[d.health] || []).push(r.county.name);
      else if (d && d.health_label) odd.push("“" + d.health_label + "” in " + r.county.name + " (as DAQ lists it)");
      else missing.push(r.county.name);
    });
    var levels = Object.keys(groups).sort(function (a, b) { return RANK[b] - RANK[a]; });
    var parts = levels.map(function (l) { return LEVEL[l] + " in " + listOf(groups[l]); }).concat(odd);
    var forecast;
    if (levels.length === 1 && !odd.length && !missing.length) forecast = LEVEL[levels[0]] + " in all " + (core.length === 4 ? "four" : core.length) + " counties.";
    else if (!parts.length) forecast = "not available yet. Check Utah DAQ.";
    else forecast = parts.join("; ") + (missing.length ? "; not available for " + listOf(missing) : "") + ".";

    // Burning: Voluntary and Mandatory counties, or a clear "none".
    var acts = { mandatory: [], voluntary: [] }, unfamiliar = [], unknown = [], ruled = 0;
    core.forEach(function (r) {
      var d = r.f.todayDay;
      if (!r.county.rule) return;
      ruled++;
      if (d && d.action_known && acts[d.action]) acts[d.action].push(r.county.name);
      else if (d && d.action && !d.action_known) unfamiliar.push(r.county.name);
      else if (!(d && d.action_known && d.action === "unrestricted")) unknown.push(r.county.name);
    });
    var burn = [];
    if (acts.mandatory.length) burn.push("Mandatory action in " + listOf(acts.mandatory) + ".");
    if (acts.voluntary.length) burn.push("Voluntary action in " + listOf(acts.voluntary) + ".");
    if (unfamiliar.length) burn.push("DAQ lists an unfamiliar level for " + listOf(unfamiliar) + ".");
    if (unknown.length === ruled) burn.push("Burn levels aren’t available right now. Check Utah DAQ.");
    else if (unknown.length) burn.push("Not available for " + listOf(unknown) + ".");
    if (acts.mandatory.length || acts.voluntary.length || unfamiliar.length) burn.push("See each county for what it means.");
    else if (!unknown.length) burn.push("No state burn restrictions today.");

    var watching = rows.filter(function (r) { return r.reasons.length; }).map(function (r) { return r.county.name; });

    // Tips follow the worse of the current high and today's worst forecast.
    var level = levels.length ? levels[0] : null;
    if (top && (!level || RANK[top.cat] > RANK[level])) level = top.cat;

    var cat = top ? top.cat : level;
    return el("section", { "class": "front-now", "data-cat": cat, "aria-labelledby": "front-now-title" }, [
      el("h3", { "class": "front-label", id: "front-now-title", text: "Right now along the Front" }),
      top ? el("p", { "class": "now" }, [
        el("span", { "class": "aqi-num", text: String(top.now.aqi) }),
        el("span", { "class": "aqi-chip", "data-cat": top.cat, text: top.now.category || LEVEL[top.cat] })
      ]) : null,
      el("p", { "class": "now-meta", text: top
        ? stop("Highest current reading in Salt Lake, Davis, Weber and Utah counties: AirNow " + (top.now.area || top.county.name) + ", " +
          (POLLUTANT[top.now.pollutant] || top.now.pollutant || "pollutant not given") + (timeOf(top.now.observed_at) ? ", " + timeOf(top.now.observed_at) : ""))
        : "No current AirNow reading for Salt Lake, Davis, Weber or Utah counties." }),
      el("p", null, [el("strong", { text: "Forecast today: " }), forecast]),
      el("p", null, [el("strong", { text: "Burning: " }), burn.join(" ")]),
      watching.length ? el("p", { "class": "watch" }, [shimmer(), el("span", { text: "Watch today: " + listOf(watching) + "." })]) : null,
      level && TIPS[level] ? el("div", { "class": "tip" }, [
        el("p", null, [el("strong", { text: "For " + LEVEL[level] + " air. " }), "Everyone: " + TIPS[level][0]]),
        el("p", null, ["Sensitive groups: " + TIPS[level][1] + " ", link("breathe.html#level-" + level, "What to do at each level")])
      ]) : null
    ]);
  }

  function countyCard(county, f, daqOk, reasons) {
    var now = f.now, days = f.days, todayDay = f.todayDay, old = f.old;
    var cat = now && now.cat ? now.cat : (todayDay && todayDay.health) || null;

    var nowRow = null, nowMeta, extras = [];
    if (now && now.aqi !== null && now.aqi !== undefined) {
      nowRow = el("p", { "class": "now" }, [
        el("span", { "class": "aqi-num", text: String(now.aqi) }),
        el("span", { "class": "aqi-chip", "data-cat": now.cat, text: now.category || "AQI" })
      ]);
      var when = old ? dayTimeOf(now.observed_at) + ", an older reading" : timeOf(now.observed_at);
      nowMeta = el("p", { "class": "now-meta", text:
        "AQI now (" + (POLLUTANT[now.pollutant] || now.pollutant || "pollutant not given") + ") · AirNow " + (now.area || "") + (when ? " · " + when : "") });
      if (!old) extras = [paramList(now), historyStrip(county)];
    } else {
      nowMeta = el("p", { "class": "now-meta", text: county.area ? "No current AirNow reading." : "No AirNow monitor reading for this county." });
    }

    var list = el("dl", { "class": "days" });
    if (!days.length) {
      list.appendChild(el("div", null, [el("dt", { text: "Forecast" }), el("dd", null, ["Not available. Check ", link(DAQ + county.page, "Utah DAQ"), "."])]));
    }
    days.forEach(function (d) {
      var words = (d.health_label || "Not given") + (d.action ? " · " + (ACTION[d.action] || d.action) : "");
      list.appendChild(el("div", null, [
        el("dt", { text: dayLabel(d.date, f.today) }),
        el("dd", null, [el("span", { "class": "dot", "data-cat": d.health, "aria-hidden": "true" }), words])
      ]));
    });
    var note = sourceNote(county, daqOk);

    return el("article", { "class": "county" + (old ? " is-old" : "") + (reasons.length ? " is-watch" : ""), "data-cat": cat, "aria-labelledby": "county-" + county.id }, [
      el("h3", { id: "county-" + county.id, text: county.name + " County" }),
      reasons.length ? el("p", { "class": "watch" }, [shimmer(), el("span", { text: "Watch: " + reasons.join(" · ") })]) : null,
      nowRow,
      nowMeta
    ].concat(extras, [
      el("p", { "class": "sr-only", text: "Forecast: health level, then action level." }),
      list,
      note ? el("p", { "class": "source-line", text: note }) : null,
      el("p", { "class": "burn" }, [el("strong", { text: "Burning: " })].concat(burnLine(county, todayDay))),
      county.note ? el("p", { "class": "note-line", text: county.note }) : null
    ]));
  }

  function alertItem(a) {
    var start = ms(a.starts), end = ms(a.ends);
    var when = "";
    if (start !== null && start > Date.now()) {
      when = "From " + dayTimeOf(a.starts) + (end !== null ? " until " + dayTimeOf(a.ends) : "") + ". ";
    } else if (end !== null) {
      when = "Until " + dayTimeOf(a.ends) + ". ";
    }
    return el("li", { "class": inEffect(a) ? "is-watch" : null }, [
      inEffect(a) ? shimmer() : null,
      el("strong", { text: (a.event || "Weather alert") + ". " }),
      a.areas ? a.areas.replace(/\.?\s*$/, ". ") : "",
      when.replace(/\.\. $/, ". "),
      link("https://www.weather.gov/slc/", "NWS Salt Lake City")
    ]);
  }

  var lastRender = 0;

  function render(data) {
    var today = todayInUtah();
    var sources = data.sources || {};
    var daqOk = !!(sources.daq_forecast && sources.daq_forecast.ok);
    var dataAt = ms(data.data_at) || ms(data.built_at);
    var frag = document.createDocumentFragment();
    wave = 0;

    if (dataAt === null || Date.now() - dataAt > OLD_DATA_MS) {
      var hours = dataAt === null ? null : Math.round((Date.now() - dataAt) / 3600000);
      frag.appendChild(el("p", { "class": "stale" }, [
        el("strong", { text: hours === null ? "These numbers may be out of date. " : "These numbers are about " + hours + (hours === 1 ? " hour" : " hours") + " old. " }),
        "The updater may have paused. Check ", link(DAQ + "slc", "Utah DAQ"), " and ", link("https://www.airnow.gov/", "AirNow"), " for current readings."
      ]));
    }

    var alerts = (data.alerts || []).filter(function (a) {
      var end = ms(a.ends);
      return end === null || end > Date.now();
    });
    var rows = [];
    (data.counties || []).forEach(function (c) {
      try {
        var f = factsFor(c, today);
        rows.push({ county: c, f: f, reasons: watchReasons(c, f.todayDay, f.now, f.old, alerts) });
      } catch (e) { /* one bad record shouldn't hide the rest */ }
    });
    try {
      var summary = frontSummary(rows);
      if (summary) frag.appendChild(summary);
    } catch (e) { /* the cards still show */ }

    if (alerts.length) {
      var ul = el("ul", { "class": "today-alerts" });
      alerts.forEach(function (a) {
        try { ul.appendChild(alertItem(a)); } catch (e) { /* skip a malformed alert */ }
      });
      frag.appendChild(ul);
    }

    var core = el("div", { "class": "counties core" });
    var near = el("div", { "class": "counties" });
    rows.forEach(function (r) {
      try {
        (r.county.core ? core : near).appendChild(countyCard(r.county, r.f, daqOk, r.reasons));
      } catch (e) { /* one bad record shouldn't hide the rest */ }
    });
    frag.appendChild(core);
    if (near.childNodes.length) {
      var nearby = document.querySelector("details.nearby");
      frag.appendChild(el("details", { "class": "more nearby", open: nearby && nearby.open ? "" : null }, [
        el("summary", { text: "Nearby valleys: Cache, Box Elder, Tooele and Wasatch" }),
        el("div", { "class": "more-body" }, [near])
      ]));
    }

    body.textContent = "";
    body.appendChild(frag);

    var updated = dayTimeOf(data.built_at);
    if (meta) {
      var stale = [];
      if (sources.airnow && !sources.airnow.ok) stale.push("AirNow");
      if (sources.daq_forecast && !sources.daq_forecast.ok) stale.push("Utah DAQ");
      if (sources.nws && !sources.nws.ok) stale.push("NWS");
      meta.textContent = (updated ? "Updated " + updated + " Mountain Time, from Utah DAQ forecasts and EPA AirNow monitors." : "From Utah DAQ forecasts and EPA AirNow monitors.") +
        (stale.length ? " Could not reach " + stale.join(", ") + " at the last update, so those parts are older." : "");
    }
    say(("Air readings loaded" + (updated ? ", updated " + updated : "")).replace(/\.?$/, "."));
    lastRender = Date.now();
  }

  function load() {
    fetch("data/air.json?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (!data || data.version !== 1 || !data.counties) throw new Error("bad data");
        render(data);
      })
      .catch(fail);
  }

  // A tab left open overnight (or restored from the back button) would
  // otherwise keep showing yesterday as "Today".
  function refreshIfOld() {
    if (lastRender && Date.now() - lastRender > REFRESH_MS) load();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refreshIfOld();
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted) refreshIfOld(); });
  setInterval(function () { if (document.visibilityState === "visible") refreshIfOld(); }, REFRESH_MS);

  load();
})();
