"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { FirstRunState } from "@/components/first-run/FirstRunState";
import { copy, getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";

import styles from "./PasswordSignInForm.module.css";

type AuthState =
  | "checking"
  | "ready"
  | "submitting"
  | "invalid"
  | "notProvisioned"
  | "rateLimited"
  | "unavailable"
  | "expired"
  | "signedIn"
  | "signingOut";

export function PasswordSignInForm({ showFirstRun = false, returnTo = "/visepanda" }: { showFirstRun?: boolean; returnTo?: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("zh");
  const [state, setState] = useState<AuthState>("checking");
  const authCopy = copy[locale].auth;

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  useEffect(() => {
    const client = createPasswordAuthClient();
    if (!client) {
      setState("unavailable");
      return;
    }
    let active = true;
    void client.auth.getClaims()
      .then(({ data, error }) => {
        if (!active) return;
        const expired = error?.code === "bad_jwt" || error?.code === "session_not_found";
        setState(!error && data?.claims?.sub ? "signedIn" : expired ? "expired" : "ready");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const passwordInput = form.elements.namedItem("password");
    const clearPassword = () => {
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
    };
    const client = createPasswordAuthClient();
    if (!client) {
      clearPassword();
      setState("unavailable");
      return;
    }
    setState("submitting");
    const { error } = await client.auth.signInWithPassword({ email, password });
    clearPassword();
    if (error) {
      setState(error.status === 429 ? "rateLimited" : "invalid");
      return;
    }
    setState("signedIn");
    router.replace(returnTo);
    router.refresh();
  }

  async function handleSignOut() {
    const client = createPasswordAuthClient();
    if (!client) {
      setState("unavailable");
      return;
    }
    setState("signingOut");
    const { error } = await client.auth.signOut({ scope: "local" });
    setState(error ? "unavailable" : "ready");
    router.refresh();
  }

  const message = state === "invalid"
    ? authCopy.invalid
    : state === "notProvisioned"
      ? authCopy.notProvisioned
    : state === "rateLimited"
      ? authCopy.rateLimited
      : state === "unavailable"
      ? authCopy.unavailable
        : state === "expired"
          ? authCopy.expired
        : null;

  return (
    <main className={styles.shell}>
      <section className={styles.brandPanel} aria-label="VisePanda">
        <Link className={styles.wordmark} href="/">VisePanda.</Link>
        <div>
          <p className={styles.eyebrow}>{authCopy.eyebrow}</p>
          <h1>{authCopy.title}</h1>
          <p>{authCopy.body}</p>
        </div>
        <svg className={styles.goldenRoute} aria-hidden="true" fill="none" viewBox="0 0 540 180">
          <path d="M-15 143C57 192 100 38 184 82c64 34 53 97 121 75 78-26 87-123 249-65" stroke="currentColor" strokeLinecap="round" strokeWidth="8" />
        </svg>
        <p className={styles.boundary}>{authCopy.closedBeta}</p>
      </section>

      <section className={styles.formPanel}>
        <label className={styles.language}>
          <span>{authCopy.language}</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            {localeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.flag} {option.label}</option>
            ))}
          </select>
        </label>

        <div className={styles.card} data-auth-state={state}>
          {state === "checking" ? (
            <p className={styles.status} role="status">{authCopy.checking}</p>
          ) : state === "signedIn" || state === "signingOut" ? (
            <div className={styles.signedIn}>
              <p className={styles.eyebrow}>{authCopy.eyebrow}</p>
              <h2>{authCopy.signedInTitle}</h2>
              <p>{authCopy.signedInBody}</p>
              {showFirstRun ? <FirstRunState authCopy={authCopy} /> : null}
              <Link className={styles.primary} href={returnTo}>{authCopy.continue}</Link>
              <button className={styles.secondary} type="button" disabled={state === "signingOut"} onClick={handleSignOut}>
                {state === "signingOut" ? authCopy.signingOut : authCopy.signOut}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label htmlFor="auth-email">{authCopy.emailLabel}</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="username"
                maxLength={320}
                placeholder={authCopy.emailPlaceholder}
                required
              />
              <label htmlFor="auth-password">{authCopy.passwordLabel}</label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={authCopy.passwordPlaceholder}
                required
              />
              <button className={styles.primary} type="submit" disabled={state === "submitting"}>
                {state === "submitting" ? authCopy.submitting : authCopy.submit}
              </button>
              <p className={styles.message} aria-live="polite">{message}</p>
            </form>
          )}
          <p className={styles.noSignup}>{authCopy.noSignup}</p>
        </div>
      </section>
    </main>
  );
}
