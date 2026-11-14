import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  MARS_TARGETS,
  MarsTarget,
  TargetCategory,
} from '../data/marsData';
import { formatLatLon } from '../utils/marsMath';

type SearchCategoryFilter = 'all' | TargetCategory;

const SEARCH_TABS: Array<{ id: SearchCategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'rover', label: 'Rovers' },
  { id: 'satellite', label: 'Orbiters' },
  { id: 'landmark', label: 'Locations' },
];

interface SearchBarProps {
  onSelectAndFly: (target: MarsTarget) => void;
}

export function SearchBar({ onSelectAndFly }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchCategoryFilter>('all');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalized = query.trim().toLowerCase();

  const textFiltered = useMemo(() => {
    if (!normalized) return MARS_TARGETS;
    return MARS_TARGETS.filter((t) => {
      const haystack =
        `${t.name} ${t.shortName} ${t.region} ${t.agency} ${CATEGORY_LABELS[t.category]} ${t.searchKeywords ?? ''} ${t.scientificSignificance}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [normalized]);

  const tabCounts = useMemo(() => {
    const counts: Record<SearchCategoryFilter, number> = {
      all: textFiltered.length,
      rover: 0,
      satellite: 0,
      landmark: 0,
    };
    for (const item of textFiltered) {
      counts[item.category]++;
    }
    return counts;
  }, [textFiltered]);

  const matches = useMemo(() => {
    if (activeTab === 'all') return textFiltered;
    return textFiltered.filter((t) => t.category === activeTab);
  }, [textFiltered, activeTab]);

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
      className="pointer-events-auto fixed top-4 left-4 z-30 w-[345px] max-w-[calc(100vw-2rem)]"
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
          placeholder="Search 48 Mars locations, rovers, orbiters..."
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

      {/* Categorized Quick-Jump Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Mars quick-jump locations"
          className="mt-2 overflow-hidden rounded-2xl border border-white/12 bg-[#0B0F17]/92 backdrop-blur-md shadow-2xl"
        >
          {/* Category Filter Tabs (Rovers / Orbiters / Locations) */}
          <div
            role="tablist"
            aria-label="Filter targets by category"
            className="grid grid-cols-4 gap-1 border-b border-white/10 bg-white/[0.03] p-1.5"
          >
            {SEARCH_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-orange-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono-tabular text-[10px] ${
                      isActive ? 'text-slate-900/80' : 'text-slate-400'
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hud-scroll max-h-[320px] overflow-y-auto p-1.5">
            {matches.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                No matching Martian target found in this category.
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
        </div>
      )}
    </div>
  );
}
