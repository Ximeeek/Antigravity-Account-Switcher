/**
 * Translation and localization manager.
 * Handles current language state, local storage persistence, and string interpolation.
 * Main exports: t, getLanguage, setLanguage, Language, TranslationKey
 */

import pl from "./locales/pl.json";
import en from "./locales/en.json";

export type Language = "pl" | "en";

let currentLanguage: Language = "pl";

// Detect initial language from localStorage or browser preferences
if (typeof window !== "undefined") {
  const saved = localStorage.getItem("app_lang") as Language;
  if (saved === "pl" || saved === "en") {
    currentLanguage = saved;
  } else {
    currentLanguage = navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en";
  }
}

export const getLanguage = (): Language => currentLanguage;

export const setLanguage = (lang: Language) => {
  currentLanguage = lang;
  if (typeof window !== "undefined") {
    localStorage.setItem("app_lang", lang);
  }
};

export const translations = {
  pl: pl as Record<string, string>,
  en: en as Record<string, string>,
};

export type TranslationKey = keyof typeof pl;

export const t = (key: TranslationKey, variables?: Record<string, string>): string => {
  const lang = getLanguage();
  let text = translations[lang][key] || translations["pl"][key] || key;
  if (variables) {
    Object.entries(variables).forEach(([name, val]) => {
      text = text.replace(`{${name}}`, val);
    });
  }
  return text;
};
