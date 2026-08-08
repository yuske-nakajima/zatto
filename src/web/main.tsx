import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";
import "./search.css";
import "./search-results.css";
import "./preview-page-search.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("React のマウント先が見つかりません");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
