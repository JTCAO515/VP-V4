"use client";

import { useEffect, useState } from "react";
import ProductDemo from "./ProductDemo";
import type { Lang } from "@/lib/journey-preview/copy";

export default function JourneyPreview() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    setLang(new URLSearchParams(window.location.search).get("lang") === "zh" ? "zh" : "en");
  }, []);
  useEffect(() => {
    const previous = { lang: document.documentElement.lang, dir: document.documentElement.dir };
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dir = "ltr";
    return () => { document.documentElement.lang = previous.lang; document.documentElement.dir = previous.dir; };
  }, [lang]);
  return <div className="journey-preview">
    <ProductDemo lang={lang} fullscreen standalone intent={null} onLanguageToggle={() => {
      const next = lang === "en" ? "zh" : "en";
      setLang(next);
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(null, "", url);
    }} />
  </div>;
}
