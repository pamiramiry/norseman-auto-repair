/* Norseman Auto Repair. Small, dependency-free behaviour for the one-page site. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- compact sticky header ---------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var ticking = false;
    var setCompact = function () {
      header.classList.toggle("is-compact", window.scrollY > 40);
      ticking = false;
    };
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(setCompact);
      }
    }, { passive: true });
    setCompact();
  }

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.classList.toggle("is-open", open);
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if (!reduceMotion && "IntersectionObserver" in window && revealEls.length) {
    doc.classList.add("js-reveal");
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObs.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealEls.forEach(function (el) { revealObs.observe(el); });
  }

  /* ---------- rolling numbers in the stats band ---------- */
  // The real numbers are in the HTML. JS only zeroes them and counts back up when the band
  // comes into view, so search engines, no-JS visitors and reduced-motion users see the final value.
  var counters = document.querySelectorAll(".count[data-count]");
  if (counters.length && !reduceMotion && "IntersectionObserver" in window) {
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
    var roll = function (el, delay) {
      var target = parseInt(el.getAttribute("data-count"), 10);
      var duration = 1600;
      var start = null;
      var step = function (now) {
        if (start === null) start = now + delay;
        var t = Math.min(Math.max((now - start) / duration, 0), 1);
        el.textContent = String(Math.round(target * ease(t)));
        if (t < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    };
    counters.forEach(function (el) { el.textContent = "0"; });
    var countObs = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      counters.forEach(function (el, i) { roll(el, i * 150); });
      countObs.disconnect();
    }, { threshold: 0.35 });
    countObs.observe(counters[0].closest("section"));
  }

  /* ---------- highlight today's hours (shop time, not visitor time) ---------- */
  try {
    var dayName = new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "America/Toronto" }).format(new Date());
    var dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayName.slice(0, 3));
    var todayRow = document.querySelector('.hours tr[data-day="' + dayIndex + '"]');
    if (todayRow) {
      todayRow.classList.add("is-today");
      var th = todayRow.querySelector("th");
      if (th) th.insertAdjacentHTML("beforeend", ' <span class="visually-hidden">(today)</span>');
    }
  } catch (err) { /* hours still read fine without the highlight */ }

  /* ---------- load the map only when it's near the viewport ---------- */
  var mapFrame = document.querySelector(".map__frame[data-src]");
  if (mapFrame) {
    var loadMap = function () {
      mapFrame.setAttribute("src", mapFrame.getAttribute("data-src"));
      mapFrame.removeAttribute("data-src");
    };
    if ("IntersectionObserver" in window) {
      var mapObs = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          loadMap();
          mapObs.disconnect();
        }
      }, { rootMargin: "300px 0px" });
      mapObs.observe(mapFrame.parentElement);
    } else {
      loadMap();
    }
  }

  /* ---------- quote form (no endpoint yet) ---------- */
  var form = document.getElementById("quote");
  if (form) {
    var status = form.querySelector(".quote__status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null;
      form.querySelectorAll("[required]").forEach(function (field) {
        var ok = field.checkValidity();
        field.setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok && !firstBad) firstBad = field;
      });
      var email = form.querySelector('input[type="email"]');
      if (email && email.value && !email.checkValidity()) {
        email.setAttribute("aria-invalid", "true");
        if (!firstBad) firstBad = email;
      }

      if (firstBad) {
        status.className = "quote__status is-error";
        status.textContent = "Please fill in the highlighted fields so we can call you back.";
        firstBad.focus();
        return;
      }

      // TODO: connect form endpoint (POST new FormData(form) to it here)
      status.className = "quote__status is-success";
      status.textContent = "Thanks. We've got your details and we'll be in touch during shop hours. Need it sooner? Call (289) 244-7969.";
      form.reset();
      form.querySelectorAll("[aria-invalid]").forEach(function (f) { f.removeAttribute("aria-invalid"); });
    });
  }

  /* ---------- footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
