import { useMemo, useRef, useState } from "react";
import { Checkbox, Select, Textarea } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  useFileContext,
  useSelectedFiles,
  useAllFiles,
} from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useFileRedaction } from "@app/contexts/FileRedactionContext";
import {
  CATEGORY_GROUPS,
  parseDictionary,
} from "@app/services/fileRedaction/rules";
import type { RedactionMethod } from "@app/types/fileRedaction";
import type { BaseToolProps } from "@app/types/tool";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import FileRedactionActions from "@app/components/tools/redact/FileRedactionActions";
import FileRedactionRestore from "@app/components/tools/redact/FileRedactionRestore";
import "@app/components/tools/redact/FileRedaction.css";

export default function FileRedactionPanel(_props: BaseToolProps) {
  const { t } = useTranslation();
  const session = useFileRedaction();
  const { selectedFiles } = useSelectedFiles();
  const { files } = useAllFiles();
  const { activeFileId, setActiveFileId } = useViewer();
  const { addFiles } = useFileContext();
  const input = useRef<HTMLInputElement>(null);
  const dictionaryInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("settings");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [scanError, setScanError] = useState<{
    targets: string;
    message: string;
  } | null>(null);
  const [filter, setFilter] = useState("all");
  const [dictionaryTarget, setDictionaryTarget] = useState<
    "requiredWords" | "preservedWords"
  >("requiredWords");
  const activeFile = files.find((file) => file.fileId === activeFileId);
  const effectiveFiles =
    activeFile && !selectedFiles.some((file) => file.fileId === activeFileId)
      ? [activeFile]
      : selectedFiles.length
        ? selectedFiles
        : activeFile
          ? [activeFile]
          : [];
  const targetSignature = effectiveFiles.map((file) => file.fileId).join("\0");
  const currentErrors = session.errors.filter((error) =>
    effectiveFiles.some((file) => file.name === error.file),
  );
  const ownHits = useMemo(
    () =>
      session.hits.filter((hit) => hit.documentId === session.activeDocumentId),
    [session.hits, session.activeDocumentId],
  );
  const groups = useMemo(() => {
    const groups = new Map<string, typeof ownHits>();
    for (const hit of ownHits) {
      if (
        (filter === "selected" && !hit.selected) ||
        (filter === "review" && !hit.review)
      )
        continue;
      const key = `${hit.category}\0${hit.original || hit.id}`;
      groups.set(key, [...(groups.get(key) ?? []), hit]);
    }
    return [...groups.values()];
  }, [ownHits, filter]);

  return (
    <div className="file-redaction-settings">
      <p className="file-redaction-intro">{t("fileRedaction.intro")}</p>
      <div className="file-redaction-files-row">
        <span>
          {t("fileRedaction.fileCount", { count: effectiveFiles.length })}
        </span>
        <Button
          variant="tertiary"
          size="sm"
          leftSection={<Icon name="plus" size={14} />}
          onClick={() => input.current?.click()}
          disabled={session.busy}
        >
          {t("fileRedaction.addFiles")}
        </Button>
      </div>
      <ul
        className="file-redaction-targets"
        aria-label={t("fileRedaction.fileCount", {
          count: effectiveFiles.length,
        })}
      >
        {effectiveFiles.map((file) => (
          <li key={file.fileId}>{file.name}</li>
        ))}
      </ul>
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,.doc,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.bmp"
        multiple
        hidden
        aria-label={t("fileRedaction.addFiles")}
        onChange={(event) => {
          const added = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (added.length)
            void addFiles(added, {
              selectFiles: true,
              skipUploadTracking: true,
            })
              .then((files) => {
                if (files[0]) setActiveFileId(files[0].fileId);
              })
              .catch(() => setMessage(t("fileRedaction.errors.READ_FAILED")));
        }}
      />
      {currentErrors.map((error, index) => (
        <div
          role="alert"
          className="file-redaction-error"
          key={`${error.file}:${index}`}
        >
          <strong>{error.file}</strong>
          <span>
            {t(`fileRedaction.errors.${error.code}`, {
              defaultValue: t("fileRedaction.errors.READ_FAILED"),
            })}
          </span>
          <button
            type="button"
            onClick={session.dismissErrors}
            aria-label={t("fileRedaction.dismiss")}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      {scanError?.targets === targetSignature && (
        <p role="alert" className="file-redaction-error">
          {scanError.message}
        </p>
      )}
      <Button
        fullWidth
        disabled={session.busy || !effectiveFiles.length}
        onClick={() => {
          setScanError(null);
          void session
            .analyse(effectiveFiles.map((file) => ({ file, id: file.fileId })))
            .then(() => setTab("results"))
            .catch(() =>
              setScanError({
                targets: targetSignature,
                message: t("fileRedaction.errors.READ_FAILED"),
              }),
            );
        }}
        leftSection={<Icon name="scan-line" size={16} />}
      >
        {t(
          session.documents.length
            ? "fileRedaction.scanAgain"
            : "fileRedaction.scan",
        )}
      </Button>
      {session.busy && (
        <div className="file-redaction-progress" role="status">
          <span>
            {t(
              `fileRedaction.progress.${session.progress?.stage ?? "reading"}`,
            )}{" "}
            {session.progress?.page
              ? `${session.progress.page}/${session.progress.total}`
              : ""}
          </span>
          <Button variant="tertiary" size="sm" onClick={session.cancel}>
            {t("fileRedaction.cancel")}
          </Button>
        </div>
      )}
      {session.documents.length > 0 && <FileRedactionActions />}
      <FileRedactionRestore disabled={session.busy} />
      <div
        className="file-redaction-tabs"
        role="tablist"
        aria-label={t("fileRedaction.panelTabs")}
      >
        {["settings", "results", "search"].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`redaction-tab-${key}`}
            aria-controls={`redaction-panel-${key}`}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {t(`fileRedaction.tabs.${key}`)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`redaction-panel-${tab}`}
        aria-labelledby={`redaction-tab-${tab}`}
      >
        {tab === "settings" && (
          <>
            <fieldset
              disabled={session.busy}
              className="file-redaction-fieldset"
            >
              <legend>{t("fileRedaction.method")}</legend>
              <div className="file-redaction-methods">
                {(
                  ["alias", "partial", "full", "blackout"] as RedactionMethod[]
                ).map((method) => (
                  <label key={method} className="file-redaction-method">
                    <input
                      type="radio"
                      name="file-redaction-method"
                      checked={session.settings.method === method}
                      onChange={() => session.updateSettings({ method })}
                    />
                    <span>
                      <strong>{t(`fileRedaction.methods.${method}`)}</strong>
                      <small>{t(`fileRedaction.examples.${method}`)}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset
              disabled={session.busy}
              className="file-redaction-fieldset"
            >
              <legend>{t("fileRedaction.categoriesTitle")}</legend>
              {CATEGORY_GROUPS.map((group) => (
                <div key={group.key} className="file-redaction-category-group">
                  <span>{t(`fileRedaction.groups.${group.key}`)}</span>
                  <div>
                    {group.categories.map((category) => (
                      <Checkbox
                        key={category}
                        size="xs"
                        label={t(`fileRedaction.categories.${category}`)}
                        checked={session.settings.categories.includes(category)}
                        onChange={(event) =>
                          session.updateSettings({
                            categories: event.currentTarget.checked
                              ? [...session.settings.categories, category]
                              : session.settings.categories.filter(
                                  (key) => key !== category,
                                ),
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
              <p className="file-redaction-note">
                {t("fileRedaction.contextDetection")}
              </p>
              <Checkbox
                size="xs"
                disabled={session.busy}
                checked={session.settings.ner !== false}
                onChange={(event) =>
                  session.updateSettings({ ner: event.currentTarget.checked })
                }
                label={t("fileRedaction.ner")}
              />
              <Checkbox
                size="xs"
                checked={session.settings.ocr}
                onChange={(event) =>
                  session.updateSettings({ ocr: event.currentTarget.checked })
                }
                label={t("fileRedaction.ocr")}
              />
            </fieldset>
            <details className="file-redaction-dictionary">
              <summary>{t("fileRedaction.dictionary")}</summary>
              <Textarea
                key={`required:${session.settings.requiredWords.join("\n")}`}
                label={t("fileRedaction.requiredWords")}
                description={t("fileRedaction.onePerLine")}
                autosize
                minRows={3}
                maxRows={8}
                defaultValue={session.settings.requiredWords.join("\n")}
                onBlur={(event) =>
                  session.updateSettings({
                    requiredWords: parseDictionary(event.currentTarget.value),
                  })
                }
                disabled={session.busy}
              />
              <Textarea
                key={`preserved:${session.settings.preservedWords.join("\n")}`}
                label={t("fileRedaction.preservedWords")}
                autosize
                minRows={3}
                maxRows={8}
                defaultValue={session.settings.preservedWords.join("\n")}
                onBlur={(event) =>
                  session.updateSettings({
                    preservedWords: parseDictionary(event.currentTarget.value),
                  })
                }
                disabled={session.busy}
              />
              <div className="file-redaction-inline-actions">
                {(["requiredWords", "preservedWords"] as const).map(
                  (target) => (
                    <Button
                      key={target}
                      variant="tertiary"
                      size="sm"
                      disabled={session.busy}
                      onClick={() => {
                        setDictionaryTarget(target);
                        dictionaryInput.current?.click();
                      }}
                    >
                      {t(`fileRedaction.import.${target}`)}
                    </Button>
                  ),
                )}
              </div>
              <input
                ref={dictionaryInput}
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file && file.size > 1024 * 1024) {
                    setMessage(t("fileRedaction.dictionaryTooLarge"));
                    return;
                  }
                  if (file)
                    void file
                      .text()
                      .then((text) =>
                        session.updateSettings({
                          [dictionaryTarget]: [
                            ...new Set([
                              ...session.settings[dictionaryTarget],
                              ...parseDictionary(text),
                            ]),
                          ],
                        }),
                      )
                      .catch(() =>
                        setMessage(t("fileRedaction.errors.READ_FAILED")),
                      );
                }}
              />
              <p className="file-redaction-note">
                {t("fileRedaction.dictionaryLocal")}
              </p>
            </details>
            <p className="file-redaction-note">
              {t("fileRedaction.visualRegions")}
            </p>
          </>
        )}
        {tab === "results" && (
          <>
            <div className="file-redaction-result-summary">
              {t("fileRedaction.hitCount", {
                count: ownHits.length,
                selected: ownHits.filter((hit) => hit.selected).length,
              })}
            </div>
            <Select
              size="xs"
              aria-label={t("fileRedaction.filter")}
              value={filter}
              onChange={(value) => setFilter(value ?? "all")}
              data={["all", "selected", "review"].map((value) => ({
                value,
                label: t(`fileRedaction.filters.${value}`),
              }))}
            />
            <div className="file-redaction-inline-actions">
              <Button
                size="sm"
                variant="tertiary"
                disabled={session.busy || !ownHits.length}
                onClick={() =>
                  session.changeHits(
                    ownHits.map((hit) => hit.id),
                    { selected: true },
                  )
                }
              >
                {t("fileRedaction.selectAll")}
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                disabled={session.busy || !ownHits.length}
                onClick={() =>
                  session.changeHits(
                    ownHits.map((hit) => hit.id),
                    { selected: false },
                  )
                }
              >
                {t("fileRedaction.selectNone")}
              </Button>
            </div>
            {!groups.length && (
              <p className="file-redaction-empty-results">
                {t(
                  session.activeDocumentId
                    ? "fileRedaction.noHits"
                    : "fileRedaction.scanFirst",
                )}
              </p>
            )}
            {groups.map((hits) => (
              <div className="file-redaction-result-group" key={hits[0].id}>
                <div className="file-redaction-result-heading">
                  <Checkbox
                    size="xs"
                    disabled={session.busy}
                    checked={hits.every((hit) => hit.selected)}
                    indeterminate={
                      hits.some((hit) => hit.selected) &&
                      !hits.every((hit) => hit.selected)
                    }
                    aria-label={t("fileRedaction.toggleGroup", {
                      value:
                        hits[0].original ||
                        t("fileRedaction.categories.region"),
                    })}
                    onChange={(event) =>
                      session.changeHits(
                        hits.map((hit) => hit.id),
                        { selected: event.currentTarget.checked },
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => session.focusHit(hits[0])}
                  >
                    <span>
                      {hits[0].original || t("fileRedaction.categories.region")}
                    </span>
                    <small>
                      {t(`fileRedaction.categories.${hits[0].category}`)} ·{" "}
                      {t("fileRedaction.occurrences", { count: hits.length })}
                    </small>
                    {hits[0].source && (
                      <small>
                        {t(`fileRedaction.sources.${hits[0].source}`)}
                        {hits[0].source === "model" &&
                        hits.every((hit) => !hit.selected)
                          ? ` · ${t("fileRedaction.uncertain")}`
                          : ""}
                      </small>
                    )}
                  </button>
                </div>
                {hits.some((hit) => hit.review) && (
                  <button
                    type="button"
                    className="file-redaction-review"
                    disabled={session.busy}
                    onClick={() =>
                      session.changeHits(
                        hits.map((hit) => hit.id),
                        { review: false },
                      )
                    }
                  >
                    {t("fileRedaction.needsReview")}
                  </button>
                )}
                {session.settings.method !== "blackout" &&
                  hits[0].category !== "region" && (
                    <input
                      className="file-redaction-replacement"
                      aria-label={t("fileRedaction.replacement", {
                        value: hits[0].original,
                      })}
                      placeholder={session.replacements.get(hits[0].id)}
                      defaultValue={hits[0].replacement ?? ""}
                      key={`${hits[0].id}:${hits[0].replacement ?? ""}`}
                      disabled={session.busy}
                      onBlur={(event) =>
                        session.changeHits(
                          hits.map((hit) => hit.id),
                          {
                            replacement: event.currentTarget.value || undefined,
                          },
                        )
                      }
                    />
                  )}
                <details>
                  <summary>{t("fileRedaction.showOccurrences")}</summary>
                  {hits.map((hit) => (
                    <div className="file-redaction-occurrence" key={hit.id}>
                      <Checkbox
                        size="xs"
                        disabled={session.busy}
                        checked={hit.selected}
                        aria-label={t("fileRedaction.toggleOccurrence", {
                          index: hit.pageIndex + 1,
                        })}
                        onChange={(event) =>
                          session.changeHits([hit.id], {
                            selected: event.currentTarget.checked,
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => session.focusHit(hit)}
                      >
                        {t(
                          session.documents.find(
                            (document) => document.id === hit.documentId,
                          )?.kind === "docx"
                            ? "fileRedaction.paragraph"
                            : "fileRedaction.page",
                          { index: hit.pageIndex + 1 },
                        )}
                      </button>
                    </div>
                  ))}
                </details>
                {hits[0].original && (
                  <Button
                    variant="tertiary"
                    size="sm"
                    disabled={session.busy}
                    onClick={() =>
                      session.updateSettings({
                        preservedWords: [
                          ...new Set([
                            ...session.settings.preservedWords,
                            hits[0].original,
                          ]),
                        ],
                      })
                    }
                  >
                    {t("fileRedaction.preserve")}
                  </Button>
                )}
              </div>
            ))}
          </>
        )}
        {tab === "search" && (
          <>
            <p className="file-redaction-note">
              {t("fileRedaction.searchDescription")}
            </p>
            <Textarea
              label={t("fileRedaction.searchText")}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              minRows={3}
              disabled={session.busy}
            />
            <Button
              fullWidth
              disabled={
                session.busy || !search.trim() || !session.documents.length
              }
              onClick={() =>
                setMessage(
                  t("fileRedaction.searchAdded", {
                    count: session.addSearch(search),
                  }),
                )
              }
            >
              {t("fileRedaction.addMatches")}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              disabled={!search.trim()}
              onClick={() =>
                session.updateSettings({
                  requiredWords: [
                    ...new Set([
                      ...session.settings.requiredWords,
                      search.trim(),
                    ]),
                  ],
                })
              }
            >
              {t("fileRedaction.saveToDictionary")}
            </Button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className="file-redaction-note">
          {message}
        </p>
      )}
      <div className="file-redaction-local">
        <Icon name="shield-check" size={14} />
        <span>{t("fileRedaction.local")}</span>
      </div>
    </div>
  );
}
