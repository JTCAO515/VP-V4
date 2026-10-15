"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPasswordAuthClient } from "../../lib/server/identity/browser-auth-client";
import { AddressActorGate, type AddressActor } from "./actor";

export function useAddressActor() {
  const [actor, setActor] = useState<AddressActor | null>(null);
  const gate = useRef<AddressActorGate | null>(null);
  const current = useCallback(() => gate.current?.current() ?? null, []);
  useEffect(() => {
    let active = true;
    const owner = new AddressActorGate(value => { if (active) setActor(value); });
    gate.current = owner;
    const client = createPasswordAuthClient();
    const verify = () => {
      if (active && document.visibilityState !== "hidden" && navigator.onLine !== false)
        void owner.verify(async () => client ? client.auth.getClaims() : null);
    };
    const resume = () => { owner.invalidate(); queueMicrotask(verify); };
    const offline = () => owner.invalidate();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    const auth = client?.auth.onAuthStateChange((_event, session) => {
      owner.invalidate();
      if (session !== null) queueMicrotask(verify);
    });
    verify();
    return () => {
      active = false; owner.invalidate(); gate.current = null;
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      auth?.data.subscription.unsubscribe();
    };
  }, []);
  return { actor, current };
}
