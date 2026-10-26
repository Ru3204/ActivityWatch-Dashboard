import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TrendsPage } from "./TrendsPage";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: query }));
vi.mock("react-router-dom", () => ({ useOutletContext: () => ({ host: "HOST", refresh: vi.fn() }) }));
vi.mock("@/i18n/locale-context", () => ({ useLocale: () => ({ locale: "en", t: (key: string) => key }) }));
vi.mock("@/components/Chart", () => ({ Chart: () => null }));
it("does not read daily when a query has no data and is not loading", () => {
  query.mockReturnValue({ data: undefined, isLoading: false, isPending: false, isError: false });
  expect(() => render(<TrendsPage />)).not.toThrow();
});
it("shows the upstream error after a failed request", () => {
  query.mockReturnValue({ data: undefined, isPending: false, isError: true, error: new Error("ActivityWatch query timed out") });
  render(<TrendsPage />);
  expect(screen.getByText("ActivityWatch query timed out")).toBeInTheDocument();
});
