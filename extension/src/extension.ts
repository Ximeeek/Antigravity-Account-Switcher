import * as http from "node:http";
import { performance } from "node:perf_hooks";
import * as vscode from "vscode";

const CONFIG_SECTION = "antigravityAccountSwitcher";
const MAX_RESPONSE_BYTES = 1024 * 1024;

type EngineStatus = "ready" | "busy" | "error" | "recovery" | "unknown";
type TokenStatus = "valid" | "expiring" | "expired" | "unknown";

interface ProfileSummary {
  profileId: string;
  displayName: string;
  accountEmail?: string;
  tokenStatus: TokenStatus;
}

interface SwitcherStatus {
  engineStatus: EngineStatus;
  activeProfile?: ProfileSummary;
  profiles: ProfileSummary[];
  message?: string;
}

interface WireProfile {
  profileId?: unknown;
  profile_id?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  accountEmail?: unknown;
  account_email?: unknown;
  tokenStatus?: unknown;
  token_status?: unknown;
}

interface WireStatus {
  engineStatus?: unknown;
  engine_status?: unknown;
  recoveryRequired?: unknown;
  recovery_required?: unknown;
  activeProfile?: unknown;
  active_profile?: unknown;
  profiles?: unknown;
  message?: unknown;
}

interface ActivationResponse {
  accepted?: boolean;
  operationId?: string;
  message?: string;
}

interface ClientSettings {
  port: number;
  apiSecret: string;
  timeoutMs: number;
}

interface RequestResult<T> {
  body: T;
  statusCode: number;
}

class ConfigurationError extends Error {}

class LocalApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
  }
}

class LocalApiClient {
  constructor(private readonly output: vscode.OutputChannel) {}

  async getStatus(): Promise<SwitcherStatus> {
    const result = await this.requestJson<WireStatus>("GET", "/api/v1/status");
    return normalizeStatus(result.body);
  }

  async showApp(): Promise<void> {
    await this.requestJson<unknown>("POST", "/api/v1/app/show");
  }

  async activateProfile(profileId: string): Promise<ActivationResponse> {
    const path = `/api/v1/profiles/${encodeURIComponent(profileId)}/activate`;
    const result = await this.requestJson<ActivationResponse>("POST", path, {
      source: "extension",
    });
    return result.body ?? {};
  }

  private requestJson<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<RequestResult<T>> {
    const settings = readSettings();
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
    const startedAt = performance.now();

    return new Promise<RequestResult<T>>((resolve, reject) => {
      let finished = false;
      const finish = (callback: () => void): void => {
        if (finished) {
          return;
        }
        finished = true;
        callback();
      };

      const request = http.request(
        {
          protocol: "http:",
          hostname: "127.0.0.1",
          port: settings.port,
          method,
          path,
          agent: false,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${settings.apiSecret}`,
            ...(payload === undefined
              ? {}
              : {
                  "Content-Type": "application/json; charset=utf-8",
                  "Content-Length": payload.byteLength,
                }),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let receivedBytes = 0;

          response.on("data", (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            receivedBytes += buffer.byteLength;
            if (receivedBytes > MAX_RESPONSE_BYTES) {
              request.destroy(new LocalApiError("Odpowiedź lokalnego API jest zbyt duża."));
              return;
            }
            chunks.push(buffer);
          });

          response.on("end", () => {
            const statusCode = response.statusCode ?? 0;
            const durationMs = Math.round(performance.now() - startedAt);
            this.output.appendLine(
              `[${new Date().toISOString()}] ${method} ${path} -> ${statusCode} (${durationMs} ms)`,
            );

            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: unknown;
            if (text.length > 0) {
              try {
                parsed = JSON.parse(text);
              } catch {
                finish(() => reject(new LocalApiError("Lokalne API zwróciło nieprawidłowy JSON.", statusCode)));
                return;
              }
            }

            if (statusCode < 200 || statusCode >= 300) {
              const serverMessage = getServerMessage(parsed);
              finish(() => reject(new LocalApiError(serverMessage ?? httpStatusMessage(statusCode), statusCode)));
              return;
            }

            finish(() => resolve({ body: parsed as T, statusCode }));
          });
        },
      );

      request.setTimeout(settings.timeoutMs, () => {
        request.destroy(new LocalApiError(`Lokalne API nie odpowiedziało w ciągu ${settings.timeoutMs} ms.`));
      });

      request.on("error", (error: Error) => {
        const durationMs = Math.round(performance.now() - startedAt);
        this.output.appendLine(
          `[${new Date().toISOString()}] ${method} ${path} -> ERROR (${durationMs} ms): ${safeErrorForLog(error)}`,
        );
        finish(() => reject(normalizeNetworkError(error)));
      });

      if (payload !== undefined) {
        request.write(payload);
      }
      request.end();
    });
  }
}

class SwitcherController implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly statusBar: vscode.StatusBarItem;
  private operationInFlight = false;

  constructor(
    private readonly client: LocalApiClient,
  ) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = "antigravityAccountSwitcher.activateProfile";
    this.statusBar.name = "Antigravity Account Switcher";
    this.setStatusBarLoading();
    this.statusBar.show();

    this.disposables.push(
      this.statusBar,
      vscode.commands.registerCommand("antigravityAccountSwitcher.refresh", () => this.refresh(true)),
      vscode.commands.registerCommand("antigravityAccountSwitcher.openSwitcher", () => this.openSwitcher()),
      vscode.commands.registerCommand(
        "antigravityAccountSwitcher.activateProfile",
        (profileId?: unknown) => this.chooseAndActivate(typeof profileId === "string" ? profileId : undefined),
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(CONFIG_SECTION)) {
          void this.refresh(false);
        }
      }),
    );
  }

  async initialize(): Promise<void> {
    await this.refresh(false);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async refresh(showSuccess: boolean): Promise<SwitcherStatus | undefined> {
    this.setStatusBarLoading();
    try {
      const status = await this.client.getStatus();
      this.renderStatus(status);
      if (showSuccess) {
        void vscode.window.showInformationMessage("Stan Antigravity Account Switcher został odświeżony.");
      }
      return status;
    } catch (error) {
      this.renderOffline(error);
      if (showSuccess) {
        await showReadableError("Nie udało się odświeżyć stanu", error);
      }
      return undefined;
    }
  }

  private async openSwitcher(): Promise<void> {
    if (this.operationInFlight) {
      return;
    }
    this.operationInFlight = true;
    try {
      await this.client.showApp();
    } catch (error) {
      await showReadableError("Nie udało się otworzyć aplikacji", error);
    } finally {
      this.operationInFlight = false;
    }
  }

  private async chooseAndActivate(requestedProfileId?: string): Promise<void> {
    if (this.operationInFlight) {
      void vscode.window.showInformationMessage("Inna operacja Antigravity Account Switcher jest już w toku.");
      return;
    }

    this.operationInFlight = true;
    try {
      const status = await this.refresh(false);
      if (status === undefined) {
        await showReadableError(
          "Nie można pobrać listy profili",
          new LocalApiError("Uruchom aplikację desktopową i sprawdź konfigurację połączenia."),
        );
        return;
      }

      if (status.engineStatus === "recovery") {
        const action = await vscode.window.showErrorMessage(
          "Aplikacja wymaga odzyskania przerwanej operacji. Otwórz aplikację desktopową, aby kontynuować.",
          "Otwórz aplikację",
        );
        if (action === "Otwórz aplikację") {
          await this.client.showApp();
        }
        return;
      }

      if (status.engineStatus === "busy") {
        void vscode.window.showInformationMessage("Przełączanie profilu jest już w toku.");
        return;
      }

      if (status.engineStatus === "unknown") {
        const action = await vscode.window.showErrorMessage(
          status.message ?? "Wtyczka nie rozpoznaje stanu tej wersji aplikacji desktopowej.",
          "Otwórz aplikację",
        );
        if (action === "Otwórz aplikację") {
          await this.client.showApp();
        }
        return;
      }

      const candidates = status.profiles.filter(
        (profile) => profile.profileId !== status.activeProfile?.profileId,
      );
      if (candidates.length === 0) {
        void vscode.window.showInformationMessage("Brak innego profilu do aktywacji.");
        return;
      }

      let selected: ProfileSummary | undefined;
      if (requestedProfileId !== undefined) {
        selected = candidates.find((profile) => profile.profileId === requestedProfileId);
        if (selected === undefined) {
          throw new LocalApiError("Wybrany profil nie istnieje albo jest już aktywny.");
        }
      } else {
        selected = await this.showProfilePicker(candidates);
      }

      if (selected === undefined) {
        return;
      }

      const confirmation = await vscode.window.showWarningMessage(
        `Aktywować profil „${selected.displayName}”? Antigravity zostanie zamknięty. Upewnij się, że praca jest zapisana.`,
        { modal: true },
        "Kontynuuj",
        "Anuluj",
      );
      if (confirmation !== "Kontynuuj") {
        return;
      }

      this.statusBar.text = "$(sync~spin) Przełączanie profilu…";
      this.statusBar.tooltip = "Operacja została zlecona aplikacji desktopowej.";
      const response = await this.client.activateProfile(selected.profileId);
      if (response.accepted === false) {
        throw new LocalApiError(response.message ?? "Aplikacja desktopowa nie przyjęła operacji.");
      }
      const message = response.message ?? "Rozpoczęto ręczne przełączanie profilu.";
      void vscode.window.showInformationMessage(message);
    } catch (error) {
      await showReadableError("Nie udało się aktywować profilu", error);
      await this.refresh(false);
    } finally {
      this.operationInFlight = false;
    }
  }

  private async showProfilePicker(profiles: ProfileSummary[]): Promise<ProfileSummary | undefined> {
    type ProfileItem = vscode.QuickPickItem & { profile: ProfileSummary };
    const items: ProfileItem[] = profiles.map((profile) => ({
      label: `$(account) ${profile.displayName}`,
      description: tokenStatusLabel(profile.tokenStatus),
      detail: profile.accountEmail,
      profile,
    }));

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: "Wybierz profil do ręcznej aktywacji",
      matchOnDescription: true,
      matchOnDetail: true,
      ignoreFocusOut: true,
    });
    return selection?.profile;
  }

  private setStatusBarLoading(): void {
    this.statusBar.text = "$(sync~spin) Antigravity: sprawdzanie…";
    this.statusBar.tooltip = "Łączenie z lokalną aplikacją Antigravity Account Switcher.";
    this.statusBar.backgroundColor = undefined;
  }

  private renderStatus(status: SwitcherStatus): void {
    const activeName = status.activeProfile?.displayName ?? "brak profilu";
    const prefix = status.engineStatus === "busy" ? "$(sync~spin)" : status.engineStatus === "error" ? "$(error)" : "$(account)";
    this.statusBar.text = `${prefix} Antigravity: ${activeName}`;
    this.statusBar.tooltip = status.message ?? statusTooltip(status);
    this.statusBar.backgroundColor =
      status.engineStatus === "error" || status.engineStatus === "recovery"
        ? new vscode.ThemeColor("statusBarItem.errorBackground")
        : status.engineStatus === "busy"
          ? new vscode.ThemeColor("statusBarItem.warningBackground")
          : undefined;
  }

  private renderOffline(error: unknown): void {
    this.statusBar.text = "$(debug-disconnect) Antigravity: offline";
    this.statusBar.tooltip = readableError(error);
    this.statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Antigravity Account Switcher");
  const client = new LocalApiClient(output);
  const controller = new SwitcherController(client);
  context.subscriptions.push(output, controller);
  void controller.initialize();
}

export function deactivate(): void {
  // Resources are registered in ExtensionContext.subscriptions.
}

function readSettings(): ClientSettings {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const port = config.get<number>("port", 48731);
  const apiSecret = config.get<string>("apiSecret", "").trim();
  const timeoutMs = config.get<number>("requestTimeoutMs", 5000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError("Port lokalnego API musi być liczbą całkowitą od 1 do 65535.");
  }
  if (apiSecret.length === 0) {
    throw new ConfigurationError(
      "Brak ustawienia antigravityAccountSwitcher.apiSecret. Skopiuj sekret z aplikacji desktopowej.",
    );
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30000) {
    throw new ConfigurationError("Limit czasu żądania musi mieścić się między 500 a 30000 ms.");
  }

  return { port, apiSecret, timeoutMs };
}

function normalizeStatus(wire: WireStatus): SwitcherStatus {
  if (!isRecord(wire)) {
    throw new LocalApiError("Lokalne API zwróciło nieprawidłowy opis stanu.");
  }

  const profilesValue = wire.profiles;
  if (!Array.isArray(profilesValue)) {
    throw new LocalApiError("W odpowiedzi lokalnego API brakuje listy profili.");
  }

  const profiles = profilesValue.map((profile) => normalizeProfile(profile));
  const activeValue = wire.activeProfile ?? wire.active_profile;
  const activeProfile = activeValue === null || activeValue === undefined ? undefined : normalizeProfile(activeValue);
  const recoveryRequired = wire.recoveryRequired ?? wire.recovery_required;
  const engineStatus = recoveryRequired === true ? "recovery" : normalizeEngineStatus(wire.engineStatus ?? wire.engine_status);
  const message = typeof wire.message === "string" ? wire.message : undefined;
  return { engineStatus, activeProfile, profiles, message };
}

function normalizeProfile(value: unknown): ProfileSummary {
  if (!isRecord(value)) {
    throw new LocalApiError("Lokalne API zwróciło nieprawidłowy profil.");
  }
  const wire = value as WireProfile;
  const profileId = wire.profileId ?? wire.profile_id;
  const displayName = wire.displayName ?? wire.display_name;
  const accountEmail = wire.accountEmail ?? wire.account_email;
  const tokenStatus = wire.tokenStatus ?? wire.token_status;

  if (typeof profileId !== "string" || profileId.length === 0 || typeof displayName !== "string" || displayName.length === 0) {
    throw new LocalApiError("Profil z lokalnego API nie ma identyfikatora albo nazwy.");
  }

  return {
    profileId,
    displayName,
    accountEmail: typeof accountEmail === "string" && accountEmail.length > 0 ? accountEmail : undefined,
    tokenStatus: normalizeTokenStatus(tokenStatus),
  };
}

function normalizeEngineStatus(value: unknown): EngineStatus {
  if (value === "working" || value === "busy") {
    return "busy";
  }
  if (value === "attention" || value === "error") {
    return "error";
  }
  return value === "ready" || value === "recovery" ? value : "unknown";
}

function normalizeTokenStatus(value: unknown): TokenStatus {
  if (value === "expiring_soon" || value === "expiring") {
    return "expiring";
  }
  return value === "valid" || value === "expired" ? value : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getServerMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const message = value.message ?? value.error;
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

function httpStatusMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "Aplikacja odrzuciła nieprawidłowe żądanie.";
    case 401:
    case 403:
      return "Lokalne API odrzuciło sekret Bearer. Sprawdź konfigurację wtyczki.";
    case 404:
      return "Wersja aplikacji desktopowej nie obsługuje tego polecenia.";
    case 409:
      return "Inna operacja przełączania jest już w toku.";
    case 423:
      return "Aplikacja wymaga odzyskania poprzedniej operacji.";
    case 429:
      return "Lokalne API chwilowo odrzuciło żądanie. Ponów je ręcznie.";
    default:
      return `Lokalne API zwróciło błąd HTTP ${statusCode}.`;
  }
}

function normalizeNetworkError(error: Error): Error {
  if (error instanceof LocalApiError || error instanceof ConfigurationError) {
    return error;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED") {
    return new LocalApiError("Aplikacja desktopowa nie działa albo nasłuchuje na innym porcie.");
  }
  if (code === "ECONNRESET") {
    return new LocalApiError("Połączenie z aplikacją desktopową zostało przerwane.");
  }
  return new LocalApiError("Nie udało się połączyć z lokalną aplikacją desktopową.");
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Wystąpił nieznany błąd.";
}

async function showReadableError(prefix: string, error: unknown): Promise<void> {
  const message = `${prefix}: ${readableError(error)}`;
  const selection = await vscode.window.showErrorMessage(message, "Otwórz ustawienia");
  if (selection === "Otwórz ustawienia") {
    await vscode.commands.executeCommand("workbench.action.openSettings", CONFIG_SECTION);
  }
}

function safeErrorForLog(error: Error): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== undefined) {
    return code;
  }
  return error instanceof ConfigurationError || error instanceof LocalApiError ? error.message : error.name;
}

function tokenStatusLabel(status: TokenStatus): string {
  switch (status) {
    case "valid":
      return "Token ważny";
    case "expiring":
      return "Token wkrótce wygaśnie";
    case "expired":
      return "Token wygasł — wymagane logowanie";
    default:
      return "Stan tokenu nieznany";
  }
}

function statusTooltip(status: SwitcherStatus): string {
  const tokenStatus = status.activeProfile === undefined ? "brak aktywnego profilu" : tokenStatusLabel(status.activeProfile.tokenStatus);
  switch (status.engineStatus) {
    case "ready":
      return `Gotowy — ${tokenStatus}. Kliknij, aby ręcznie wybrać profil.`;
    case "busy":
      return "Operacja przełączania jest w toku.";
    case "recovery":
      return "Poprzednia operacja wymaga odzyskania w aplikacji desktopowej.";
    case "error":
      return "Aplikacja desktopowa zgłasza błąd wymagający uwagi.";
    default:
      return "Stan aplikacji desktopowej jest nieznany.";
  }
}
