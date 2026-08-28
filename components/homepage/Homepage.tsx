"use client";

import { useEffect, useMemo, useState } from "react";

import { copy, getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";

import styles from "./Homepage.module.css";

function GoldenRoute({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 760 260"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10 190C120 252 178 56 302 106c92 38 83 135 180 94 109-47 108-157 268-96" stroke="currentColor" strokeLinecap="round" strokeWidth="9" />
      <circle cx="10" cy="190" fill="currentColor" r="11" />
      <circle cx="750" cy="104" fill="currentColor" r="11" />
    </svg>
  );
}

export function Homepage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const content = copy[locale];
  const visibleFaqs = useMemo(
    () => content.faq.items.filter((_, index) => !new Set([6, 11]).has(index)),
    [content.faq.items],
  );

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  const routeStages = [
    { number: "01", title: content.features.items[0][0], body: content.features.items[0][1] },
    { number: "02", title: content.features.items[1][0], body: content.features.items[1][1] },
    { number: "03", title: content.features.items[2][0], body: content.features.items[2][1] },
  ];

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <header className={styles.header}>
          <a className={styles.wordmark} href="#top" aria-label={content.header.home}>
            VisePanda.
          </a>
          <nav className={styles.navigation} aria-label={content.header.productMenu}>
            <a href="#golden-route">{content.features.more}</a>
            <a href="#guide">{content.human.cta}</a>
            <a href="/auth/sign-in">{content.auth.submit}</a>
            <label className={styles.localeLabel}>
              <span className={styles.srOnly}>{content.header.language}</span>
              <select aria-label={content.header.language} onChange={(event) => setLocale(event.target.value as Locale)} value={locale}>
                {localeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </nav>
        </header>

        <div className={styles.heroGrid} id="top">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{content.human.eyebrow}</p>
            <h1 id="home-title">{content.hero.title}</h1>
            <p className={styles.heroLead}>{content.hero.subtitle}</p>
            <div className={styles.actions}>
              <a className={styles.primaryAction} href="/visepanda">
                Open VisePanda <span aria-hidden="true">↗</span>
              </a>
              <a className={styles.secondaryAction} href="/auth/sign-in">
                {content.auth.submit}
              </a>
            </div>
            <p className={styles.boundary}>{content.planner.expanded}</p>
          </div>

          <div className={styles.heroVisual} aria-label={content.destinations.title} role="img">
            <div className={styles.scenicWindow}>
              <span className={styles.sceneSun} />
              <span className={`${styles.sceneHill} ${styles.sceneHillFar}`} />
              <span className={`${styles.sceneHill} ${styles.sceneHillNear}`} />
              <span className={styles.sceneTemple} />
            </div>
            <div className={styles.guideNote}>
              <span>{content.human.eyebrow}</span>
              <strong>{content.human.title}</strong>
            </div>
            <GoldenRoute className={styles.heroRoute} />
          </div>
        </div>
      </section>

      <section className={styles.routeSection} id="golden-route" aria-labelledby="route-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Golden Route</p>
          <h2 id="route-title">{content.features.title}</h2>
          <p>{content.features.subtitle}</p>
        </div>
        <div className={styles.routeList}>
          {routeStages.map((stage) => (
            <article className={styles.routeStage} key={stage.number}>
              <span className={styles.stageNumber}>{stage.number}</span>
              <div>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.guideSection} id="guide" aria-labelledby="guide-title">
        <div className={styles.guideArtwork}>
          <div className={styles.guideSun} />
          <GoldenRoute className={styles.guideRoute} />
          <p>PLAN · REVIEW · GO</p>
        </div>
        <div className={styles.guideCopy}>
          <p className={styles.eyebrow}>{content.human.eyebrow}</p>
          <h2 id="guide-title">{content.human.title}</h2>
          <p>{content.human.body}</p>
          <p className={styles.careNote}>{content.human.toast}</p>
        </div>
      </section>

      <section className={styles.productSection} aria-labelledby="product-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{content.human.eyebrow}</p>
          <h2 id="product-title">{content.planner.title}</h2>
          <p>{content.planner.base}</p>
        </div>
        <div className={styles.productFlow}>
          <div className={styles.flowPanel}>
            <span>01</span>
            <h3>{routeStages[0].title}</h3>
            <p>{routeStages[0].body}</p>
          </div>
          <div className={styles.flowConnector} aria-hidden="true">→</div>
          <div className={styles.flowPanel}>
            <span>02</span>
            <h3>{routeStages[1].title}</h3>
            <p>{routeStages[1].body}</p>
          </div>
          <div className={styles.flowConnector} aria-hidden="true">→</div>
          <div className={styles.flowPanel}>
            <span>03</span>
            <h3>{routeStages[2].title}</h3>
            <p>{routeStages[2].body}</p>
          </div>
        </div>
        <p className={styles.mapOff}>{content.planner.expanded}</p>
      </section>

      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{content.features.more}</p>
          <h2 id="faq-title">{content.faq.title}</h2>
          <p>{content.faq.subtitle}</p>
        </div>
        <div className={styles.faqList}>
          {visibleFaqs.map(([question, answer], index) => {
            const isOpen = openFaq === index;
            return (
              <article className={styles.faqItem} key={question}>
                <h3>
                  <button aria-expanded={isOpen} aria-controls={`faq-panel-${index}`} onClick={() => setOpenFaq(isOpen ? null : index)} type="button">
                    <span>{question}</span>
                    <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                  </button>
                </h3>
                <div hidden={!isOpen} id={`faq-panel-${index}`}>
                  <p>{answer}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
        <GoldenRoute className={styles.finalRoute} />
        <p className={styles.eyebrow}>{content.human.eyebrow}</p>
        <h2 id="final-cta-title">{content.cta.title}</h2>
        <p>{content.cta.body}</p>
        <a className={styles.primaryAction} href="/visepanda">
          Open VisePanda <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="#top">VisePanda.</a>
        <p>{content.footer.tagline}</p>
        <div className={styles.footerLinks}>
          {content.footer.columns.slice(0, 3).map(([label]) => (
            <a href="#top" key={label}>{label}</a>
          ))}
        </div>
      </footer>
    </main>
  );
}
