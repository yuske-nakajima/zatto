import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  type DocLanguage,
  type DocPage,
  pushDocsLocation,
  readDocsLocation,
  replaceDocsLocation,
} from "./docs-navigation-url.js";

/**
 * Synchronizes the built-in documentation view with browser history.
 *
 * @returns Current documentation state and navigation actions
 */
export function useDocsNavigation() {
  const [location, setLocation] = useState(readDocsLocation);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocusRef = useRef(false);

  useEffect(() => replaceDocsLocation(location), [location]);
  useEffect(() => {
    if (!location.isVisible && restoreTriggerFocusRef.current) {
      restoreTriggerFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [location.isVisible]);

  const restoreFromHistory = useEffectEvent(() => {
    const restoredLocation = readDocsLocation();
    setLocation(restoredLocation);
    replaceDocsLocation(restoredLocation);
  });

  useEffect(() => {
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  function open(): void {
    if (location.isVisible) return;
    restoreTriggerFocusRef.current = false;
    update({ ...location, isVisible: true });
  }

  function close(): void {
    if (!location.isVisible) return;
    restoreTriggerFocusRef.current = true;
    update({ ...location, isVisible: false });
  }

  function hide(): void {
    restoreTriggerFocusRef.current = false;
    if (location.isVisible) setLocation({ ...location, isVisible: false });
  }

  function selectPage(page: DocPage): void {
    if (page.slug === location.page.slug) return;
    update({ ...location, page });
  }

  function selectLanguage(language: DocLanguage): void {
    if (language === location.language) return;
    update({ ...location, language });
  }

  function update(nextLocation: typeof location): void {
    pushDocsLocation(nextLocation);
    setLocation(nextLocation);
  }

  return {
    ...location,
    triggerRef,
    open,
    close,
    hide,
    selectPage,
    selectLanguage,
  };
}

/** Documentation navigation state returned by {@link useDocsNavigation}. */
export type DocsNavigation = ReturnType<typeof useDocsNavigation>;
