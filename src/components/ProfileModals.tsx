import { useEffect, useId, useState, type FormEvent } from "react";
import type { AddProfileInput, ProfileSummary } from "../types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";

interface AddProfileModalProps {
  open: boolean;
  working?: boolean;
  onClose: () => void;
  onSubmit: (profile: AddProfileInput) => Promise<void>;
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
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName("");
    setEmail("");
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Nazwa konta powinna mieć co najmniej 2 znaki.");
      return;
    }
    setError(null);
    await onSubmit({
      display_name: name,
      account_email: email.trim() || undefined,
    });
  };

  return (
    <Modal
      dismissible={!working}
      eyebrow="Import profilu"
      footer={
        <>
          <button
            className="button button--ghost"
            data-autofocus
            disabled={working}
            onClick={onClose}
            type="button"
          >
            Anuluj
          </button>
          <button
            className="button button--primary"
            disabled={working}
            form={formId}
            type="submit"
          >
            <Icon name={working ? "loader" : "plus"} size={16} />
            <span>{working ? "Dodawanie…" : "Dodaj konto"}</span>
          </button>
        </>
      }
      icon={<Icon name="user" size={21} />}
      onClose={onClose}
      open={open}
      title="Dodaj bieżące konto"
      description="Zapisz profil, który jest aktualnie zalogowany w Antigravity."
    >
      <form className="modal-form" id={formId} onSubmit={submit}>
        <div className="compact-alert compact-alert--info">
          <Icon name="info" size={17} />
          <span>
            Przed dodaniem upewnij się, że w Antigravity jest zalogowane właściwe konto.
          </span>
        </div>

        <label className="field" htmlFor={`${formId}-name`}>
          <span className="field__label">Nazwa wyświetlana</span>
          <input
            autoComplete="off"
            id={`${formId}-name`}
            maxLength={48}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="np. Praca, Studio, Prywatne"
            required
            type="text"
            value={displayName}
          />
          <span className="field-hint">Widoczna tylko w aplikacji i wtyczce.</span>
        </label>

        <label className="field" htmlFor={`${formId}-email`}>
          <span className="field__label">
            E-mail <span className="field__optional">opcjonalnie</span>
          </span>
          <input
            autoComplete="email"
            id={`${formId}-email`}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="konto@example.com"
            type="email"
            value={email}
          />
          <span className="field-hint">E-mail nie będzie zapisywany w logach.</span>
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
            Anuluj
          </button>
          <button
            className="button button--danger"
            disabled={working || !profile}
            onClick={() => profile && onConfirm(profile)}
            type="button"
          >
            <Icon name={working ? "loader" : "trash"} size={16} />
            <span>{working ? "Usuwanie…" : "Usuń profil"}</span>
          </button>
        </>
      }
      icon={<Icon name="trash" size={21} />}
      onClose={onClose}
      open={Boolean(profile)}
      title="Usunąć zapisane konto?"
      description={
        profile
          ? `Profil „${profile.display_name}” i jego lokalna historia zostaną trwale usunięte.`
          : undefined
      }
    >
      <div className="compact-alert compact-alert--danger">
        <Icon name="alert" size={17} />
        <span>Tej operacji nie można cofnąć. Aktywnego profilu nie da się usunąć.</span>
      </div>
    </Modal>
  );
}
