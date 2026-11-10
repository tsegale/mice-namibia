"use strict";

const v = require("./common");
const { validatePasswordStrength } = require("../services/auth");

const { z } = v;

const email = v
  .optionalText(500, "Email")
  .transform((s) => s.toLowerCase())
  .pipe(z.string().min(1, "Email address is required.").max(190, "That email address is too long.").pipe(z.email("Enter a valid email address, like name@company.com.")));

const role = z.unknown().pipe(z.enum(["admin", "editor"], { error: "Choose Admin or Editor." }));

// Passwords are never trimmed: spaces are allowed and count.
const rawPassword = z.unknown().optional().transform((p) => (p == null ? "" : String(p)));

const strongPassword = (label) =>
  rawPassword.superRefine((p, ctx) => {
    if (!p) return ctx.addIssue({ code: "custom", message: `${label} is required.` });
    const weak = validatePasswordStrength(p);
    if (weak) ctx.addIssue({ code: "custom", message: `${label} is too weak. ${weak}` });
  });

const profile = z.object({
  name: v.trimmed(120, "Name"),
  email,
});

const passwordChange = z
  .object({
    current_password: rawPassword.refine((p) => p.length > 0, "Enter your current password."),
    new_password: strongPassword("New password"),
    confirm_password: rawPassword,
  })
  .superRefine((d, ctx) => {
    if (d.confirm_password !== d.new_password) ctx.addIssue({ code: "custom", path: ["confirm_password"], message: "The two new passwords do not match." });
    if (d.current_password && d.new_password === d.current_password) ctx.addIssue({ code: "custom", path: ["new_password"], message: "Choose a password that is different from the current one." });
  });

const newUser = z.object({
  name: v.trimmed(120, "Name"),
  email,
  role,
  temporary_password: strongPassword("Temporary password"),
});

const roleChange = z.object({ role });

const resetPassword = z.object({ temporary_password: strongPassword("Temporary password") });

const activeChange = z.object({ is_active: v.bool });

module.exports = { profile, passwordChange, newUser, roleChange, resetPassword, activeChange };
