"use strict";

// Checks the SMTP settings in .env and sends one test message.
//   npm run test-email              sends to the enquiry recipients (Admin >
//                                   Settings > Enquiry emails, else MAIL_TO)
//   npm run test-email -- you@x.com sends to that address instead

const config = require("../src/config");
const mailer = require("../src/services/mailer");
const settings = require("../src/services/settings");
const { recipients } = require("../src/services/enquiries");
const { destroy } = require("../src/db/knex");

async function main() {
  const to = process.argv[2] || (await recipients());
  if (!to) throw new Error("No recipient: add one under Admin > Settings > Enquiry emails, set MAIL_TO in .env, or pass an address, e.g. npm run test-email -- you@example.com");
  const siteName = (await settings.get("seo")).site_name;
  console.log(`Connecting to ${config.mail.host || "(no SMTP_HOST)"}:${config.mail.port} as ${config.mail.user || "(no SMTP_USER)"} ...`);
  await mailer.verify();
  console.log("Login OK. Sending a test message ...");
  const result = await mailer.send({
    to,
    subject: `[${siteName}] Test email`,
    text: `This is a test from the ${siteName} website (${config.siteEnv}, ${config.baseUrl}).\nIf you can read this, contact-form notifications will arrive here.`,
  });
  if (result.status !== "sent") throw new Error(result.error);
  console.log(`Sent to ${to}. Check the inbox (and the spam folder).`);
}

main()
  .catch((err) => {
    console.error(`Email test failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    mailer.close();
    return destroy();
  });
