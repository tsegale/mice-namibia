"use strict";

const v = require("./common");
const { iso2 } = require("./faqs");

const partner = v.z.object({
  name: v.trimmed(160, "Name"),
  logo_media_id: v.id("Logo"),
  website_url: v.url("Website"),
  // "" = regional brand (no single country).
  country_iso2: iso2,
  dark_background: v.bool,
  show_in_marquee: v.bool,
  status: v.status,
});

module.exports = { partner };
