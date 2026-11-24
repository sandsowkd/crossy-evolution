import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { siteRoute } from "./visualization/replay-links";
import "./visualization/style.css";
const App = lazy(() => import("./visualization/App").then(module => ({ default: module.App })));
const Explorer = lazy(() => import("./visualization/Explorer").then(module => ({ default: module.Explorer })));
const Homepage = lazy(() => import("./visualization/Homepage").then(module => ({ default: module.Homepage })));
const VariantTwo = lazy(() => import("./visualization/VariantTwo").then(module => ({ default: module.VariantTwo })));
const Play = lazy(() => import("./visualization/Play").then(module => ({ default: module.Play })));
const route = siteRoute(new URL(window.location.href));
const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <Suspense fallback={<div role="status" style={{ padding: 28, color: "#253e31", background: "#f7f5ec", minHeight: "100dvh" }}>Loading Crossy Road AI…</div>}>
      {route.page === "play" ? <Play /> : route.page === "variant-two" ? <VariantTwo /> : route.page === "highlight" || route.page === "explorer" ? <Explorer /> : route.page === "lab" ? <App /> : <Homepage />}
    </Suspense>
  </React.StrictMode>,
);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
