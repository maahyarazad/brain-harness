import { vi } from "vitest";
import { canRecordVideo, pickMimeType, startRecording, videoFilename, MIME_PREFERENCE } from "../../../studio/core/videoRecorder.js";
import { installMediaRecorder, removeMediaRecorder, FakeMediaRecorder } from "../browserStubs.js";

const canvas = () => document.createElement("canvas");

afterEach(() => {
  removeMediaRecorder();
  vi.useRealTimers();
});

test("picks the first supported type in the preference order", () => {
  expect(MIME_PREFERENCE[0]).toBe("video/mp4;codecs=avc1");
  installMediaRecorder({ types: ["video/webm", "video/webm;codecs=vp8"] });
  expect(pickMimeType()).toBe("video/webm;codecs=vp8");
  installMediaRecorder({ types: ["video/webm", "video/mp4"] });
  expect(pickMimeType()).toBe("video/mp4");
  installMediaRecorder({ types: [] });
  expect(pickMimeType()).toBeNull();
});

test("recording needs MediaRecorder, captureStream and a supported type", () => {
  expect(canRecordVideo(canvas())).toBe(false);
  installMediaRecorder({ types: ["video/webm"] });
  expect(canRecordVideo(canvas())).toBe(true);
  installMediaRecorder({ types: [] });
  expect(canRecordVideo(canvas())).toBe(false);
  expect(canRecordVideo(null)).toBe(false);
});

test("stop resolves to a blob with the right extension and a codec-free type", async () => {
  installMediaRecorder({ types: ["video/mp4;codecs=avc1"] });
  const rec = startRecording(canvas());
  const mr = FakeMediaRecorder.instances[0];
  expect(mr.options).toMatchObject({ mimeType: "video/mp4;codecs=avc1", videoBitsPerSecond: 8_000_000 });
  expect(mr.timeslice).toBe(1000);
  const r = await rec.stop();
  expect(r.ext).toBe("mp4");
  expect(r.mimeType).toBe("video/mp4");
  expect(r.blob.type).toBe("video/mp4");
  expect(mr.stream.getTracks()[0].stopped).toBe(true);

  installMediaRecorder({ types: ["video/webm;codecs=vp9"] });
  const r2 = await startRecording(canvas()).stop();
  expect(r2.ext).toBe("webm");
  expect(r2.blob.type).toBe("video/webm");
});

test("ticks every second and stops by itself at the limit", async () => {
  vi.useFakeTimers();
  installMediaRecorder();
  const ticks = [];
  const onLimit = vi.fn();
  const rec = startRecording(canvas(), { maxSeconds: 3, onTick: (s) => ticks.push(s), onLimit });
  await vi.advanceTimersByTimeAsync(3000);
  expect(ticks).toEqual([1, 2, 3]);
  expect(onLimit).toHaveBeenCalledTimes(1);
  const r = onLimit.mock.calls[0][0];
  expect(r.ext).toBe("webm");
  // Stopping again after the limit gives nothing new.
  expect(await rec.stop()).toBeNull();
});

test("cancel stops the stream and resolves to null", async () => {
  installMediaRecorder();
  const c = canvas();
  const rec = startRecording(c);
  const mr = FakeMediaRecorder.instances[0];
  expect(await rec.cancel()).toBeNull();
  expect(mr.state).toBe("inactive");
  expect(mr.stream.getTracks()[0].stopped).toBe(true);
});

test("file names carry the visualization and a timestamp", () => {
  expect(videoFilename("boids", "webm", new Date(2026, 10, 11, 9, 5, 7))).toBe("boids-20261111-090507.webm");
});
