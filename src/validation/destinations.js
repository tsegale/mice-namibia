"use strict";

const v = require("./common");

const details = {
  name: v.trimmed(80, "Display name"),
  hook: v.optionalText(255, "Hook"),
  cities: v.optionalText(255, "Towns"),
  photo_media_id: v.id("Photo"),
  photo_alt: v.optionalText(255, "Photo description"),
  is_destination: v.bool,
};

// Editing: iso2 and timezone are fixed once the country exists.
const destination = v.z.object(details);

// Adding: the flag (iso2) and the timezone are chosen once, from lists.
const newDestination = v.z.object({
  ...details,
  iso2: v.z
    .unknown()
    .optional()
    .transform((s) => String(s ?? "").trim().toLowerCase())
    .pipe(v.z.string().regex(/^[a-z]{2}$/, "Choose a country from the flag list.")),
  timezone: v.trimmed(64, "Timezone"),
});

module.exports = { destination, newDestination };
