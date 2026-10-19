// MICE Namibia: site interactions.
// Small independent modules, each hooked to data-attributes or component
// classes, each a no-op on pages that do not contain its markup.

var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var MOBILE_NAV_QUERY = window.matchMedia("(max-width: 1080px)");

document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", function () {
  initHeader();
  initNavDropdowns();
  initNewsletterForms();
  initFooterYear();
  initReveal();
  initCountUp();
  initBackToTop();
  initTocScrollSpy();
  document.querySelectorAll("[data-gallery]").forEach(initGallery);
  initContactPrefill();
  initContactForm();
  initEventsArchive();
  initCountdowns();
  initLightboxes();
  initBlogFilters();
  initHeroSlider();
  initCarousels();
});

/* Header: mobile panel and compact-on-scroll ------------------------------ */

function initHeader() {
  var header = document.querySelector("[data-header]");
  if (!header) return;
  var toggle = header.querySelector(".nav-toggle");

  function syncHeaderHeight() {
    document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  }

  function setMenu(open) {
    header.classList.toggle("nav-open", open);
    document.body.classList.toggle("menu-open", open);
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    if (!open) closeNavDropdowns();
    syncHeaderHeight();
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      setMenu(!header.classList.contains("nav-open"));
    });
  }

  document.addEventListener("keydown", function (event) {
    if ((event.key === "Escape" || event.key === "Esc") && header.classList.contains("nav-open")) {
      setMenu(false);
      if (toggle) toggle.focus();
    }
  });

  MOBILE_NAV_QUERY.addEventListener("change", function (query) {
    if (!query.matches) setMenu(false);
  });

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var compact = window.scrollY > 40;
      if (compact !== header.classList.contains("is-compact")) {
        header.classList.toggle("is-compact", compact);
        syncHeaderHeight();
      }
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", syncHeaderHeight);
  syncHeaderHeight();
  onScroll();
}

/* Pages dropdown (click/keyboard; hover handled in CSS for pointers) ------- */

var navDropdownItems = [];

function closeNavDropdowns() {
  navDropdownItems.forEach(function (item) {
    item.classList.remove("open");
    var toggle = item.querySelector(".nav-dropdown-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
}

function initNavDropdowns() {
  navDropdownItems = Array.prototype.slice.call(document.querySelectorAll(".nav-item--dropdown"));

  navDropdownItems.forEach(function (item) {
    var toggle = item.querySelector(".nav-dropdown-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      closeNavDropdowns();
      if (!isOpen) {
        item.classList.add("open");
        toggle.setAttribute("aria-expanded", "true");
      }
    });

    item.addEventListener("keydown", function (event) {
      if ((event.key === "Escape" || event.key === "Esc") && item.classList.contains("open")) {
        event.stopPropagation();
        closeNavDropdowns();
        toggle.focus();
      }
    });

    item.addEventListener("focusout", function (event) {
      if (!MOBILE_NAV_QUERY.matches && !item.contains(event.relatedTarget)) {
        closeNavDropdowns();
      }
    });
  });

  document.addEventListener("click", function (event) {
    var clickedInsideDropdown = navDropdownItems.some(function (item) {
      return item.contains(event.target);
    });
    if (!clickedInsideDropdown) closeNavDropdowns();
  });
}

/* Newsletter: inline success message ------------------------------------ */

// TODO: wire the newsletter forms to a real email service once the backend
// exists (Phase 2). Until then the address is not stored anywhere.
function initNewsletterForms() {
  document.querySelectorAll("[data-newsletter-form]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var success = form.parentElement.querySelector("[data-newsletter-success]");
      form.hidden = true;
      if (success) {
        success.hidden = false;
        success.setAttribute("tabindex", "-1");
        success.focus();
      }
    });
  });
}

function initFooterYear() {
  var year = document.querySelector("[data-current-year]");
  if (year) year.textContent = String(new Date().getFullYear());
}

/* Reveal on scroll: [data-reveal] and staggered [data-reveal-stagger] ----- */

function initReveal() {
  var targets = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");
  if (!targets.length) return;

  document.querySelectorAll("[data-reveal-stagger]").forEach(function (group) {
    var step = parseInt(group.getAttribute("data-reveal-stagger"), 10) || 90;
    Array.prototype.forEach.call(group.children, function (child, index) {
      child.style.setProperty("--reveal-delay", index * step + "ms");
    });
  });

  if (REDUCED_MOTION || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) {
      el.classList.add("is-revealed");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
  );

  targets.forEach(function (el) {
    observer.observe(el);
  });
}

/* Count-up numbers: <span data-count-to="9">9</span> ---------------------- */

function initCountUp() {
  var counters = document.querySelectorAll("[data-count-to]");
  if (!counters.length || REDUCED_MOTION || !("IntersectionObserver" in window)) return;

  var DURATION_MS = 1400;

  function run(el) {
    var target = parseFloat(el.getAttribute("data-count-to"));
    var suffix = el.getAttribute("data-count-suffix") || "";
    if (isNaN(target)) return;
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / DURATION_MS, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) window.requestAnimationFrame(frame);
    }
    el.textContent = "0" + suffix;
    window.requestAnimationFrame(frame);
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          run(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 }
  );

  counters.forEach(function (el) {
    observer.observe(el);
  });
}

/* Back to top ------------------------------------------------------------ */

function initBackToTop() {
  var button = document.querySelector("[data-back-to-top]");
  if (!button) return;

  function update() {
    button.classList.toggle("is-visible", window.scrollY > 600);
  }

  button.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? "auto" : "smooth" });
    var skipTarget = document.getElementById("main");
    if (skipTarget) skipTarget.focus({ preventScroll: true });
  });

  window.addEventListener("scroll", update, { passive: true });
  update();
}

/* Table of contents scroll-spy: [data-toc] links to section ids ---------- */

function initTocScrollSpy() {
  var toc = document.querySelector("[data-toc]");
  if (!toc || !("IntersectionObserver" in window)) return;

  var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
  var headings = links
    .map(function (link) {
      return document.getElementById(link.getAttribute("href").slice(1));
    })
    .filter(Boolean);
  if (!headings.length) return;

  var visible = new Set();

  function setActive(id) {
    links.forEach(function (link) {
      var active = link.getAttribute("href") === "#" + id;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          visible.add(entry.target.id);
        } else {
          visible.delete(entry.target.id);
        }
      });
      var current = headings.filter(function (h) {
        return visible.has(h.id);
      })[0];
      if (current) setActive(current.id);
    },
    { rootMargin: "-15% 0px -70% 0px" }
  );

  headings.forEach(function (heading) {
    observer.observe(heading);
  });
  setActive(headings[0].id);
}

/* Contact form ----------------------------------------------------------- */

// TODO: wire this form to a backend/email service (Zusammen Travels may
// already have a Node.js/Nodemailer setup on their main site worth reusing)
function initContactForm() {
  var contactForm = document.querySelector("[data-contact-form]");
  var contactConfirmation = document.querySelector("[data-form-confirmation]");
  if (!contactForm || !contactConfirmation) return;

  contactForm.addEventListener("submit", function (event) {
    event.preventDefault();
    contactForm.reset();
    contactForm.hidden = true;
    contactConfirmation.hidden = false;
  });
}

/* Blog listing filters --------------------------------------------------- */

function initBlogFilters() {
  var cards = document.querySelectorAll("[data-blog-list] .blog-card");
  var searchInput = document.querySelector("[data-blog-search]");
  var categoryButtons = document.querySelectorAll("[data-blog-categories] .category-filter");
  var emptyState = document.querySelector("[data-blog-empty]");
  if (!cards.length) return;

  var activeCategory = "all";

  function applyFilters() {
    var term = (searchInput ? searchInput.value : "").trim().toLowerCase();
    var visibleCount = 0;

    cards.forEach(function (card) {
      var matchesCategory = activeCategory === "all" || card.dataset.category === activeCategory;
      var matchesSearch = term === "" || card.dataset.search.indexOf(term) !== -1;
      var visible = matchesCategory && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount++;
    });

    if (emptyState) emptyState.hidden = visibleCount !== 0;
  }

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }

  categoryButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      categoryButtons.forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      activeCategory = btn.dataset.category;
      applyFilters();
    });
  });
}

/* Conference data embedded by tools/build-conferences.mjs ------------------ */

function readConferenceData() {
  var node = document.getElementById("conference-data");
  if (!node) return [];
  try {
    return JSON.parse(node.textContent).sort(function (a, b) {
      return new Date(a.starts_at) - new Date(b.starts_at);
    });
  } catch (error) {
    // The page still has its server-rendered list; log so a bad build is visible.
    console.error("Conference data could not be parsed", error);
    return [];
  }
}

// All conference dates are formatted in the event's own timezone, so the
// archive shows the same local date and time wherever the visitor is.
function confFormat(iso, tz, options) {
  var opts = Object.assign({ timeZone: tz }, options);
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
}

function confTime(iso, tz) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

// "YYYY-MM-DD" of an instant in a given timezone.
function confDayKey(iso, tz) {
  var parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return parts.slice(0, 10);
}

function localDayKey(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

var CONF_ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>',
};

// Same markup as the server-rendered rows in tools/build-conferences.mjs.
function eventRowHtml(c) {
  var tz = c.timezone;
  var when = confFormat(c.starts_at, tz, { month: "long", day: "numeric", year: "numeric" }) + " @ " + confTime(c.starts_at, tz) + " to " + confTime(c.ends_at, tz);
  return (
    '<article class="event-row">' +
    '<div class="event-row-date" aria-hidden="true"><span class="event-row-dow">' + confFormat(c.starts_at, tz, { weekday: "short" }).toUpperCase() + '</span><span class="event-row-day">' + confFormat(c.starts_at, tz, { day: "numeric" }) + "</span></div>" +
    '<div class="event-row-body">' +
    '<p class="event-row-when">' + CONF_ICON.clock + '<time datetime="' + escapeHtml(c.starts_at) + '">' + escapeHtml(when) + "</time></p>" +
    '<h3 class="event-row-title"><a href="' + escapeHtml(c.url) + '">' + escapeHtml(c.title) + "</a></h3>" +
    '<p class="event-row-where">' + CONF_ICON.pin + '<img src="assets/images/flags/' + escapeHtml(c.country_iso2) + '.svg" alt="" width="24" height="18">' + escapeHtml(c.city + ", " + c.country) + "</p>" +
    '<p class="event-row-excerpt">' + escapeHtml(c.excerpt) + "</p>" +
    '<a href="' + escapeHtml(c.url) + '" class="text-link">Read More<span class="visually-hidden">: ' + escapeHtml(c.short_title) + "</span> " + CONF_ICON.arrow + "</a>" +
    "</div>" +
    '<a href="' + escapeHtml(c.url) + '" class="event-row-media" tabindex="-1" aria-hidden="true"><picture>' +
    '<source type="image/webp" srcset="' + escapeHtml(c.cover.webp) + '" sizes="(max-width: 900px) 100vw, 360px">' +
    '<img src="' + escapeHtml(c.cover.src) + '" srcset="' + escapeHtml(c.cover.srcset) + '" sizes="(max-width: 900px) 100vw, 360px" alt="" width="' + c.cover.width + '" height="' + c.cover.height + '" loading="lazy" decoding="async">' +
    "</picture></a>" +
    "</article>"
  );
}

function groupedListHtml(items) {
  var html = "";
  var currentMonth = null;
  items.forEach(function (c) {
    var month = confFormat(c.starts_at, c.timezone, { month: "long", year: "numeric" });
    if (month !== currentMonth) {
      if (currentMonth !== null) html += "</div>";
      html += '<div class="events-month"><h2 class="events-month-pill"><span>' + escapeHtml(month) + "</span></h2>";
      currentMonth = month;
    }
    html += eventRowHtml(c);
  });
  if (currentMonth !== null) html += "</div>";
  return html;
}

function emptyStateHtml(title, text) {
  return (
    '<div class="events-empty"><strong>' + escapeHtml(title) + "</strong><p>" + escapeHtml(text) + "</p>" +
    '<a href="#newsletter" class="btn btn-primary btn-small">Get event alerts</a></div>'
  );
}

/* Events archive: search + List / Month / Day views ------------------------ */

function initEventsArchive() {
  var panel = document.querySelector("[data-events-panel]");
  var form = document.querySelector("[data-events-search-form]");
  if (!panel || !form) return;

  var all = readConferenceData();
  var nav = document.querySelector("[data-events-nav]");
  var input = form.querySelector("[data-event-search]");
  var tabs = Array.prototype.slice.call(form.querySelectorAll('[role="tab"]'));
  var rangeLabel = document.querySelector("[data-events-range]");
  var prevBtn = document.querySelector("[data-events-prev]");
  var nextBtn = document.querySelector("[data-events-next]");
  var todayBtn = document.querySelector("[data-events-today]");

  form.hidden = false;
  if (nav) nav.hidden = false;

  var now = new Date();
  var firstUpcoming = all.filter(function (c) {
    return new Date(c.ends_at) >= now;
  })[0];
  var anchorKey = firstUpcoming ? confDayKey(firstUpcoming.starts_at, firstUpcoming.timezone) : localDayKey(now);

  var state = {
    view: "list",
    listMode: "upcoming",
    month: { y: Number(anchorKey.slice(0, 4)), m: Number(anchorKey.slice(5, 7)) - 1 },
    day: anchorKey,
    term: "",
  };

  function matches(c) {
    if (!state.term) return true;
    var hay = (c.title + " " + c.short_title + " " + c.city + " " + c.country).toLowerCase();
    return hay.indexOf(state.term) !== -1;
  }

  function filtered() {
    return all.filter(matches);
  }

  function noMatchText() {
    return state.term ? 'No events match "' + state.term + '". Try another name, city or country.' : "";
  }

  function renderList() {
    var items = filtered().filter(function (c) {
      var ended = new Date(c.ends_at) < now;
      return state.listMode === "past" ? ended : !ended;
    });
    if (state.listMode === "past") items.reverse();

    if (state.listMode === "past") {
      rangeLabel.textContent = "Past events";
    } else {
      var last = items[items.length - 1];
      rangeLabel.textContent = last ? "Now to " + confFormat(last.starts_at, last.timezone, { month: "long", year: "numeric" }) : "Upcoming events";
    }
    prevBtn.disabled = state.listMode === "past";
    nextBtn.disabled = state.listMode === "upcoming";
    prevBtn.setAttribute("aria-label", "Show past events");
    nextBtn.setAttribute("aria-label", "Show upcoming events");

    panel.innerHTML = items.length
      ? groupedListHtml(items)
      : emptyStateHtml(
          state.term ? "No matching events" : state.listMode === "past" ? "No past events yet" : "No upcoming events right now",
          noMatchText() || "New conferences across our nine destinations are announced regularly. Get the alerts and be the first to know."
        );
  }

  function renderMonth() {
    var y = state.month.y;
    var m = state.month.m;
    var first = new Date(y, m, 1);
    var monthName = first.toLocaleString("en-US", { month: "long", year: "numeric" });
    rangeLabel.textContent = monthName;
    prevBtn.disabled = false;
    nextBtn.disabled = false;
    prevBtn.setAttribute("aria-label", "Previous month");
    nextBtn.setAttribute("aria-label", "Next month");

    var byDay = {};
    var inMonth = [];
    filtered().forEach(function (c) {
      var key = confDayKey(c.starts_at, c.timezone);
      (byDay[key] = byDay[key] || []).push(c);
      if (key.slice(0, 7) === y + "-" + String(m + 1).padStart(2, "0")) inMonth.push(c);
    });

    // Weeks start on Monday.
    var offset = (first.getDay() + 6) % 7;
    var start = new Date(y, m, 1 - offset);
    var todayKey = localDayKey(now);
    var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var html = '<table class="events-calendar"><caption class="visually-hidden">Conferences in ' + escapeHtml(monthName) + "</caption><thead><tr>";
    days.forEach(function (d) {
      html += '<th scope="col">' + d + "</th>";
    });
    html += "</tr></thead><tbody>";
    for (var week = 0; week < 6; week++) {
      var weekStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7);
      if (week > 3 && weekStart.getMonth() !== m) break;
      html += "<tr>";
      for (var d = 0; d < 7; d++) {
        var date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + d);
        var key = localDayKey(date);
        var cls = [date.getMonth() !== m ? "is-outside" : "", key === todayKey ? "is-today" : ""].join(" ").trim();
        var label = date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric" });
        html += "<td" + (cls ? ' class="' + cls + '"' : "") + '><span class="events-calendar-day" aria-label="' + escapeHtml(label) + '">' + date.getDate() + "</span>";
        (byDay[key] || []).forEach(function (c) {
          html += '<a class="events-calendar-chip" href="' + escapeHtml(c.url) + '">' + escapeHtml(c.short_title) + "</a>";
        });
        html += "</td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    html += '<div class="events-calendar-list">' + (inMonth.length ? groupedListHtml(inMonth) : "") + "</div>";
    if (!inMonth.length) {
      html += emptyStateHtml(state.term ? "No matching events this month" : "No conferences in " + monthName, noMatchText() || "Use the arrows to browse other months, or get alerts when new conferences are added.");
    }
    panel.innerHTML = html;
  }

  function renderDay() {
    var parts = state.day.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    rangeLabel.textContent = date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    prevBtn.disabled = false;
    nextBtn.disabled = false;
    prevBtn.setAttribute("aria-label", "Previous day");
    nextBtn.setAttribute("aria-label", "Next day");
    var items = filtered().filter(function (c) {
      return confDayKey(c.starts_at, c.timezone) === state.day;
    });
    panel.innerHTML = items.length
      ? groupedListHtml(items)
      : emptyStateHtml(state.term ? "No matching events on this day" : "No conferences on this day", noMatchText() || "Use the arrows to move between days, or switch to Month view to see what is coming up.");
  }

  function render() {
    if (state.view === "month") renderMonth();
    else if (state.view === "day") renderDay();
    else renderList();
  }

  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("active", on);
    });
    panel.setAttribute("aria-labelledby", tab.id);
    state.view = tab.getAttribute("data-view");
    if (focus) tab.focus();
    render();
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      selectTab(tab, false);
    });
    tab.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        selectTab(next, true);
      }
    });
  });

  function shiftDay(delta) {
    var p = state.day.split("-").map(Number);
    state.day = localDayKey(new Date(p[0], p[1] - 1, p[2] + delta));
  }

  prevBtn.addEventListener("click", function () {
    if (state.view === "list") state.listMode = "past";
    else if (state.view === "month") state.month = { y: state.month.m === 0 ? state.month.y - 1 : state.month.y, m: (state.month.m + 11) % 12 };
    else shiftDay(-1);
    render();
  });

  nextBtn.addEventListener("click", function () {
    if (state.view === "list") state.listMode = "upcoming";
    else if (state.view === "month") state.month = { y: state.month.m === 11 ? state.month.y + 1 : state.month.y, m: (state.month.m + 1) % 12 };
    else shiftDay(1);
    render();
  });

  todayBtn.addEventListener("click", function () {
    state.listMode = "upcoming";
    state.month = { y: now.getFullYear(), m: now.getMonth() };
    state.day = localDayKey(now);
    render();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    state.term = input.value.trim().toLowerCase();
    render();
  });

  input.addEventListener("input", function () {
    state.term = input.value.trim().toLowerCase();
    render();
  });

  render();
}

/* Countdown: [data-countdown data-start data-end] ------------------------- */

function initCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach(function (box) {
    var start = new Date(box.getAttribute("data-start")).getTime();
    var end = new Date(box.getAttribute("data-end")).getTime();
    if (isNaN(start) || isNaN(end)) return;

    var units = box.querySelector("[data-countdown-units]");
    var label = box.querySelector("[data-countdown-label]");
    var status = box.querySelector("[data-countdown-status]");
    var out = {
      days: box.querySelector("[data-countdown-days]"),
      hours: box.querySelector("[data-countdown-hours]"),
      minutes: box.querySelector("[data-countdown-minutes]"),
      seconds: box.querySelector("[data-countdown-seconds]"),
    };
    var timer = null;

    function showStatus(text) {
      units.hidden = true;
      label.hidden = true;
      status.hidden = false;
      status.textContent = text;
    }

    function tick() {
      var now = Date.now();
      if (now >= end) {
        showStatus("This event has ended");
        window.clearInterval(timer);
        return;
      }
      if (now >= start) {
        showStatus("Happening now");
        return;
      }
      var diff = Math.floor((start - now) / 1000);
      out.days.textContent = Math.floor(diff / 86400);
      out.hours.textContent = String(Math.floor((diff % 86400) / 3600)).padStart(2, "0");
      out.minutes.textContent = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      out.seconds.textContent = String(diff % 60).padStart(2, "0");
    }

    box.hidden = false;
    tick();
    timer = window.setInterval(tick, 1000);
  });
}

/* Lightbox: [data-lightbox] containing <a data-lightbox-item href=large> --- */

var LIGHTBOX_ICON = {
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="15 18 9 12 15 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="9 18 15 12 9 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
};

function initLightboxes() {
  var groups = document.querySelectorAll("[data-lightbox]");
  if (!groups.length || typeof HTMLDialogElement !== "function") return;

  // One shared <dialog>: showModal() gives focus trapping, inert background
  // and Escape-to-close natively.
  var dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.setAttribute("aria-label", "Image viewer");
  dialog.innerHTML =
    '<div class="lightbox-inner">' +
    '<div class="lightbox-top"><span class="lightbox-counter" aria-live="polite"></span>' +
    '<button type="button" class="lightbox-btn" data-lightbox-close aria-label="Close image viewer">' + LIGHTBOX_ICON.close + "</button></div>" +
    '<figure class="lightbox-figure"><img alt=""><figcaption></figcaption></figure>' +
    '<div class="lightbox-controls">' +
    '<button type="button" class="lightbox-btn" data-lightbox-prev aria-label="Previous image">' + LIGHTBOX_ICON.prev + "</button>" +
    '<button type="button" class="lightbox-btn" data-lightbox-next aria-label="Next image">' + LIGHTBOX_ICON.next + "</button>" +
    "</div></div>";
  document.body.appendChild(dialog);

  var img = dialog.querySelector("img");
  var caption = dialog.querySelector("figcaption");
  var counter = dialog.querySelector(".lightbox-counter");
  var items = [];
  var index = 0;
  var opener = null;

  function show(i) {
    index = (i + items.length) % items.length;
    var item = items[index];
    var thumb = item.querySelector("img");
    img.src = item.getAttribute("href");
    img.alt = thumb ? thumb.alt : "";
    caption.textContent = item.getAttribute("data-caption") || "";
    counter.textContent = index + 1 + " / " + items.length;
  }

  dialog.querySelector("[data-lightbox-prev]").addEventListener("click", function () {
    show(index - 1);
  });
  dialog.querySelector("[data-lightbox-next]").addEventListener("click", function () {
    show(index + 1);
  });
  dialog.querySelector("[data-lightbox-close]").addEventListener("click", function () {
    dialog.close();
  });
  dialog.addEventListener("keydown", function (event) {
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog || event.target.classList.contains("lightbox-figure")) dialog.close();
  });
  dialog.addEventListener("close", function () {
    document.body.classList.remove("menu-open");
    if (opener) opener.focus();
  });

  // Swipe left/right on touch screens.
  var touchX = null;
  dialog.addEventListener("pointerdown", function (event) {
    if (event.pointerType !== "mouse") touchX = event.clientX;
  });
  dialog.addEventListener("pointerup", function (event) {
    if (touchX === null) return;
    var dx = event.clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) show(dx < 0 ? index + 1 : index - 1);
  });

  groups.forEach(function (group) {
    var groupItems = Array.prototype.slice.call(group.querySelectorAll("[data-lightbox-item]"));
    groupItems.forEach(function (item, i) {
      item.setAttribute("aria-haspopup", "dialog");
      item.addEventListener("click", function (event) {
        event.preventDefault();
        items = groupItems;
        opener = item;
        show(i);
        dialog.showModal();
        document.body.classList.add("menu-open");
        dialog.querySelector("[data-lightbox-next]").focus();
      });
    });
  });
}

/* Contact form prefill from ?type=proposal&event=&venue=&destination=&service= */

function initContactPrefill() {
  var form = document.querySelector("[data-contact-form]");
  if (!form || !window.URLSearchParams) return;
  var params = new URLSearchParams(window.location.search);
  var type = params.get("type");
  var eventSlug = params.get("event");
  var venue = params.get("venue");
  var destination = params.get("destination");
  var service = params.get("service");
  if (!type && !eventSlug && !venue && !destination && !service) return;

  var conference = null;
  if (eventSlug) {
    conference = readConferenceData().filter(function (c) {
      return c.slug === eventSlug;
    })[0] || null;
  }

  var lines = [];
  var summary = [];
  if (type === "proposal") lines.push("I would like to request a proposal.");
  if (conference) {
    lines.push("Conference: " + conference.title + " (" + conference.city + ", " + conference.country + ")");
    summary.push("Register interest: " + conference.short_title);
  }
  if (venue) {
    lines.push("Venue: " + venue);
    summary.push("Venue: " + venue);
  }
  if (destination) {
    lines.push("Destination: " + destination);
    summary.push("Destination: " + destination);
  }
  if (service) {
    lines.push("Service: " + service);
    summary.push("Service: " + service);
  }

  var message = form.querySelector("#message");
  if (message && !message.value && lines.length) message.value = lines.join("\n") + "\n\n";

  var hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "enquiry-type";
  hidden.value = type === "proposal" ? "proposal" : "general";
  form.appendChild(hidden);

  if (summary.length || type === "proposal") {
    var note = document.createElement("p");
    note.className = "enquiry-context";
    note.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    var text = document.createElement("span");
    var details = summary.filter(function (s) {
      return s.indexOf("Register interest") !== 0;
    });
    text.textContent =
      (conference ? "You are registering interest in " + conference.short_title + "." : type === "proposal" ? "You are requesting a proposal." : "Your enquiry.") +
      (details.length ? " " + details.join(" | ") : "");
    note.appendChild(text);
    form.parentNode.insertBefore(note, form);
  }
}

/* Venue photo slideshow -------------------------------------------------- */

function initGallery(gallery) {
  var slides = gallery.querySelectorAll(".gallery-slide");
  var dots = gallery.querySelectorAll(".gallery-dot");
  var prevBtn = gallery.querySelector(".gallery-prev");
  var nextBtn = gallery.querySelector(".gallery-next");
  var current = 0;
  var intervalId;
  var AUTO_SLIDE_MS = 5000;
  if (!slides.length) return;

  function show(index) {
    slides[current].classList.remove("active");
    if (dots[current]) dots[current].classList.remove("active");
    current = (index + slides.length) % slides.length;
    slides[current].classList.add("active");
    if (dots[current]) dots[current].classList.add("active");
  }

  function startAutoSlide() {
    if (REDUCED_MOTION) return;
    intervalId = window.setInterval(function () {
      show(current + 1);
    }, AUTO_SLIDE_MS);
  }

  function resetAutoSlide() {
    window.clearInterval(intervalId);
    startAutoSlide();
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      show(current - 1);
      resetAutoSlide();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      show(current + 1);
      resetAutoSlide();
    });
  }

  dots.forEach(function (dot, index) {
    dot.addEventListener("click", function () {
      show(index);
      resetAutoSlide();
    });
  });

  if (slides.length > 1) {
    startAutoSlide();
  }
}

/* Homepage hero slideshow: [data-hero] ------------------------------------
   Crossfade every 7s, pauses on hover/focus, pause button, dot buttons,
   swipe. Under reduced motion it never auto-advances. */

function initHeroSlider() {
  var hero = document.querySelector("[data-hero]");
  if (!hero) return;
  var slides = Array.prototype.slice.call(hero.querySelectorAll("[data-hero-slide]"));
  var dots = Array.prototype.slice.call(hero.querySelectorAll("[data-hero-dot]"));
  var pauseBtn = hero.querySelector("[data-hero-pause]");
  if (slides.length < 2) return;

  var INTERVAL = 7000;
  var current = 0;
  var timer = null;
  var userPaused = REDUCED_MOTION;
  var hoverPaused = false;

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach(function (slide, i) {
      var active = i === current;
      slide.classList.toggle("is-active", active);
      if (active) slide.removeAttribute("aria-hidden");
      else slide.setAttribute("aria-hidden", "true");
    });
    dots.forEach(function (dot, i) {
      if (i === current) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  function stop() {
    window.clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    if (userPaused || hoverPaused) return;
    timer = window.setInterval(function () {
      show(current + 1);
    }, INTERVAL);
  }

  function syncPauseButton() {
    hero.classList.toggle("is-paused", userPaused);
    if (pauseBtn) {
      pauseBtn.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
      pauseBtn.setAttribute("aria-pressed", userPaused ? "true" : "false");
    }
  }

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      show(parseInt(dot.getAttribute("data-hero-dot"), 10) || 0);
      start();
    });
  });

  if (pauseBtn) {
    pauseBtn.addEventListener("click", function () {
      userPaused = !userPaused;
      syncPauseButton();
      start();
    });
  }

  hero.addEventListener("mouseenter", function () { hoverPaused = true; stop(); });
  hero.addEventListener("mouseleave", function () { hoverPaused = false; start(); });
  hero.addEventListener("focusin", function () { hoverPaused = true; stop(); });
  hero.addEventListener("focusout", function (event) {
    if (!hero.contains(event.relatedTarget)) { hoverPaused = false; start(); }
  });

  var touchX = null;
  hero.addEventListener("touchstart", function (event) {
    touchX = event.touches[0].clientX;
  }, { passive: true });
  hero.addEventListener("touchend", function (event) {
    if (touchX === null) return;
    var dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 40) return;
    show(dx < 0 ? current + 1 : current - 1);
    start();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  show(0);
  syncPauseButton();
  start();
}

/* Horizontal scroll-snap carousels: [data-carousel] -----------------------
   Prev/next buttons (matched by aria-controls), drag with a mouse, arrow
   keys when the track has focus. Touch uses native scrolling. */

function initCarousels() {
  document.querySelectorAll("[data-carousel]").forEach(function (track) {
    var id = track.id;
    var prev = id ? document.querySelector('[data-carousel-prev][aria-controls="' + id + '"]') : null;
    var next = id ? document.querySelector('[data-carousel-next][aria-controls="' + id + '"]') : null;

    function step() {
      var first = track.children[0];
      if (!first) return track.clientWidth;
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return first.getBoundingClientRect().width + gap;
    }

    function scrollByStep(direction) {
      track.scrollBy({ left: direction * step(), behavior: REDUCED_MOTION ? "auto" : "smooth" });
    }

    function update() {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
    }

    if (prev) prev.addEventListener("click", function () { scrollByStep(-1); });
    if (next) next.addEventListener("click", function () { scrollByStep(1); });

    track.addEventListener("keydown", function (event) {
      if (event.target !== track) return;
      if (event.key === "ArrowRight") { event.preventDefault(); scrollByStep(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); scrollByStep(-1); }
    });

    var scrollTicking = false;
    track.addEventListener("scroll", function () {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(function () { update(); scrollTicking = false; });
    }, { passive: true });
    window.addEventListener("resize", update);

    // Mouse drag (pointer devices only).
    var dragStartX = 0;
    var dragStartScroll = 0;
    var dragging = false;
    var moved = false;
    track.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      dragging = true;
      moved = false;
      dragStartX = event.clientX;
      dragStartScroll = track.scrollLeft;
    });
    window.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      var dx = event.clientX - dragStartX;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        track.classList.add("is-dragging");
      }
      if (moved) track.scrollLeft = dragStartScroll - dx;
    });
    window.addEventListener("pointerup", function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        track.classList.remove("is-dragging");
        // Snap to the nearest card after a drag.
        var s = step();
        track.scrollTo({ left: Math.round(track.scrollLeft / s) * s, behavior: "smooth" });
      }
    });
    // A drag must not also follow the card link underneath.
    track.addEventListener("click", function (event) {
      if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; }
    }, true);
    track.addEventListener("dragstart", function (event) { event.preventDefault(); });

    update();
  });
}
