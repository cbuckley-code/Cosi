import React from "react";
import { createRoot } from "react-dom/client";
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import App from "./App.jsx";
import "./styles/dark-theme.css";

// Apply Cloudscape dark mode
applyMode(Mode.Dark);

const root = createRoot(document.getElementById("root"));
root.render(<App />);
