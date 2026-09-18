/**
 * Supabase auth session storage backed by localStorage.
 *
 * (Previously this brokered sessions to a hosted-editor iframe over
 * postMessage; the app now runs standalone, so plain localStorage is all
 * that's needed. Kept as an async-compatible storage adapter since Supabase
 * accepts both.)
 */
export function brokeredPreviewStorage() {
  if (typeof window === "undefined") return undefined;
  return localStorage;
}
