import { useCallback, useEffect, useRef, useState } from "react";
import { registerBeforeLock } from "./autoLock";
import { cloudConfigured } from "./cloud";
import {
  campaignOccurrence,
  clientMarketingChannels,
  marketingError,
  marketingId,
  templateMessage,
} from "./marketing";
import {
  dispatchNewsletter,
  flushMarketingRevocations,
  loadMarketingCapabilities,
  reconcileMarketing,
  type MarketingCapabilities,
  type NewsletterInput,
} from "./marketingDelivery";
import type { TextKey } from "./i18n";
import type { VaultController } from "./useVault";

/** No server reads birthdays or patient files. Due events are calculated only
 * while this browser has the decrypted vault; closed apps cannot run this hook. */
export function useMarketingAutomation(
  vault: VaultController,
  userId: string | undefined,
  visible: boolean,
) {
  const latest = useRef(vault);
  latest.current = vault;
  const operation = useRef<AbortController | undefined>(undefined),
    mounted = useRef(true),
    checking = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<TextKey>(),
    [capabilities, setCapabilities] = useState<MarketingCapabilities>();
  const refresh = useCallback(async () => {
    if (!latest.current.getData() || latest.current.demo) return;
    if (!userId || !cloudConfigured) {
      setError(!cloudConfigured ? "marketingSetupNeeded" : "authError");
      return;
    }
    try {
      const caps = await loadMarketingCapabilities();
      if (mounted.current && latest.current.getData()) {
        setCapabilities(caps);
        setError(undefined);
        await reconcileMarketing(latest.current);
      }
    } catch (e) {
      if (mounted.current) {
        setCapabilities(undefined);
        setError(marketingError(e));
      }
    }
  }, [userId]);
  const send = useCallback(async (input: NewsletterInput) => {
    if (operation.current) throw new Error("marketingBusy");
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      await dispatchNewsletter(() => latest.current, input, controller.signal);
      if (!controller.signal.aborted) await reconcileMarketing(latest.current);
    } catch (e) {
      if (!controller.signal.aborted && mounted.current)
        setError(marketingError(e));
      throw e;
    } finally {
      if (operation.current === controller) {
        operation.current = undefined;
        if (mounted.current) setBusy(false);
      }
    }
  }, []);
  const runNow = useCallback(async () => {
    const v = latest.current,
      data = v.getData();
    if (
      !data ||
      v.demo ||
      !userId ||
      !navigator.onLine ||
      operation.current ||
      checking.current
    )
      return;
    checking.current = true;
    try {
      await reconcileMarketing(v);
      for (const campaign of data.marketingCampaigns.filter(
        (c) => c.isActive,
      )) {
        if (!latest.current.getData() || operation.current) return;
        const template = data.messageTemplates.find(
          (t) => t.id === campaign.templateId,
        );
        if (!template) continue;
        const groups = new Map<string, string[]>();
        for (const client of data.clients) {
          const date = campaignOccurrence(campaign, client, data);
          if (date) groups.set(date, [...(groups.get(date) ?? []), client.id]);
        }
        for (const [date, clientIds] of groups) {
          const id = await marketingId(`${campaign.id}:${date}`),
            existing = latest.current
              .getData()
              ?.newsletters.find((n) => n.id === id);
          const missing = clientIds.filter((clientId) =>
            clientMarketingChannels(
              latest.current.getData()!.clients.find((c) => c.id === clientId)!,
              campaign.channel,
            ).some(
              (channel) =>
                !existing?.recipients.some(
                  (r) => r.clientId === clientId && r.channel === channel,
                ),
            ),
          );
          if (!missing.length) continue;
          const message = templateMessage(
            template,
            await marketingId(
              JSON.stringify([
                template.title,
                template.content,
                template.titleUk,
                template.contentUk,
                campaign.channel,
              ]),
            ),
          );
          await send({
            id,
            channel: campaign.channel,
            message,
            clientIds: missing,
            campaignId: campaign.id,
            occurrenceOn: date,
          });
        }
      }
    } catch (e) {
      if (mounted.current && latest.current.getData())
        setError(marketingError(e));
    } finally {
      checking.current = false;
    }
  }, [send, userId]);
  const active = !!vault.data?.marketingCampaigns.some((c) => c.isActive);
  useEffect(() => {
    if (visible || active) void refresh();
  }, [visible, active, refresh]);
  useEffect(() => {
    mounted.current = true;
    const stop = async () => {
      operation.current?.abort();
      operation.current = undefined;
      setBusy(false);
    };
    const unregister = registerBeforeLock(stop);
    return () => {
      mounted.current = false;
      operation.current?.abort();
      unregister();
    };
  }, []);
  useEffect(() => {
    if (!vault.data) {
      operation.current?.abort();
      operation.current = undefined;
      setBusy(false);
      setError(undefined);
      setCapabilities(undefined);
    }
  }, [!!vault.data]);
  useEffect(() => {
    if (!vault.data || vault.demo || !userId || !cloudConfigured) return;
    const id = vault.envelope?.vaultId;
    const flush = () => {
      if (id && navigator.onLine)
        void flushMarketingRevocations(id).catch(() => {});
    };
    flush();
    window.addEventListener("online", flush);
    window.addEventListener("praxisraum-marketing-revocations", flush);
    if (active) void runNow();
    const timer = window.setInterval(() => {
      flush();
      if (active) void runNow();
      else if (visible && !operation.current)
        void reconcileMarketing(latest.current).catch(() => {});
    }, 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", flush);
      window.removeEventListener("praxisraum-marketing-revocations", flush);
    };
  }, [
    !!vault.data,
    vault.demo,
    vault.envelope?.vaultId,
    userId,
    active,
    visible,
    runNow,
  ]);
  return { busy, error, capabilities, refresh, send, runNow };
}
export type MarketingController = ReturnType<typeof useMarketingAutomation>;
