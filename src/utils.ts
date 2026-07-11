import type { ProfileSummary, TokenStatus } from "./types";

const dateTimeFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDateTime = (value?: string | null): string => {
  if (!value) return "Brak danych";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Brak danych" : dateTimeFormatter.format(date);
};

export const getInitials = (name: string): string => {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pl-PL"))
    .join("");
  return initials || "A";
};

export interface TokenPresentation {
  label: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
}

const statusLabels: Record<TokenStatus, Omit<TokenPresentation, "detail">> = {
  valid: { label: "Token ważny", tone: "success" },
  expiring: { label: "Wygasa wkrótce", tone: "warning" },
  expired: { label: "Wymaga logowania", tone: "danger" },
  refreshing: { label: "Odświeżanie", tone: "info" },
  unknown: { label: "Status nieznany", tone: "neutral" },
};

export const getTokenPresentation = (profile: ProfileSummary): TokenPresentation => {
  const base = statusLabels[profile.token_status];
  const expiryTime = profile.token_expiry ? Date.parse(profile.token_expiry) : Number.NaN;

  if (!Number.isFinite(expiryTime)) {
    return {
      ...base,
      detail:
        profile.token_status === "expired"
          ? "Zaloguj konto ponownie w Antigravity"
          : "Brak informacji o wygaśnięciu",
    };
  }

  const remainingMinutes = Math.ceil((expiryTime - Date.now()) / 60_000);
  if (profile.token_status === "expired" || remainingMinutes <= 0) {
    return { ...statusLabels.expired, detail: "Token wygasł" };
  }
  if (profile.token_status === "expiring" || remainingMinutes <= 30) {
    return {
      ...statusLabels.expiring,
      detail: `Wygasa za ${Math.max(1, remainingMinutes)} min`,
    };
  }
  if (profile.token_status === "refreshing") {
    return { ...base, detail: "Bezpieczne odświeżanie tokenu" };
  }
  return { ...base, detail: `Ważny do ${timeFormatter.format(new Date(expiryTime))}` };
};

export const getSwitchStage = (step: number): number => {
  if (step <= 1) return 0;
  if (step <= 3) return 1;
  if (step === 4) return 2;
  if (step <= 7) return 3;
  return 4;
};

export const getSwitchStepLabel = (step: number): string => {
  const labels = [
    "Przygotowywanie operacji",
    "Zamykanie Antigravity",
    "Zapisywanie obecnego profilu",
    "Ładowanie i sprawdzanie nowego profilu",
    "Kończenie i uruchamianie Antigravity",
  ];
  return labels[getSwitchStage(step)] ?? labels[0];
};

export const profileName = (
  profiles: ProfileSummary[],
  profileId?: string | null,
): string =>
  profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
  "wybrane konto";
