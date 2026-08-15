import { useEffect, useRef } from "react";
import { DOC_PAGES, type DocLanguage } from "./docs-navigation-url.js";
import type { DocsNavigation } from "./useDocsNavigation.js";

interface DocsViewProps {
  navigation: DocsNavigation;
}

/**
 * Displays navigation and same-origin content for built-in documentation.
 *
 * @param props - Documentation navigation state
 * @returns The documentation workspace
 */
export function DocsView({ navigation }: DocsViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section className="docs-view" aria-labelledby="docs-heading">
      <header className="docs-header">
        <div>
          <p className="docs-eyebrow">BUILT-IN GUIDE</p>
          <h1 id="docs-heading" ref={headingRef} tabIndex={-1}>
            Documentation
          </h1>
        </div>
        <div className="docs-actions">
          <fieldset className="docs-language">
            <legend className="visually-hidden">Documentation language</legend>
            <LanguageButton language="en" navigation={navigation}>
              English
            </LanguageButton>
            <span className="docs-language-divider" aria-hidden="true" />
            <LanguageButton language="ja" navigation={navigation}>
              Japanese
            </LanguageButton>
          </fieldset>
          <button
            type="button"
            className="docs-close"
            data-status-description="Close the documentation view."
            aria-label="Close documentation"
            onClick={navigation.close}
          >
            <span className="docs-close-icon" aria-hidden="true">
              ✕
            </span>
            <span className="docs-close-label">Close</span>
          </button>
        </div>
      </header>
      <nav className="docs-pages" aria-label="Documentation pages">
        {DOC_PAGES.map((page) => (
          <button
            key={page.slug}
            type="button"
            aria-current={
              navigation.page.slug === page.slug ? "page" : undefined
            }
            onClick={() => navigation.selectPage(page)}
          >
            {page.label}
          </button>
        ))}
      </nav>
      <div className="docs-canvas">
        <iframe
          title={`${navigation.page.label} documentation`}
          src={`/docs/${navigation.language}/${navigation.page.slug}.html`}
        />
      </div>
    </section>
  );
}

interface LanguageButtonProps {
  language: DocLanguage;
  navigation: DocsNavigation;
  children: string;
}

function LanguageButton({
  language,
  navigation,
  children,
}: LanguageButtonProps) {
  return (
    <button
      type="button"
      aria-label={children}
      aria-pressed={navigation.language === language}
      onClick={() => navigation.selectLanguage(language)}
    >
      <span className="docs-language-label--full" aria-hidden="true">
        {children}
      </span>
      <span className="docs-language-label--compact" aria-hidden="true">
        {language.toUpperCase()}
      </span>
    </button>
  );
}
