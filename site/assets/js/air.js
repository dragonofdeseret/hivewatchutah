/* Today panel on the home page. Reads data/air.json, which
   scripts/fetch_data.py builds from Utah DAQ, EPA AirNow and NWS feeds
   every 30 minutes. This file makes no other network request. */
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
    var nowBad = now && !old && now.aqi !== null && now.aqi !== undefined && WATCH_LEVEL[now.cat];
    var dayBad = todayDay && WATCH_LEVEL[todayDay.health];
    if (nowBad && dayBad && now.cat === todayDay.health) {
      reasons.push(now.category + " now and forecast today");
    } else {
      if (nowBad) reasons.push(now.category + " now");
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

  function countyCard(county, today, daqOk, alerts) {
    var now = county.now;
    var days = (county.days || []).filter(function (d) { return d.date >= today; }).slice(0, 3);
    var todayDay = days.length && days[0].date === today ? days[0] : null;
    var cat = now && now.cat ? now.cat : (todayDay && todayDay.health) || null;
    var seen = now ? ms(now.observed_at) : null;
    var old = seen !== null && Date.now() - seen > OLD_READING_MS;

    var nowRow = null, nowMeta;
    if (now && now.aqi !== null && now.aqi !== undefined) {
      nowRow = el("p", { "class": "now" }, [
        el("span", { "class": "aqi-num", text: String(now.aqi) }),
        el("span", { "class": "aqi-chip", "data-cat": now.cat, text: now.category || "AQI" })
      ]);
      var when = old ? dayTimeOf(now.observed_at) + ", an older reading" : timeOf(now.observed_at);
      nowMeta = el("p", { "class": "now-meta", text:
        "AQI now (" + (POLLUTANT[now.pollutant] || now.pollutant || "pollutant not given") + ") · AirNow " + (now.area || "") + (when ? " · " + when : "") });
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
        el("dt", { text: dayLabel(d.date, today) }),
        el("dd", null, [el("span", { "class": "dot", "data-cat": d.health, "aria-hidden": "true" }), words])
      ]));
    });
    var note = sourceNote(county, daqOk);
    var reasons = watchReasons(county, todayDay, now, old, alerts);

    return el("article", { "class": "county" + (old ? " is-old" : "") + (reasons.length ? " is-watch" : ""), "data-cat": cat, "aria-labelledby": "county-" + county.id }, [
      el("h3", { id: "county-" + county.id, text: county.name + " County" }),
      reasons.length ? el("p", { "class": "watch" }, [shimmer(), el("span", { text: "Watch: " + reasons.join(" · ") })]) : null,
      nowRow,
      nowMeta,
      el("p", { "class": "sr-only", text: "Forecast: health level, then action level." }),
      list,
      note ? el("p", { "class": "source-line", text: note }) : null,
      el("p", { "class": "burn" }, [el("strong", { text: "Burning: " })].concat(burnLine(county, todayDay))),
      county.note ? el("p", { "class": "note-line", text: county.note }) : null
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
    if (alerts.length) {
      var ul = el("ul", { "class": "today-alerts" });
      alerts.forEach(function (a) {
        try { ul.appendChild(alertItem(a)); } catch (e) { /* skip a malformed alert */ }
      });
      frag.appendChild(ul);
    }

    var core = el("div", { "class": "counties core" });
    var near = el("div", { "class": "counties" });
    (data.counties || []).forEach(function (c) {
      try {
        (c.core ? core : near).appendChild(countyCard(c, today, daqOk, alerts));
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
      meta.textContent = (updated ? "Updated " + updated + " Mountain Time." : "") +
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
