import React, { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { Homepage } from "./visualization/Homepage";
import { Play } from "./visualization/Play";
import { Explorer } from "./visualization/Explorer";
import type { SiteBootstrap } from "./visualization/site-bootstrap";
export function render(bootstrap: SiteBootstrap) {
  return renderToString(<React.StrictMode><Suspense fallback={null}>
    {bootstrap.page === "home" ? <Homepage initialData={bootstrap.homepage} /> : bootstrap.page === "play" ? <Play initialUrl={bootstrap.url} /> : <Explorer initialUrl={bootstrap.url} initialCatalog={bootstrap.catalog} />}
  </Suspense></React.StrictMode>);
}
