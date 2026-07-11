import type { AppState, SwitchOperation } from "../types";
import {
  getSwitchStage,
  getSwitchStepLabel,
  profileName,
} from "../utils";
import { AppMark, Icon } from "./Icons";
import { Modal } from "./Modal";
import { StatusPill } from "./StatusPill";

interface SwitchConfirmModalProps {
  state: AppState;
  operation: SwitchOperation | null;
  working?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SwitchConfirmModal({
  state,
  operation,
  working = false,
  onCancel,
  onConfirm,
}: SwitchConfirmModalProps) {
  const currentName = profileName(state.profiles, operation?.from_profile_id ?? state.active_profile_id);
  const targetName = profileName(state.profiles, operation?.to_profile_id);

  return (
    <Modal
      dismissible={!working}
      eyebrow="Potwierdzenie przełączenia"
      footer={
        <>
          <button
            className="button button--ghost"
            data-autofocus
            disabled={working}
            onClick={onCancel}
            type="button"
          >
            Anuluj
          </button>
          <button
            className="button button--primary"
            disabled={working}
            onClick={onConfirm}
            type="button"
          >
            <Icon name={working ? "loader" : "refresh"} size={16} />
            <span>{working ? "Uruchamianie…" : "Kontynuuj"}</span>
          </button>
        </>
      }
      icon={<Icon name="alert" size={21} />}
      onClose={onCancel}
      open={operation?.status === "awaiting_confirmation"}
      title="Antigravity zostanie zamknięty"
      description="Do bezpiecznego przełączenia profilu konieczne jest ponowne uruchomienie edytora."
    >
      <div className="switch-preview" aria-label={`Przełączenie z ${currentName} na ${targetName}`}>
        <div className="switch-preview__account">
          <span className="switch-preview__label">Obecnie</span>
          <strong>{currentName}</strong>
        </div>
        <span className="switch-preview__arrow" aria-hidden="true">
          <Icon name="refresh" size={18} />
        </span>
        <div className="switch-preview__account switch-preview__account--target">
          <span className="switch-preview__label">Po przełączeniu</span>
          <strong>{targetName}</strong>
        </div>
      </div>

      <div className="compact-alert compact-alert--warning">
        <Icon name="alert" size={17} />
        <span>
          Upewnij się, że wszystkie pliki w Antigravity są zapisane. Niezapisane zmiany mogą zostać utracone.
        </span>
      </div>
    </Modal>
  );
}

const userSteps = [
  "Przygotowywanie operacji",
  "Zamykanie Antigravity",
  "Zapisywanie obecnego profilu",
  "Ładowanie i sprawdzanie nowego profilu",
  "Kończenie i uruchamianie Antigravity",
];

interface SwitchProgressModalProps {
  state: AppState;
  operation: SwitchOperation | null;
}

export function SwitchProgressModal({ state, operation }: SwitchProgressModalProps) {
  const currentStage = getSwitchStage(operation?.current_step ?? 0);
  const targetName = profileName(state.profiles, operation?.to_profile_id);
  const open = operation?.status === "in_progress";

  return (
    <Modal
      className="modal-panel--progress"
      dismissible={false}
      eyebrow="Bezpieczna zmiana profilu"
      icon={<Icon name="refresh" size={21} />}
      onClose={() => undefined}
      open={open}
      title={`Przełączanie na „${targetName}”`}
      description="Zachowujemy dane obecnego konta i sprawdzamy spójność nowego profilu."
    >
      <div aria-atomic="true" aria-live="polite" className="operation-live-status">
        <Icon name="loader" size={17} />
        <span>{getSwitchStepLabel(operation?.current_step ?? 0)}…</span>
      </div>

      <div className="indeterminate-progress" aria-hidden="true">
        <span />
      </div>

      <ol className="operation-stepper" aria-label="Postęp przełączania konta">
        {userSteps.map((step, index) => {
          const status = index < currentStage ? "complete" : index === currentStage ? "current" : "pending";
          return (
            <li
              aria-current={status === "current" ? "step" : undefined}
              className={`operation-step operation-step--${status}`}
              key={step}
            >
              <span className="operation-step__marker" aria-hidden="true">
                {status === "complete" ? (
                  <Icon name="check" size={14} />
                ) : status === "current" ? (
                  <span className="operation-step__pulse" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="operation-step__label">{step}</span>
            </li>
          );
        })}
      </ol>

      <div className="operation-caution">
        <Icon name="shield" size={17} />
        <span>Nie zamykaj aplikacji podczas przełączania.</span>
      </div>

      <details className="technical-details">
        <summary>Szczegóły techniczne</summary>
        <dl>
          <div>
            <dt>Identyfikator operacji</dt>
            <dd>{operation?.operation_id ?? "—"}</dd>
          </div>
          <div>
            <dt>Krok systemowy</dt>
            <dd>{operation?.current_step ?? 0} / 9</dd>
          </div>
        </dl>
      </details>
    </Modal>
  );
}

interface RecoveryScreenProps {
  state: AppState;
  workingAction?: string | null;
  onResume: () => void;
  onRollback: () => void;
  onCopyDiagnostics: () => void;
}

export function RecoveryScreen({
  state,
  workingAction,
  onResume,
  onRollback,
  onCopyDiagnostics,
}: RecoveryScreenProps) {
  const recovery = state.recovery;
  if (!recovery?.required) return null;

  const resuming = workingAction === "recovery-resume";
  const rollingBack = workingAction === "recovery-rollback";
  const copying = workingAction === "diagnostics";
  const anyWorking = resuming || rollingBack;
  const fromName = profileName(state.profiles, recovery.from_profile_id);
  const toName = profileName(state.profiles, recovery.to_profile_id);

  return (
    <main className="recovery-screen">
      <div className="recovery-background" aria-hidden="true" />
      <div className="recovery-shell">
        <div className="recovery-brand">
          <AppMark size={34} />
          <span>Antigravity Account Switcher</span>
        </div>

        <section className="recovery-card" aria-labelledby="recovery-title">
          <div className="recovery-card__icon" aria-hidden="true">
            <Icon name="alert" size={30} />
          </div>
          <StatusPill tone="warning">Odzyskiwanie wymagane</StatusPill>
          <h1 id="recovery-title">Poprzednie przełączanie nie zostało dokończone</h1>
          <p className="recovery-card__lead">
            Operacja została przerwana na etapie: <strong>{getSwitchStepLabel(recovery.current_step)}</strong>.
            Wybierz bezpieczny sposób kontynuacji, zanim wrócisz do aplikacji.
          </p>

          {recovery.reason ? (
            <div className="compact-alert compact-alert--warning" role="status">
              <Icon name="info" size={17} />
              <span>{recovery.reason}</span>
            </div>
          ) : null}

          <div className="recovery-route" aria-label={`Odzyskiwanie z ${fromName} do ${toName}`}>
            <div><span>Poprzedni profil</span><strong>{fromName}</strong></div>
            <span className="recovery-route__line" aria-hidden="true" />
            <div><span>Profil docelowy</span><strong>{toName}</strong></div>
          </div>

          <div className="recovery-actions">
            <button
              className="recovery-action recovery-action--primary"
              disabled={!recovery.can_resume || anyWorking}
              onClick={onResume}
              type="button"
            >
              <span className="recovery-action__icon"><Icon name={resuming ? "loader" : "refresh"} /></span>
              <span>
                <strong>{resuming ? "Wznawianie…" : "Spróbuj dokończyć"}</strong>
                <small>Kontynuuj od bezpiecznego zapisanego etapu.</small>
              </span>
            </button>
            <button
              className="recovery-action"
              disabled={!recovery.can_rollback || anyWorking}
              onClick={onRollback}
              type="button"
            >
              <span className="recovery-action__icon"><Icon name={rollingBack ? "loader" : "shield"} /></span>
              <span>
                <strong>{rollingBack ? "Przywracanie…" : "Przywróć poprzedni stan"}</strong>
                <small>Wycofaj operację i ponownie aktywuj „{fromName}”.</small>
              </span>
            </button>
          </div>

          <div className="recovery-footer">
            <details className="technical-details">
              <summary>Pokaż szczegóły operacji</summary>
              <dl>
                <div><dt>Id operacji</dt><dd>{recovery.operation_id ?? "—"}</dd></div>
                <div><dt>Krok techniczny</dt><dd>{recovery.current_step} / 9</dd></div>
              </dl>
            </details>
            <button
              className="button button--ghost"
              disabled={copying || anyWorking}
              onClick={onCopyDiagnostics}
              type="button"
            >
              <Icon name={copying ? "loader" : "copy"} size={16} />
              <span>{copying ? "Kopiowanie…" : "Kopiuj diagnostykę"}</span>
            </button>
          </div>
        </section>
        <p className="recovery-security-note">
          <Icon name="shield" size={15} /> Normalny dostęp pozostaje zablokowany, aby chronić dane profili.
        </p>
      </div>
    </main>
  );
}
