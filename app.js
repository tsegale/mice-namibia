"use strict";

// Entry point (cPanel "Setup Node.js App" startup file, and `npm start`).
// CommonJS on purpose: Passenger loads the startup file with require().

require("./src/server")
  .start()
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
