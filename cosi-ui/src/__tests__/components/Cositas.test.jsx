import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Cositas from "../../components/Cositas.jsx";

function makeOkResponse(data) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  };
}

describe("Cositas", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading state initially", () => {
    fetch.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<Cositas />);

    expect(screen.getByText(/loading cositas/i)).toBeInTheDocument();
  });

  it("shows empty state when fetch returns no tools", async () => {
    fetch.mockResolvedValue(makeOkResponse({ tools: [] }));

    render(<Cositas />);

    await waitFor(() =>
      expect(screen.getByText(/no cositas yet/i)).toBeInTheDocument()
    );
  });

  it("renders one card per unique serviceName", async () => {
    const tools = [
      { name: "svc-a__list", serviceName: "svc-a", healthy: true, description: "List items" },
      { name: "svc-a__create", serviceName: "svc-a", healthy: true, description: "Create item" },
      { name: "svc-b__ping", serviceName: "svc-b", healthy: false, description: "Ping" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<Cositas />);

    // Cards should show one entry per service
    await waitFor(() => expect(screen.getByText("Svc A")).toBeInTheDocument());
    expect(screen.getByText("Svc B")).toBeInTheDocument();
  });

  it("card header shows prettified cosita name", async () => {
    const tools = [
      { name: "my-tool__run", serviceName: "my-tool", healthy: true, description: "" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<Cositas />);

    await waitFor(() =>
      expect(screen.getByText("My Tool")).toBeInTheDocument()
    );
  });

  it("shows 'online' when healthy=true", async () => {
    fetch.mockResolvedValue(
      makeOkResponse({
        tools: [
          { name: "svc__fn", serviceName: "svc", healthy: true, description: "" },
        ],
      })
    );

    render(<Cositas />);

    await waitFor(() =>
      expect(screen.getByText("online")).toBeInTheDocument()
    );
  });

  it("shows 'offline' when healthy=false", async () => {
    fetch.mockResolvedValue(
      makeOkResponse({
        tools: [
          { name: "svc__fn", serviceName: "svc", healthy: false, description: "" },
        ],
      })
    );

    render(<Cositas />);

    await waitFor(() =>
      expect(screen.getByText("offline")).toBeInTheDocument()
    );
  });

  it("shows tool function names as badges within cards", async () => {
    const tools = [
      { name: "svc__list_items", serviceName: "svc", healthy: true, description: "Lists items" },
      { name: "svc__delete_item", serviceName: "svc", healthy: true, description: "Deletes item" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<Cositas />);

    await waitFor(() =>
      expect(screen.getByText("svc__list_items")).toBeInTheDocument()
    );
    expect(screen.getByText("svc__delete_item")).toBeInTheDocument();
  });

  it("refresh button triggers another fetch call", async () => {
    fetch.mockResolvedValue(makeOkResponse({ tools: [] }));

    render(<Cositas />);

    await waitFor(() =>
      expect(screen.getByText(/no cositas yet/i)).toBeInTheDocument()
    );

    expect(fetch).toHaveBeenCalledTimes(1);

    // The refresh icon button in the header
    const refreshButton = screen.getByRole("button");
    fireEvent.click(refreshButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("groups multiple tools under the same service into one card", async () => {
    const tools = [
      { name: "svc__fn1", serviceName: "svc", healthy: true, description: "Fn 1" },
      { name: "svc__fn2", serviceName: "svc", healthy: true, description: "Fn 2" },
      { name: "svc__fn3", serviceName: "svc", healthy: true, description: "Fn 3" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<Cositas />);

    // Only one card header for "Svc"
    await waitFor(() => expect(screen.getAllByText("Svc").length).toBe(1));

    expect(screen.getByText("svc__fn1")).toBeInTheDocument();
    expect(screen.getByText("svc__fn2")).toBeInTheDocument();
    expect(screen.getByText("svc__fn3")).toBeInTheDocument();
  });

  it("marks service as healthy if any tool in the group is healthy", async () => {
    const tools = [
      { name: "svc__fn1", serviceName: "svc", healthy: false, description: "" },
      { name: "svc__fn2", serviceName: "svc", healthy: true, description: "" },
    ];

    fetch.mockResolvedValue(makeOkResponse({ tools }));

    render(<Cositas />);

    await waitFor(() =>
      expect(screen.getByText("online")).toBeInTheDocument()
    );
  });
});
