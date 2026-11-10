"use strict";

// The two public forms. Field names are the same in the HTML, here and in the
// database columns/details JSON (Zusammen's forms sent one set of names and
// the server read another, so some fields were silently dropped).

const v = require("./common");

const { z } = v;
const str = (x) => (x == null ? "" : String(x).trim());

const EVENT_TYPES = ["Meeting", "Incentive trip", "Conference", "Exhibition or trade show", "Other"];
const DESTINATIONS = ["Namibia", "Botswana", "South Africa", "Zambia", "Zimbabwe", "Kenya", "Tanzania", "Uganda", "Rwanda"];
const SERVICES = [
  "Meeting Planning",
  "Incentive Travel",
  "Conference Management",
  "Exhibitions and Trade Shows",
  "Corporate Travel Management",
  "Event Logistics and Coordination",
  "Destination Management Services",
  "Accommodation and Venue Booking",
  "Transportation Services",
  "Post-Event Evaluation",
];

const email = v.z
  .unknown()
  .optional()
  .transform((x) => str(x).toLowerCase())
  .pipe(z.string().min(1, "Email address is required.").max(190, "That email address is too long.").pipe(z.email("Enter a valid email address, like name@company.com.")));

const phone = v.z
  .unknown()
  .optional()
  .transform(str)
  .pipe(
    z
      .string()
      .min(1, "Phone number is required.")
      .max(40, "That phone number is too long.")
      .regex(/^\+?[0-9 ()./-]+$/, "Use only numbers, spaces and + ( ) - in the phone number.")
      .refine((s) => s.replace(/\D/g, "").length >= 6, "That phone number looks too short.")
  );

const oneOf = (list, message) =>
  v.z
    .unknown()
    .optional()
    .transform(str)
    .refine((s) => s === "" || list.includes(s), message);

const contact = z
  .object({
    enquiry_type: v.z
      .unknown()
      .optional()
      .transform((x) => (str(x) === "proposal" ? "proposal" : "general")),
    first_name: v.trimmed(80, "First name"),
    last_name: v.trimmed(80, "Last name"),
    email,
    phone,
    organisation: v.optionalText(160, "Organisation"),
    event_type: oneOf(EVENT_TYPES, "Choose the type of event."),
    destination: oneOf(DESTINATIONS, "Choose a destination from the list."),
    dates: v.optionalText(120, "Preferred dates"),
    delegates: v.z
      .unknown()
      .optional()
      .transform((x) => (str(x) === "" ? null : Number(x)))
      .refine((n) => n === null || (Number.isInteger(n) && n >= 1 && n <= 100000), "Enter the number of delegates as a whole number."),
    services: v.z
      .unknown()
      .optional()
      .transform((a) => [...new Set((Array.isArray(a) ? a : a == null || a === "" ? [] : [a]).map(str))].filter((s) => SERVICES.includes(s))),
    message: v.optionalText(5000, "Message"),
  })
  .superRefine((d, ctx) => {
    if (d.enquiry_type === "proposal" && !d.event_type) ctx.addIssue({ code: "custom", path: ["event_type"], message: "Choose the type of event." });
  });

const newsletter = z.object({ email });

module.exports = { contact, newsletter, EVENT_TYPES, DESTINATIONS, SERVICES };
