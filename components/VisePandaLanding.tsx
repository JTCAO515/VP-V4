"use client";

import Image from "next/image";
import {
  ArrowRight,
  ArrowUp,
  BedDouble,
  CircleDollarSign,
  CircleHelp,
  Diamond,
  FileText,
  HeartHandshake,
  Languages,
  LogIn,
  MessageCircle,
  Mic,
  Paperclip,
  Pause,
  Play,
  Plus,
  Send,
  Settings,
  Sparkles,
  Thermometer,
  UserRound,
  X,
  type IconComponent,
} from "@/components/icons";
import {
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import { copy as copyByLocale, localeOptions, type Locale, type LocalizedCopy } from "@/lib/i18n";

const ASSET_ROOT = "/assets/visepanda/";

type ModalKind = "language" | "display" | "cookies" | null;
type ToastSetter = (message: string) => void;

const tripImages = ["scene-beijing.jpg", "scene-shanghai-rain.jpg", "scene-guangzhou-local.jpg"];
const featureIcons: IconComponent[] = [HeartHandshake, CircleDollarSign, Diamond, UserRound];
const trustIcons: IconComponent[] = [FileText, UserRound, Settings, HeartHandshake];
const coverageIcons: IconComponent[] = [CircleHelp, Languages, MessageCircle, Diamond, CircleDollarSign, Thermometer, HeartHandshake];
const hiddenFaqIndexes = new Set([6, 11]);

function BrandClip() {
  return (
    <svg aria-hidden="true" className="clip-defs" focusable="false">
      <defs>
        <clipPath id="vp-clover" clipPathUnits="objectBoundingBox">
          <path
            d="M393 118.35C393 53.0155 339.983 0 274.539 0C244.647 0 217.299 11.1208 196.476 29.3838C175.653 11.1208 148.353 0 118.461 0C53.0173 0 0 52.9676 0 118.35C0 149.556 12.0908 177.885 31.8104 199.024C12.0908 220.163 0 248.492 0 279.698C0 345.032 53.0173 398.048 118.461 398.048C148.353 398.048 175.701 386.927 196.524 368.664C217.347 386.927 244.695 398.048 274.587 398.048C339.983 398.048 393.048 345.08 393.048 279.698C393.048 248.492 380.957 220.163 361.238 199.024C380.957 177.885 393.048 149.556 393.048 118.35H393Z"
            transform="scale(0.0025442185178400603, 0.002512259827960447)"
          />
        </clipPath>
      </defs>
    </svg>
  );
}

type OverlayProps = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

function Overlay({ title, closeLabel, onClose, children, wide = false }: OverlayProps) {
  const stopPropagation = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-label={title}
        onMouseDown={stopPropagation}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label={closeLabel}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

type HeaderProps = {
  copy: LocalizedCopy;
  openMenu: boolean;
  setOpenMenu: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<ModalKind>>;
  locale: Locale;
};

function Header({ copy, openMenu, setOpenMenu, setModal, locale }: HeaderProps) {
  const selectedLocale = localeOptions.find((option) => option.value === locale) ?? localeOptions[0];

  return (
    <nav className="site-nav">
      <a href="#top" className="logo-link" aria-label={copy.header.home}>
        <span className="brand-wordmark">VisePanda.</span>
      </a>
      <div className="desktop-nav-actions">
        <button className="currency-trigger" onClick={() => setModal("display")} aria-label={copy.header.preferences}>
          <span aria-hidden="true">{selectedLocale.currencySymbol}</span>
        </button>
        <button onClick={() => setModal("language")} aria-label={copy.header.language}>
          <span className="flag-icon" aria-hidden="true">{selectedLocale.flag}</span>
        </button>
        <button
          className="user-button"
          onClick={() => setOpenMenu((current) => !current)}
          aria-expanded={openMenu}
          aria-label={copy.header.openMenu}
        >
          <UserRound />
          <span>⌄</span>
        </button>
      </div>
      <button className="mobile-user" onClick={() => setOpenMenu(true)} aria-label={copy.header.openMenu}>
        <UserRound />
        <span>⌄</span>
      </button>
      {openMenu ? (
        <AccountMenu
          onClose={() => setOpenMenu(false)}
          setModal={setModal}
          copy={copy}
        />
      ) : null}
    </nav>
  );
}

type AccountMenuProps = {
  onClose: () => void;
  setModal: Dispatch<SetStateAction<ModalKind>>;
  copy: LocalizedCopy;
};

function AccountMenu({ onClose, setModal, copy }: AccountMenuProps) {
  const labels = copy.header.menu;
  const entries: Array<{ icon: IconComponent; label: string; action?: () => void }> = [
    { icon: LogIn, label: labels[0] },
    { icon: Plus, label: labels[1] },
    { icon: Settings, label: labels[2] },
    { icon: CircleDollarSign, label: labels[3], action: () => setModal("display") },
    { icon: Languages, label: labels[4], action: () => setModal("language") },
    { icon: CircleHelp, label: labels[5] },
    { icon: MessageCircle, label: labels[6] },
  ];

  return (
    <>
      <button className="menu-scrim" aria-label={copy.header.closeMenu} onClick={onClose} />
      <div className="account-menu" role="dialog" aria-label={copy.header.productMenu}>
        <div className="sheet-handle" />
        {entries.map(({ icon: Icon, label, action }, index) => (
          <button
            key={label}
            className={index === 5 ? "menu-divider" : ""}
            onClick={() => {
              action?.();
              if (action) onClose();
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <button>
          <FileText />
          <span>{labels[7]}</span>
        </button>
      </div>
    </>
  );
}

function Hero({ copy, setToast }: { copy: LocalizedCopy; setToast: ToastSetter }) {
  const [prompt, setPrompt] = useState("");

  const submit = () => {
    if (!prompt.trim()) return;
    setToast(copy.hero.submitToast);
  };

  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <div className="hero-media">
          <Image src={`${ASSET_ROOT}hero-beijing.jpg`} alt={copy.common.referenceImage} width={1600} height={1600} priority unoptimized />
        </div>
        <div className="hero-copy">
          <h1>{copy.hero.title}</h1>
          <p className="hero-subtitle">{copy.hero.subtitle}</p>
          <div className="prompt-box">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={copy.hero.placeholder}
              aria-label={copy.hero.promptLabel}
            />
            <div className="prompt-tools">
              <button aria-label={copy.common.attachment}>
                <Paperclip />
              </button>
              <span />
              <button aria-label={copy.common.voice}>
                <Mic />
              </button>
              <button className="send-button" onClick={submit} disabled={!prompt.trim()} aria-label={copy.common.send}>
                <Send />
              </button>
            </div>
          </div>
          <div className="suggestions">
            {copy.hero.suggestions.map((item) => (
              <button key={item} onClick={() => setPrompt(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="canvas-hint">
            <b>{copy.hero.existingPlan}</b>
            <button onClick={() => setToast(copy.hero.canvasToast)}>
              <BedDouble />
              {copy.hero.canvasPreview}
              <ArrowRight />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HumanSupport({ copy, setToast }: { copy: LocalizedCopy; setToast: ToastSetter }) {
  return (
    <section className="section human-section">
      <div className="human-card">
        <div>
          <small>{copy.human.eyebrow}</small>
          <h2>{copy.human.title}</h2>
          <p>{copy.human.body}</p>
          <button
            className="primary-button"
            onClick={() => setToast(copy.human.toast)}
          >
            {copy.human.cta} <ArrowRight />
          </button>
        </div>
        <div className="experts">
          {["traveler-hutong.jpg", "traveler-shanghai.jpg", "traveler-chengdu.jpg"].map(
            (image, index) => (
              <Image
                key={image}
                src={`${ASSET_ROOT}${image}`}
                alt={`${copy.common.referenceImage} ${index + 1}`}
                width={160}
                height={160}
                sizes="160px"
                unoptimized
              />
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function Destinations({ copy, setToast }: { copy: LocalizedCopy; setToast: ToastSetter }) {
  return (
    <section className="section destination-section">
      <div className="content">
        <h2>{copy.destinations.title}</h2>
        <div className="trip-grid">
          {copy.destinations.cards.map(([title, toast], index) => (
            <article className="trip-card" key={title}>
              <Image
                src={`${ASSET_ROOT}${tripImages[index]}`}
                alt={`${title} · ${copy.common.referenceImage}`}
                width={800}
                height={533}
                sizes="(max-width: 900px) 82vw, 33vw"
                unoptimized
              />
              <h3>{title}</h3>
              <button onClick={() => setToast(toast)}>
                {copy.destinations.cta} <ArrowRight />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureSection({ copy }: { copy: LocalizedCopy }) {
  const [active, setActive] = useState(0);

  return (
    <section className="section features-section">
      <div className="content">
        <h2>{copy.features.title}</h2>
        <p className="section-lede">{copy.features.subtitle}</p>
        <div className="feature-grid">
          {copy.features.items.map(([title, body], index) => {
            const Icon = featureIcons[index];
            return (
              <article key={title} className={`feature-card ${active === index ? "active" : ""}`}>
                <div className="feature-icon">
                  <Icon />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            );
          })}
        </div>
        <div className="carousel-dots">
          {copy.features.items.map(([title], index) => (
            <button
              key={title}
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
              aria-label={`${copy.features.slide} ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Reviews({ copy, setToast }: { copy: LocalizedCopy; setToast: ToastSetter }) {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="section reviews-section">
      <div className="content">
        <h2>{copy.reviews.title}</h2>
        <p className="reviews-note">{copy.reviews.body}</p>
        <div className={`review-media ${playing ? "playing" : ""}`}>
          <Image
            src={`${ASSET_ROOT}planner-chengdu.jpg`}
            alt={copy.common.referenceImage}
            width={1024}
            height={1024}
            sizes="(max-width: 520px) 100vw, 510px"
            unoptimized
          />
          <button
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? copy.reviews.pause : copy.reviews.play}
          >
            {playing ? <Pause /> : <Play />}
          </button>
        </div>
        <div className="expert-call">
          {copy.reviews.status}{" "}
          <button onClick={() => setToast(copy.reviews.toast)}>
            {copy.reviews.cta} <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}

function PlannerSection({ copy, setToast }: { copy: LocalizedCopy; setToast: ToastSetter }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="section planner-section">
      <div className="planner-card">
        <div>
          <h2>{copy.planner.title}</h2>
          <p className={expanded ? "expanded" : ""}>
            {copy.planner.base}
            {expanded ? ` ${copy.planner.expanded}` : ""}
          </p>
          <button className="text-button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? copy.features.less : copy.features.more}
          </button>
          <button
            className="primary-button"
            onClick={() => setToast(copy.planner.toast)}
          >
            {copy.planner.cta} <ArrowRight />
          </button>
        </div>
        <Image
          src={`${ASSET_ROOT}planner-chengdu.jpg`}
          alt={copy.common.referenceImage}
          width={708}
          height={708}
          sizes="(max-width: 900px) 250px, 280px"
          unoptimized
        />
      </div>
    </section>
  );
}

function TrustSection({ copy }: { copy: LocalizedCopy }) {
  return (
    <section className="section trust-section">
      <div className="content">
        <h2>{copy.trust.title}</h2>
        <p className="trust-copy">{copy.trust.body}</p>
        <div className="logo-row partners trust-badge-row">
          {copy.trust.badges.map((label, index) => {
            const Icon = trustIcons[index];
            return <div className="trust-badge" key={label}><Icon /><span>{label}</span></div>;
          })}
        </div>
        <h2>{copy.trust.secondTitle}</h2>
        <p>{copy.trust.secondBody}</p>
        <div className="logo-row press trust-badge-row">
          {copy.trust.secondBadges.map((label, index) => {
            const Icon = coverageIcons[index];
            return <div className="trust-badge compact" key={label}><Icon /><span>{label}</span></div>;
          })}
        </div>
      </div>
    </section>
  );
}

function FAQ({ copy }: { copy: LocalizedCopy }) {
  const [open, setOpen] = useState<number | null>(null);
  const visibleItems = copy.faq.items.filter((_, index) => !hiddenFaqIndexes.has(index));

  return (
    <section className="section faq-section">
      <div className="faq-wrap">
        <h2>{copy.faq.title}</h2>
        <p>{copy.faq.subtitle}</p>
        <div className="faq-list">
          {visibleItems.map(([question, answer], index) => (
            <article key={question} className={open === index ? "open" : ""}>
              <button
                onClick={() => setOpen((current) => (current === index ? null : index))}
                aria-expanded={open === index}
              >
                <span>{question}</span>
                <span>⌄</span>
              </button>
              {open === index ? <div>{answer}</div> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ copy, setModal, setToast }: { copy: LocalizedCopy; setModal: Dispatch<SetStateAction<ModalKind>>; setToast: ToastSetter }) {
  return (
    <>
      <section className="final-cta">
        <h2>{copy.cta.title}</h2>
        <p>{copy.cta.body}</p>
        <button
          className="primary-button"
          onClick={() => setToast(copy.cta.toast)}
        >
          {copy.cta.button} <ArrowRight />
        </button>
      </section>
      <footer>
        {copy.footer.columns.map(([heading, items], columnIndex) => (
          <div key={heading}>
            <h2>{heading}</h2>
            {items.map((item, itemIndex) => (
              <button
                key={item}
                onClick={() =>
                  columnIndex === 2 && itemIndex === 0
                    ? setModal("cookies")
                    : setToast(`${item}: ${copy.footer.previewToast}`)
                }
              >
                {item}
              </button>
            ))}
          </div>
        ))}
        <div className="footer-bottom">
          <span className="brand-wordmark footer-wordmark">VisePanda.</span>
          <p>{copy.footer.copyright}</p>
          <p>{copy.footer.tagline}</p>
        </div>
      </footer>
    </>
  );
}

export function VisePandaLanding() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [openMenu, setOpenMenu] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState("");
  const [showTop, setShowTop] = useState(false);
  const localizedCopy = useMemo(() => copyByLocale[locale], [locale]);

  const changeLocale = (nextLocale: Locale, label: string) => {
    setLocale(nextLocale);
    setModal(null);
    setToast(`${copyByLocale[nextLocale].modals.languageToast}${label}`);
  };

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    const isArabic = locale === "ar";
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
    document.title = `VisePanda | ${localizedCopy.hero.title}`;
  }, [locale, localizedCopy.hero.title]);

  return (
    <div className="app-shell min-h-screen bg-vp-paper text-vp-ink" data-locale={locale}>
      <BrandClip />
      <Header
        copy={localizedCopy}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        setModal={setModal}
        locale={locale}
      />
      <main>
        <Hero copy={localizedCopy} setToast={setToast} />
        <HumanSupport copy={localizedCopy} setToast={setToast} />
        <Destinations copy={localizedCopy} setToast={setToast} />
        <FeatureSection copy={localizedCopy} />
        <Reviews copy={localizedCopy} setToast={setToast} />
        <PlannerSection copy={localizedCopy} setToast={setToast} />
        <TrustSection copy={localizedCopy} />
        <FAQ copy={localizedCopy} />
        <Footer copy={localizedCopy} setModal={setModal} setToast={setToast} />
      </main>
      {showTop ? (
        <button
          className="back-to-top"
          aria-label={localizedCopy.common.backTop}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp />
        </button>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <Sparkles />
          {toast}
        </div>
      ) : null}
      {modal === "language" ? (
        <Overlay title={localizedCopy.modals.languageTitle} closeLabel={localizedCopy.modals.close} onClose={() => setModal(null)}>
          <div className="choice-grid">
            {localeOptions.map((option) => (
              <button
                key={option.value}
                className={option.value === locale ? "selected" : ""}
                lang={option.value}
                dir={option.value === "ar" ? "rtl" : "ltr"}
                onClick={() => changeLocale(option.value, option.label)}
              >
                <span className="flag-icon" aria-hidden="true">{option.flag}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}
      {modal === "display" ? (
        <Overlay title={localizedCopy.modals.displayTitle} closeLabel={localizedCopy.modals.close} onClose={() => setModal(null)} wide>
          <div className="currency-grid">
            {localizedCopy.modals.displayOptions.map(([name, code]) => (
              <button
                key={code}
                onClick={() => {
                  setModal(null);
                  setToast(`${localizedCopy.modals.displayToast}${code}`);
                }}
              >
                <b>{name}</b>
                <span>{code}</span>
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}
      {modal === "cookies" ? (
        <Overlay title={localizedCopy.modals.privacyTitle} closeLabel={localizedCopy.modals.close} onClose={() => setModal(null)}>
          <p className="modal-copy">{localizedCopy.modals.privacyBody}</p>
          <div className="cookie-options">
            {localizedCopy.modals.privacyOptions.map((item) => (
                <label key={item}>
                  <span>
                    <b>{item}</b>
                    <small>{localizedCopy.modals.privacyHint}</small>
                  </span>
                  <input type="checkbox" disabled />
                </label>
              ))}
          </div>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>{localizedCopy.modals.close}</button>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}
