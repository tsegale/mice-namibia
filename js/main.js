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
});
