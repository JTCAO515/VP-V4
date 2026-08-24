"use client";

import { ChinaMapHero } from "@/components/ChinaMapHero";
import { HomepageRedesignSections } from "@/components/HomepageRedesignSections";
import {
  ArrowUp,
  CircleDollarSign,
  CircleHelp,
  FileText,
  Languages,
  LogIn,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
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

type ModalKind = "language" | "display" | "cookies" | null;

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

function Hero({ copy, locale, onEarlyAccess }: { copy: LocalizedCopy; locale: Locale; onEarlyAccess: () => void }) {
  return <ChinaMapHero copy={copy} locale={locale} onEarlyAccess={onEarlyAccess} />;
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

function Footer({ copy }: { copy: LocalizedCopy }) {
  return (
    <footer>
        {copy.footer.columns.map(([heading, items]) => (
          <div key={heading}>
            <h2>{heading}</h2>
            {items.map((item) => (
              <span className="footer-item" key={item}>
                {item}
              </span>
            ))}
          </div>
        ))}
        <div className="footer-bottom">
          <span className="brand-wordmark footer-wordmark">VisePanda.</span>
          <p>{copy.footer.copyright}</p>
          <p>{copy.footer.tagline}</p>
        </div>
    </footer>
  );
}

export function VisePandaLanding() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [openMenu, setOpenMenu] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState("");
  const [showTop, setShowTop] = useState(false);
  const localizedCopy = useMemo(() => copyByLocale[locale], [locale]);
  const earlyAccessUrl = process.env.NEXT_PUBLIC_JOTFORM_EARLY_ACCESS_URL;

  const openEarlyAccess = () => {
    if (earlyAccessUrl) window.open(earlyAccessUrl, "_blank", "noopener,noreferrer");
  };

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
        <Hero copy={localizedCopy} locale={locale} onEarlyAccess={openEarlyAccess} />
        <HomepageRedesignSections copy={localizedCopy} />
        <FAQ copy={localizedCopy} />
        <Footer copy={localizedCopy} />
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
