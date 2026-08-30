"use client";
import { useEffect } from "react";

// The Pages preview hosts do not own the same-origin Worker route.
// Redirect before a visitor attempts to sign in; keep activation fragments intact.
export function PrimaryDomainRedirect() {
  useEffect(() => {
    if (
      location.hostname === "bumpfree.pages.dev" ||
      location.hostname.endsWith(".bumpfree.pages.dev")
    ) {
      location.replace(
        "https://bumpfree.lucius7.dev" +
          location.pathname +
          location.search +
          location.hash,
      );
    }
  }, []);
  return null;
}
