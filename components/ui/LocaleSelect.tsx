"use client";

import type { ChangeEvent } from "react";

import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";

type LocaleSelectProps = {
  ariaLabel: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
};

export function LocaleSelect({ ariaLabel, locale, onLocaleChange }: LocaleSelectProps) {
  function changeLocale(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as Locale;
    const attributes = getLocaleAttributes(nextLocale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
    onLocaleChange(nextLocale);
  }

  return <select aria-label={ariaLabel} className="vp-locale-select" onChange={changeLocale} value={locale}>
    {localeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
}
