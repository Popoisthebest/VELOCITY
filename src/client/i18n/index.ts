import ko from "./ko";
import en from "./en";

const langs: Record<string, Record<string, string>> = { ko, en };

let current = "ko";

export function setLanguage(lang: string) {
  if (lang && langs[lang]) current = lang;
}

export function t(key: string): string {
  return langs[current]?.[key] || en[key as keyof typeof en] || key;
}

export default t;
