import { useEffect, useState } from "react";
import { DeskPage } from "./pages/DeskPage";
import { SendPage } from "./pages/SendPage";
import { TargetsPage } from "./pages/TargetsPage";
import { parseRoute } from "./lib/links";

/** Tiny hash router: "#/send?pc=<id>" = phone sender, anything else = PC desk. */
export function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const route = parseRoute(hash);
  if (route.page === "send") return <SendPage key={route.pcId ?? ""} pcId={route.pcId} />;
  if (route.page === "targets") return <TargetsPage />;
  return <DeskPage />;
}
