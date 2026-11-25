import { memo, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { instrument } from "./renderProbe.jsx";

const Leaf = memo(function Leaf({ label, onPick }) {
  return <button onClick={() => onPick?.(label)}>{label}</button>;
});

function Parent({ pick, label = "x" }) {
  const [n, setN] = useState(0);
  return (
    <div>
      <span data-testid="n">{n}</span>
      <button onClick={() => setN((v) => v + 1)}>rerender</button>
      <Leaf label={label} onPick={pick} />
    </div>
  );
}

describe("instrument", () => {
  test("counts a component's real redraws, not the parent's", () => {
    const probe = instrument(Leaf);
    const stable = () => {};
    render(<Parent pick={stable} />);
    expect(probe.count()).toBe(1);
    probe.reset();
    fireEvent.click(screen.getByText("rerender"));
    fireEvent.click(screen.getByText("rerender"));
    expect(screen.getByTestId("n")).toHaveTextContent("2"); // the parent did redraw twice
    expect(probe.count()).toBe(0); // the memoized child did not
    probe.restore();
  });

  test("a prop that changes identity on every redraw defeats memo, and the probe shows it", () => {
    const probe = instrument(Leaf);
    function Unstable() {
      const [n, setN] = useState(0);
      return (
        <div>
          <button onClick={() => setN(n + 1)}>go</button>
          <Leaf label="x" onPick={() => {}} />
        </div>
      );
    }
    render(<Unstable />);
    probe.reset();
    fireEvent.click(screen.getByText("go"));
    fireEvent.click(screen.getByText("go"));
    expect(probe.count()).toBe(2); // the inline handler is a new function each time
    probe.restore();
  });

  test("a changed prop does redraw it", () => {
    const probe = instrument(Leaf);
    const { rerender } = render(<Parent pick={() => {}} label="a" />);
    probe.reset();
    rerender(<Parent pick={() => {}} label="b" />);
    expect(probe.count()).toBe(1);
    expect(screen.getByRole("button", { name: "b" })).toBeInTheDocument();
    probe.restore();
  });

  test("counts can be grouped by a key taken from the props", () => {
    const probe = instrument(Leaf, { keyOf: (p) => p.label });
    const stable = () => {};
    function Two({ a }) {
      return (
        <>
          <Leaf label={a} onPick={stable} />
          <Leaf label="fixed" onPick={stable} />
        </>
      );
    }
    const { rerender } = render(<Two a="one" />);
    probe.reset();
    rerender(<Two a="two" />);
    expect(probe.count("two")).toBe(1);
    expect(probe.count("fixed")).toBe(0);
    expect(probe.count()).toBe(1);
    expect(probe.keys()).toEqual(["two"]);
    probe.restore();
  });

  test("refuses a component that is not memoized, instead of passing for the wrong reason", () => {
    function Plain() {
      return null;
    }
    expect(() => instrument(Plain)).toThrow(/React\.memo/);
    expect(() => instrument(undefined)).toThrow(/React\.memo/);
  });

  test("restore() puts the original function back", () => {
    const original = Leaf.type;
    const probe = instrument(Leaf);
    expect(Leaf.type).not.toBe(original);
    probe.restore();
    expect(Leaf.type).toBe(original);
  });
});
