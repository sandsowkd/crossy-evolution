import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./visualization/App";
import { Highlights } from "./visualization/Highlights";
import { VariantTwo } from "./visualization/VariantTwo";
import "./visualization/style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("variant") === "2" ? <VariantTwo /> : new URLSearchParams(window.location.search).has("highlights") ? <Highlights /> : <App />}
  </React.StrictMode>,
);
