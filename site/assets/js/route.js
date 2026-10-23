/* First-yes-wins helper for the Route page.
   External agency URLs stay in the HTML. This file only names a door. */
(function () {
  "use strict";

  var form = document.getElementById("route-tree");
  var outcome = document.getElementById("route-outcome");
  var reset = document.getElementById("route-reset");
  if (!form || !outcome) return;

  var steps = [
    { name: "q1", door: "911" },
    { name: "q2", door: "slcpd" },
    { name: "q3", door: "siac" },
    { name: "q4", door: "tip" },
    { name: "q5", door: "fbi" }
  ];

  var extra = {
    "911": "Call now. Do not open a form first.",
    "slcpd": "Use the Salt Lake City Police online report, and read what they accept.",
    "siac": "Use SIAC for a threat or a tip you cannot place with one agency.",
    "tip": "Use the Utah County Sheriff Tip A Cop form.",
    "fbi": "Use FBI tips. If someone is in danger now, call 911 instead.",
    "stoppers": "The Crime Stoppers form may not be live. If it does not load, use an earlier door. Davis and Weber Counties have no form on this page."
  };

  var idle = "Answer in order. The first yes is your door. If every answer is no, the last door is Crime Stoppers.";

  function valueOf(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  function clearFlags() {
    var doors = document.querySelectorAll("[data-door]");
    for (var i = 0; i < doors.length; i++) doors[i].classList.remove("is-suggested");
  }

  function showIdle(text) {
    clearFlags();
    outcome.textContent = text;
  }

  function showDoor(door) {
    clearFlags();
    var el = document.querySelector('[data-door="' + door + '"]');
    if (el) el.classList.add("is-suggested");
    var title = el && el.querySelector("h3") ? el.querySelector("h3").textContent : "Suggested door";
    outcome.textContent = "";
    var lead = document.createElement("strong");
    lead.textContent = "Suggested door: " + title + ". ";
    outcome.appendChild(lead);
    outcome.appendChild(document.createTextNode(extra[door] + " "));
    var link = document.createElement("a");
    link.href = "#door-" + door;
    link.textContent = "Go to this door";
    outcome.appendChild(link);
  }

  function suggest() {
    var door = "";
    var waiting = false;
    for (var i = 0; i < steps.length; i++) {
      var value = valueOf(steps[i].name);
      if (!value) {
        waiting = true;
        break;
      }
      if (value === "yes") {
        door = steps[i].door;
        break;
      }
    }
    if (door) {
      showDoor(door);
      return;
    }
    if (waiting) {
      showIdle("Keep going in order. The first yes is your door.");
      return;
    }
    showDoor("stoppers");
  }

  form.addEventListener("change", suggest);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  if (reset) {
    reset.addEventListener("click", function () {
      form.reset();
      showIdle(idle);
      var first = form.querySelector("input");
      if (first) first.focus();
    });
  }
})();
