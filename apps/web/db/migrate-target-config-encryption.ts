import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { encryptJson } from "../api/autorotate/crypto";
import { targets } from "./schema";

// One-time backfill for the P1 fix "Encrypt target configJson at rest"
// (board b052d650).  Before this migration, targets.configJson stored
// Infisical clientSecret values and webhook Authorization headers as
// plaintext JSON.  App code now writes only the AES-256-GCM encrypted
// targets.configEnc column and always nulls configJson on write (see
// engine.ts readTargetConfig, routers/autorotate.ts, db/seed.ts) — this
// script closes the gap for rows that were written before that change
// shipped.
//
// Idempotent and safe to run repeatedly or concurrently with the app:
//   - a row with configEnc already set and configJson already null is left
//     alone (nothing to do)
//   - a row with leftover plaintext configJson is encrypted into configEnc
//     and configJson is set to null in the same UPDATE
//   - requires AUTOROTATE_ENC_KEY to be set to the same key the app uses,
//     the same way `npm run db:seed` does
//
// Run once per environment after deploying this change:
//   npm run db:migrate-target-encryption
//
// configJson stays in the schema as a deprecated, always-null-after-this
// column so a rolling deploy (old app code instances still reading it
// during the rollout) does not break; it can be dropped from schema.ts in a
// follow-up once every environment has run this script.
async function main() {
  const db = getDb();
  const rows = await db
    .select({ id: targets.id, configJson: targets.configJson, configEnc: targets.configEnc })
    .from(targets)
    .where(isNotNull(targets.configJson));

  if (rows.length === 0) {
    console.log("No targets with plaintext configJson — nothing to migrate.");
    return;
  }

  console.log(`Found ${rows.length} target(s) with plaintext configJson. Encrypting…`);
  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.configEnc) {
      // Already has an encrypted value from a newer write — just clear the
      // stale plaintext left behind by an older app version.
      await db.update(targets).set({ configJson: null }).where(eq(targets.id, row.id));
      skipped++;
      continue;
    }
    const configEnc = encryptJson(row.configJson ?? {});
    await db
      .update(targets)
      .set({ configEnc, configJson: null })
      .where(eq(targets.id, row.id));
    migrated++;
  }

  console.log(
    `Done. Encrypted ${migrated} row(s); cleared stale plaintext on ${skipped} already-encrypted row(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
