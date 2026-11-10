"use strict";

// Checks the SMTP settings in .env and sends one test message.
//   npm run test-email              sends to MAIL_TO
//   npm run test-email -- you@x.com sends to that address instead

const config = require("../src/config");
const mailer = require("../src/services/mailer");

async function main() {
  const to = process.argv[2] || config.mail.to;
  if (!to) throw new Error("No recipient: set MAIL_TO in .env or pass an address, e.g. npm run test-email -- you@example.com");
  console.log(`Connecting to ${config.mail.host || "(no SMTP_HOST)"}:${config.mail.port} as ${config.mail.user || "(no SMTP_USER)"} ...`);
  await mailer.verify();
  console.log("Login OK. Sending a test message ...");
  const result = await mailer.send({
    to,
    subject: "[MICE Namibia] Test email",
    text: `This is a test from the MICE Namibia website (${config.siteEnv}, ${config.baseUrl}).\nIf you can read this, contact-form notifications will arrive here.`,
  });
  if (result.status !== "sent") throw new Error(result.error);
  console.log(`Sent to ${to}. Check the inbox (and the spam folder).`);
}

main()
  .catch((err) => {
    console.error(`Email test failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mailer.close());
