"use strict";

// Entry point (cPanel "Setup Node.js App" startup file, and `npm start`).
// CommonJS on purpose: Passenger loads the startup file with require().

let server;
try {
  server = require("./src/server");
} catch (err) {
  // A bad .env stops the config module (and so the logger) from loading.
  console.error(err.message || err);
  process.exit(1);
}

server.start().catch((err) => {
  require("./src/lib/logger").fatal({ err: { message: err.message, code: err.code } }, "start-up failed");
  process.exit(1);
});
