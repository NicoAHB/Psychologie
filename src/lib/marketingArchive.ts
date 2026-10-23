import { getCloud } from "./cloud";
import { encryptBytes } from "./workerTasks";
import { newsletterStatus } from "./marketing";
import type { VaultData } from "./types";

const fingerprints = new Map<string, string>(); // Hashes only; never retains message plaintext after locking.
export async function syncMarketingArchive(
  data: VaultData,
  key: CryptoKey,
  vaultId: string,
  active: () => boolean = () => true,
) {
  if (
    !data.settings.marketingUsed &&
    !data.messageTemplates.length &&
    !data.marketingCampaigns.length &&
    !data.newsletters.length
  )
    return;
  const cloud = await getCloud();
  if (!cloud) throw new Error("marketingSetupNeeded");
  const auth = await cloud.auth.getUser();
  if (auth.error || !auth.data.user) throw new Error("authError");
  const owner = auth.data.user.id;
  const groups = [
    { table: "message_templates", rows: data.messageTemplates },
    { table: "marketing_campaigns", rows: data.marketingCampaigns },
    { table: "newsletters", rows: data.newsletters },
  ] as const;
  for (const { table, rows } of groups) {
    for (let at = 0; at < rows.length; at += 10) {
      const batch: Record<string, unknown>[] = [],
        saved: [string, string][] = [];
      for (const row of rows.slice(at, at + 10)) {
        if (!active()) throw new Error("locked");
        const bytes = new TextEncoder().encode(JSON.stringify(row)),
          title = new TextEncoder().encode(
            "name" in row
              ? row.name
              : "title" in row
                ? row.title
                : row.messages[0]?.title || row.messages[0]?.titleUk || "",
          );
        try {
          const hash = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (b) => b.toString(16).padStart(2, "0"),
            ).join(""),
            cacheKey = `${owner}:${vaultId}:${table}:${row.id}`;
          if (fingerprints.get(cacheKey) === hash) continue;
          const context = `praxisraum-marketing-index:v1:${vaultId}:${table}:${row.id}`;
          const [payload, heading] = await Promise.all([
            encryptBytes(key, bytes, `${context}:content`),
            encryptBytes(key, title, `${context}:title`),
          ]);
          const common = {
            owner_id: owner,
            vault_id: vaultId,
            id: row.id,
            created_at: row.createdAt,
          };
          if ("category" in row)
            batch.push({
              ...common,
              title: heading,
              content: payload,
              category: row.category,
            });
          else if ("templateId" in row)
            batch.push({
              ...common,
              name: heading,
              encrypted_payload: payload,
              type: row.type,
              template_id: row.templateId,
              channel: row.channel,
              is_active: row.isActive,
              trigger_days: row.triggerDays,
              target_date:
                row.type === "holiday" ? (row.targetDate ?? null) : null,
            });
          else
            batch.push({
              ...common,
              title: heading,
              content: payload,
              channel: row.channel,
              image_url: row.messages[0]?.image
                ? `private:${row.messages[0].image.blobId}`
                : null,
              recipient_count: Math.max(
                row.recipientCount,
                row.recipients.length,
              ),
              status: newsletterStatus(row),
            });
          saved.push([cacheKey, hash]);
        } finally {
          bytes.fill(0);
          title.fill(0);
        }
      }
      if (batch.length) {
        if (!active()) throw new Error("locked");
        const result = await cloud
          .from(table)
          .upsert(batch, { onConflict: "owner_id,vault_id,id" });
        if (result.error) throw new Error("marketingIndexPending");
        for (const [cacheKey, hash] of saved) fingerprints.set(cacheKey, hash);
      }
    }
    const deleted = Object.keys(data.deleted);
    for (let at = 0; at < deleted.length; at += 100) {
      if (!active()) throw new Error("locked");
      const result = await cloud
        .from(table)
        .delete()
        .eq("vault_id", vaultId)
        .in("id", deleted.slice(at, at + 100));
      if (result.error) throw new Error("marketingIndexPending");
    }
  }
}
