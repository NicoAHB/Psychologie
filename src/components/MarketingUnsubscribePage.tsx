import { useEffect, useState } from "react";
import { LanguageSwitch, useI18n } from "../lib/i18n";
import {
  parseMarketingUnsubscribe,
  unsubscribeMarketing,
} from "../lib/marketingDelivery";
import { Logo, Notice } from "./ui";
export default function MarketingUnsubscribePage({ hash }: { hash: string }) {
  const invitation = parseMarketingUnsubscribe(hash),
    { t, setLanguage } = useI18n();
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    if (invitation) setLanguage(invitation.language);
  }, [hash]);
  async function unsubscribe() {
    if (!invitation) return;
    setBusy(true);
    setError(false);
    try {
      await unsubscribeMarketing(invitation.id, invitation.token);
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="video-guest marketing-page">
      <header>
        <Logo />
        <LanguageSwitch />
      </header>
      <section className="card">
        <h1>{t("marketingUnsubscribeTitle")}</h1>
        <p className="mt-4">{t("marketingUnsubscribeScope")}</p>
        {done ? (
          <Notice>{t("marketingUnsubscribeDone")}</Notice>
        ) : invitation ? (
          <button
            className="btn btn-primary mt-5"
            disabled={busy}
            onClick={() => void unsubscribe()}
          >
            {t(busy ? "working" : "marketingUnsubscribeButton")}
          </button>
        ) : (
          <Notice error>{t("marketingUnsubscribeInvalid")}</Notice>
        )}
        {error && <Notice error>{t("marketingUnsubscribeError")}</Notice>}
      </section>
    </main>
  );
}
