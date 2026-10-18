import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/biz-udpgothic/400.css";
import "@fontsource/biz-udpgothic/700.css";
import "./styles.css";
import "./search.css";
import "./search-results.css";
import "./preview-page-search.css";
import "./status-bar.css";
import "./docs.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("React のマウント先が見つかりません");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
