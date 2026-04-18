import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ToolRegistry from "../../components/ToolRegistry.jsx";

function makeOkResponse(data) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  };
}

describe("ToolRegistry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading state initially", () => {
    fetch.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<ToolRegistry />);

    expect(screen.getByText(/loading tools/i)).toBeInTheDocument();
  });

  it("shows empty state when there are no tools", async () => {
    fetch.mockResolvedValue(makeOkResponse({ tools: [] }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText(/no tools registered yet/i)).toBeInTheDocument()
    );
  });

  it("shows 'Registered Tools' heading and tool badges when tools exist", async () => {
    const tools = [
      { name: "svc__fn", serviceName: "svc", healthy: true, description: "Does a thing" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("Registered Tools")).toBeInTheDocument()
    );

    expect(screen.getByText("svc__fn")).toBeInTheDocument();
  });

  it("groups tools by serviceName in an expandable section", async () => {
    const tools = [
      { name: "svc-a__fn1", serviceName: "svc-a", healthy: true, description: "Fn 1" },
      { name: "svc-a__fn2", serviceName: "svc-a", healthy: true, description: "Fn 2" },
      { name: "svc-b__fn3", serviceName: "svc-b", healthy: false, description: "Fn 3" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("svc-a")).toBeInTheDocument()
    );

    expect(screen.getByText("svc-b")).toBeInTheDocument();
    expect(screen.getByText("svc-a__fn1")).toBeInTheDocument();
    expect(screen.getByText("svc-a__fn2")).toBeInTheDocument();
    expect(screen.getByText("svc-b__fn3")).toBeInTheDocument();
  });

  it("shows 'healthy' indicator when at least one tool in a service is healthy", async () => {
    const tools = [
      { name: "svc__fn", serviceName: "svc", healthy: true, description: "" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("healthy")).toBeInTheDocument()
    );
  });

  it("shows 'offline' indicator when no tool in a service is healthy", async () => {
    const tools = [
      { name: "svc__fn", serviceName: "svc", healthy: false, description: "" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("offline")).toBeInTheDocument()
    );
  });

  it("marks service as healthy when at least one of its tools is healthy", async () => {
    const tools = [
      { name: "svc__fn1", serviceName: "svc", healthy: false, description: "" },
      { name: "svc__fn2", serviceName: "svc", healthy: true, description: "" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("healthy")).toBeInTheDocument()
    );
  });

  it("shows tool badges (names) within each service group", async () => {
    const tools = [
      { name: "alpha__list", serviceName: "alpha", healthy: true, description: "List things" },
      { name: "alpha__create", serviceName: "alpha", healthy: true, description: "Create things" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("alpha__list")).toBeInTheDocument()
    );
    expect(screen.getByText("alpha__create")).toBeInTheDocument();
  });

  it("refresh button triggers another fetch call", async () => {
    fetch.mockResolvedValue(
      makeOkResponse({
        tools: [
          { name: "svc__fn", serviceName: "svc", healthy: true, description: "" },
        ],
      })
    );

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("Registered Tools")).toBeInTheDocument()
    );

    expect(fetch).toHaveBeenCalledTimes(1);

    // The ToolRegistry renders an icon-only refresh button alongside the heading.
    // ExpandableSection also renders a toggle button, so there are multiple buttons.
    // The refresh button is the icon button that is NOT the expander toggle.
    // We can identify it by grabbing all buttons and clicking the first one (the refresh icon).
    const buttons = screen.getAllByRole("button");
    // The refresh button is rendered before the expandable section toggle
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("uses 'unknown' as service group when tool has no serviceName", async () => {
    const tools = [
      { name: "orphan__fn", healthy: false, description: "Orphan tool" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<ToolRegistry />);

    await waitFor(() =>
      expect(screen.getByText("unknown")).toBeInTheDocument()
    );
    expect(screen.getByText("orphan__fn")).toBeInTheDocument();
  });
});
