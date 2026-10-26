import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EChartsOption } from "echarts";

const mocks = vi.hoisted(() => ({
  init: vi.fn(), use: vi.fn(), setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), on: vi.fn(),
}));

vi.mock("echarts/core", () => ({ init: mocks.init, use: mocks.use }));

import { Chart } from "./Chart";

class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe("Chart lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    mocks.init.mockReturnValue({ setOption: mocks.setOption, resize: mocks.resize, dispose: mocks.dispose, on: mocks.on });
  });

  it("keeps one ECharts instance across parent renders and option updates", () => {
    const first: EChartsOption = { series: [{ type: "pie", data: [1] }] };
    const second: EChartsOption = { series: [{ type: "pie", data: [2] }] };
    const view = render(<Chart option={first} />);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.setOption).toHaveBeenCalledTimes(1);

    view.rerender(<Chart option={first} />);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.setOption).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).not.toHaveBeenCalled();

    view.rerender(<Chart option={second} />);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.setOption).toHaveBeenCalledTimes(2);
    expect(mocks.dispose).not.toHaveBeenCalled();

    view.unmount();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});
