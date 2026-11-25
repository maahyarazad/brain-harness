import { vi } from "vitest";
import { createModuleContext } from "../../../studio/core/moduleContext.js";

describe("module context: message, restart and GPU switch (specs/005 contracts/module-additions.md)", () => {
  test("showMessage hands the message to the shell, clearMessage clears it", () => {
    const onMessage = vi.fn();
    const { ctx } = createModuleContext({ onMessage });
    const onAction = vi.fn();
    ctx.showMessage({ text: "Needs graphics acceleration.", actionLabel: "Restart", onAction });
    expect(onMessage).toHaveBeenLastCalledWith({ text: "Needs graphics acceleration.", actionLabel: "Restart", onAction });
    ctx.clearMessage();
    expect(onMessage).toHaveBeenLastCalledWith(null);
  });

  test("a message without an action is fine", () => {
    const onMessage = vi.fn();
    const { ctx } = createModuleContext({ onMessage });
    ctx.showMessage({ text: "Hello" });
    expect(onMessage).toHaveBeenCalledWith({ text: "Hello" });
  });

  test("a message with no text is ignored (nothing to show)", () => {
    const onMessage = vi.fn();
    const { ctx } = createModuleContext({ onMessage });
    ctx.showMessage({});
    ctx.showMessage(null);
    ctx.showMessage({ text: 5 });
    expect(onMessage).not.toHaveBeenCalled();
  });

  test("requestRestart passes the options on, with an empty object by default", () => {
    const onRestart = vi.fn();
    const { ctx } = createModuleContext({ onRestart });
    ctx.requestRestart();
    expect(onRestart).toHaveBeenLastCalledWith({});
    ctx.requestRestart({ forceProcessor: true });
    expect(onRestart).toHaveBeenLastCalledWith({ forceProcessor: true });
  });

  test("gpuForced defaults to 'auto' and can be set to 'off'", () => {
    expect(createModuleContext().ctx.gpuForced).toBe("auto");
    expect(createModuleContext({ gpuForced: "off" }).ctx.gpuForced).toBe("off");
    expect(createModuleContext({ gpuForced: "nonsense" }).ctx.gpuForced).toBe("auto");
  });

  test("all three are no-ops by default, so a module can call them in any test", () => {
    const { ctx } = createModuleContext();
    expect(() => {
      ctx.showMessage({ text: "x" });
      ctx.clearMessage();
      ctx.requestRestart({});
    }).not.toThrow();
  });

  test("after dispose the shell hears nothing more (a destroyed module cannot restart the viewer)", () => {
    const onMessage = vi.fn();
    const onRestart = vi.fn();
    const handle = createModuleContext({ onMessage, onRestart });
    handle.dispose();
    handle.ctx.showMessage({ text: "late" });
    handle.ctx.clearMessage();
    handle.ctx.requestRestart({ forceProcessor: true });
    expect(onMessage).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });

  test("the existing members still work", async () => {
    const onNotice = vi.fn();
    const onStats = vi.fn();
    const { ctx } = createModuleContext({ seed: 7, dpr: 2, onNotice, onStats });
    ctx.reportNotice("n");
    ctx.reportStats({ a: 1 });
    expect(onNotice).toHaveBeenCalledWith("n");
    expect(onStats).toHaveBeenCalledWith({ a: 1 });
    expect(ctx.dpr).toBe(2);
    expect(typeof ctx.rng()).toBe("number");
    await ctx.idle();
  });
});
