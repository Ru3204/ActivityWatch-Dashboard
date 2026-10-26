import type { EChartsOption } from "echarts";
import type { BreakdownItem, HourBin, TrendDay } from "@shared/types";
import type { Locale } from "@shared/types";
import { formatDuration } from "@/lib/format";

const textColor = "#64748b";
const gridColor = "#edf0f4";

export function hourChartOption(hours: HourBin[], locale: Locale): EChartsOption {
  return {
    animationDuration: 500,
    grid: { left: 8, right: 6, top: 12, bottom: 24, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: { trigger: "axis", formatter: (params: any) => `${params[0].axisValue}<br/><b>${formatDuration(params[0].value, locale)}</b>` },
    xAxis: { type: "category", data: hours.map((hour) => hour.label), axisLine: { lineStyle: { color: gridColor } }, axisTick: { show: false }, axisLabel: { color: textColor, interval: 2, fontSize: 10 } },
    yAxis: { type: "value", axisLabel: { color: textColor, formatter: (value: number) => `${Math.round(value / 60)}m`, fontSize: 10 }, splitLine: { lineStyle: { color: gridColor } } },
    series: [{ type: "bar", data: hours.map((hour) => Math.round(hour.duration)), barMaxWidth: 16, itemStyle: { color: "#4f7df3", borderRadius: [5, 5, 0, 0] }, emphasis: { itemStyle: { color: "#2563eb" } } }],
  };
}

export function donutOption(items: BreakdownItem[], locale: Locale): EChartsOption {
  return {
    tooltip: { trigger: "item", formatter: (params: any) => `${params.name}<br/><b>${formatDuration(params.value, locale)}</b> · ${params.percent}%` },
    legend: { type: "scroll", orient: "vertical", right: 0, top: 12, bottom: 12, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: textColor, fontSize: 11 }, formatter: (name: string) => name.length > 18 ? `${name.slice(0, 17)}…` : name },
    series: [{
      type: "pie",
      radius: ["50%", "73%"],
      center: ["32%", "50%"],
      padAngle: 2,
      label: { show: false },
      itemStyle: { borderRadius: 5 },
      data: items.filter((item) => item.duration > 0).map((item) => ({ name: item.label, value: item.duration, categoryId: item.key, itemStyle: { color: item.color } })),
    }],
  };
}

export function rankingOption(items: BreakdownItem[], locale: Locale): EChartsOption {
  const selected = items.slice(0, 8).reverse();
  return {
    grid: { left: 8, right: 18, top: 5, bottom: 5, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: { trigger: "axis", formatter: (params: any) => `${params[0].name}<br/><b>${formatDuration(params[0].value, locale)}</b>` },
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: selected.map((item) => item.label), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: textColor, fontSize: 11, width: 105, overflow: "truncate" } },
    series: [{ type: "bar", data: selected.map((item) => item.duration), barMaxWidth: 11, itemStyle: { color: "#7697ed", borderRadius: [0, 6, 6, 0] }, label: { show: true, position: "right", color: textColor, fontSize: 10, formatter: (params: any) => formatDuration(params.value, locale, true) } }],
  };
}

export function trendOption(daily: TrendDay[], locale: Locale): EChartsOption {
  return {
    grid: { left: 12, right: 12, top: 30, bottom: 24, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: { trigger: "axis", valueFormatter: (value) => formatDuration(Number(value), locale) },
    legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 13, itemHeight: 7, textStyle: { color: textColor, fontSize: 11 } },
    xAxis: { type: "category", data: daily.map((day) => day.date.slice(5)), boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 10 } },
    yAxis: { type: "value", axisLabel: { color: textColor, fontSize: 10, formatter: (value: number) => `${(value / 3600).toFixed(0)}h` }, splitLine: { lineStyle: { color: gridColor } } },
    series: [
      { name: locale === "zh-CN" ? "活跃" : "Active", type: "line", smooth: 0.35, symbol: "circle", symbolSize: 5, data: daily.map((day) => day.activeSeconds), lineStyle: { width: 2.5, color: "#2563eb" }, itemStyle: { color: "#2563eb" }, areaStyle: { color: "rgba(37,99,235,.08)" } },
    ],
  };
}

export function categoryTrendOption(daily: TrendDay[], items: BreakdownItem[], locale: Locale): EChartsOption {
  return {
    grid: { left: 12, right: 12, top: 35, bottom: 24, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: { trigger: "axis", valueFormatter: (value) => formatDuration(Number(value), locale) },
    legend: { type: "scroll", top: 0, right: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: textColor, fontSize: 10 } },
    xAxis: { type: "category", data: daily.map((day) => day.date.slice(5)), axisTick: { show: false }, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 10 } },
    yAxis: { type: "value", axisLabel: { color: textColor, fontSize: 10, formatter: (value: number) => `${(value / 3600).toFixed(0)}h` }, splitLine: { lineStyle: { color: gridColor } } },
    series: items.slice(0, 6).map((item) => ({ name: item.label, type: "bar", stack: "category", barMaxWidth: 22, data: daily.map((day) => day.categories[item.key] ?? 0), itemStyle: { color: item.color, borderRadius: 2 } })),
  };
}

export function heatmapOption(values: Array<{ weekday: number; hour: number; duration: number }>, locale: Locale): EChartsOption {
  const weekdays = locale === "zh-CN" ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(1, ...values.map((item) => item.duration));
  return {
    grid: { left: 8, right: 15, top: 10, bottom: 35, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: { formatter: (params: any) => `${weekdays[params.value[1]]} ${String(params.value[0]).padStart(2, "0")}:00<br/><b>${formatDuration(params.value[2], locale)}</b>` },
    xAxis: { type: "category", data: Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")), axisLine: { lineStyle: { color: gridColor } }, axisTick: { show: false }, axisLabel: { color: textColor, fontSize: 9, interval: 2 } },
    yAxis: { type: "category", data: weekdays, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: textColor, fontSize: 10 } },
    visualMap: { min: 0, max, show: false, inRange: { color: ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb"] } },
    series: [{ type: "heatmap", data: values.map((item) => [item.hour, item.weekday - 1, item.duration]), itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { shadowBlur: 5, shadowColor: "rgba(15,23,42,.18)" } } }],
  };
}
