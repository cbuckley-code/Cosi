import React, { useEffect, useState, useCallback } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Badge from "@cloudscape-design/components/badge";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Button from "@cloudscape-design/components/button";

export default function ToolRegistry() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTools(data.tools || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
    // Refresh every 30s
    const interval = setInterval(loadTools, 30000);
    return () => clearInterval(interval);
  }, [loadTools]);

  if (loading && tools.length === 0) {
    return (
      <Box padding="m">
        <StatusIndicator type="loading">Loading tools...</StatusIndicator>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding="m">
        <StatusIndicator type="error">{error}</StatusIndicator>
      </Box>
    );
  }

  if (tools.length === 0) {
    return (
      <Box padding="m" color="text-body-secondary">
        No tools registered yet. Use the Builder to create your first tool.
      </Box>
    );
  }

  // Group tools by service
  const services = {};
  for (const tool of tools) {
    const svc = tool.serviceName || "unknown";
    if (!services[svc]) services[svc] = [];
    services[svc].push(tool);
  }

  return (
    <SpaceBetween size="s">
      <SpaceBetween direction="horizontal" size="s" alignItems="center">
        <Box variant="h4">Registered Tools</Box>
        <Button variant="icon" iconName="refresh" onClick={loadTools} />
      </SpaceBetween>

      {Object.entries(services).map(([svc, svcTools]) => (
        <ExpandableSection
          key={svc}
          headerText={
            <SpaceBetween direction="horizontal" size="xs" alignItems="center">
              <span>{svc}</span>
              <StatusIndicator
                type={svcTools.some((t) => t.healthy) ? "success" : "error"}
              >
                {svcTools.some((t) => t.healthy) ? "healthy" : "offline"}
              </StatusIndicator>
            </SpaceBetween>
          }
          defaultExpanded
        >
          <SpaceBetween size="xs">
            {svcTools.map((tool) => (
              <Box key={tool.name} padding={{ left: "s" }}>
                <SpaceBetween size="xxs">
                  <Badge color="blue">{tool.name}</Badge>
                  <Box variant="small" color="text-body-secondary">
                    {tool.description}
                  </Box>
                </SpaceBetween>
              </Box>
            ))}
          </SpaceBetween>
        </ExpandableSection>
      ))}
    </SpaceBetween>
  );
}
