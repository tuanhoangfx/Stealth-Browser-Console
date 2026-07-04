#!/usr/bin/env node
import { runMgmtDbQuery } from "../../scripts/lib/supabase-mgmt-query.mjs";

const ref = "fmnrafpzctuhxjaaomzt";
const check = await runMgmtDbQuery(
  ref,
  `select to_regclass('public.stealth_workflow_catalog')::text as tbl;`,
);
console.log("table:", check);
if (check?.[0]?.tbl) {
  const rows = await runMgmtDbQuery(ref, `select id, name, version from public.stealth_workflow_catalog order by sort_order;`);
  console.log("rows:", rows);
}
await runMgmtDbQuery(ref, `notify pgrst, 'reload schema';`);
console.log("notify pgrst reload schema");
