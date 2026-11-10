"use strict";

const v = require("./common");

const speaker = v.z
  .object({
    name: v.trimmed(160, "Name"),
    role: v.optionalText(120, "Role"),
    organisation: v.optionalText(160, "Organisation"),
    bio: v.nullableText(5000, "Biography"),
    photo_media_id: v.id("Photo"),
    linkedin_url: v.url("LinkedIn link"),
    website_url: v.url("Website"),
    consent_confirmed: v.bool,
    show_on_home: v.bool,
    sort_order: v.int("Display order", { max: 999 }),
    status: v.status,
  });

module.exports = { speaker };
