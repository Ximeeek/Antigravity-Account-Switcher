import type { ProfileSummary, TokenStatus } from "./types";
import { getLanguage, t, type TranslationKey } from "./i18n";

export const formatDateTime = (value?: string | null): string => {
  if (!value) return t("no_data");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("no_data");
  const locale = getLanguage() === "pl" ? "pl-PL" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const getInitials = (name: string): string => {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase(getLanguage() === "pl" ? "pl-PL" : "en-US"))
    .join("");
  return initials || "A";
};

export interface TokenPresentation {
  label: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
}

export const getTokenPresentation = (profile: ProfileSummary): TokenPresentation => {
  const tKeyMap: Record<TokenStatus, { labelKey: TranslationKey; tone: TokenPresentation["tone"] }> = {
    valid: { labelKey: "token_valid", tone: "success" },
    expiring: { labelKey: "token_expiring", tone: "warning" },
    expired: { labelKey: "token_expired", tone: "danger" },
    refreshing: { labelKey: "token_refreshing", tone: "info" },
    unknown: { labelKey: "token_unknown", tone: "neutral" },
  };

  const status = tKeyMap[profile.token_status] || tKeyMap.unknown;

  if (profile.has_refresh_token) {
    if (profile.token_status === "refreshing") {
      return {
        label: t("token_refreshing"),
        tone: "info",
        detail: t("token_refreshing_secure")
      };
    }
    return {
      label: t("token_auto_refresh"),
      detail: t("token_auto_refresh_desc"),
      tone: "success",
    };
  }

  const expiryTime = profile.token_expiry ? Date.parse(profile.token_expiry) : Number.NaN;

  if (!Number.isFinite(expiryTime)) {
    return {
      label: t(status.labelKey),
      tone: status.tone,
      detail:
        profile.token_status === "expired"
          ? t("token_relogin_needed")
          : t("token_no_expiry_info"),
    };
  }

  const remainingMinutes = Math.ceil((expiryTime - Date.now()) / 60_000);
  if (profile.token_status === "expired" || remainingMinutes <= 0) {
    return {
      label: t("token_expired"),
      tone: "danger",
      detail: t("token_expired_detail")
    };
  }
  if (profile.token_status === "expiring" || remainingMinutes <= 30) {
    return {
      label: t("token_expiring"),
      tone: "warning",
      detail: t("token_expiring_in", { minutes: String(Math.max(1, remainingMinutes)) }),
    };
  }
  if (profile.token_status === "refreshing") {
    return {
      label: t("token_refreshing"),
      tone: "info",
      detail: t("token_refreshing_secure")
    };
  }

  const locale = getLanguage() === "pl" ? "pl-PL" : "en-US";
  const formattedTime = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(expiryTime));

  return {
    label: t(status.labelKey),
    tone: status.tone,
    detail: t("token_valid_until", { time: formattedTime })
  };
};

export const getSwitchStage = (step: number): number => {
  if (step <= 1) return 0;
  if (step <= 3) return 1;
  if (step === 4) return 2;
  if (step <= 7) return 3;
  return 4;
};

export const getSwitchStepLabel = (step: number): string => {
  const keys: TranslationKey[] = [
    "step_preparing",
    "step_closing",
    "step_saving",
    "step_loading",
    "step_finishing",
  ];
  const key = keys[getSwitchStage(step)] ?? keys[0];
  return t(key);
};

export const profileName = (
  profiles: ProfileSummary[],
  profileId?: string | null,
): string =>
  profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
  t("selected_account");

export interface DisclaimerData {
  title: string;
  body: string;
  linksLabel: string;
  tosLink: string;
  geminiLink: string;
  fairUseLink: string;
}

export const getDisclaimerText = (): DisclaimerData => {
  const lang = getLanguage();
  if (lang === "pl") {
    return {
      title: "Zastrzeżenie prawne i zrzeczenie się odpowiedzialności",
      body: "Ta aplikacja służy wyłącznie do celów edukacyjnych i demonstracyjnych. Używanie jej w celach komercyjnych jest surowo zabronione pod żadnym pozorem. Deweloper nie ponosi żadnej odpowiedzialności (cywilnej, karnej ani żadnej innej) za szkody, blokady kont, utratę danych czy inne konsekwencje wynikające bezpośrednio lub pośrednio z użycia tego programu. Użytkownik korzysta z tej aplikacji wyłącznie na własne ryzyko. Użytkownik zobowiązany jest do pełnego przestrzegania Warunków korzystania z usług Google (ToS) oraz zasad Fair Use (Uczciwego Użytkowania). Korzystanie z aplikacji oznacza pełną akceptację tych warunków i zrzeczenie się wszelkich roszczeń wobec dewelopera.",
      linksLabel: "Wymagane regulaminy:",
      tosLink: "Warunki korzystania z Google",
      geminiLink: "Regulamin Google Gemini API",
      fairUseLink: "Zasady Google Abuse",
    };
  }
  return {
    title: "Legal Disclaimer & Waiver of Liability",
    body: "This application is provided strictly for educational and demonstrational purposes. Commercial use of this software is strictly prohibited under any circumstances. The developer hereby disclaims all liability for any actions, omissions, account terminations, data loss, or damages of any kind resulting from the use or misuse of this software. The user accepts sole and exclusive responsibility for all outcomes. The user must strictly comply with all Google Terms of Service (ToS) and Google's Fair Use/Anti-Abuse policies. By using this software, you agree to waive any and all claims against the developer.",
    linksLabel: "Mandatory Policies:",
    tosLink: "Google Terms of Service",
    geminiLink: "Google Gemini API Terms",
    fairUseLink: "Google Anti-Abuse Policies",
  };
};
