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
  // No host argument: listen on whatever PORT says (a number locally, or a
  // socket path). Under Passenger the call is intercepted and Passenger picks
  // the socket itself, so nothing here may assume a TCP port.
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

  // Passenger (and npm start under a terminal) stop the app with a signal.
  // Stop accepting requests, let in-flight ones finish, close the session
  // pool and the database, then exit. Forced exit after 10 s.
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} received, shutting down`);
    setTimeout(() => {
      logger.error("shutdown took longer than 10 s, exiting anyway");
      process.exit(1);
    }, 10000).unref();
    server.close(async (closeErr) => {
      let code = 0;
      if (closeErr) {
        logger.error({ err: closeErr }, "server close failed");
        code = 1;
      }
      try {
        await app.locals.close();
        await destroy();
      } catch (err) {
        logger.error({ err }, "closing database connections failed");
        code = 1;
      }
      process.exit(code);
    });
    // Keep-alive connections with no request in flight would hold close() open.
    server.closeIdleConnections();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  return server;
}

module.exports = { start };
