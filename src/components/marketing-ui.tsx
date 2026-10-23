import { useEffect, useState, useId } from "react";
import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import { useI18n } from "../lib/i18n";
import type {
  NewsletterRecipient,
  NewsletterStatus,
  MarketingChannelSelection,
} from "../lib/types";
import type { MarketingController } from "../lib/useMarketingAutomation";
import { Modal, Notice } from "./ui";
import {
  marketingError,
  marketingChannels,
  marketingChannelText,
  toggleMarketingChannel,
} from "../lib/marketing";

export function MarketingStatus({
  status,
}: {
  status: NewsletterStatus | NewsletterRecipient["status"];
}) {
  const { t } = useI18n();
  const Icon =
    status === "sent"
      ? CheckCircle2
      : ["failed", "unknown", "partial"].includes(status)
        ? CircleAlert
        : Clock3;
  return (
    <span className={`marketing-status marketing-status-${status}`}>
      <Icon size={15} aria-hidden="true" />
      {t(`marketingStatus_${status}`)}
    </span>
  );
}
export function MarketingSetup({
  marketing,
  demo,
}: {
  marketing: MarketingController;
  demo: boolean;
}) {
  const { t } = useI18n();
  if (demo) return <Notice>{t("marketingDemo")}</Notice>;
  return (
    <>
      {marketing.error && <Notice error>{t(marketing.error)}</Notice>}
      {!marketing.capabilities?.ready && (
        <div className="card flex flex-wrap items-center justify-between gap-4">
          <p className="hint">{t("marketingSetupHint")}</p>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void marketing.refresh()}
          >
            {t("marketingCheckSetup")}
          </button>
        </div>
      )}
    </>
  );
}
export function MarketingImagePreview({ blob }: { blob: Blob }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url ? (
    <img className="marketing-image" src={url} alt={t("marketingImage")} />
  ) : null;
}
export function MarketingConfirm({
  title,
  text,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ReturnType<typeof marketingError>>();
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="pre-line">{text}</p>
      {error && <Notice error>{t(error)}</Notice>}
      <div className="form-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={onClose}>
          {t("cancel")}
        </button>
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm().then(onClose, (e) => {
              setError(marketingError(e));
              setBusy(false);
            });
          }}
        >
          {t(busy ? "working" : "delete")}
        </button>
      </div>
    </Modal>
  );
}

/** Two independent choices, including an explicit way to clear both. */
export function MarketingChannelPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: MarketingChannelSelection;
  onChange: (value: MarketingChannelSelection) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n(),
    id = useId();
  return (
    <fieldset
      className="marketing-channel mb-5"
      aria-describedby={`${id}-hint`}
    >
      <legend>{t("marketingChannel")}</legend>
      <div className="button-row flex-wrap">
        {(["email", "telegram"] as const).map((channel) => (
          <label key={channel} className="check-label">
            <input
              type="checkbox"
              checked={marketingChannels(value).includes(channel)}
              disabled={disabled}
              onChange={() => onChange(toggleMarketingChannel(value, channel))}
            />
            <span>{t(marketingChannelText(channel))}</span>
          </label>
        ))}
        <button
          type="button"
          className="text-link"
          disabled={disabled || value === "none"}
          onClick={() => onChange("none")}
        >
          {t("marketingNoMessages")}
        </button>
      </div>
      <p className="hint" id={`${id}-hint`}>
        {t("marketingChannelHint")}
      </p>
      {value === "none" && (
        <p className="hint mt-2" role="status">
          {t("marketingNoChannels")}
        </p>
      )}
    </fieldset>
  );
}
