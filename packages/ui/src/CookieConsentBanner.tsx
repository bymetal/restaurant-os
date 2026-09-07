"use client";

import { useEffect, useState, type ElementType } from "react";

const STORAGE_KEY = "restaurant-os-cookie-consent";

export interface CookieConsentBannerProps {
  policyHref: string;
  linkComponent?: ElementType;
  /** Override the wrapper's positioning classes, e.g. to sit above an app's own sticky bottom bar. */
  wrapperClassName?: string;
  /** Constrain the inner content width, defaults to a wide desktop layout. */
  containerClassName?: string;
}

export function CookieConsentBanner({ policyHref, linkComponent, wrapperClassName, containerClassName }: CookieConsentBannerProps) {
  const Link = linkComponent ?? "a";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function accept() {
    window.localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={
        wrapperClassName ??
        "fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-4 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]"
      }
    >
      <div className={containerClassName ?? "mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"}>
        <p className="text-sm text-slate-600">
          Bu site yalnızca oturumunuzu ve sepetinizi hatırlamak için zorunlu çerezler kullanır; reklam veya takip amaçlı
          çerez kullanılmaz.{" "}
          <Link href={policyHref} className="font-semibold text-brand-600 hover:underline">
            Çerez Politikası
          </Link>
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Kabul Et
        </button>
      </div>
    </div>
  );
}
