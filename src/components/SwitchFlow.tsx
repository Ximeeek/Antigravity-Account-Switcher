import type { AppState, SwitchOperation } from "../types";
import {
  getSwitchStage,
  getSwitchStepLabel,
  profileName,
} from "../utils";
import { AppMark, Icon } from "./Icons";
import { Modal } from "./Modal";
import { StatusPill } from "./StatusPill";
import { t } from "../i18n";

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
      eyebrow={t("confirm_modal_eyebrow")}
      footer={
        <>
          <button
            className="button button--ghost"
            data-autofocus
            disabled={working}
            onClick={onCancel}
            type="button"
          >
            {t("confirm_modal_cancel")}
          </button>
          <button
            className="button button--primary"
            disabled={working}
            onClick={onConfirm}
            type="button"
          >
            <Icon name={working ? "loader" : "refresh"} size={16} />
            <span>{working ? t("confirm_modal_confirming") : t("confirm_modal_confirm")}</span>
          </button>
        </>
      }
      icon={<Icon name="alert" size={21} />}
      onClose={onCancel}
      open={operation?.status === "awaiting_confirmation"}
      title={t("confirm_modal_title")}
      description={t("confirm_modal_desc")}
    >
      <div className="switch-preview" aria-label={t("aria_switching_from_to", { from: currentName, to: targetName })}>
        <div className="switch-preview__account">
          <span className="switch-preview__label">{t("confirm_modal_current")}</span>
          <strong>{currentName}</strong>
        </div>
        <span className="switch-preview__arrow" aria-hidden="true">
          <Icon name="refresh" size={18} />
        </span>
        <div className="switch-preview__account switch-preview__account--target">
          <span className="switch-preview__label">{t("confirm_modal_target")}</span>
          <strong>{targetName}</strong>
        </div>
      </div>

      <div className="compact-alert compact-alert--warning">
        <Icon name="alert" size={17} />
        <span>
          {t("confirm_modal_warning")}
        </span>
      </div>
    </Modal>
  );
}

interface SwitchProgressModalProps {
  state: AppState;
  operation: SwitchOperation | null;
}

export function SwitchProgressModal({ state, operation }: SwitchProgressModalProps) {
  const currentStage = getSwitchStage(operation?.current_step ?? 0);
  const targetName = profileName(state.profiles, operation?.to_profile_id);
  const open = operation?.status === "in_progress";

  const isFast = state.settings.switch_level === 2 || state.settings.switch_level === 3;
  const userSteps = [
    t("step_preparing"),
    isFast ? t("step_closing_fast") : t("step_closing"),
    t("step_saving"),
    t("step_loading"),
    isFast ? t("step_finishing_fast") : t("step_finishing"),
  ];

  return (
    <Modal
      className="modal-panel--progress"
      dismissible={false}
      eyebrow={t("progress_modal_eyebrow")}
      icon={<Icon name="refresh" size={21} />}
      onClose={() => undefined}
      open={open}
      title={t("progress_modal_title", { name: targetName })}
      description={t("progress_modal_desc")}
    >
      <div aria-atomic="true" aria-live="polite" className="operation-live-status">
        <Icon name="loader" size={17} />
        <span>{getSwitchStepLabel(operation?.current_step ?? 0, state.settings.switch_level)}…</span>
      </div>

      <div className="indeterminate-progress" aria-hidden="true">
        <span />
      </div>

      <ol className="operation-stepper" aria-label={t("aria_switch_progress")}>
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
        <span>{t("progress_modal_caution")}</span>
      </div>

      <details className="technical-details">
        <summary>{t("progress_modal_technical")}</summary>
        <dl>
          <div>
            <dt>{t("progress_modal_op_id")}</dt>
            <dd>{operation?.operation_id ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("progress_modal_step")}</dt>
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
          <span>{t("recovery_title_brand")}</span>
        </div>

        <section className="recovery-card" aria-labelledby="recovery-title">
          <div className="recovery-card__icon" aria-hidden="true">
            <Icon name="alert" size={30} />
          </div>
          <StatusPill tone="warning">{t("recovery_required")}</StatusPill>
          <h1 id="recovery-title">{t("recovery_title")}</h1>
          <p className="recovery-card__lead">
            {t("recovery_desc", { step: getSwitchStepLabel(recovery.current_step, state.settings.switch_level) })}
          </p>

          {recovery.reason ? (
            <div className="compact-alert compact-alert--warning" role="status">
              <Icon name="info" size={17} />
              <span>{recovery.reason}</span>
            </div>
          ) : null}

          <div className="recovery-route" aria-label={`Odzyskiwanie z ${fromName} do ${toName}`}>
            <div><span>{t("recovery_prev_profile")}</span><strong>{fromName}</strong></div>
            <span className="recovery-route__line" aria-hidden="true" />
            <div><span>{t("recovery_target_profile")}</span><strong>{toName}</strong></div>
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
                <strong>{resuming ? t("recovery_resuming") : t("recovery_resume")}</strong>
                <small>{t("recovery_resume_desc")}</small>
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
                <strong>{rollingBack ? t("recovery_rolling_back") : t("recovery_rollback")}</strong>
                <small>{t("recovery_rollback_desc", { name: fromName })}</small>
              </span>
            </button>
          </div>

          <div className="recovery-footer">
            <details className="technical-details">
              <summary>{t("recovery_technical")}</summary>
              <dl>
                <div><dt>{t("recovery_op_id")}</dt><dd>{recovery.operation_id ?? "—"}</dd></div>
                <div><dt>{t("recovery_step")}</dt><dd>{recovery.current_step} / 9</dd></div>
              </dl>
            </details>
            <button
              className="button button--ghost"
              disabled={copying || anyWorking}
              onClick={onCopyDiagnostics}
              type="button"
            >
              <Icon name={copying ? "loader" : "copy"} size={16} />
              <span>{copying ? t("recovery_copying") : t("recovery_copy")}</span>
            </button>
          </div>
        </section>
        <p className="recovery-security-note">
          <Icon name="shield" size={15} /> {t("recovery_security")}
        </p>
      </div>
    </main>
  );
}
