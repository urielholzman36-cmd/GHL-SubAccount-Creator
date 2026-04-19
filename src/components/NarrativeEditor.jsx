import { useState, useEffect } from 'react';

export default function NarrativeEditor({ value, onChange, disabled }) {
  const [exec, setExec] = useState(value?.exec_summary || '');
  const [recs, setRecs] = useState((value?.recommendations || []).join('\n'));

  useEffect(() => {
    setExec(value?.exec_summary || '');
    setRecs((value?.recommendations || []).join('\n'));
  }, [value]);

  function emit(nextExec, nextRecs) {
    onChange({
      exec_summary: nextExec,
      recommendations: nextRecs.split('\n').map((s) => s.trim()).filter(Boolean),
    });
  }

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors';

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm text-white/60 mb-1">Executive Summary</span>
        <textarea
          className={`${inputClass} min-h-[180px]`}
          value={exec}
          disabled={disabled}
          onChange={(e) => { setExec(e.target.value); emit(e.target.value, recs); }}
        />
      </label>
      <label className="block">
        <span className="block text-sm text-white/60 mb-1">Recommendations (one per line, 3-4)</span>
        <textarea
          className={`${inputClass} min-h-[120px]`}
          value={recs}
          disabled={disabled}
          onChange={(e) => { setRecs(e.target.value); emit(exec, e.target.value); }}
        />
      </label>
    </div>
  );
}
