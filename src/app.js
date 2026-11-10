"use strict";

const path = require("node:path");
const express = require("express");
const session = require("express-session");
const compression = require("compression");
const pinoHttp = require("pino-http");
const MySQLStore = require("express-mysql-session")(session);

const config = require("./config");
const logger = require("./lib/logger");
const { db } = require("./db/knex");
const { cspNonce, securityHeaders, stagingGuard } = require("./middleware/security");
const { notFound, errorHandler } = require("./middleware/errors");
const viewHelpers = require("./lib/view-helpers");

// One Express app serves everything from one origin: the public site, the
// admin, uploaded images and the admin's JSON endpoints. No CORS anywhere
// (the split API host behind most Zusammen bugs).
function createApp({ sessionStore } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (config.session.trustProxy) app.set("trust proxy", 1);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  Object.assign(app.locals, viewHelpers, { siteEnv: config.siteEnv, baseUrl: config.baseUrl });

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => /^\/(assets|css|js|uploads|admin\/(admin\.|icons))/.test(req.url) } }));
  app.use(cspNonce);
  app.use(securityHeaders());
  app.use(stagingGuard);
  app.use(compression());

  // Static files: long cache for images/fonts, shorter for CSS/JS (no
  // fingerprinting yet). Uploads come from UPLOADS_DIR, outside the code.
  const pub = path.join(config.root, "public");
  app.use(express.static(pub, { index: false, redirect: false, maxAge: config.isProd ? "1d" : 0 }));
  app.use("/uploads", express.static(config.uploads.dir, { index: false, maxAge: config.isProd ? "30d" : 0, fallthrough: false }));

  app.use(express.urlencoded({ extended: false, limit: "200kb" }));
  app.use(express.json({ limit: "2mb" }));

  let sessionPool = null;
  const store =
    sessionStore ||
    new MySQLStore(
      {
        createDatabaseTable: false,
        clearExpired: true,
        checkExpirationInterval: 15 * 60 * 1000,
        schema: { tableName: "sessions", columnNames: { session_id: "session_id", expires: "expires", data: "data" } },
      },
      (sessionPool = require("mysql2/promise").createPool({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        charset: "utf8mb4",
        connectionLimit: 3,
      }))
    );

  // Closed on shutdown (and after tests) so no connection keeps Node alive.
  app.locals.close = async () => {
    if (!sessionStore) {
      await store.close().catch(() => {});
      await sessionPool?.end().catch(() => {});
    }
  };
  app.use(
    session({
      name: "mice.sid",
      secret: config.session.secret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: config.session.trustProxy,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.session.secureCookie,
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  app.get("/healthz", async (req, res) => {
    try {
      await db().raw("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "database unavailable" });
    }
  });

  app.use("/admin", require("./routes/admin"));
  app.use(require("./routes/public"));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
