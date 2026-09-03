// src/components/Auth/webauthnHelpers.js
//
// Thin wrapper around the webauthn-* Supabase Edge Functions plus
// @simplewebauthn/browser, so UnifiedLogin.js and any future passkey-
// management UI never touch fetch()/navigator.credentials directly.
//
// Requires: npm install @simplewebauthn/browser
// Requires env var: REACT_APP_SUPABASE_URL (same project as supabaseClient.js)

import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { supabase } from "../../supabaseClient";

const FUNCTIONS_URL = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1`;

async function callFunction(name, body, token) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const passkeysSupported = () => browserSupportsWebAuthn();

/**
 * Call once the user is already signed in (password login) to add a
 * passkey to their account. Triggers the OS Face ID / Fingerprint /
 * Windows Hello prompt.
 */
export async function registerPasskey(nickname) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("You must be signed in to add a passkey.");

  const options = await callFunction("webauthn-register-options", {}, session.access_token);
  const attestationResponse = await startRegistration(options);
  return callFunction(
    "webauthn-register-verify",
    { attestationResponse, nickname },
    session.access_token
  );
}

/**
 * Full passkey sign-in for the identifier already typed into
 * UnifiedLogin (a "UI-XXXX" staff or member code). Returns
 * { usedPasskey: false } if that identifier has no passkey registered,
 * so the caller can fall back to the password field instead of erroring.
 */
export async function loginWithPasskey(identifier) {
  const { available, options } = await callFunction("webauthn-auth-options", { identifier });
  if (!available) return { usedPasskey: false };

  const assertionResponse = await startAuthentication(options);
  const { email, token } = await callFunction("webauthn-auth-verify", { identifier, assertionResponse });

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "magiclink" });
  if (error) throw error;

  return { usedPasskey: true };
}
