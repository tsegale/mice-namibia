"use strict";

// Creates an admin account, or resets the password of an existing one.
//   npm run create-admin
//   npm run create-admin -- --email you@example.com --name "Your Name" --role admin
// The password is always typed (hidden), never passed on the command line,
// so it does not end up in shell history. There is no default admin.

const readline = require("node:readline");
const { db, destroy } = require("../src/db/knex");
const users = require("../src/repositories/users");
const { hashPassword, validatePasswordStrength } = require("../src/services/auth");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else rl.output.write("*");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const email = (arg("email") || (await ask("Email: "))).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That is not a valid email address.");
  const existing = await users.findByEmail(email);
  const name = existing ? existing.name : arg("name") || (await ask("Full name: "));
  const role = existing ? existing.role : arg("role") || "admin";
  if (!["admin", "editor"].includes(role)) throw new Error('Role must be "admin" or "editor".');

  const password = process.env.ADMIN_PASSWORD || (await ask(existing ? "New password: " : "Password: ", { hidden: true }));
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(`Password too weak. ${weak}`);
  if (!process.env.ADMIN_PASSWORD) {
    const again = await ask("Repeat password: ", { hidden: true });
    if (again !== password) throw new Error("The passwords do not match.");
  }

  const passwordHash = await hashPassword(password);
  if (existing) {
    await users.updatePassword(existing.id, passwordHash);
    const signedOut = await users.deleteSessions(existing.id);
    console.log(`Password updated for ${email}.${signedOut ? ` Signed out ${signedOut} session${signedOut === 1 ? "" : "s"}.` : ""}`);
  } else {
    await users.create({ name, email, passwordHash, role });
    console.log(`Created ${role} account for ${name} <${email}>.`);
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => destroy().then(() => db && undefined));
