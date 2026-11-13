import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_LABELS, MARS_TARGETS, MarsTarget } from '../data/marsData';
import { formatLatLon } from '../utils/marsMath';

interface SearchBarProps {
  onSelectAndFly: (target: MarsTarget) => void;
}

export function SearchBar({ onSelectAndFly }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? MARS_TARGETS.filter((t) => {
        const haystack = `${t.name} ${t.shortName} ${t.region} ${t.agency} ${CATEGORY_LABELS[t.category]} ${t.searchKeywords ?? ''} ${t.scientificSignificance}`.toLowerCase();
        return haystack.includes(normalized);
      })
    : MARS_TARGETS;

  // Capture-phase global pointerdown ensures clicking/tapping anywhere (including Cesium canvas) blurs & closes dropdown
  useEffect(() => {
    const handlePointerDownCapture = (e: PointerEvent) => {
      const searchContainer = containerRef.current;
      const searchInput = inputRef.current;
      if (searchContainer && !searchContainer.contains(e.target as Node)) {
        searchInput?.blur();
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownCapture, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownCapture, { capture: true });
    };
  }, []);

  const handleChoose = (target: MarsTarget) => {
    setQuery(target.name);
    setIsOpen(false);
    inputRef.current?.blur();
    onSelectAndFly(target);
  };

  return (
    <div
      id="searchContainer"
      ref={containerRef}
      className="pointer-events-auto fixed top-4 left-4 z-30 w-[330px] max-w-[calc(100vw-2rem)]"
    >
      {/* Floating Search Pill */}
      <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0B0F17]/80 px-4 py-2.5 backdrop-blur-md shadow-2xl transition-colors focus-within:border-orange-400/50">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          id="searchInput"
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) {
              e.preventDefault();
              handleChoose(matches[0]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setIsOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search Mars locations, rovers, orbiters..."
          aria-label="Search Mars locations, rovers, orbiters"
          className="w-full bg-transparent text-xs sm:text-[13px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Quick-Jump Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Mars quick-jump locations"
          className="hud-scroll mt-2 max-h-[340px] overflow-y-auto rounded-2xl border border-white/12 bg-[#0B0F17]/90 p-1.5 backdrop-blur-md shadow-2xl"
        >
          {matches.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400">
              No matching Martian target found.
            </div>
          ) : (
            matches.map((target) => {
              const color = CATEGORY_COLORS[target.category];
              return (
                <button
                  key={target.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleChoose(target)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.08] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-100">
                        {target.name}
                      </div>
                      <div className="truncate text-[11px] text-slate-400">
                        {target.region}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono-tabular text-[10px] text-slate-400">
                    {target.category === 'satellite'
                      ? `${(target.orbit!.altitudeMeters / 1000).toFixed(0)} km`
                      : formatLatLon(target.latitude, target.longitude, 1)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
