import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ImagePlus, Mail, Send, X } from "lucide-react";
import { compressImage } from "../lib/images";
import { useI18n, type TextKey } from "../lib/i18n";
import {
  marketingBodyLimit,
  clientMarketingChannels,
  marketingChannels,
  marketingChannelText,
  newsletterRecipientCount,
  marketingDestination,
  marketingError,
  newsletterStatus,
  validMarketingContact,
} from "../lib/marketing";
import {
  uid,
  type MarketingChannelSelection,
  type MessageTemplate,
  type Newsletter,
  type NewsletterMessage,
} from "../lib/types";
import type { VaultController } from "../lib/useVault";
import type { MarketingController } from "../lib/useMarketingAutomation";
import { Empty, Field, ImageView, Modal, Notice, PageHeading } from "./ui";
import {
  MarketingChannelPicker,
  MarketingImagePreview,
  MarketingSetup,
  MarketingStatus,
} from "./marketing-ui";

export function Newsletter({
  vault,
  marketing,
  active,
  initialTab = "create",
  templateId,
  onTemplateHandled,
  onTemplates,
  onEditClient,
}: {
  vault: VaultController;
  marketing: MarketingController;
  active: boolean;
  initialTab?: "create" | "archive";
  templateId?: string;
  onTemplateHandled: () => void;
  onTemplates: () => void;
  onEditClient: (id: string) => void;
}) {
  const { t } = useI18n();
  const id = useId(),
    selectAll = useRef<HTMLInputElement>(null),
    alive = useRef(true);
  const [tab, setTab] = useState<"create" | "archive">(initialTab),
    [channel, setChannel] = useState<MarketingChannelSelection>("email"),
    [title, setTitle] = useState(""),
    [titleUk, setTitleUk] = useState(""),
    [content, setContent] = useState(""),
    [contentUk, setContentUk] = useState(""),
    [image, setImage] = useState<Blob>(),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [limit, setLimit] = useState(50),
    [review, setReview] = useState(false),
    [pendingTemplate, setPendingTemplate] = useState<MessageTemplate>(),
    [ukOpen, setUkOpen] = useState(false),
    [busyImage, setBusyImage] = useState(false),
    [error, setError] = useState<TextKey>(),
    [savedTemplate, setSavedTemplate] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    savingTemplate = useRef(false),
    draftRevision = useRef("");
  draftRevision.current = JSON.stringify([title, titleUk, content, contentUk]);
  const data = vault.data!,
    hasDe = !!content.trim(),
    hasUk = !!contentUk.trim(),
    max = marketingBodyLimit(channel, !!image);
  const clients = useMemo(
    () =>
      active
        ? [...data.clients].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [data.clients, active],
  );
  const eligible = useMemo(
    () => clients.filter((c) => clientMarketingChannels(c, channel).length),
    [clients, channel],
  );
  const found = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return clients.filter((c) =>
      `${c.name} ${c.email ?? ""} ${c.telegramChatId}`
        .toLocaleLowerCase()
        .includes(q),
    );
  }, [clients, query, channel]);
  const allowed = useMemo(() => new Set(eligible.map((c) => c.id)), [eligible]),
    selectedSet = useMemo(() => new Set(selected), [selected]);
  const checked = eligible.filter((c) => selectedSet.has(c.id));
  const canSend =
    checked.length > 0 &&
    selected.every((id) => allowed.has(id)) &&
    checked.every((c) => (c.language === "uk" ? hasUk : hasDe)) &&
    content.length <= max &&
    contentUk.length <= max &&
    !marketing.busy &&
    !busyImage &&
    !vault.demo &&
    checked.every((c) =>
      clientMarketingChannels(c, channel).every(
        (value) => marketing.capabilities?.[value],
      ),
    );
  const apply = (template: MessageTemplate) => {
    setTitle(template.title);
    setTitleUk(template.titleUk ?? "");
    setContent(template.content);
    setContentUk(template.contentUk ?? "");
    setUkOpen(!!template.contentUk);
    setSavedTemplate(false);
  };
  const choose = (template: MessageTemplate) => {
    if (content.trim() || contentUk.trim() || title.trim())
      setPendingTemplate(template);
    else apply(template);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (active) setTab(initialTab);
    else {
      setReview(false);
      setPendingTemplate(undefined);
    }
  }, [active, initialTab]);
  useEffect(() => {
    if (templateId) {
      const template = data.messageTemplates.find((t) => t.id === templateId);
      if (template) choose(template);
      onTemplateHandled();
    }
  }, [templateId]);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        checked.length > 0 && checked.length < eligible.length;
  }, [checked.length, eligible.length, tab, active]);
  useEffect(() => {
    if (checked.some((c) => c.language === "uk")) setUkOpen(true);
  }, [selected, channel]);
  useEffect(() => {
    if (active)
      setSelected((old) => {
        const next = old.filter((id) => allowed.has(id));
        return next.length === old.length ? old : next;
      });
  }, [allowed, active]);
  async function pickImage(file: File | undefined) {
    if (!file) return;
    setBusyImage(true);
    setError(undefined);
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 20 * 1024 * 1024
      )
        throw new Error("invalidImage");
      const bytes = await compressImage(file);
      try {
        if (bytes.length > 2 * 1024 * 1024) throw new Error("invalidImage");
        if (alive.current) setImage(new Blob([bytes], { type: "image/webp" }));
      } finally {
        bytes.fill(0);
      }
    } catch (e) {
      if (alive.current) setError(marketingError(e));
    } finally {
      if (alive.current) setBusyImage(false);
    }
  }
  async function saveTemplate() {
    if (savingTemplate.current) return;
    savingTemplate.current = true;
    setError(undefined);
    const revision = JSON.stringify([title, titleUk, content, contentUk]);
    try {
      const template: MessageTemplate = {
        id: uid(),
        createdAt: new Date().toISOString(),
        title:
          title.trim() ||
          content.trim().split("\n")[0]?.slice(0, 100) ||
          titleUk.trim() ||
          contentUk.trim().split("\n")[0].slice(0, 100),
        titleUk: titleUk.trim() || undefined,
        content: content.trim(),
        contentUk: contentUk.trim() || undefined,
        category: "info",
      };
      await vault.update((data) => {
        data.messageTemplates.push(template);
        data.settings.marketingUsed = true;
      });
      if (alive.current && revision === draftRevision.current)
        setSavedTemplate(true);
    } catch (e) {
      if (alive.current) setError(marketingError(e));
    } finally {
      savingTemplate.current = false;
    }
  }
  async function send() {
    setError(undefined);
    const message: NewsletterMessage = {
      id: uid(),
      title: title.trim(),
      titleUk: titleUk.trim() || undefined,
      content: content.trim(),
      contentUk: contentUk.trim() || undefined,
    };
    try {
      await marketing.send({
        channel,
        message,
        clientIds: [...selected],
        image,
      });
      if (alive.current) {
        setReview(false);
        setSelected([]);
        setContent("");
        setContentUk("");
        setTitle("");
        setTitleUk("");
        setImage(undefined);
        setTab("archive");
      }
    } catch (e) {
      if (
        alive.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(marketingError(e));
    }
  }
  if (!active) return null;
  const tabs = ["create", "archive"] as const;
  return (
    <div className="marketing-page space-y-6">
      <PageHeading
        title={t("newsletter")}
        subtitle={t("marketingNewsletterSubtitle")}
      />
      <MarketingSetup marketing={marketing} demo={vault.demo} />
      <div
        className="profile-tabs"
        role="tablist"
        aria-label={t("newsletter")}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? "create"
              : e.key === "End"
                ? "archive"
                : tab === "create"
                  ? "archive"
                  : "create";
          setTab(next);
          document.getElementById(`${id}-${next}`)?.focus();
        }}
      >
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-${value}`}
            aria-controls={`${id}-${value}-panel`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {t(
              value === "create"
                ? "marketingCreateNewsletter"
                : "marketingArchive",
            )}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`${id}-${tab}-panel`}
        aria-labelledby={`${id}-${tab}`}
      >
        {tab === "archive" ? (
          <NewsletterArchive vault={vault} />
        ) : (
          <form
            className="space-y-6"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (canSend) {
                setError(undefined);
                setReview(true);
              }
            }}
          >
            <section className="card">
              <div className="section-heading">
                <h2>{t("marketingCompose")}</h2>
                <button
                  type="button"
                  className="text-link"
                  onClick={onTemplates}
                >
                  {t("marketingManageTemplates")}
                </button>
              </div>
              <Field label={t("marketingTemplate")}>
                <select
                  value=""
                  disabled={marketing.busy}
                  onChange={(e) => {
                    const template = data.messageTemplates.find(
                      (t) => t.id === e.target.value,
                    );
                    if (template) choose(template);
                  }}
                >
                  <option value="">{t("marketingChooseTemplate")}</option>
                  {data.messageTemplates.map((template) => (
                    <option value={template.id} key={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </Field>
              <MarketingChannelPicker
                value={channel}
                disabled={marketing.busy}
                onChange={setChannel}
              />
              <Field label={t("marketingSubjectOptional")}>
                <input
                  value={title}
                  maxLength={180}
                  disabled={marketing.busy}
                  placeholder={t("marketingSubjectPlaceholder")}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSavedTemplate(false);
                  }}
                  lang="de"
                />
              </Field>
              <Field
                label={t("marketingMessageDe")}
                hint={`${t("marketingMaxCharacters")} ${max}`}
              >
                <textarea
                  lang="de"
                  rows={7}
                  maxLength={max}
                  value={content}
                  disabled={marketing.busy}
                  placeholder={t("marketingMessagePlaceholder")}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setSavedTemplate(false);
                  }}
                />
              </Field>
              <details
                className="marketing-translation"
                open={ukOpen}
                onToggle={(e) => setUkOpen(e.currentTarget.open)}
              >
                <summary>{t("marketingUkrainianVersion")}</summary>
                <Field label={t("marketingTitleUk")}>
                  <input
                    lang="uk"
                    maxLength={180}
                    value={titleUk}
                    disabled={marketing.busy}
                    onChange={(e) => {
                      setTitleUk(e.target.value);
                      setSavedTemplate(false);
                    }}
                  />
                </Field>
                <Field
                  label={t("marketingMessageUk")}
                  hint={`${t("marketingMaxCharacters")} ${max}`}
                >
                  <textarea
                    lang="uk"
                    rows={7}
                    maxLength={max}
                    value={contentUk}
                    disabled={marketing.busy}
                    placeholder={t("marketingMessagePlaceholderUk")}
                    onChange={(e) => {
                      setContentUk(e.target.value);
                      setSavedTemplate(false);
                    }}
                  />
                </Field>
              </details>
              <div className="mt-5">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={marketing.busy || busyImage}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={17} />
                  {t(busyImage ? "working" : "marketingUploadImage")}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={t("marketingUploadImage")}
                  disabled={marketing.busy || busyImage}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void pickImage(file);
                  }}
                />
                <p className="hint mt-2">{t("marketingImageHint")}</p>
                {image && (
                  <div className="mt-4">
                    <MarketingImagePreview blob={image} />
                    <button
                      type="button"
                      className="btn btn-secondary mt-2"
                      disabled={marketing.busy}
                      onClick={() => setImage(undefined)}
                    >
                      <X size={16} />
                      {t("marketingRemoveImage")}
                    </button>
                  </div>
                )}
              </div>
              <div className="button-row mt-5 flex-wrap">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={
                    (!hasDe && !hasUk) || marketing.busy || savedTemplate
                  }
                  onClick={() => void saveTemplate()}
                >
                  {t(
                    savedTemplate
                      ? "marketingTemplateSaved"
                      : "marketingSaveAsTemplate",
                  )}
                </button>
              </div>
              <p className="hint mt-2">{t("marketingDraftHint")}</p>
            </section>
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>{t("marketingRecipients")}</h2>
                  <p>{t("marketingRecipientsHint")}</p>
                </div>
                <span className="marketing-count" role="status">
                  {t("marketingSelectedCount").replace(
                    "{count}",
                    String(checked.length),
                  )}
                </span>
              </div>
              <Field label={t("marketingFindRecipient")}>
                <input
                  type="search"
                  value={query}
                  maxLength={120}
                  placeholder={t("marketingRecipientSearchPlaceholder")}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(50);
                  }}
                />
              </Field>
              <label className="check-label">
                <input
                  ref={selectAll}
                  type="checkbox"
                  checked={
                    eligible.length > 0 && checked.length === eligible.length
                  }
                  disabled={!eligible.length || marketing.busy}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? eligible.map((c) => c.id) : [],
                    )
                  }
                />
                <span>{t("marketingSelectAll")}</span>
              </label>
              {found.length ? (
                <ul className="marketing-list mt-3">
                  {found.slice(0, limit).map((client) => {
                    const enabled = allowed.has(client.id);
                    const chosen = marketingChannels(channel),
                      enabledChannels = clientMarketingChannels(
                        client,
                        channel,
                      );
                    const reason = !chosen.length
                      ? "marketingChooseChannel"
                      : !chosen.some((value) =>
                            validMarketingContact(client, value),
                          )
                        ? "marketingContactMissing"
                        : !enabledChannels.length
                          ? "marketingConsentMissing"
                          : client.language === "uk" && !hasUk
                            ? "marketingTranslationMissing"
                            : client.language === "de" && !hasDe
                              ? "marketingMessageRequired"
                              : undefined;
                    return (
                      <li
                        key={client.id}
                        className="flex items-start justify-between gap-3"
                      >
                        <label className="check-label min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(client.id)}
                            disabled={!enabled || marketing.busy}
                            onChange={(e) =>
                              setSelected((old) =>
                                e.target.checked
                                  ? [...old, client.id]
                                  : old.filter((id) => id !== client.id),
                              )
                            }
                          />
                          <span className="min-w-0">
                            <strong className="block break-words">
                              {client.name}
                            </strong>
                            <span className="block break-all text-sm text-[var(--marketing-muted)]">
                              {marketingChannels(
                                channel === "none" ? "both" : channel,
                              ).map((value) => (
                                <span className="block" key={value}>
                                  {t(marketingChannelText(value))}:{" "}
                                  {marketingDestination(client, value) ||
                                    t("marketingContactMissing")}
                                </span>
                              ))}
                              {enabledChannels.length > 0 && (
                                <span className="hint block">
                                  {enabledChannels
                                    .map((value) =>
                                      t(marketingChannelText(value)),
                                    )
                                    .join(" + ")}
                                </span>
                              )}
                            </span>
                            <span className="hint block">
                              {t(
                                client.language === "uk"
                                  ? "marketingLanguageUk"
                                  : "marketingLanguageDe",
                              )}
                              {reason ? ` · ${t(reason)}` : ""}
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="text-link"
                          disabled={marketing.busy}
                          aria-label={`${t("editClient")}: ${client.name}`}
                          onClick={() => onEditClient(client.id)}
                        >
                          {t("marketingEditContact")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty
                  icon={<Mail size={28} />}
                  title={t("marketingNoRecipients")}
                  text={t("marketingNoRecipientsHint")}
                />
              )}
              {found.length > limit && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setLimit((n) => n + 50)}
                >
                  {t("followUpShowMore")}
                </button>
              )}
            </section>
            {error && <Notice error>{t(error)}</Notice>}
            {savedTemplate && <Notice>{t("marketingTemplateSaved")}</Notice>}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="hint">{t("marketingContentHint")}</p>
              <button className="btn btn-primary" disabled={!canSend}>
                <Send size={17} />
                {t(marketing.busy ? "marketingSending" : "marketingSend")}
              </button>
            </div>
          </form>
        )}
      </section>
      {pendingTemplate && (
        <Modal
          title={t("marketingReplaceTemplateTitle")}
          onClose={() => setPendingTemplate(undefined)}
        >
          <p>{t("marketingReplaceTemplateHint")}</p>
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setPendingTemplate(undefined)}
            >
              {t("cancel")}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                apply(pendingTemplate);
                setPendingTemplate(undefined);
              }}
            >
              {t("marketingApplyTemplate")}
            </button>
          </div>
        </Modal>
      )}
      {review && (
        <Modal
          title={t("marketingReviewTitle")}
          onClose={() => {
            if (!marketing.busy) setReview(false);
          }}
          wide
        >
          <p>
            {t("marketingReviewCount").replace(
              "{count}",
              String(checked.length),
            )}{" "}
            · {t(marketingChannelText(channel))} ·{" "}
            {t("marketingDeliveryCount").replace(
              "{count}",
              String(
                checked.reduce(
                  (count, c) =>
                    count + clientMarketingChannels(c, channel).length,
                  0,
                ),
              ),
            )}
          </p>
          <div className="marketing-template-preview mt-4">
            {hasDe && (
              <section lang="de">
                <h3>{title || t("marketingMessageDe")}</h3>
                <p className="pre-line mt-2">{content}</p>
              </section>
            )}
            {hasUk && (
              <section className="mt-4" lang="uk">
                <h3>{titleUk || t("marketingMessageUk")}</h3>
                <p className="pre-line mt-2">{contentUk}</p>
              </section>
            )}
            {image && <MarketingImagePreview blob={image} />}
          </div>
          <p className="hint mt-4">{t("marketingUnsubscribeHint")}</p>
          {error && <Notice error>{t(error)}</Notice>}
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              disabled={marketing.busy}
              onClick={() => setReview(false)}
            >
              {t("cancel")}
            </button>
            <button
              className="btn btn-primary"
              disabled={!canSend}
              onClick={() => void send()}
            >
              {t(marketing.busy ? "marketingSending" : "marketingConfirmSend")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function NewsletterArchive({ vault }: { vault: VaultController }) {
  const { t, language } = useI18n();
  const [opened, setOpened] = useState<string>(),
    [limit, setLimit] = useState(30),
    [resultLimit, setResultLimit] = useState(50);
  const rows = useMemo(
    () =>
      [...vault.data!.newsletters].sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      ),
    [vault.data!.newsletters],
  );
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "uk" ? "uk-UA" : "de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: vault.data!.settings.timeZone,
      }),
    [language, vault.data!.settings.timeZone],
  );
  const heading = (row: Newsletter) => {
    const message =
      row.messages.find((m) =>
        row.recipients.some((r) => r.status === "sent" && r.messageId === m.id),
      ) ?? row.messages[0];
    return (
      (language === "uk" ? message?.titleUk : message?.title) ||
      message?.title ||
      message?.content.slice(0, 80) ||
      message?.contentUk?.slice(0, 80) ||
      t("newsletter")
    );
  };
  const channel = (row: Newsletter) => {
    const values = new Set(row.recipients.map((r) => r.channel));
    return values.size > 1
      ? t("marketingBothChannels")
      : t(marketingChannelText(values.values().next().value ?? row.channel));
  };
  const entry = rows.find((n) => n.id === opened);
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>{t("marketingArchive")}</h2>
          <p>{t("marketingArchiveHint")}</p>
        </div>
      </div>
      {rows.length ? (
        <>
          <div className="marketing-archive-head" aria-hidden="true">
            <span>{t("marketingDateTime")}</span>
            <span>{t("marketingChannel")}</span>
            <span>{t("marketingSubject")}</span>
            <span>{t("marketingRecipientCount")}</span>
            <span>{t("marketingStatus")}</span>
          </div>
          <ul className="marketing-archive-list">
            {rows.slice(0, limit).map((row) => (
              <li key={row.id}>
                <button
                  className="marketing-archive-row"
                  onClick={() => {
                    setResultLimit(50);
                    setOpened(row.id);
                  }}
                >
                  <time dateTime={row.createdAt}>
                    {format.format(new Date(row.createdAt))}
                  </time>
                  <span>{channel(row)}</span>
                  <strong>{heading(row)}</strong>
                  <span>
                    {newsletterRecipientCount(row)}{" "}
                    <span className="md:hidden">
                      {t("marketingRecipients")}
                    </span>
                  </span>
                  <MarketingStatus status={newsletterStatus(row)} />
                </button>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <button
              className="text-link"
              onClick={() => setLimit((n) => n + 30)}
            >
              {t("followUpShowMore")}
            </button>
          )}
        </>
      ) : (
        <Empty
          icon={<Mail size={30} />}
          title={t("marketingNoArchive")}
          text={t("marketingNoArchiveHint")}
        />
      )}
      {entry && (
        <Modal title={heading(entry)} onClose={() => setOpened(undefined)} wide>
          <dl className="marketing-detail-meta">
            <div>
              <dt>{t("marketingDateTime")}</dt>
              <dd>{format.format(new Date(entry.createdAt))}</dd>
            </div>
            <div>
              <dt>{t("marketingChannel")}</dt>
              <dd>{channel(entry)}</dd>
            </div>
            <div>
              <dt>{t("marketingRecipientCount")}</dt>
              <dd>{newsletterRecipientCount(entry)}</dd>
            </div>
          </dl>
          <MarketingStatus status={newsletterStatus(entry)} />
          <p className="hint mt-3">{t("marketingDeliveryHint")}</p>
          {entry.messages
            .filter(
              (m) =>
                entry.recipients.some((r) => r.messageId === m.id) ||
                !entry.recipients.length,
            )
            .map((message) => (
              <section
                className="marketing-template-preview mt-4"
                key={message.id}
              >
                <h3>{t("marketingMessageDe")}</h3>
                <strong>{message.title}</strong>
                <p className="pre-line mt-2">{message.content}</p>
                {message.contentUk && (
                  <div className="mt-4" lang="uk">
                    <h3>{t("marketingMessageUk")}</h3>
                    <strong>{message.titleUk}</strong>
                    <p className="pre-line mt-2">{message.contentUk}</p>
                  </div>
                )}
                {message.image && (
                  <ImageView
                    vault={vault}
                    id={message.image.blobId}
                    alt={t("marketingImage")}
                    className="marketing-image mt-4"
                  />
                )}
              </section>
            ))}
          {entry.recipients.some(
            (r) => !entry.messages.some((m) => m.id === r.messageId),
          ) && <Notice>{t("marketingMessageAwaitSync")}</Notice>}
          {entry.recipients.some((r) => r.status === "unknown") && (
            <Notice>{t("marketingUnknownHint")}</Notice>
          )}
          <h3 className="mt-5">{t("marketingRecipientResults")}</h3>
          <ul className="marketing-list">
            {entry.recipients.slice(0, resultLimit).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span>
                  {vault.data!.clients.find((c) => c.id === r.clientId)?.name ??
                    t("marketingRemovedClient")}
                  <small className="hint block">
                    {t(marketingChannelText(r.channel))}
                  </small>
                </span>
                <div>
                  <MarketingStatus status={r.status} />
                  {r.acceptedAt && (
                    <time className="hint block" dateTime={r.acceptedAt}>
                      {format.format(new Date(r.acceptedAt))}
                    </time>
                  )}
                  {r.errorCode && r.status !== "sent" && (
                    <p className="hint">
                      {t(marketingError(new Error(r.errorCode)))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {entry.recipients.length > resultLimit && (
            <button
              className="text-link"
              onClick={() => setResultLimit((n) => n + 50)}
            >
              {t("followUpShowMore")}
            </button>
          )}
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setOpened(undefined)}
            >
              {t("close")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
