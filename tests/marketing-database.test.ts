import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { uid } from "../src/lib/types";
const db = new PGlite(),
  owner = uid(),
  other = uid(),
  consent = uid(),
  token = "A".repeat(43),
  hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join(""),
  target = "b".repeat(64),
  newsletter = uid(),
  message = uid(),
  delivery = uid();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated,service_role;`,
);
const migration = await readFile(
  new URL("../supabase/marketing.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
async function login(user: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${role}`);
}
async function claim(
  id = delivery,
  c = consent,
  granted = new Date(Date.now() - 60000).toISOString(),
) {
  return (
    await db.query<{
      r: { claimed: boolean; status: string; errorCode?: string };
    }>(
      "select public.begin_marketing_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9) as r",
      [owner, id, "email", c, hash, target, newsletter, message, granted],
    )
  ).rows[0].r;
}
test("marketing SQL is repeatable; ciphertext projections enforce owner RLS and reject plaintext payloads", async () => {
  await db.exec(migration);
  await login(owner);
  const packet = { iv: "A".repeat(16), ciphertext: "A".repeat(24) };
  await assert.rejects(
    () =>
      db.query(
        "insert into message_templates values($1,$2,$3,$4,$5,$6,now())",
        [owner, uid(), uid(), {}, {}, "info"],
      ),
    /check constraint/,
  );
  await db.query(
    "insert into message_templates values($1,$2,$3,$4,$5,$6,now())",
    [owner, uid(), uid(), packet, packet, "info"],
  );
  assert.equal(
    (await db.query("select * from message_templates")).rows.length,
    1,
  );
  await login(other);
  assert.equal(
    (await db.query("select * from message_templates")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into message_templates values($1,$2,$3,$4,$5,$6,now())",
        [owner, uid(), uid(), packet, packet, "info"],
      ),
    /row-level security/,
  );
  await login("", "anon");
  await assert.rejects(() => claim(), /permission denied/);
  await login(owner);
  await assert.rejects(() => claim(), /permission denied/);
  await assert.rejects(
    () =>
      db.query("insert into marketing_consents(id,owner_id) values($1,$2)", [
        uid(),
        owner,
      ]),
    /permission denied/,
  );
});
test("durable claims prevent duplicates and preserve provider acceptance across device requests", async () => {
  await login("", "service_role");
  assert.equal((await claim()).claimed, true);
  assert.equal((await claim()).claimed, false);
  await db.query(
    "select finish_marketing_delivery($1,$2,'sent','provider-123',null)",
    [owner, delivery],
  );
  const again = await claim();
  assert.equal(again.claimed, false);
  assert.equal(again.status, "sent");
});
test("a stale in-flight claim becomes uncertain and never reusable", async () => {
  await login("", "service_role");
  const id = uid();
  await claim(id);
  await db.exec("reset role");
  await db.query(
    "update marketing_delivery_receipts set created_at=now()-interval '6 minutes' where id=$1",
    [id],
  );
  await login("", "service_role");
  assert.equal((await claim(id)).status, "unknown");
  assert.equal((await claim(id)).claimed, false);
});
test("anonymous opt-out validates secret, revokes same-destination grants and blocks older offline grants", async () => {
  await login("", "service_role");
  const second = uid();
  await claim(uid(), second);
  await login("", "anon");
  assert.equal(
    (
      await db.query<{ r: boolean }>(
        "select unsubscribe_marketing($1,$2) as r",
        [consent, "B".repeat(43)],
      )
    ).rows[0].r,
    false,
  );
  assert.equal(
    (
      await db.query<{ r: boolean }>(
        "select unsubscribe_marketing($1,$2) as r",
        [consent, token],
      )
    ).rows[0].r,
    true,
  );
  await assert.rejects(
    () => db.query("select * from marketing_consents"),
    /permission denied/,
  );
  await login("", "service_role");
  assert.equal(
    (await claim(uid(), second)).errorCode,
    "marketingConsentMissing",
  );
  assert.equal(
    (await claim(uid(), uid())).errorCode,
    "marketingConsentMissing",
  );
  // A new explicit opt-in made after revocation is allowed; no old grant is reactivated.
  await db.exec("reset role");
  await db.query(
    "update marketing_consents set revoked_at=now()-interval '1 minute'",
  );
  await login("", "service_role");
  assert.equal(
    (await claim(uid(), uid(), new Date().toISOString())).claimed,
    true,
  );
});
test("owner revocation before the first send blocks that nonce; another owner cannot alter it", async () => {
  const c = uid();
  await login(owner);
  await db.query("select revoke_marketing_consent($1)", [c]);
  await login(other);
  await db.query("select revoke_marketing_consent($1)", [c]);
  await login("", "service_role");
  assert.equal((await claim(uid(), c)).errorCode, "marketingConsentMissing");
});

test("the shared free-tier daily budget is enforced before claiming more provider work", async () => {
  await db.exec("reset role");
  await db.query(
    `insert into marketing_delivery_receipts(id,owner_id,consent_id,newsletter_id,message_id,channel,status) select gen_random_uuid(),$1,$2,$3,$4,'email','failed' from generate_series(1,100)`,
    [owner, consent, newsletter, message],
  );
  await login("", "service_role");
  const r = await claim(uid(), uid(), new Date().toISOString());
  assert.equal(r.claimed, false);
  assert.equal(r.errorCode, "marketingDailyLimit");
});

test("encrypted campaign/newsletter projections accept both channels and an inactive campaign may select neither", async () => {
  await login(owner);
  const packet = { iv: "A".repeat(16), ciphertext: "A".repeat(24) };
  for (const channel of ["both", "none"])
    await db.query(
      "insert into marketing_campaigns(owner_id,vault_id,id,name,type,template_id,channel,created_at,encrypted_payload) values($1,$2,$3,$4,'birthday',$5,$6,now(),$4)",
      [owner, uid(), uid(), packet, uid(), channel],
    );
  await db.query(
    "insert into newsletters(owner_id,vault_id,id,title,content,channel,recipient_count,status,created_at) values($1,$2,$3,$4,$4,'both',1,'sent',now())",
    [owner, uid(), uid(), packet],
  );
  assert.equal(
    (await db.query("select * from marketing_campaigns")).rows.length,
    2,
  );
});

test("opting out of email leaves the independent Telegram permission active", async () => {
  await db.exec("reset role");
  const emailConsent = uid(),
    telegramConsent = uid();
  await db.query(
    "insert into marketing_consents(id,owner_id,channel,token_hash,target_hash) values($1,$3,'email',$4,$5),($2,$3,'telegram',$4,$5)",
    [emailConsent, telegramConsent, owner, hash, "c".repeat(64)],
  );
  await login("", "anon");
  assert.equal(
    (
      await db.query<{ r: boolean }>(
        "select unsubscribe_marketing($1,$2) as r",
        [emailConsent, token],
      )
    ).rows[0].r,
    true,
  );
  await db.exec("reset role");
  const rows = (
    await db.query<{ id: string; revoked_at: string | null }>(
      "select id,revoked_at from marketing_consents where id in ($1,$2)",
      [emailConsent, telegramConsent],
    )
  ).rows;
  assert.ok(rows.find((r) => r.id === emailConsent)!.revoked_at);
  assert.equal(rows.find((r) => r.id === telegramConsent)!.revoked_at, null);
});
