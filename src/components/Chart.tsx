import type { EChartsOption } from "echarts";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);

export interface ChartClickEvent {
  componentType?: string;
  name?: string;
  data?: unknown;
}

export function Chart({ option, height = 280, onClick }: { option: EChartsOption; height?: number; onClick?: (event: ChartClickEvent) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const clickHandlerRef = useRef(onClick);
  clickHandlerRef.current = onClick;

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = echarts.init(containerRef.current, undefined, { renderer: "svg" });
    instanceRef.current = instance;
    instance.on("click", (event) => clickHandlerRef.current?.(event as ChartClickEvent));
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    instanceRef.current?.setOption(option as Parameters<ReturnType<typeof echarts.init>["setOption"]>[0], { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={containerRef} data-chart-root style={{ height, width: "100%" }} />;
}
