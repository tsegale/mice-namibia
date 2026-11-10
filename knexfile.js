"use strict";

// Used by the knex CLI (npm run migrate). The app builds the same config in
// src/db/knex.js, so both always point at the same database.
const { knexConfig } = require("./src/db/knex");

module.exports = knexConfig();
