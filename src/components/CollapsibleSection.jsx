import { useState, useRef, useEffect } from 'react';

export default function CollapsibleSection({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(defaultOpen ? 'none' : '0px');

  useEffect(() => {
    if (open) {
      const el = contentRef.current;
      if (el) {
        setMaxHeight(el.scrollHeight + 'px');
        // After transition, remove max-height so dynamic content works
        const timer = setTimeout(() => setMaxHeight('none'), 310);
        return () => clearTimeout(timer);
      }
    } else {
      // First set to current height so transition can animate from it
      const el = contentRef.current;
      if (el) {
        setMaxHeight(el.scrollHeight + 'px');
        // Force reflow then collapse
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setMaxHeight('0px');
          });
        });
      }
    }
  }, [open]);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3 mb-2 cursor-pointer hover:bg-white/8 transition-colors group"
      >
        <div className="flex items-center gap-2">
          {icon && (
            <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          )}
          <h2 className="text-sm font-bold text-white/70">{title}</h2>
        </div>
        <svg
          className={`w-4 h-4 text-white/40 transition-transform duration-300 ${open ? 'rotate-180' : 'rotate-0'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        ref={contentRef}
        style={{ maxHeight, overflow: maxHeight === 'none' ? 'visible' : 'hidden' }}
        className="transition-[max-height] duration-300 ease-in-out"
      >
        <div className="pt-2 pb-4">
          {children}
        </div>
      </div>
    </section>
  );
}
