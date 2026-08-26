"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { copy, localeOptions, type Locale } from "@/lib/i18n";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";

type AuthState =
  | "checking"
  | "idle"
  | "submitting"
  | "invalid"
  | "rateLimited"
  | "unavailable"
  | "signedIn"
  | "signingOut";

export function PasswordSignInForm() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [state, setState] = useState<AuthState>("checking");
  const authCopy = copy[locale].auth;

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    const client = createPasswordAuthClient();
    if (!client) {
      setState("unavailable");
      return;
    }
    let active = true;
    void client.auth.getClaims().then(({ data, error }) => {
      if (active) setState(!error && data?.claims?.sub ? "signedIn" : "idle");
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
    setState(error ? "unavailable" : "idle");
    router.refresh();
  }

  const message = state === "invalid"
    ? authCopy.invalid
    : state === "rateLimited"
      ? authCopy.rateLimited
      : state === "unavailable"
        ? authCopy.unavailable
        : null;

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-label="VisePanda">
        <Link className="auth-wordmark" href="/">VisePanda.</Link>
        <div>
          <p className="auth-eyebrow">{authCopy.eyebrow}</p>
          <h1>{authCopy.title}</h1>
          <p>{authCopy.body}</p>
        </div>
        <p className="auth-boundary">{authCopy.closedBeta}</p>
      </section>

      <section className="auth-form-panel">
        <label className="auth-language">
          <span>{authCopy.language}</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            {localeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.flag} {option.label}</option>
            ))}
          </select>
        </label>

        <div className="auth-card">
          {state === "checking" ? (
            <p className="auth-status" role="status">{authCopy.checking}</p>
          ) : state === "signedIn" || state === "signingOut" ? (
            <div className="auth-signed-in">
              <p className="auth-eyebrow">{authCopy.eyebrow}</p>
              <h2>{authCopy.signedInTitle}</h2>
              <p>{authCopy.signedInBody}</p>
              <Link className="auth-primary" href="/visepanda">{authCopy.continue}</Link>
              <button className="auth-secondary" type="button" disabled={state === "signingOut"} onClick={handleSignOut}>
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
                autoComplete="email"
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
              <button className="auth-primary" type="submit" disabled={state === "submitting"}>
                {state === "submitting" ? authCopy.submitting : authCopy.submit}
              </button>
              <p className="auth-message" aria-live="polite">{message}</p>
            </form>
          )}
          <p className="auth-no-signup">{authCopy.noSignup}</p>
        </div>
      </section>
    </main>
  );
}
