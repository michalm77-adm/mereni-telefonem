import { createRoot } from "react-dom/client";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "./index.css";
import { App } from "./App";

// No StrictMode: its double mount would register the same PeerJS id twice in dev.
createRoot(document.getElementById("root")!).render(<App />);
