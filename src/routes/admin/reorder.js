"use strict";

// PATCH /admin/<module>/reorder, shared by every sortable admin list.
//
// The body is the new order as an array of ids: either the array itself or
// { ids: [...] }. It must be exactly the rows of one list (or of one group,
// when the list is grouped), each once. Anything else is refused, which is
// also what stops ids from another module being saved here: they are either
// missing from this table, belong to another group, or leave a row out.
// The new positions are written in one transaction.

const { db } = require("../../db/knex");
const { audit } = require("../../repositories/audit");
const { z, parse, ValidationError } = require("../../validation/common");

const MAX_ROWS = 2000;

const idsSchema = z.object({
  ids: z
    .array(z.coerce.number().int().positive(), { error: "Send the new order as a list of ids." })
    .min(1, "Send the new order as a list of ids.")
    .max(MAX_ROWS, `A list can hold at most ${MAX_ROWS} rows.`)
    .refine((ids) => new Set(ids).size === ids.length, "Each row can only appear once."),
});

const STALE = "This list has changed since the page was opened. Reload the page and try again.";

function reorderHandler({ table, entity, label, scope = null }) {
  return async (req, res, next) => {
    try {
      const { ids } = parse(idsSchema, Array.isArray(req.body) ? { ids: req.body } : req.body);
      await db().transaction(async (trx) => {
        const found = await trx(table).whereIn("id", ids).select(scope ? ["id", scope] : ["id"]);
        if (found.length !== ids.length) throw new ValidationError({ ids: STALE }, STALE);

        let list = trx(table);
        if (scope) {
          const groups = new Set(found.map((r) => r[scope]));
          if (groups.size !== 1) throw new ValidationError({ ids: "Rows can only be moved within their own group." }, "Rows can only be moved within their own group.");
          const [value] = groups;
          list = value === null ? list.whereNull(scope) : list.where(scope, value);
        }
        const all = await list.pluck("id");
        if (all.length !== ids.length) throw new ValidationError({ ids: STALE }, STALE);

        for (const [i, id] of ids.entries()) await trx(table).where({ id }).update({ sort_order: i });
      });
      await audit(req, { action: "reorder", entity, summary: `changed the order of ${label}` });
      res.json({ ok: true, message: "Order saved" });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { reorderHandler };
