"use strict";

// Contact-form submissions: saved first, then the team is emailed. If the
// email fails the enquiry is still in the admin inbox, marked "email failed",
// and can be re-sent from there.

const config = require("../config");
const { db } = require("../db/knex");
const mailer = require("./mailer");
const { escapeHtml } = require("../lib/text");

const DETAIL_LABELS = [
  ["organisation", "Organisation"],
  ["event_type", "Type of event"],
  ["destination", "Destination"],
  ["dates", "Preferred dates"],
  ["delegates", "Delegates"],
  ["services", "Services"],
];

function parseDetails(row) {
  try {
    return row.details ? JSON.parse(row.details) : {};
  } catch {
    return {};
  }
}

// The proposal fields as label/value pairs, skipping empty ones.
function detailList(row) {
  const d = parseDetails(row);
  return DETAIL_LABELS.map(([key, label]) => [label, Array.isArray(d[key]) ? d[key].join(", ") : d[key]]).filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function subjectFor(data) {
  if (data.enquiry_type !== "proposal") return "General enquiry";
  return `Proposal request${data.event_type ? `: ${data.event_type}` : ""}`;
}

async function create(data, req) {
  const proposal = data.enquiry_type === "proposal";
  const details = { first_name: data.first_name, last_name: data.last_name };
  if (proposal) {
    Object.assign(details, {
      organisation: data.organisation || null,
      event_type: data.event_type || null,
      destination: data.destination || null,
      dates: data.dates || null,
      delegates: data.delegates,
      services: data.services,
    });
  }
  const row = {
    type: proposal ? "proposal" : "general",
    name: `${data.first_name} ${data.last_name}`.slice(0, 160),
    email: data.email,
    phone: data.phone || null,
    company: proposal ? data.organisation || null : null,
    subject: subjectFor(data),
    message: data.message || "",
    details: JSON.stringify(details),
    ip: req.ip || null,
    user_agent: String(req.get("user-agent") || "").slice(0, 255) || null,
  };
  const [id] = await db()("submissions").insert(row);
  return db()("submissions").where({ id }).first();
}

function buildEmail(row) {
  const adminUrl = `${config.baseUrl}/admin/submissions?open=${row.id}`;
  const lines = [
    ["Name", row.name],
    ["Email", row.email],
    ["Phone", row.phone],
    ...detailList(row),
  ].filter(([, v]) => v);
  const text = [
    `${row.subject} from ${row.name}`,
    "",
    ...lines.map(([k, v]) => `${k}: ${v}`),
    "",
    "Message:",
    row.message || "(no message)",
    "",
    `Reply to this email to answer ${row.name} directly.`,
    `Open it in the admin panel: ${adminUrl}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1D3161;font-size:15px;line-height:1.5">
<h2 style="margin:0 0 12px;font-size:20px">${escapeHtml(row.subject)} from ${escapeHtml(row.name)}</h2>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
${lines.map(([k, v]) => `<tr><td style="color:#6B7280;vertical-align:top;padding-right:16px">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("\n")}
</table>
<h3 style="margin:20px 0 6px;font-size:16px">Message</h3>
<p style="white-space:pre-wrap;margin:0">${escapeHtml(row.message || "(no message)")}</p>
<p style="margin:24px 0 0;color:#6B7280;font-size:13px">Reply to this email to answer ${escapeHtml(row.name)} directly, or <a href="${escapeHtml(adminUrl)}" style="color:#B5560C">open it in the admin panel</a>.</p>
</body></html>`;
  return {
    to: config.mail.to,
    replyTo: { name: row.name, address: row.email },
    subject: `[MICE Namibia] ${row.subject} from ${row.name}`,
    text,
    html,
  };
}

// Sends the notification and records the outcome on the submission.
async function notifyTeam(row) {
  const result = await mailer.send(buildEmail(row));
  await db()("submissions")
    .where({ id: row.id })
    .update({ email_status: result.status, email_error: result.error ? result.error.slice(0, 255) : null });
  return result;
}

module.exports = { create, notifyTeam, buildEmail, detailList, parseDetails };
