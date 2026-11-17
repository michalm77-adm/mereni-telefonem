import { createRoot } from "react-dom/client";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "./index.css";
import { App } from "./App";
import { onDataChange } from "./lib/db";
import { initFolder, scheduleSync } from "./lib/folder";

// Every change is also written to the chosen folder on the PC (if any).
onDataChange(() => scheduleSync());
void initFolder();

// No StrictMode: its double mount would register the same PeerJS id twice in dev.
createRoot(document.getElementById("root")!).render(<App />);
