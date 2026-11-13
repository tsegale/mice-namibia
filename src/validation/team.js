"use strict";

const v = require("./common");

const member = v.z.object({
  name: v.trimmed(160, "Name"),
  role: v.optionalText(120, "Role"),
  photo_media_id: v.id("Photo"),
  linkedin_url: v.url("LinkedIn link"),
  consent_confirmed: v.bool,
  status: v.status,
});

module.exports = { member };
