"use strict";

// The fixed pages' address, share image, menu item and newsletter variant,
// carried over from the reviewed static site. Their titles and descriptions
// are edited under Admin > Settings > SEO (defaults in services/settings.js);
// detail pages (events, articles, venues) build theirs from the database.
//
// The two noindex pages are not in the SEO settings: their title (without the
// site name, which is added) and description stay here.

module.exports = {
  "home": {"path": "/", "image": "/assets/images/hero/hero-01-wicc-keynote-1280.jpg", "nav": "/", "newsletter": "home"},
  "about": {"path": "/about", "image": "/assets/images/venues/windhoek-country-club-resort-casino/gardens-1280.jpg", "nav": "/about", "newsletter": "default"},
  "services": {"path": "/services", "image": "/assets/images/venues/the-westin-cape-town/conference-venue-1-1280.jpg", "nav": "/services", "newsletter": "default"},
  "gallery": {"path": "/gallery", "image": "/assets/images/gallery/corporate-meetings-and-events-in-africa-namibia-1280.jpg", "nav": "/gallery", "newsletter": "default"},
  "faq": {"path": "/faq", "image": "/assets/images/gallery/conference-and-meeting-planning-services-africa-namibia-1280.jpg", "nav": "/faq", "newsletter": "home"},
  "partners": {"path": "/partners", "image": "/assets/images/venues/windhoek-country-club-resort-casino/restaurant-1280.jpg", "nav": "/partners", "newsletter": "default"},
  "pricing": {"path": "/pricing", "image": "/assets/images/venues/wicc/gallery-07-1280.jpg", "nav": "/pricing", "newsletter": "default"},
  "contact": {"path": "/contact", "image": "/assets/images/venues/wicc/event-5-1280.jpg", "nav": "/contact", "newsletter": "default"},
  "team": {"path": "/team", "nav": "/team", "newsletter": "default"},
  "privacy-policy": {"path": "/privacy-policy", "image": "/assets/images/venues/the-westin-cape-town/spa-1280.jpg", "nav": "/privacy-policy", "newsletter": "default"},
  "terms-and-conditions": {"path": "/terms-and-conditions", "image": "/assets/images/venues/movenpick/poolside-1280.jpg", "nav": "/terms-and-conditions", "newsletter": "default"},
  "events": {"path": "/events", "image": "/assets/images/venues/windhoek-country-club-resort-casino/reception-1280.jpg", "nav": "/events", "newsletter": "default"},
  "blog": {"path": "/blog", "image": "/assets/images/venues/movenpick/coffee-bar-1280.jpg", "nav": "/blog", "newsletter": "default"},
  "venues": {"path": "/venues", "image": "/assets/images/venues/wicc/event-4-1280.jpg", "nav": "/venues", "newsletter": "default"},
  "unsubscribe": {"title": "Newsletter", "description": "Manage your MICE Namibia event alerts.", "nav": "", "newsletter": "none", "noindex": true},
  "not-found": {"title": "Page not found", "description": "The page you are looking for has moved or no longer exists.", "nav": "", "newsletter": "default", "noindex": true},
};
