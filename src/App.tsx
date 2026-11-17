import { useEffect, useState } from "react";
import { DeskPage } from "./pages/DeskPage";
import { SendPage } from "./pages/SendPage";
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
  return route.page === "send" ? <SendPage key={route.pcId ?? ""} pcId={route.pcId} /> : <DeskPage />;
}
