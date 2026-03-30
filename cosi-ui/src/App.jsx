import React, { useState, useEffect } from "react";
import AppLayout from "@cloudscape-design/components/app-layout";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import Box from "@cloudscape-design/components/box";
import Icon from "@cloudscape-design/components/icon";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Chat from "./components/Chat.jsx";
import Settings from "./components/Settings.jsx";

const NAV_ITEMS = [
  { type: "link", text: <><Icon name="search-gen-ai" /> Chat</>, href: "#chat" },
  { type: "divider" },
  { type: "link", text: <><Icon name="settings" /> Settings</>, href: "#settings" },
];

function useActiveView() {
  const getView = () => {
    const hash = window.location.hash;
    if (hash === "#settings") return "settings";
    return "chat";
  };

  const [view, setView] = useState(getView);

  useEffect(() => {
    const handler = () => setView(getView());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return view;
}

function useHealthStatus() {
  const [healthy, setHealthy] = useState(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/health");
        setHealthy(res.ok);
      } catch {
        setHealthy(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  return healthy;
}

export default function App() {
  const activeView = useActiveView();
  const healthy = useHealthStatus();

  const content = activeView === "settings" ? <Settings /> : <Chat />;

  return (
    <AppLayout
      navigationWidth={220}
      navigation={
        <SideNavigation
          header={{
            href: "#chat",
            text: (
              <Box>
                <strong>Cosi</strong>
                {healthy !== null && (
                  <Box display="inline-block" margin={{ left: "s" }}>
                    <StatusIndicator type={healthy ? "success" : "error"} />
                  </Box>
                )}
              </Box>
            ),
          }}
          items={NAV_ITEMS}
          activeHref={`#${activeView}`}
          onFollow={(e) => {
            e.preventDefault();
            window.location.hash = e.detail.href;
          }}
        />
      }
      content={content}
      toolsHide
      contentType="default"
    />
  );
}
