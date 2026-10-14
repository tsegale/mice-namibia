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
  initContactForm();
  initEventsArchive();
  initBlogFilters();
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

/* Events archive (rebuilt with real conference data in Prompt 2) --------- */

// TODO: populate with real 2027 events (and content/images) once the client confirms them
var EVENTS = [];

function renderEvents(searchTerm) {
  var list = document.querySelector("[data-events-list]");
  if (!list) return;

  var term = (searchTerm || "").trim().toLowerCase();
  var matches = EVENTS.filter(function (event) {
    return event.title.toLowerCase().indexOf(term) !== -1;
  });

  list.innerHTML = "";

  if (matches.length === 0) {
    var empty = document.createElement("p");
    empty.className = "events-empty";
    empty.textContent = "No events currently scheduled. Check back soon.";
    list.appendChild(empty);
    return;
  }

  matches.forEach(function (event) {
    var item = document.createElement("div");
    item.className = "event-item";
    var date = document.createElement("span");
    date.className = "event-item-date";
    date.textContent = event.date;
    var title = document.createElement("span");
    title.className = "event-item-title";
    title.textContent = event.title;
    item.appendChild(date);
    item.appendChild(title);
    list.appendChild(item);
  });
}

function initEventsArchive() {
  var searchInput = document.querySelector("[data-event-search]");
  var findBtn = document.querySelector("[data-event-search-btn]");
  if (!searchInput) return;

  renderEvents("");

  searchInput.addEventListener("input", function () {
    renderEvents(searchInput.value);
  });

  if (findBtn) {
    findBtn.addEventListener("click", function () {
      renderEvents(searchInput.value);
    });
  }

  // TODO: implement Month/Day calendar views once real event data arrives
  var viewButtons = document.querySelectorAll(".events-view-btn");
  viewButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      viewButtons.forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");

      document.querySelectorAll(".events-panel").forEach(function (panel) {
        panel.hidden = true;
      });
      var target = document.getElementById("events-view-" + btn.dataset.view);
      if (target) target.hidden = false;
    });
  });
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
