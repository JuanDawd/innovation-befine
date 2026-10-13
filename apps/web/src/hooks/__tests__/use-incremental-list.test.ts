import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIncrementalList } from "@/hooks/use-incremental-list";

const items = Array.from({ length: 120 }, (_, i) => i);

describe("useIncrementalList", () => {
  it("shows the first page and counts the rest", () => {
    const { result } = renderHook(() => useIncrementalList(items, "a"));
    expect(result.current.visible).toHaveLength(50);
    expect(result.current.remaining).toBe(70);
  });

  it("showMore adds a page until everything is visible", () => {
    const { result } = renderHook(() => useIncrementalList(items, "a"));
    act(() => result.current.showMore());
    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(120);
    expect(result.current.remaining).toBe(0);
  });

  it("resets to the first page when the reset key changes", () => {
    const { result, rerender } = renderHook(({ k }) => useIncrementalList(items, k), {
      initialProps: { k: "a" },
    });
    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(100);
    rerender({ k: "b" });
    expect(result.current.visible).toHaveLength(50);
  });

  it("short lists have nothing remaining", () => {
    const { result } = renderHook(() => useIncrementalList([1, 2, 3], "a"));
    expect(result.current.visible).toEqual([1, 2, 3]);
    expect(result.current.remaining).toBe(0);
  });
});
