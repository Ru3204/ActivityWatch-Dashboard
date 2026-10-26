import { useMemo, useState, type PropsWithChildren } from "react";
import type { Locale } from "@shared/types";
import { LocaleContext } from "./locale-context";
import { translations, type TranslationKey } from "./translations";

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("tempo-locale");
    return saved === "en" ? "en" : "zh-CN";
  });
  const value = useMemo(() => ({
    locale,
    setLocale: (next: Locale) => {
      localStorage.setItem("tempo-locale", next);
      document.documentElement.lang = next;
      setLocaleState(next);
    },
    t: (key: TranslationKey) => translations[locale][key],
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

