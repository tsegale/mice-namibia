"use strict";

// npm run seed  -> adds the reviewed site content to an empty (or partly
// filled) database. Never deletes or overwrites; see src/db/seeds/index.js.
// Refuses to touch a production database unless --allow-production is given.

const config = require("../src/config");
const { db, destroy } = require("../src/db/knex");
const { run } = require("../src/db/seeds");

async function main() {
  if (config.isProd && !process.argv.includes("--allow-production")) {
    throw new Error("NODE_ENV is production. Re-run with --allow-production if you really mean to seed this database.");
  }
  const [, pending] = await db().migrate.list();
  if (pending.length) throw new Error('Run "npm run migrate" first.');
  console.log(`Seeding ${config.db.database} on ${config.db.host}...`);
  await run(db(), { log: (line) => console.log(`  ${line}`) });
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => destroy());
