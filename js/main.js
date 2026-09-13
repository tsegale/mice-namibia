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
});

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
