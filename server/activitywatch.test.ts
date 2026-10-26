import { afterEach, expect, it, vi } from "vitest";
import { ActivityWatchClient } from "./activitywatch";
afterEach(() => vi.unstubAllGlobals());
it("queries one day at a time and preserves result order", async () => {
  const periods: string[][] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    periods.push(body.timeperiods);
    return new Response(JSON.stringify([{ period: body.timeperiods[0] }]));
  }));
  const result = await new ActivityWatchClient("http://localhost:5600").query(["RETURN = [];"], ["day1", "day2", "day3"]);
  expect(periods).toEqual([["day1"], ["day2"], ["day3"]]);
  expect(result).toEqual([{ period: "day1" }, { period: "day2" }, { period: "day3" }]);
});
it("rejects incomplete data rather than showing an empty successful report", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
  await expect(new ActivityWatchClient("http://localhost:5600").query([], ["day1"])).rejects.toThrow("incomplete result");
});
