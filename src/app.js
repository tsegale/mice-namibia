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
const { assetVersion } = require("./lib/version");
const { checkHealth } = require("./lib/health");

// One Express app serves everything from one origin: the public site, the
// admin, uploaded images and the admin's JSON endpoints. No CORS anywhere
// (the split API host behind most Zusammen bugs).
function createApp({ sessionStore } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (config.session.trustProxy) app.set("trust proxy", 1);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  Object.assign(app.locals, viewHelpers, {
    C: require("./views/components"),
    siteEnv: config.siteEnv,
    baseUrl: config.baseUrl,
    // ?v= on every CSS/JS link: changes with each deployed commit.
    assetVersion: assetVersion(),
  });

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => /^\/(assets|css|js|uploads|healthz|admin\/(admin\.|icons))/.test(req.url) } }));
  app.use(cspNonce);
  app.use(securityHeaders());

  // For the uptime monitor: registered before the staging password and the
  // session store so it answers without credentials and creates no session.
  // The body says only ok/down/pending: no versions, hostnames or errors.
  app.get("/healthz", async (req, res) => {
    const { ok, body, error } = await checkHealth(db());
    if (error) req.log.warn({ err: { message: error.message, code: error.code } }, "health check failed");
    res.set("Cache-Control", "no-store");
    res.status(ok ? 200 : 503).json(body);
  });

  app.use(stagingGuard);
  app.use(compression());

  // Static files: long cache for images/fonts, one day for CSS/JS (their
  // links carry ?v=<commit>, so a deploy changes the URL). Uploads come
  // from UPLOADS_DIR, outside the code.
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

  // Live figures for the public pages (stats cards, footer, page copy).
  // Set before the routes so the 404 and error pages get them too.
  app.use(async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || req.path.startsWith("/admin")) return next();
    try {
      res.locals.siteCounts = await require("./repositories/site").counts();
    } catch (err) {
      req.log.warn({ err: { message: err.message } }, "site counts unavailable");
    }
    next();
  });

  app.use("/admin", require("./routes/admin"));
  app.use(require("./routes/forms"));
  app.use(require("./routes/public"));
  app.use(require("./middleware/redirects").redirects);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
