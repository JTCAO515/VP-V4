"use client";

import { useEffect, useState } from "react";

import { getLocaleAttributes, immersiveHomepageCopy, localeOptions, type Locale } from "@/lib/i18n";

import styles from "./ImmersiveHomepage.module.css";

export function ImmersiveHomepage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const content = immersiveHomepageCopy[locale];

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  return (
    <main className={styles.page}>
      <div className={styles.landscape} aria-label={content.landmarkAlt} role="img">
        <span className={`${styles.mountain} ${styles.mountainFar}`} />
        <span className={`${styles.mountain} ${styles.mountainNear}`} />
        <span className={styles.sunrise} />
        <span className={styles.wall}><i /><i /><i /></span>
      </div>
      <div className={styles.topFade} />
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label={content.home}>VisePanda.</a>
        <nav className={styles.navigation} aria-label={content.navigation}>
          {content.nav.map((label) => <a href="/homepage" key={label}>{label}</a>)}
        </nav>
        <label className={styles.locale}>
          <span className={styles.srOnly}>{content.language}</span>
          <select aria-label={content.language} onChange={(event) => setLocale(event.target.value as Locale)} value={locale}>
            {localeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </header>
      <section className={styles.hero} aria-labelledby="immersive-home-title">
        <p className={styles.kicker}>{content.kicker}</p>
        <h1 id="immersive-home-title">{content.title}</h1>
        <p className={styles.subtitle}>{content.subtitle}</p>
        <div className={styles.promptCard} aria-label={content.promptHint}>
          <span className={styles.attachment} aria-label={content.attachment} title={content.attachment}>＋</span>
          <p>{content.prompt}</p>
          <span className={styles.promptHint}>{content.promptHint}</span>
        </div>
        <div className={styles.actions}>
          <a className={styles.primaryAction} href="/visepanda">{content.open} <span aria-hidden="true">↗</span></a>
          <a className={styles.guideAction} href="/homepage">{content.guide} <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </main>
  );
}
