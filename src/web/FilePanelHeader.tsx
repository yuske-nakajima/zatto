import zattoLogoBlack from "./assets/zatto-logo-black.png";
import zattoLogoWhite from "./assets/zatto-logo-white.png";

/**
 * Renders the application branding in either color scheme.
 * @returns Sidebar branding
 * @throws Never
 */
export function FilePanelHeader() {
  const DARK_COLOR_SCHEME = "(prefers-color-scheme: dark)";
  return (
    <header className="sidebar-header">
      <p className="eyebrow">LOCAL HTML VIEWER</p>
      <h1>
        <picture>
          <source media={DARK_COLOR_SCHEME} srcSet={zattoLogoWhite} />
          <img src={zattoLogoBlack} alt="zatto" />
        </picture>
      </h1>
    </header>
  );
}
