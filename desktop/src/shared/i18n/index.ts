import en from "./en.json";
import es from "./es.json";

export type Language = "en" | "es";

export const translations = {
  en,
  es,
};

export type TranslationKey = keyof typeof en;
