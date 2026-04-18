import React, { useEffect, useState, useCallback } from "react";
import Cards from "@cloudscape-design/components/cards";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Header from "@cloudscape-design/components/header";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Spinner from "@cloudscape-design/components/spinner";

function prettify(name) {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Cositas() {
  const [activeCositas, setActiveCositas] = useState([]);
  const [libraryTools, setLibraryTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingTool, setTogglingTool] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, libraryRes] = await Promise.all([
        fetch("/api/tools"),
        fetch("/api/library"),
      ]);

      // Active tools — grouped by service, with health status
      if (toolsRes.ok) {
        const { tools = [] } = await toolsRes.json();
        const byService = {};
        for (const tool of tools) {
          const svc = tool.serviceName || tool.name;
          if (!byService[svc]) {
            byService[svc] = { name: svc, healthy: false, tools: [] };
          }
          byService[svc].tools.push(tool);
          if (tool.healthy) byService[svc].healthy = true;
        }
        setActiveCositas(Object.values(byService));
      }

      // Library — all tools including disabled
      if (libraryRes.ok) {
        const { tools = [] } = await libraryRes.json();
        setLibraryTools(tools.filter((t) => !t.enabled));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function toggleTool(name, enable) {
    setTogglingTool(name);
    try {
      const action = enable ? "enable" : "disable";
      await fetch(`/api/library/${name}/${action}`, { method: "POST" });
      await load();
    } finally {
      setTogglingTool(null);
    }
  }

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        {/* ── Active cositas ── */}
        <Cards
          loading={loading}
          loadingText="Loading cositas…"
          items={activeCositas}
          empty={
            <Box textAlign="center" padding="xxl">
              <Box variant="h3" color="text-body-secondary" padding={{ bottom: "s" }}>
                No active cositas
              </Box>
              <Box color="text-body-secondary">
                Enable a tool from the library below, or ask Cosi to build a new one.
              </Box>
            </Box>
          }
          header={
            <Header
              counter={activeCositas.length ? `(${activeCositas.length})` : undefined}
              actions={<Button iconName="refresh" variant="icon" onClick={load} />}
            >
              Active Cositas
            </Header>
          }
          cardDefinition={{
            header: (item) => (
              <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                <Box variant="h3">{prettify(item.name.replace(/^tool-/, ""))}</Box>
                <StatusIndicator type={item.healthy ? "success" : "error"}>
                  {item.healthy ? "online" : "offline"}
                </StatusIndicator>
              </SpaceBetween>
            ),
            sections: [
              {
                id: "tools",
                content: (item) => (
                  <SpaceBetween size="xs">
                    {item.tools.map((t) => (
                      <SpaceBetween key={t.name} size="xxs">
                        <Badge color="blue">{t.name}</Badge>
                        {t.description && (
                          <Box variant="small" color="text-body-secondary">
                            {t.description}
                          </Box>
                        )}
                      </SpaceBetween>
                    ))}
                  </SpaceBetween>
                ),
              },
              {
                id: "actions",
                content: (item) => (
                  <Button
                    variant="link"
                    disabled={togglingTool === item.name.replace(/^tool-/, "")}
                    onClick={() => toggleTool(item.name.replace(/^tool-/, ""), false)}
                  >
                    {togglingTool === item.name.replace(/^tool-/, "") ? (
                      <Spinner />
                    ) : (
                      "Disable"
                    )}
                  </Button>
                ),
              },
            ],
          }}
          visibleSections={["tools", "actions"]}
        />

        {/* ── Tool library ── */}
        {libraryTools.length > 0 && (
          <ExpandableSection
            headerText={`Tool Library (${libraryTools.length} available)`}
            variant="container"
          >
            <Cards
              items={libraryTools}
              cardDefinition={{
                header: (item) => (
                  <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                    <Box variant="h3">{prettify(item.name)}</Box>
                    <Badge color="grey">disabled</Badge>
                  </SpaceBetween>
                ),
                sections: [
                  {
                    id: "description",
                    content: (item) =>
                      item.description ? (
                        <Box color="text-body-secondary">{item.description}</Box>
                      ) : null,
                  },
                  {
                    id: "tools",
                    content: (item) => (
                      <SpaceBetween size="xxs" direction="horizontal">
                        {item.tools.slice(0, 6).map((t) => (
                          <Badge key={t.name} color="blue">
                            {t.name}
                          </Badge>
                        ))}
                        {item.tools.length > 6 && (
                          <Badge color="grey">+{item.tools.length - 6} more</Badge>
                        )}
                      </SpaceBetween>
                    ),
                  },
                  {
                    id: "secrets",
                    content: (item) =>
                      item.secrets.length > 0 ? (
                        <Box variant="small" color="text-body-secondary">
                          Secrets required: {item.secrets.join(", ")}
                        </Box>
                      ) : null,
                  },
                  {
                    id: "enable",
                    content: (item) => (
                      <Button
                        variant="primary"
                        disabled={togglingTool === item.name}
                        onClick={() => toggleTool(item.name, true)}
                      >
                        {togglingTool === item.name ? <Spinner /> : "Enable"}
                      </Button>
                    ),
                  },
                ],
              }}
              visibleSections={["description", "tools", "secrets", "enable"]}
            />
          </ExpandableSection>
        )}
      </SpaceBetween>
    </Box>
  );
}
