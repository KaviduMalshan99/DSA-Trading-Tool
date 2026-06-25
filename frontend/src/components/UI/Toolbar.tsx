export function Toolbar() {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] select-none">
      <div className="flex items-center gap-2">
        <span className="text-blue-400 font-bold text-sm tracking-wide">DSA</span>
        <span className="text-gray-300 font-semibold text-sm">Trading Tool</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Real-Time Analytics Platform</span>
      </div>
    </header>
  );
}
