"use strict";

const path = require("node:path");
const config = require("../config");

// MySQL/MariaDB via mysql2 (pure JavaScript, nothing to compile on the host).
// Dates are stored and read as UTC; display code converts to each conference's
// own IANA timezone. TINYINT(1) columns come back as real booleans so no route
// has to remember to wrap them in Boolean() (a recurring Zusammen bug source).
function knexConfig(db = config.db) {
  return {
    client: "mysql2",
    connection: {
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      charset: "utf8mb4",
      timezone: "Z",
      dateStrings: false,
      typeCast(field, next) {
        if (field.type === "TINY" && field.length === 1) {
          const v = field.string();
          return v === null ? null : v === "1";
        }
        return next();
      },
    },
    pool: { min: 0, max: 10 },
    migrations: {
      directory: path.join(__dirname, "migrations"),
      tableName: "knex_migrations",
    },
  };
}

let instance;
function db() {
  if (!instance) instance = require("knex")(knexConfig());
  return instance;
}

async function destroy() {
  if (instance) {
    await instance.destroy();
    instance = undefined;
  }
}

module.exports = { db, destroy, knexConfig };
