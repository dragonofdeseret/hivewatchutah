/* Today panel on the home page. Reads data/air.json, which
   scripts/fetch_data.py builds from Utah DAQ, EPA AirNow and NWS feeds
   every 30 minutes. This file makes no other network request. */
(function () {
  "use strict";

  var body = document.getElementById("today-body");
  var meta = document.getElementById("today-meta");
  var status = document.getElementById("today-status");
  var title = document.getElementById("today-title");
  var deck = document.getElementById("today-deck");
  var dateline = document.getElementById("paper-date");
  var pollenEar = document.getElementById("pollen-ear");
  var pollenRail = document.getElementById("pollen-rail");
  var ruleLine = document.querySelector(".dateline");
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
  var FRONT = ["Salt Lake", "Davis", "Weber", "Utah"];
  // Past this many characters a headline drops to the smaller size.
  var LONG_HEAD = 66;
  // Rule sentences, shared by the county burn lines and the lead's deck.
  var SL_WINTER_RULE = "From November 1 to March 1, Salt Lake County bans wood and coal fires, fire pits and other outdoor fires on voluntary days.";
  var MANDATORY_WINTER = "Mandatory action: no wood, pellet or coal stoves or fireplaces, and no fire pits or campfires.";
  var MANDATORY_OTHER = "Mandatory action. On a particle day that means no wood or coal burning and no open fires; on an ozone day, employer trip reduction.";
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
  var WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // The typical pollen year, January to December: 0 little or none, 1 some,
  // 2 in season, 3 peak. Copied from the calendar on pollen.html (#calendar);
  // change both together.
  var POLLEN = [
    ["elm", "023100000000"],
    ["juniper", "012321000000"],
    ["cottonwood", "012200000000"],
    ["box elder and maple", "011321000000"],
    ["mulberry", "001231000000"],
    ["oak", "001222000000"],
    ["grasses", "000123222100"],
    ["amaranth family", "000012232100"],
    ["sagebrush", "000000013200"]
  ];

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

  // "Utah" alone reads as the whole state, so a list with it says county.
  function places(names) {
    if (names.indexOf("Utah") === -1) return listOf(names);
    return listOf(names) + (names.length === 1 ? " County" : " counties");
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

  function setLead(head, words) {
    if (title) title.textContent = head;
    if (deck) deck.textContent = words || "";
    fitHead();
  }

  // The smaller size for a long headline, or for one that would run past three
  // lines at this width, and one step smaller if it still would.
  function fitHead() {
    if (!title) return;
    var kinds = title.classList;
    kinds.remove("is-long", "is-longest");
    function tooTall() {
      return title.getBoundingClientRect().height > parseFloat(window.getComputedStyle(title).lineHeight) * 3.5;
    }
    kinds.toggle("is-long", title.textContent.length > LONG_HEAD || tooTall());
    kinds.toggle("is-longest", tooTall());
  }

  // The hairline under the dateline takes a color only when the headline rated the air.
  function setRule(level) {
    if (!ruleLine) return;
    if (level) ruleLine.setAttribute("data-cat", level);
    else ruleLine.removeAttribute("data-cat");
  }

  function fail() {
    body.textContent = "";
    body.appendChild(el("p", { "class": "stale" }, [
      "Live readings didn’t load. Check ", link(DAQ + "slc", "Utah DAQ’s forecast"), ", ",
      link("https://www.airnow.gov/", "AirNow"), " or the ", link("https://fire.airnow.gov/", "Fire and Smoke Map"), "."
    ]));
    setLead("No live readings right now", "");
    setRule(null);
    // Without county columns the rail would stand beside an empty page; the
    // stylesheet lays it out as a band under the lead instead.
    document.body.classList.add("is-down");
    document.body.classList.remove("long-day");
    showDate();
    say("Live air readings didn’t load.");
  }

  // Old browsers without fetch or time zone support get the plain links.
  var clock, dayAndClock, isoDay, fullDate;
  try {
    if (typeof fetch !== "function") throw new Error("no fetch");
    clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" });
    dayAndClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", weekday: "short", hour: "numeric", minute: "2-digit" });
    isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" });
    fullDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", weekday: "long", year: "numeric", month: "long", day: "numeric" });
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

  function longDay(date) {
    var p = date.split("-");
    return WEEKDAY_LONG[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()] || date;
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
        return ["Voluntary action. " + SL_WINTER_RULE + " See ", more, "."];
      }
      if (isWinter(day.date)) {
        return ["Voluntary action: please don’t use wood or coal stoves or fireplaces today, and combine trips. See ", more, "."];
      }
      return ["Voluntary action: please combine trips. On a particle day, DAQ also asks you not to burn wood or coal. See ", more, "."];
    }
    if (isWinter(day.date)) {
      return [MANDATORY_WINTER + " See ", more, "."];
    }
    return [MANDATORY_OTHER + " See ", more, "."];
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

  // A reading counts only as a real AQI, with a word that agrees with its number.
  function usableReading(now) {
    if (!now || typeof now.aqi !== "number" || now.aqi < 0) return false;
    return !(now.cat in RANK) || now.cat === levelOf(now.aqi);
  }

  // What a card and the Front summary both need to know about a county.
  function factsFor(county, today) {
    var now = usableReading(county.now) ? county.now : null;
    var days = (Array.isArray(county.days) ? county.days : []).filter(function (d) { return d && d.date >= today; }).slice(0, 3);
    days.forEach(function (d) { if (!d.health_label && d.health in RANK) d.health_label = LEVEL[d.health]; });
    var todayDay = days.length && days[0].date === today ? days[0] : null;
    var seen = now ? ms(now.observed_at) : null;
    // A reading with no time can't be called current.
    var old = !!now && (seen === null || Date.now() - seen > OLD_READING_MS);
    var hasNow = !!now;
    var cat = hasNow ? (now.cat in RANK ? now.cat : levelOf(now.aqi)) : null;
    return { today: today, now: now, days: days, todayDay: todayDay, old: old, fresh: hasNow && !old, cat: cat };
  }

  // AQI by pollutant, highest first, when AirNow reports more than one.
  function paramList(now) {
    var params = (Array.isArray(now.params) ? now.params : []).filter(function (p) { return p && typeof p.aqi === "number"; });
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
    (Array.isArray(county.history) ? county.history : []).forEach(function (h) {
      var t = h ? ms(h.t) : null;
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
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", role: "img", focusable: "false",
      "aria-label": stop("AQI over the past 24 hours: " + low + " to " + peak.aqi + ", highest " + whenOf(peak.t)) + " Readings for " + hours.length + " of 24 hours." },
      [svgEl("line", { "class": "ref", x1: 0, x2: W, y1: y100, y2: y100 }),
       svgEl("line", { "class": "base", x1: 0, x2: W, y1: BASE + .5, y2: BASE + .5 })].concat(marks));
    return el("div", { "class": "hist" }, [svg,
      el("p", { "class": "hist-cap", "aria-hidden": "true", text: "24 hours · high " + peak.aqi + ", " + whenOf(peak.t) + " · line at 100" })]);
  }

  // What DAQ's forecast does next, for a lead whose counties all sit at one
  // level today. Days line up by date. Any listed day at another level gets
  // said; "stays" runs only as far as every county lists the same level.
  function outlook(core, level, names) {
    var dates = [];
    core.forEach(function (r) {
      r.f.days.forEach(function (d) {
        if (d.date > r.f.today && dates.indexOf(d.date) === -1) dates.push(d.date);
      });
    });
    dates.sort();
    var last = null, steady = true;
    for (var i = 0; i < dates.length; i++) {
      var groups = {}, listed = 0, whole = true;
      core.forEach(function (r) {
        var d = r.f.days.filter(function (x) { return x.date === dates[i]; })[0];
        if (d && d.health in RANK) {
          listed++;
          (groups[d.health] = groups[d.health] || []).push(r.county.name);
        } else {
          whole = false;
        }
      });
      var worst = Object.keys(groups).sort(function (a, b) { return RANK[b] - RANK[a]; })[0];
      if (worst && (worst !== level || groups[worst].length !== listed)) {
        return "The forecast shows " + LEVEL[worst] + " in " + names(groups[worst]) + " on " + longDay(dates[i]) + ".";
      }
      if (!whole) steady = false;
      if (steady) last = dates[i];
    }
    return last ? "The forecast stays " + LEVEL[level] + " through " + longDay(last) + "." : "";
  }

  // The lead story's headline and deck. They say only what the data says, in
  // EPA's category words and DAQ's action words, with no causes and nothing
  // past DAQ's forecast. A Voluntary or Mandatory action in a core county
  // leads, then an alert in effect. A county counts at the worse of its fresh
  // reading and today's forecast, and what's missing gets said. rated is false
  // when the page can't vouch for the air, and the tip then stays off. rule is
  // the level the dateline takes, only when the head itself rates the air.
  function frontHeadline(rows, alerts, staleData, daq) {
    var core = rows.filter(function (r) { return r.county.core; });
    var n = FRONT.length;
    function names(list) {
      var whole = list.length === n && FRONT.every(function (f) { return list.indexOf(f) !== -1; });
      return whole ? "all four Front counties" : places(list);
    }
    // For quoting DAQ, where the plain county name reads best.
    function counties(list) {
      return list.length === n ? names(list) : listOf(list) + (list.length === 1 ? " County" : " counties");
    }
    function nameOf(x) { return x.name; }

    var byLevel = {}, gaps = [], odd = [], oddGood = [], older = [], noReading = [], noForecast = [];
    var acts = { mandatory: [], voluntary: [] }, unfamiliar = [], ruled = 0, clear = 0, fresh = 0, placed = 0;
    FRONT.forEach(function (f) {
      if (!core.some(function (r) { return r.county.name === f; })) gaps.push(f);
    });
    core.forEach(function (r) {
      var d = r.f.todayDay, name = r.county.name;
      // In a paused file the last readings stand only as "at the last update".
      var nowCat = r.f.fresh || staleData ? r.f.cat : null;
      var dayCat = d && d.health in RANK ? d.health : null;
      var word = d && !dayCat && d.health_label ? d.health_label : null;
      var level = nowCat && (!dayCat || RANK[nowCat] >= RANK[dayCat]) ? nowCat : dayCat;
      // An old reading above what's left, so that county can't be called lower.
      var oldCat = !staleData && r.f.old && r.f.cat;
      var oldWorse = oldCat && (level ? RANK[oldCat] > RANK[level] : RANK[oldCat] > RANK.good);

      if (r.f.fresh) fresh++;
      if (word) odd.push({ name: name, word: word });
      if (oldWorse) older.push({ name: name, cat: oldCat });
      if (!staleData && !r.f.fresh && (level || word)) noReading.push(name);
      if (level && !dayCat && !word) noForecast.push(name);

      // A word we can't place never counts as Good.
      if (word && (!level || level === "good")) {
        if (r.f.fresh && level === "good") oddGood.push(name);
      } else if (level && !oldWorse) {
        placed++;
        (byLevel[level] = byLevel[level] || []).push({ name: name, now: nowCat === level, day: dayCat === level, nowCat: nowCat, dayCat: dayCat });
      } else if (!level) {
        gaps.push(name);
      }

      if (r.county.rule) {
        ruled++;
        if (d && d.action_known && acts[d.action]) acts[d.action].push(name);
        else if (d && d.action && !d.action_known) unfamiliar.push(name);
        else if (d && d.action_known && d.action === "unrestricted") clear++;
      }
    });
    gaps.sort(function (a, b) { return FRONT.indexOf(a) - FRONT.indexOf(b); });

    var levels = Object.keys(byLevel).sort(function (a, b) { return RANK[b] - RANK[a]; });
    var worst = levels[0];

    // "" when reading and forecast agree; otherwise where the level comes from.
    function source(group) {
      var allNow = group.every(function (x) { return x.now; }), allDay = group.every(function (x) { return x.day; });
      if (staleData) return "";
      if (allNow && allDay) return daq.ok ? "" : " now";
      return allNow ? " now" : allDay ? " forecast today" : " now or forecast today";
    }
    function airList(skip) {
      return levels.filter(function (l) { return l !== skip; }).map(function (l) {
        return LEVEL[l] + source(byLevel[l]) + " in " + names(byLevel[l].map(nameOf));
      }).join("; ");
    }
    // What the other source says for the counties in the head, when it's lower.
    function otherSource(group, key, intro) {
      var said = {};
      group.forEach(function (x) { if (x[key] && x[key] !== worst) (said[x[key]] = said[x[key]] || []).push(x.name); });
      var parts = Object.keys(said).sort(function (a, b) { return RANK[b] - RANK[a]; }).map(function (l) {
        return LEVEL[l] + " in " + names(said[l]);
      });
      return parts.length ? intro + parts.join("; ") + "." : "";
    }

    // Alerts in effect now, grouped by event, with the counties each one names.
    var events = [], where = {}, areas = {};
    alerts.filter(inEffect).forEach(function (a) {
      var event = a.event || "Weather alert", hit = false;
      if (events.indexOf(event) === -1) { events.push(event); where[event] = []; areas[event] = []; }
      rows.forEach(function (r) {
        if (!r.county.same || !a.same || a.same.indexOf(r.county.same) === -1) return;
        hit = true;
        if (where[event].indexOf(r.county.name) === -1) where[event].push(r.county.name);
      });
      // Counties with no column here, like Summit, go by the alert's own words.
      if (!hit && typeof a.areas === "string" && a.areas) areas[event].push(a.areas.replace(/\.?\s*$/, ""));
    });
    function onFront(name) { return FRONT.indexOf(name) !== -1; }
    var coreEvent = events.filter(function (e) { return where[e].some(onFront); })[0];

    var m = acts.mandatory, v = acts.voluntary;
    var acted = m.length || v.length;
    var thin = placed * 2 < n || (placed * 2 === n && worst === "good");
    var goodOnFew = worst === "good" && fresh * 2 < n;
    var nothing = !placed && !odd.length && !older.length;
    var alertLed = !acted && !staleData && coreEvent;
    var airLed = !acted && !staleData && !coreEvent && !thin && !goodOnFew;
    var firstOdd = odd.length ? "DAQ lists “" + odd[0].word + "” for " + counties(odd.filter(function (o) { return o.word === odd[0].word; }).map(nameOf)) : "";
    var head, gapsSaid = false;

    if (m.length && v.length) head = "Mandatory action in " + places(m) + ", Voluntary in " + places(v);
    else if (acted) head = (m.length ? "Mandatory" : "Voluntary") + " action in " + names(m.length ? m : v);
    else if (staleData) head = "No fresh readings along the Front";
    else if (alertLed) head = coreEvent + " in effect for " + names(where[coreEvent].filter(onFront));
    else if (nothing) { head = "No current readings or forecast for the Front"; gapsSaid = true; }
    else if (thin && gaps.length) { head = "No current data for " + places(gaps); gapsSaid = true; }
    else if (thin) head = firstOdd || (fresh ? "Few" : "No") + " current readings along the Front";
    else if (goodOnFew) head = (fresh ? "Few" : "No") + " current readings along the Front";
    else {
      var from = source(byLevel[worst]), scope = " in " + names(byLevel[worst].map(nameOf));
      head = from ? (worst === "usg" ? "Air " + LEVEL[worst] : LEVEL[worst] + " air") + from + scope : "Air is " + LEVEL[worst] + scope;
      if (worst === "good" && gaps.length) { head += "; no current data for " + places(gaps); gapsSaid = true; }
    }

    // DAQ's days held over from an earlier run, or from another feed: no burn answer from them.
    var kept = !daq.ok || core.some(function (r) { return r.county.days_note; });
    var lines = [], air = airList(), later = "";
    if (staleData) {
      lines.push("At the last update: " + (air || "no readings or forecast for the Front") + ".");
      if (nothing) gapsSaid = true;
    } else if (airLed) {
      lines.push(airList(worst) ? airList(worst) + "." : "");
      lines.push(otherSource(byLevel[worst], "nowCat", "Current readings are "));
      lines.push(otherSource(byLevel[worst], "dayCat", daq.ok ? "Today’s forecast is " : "DAQ’s earlier forecast for today is "));
      var oneLevel = levels.length === 1 && placed === n && !odd.length;
      later = oneLevel && byLevel[worst].every(function (x) { return x.day; }) ? outlook(core, worst, names) : "";
      // The burn answer, only when nothing about the day is unclear. With a
      // nearby valley under an action, it says which counties it covers.
      if (oneLevel && !kept && RANK[worst] <= RANK.moderate && !unfamiliar.length && ruled && clear === ruled) {
        var nearAct = rows.some(function (r) {
          var d = r.f.todayDay;
          return !r.county.core && r.county.rule && d && d.action_known && acts[d.action];
        });
        var noBurn = "no state burn restrictions" + (nearAct ? " in the four Front counties" : "") + " today.";
        later = /stays/.test(later) ? later.replace(/\.$/, ", with " + noBurn) : (later + " N" + noBurn.slice(1)).replace(/^ /, "");
      }
    } else if (air) {
      var first = source(byLevel[worst]);
      lines.push((first === "" || first === " now" ? "Air is " : "") + air + ".");
    }

    if (gaps.length && !gapsSaid) lines.push((acted ? "Air levels are not available for " : "No current data for ") + names(gaps) + ".");
    if (noReading.length && head.indexOf("No current readings") !== 0) {
      lines.push(fresh ? "No current reading for " + names(noReading) + "." : "No current readings along the Front.");
    }
    if (noForecast.length) {
      lines.push(noForecast.length === core.length ? "Today’s forecast is not available. Check Utah DAQ." : "Today’s forecast is not available for " + places(noForecast) + ".");
    }
    var words = [];
    odd.forEach(function (o) { if (words.indexOf(o.word) === -1) words.push(o.word); });
    words.forEach(function (w) {
      var said = "DAQ lists “" + w + "” for " + counties(odd.filter(function (o) { return o.word === w; }).map(nameOf));
      if (said !== head) lines.push(said + ".");
    });
    if (oddGood.length) lines.push("Current readings are Good in " + names(oddGood) + ".");
    if (older.length) {
      var oldTop = older.reduce(function (top, o) { return RANK[o.cat] > RANK[top] ? o.cat : top; }, older[0].cat);
      lines.push("Older readings reach " + LEVEL[oldTop] + " in " + names(older.filter(function (o) { return o.cat === oldTop; }).map(nameOf)) + ".");
    }
    if (unfamiliar.length) lines.push("DAQ lists an unfamiliar action level for " + counties(unfamiliar) + ".");
    lines.push(later);
    if (!staleData && !daq.ok) lines.push(stop("Utah DAQ’s forecast has not updated" + (whenOf(daq.at) ? " since " + whenOf(daq.at) : "")));
    if (v.indexOf("Salt Lake") !== -1 && isWinter(core[0].f.today)) lines.push(SL_WINTER_RULE);
    if (m.length) lines.push(isWinter(core[0].f.today) ? MANDATORY_WINTER : MANDATORY_OTHER);
    events.forEach(function (e) {
      if (e === alertLed) {
        var beyond = where[e].filter(function (w) { return !onFront(w); });
        if (beyond.length) lines.push(e + " also covers " + listOf(beyond) + ".");
      } else {
        var whereSaid = where[e].length ? names(where[e]) : areas[e].join("; ");
        lines.push(e + " in effect" + (whereSaid ? " for " + whereSaid : "") + ".");
      }
    });
    if (nothing) lines.push("Check Utah DAQ and AirNow.");

    // "The air carries little or no risk" needs all four counties at Good, with
    // nothing quoted, unclear or under an action. An older reading or an air
    // alert rules out a low level but not a high one.
    var low = RANK[worst] <= RANK.moderate;
    var rated = !staleData && !thin && !goodOnFew && !(low && (older.length || coreEvent)) &&
      !(worst === "good" && (placed < n || odd.length || acted || unfamiliar.length));

    return {
      head: head,
      deck: lines.filter(Boolean).join(" "),
      rated: rated,
      rule: rated && airLed ? worst : null,
      heldOver: staleData || kept
    };
  }

  // Under the headline, the lead answers "how is the air?" for the four Front
  // counties: the highest current reading, today's forecast and burn levels,
  // which counties are on watch, and what to do at today's worst level.
  function frontSummary(rows, rated, heldOver) {
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
      else if (d && d.health_label) odd.push("“" + d.health_label + "” in " + places([r.county.name]) + " (as DAQ lists it)");
      else missing.push(r.county.name);
    });
    var levels = Object.keys(groups).sort(function (a, b) { return RANK[b] - RANK[a]; });
    var parts = levels.map(function (l) { return LEVEL[l] + " in " + places(groups[l]); }).concat(odd);
    var forecast;
    if (levels.length === 1 && !odd.length && !missing.length && core.length === 4) forecast = LEVEL[levels[0]] + " in all four counties.";
    else if (!parts.length) forecast = "not available yet. Check Utah DAQ.";
    else forecast = parts.join("; ") + (missing.length ? "; not available for " + places(missing) : "") + ".";

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
    if (acts.mandatory.length) burn.push("Mandatory action in " + places(acts.mandatory) + ".");
    if (acts.voluntary.length) burn.push("Voluntary action in " + places(acts.voluntary) + ".");
    if (unfamiliar.length) burn.push("DAQ lists an unfamiliar level for " + places(unfamiliar) + ".");
    if (unknown.length === ruled) burn.push("Burn levels aren’t available right now. Check Utah DAQ.");
    else if (unknown.length) burn.push("Not available for " + places(unknown) + ".");
    if (acts.mandatory.length || acts.voluntary.length || unfamiliar.length) burn.push("See each county for what it means.");
    else if (!unknown.length) {
      var nearby = rows.some(function (r) {
        var d = r.f.todayDay;
        return !r.county.core && r.county.rule && d && d.action_known && acts[d.action];
      });
      burn.push(heldOver ? "At the last update: no state burn restrictions. Check Utah DAQ before you light anything."
        : "No state burn restrictions" + (nearby ? " in the four Front counties" : "") + " today.");
    }

    var watching = rows.filter(function (r) { return r.reasons.length; }).map(function (r) { return r.county.name; });

    // Tips follow the worse of the current high and today's worst forecast.
    var level = levels.length ? levels[0] : null;
    if (top && (!level || RANK[top.cat] > RANK[level])) level = top.cat;
    // At Unhealthy for Sensitive Groups or worse the advice stays, even on a day
    // the page can't rate as a whole.
    var hasTip = level && TIPS[level] && (rated || RANK[level] >= RANK.usg);

    var cat = top ? top.cat : level;
    return el("div", { "class": "front-now" + (hasTip ? "" : " no-tip"), "data-cat": cat }, [
      el("h3", { "class": "sr-only", text: "Right now along the Front" }),
      el("div", { "class": "lead-figure" }, [
        top ? el("p", { "class": "now" }, [
          el("span", { "class": "aqi-num", text: String(top.now.aqi) }),
          el("span", { "class": "aqi-chip", "data-cat": top.cat, text: top.now.category || LEVEL[top.cat] })
        ]) : null,
        el("p", { "class": "now-meta", text: top
          ? stop("Highest current AQI on the Front: AirNow " + (top.now.area || top.county.name) + ", " +
            (POLLUTANT[top.now.pollutant] || top.now.pollutant || "pollutant not given") + (timeOf(top.now.observed_at) ? ", " + timeOf(top.now.observed_at) : ""))
          : core.some(function (r) { return r.f.now; })
            ? "No fresh AirNow reading right now. The columns show the last ones on file."
            : "No current AirNow reading for Salt Lake, Davis, Weber or Utah counties." }),
        watching.length ? el("p", { "class": "watch" }, [shimmer(), el("span", { text: "Watch today: " + places(watching) + "." })]) : null
      ]),
      el("div", { "class": "lead-facts" }, [
        el("p", null, [el("strong", { text: "Burning: " }), burn.join(" ")]),
        el("p", null, [el("strong", { text: "Forecast today: " }), forecast]),
        hasTip ? null : el("p", null, [link("breathe.html#levels", "What to do at each level")])
      ]),
      hasTip ? el("div", { "class": "tip" }, [
        el("p", null, [el("strong", { text: "For " + LEVEL[level] + " air. " }), "Everyone: " + TIPS[level][0]]),
        el("p", null, ["Sensitive groups: " + TIPS[level][1] + " ", link("breathe.html#level-" + level, "What to do at each level")])
      ]) : null
    ]);
  }

  // A county's column. The top answers the day: the AQI, a Watch line, today's
  // forecast and the burn line. The fine print sits in a <details>: open for
  // the four core counties on wide screens, one tap away on phones and for
  // the nearby valleys.
  function countyCard(county, f, daqOk, reasons) {
    var now = f.now, days = f.days, todayDay = f.todayDay, old = f.old;
    var cat = now && now.cat ? now.cat : (todayDay && todayDay.health) || null;

    var nowRow = null, nowWords = null, extras = [];
    if (now) {
      nowRow = el("p", { "class": "now" }, [
        el("span", { "class": "aqi-num", text: String(now.aqi) }),
        el("span", { "class": "aqi-chip", "data-cat": now.cat, text: now.category || "AQI" })
      ]);
      var when = !old ? timeOf(now.observed_at) : dayTimeOf(now.observed_at) ? dayTimeOf(now.observed_at) + ", an older reading" : "time not given";
      nowWords = "AQI now (" + (POLLUTANT[now.pollutant] || now.pollutant || "pollutant not given") + ")\u00a0· AirNow " + (now.area || "") + (when ? "\u00a0· " + when : "");
      if (!old) extras = [paramList(now), historyStrip(county)];
    }

    // Today up top. Later days are fine print, and days alike share a row.
    function dayRows(list) {
      var rows = [];
      list.forEach(function (d) {
        var words = (d.health_label || "Not given") + (d.action ? "\u00a0· " + (ACTION[d.action] || d.action) : "");
        var last = rows[rows.length - 1];
        if (last && last.words === words && last.cat === d.health) last.label += ", " + dayLabel(d.date, f.today);
        else rows.push({ label: dayLabel(d.date, f.today), words: words, cat: d.health });
      });
      return rows.map(function (r) {
        return el("div", null, [
          el("dt", { text: r.label }),
          el("dd", null, [el("span", { "class": "dot", "data-cat": r.cat, "aria-hidden": "true" }), r.words])
        ]);
      });
    }
    var list = el("dl", { "class": "days" }, days.length ? dayRows(days.slice(0, 1)) : [
      el("div", null, [el("dt", { text: "Forecast" }), el("dd", null, ["Not available. Check ", link(DAQ + county.page, "Utah DAQ"), "."])])
    ]);
    var nextDays = days.length > 1 ? el("dl", { "class": "days" }, dayRows(days.slice(1))) : null;
    var note = sourceNote(county, daqOk);

    // A burn sentence folds only on a nearby valley's plain no-restrictions day.
    var burn = el("p", { "class": "burn" }, [el("strong", { text: "Burning: " })].concat(burnLine(county, todayDay)));
    var burnFirst = county.core || !county.rule || !todayDay || !todayDay.action_known || todayDay.action !== "unrestricted";

    var fine = [burnFirst ? null : burn].concat(extras, [
      nextDays,
      county.note ? el("p", { "class": "note-line", text: county.note }) : null
    ]).filter(Boolean);
    // A nearby valley's fresh source line folds on wide screens, if there's
    // anything else to open for; CSS shows one of the two.
    var folds = !!nowWords && !county.core && !old && fine.length > 0;
    var nowMeta = el("p", { "class": "now-meta" + (folds ? " has-fold" : ""), text: nowWords || (county.area ? "No current AirNow reading." : "No AirNow monitor reading for this county.") });
    if (folds) fine.unshift(el("p", { "class": "now-meta fold-meta", text: nowWords }));
    var fineWords = burnFirst ? [] : ["burning"];
    if (extras[1]) fineWords.push("past 24 hours");
    if (extras[0] && burnFirst) fineWords.push("pollutants");
    if (nextDays) fineWords.push("next days");
    if (!fineWords.length) fineWords.push("notes");

    return el("article", { "class": "county" + (old ? " is-old" : "") + (reasons.length ? " is-watch" : ""), "data-cat": cat, "aria-labelledby": "county-" + county.id }, [
      el("div", { "class": "county-head" + (nowRow ? "" : " no-now") }, [
        el("h3", { id: "county-" + county.id }, [county.name, el("span", { "class": "county-word", text: " County" })]),
        nowRow,
        nowMeta
      ]),
      reasons.length ? el("p", { "class": "watch" }, [shimmer(), el("span", { text: "Watch: " + reasons.join("\u00a0· ") })]) : null,
      el("div", { "class": "today-box" }, [
        el("p", { "class": "sr-only", text: "Forecast: health level, then action level." }),
        note ? el("p", { "class": "source-line", text: note }) : null,
        list
      ]),
      burnFirst ? burn : null,
      fine.length ? el("details", { "class": "county-more", "data-county": county.id, open: startsOpen(county) ? "" : null },
        [el("summary", null, ["More on " + places([county.name]), el("span", { "class": "more-what", text: ": " + fineWords.join(", ") })])].concat(fine)) : null
    ]);
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

  // The core counties' fine print shows on wide screens and folds on phones.
  // What the reader opened or closed stays that way through refreshes, resizes
  // and printing.
  var wideQuery = window.matchMedia ? window.matchMedia("(min-width: 700px)") : null;
  function wideScreen() { return !wideQuery || wideQuery.matches; }
  var chosen = {}, printing = false;
  function startsOpen(county) { return (county.core && wideScreen()) || chosen[county.id] === true; }
  // toggle doesn't bubble. On wide screens a core county has no summary to click,
  // so a change there is never the reader's.
  body.addEventListener("toggle", function (e) {
    var d = e.target;
    if (!d.hasAttribute || !d.hasAttribute("data-county") || printing) return;
    if (d.hasAttribute("data-print-open") || (wideScreen() && d.closest(".counties.core"))) return;
    chosen[d.getAttribute("data-county")] = d.open;
  }, true);
  function eachDetails(fn) {
    Array.prototype.forEach.call(body.querySelectorAll("details.county-more"), fn);
  }
  function syncDetails() {
    if (printing) return;
    Array.prototype.forEach.call(body.querySelectorAll(".counties.core details.county-more"), function (d) {
      d.open = wideScreen() || chosen[d.getAttribute("data-county")] === true;
    });
  }
  // Printing opens everything, then puts it back.
  function printOpen() {
    printing = true;
    eachDetails(function (d) {
      if (!d.open) { d.open = true; d.setAttribute("data-print-open", ""); }
    });
  }
  function printClose() {
    printing = false;
    eachDetails(function (d) {
      if (d.hasAttribute("data-print-open")) { d.open = false; d.removeAttribute("data-print-open"); }
    });
    syncDetails();
    if (body.querySelector(".counties")) fitHowto();
  }
  function onMedia(query, fn) {
    if (!query) return;
    if (query.addEventListener) query.addEventListener("change", fn);
    else if (query.addListener) query.addListener(fn);
  }
  onMedia(wideQuery, syncDetails);
  var printQuery = window.matchMedia ? window.matchMedia("print") : null;
  onMedia(printQuery, function (e) { if (e.matches) printOpen(); else printClose(); });
  window.addEventListener("beforeprint", printOpen);
  window.addEventListener("afterprint", printClose);

  // How to read goes under the columns, or under the rail on the widest layout
  // whenever it fits there with the page no more than a few lines longer.
  // Both arrangements are measured before anything paints.
  var railQuery = window.matchMedia ? window.matchMedia("(min-width: 1240px)") : null;
  var howto = document.querySelector(".howto"), rail = document.querySelector(".rail"), todaySection = document.getElementById("today");
  function bottomOf(node) { return node.getBoundingClientRect().bottom; }
  function fitHowto() {
    if (printing) return;
    var page = document.body.classList;
    page.remove("long-day");
    if (!howto || !rail || !todaySection || !railQuery || !railQuery.matches || page.contains("is-down")) return;
    var under = Math.max(bottomOf(howto), bottomOf(rail));
    page.add("long-day");
    page.toggle("long-day", Math.max(bottomOf(howto), bottomOf(todaySection)) <= under + 64);
  }

  // Only restates the calendar on pollen.html, and says so.
  var pollenMonth = null;
  function showPollen() {
    var month = +todayInUtah().slice(5, 7) - 1;
    if (month === pollenMonth) return;
    pollenMonth = month;
    var words = { 3: [], 2: [], 1: [] };
    POLLEN.forEach(function (p) {
      var lvl = +p[1].charAt(month);
      if (words[lvl]) words[lvl].push(p[0]);
    });
    var says = [];
    if (words[3].length) says.push("Peak: " + words[3].join(", ") + ".");
    if (words[2].length) says.push("In season: " + words[2].join(", ") + ".");
    if (words[1].length) says.push("Some: " + words[1].join(", ") + ".");
    if (!says.length) says.push("Little or none.");
    // The masthead's ear on wide screens, the foot of the rail on phones; CSS shows one.
    [[pollenEar, "pollen-title"], [pollenRail, "pollen-rail-title"]].forEach(function (host) {
      if (!host[0]) return;
      host[0].textContent = "";
      host[0].appendChild(el("h2", { id: host[1], text: "Pollen this month" }));
      host[0].appendChild(el("p", null, [says.join(" ") + " Typical " + MONTH[month] + " on the ", el("a", { href: "pollen.html", text: "pollen calendar" }), ", not today’s count."]));
    });
  }

  function showDate() {
    if (!fullDate) return;
    if (dateline) dateline.textContent = fullDate.format(new Date());
    showPollen();
  }

  // A refresh rebuilds the columns. Keyboard focus goes back to the same link
  // or summary, found by its words and how many came before with the same words.
  function focusMark() {
    var active = document.activeElement, mark = null;
    if (!active || active === body || !body.contains(active)) return null;
    Array.prototype.some.call(body.querySelectorAll("a, summary"), function (node, i, all) {
      if (node !== active) return false;
      var same = Array.prototype.slice.call(all, 0, i).filter(function (x) { return x.textContent === node.textContent; });
      mark = { words: node.textContent, nth: same.length };
      return true;
    });
    return mark;
  }
  function focusBack(mark) {
    if (!mark) return;
    var same = Array.prototype.filter.call(body.querySelectorAll("a, summary"), function (x) { return x.textContent === mark.words; });
    if (same[mark.nth]) same[mark.nth].focus({ preventScroll: true });
  }

  function render(data) {
    var today = todayInUtah();
    var sources = data.sources || {};
    var daqSource = sources.daq_forecast, airnowSource = sources.airnow;
    var daqOk = !!(daqSource && daqSource.ok);
    var dataAt = ms(data.data_at) || ms(data.built_at);
    var frag = document.createDocumentFragment();
    function recent(t) { return t !== null && Date.now() - t <= OLD_DATA_MS; }
    // data_at is the older of the two feeds. When a file built just now has
    // fresh AirNow readings, only DAQ's forecast is late; the readings stand.
    var daqLate = !recent(dataAt) && recent(ms(data.built_at)) &&
      !!(airnowSource && airnowSource.ok) && recent(ms(airnowSource.fetched_at)) &&
      !(daqOk && recent(ms(daqSource.fetched_at)));
    var staleData = !recent(dataAt) && !daqLate;
    var hours = dataAt === null ? null : Math.round((Date.now() - dataAt) / 3600000);
    wave = 0;

    if (staleData) {
      frag.appendChild(el("p", { "class": "stale" }, [
        el("strong", { text: hours === null ? "These numbers may be out of date. " : "These numbers are about " + hours + (hours === 1 ? " hour" : " hours") + " old. " }),
        "The updater may have paused. Check ", link(DAQ + "slc", "Utah DAQ"), " and ", link("https://www.airnow.gov/", "AirNow"), " for current readings."
      ]));
    }

    var alerts = (Array.isArray(data.alerts) ? data.alerts : []).filter(function (a) {
      if (!a || typeof a !== "object") return false;
      if (!Array.isArray(a.same)) a.same = [];
      var end = ms(a.ends);
      return end === null || end > Date.now();
    });
    var rows = [];
    data.counties.forEach(function (c) {
      try {
        if (!c.name) return;
        var f = factsFor(c, today);
        // A paused file has no fresh readings, whatever a reading's own time says.
        if (staleData) f.fresh = false;
        rows.push({ county: c, f: f, reasons: watchReasons(c, f.todayDay, f.now, f.old, alerts) });
      } catch (e) { /* one bad record shouldn't hide the rest */ }
    });
    // Three separate tries, so a throw in one doesn't lose the others.
    var lead = null;
    var daqFacts = { ok: daqOk || !daqSource, at: daqSource ? daqSource.fetched_at : null };
    try { lead = frontHeadline(rows, alerts, staleData, daqFacts); } catch (e) { /* the columns still show */ }
    var rated = !!(lead && lead.rated);
    setLead(lead ? lead.head : "Today along the Front", lead ? lead.deck : "");
    setRule(lead ? lead.rule : null);
    try {
      var summary = frontSummary(rows, rated, !!(lead && lead.heldOver));
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
    var near = el("div", { "class": "counties near" });
    rows.forEach(function (r) {
      var column = r.county.core ? core : near;
      try {
        column.appendChild(countyCard(r.county, r.f, daqOk, r.reasons));
      } catch (e) {
        // One bad record shouldn't hide the rest, or hide that it went wrong.
        column.appendChild(el("article", { "class": "county" }, [
          el("h3", { text: r.county.name + " County" }),
          el("p", { "class": "now-meta", text: "This county’s details didn’t load. Check Utah DAQ." })
        ]));
      }
    });
    frag.appendChild(core);
    if (near.childNodes.length) {
      frag.appendChild(el("section", { "class": "nearby", "aria-labelledby": "nearby-title" }, [
        el("h2", { id: "nearby-title", text: "Nearby valleys" }),
        near
      ]));
    }

    var mark = focusMark();
    body.textContent = "";
    body.appendChild(frag);
    focusBack(mark);
    document.body.classList.remove("is-down");
    showDate();
    if (printing || (printQuery && printQuery.matches)) printOpen();

    var updated = dayTimeOf(data.built_at);
    if (meta) {
      var stale = [];
      if (sources.airnow && !sources.airnow.ok) stale.push("AirNow");
      if (sources.daq_forecast && !sources.daq_forecast.ok) stale.push("Utah DAQ");
      if (sources.nws && !sources.nws.ok) stale.push("NWS");
      meta.textContent = "";
      if (updated) {
        meta.appendChild(document.createTextNode("Updated " + updated + " Mountain Time"));
        meta.appendChild(el("span", { "class": "meta-from", text: ", from Utah DAQ forecasts and EPA AirNow monitors" }));
        meta.appendChild(document.createTextNode("."));
      } else {
        meta.appendChild(document.createTextNode("From Utah DAQ forecasts and EPA AirNow monitors."));
      }
      if (stale.length) meta.appendChild(document.createTextNode(" Could not reach " + stale.join(", ") + " at the last update, so those parts are older."));
    }
    say(("Air readings loaded" + (updated ? ", updated " + updated : "")).replace(/\.?$/, "."));
    // Both depend on the layout, which the failed state changes.
    fitHead();
    fitHowto();
  }

  var lastTry = 0, lastDay = "";
  function load() {
    lastTry = Date.now();
    lastDay = todayInUtah();
    fetch("data/air.json?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (!data || data.version !== 1 || !Array.isArray(data.counties)) throw new Error("bad data");
        render(data);
      })
      .catch(fail);
  }

  // A tab left open overnight (or restored from the back button) would
  // otherwise keep showing yesterday as "Today". A failed load tries again too.
  function refreshIfOld() {
    if (Date.now() - lastTry >= REFRESH_MS || todayInUtah() !== lastDay) load();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refreshIfOld();
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted) refreshIfOld(); });
  setInterval(function () { if (document.visibilityState === "visible") refreshIfOld(); }, 60000);

  // Lines of headline and the rail's hole both change with the width.
  var lastWidth = window.innerWidth;
  window.addEventListener("resize", function () {
    if (printing || window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    fitHead();
    if (body.querySelector(".counties")) fitHowto();
  });

  showDate();
  load();
})();
