/** Native credentials and bound user clients must never forward secrets to a redirect target. */
export const nativeFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, redirect: "error" });
