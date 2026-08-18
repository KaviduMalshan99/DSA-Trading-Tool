import { useReplayStore, type ReplaySpeed } from '../../store/replayStore';

const SPEEDS: ReplaySpeed[] = [0.5, 1, 2, 4];

export function ReplayControls() {
  const isPicking  = useReplayStore((s) => s.isPicking);
  const isActive   = useReplayStore((s) => s.isActive);
  const isPlaying  = useReplayStore((s) => s.isPlaying);
  const speed      = useReplayStore((s) => s.speed);
  const armPicking   = useReplayStore((s) => s.armPicking);
  const cancelPicking = useReplayStore((s) => s.cancelPicking);
  const exitReplay   = useReplayStore((s) => s.exitReplay);
  const play        = useReplayStore((s) => s.play);
  const pause       = useReplayStore((s) => s.pause);
  const stepForward = useReplayStore((s) => s.stepForward);
  const stepBack    = useReplayStore((s) => s.stepBack);
  const setSpeed    = useReplayStore((s) => s.setSpeed);

  if (isPicking) {
    return (
      <div className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>Click a candle to start replay…</span>
        <button
          onClick={cancelPicking}
          className="px-2 py-0.5 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (!isActive) {
    return (
      <button
        onClick={armPicking}
        title="Enter Replay mode — click a candle on the chart to pick the start bar"
        className="ml-auto px-2 py-0.5 rounded text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
      >
        ▶ Replay
      </button>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-1.5 text-xs">
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-600/90 text-white">
        Replay
      </span>
      <button
        onClick={stepBack}
        title="Step back one bar"
        className="px-1.5 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
      >
        ⏮
      </button>
      <button
        onClick={() => (isPlaying ? pause() : play())}
        title={isPlaying ? 'Pause' : 'Play'}
        className="px-1.5 py-0.5 rounded text-[var(--text-primary)] bg-[var(--bg-hover)]"
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        onClick={stepForward}
        title="Step forward one bar"
        className="px-1.5 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
      >
        ⏭
      </button>
      <div className="flex gap-0.5 ml-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-1.5 py-0.5 rounded ${
              speed === s
                ? 'bg-emerald-700 text-white'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
      <button
        onClick={exitReplay}
        title="Exit Replay — return to live"
        className="ml-1 px-2 py-0.5 rounded text-xs font-medium bg-red-700/80 text-white hover:bg-red-700"
      >
        Exit
      </button>
    </div>
  );
}
