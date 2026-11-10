"use strict";

const config = require("./config");
const logger = require("./lib/logger");
const { db, destroy } = require("./db/knex");
const { createApp } = require("./app");

// Boot checks before accepting traffic: the database answers and every
// migration has run. A half-migrated database fails loudly at start-up
// instead of throwing on the first page view.
async function start() {
  await db().raw("SELECT 1");
  const [, pending] = await db().migrate.list();
  if (pending.length) {
    const names = pending.map((m) => m.file || m.name || m).join(", ");
    throw new Error(`Database has pending migrations (${names}). Run "npm run migrate" first.`);
  }

  const app = createApp();
  // cPanel/Passenger passes its own socket/port via PORT; locally this is 3000.
  const server = app.listen(config.port, () => {
    logger.info(`MICE site running at ${config.baseUrl} (admin: ${config.baseUrl}/admin)`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.fatal(`Port ${config.port} is already in use. Stop the other server or set PORT in .env.`);
      process.exit(1);
    }
    throw err;
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await app.locals.close();
      await destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  return server;
}

module.exports = { start };
