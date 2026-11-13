"use strict";

// Outgoing email. Every caller gets a result instead of an exception, so a
// mail server outage never loses a contact-form submission: the message is
// saved first and its email_status says whether the notification went out
// (Zusammen sent emails fire-and-forget and lost enquiries when SMTP failed).

const nodemailer = require("nodemailer");
const config = require("../config");
const logger = require("../lib/logger");

let transport = null;
let override = null;

function getTransport() {
  if (override) return override;
  if (!config.mail.enabled) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

// Returns { status: "sent" | "skipped" | "failed", error? }.
async function send(message) {
  const t = getTransport();
  if (!t) return { status: "skipped", error: "Email is not set up yet (SMTP_HOST and SMTP_USER are empty)." };
  if (!message.to) return { status: "skipped", error: "No recipient address is set (Admin > Settings > Enquiry emails and MAIL_TO are both empty)." };
  try {
    await t.sendMail({ from: config.mail.from, ...message });
    return { status: "sent" };
  } catch (err) {
    logger.error({ err: { message: err.message, code: err.code } }, "email send failed");
    return { status: "failed", error: String(err.message || "Unknown mail error").slice(0, 250) };
  }
}

async function verify() {
  const t = getTransport();
  if (!t) throw new Error("Email is not set up: set SMTP_HOST, SMTP_USER and SMTP_PASS in .env.");
  if (t.verify) await t.verify();
}

// Tests swap in a fake transport: useTransport({ sendMail: async (m) => ... }).
function useTransport(t) {
  override = t;
}

function close() {
  transport?.close?.();
  transport = null;
}

module.exports = { send, verify, useTransport, close };
