import { useMemo, useState, type FormEvent } from "react";
import { BookCopy, CopyPlus, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useI18n, type TextKey } from "../lib/i18n";
import { marketingError, marketingPreset } from "../lib/marketing";
import { uid, type MessageTemplate } from "../lib/types";
import type { VaultController } from "../lib/useVault";
import { Empty, Field, Modal, Notice, PageHeading } from "./ui";
import { MarketingConfirm } from "./marketing-ui";

export function TemplateManager({
  vault,
  onUse,
}: {
  vault: VaultController;
  onUse: (id: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(30),
    [editing, setEditing] = useState<MessageTemplate>(),
    [creating, setCreating] = useState(false),
    [deleting, setDeleting] = useState<MessageTemplate>();
  const index = useMemo(
    () =>
      [...vault.data!.messageTemplates]
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
        )
        .map((row) => ({
          row,
          text: `${row.title} ${row.titleUk ?? ""} ${row.content} ${row.contentUk ?? ""}`.toLocaleLowerCase(),
        })),
    [vault.data!.messageTemplates],
  );
  const templates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return index
      .filter((item) => item.text.includes(q))
      .map((item) => item.row);
  }, [index, query]);
  return (
    <div className="marketing-page space-y-6">
      <PageHeading
        title={t("messageTemplates")}
        subtitle={t("marketingTemplatesSubtitle")}
        action={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(undefined);
              setCreating(true);
            }}
          >
            <Plus size={17} />
            {t("marketingNewTemplate")}
          </button>
        }
      />
      <section className="card">
        <h2>{t("marketingStartWithTemplate")}</h2>
        <p className="hint mt-2">{t("marketingPresetHint")}</p>
        <div className="button-row mt-4 flex-wrap">
          {(["welcome", "holiday", "info"] as const).map((kind) => (
            <button
              key={kind}
              className="btn btn-secondary"
              onClick={() => {
                setEditing({
                  id: uid(),
                  createdAt: new Date().toISOString(),
                  ...marketingPreset(kind),
                });
                setCreating(true);
              }}
            >
              <CopyPlus size={16} />
              {t(`marketingPreset_${kind}_title`)}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <Field label={t("marketingFindTemplate")}>
          <input
            type="search"
            value={query}
            maxLength={120}
            placeholder={t("marketingTemplateSearchPlaceholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
          />
        </Field>
        {templates.length ? (
          <ul className="marketing-list">
            {templates.slice(0, limit).map((template) => (
              <li
                key={template.id}
                className="flex flex-wrap items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="break-words">{template.title}</h2>
                  <span className="hint">
                    {t(`marketingCategory_${template.category}`)}
                  </span>
                  <p className="marketing-excerpt">
                    {template.content || template.contentUk}
                  </p>
                </div>
                <div className="button-row flex-wrap">
                  <button
                    className="btn btn-secondary"
                    onClick={() => onUse(template.id)}
                  >
                    <Send size={16} />
                    {t("marketingUseTemplate")}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`${t("marketingEditTemplate")}: ${template.title}`}
                    onClick={() => {
                      setEditing(template);
                      setCreating(false);
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={`${t("marketingDeleteTemplate")}: ${template.title}`}
                    onClick={() => setDeleting(template)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            icon={<BookCopy size={30} />}
            title={t("marketingNoTemplates")}
            text={t("marketingNoTemplatesHint")}
          />
        )}
        {templates.length > limit && (
          <button className="text-link" onClick={() => setLimit((n) => n + 30)}>
            {t("followUpShowMore")}
          </button>
        )}
      </section>
      {deleting && (
        <MarketingConfirm
          title={t("marketingDeleteTemplate")}
          text={`${deleting.title}\n\n${t("marketingDeleteTemplateConfirm")}`}
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            vault.update((data) => {
              data.messageTemplates = data.messageTemplates.filter(
                (row) => row.id !== deleting.id,
              );
              for (const campaign of data.marketingCampaigns)
                if (campaign.templateId === deleting.id)
                  campaign.isActive = false;
            })
          }
        />
      )}
      {(creating || editing) && (
        <TemplateEditor
          key={`${editing?.id ?? "new"}:${creating}`}
          vault={vault}
          template={editing}
          creating={creating}
          onClose={() => {
            setCreating(false);
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
function TemplateEditor({
  vault,
  template,
  creating,
  onClose,
}: {
  vault: VaultController;
  template?: MessageTemplate;
  creating: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(template?.title ?? ""),
    [titleUk, setTitleUk] = useState(template?.titleUk ?? ""),
    [category, setCategory] = useState<MessageTemplate["category"]>(
      template?.category ?? "info",
    ),
    [content, setContent] = useState(template?.content ?? ""),
    [contentUk, setContentUk] = useState(template?.contentUk ?? ""),
    [ukOpen, setUkOpen] = useState(!!template?.contentUk),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<TextKey>();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || (!content.trim() && !contentUk.trim())) return;
    setBusy(true);
    try {
      await vault.update((data) => {
        const record: MessageTemplate = {
          id: template?.id ?? uid(),
          createdAt: template?.createdAt ?? new Date().toISOString(),
          title: title.trim(),
          titleUk: titleUk.trim() || undefined,
          category,
          content: content.trim(),
          contentUk: contentUk.trim() || undefined,
        };
        const index = data.messageTemplates.findIndex(
          (t) => t.id === record.id,
        );
        if (!creating && index < 0) throw new Error("storageError");
        if (index < 0) data.messageTemplates.push(record);
        else
          for (const field of [
            "title",
            "titleUk",
            "category",
            "content",
            "contentUk",
          ] as const)
            if (record[field] !== template?.[field])
              Object.assign(data.messageTemplates[index], {
                [field]: record[field],
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
      title={t(creating ? "marketingNewTemplate" : "marketingEditTemplate")}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={(e) => void save(e)}>
        <div className="grid gap-x-5 md:grid-cols-2">
          <Field label={t("marketingTemplateTitle")}>
            <input
              autoFocus
              required
              maxLength={180}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={t("marketingCategory")}>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as MessageTemplate["category"])
              }
            >
              {(["info", "greeting", "organization"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`marketingCategory_${c}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("marketingMessageDe")} hint={t("marketingContentHint")}>
          <textarea
            lang="de"
            rows={6}
            maxLength={10000}
            value={content}
            placeholder={t("marketingMessagePlaceholder")}
            onChange={(e) => setContent(e.target.value)}
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
              onChange={(e) => setTitleUk(e.target.value)}
            />
          </Field>
          <Field label={t("marketingMessageUk")}>
            <textarea
              lang="uk"
              rows={6}
              maxLength={10000}
              value={contentUk}
              placeholder={t("marketingMessagePlaceholderUk")}
              onChange={(e) => setContentUk(e.target.value)}
            />
          </Field>
        </details>
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
            disabled={
              busy || !title.trim() || (!content.trim() && !contentUk.trim())
            }
          >
            {t(busy ? "working" : "save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
