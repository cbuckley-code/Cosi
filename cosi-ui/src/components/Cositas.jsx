import React, { useEffect, useState, useCallback } from "react";
import Cards from "@cloudscape-design/components/cards";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Header from "@cloudscape-design/components/header";

function prettify(name) {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Cositas() {
  const [cositas, setCositas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Group individual tool functions by their cosita (serviceName)
      const byService = {};
      for (const tool of data.tools || []) {
        const svc = tool.serviceName || tool.name;
        if (!byService[svc]) {
          byService[svc] = { name: svc, healthy: false, tools: [] };
        }
        byService[svc].tools.push(tool);
        if (tool.healthy) byService[svc].healthy = true;
      }

      setCositas(Object.values(byService));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <Box padding="l">
      <Cards
        loading={loading}
        loadingText="Loading cositas…"
        items={cositas}
        empty={
          <Box textAlign="center" padding="xxl">
            <Box variant="h3" color="text-body-secondary" padding={{ bottom: "s" }}>
              No cositas yet
            </Box>
            <Box color="text-body-secondary">
              Ask Cosi to build a tool and it will appear here.
            </Box>
          </Box>
        }
        header={
          <Header
            counter={cositas.length ? `(${cositas.length})` : undefined}
            actions={<Button iconName="refresh" variant="icon" onClick={load} />}
          >
            Cositas
          </Header>
        }
        cardDefinition={{
          header: (item) => (
            <SpaceBetween direction="horizontal" size="xs" alignItems="center">
              <Box variant="h3">{prettify(item.name)}</Box>
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
          ],
        }}
        visibleSections={["tools"]}
      />
    </Box>
  );
}
