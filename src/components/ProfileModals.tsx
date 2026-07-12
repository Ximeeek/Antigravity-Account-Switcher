import { useEffect, useId, useState, type FormEvent } from "react";
import type { AddProfileInput, ProfileSummary } from "../types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { getDisclaimerText } from "../utils";
import { t } from "../i18n";


interface AddProfileModalProps {
  open: boolean;
  working?: boolean;
  onClose: () => void;
  onSubmit: (displayName: string) => Promise<void>;
}

export function AddProfileModal({
  open,
  working = false,
  onClose,
  onSubmit,
}: AddProfileModalProps) {
  const rawFormId = useId();
  const formId = `add-profile-${rawFormId.replaceAll(":", "")}`;
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const disclaimer = getDisclaimerText();

  useEffect(() => {
    if (!open) return;
    setDisplayName("");
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError(t("add_modal_validation_len"));
      return;
    }
    setError(null);
    await onSubmit(name);
  };

  return (
    <Modal
      dismissible={true} // Allow closing the modal to trigger cancel_oauth_login
      eyebrow={t("add_modal_eyebrow")}
      footer={
        <>
          <button
            className="button button--ghost"
            data-autofocus
            onClick={onClose}
            type="button"
          >
            {t("add_modal_cancel")}
          </button>
          <button
            className="button button--primary"
            disabled={working}
            form={formId}
            type="submit"
          >
            <Icon name={working ? "loader" : "plus"} size={16} />
            <span>{working ? t("add_modal_submitting") : t("add_modal_submit")}</span>
          </button>
        </>
      }
      icon={<Icon name="user" size={21} />}
      onClose={onClose}
      open={open}
      title={t("add_modal_title")}
      description={t("add_modal_desc")}
    >
      <form className="modal-form" id={formId} onSubmit={submit}>
        {working ? (
          <div className="compact-alert compact-alert--info">
            <Icon name="loader" size={17} className="animate-spin" />
            <span>
              <strong>{t("add_modal_waiting")}</strong><br />
              {t("add_modal_waiting_desc")}
            </span>
          </div>
        ) : (
          <div className="compact-alert compact-alert--info">
            <Icon name="info" size={17} />
            <span>
              {t("add_modal_redirect")}
            </span>
          </div>
        )}

        <div className="compact-alert compact-alert--warning" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Icon name="shield" size={17} />
            <strong>{disclaimer.title}</strong>
          </div>
          <span style={{ fontSize: "0.85em", lineHeight: "1.4" }}>
            {disclaimer.body}
          </span>
          <div style={{ fontSize: "0.8em", marginTop: "4px" }}>
            <strong>{disclaimer.linksLabel}</strong>{" "}
            <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit", marginRight: "8px" }}>{disclaimer.tosLink}</a>
            <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit", marginRight: "8px" }}>{disclaimer.geminiLink}</a>
            <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit" }}>{disclaimer.fairUseLink}</a>
          </div>
        </div>

        <label className="field" htmlFor={`${formId}-name`}>
          <span className="field__label">{t("add_modal_name_label")}</span>
          <input
            autoComplete="off"
            disabled={working}
            id={`${formId}-name`}
            maxLength={48}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={t("add_modal_name_placeholder")}
            required
            type="text"
            value={displayName}
          />
          <span className="field-hint">{t("add_modal_name_hint")}</span>
        </label>

        {error ? (
          <p className="field-error" role="alert">
            <Icon name="error" size={16} />
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

interface DeleteProfileModalProps {
  profile: ProfileSummary | null;
  working?: boolean;
  onClose: () => void;
  onConfirm: (profile: ProfileSummary) => Promise<void>;
}

export function DeleteProfileModal({
  profile,
  working = false,
  onClose,
  onConfirm,
}: DeleteProfileModalProps) {
  return (
    <Modal
      className="modal-panel--compact"
      dismissible={!working}
      footer={
        <>
          <button
            className="button button--ghost"
            data-autofocus
            disabled={working}
            onClick={onClose}
            type="button"
          >
            {t("delete_modal_cancel")}
          </button>
          <button
            className="button button--danger"
            disabled={working || !profile}
            onClick={() => profile && onConfirm(profile)}
            type="button"
          >
            <Icon name={working ? "loader" : "trash"} size={16} />
            <span>{working ? t("delete_modal_confirming") : t("delete_modal_confirm")}</span>
          </button>
        </>
      }
      icon={<Icon name="trash" size={21} />}
      onClose={onClose}
      open={Boolean(profile)}
      title={t("delete_modal_title")}
      description={
        profile
          ? t("delete_modal_desc", { name: profile.display_name })
          : undefined
      }
    >
      <div className="compact-alert compact-alert--danger">
        <Icon name="alert" size={17} />
        <span>{t("delete_modal_warning")}</span>
      </div>
    </Modal>
  );
}
