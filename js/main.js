// MICE Namibia - homepage interactions

document.addEventListener("DOMContentLoaded", function () {
  var header = document.querySelector(".site-header");
  var navToggle = document.querySelector(".nav-toggle");

  if (navToggle && header) {
    navToggle.addEventListener("click", function () {
      header.classList.toggle("nav-open");
    });
  }

  // TODO: wire the newsletter forms to a real email service once one is chosen.
  var newsletterForms = document.querySelectorAll("[data-newsletter-form]");
  newsletterForms.forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });
  });

  var footerYear = document.getElementById("footer-year-copy");
  if (footerYear) {
    footerYear.textContent = "Copyright " + new Date().getFullYear() + " MICE Namibia. All Rights Reserved.";
  }

  document.querySelectorAll("[data-gallery]").forEach(initGallery);

  // TODO: wire this form to a backend/email service (Zusammen Travels may
  // already have a Node.js/Nodemailer setup on their main site worth reusing)
  var contactForm = document.querySelector("[data-contact-form]");
  var contactConfirmation = document.querySelector("[data-form-confirmation]");
  if (contactForm && contactConfirmation) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      contactForm.reset();
      contactForm.hidden = true;
      contactConfirmation.hidden = false;
    });
  }

  initEventsArchive();
});

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
    item.innerHTML =
      '<span class="event-item-date">' + event.date + "</span>" +
      '<span class="event-item-title">' + event.title + "</span>";
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

function initGallery(gallery) {
  var slides = gallery.querySelectorAll(".gallery-slide");
  var dots = gallery.querySelectorAll(".gallery-dot");
  var prevBtn = gallery.querySelector(".gallery-prev");
  var nextBtn = gallery.querySelector(".gallery-next");
  var current = 0;
  var intervalId;
  var AUTO_SLIDE_MS = 5000;

  function show(index) {
    slides[current].classList.remove("active");
    if (dots[current]) dots[current].classList.remove("active");
    current = (index + slides.length) % slides.length;
    slides[current].classList.add("active");
    if (dots[current]) dots[current].classList.add("active");
  }

  function startAutoSlide() {
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
