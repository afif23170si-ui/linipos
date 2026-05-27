import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyStoredTheme } from "@/hooks/use-theme-color";

// Apply persisted theme immediately before first render to avoid flash
applyStoredTheme();

createRoot(document.getElementById("root")!).render(<App />);
