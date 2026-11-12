import { SPEEDS } from "../core/loop.js";

export default function PlaybackBar({ playing, speed, onPlay, onPause, onStep, onSpeed, onReset }) {
  return (
    <div className="playback" role="group" aria-label="Playback">
      <button
        type="button"
        className="btn btn-primary"
        aria-pressed={playing}
        onClick={playing ? onPause : onPlay}
        title={playing ? "Pause (Space)" : "Play (Space)"}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="btn" onClick={onStep} disabled={playing} title="Step one frame (.)">
        Step
      </button>
      <label className="speed">
        <span>Speed</span>
        <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn" onClick={onReset} title="Restart (R)">
        Restart
      </button>
    </div>
  );
}
