import { useState, type FormEvent } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { validDay } from "../lib/invoice";
import { useI18n, type TextKey } from "../lib/i18n";
import {
  marketingError,
  marketingChannels,
  marketingChannelText,
  templateMessage,
  validateMarketingMessage,
} from "../lib/marketing";
import { uid, type MarketingCampaign, type VaultData } from "../lib/types";
import type { VaultController } from "../lib/useVault";
import type { MarketingController } from "../lib/useMarketingAutomation";
import { Empty, Field, Modal, Notice, PageHeading } from "./ui";
import {
  MarketingChannelPicker,
  MarketingConfirm,
  MarketingSetup,
} from "./marketing-ui";

export function validateCampaign(campaign: MarketingCampaign, data: VaultData) {
  const template = data.messageTemplates.find(
    (t) => t.id === campaign.templateId,
  );
  if (
    !template ||
    !campaign.name.trim() ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(campaign.sendAt) ||
    !Number.isInteger(campaign.triggerDays) ||
    campaign.triggerDays < 0 ||
    campaign.triggerDays > 365 ||
    (campaign.type === "holiday" &&
      (!campaign.targetDate || !validDay(campaign.targetDate)))
  )
    throw new Error("required");
  if (campaign.isActive && !marketingChannels(campaign.channel).length)
    throw new Error("marketingChooseChannel");
  if (campaign.isActive)
    validateMarketingMessage(templateMessage(template), campaign.channel);
  if (
    campaign.isActive &&
    ((campaign.language !== "uk" && !template.content.trim()) ||
      (campaign.language !== "de" && !template.contentUk?.trim()))
  )
    throw new Error("marketingTranslationMissing");
}
export function MarketingCampaigns({
  vault,
  marketing,
  onTemplates,
  onArchive,
}: {
  vault: VaultController;
  marketing: MarketingController;
  onTemplates: () => void;
  onArchive: () => void;
}) {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState<MarketingCampaign>(),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState<MarketingCampaign>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<TextKey>(),
    [limit, setLimit] = useState(30);
  const campaigns = vault.data!.marketingCampaigns;
  async function toggle(campaign: MarketingCampaign) {
    setBusy(true);
    setError(undefined);
    try {
      const next = { ...campaign, isActive: !campaign.isActive };
      validateCampaign(next, vault.getData()!);
      await vault.update((data) => {
        const row = data.marketingCampaigns.find((c) => c.id === campaign.id);
        if (row) row.isActive = next.isActive;
      });
    } catch (e) {
      setError(marketingError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="marketing-page space-y-6">
      <PageHeading
        title={t("marketingCampaigns")}
        subtitle={t("marketingCampaignsSubtitle")}
        action={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            {t("marketingNewCampaign")}
          </button>
        }
      />
      <MarketingSetup marketing={marketing} demo={vault.demo} />
      <Notice>{t("marketingOpenVaultAutomation")}</Notice>
      <div className="button-row flex-wrap">
        <button
          className="btn btn-secondary"
          disabled={marketing.busy || vault.demo}
          onClick={() => void marketing.runNow()}
        >
          <CalendarClock size={17} />
          {t(marketing.busy ? "working" : "marketingCheckDue")}
        </button>
        <button className="btn btn-secondary" onClick={onArchive}>
          {t("marketingOpenArchive")}
        </button>
      </div>
      <section className="card">
        {campaigns.length ? (
          <ul className="marketing-list">
            {campaigns.slice(0, limit).map((campaign) => {
              const template = vault.data!.messageTemplates.find(
                (t) => t.id === campaign.templateId,
              );
              return (
                <li
                  key={campaign.id}
                  className="flex flex-wrap items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words">{campaign.name}</h2>
                    <p className="hint mt-1">
                      {t(`marketingType_${campaign.type}`)} ·{" "}
                      {t(marketingChannelText(campaign.channel))} ·{" "}
                      {campaign.sendAt}
                    </p>
                    <p className="hint mt-2">
                      {t("marketingTemplate")}:{" "}
                      {template?.title ?? t("marketingTemplateMissing")}
                    </p>
                    <p className="hint">
                      {t(
                        campaign.language === "all"
                          ? "marketingAudienceAll"
                          : campaign.language === "uk"
                            ? "marketingAudienceUk"
                            : "marketingAudienceDe",
                      )}
                    </p>
                  </div>
                  <div className="button-row flex-wrap">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={campaign.isActive}
                        disabled={busy || campaign.channel === "none"}
                        aria-label={`${t("marketingCampaignActive")}: ${campaign.name}`}
                        onChange={() => void toggle(campaign)}
                      />
                      <span>
                        {t(
                          campaign.isActive
                            ? "marketingActive"
                            : "marketingInactive",
                        )}
                      </span>
                    </label>
                    <button
                      className="icon-btn"
                      disabled={busy}
                      aria-label={`${t("marketingEditCampaign")}: ${campaign.name}`}
                      onClick={() => setEditing(campaign)}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      className="icon-btn danger"
                      disabled={busy}
                      aria-label={`${t("marketingDeleteCampaign")}: ${campaign.name}`}
                      onClick={() => setDeleting(campaign)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon={<CalendarClock size={30} />}
            title={t("marketingNoCampaigns")}
            text={t("marketingNoCampaignsHint")}
          />
        )}
        {campaigns.length > limit && (
          <button className="text-link" onClick={() => setLimit((n) => n + 30)}>
            {t("followUpShowMore")}
          </button>
        )}
      </section>
      {deleting && (
        <MarketingConfirm
          title={t("marketingDeleteCampaign")}
          text={`${deleting.name}\n\n${t("marketingDeleteCampaignConfirm")}`}
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            vault.update((data) => {
              data.marketingCampaigns = data.marketingCampaigns.filter(
                (c) => c.id !== deleting.id,
              );
            })
          }
        />
      )}
      {error && <Notice error>{t(error)}</Notice>}
      {(creating || editing) && (
        <CampaignEditor
          vault={vault}
          campaign={editing}
          onClose={() => {
            setCreating(false);
            setEditing(undefined);
          }}
          onTemplates={onTemplates}
        />
      )}
    </div>
  );
}
function CampaignEditor({
  vault,
  campaign,
  onClose,
  onTemplates,
}: {
  vault: VaultController;
  campaign?: MarketingCampaign;
  onClose: () => void;
  onTemplates: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<MarketingCampaign>(
      () =>
        campaign ?? {
          id: uid(),
          name: t("marketingType_birthday"),
          type: "birthday",
          templateId: "",
          channel: "email",
          isActive: false,
          triggerDays: 1,
          welcomeFrom: "created",
          repeatYearly: true,
          sendAt: "09:00",
          language: "all",
          createdAt: new Date().toISOString(),
        },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<TextKey>();
  const patch = (next: Partial<MarketingCampaign>) =>
    setValue((old) => ({ ...old, ...next }));
  const template = vault.data!.messageTemplates.find(
    (t) => t.id === value.templateId,
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      validateCampaign(value, vault.getData()!);
      await vault.update((data) => {
        const index = data.marketingCampaigns.findIndex(
          (c) => c.id === value.id,
        );
        if (campaign && index < 0) throw new Error("storageError");
        if (index < 0) data.marketingCampaigns.push(value);
        else
          for (const field of [
            "name",
            "type",
            "templateId",
            "channel",
            "isActive",
            "triggerDays",
            "targetDate",
            "welcomeFrom",
            "repeatYearly",
            "sendAt",
            "language",
          ] as const)
            if (value[field] !== campaign?.[field])
              Object.assign(data.marketingCampaigns[index], {
                [field]: value[field],
              });
        data.settings.marketingUsed = true;
      });
      onClose();
    } catch (e) {
      setError(marketingError(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t(campaign ? "marketingEditCampaign" : "marketingNewCampaign")}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={(e) => void save(e)}>
        <div className="grid gap-x-5 md:grid-cols-2">
          <Field label={t("marketingCampaignName")}>
            <input
              autoFocus
              required
              value={value.name}
              maxLength={180}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label={t("marketingCampaignType")}>
            <select
              value={value.type}
              onChange={(e) => {
                const type = e.target.value as MarketingCampaign["type"];
                patch({
                  type,
                  name:
                    value.name === t(`marketingType_${value.type}`)
                      ? t(`marketingType_${type}`)
                      : value.name,
                });
              }}
            >
              {(["birthday", "welcome", "holiday"] as const).map((type) => (
                <option key={type} value={type}>
                  {t(`marketingType_${type}`)}
                </option>
              ))}
            </select>
          </Field>
          <MarketingChannelPicker
            value={value.channel}
            disabled={busy}
            onChange={(channel) =>
              patch({
                channel,
                ...(channel === "none" ? { isActive: false } : {}),
              })
            }
          />
          <Field label={t("marketingAudience")}>
            <select
              value={value.language}
              onChange={(e) =>
                patch({
                  language: e.target.value as MarketingCampaign["language"],
                })
              }
            >
              <option value="all">{t("marketingAudienceAll")}</option>
              <option value="de">{t("marketingAudienceDe")}</option>
              <option value="uk">{t("marketingAudienceUk")}</option>
            </select>
          </Field>
          <Field label={t("marketingTemplate")}>
            <select
              required
              value={value.templateId}
              onChange={(e) => patch({ templateId: e.target.value })}
            >
              <option value="">{t("marketingChooseTemplate")}</option>
              {vault.data!.messageTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("marketingSendAt")} hint={t("marketingSendAtHint")}>
            <input
              type="time"
              required
              value={value.sendAt}
              onChange={(e) => patch({ sendAt: e.target.value })}
            />
          </Field>
          {value.type === "welcome" && (
            <>
              <Field label={t("marketingWelcomeFrom")}>
                <select
                  value={value.welcomeFrom}
                  onChange={(e) =>
                    patch({
                      welcomeFrom: e.target
                        .value as MarketingCampaign["welcomeFrom"],
                    })
                  }
                >
                  <option value="created">{t("marketingFromCreated")}</option>
                  <option value="firstSession">
                    {t("marketingFromFirstSession")}
                  </option>
                </select>
              </Field>
              <Field label={t("marketingTriggerDays")}>
                <input
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  required
                  value={value.triggerDays}
                  onChange={(e) =>
                    patch({ triggerDays: Number(e.target.value) })
                  }
                />
              </Field>
            </>
          )}
          {value.type === "holiday" && (
            <>
              <Field label={t("marketingTargetDate")}>
                <input
                  type="date"
                  required
                  value={value.targetDate ?? ""}
                  onChange={(e) => patch({ targetDate: e.target.value })}
                />
              </Field>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={value.repeatYearly}
                  onChange={(e) => patch({ repeatYearly: e.target.checked })}
                />
                <span>{t("marketingRepeatYearly")}</span>
              </label>
            </>
          )}
        </div>
        {value.type === "birthday" && (
          <p className="hint mb-4">{t("marketingBirthdayHint")}</p>
        )}
        {template && (
          <div className="marketing-template-preview">
            <h3>{t("marketingMessagePreview")}</h3>
            <p className="pre-line mt-2">{template.content}</p>
            {value.language !== "de" && template.contentUk && (
              <p className="pre-line mt-3" lang="uk">
                {template.contentUk}
              </p>
            )}
          </div>
        )}
        {!vault.data!.messageTemplates.length && (
          <Notice>
            {t("marketingTemplateMissing")}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                onClose();
                onTemplates();
              }}
            >
              {t("marketingNewTemplate")}
            </button>
          </Notice>
        )}
        <label className="check-label mt-4">
          <input
            type="checkbox"
            checked={value.isActive}
            disabled={value.channel === "none"}
            onChange={(e) => patch({ isActive: e.target.checked })}
          />
          <span>{t("marketingCampaignActive")}</span>
        </label>
        <p className="hint mt-2">{t("marketingOpenVaultAutomation")}</p>
        {error && <Notice error>{t(error)}</Notice>}
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !value.templateId}
          >
            {t(busy ? "working" : "save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
