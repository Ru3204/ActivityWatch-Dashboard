import { describe, expect, it } from "vitest";
import { heatmapOption, hourChartOption, rankingOption, trendOption } from "./charts";

describe("ECharts 6 grid options", () => {
  it("uses outer bounds instead of the deprecated containLabel option", () => {
    const options = [
      hourChartOption([], "en"),
      rankingOption([], "en"),
      trendOption([], "en"),
      heatmapOption([], "en"),
    ];

    for (const option of options) {
      expect(option.grid).toMatchObject({ outerBoundsMode: "same", outerBoundsContain: "axisLabel" });
      expect(option.grid).not.toHaveProperty("containLabel");
    }
  });
});
