import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./store";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}
