import { Database, Info, MoreVertical, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type InfoModalType = 'details' | 'about' | null;

interface InfoMenuProps {
  hasTargetCardOpen: boolean;
}

const DATA_ATTRIBUTIONS = [
  {
    title: 'Optical Surface Imagery',
    description: (
      <>
        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (
        <span className="font-mono-tabular text-slate-200">232m/px</span>) &amp; Mars Reconnaissance
        Orbiter (MRO) CTX Global Mosaic (
        <span className="font-mono-tabular text-slate-200">6m/px</span>) —{' '}
        <em className="text-slate-300">NASA / JPL-Caltech / USGS Astrogeology Science Center</em>.
      </>
    ),
  },
  {
    title: 'Topography & Elevation Model',
    description: (
      <>
        Mars Global Surveyor (MGS) Mars Orbiter Laser Altimeter (MOLA) Digital Elevation Model (
        <span className="font-mono-tabular text-slate-200">463m/px</span>) —{' '}
        <em className="text-slate-300">NASA / GSFC / USGS</em>.
      </>
    ),
  },
  {
    title: 'Surface Radiation Calibration',
    description: (
      <>
        Curiosity Rover Radiation Assessment Detector (MSL RAD) &amp; atmospheric column shielding
        models — <em className="text-slate-300">NASA / JPL-Caltech / SwRI</em>.
      </>
    ),
  },
  {
    title: 'Thermal & Weather Telemetry',
    description: (
      <>
        Curiosity (REMS), Perseverance (MEDA), and InSight Mars Weather Data —{' '}
        <em className="text-slate-300">NASA / JPL-Caltech / CAB</em>.
      </>
    ),
  },
  {
    title: 'Mission Photography',
    description: (
      <>
        Official public-domain rover &amp; spacecraft imagery —{' '}
        <em className="text-slate-300">
          NASA / JPL-Caltech / MSSS / ESA / CNSA / Wikimedia Commons
        </em>
        .
      </>
    ),
  },
  {
    title: '3D Globe Engine',
    description: (
      <>
        Powered by open-source <em className="text-slate-300">CesiumJS</em>.
      </>
    ),
  },
];

export function InfoMenu({ hasTargetCardOpen }: InfoMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<InfoModalType>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Capture-phase global pointerdown closes dropdown even when clicking on Cesium canvas
  useEffect(() => {
    const handlePointerDownCapture = (e: PointerEvent) => {
      if (!menuOpen) return;
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownCapture, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownCapture, { capture: true });
    };
  }, [menuOpen]);

  // Escape closes active modal or dropdown before global shortcuts fire
  useEffect(() => {
    if (!menuOpen && !activeModal) return;

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (activeModal) {
          setActiveModal(null);
        } else if (menuOpen) {
          setMenuOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDownCapture, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, { capture: true });
    };
  }, [menuOpen, activeModal]);

  const openModal = (modal: Exclude<InfoModalType, null>) => {
    setMenuOpen(false);
    setActiveModal(modal);
  };

  return (
    <>
      {/* Top-Right 3-Dot Menu Container (Shifts smoothly left of Knowledge Card on md+ viewports) */}
      <div
        ref={menuContainerRef}
        className={`fixed top-4 right-4 z-40 transition-all duration-200 ease-out ${
          hasTargetCardOpen
            ? 'md:-translate-x-[367px] max-md:pointer-events-none max-md:opacity-0 max-md:scale-95 pointer-events-auto'
            : 'translate-x-0 opacity-100 scale-100 pointer-events-auto'
        }`}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Open menu for details, data sources, and about"
          title="Menu"
          className={`flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md shadow-2xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75 ${
            menuOpen
              ? 'border-orange-400/50 bg-[#0B0F17]/92 text-white'
              : 'border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Atlas information menu"
            className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-white/15 bg-[#0B0F17]/92 p-1.5 backdrop-blur-md shadow-2xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => openModal('details')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75"
            >
              <Database className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
              <span>Details &amp; Data Sources</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => openModal('about')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75"
            >
              <Info className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
              <span>About</span>
            </button>
          </div>
        )}
      </div>

      {/* Centered Glassmorphism Modal Dialogs */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="info-modal-title"
          onClick={() => setActiveModal(null)}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[calc(100vh-2.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F17]/92 text-slate-100 backdrop-blur-xl shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-slate-400">
                  {activeModal === 'details'
                    ? 'Scientific Calibration & Imagery Provenance'
                    : 'NASA International Space Apps Challenge'}
                </p>
                <h2
                  id="info-modal-title"
                  className="mt-0.5 font-display text-lg font-bold tracking-tight text-white"
                >
                  {activeModal === 'details' ? 'Details & Data Sources' : 'About'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close modal"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="hud-scroll flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {activeModal === 'details' ? (
                <>
                  {/* Highlighted Scientific Scale Note Callout */}
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.08] p-4">
                    <div className="text-xs font-semibold text-amber-300 mb-1">
                      Scientific Scale Note
                    </div>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-amber-100/95">
                      Note: Vector sprites and 3D/2D visual representations of rovers, landers, and
                      orbiting satellites are enlarged{' '}
                      <span className="font-mono-tabular font-semibold text-amber-200">~1,000×</span>{' '}
                      relative to planetary scale for better visual clarity and interactive
                      experience.
                    </p>
                  </div>

                  {/* NASA & Open Data Attributions */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold tracking-wide text-slate-300">
                      NASA &amp; Open Data Attributions
                    </h3>
                    <dl className="divide-y divide-white/10 border-t border-b border-white/10">
                      {DATA_ATTRIBUTIONS.map((item) => (
                        <div key={item.title} className="py-3 space-y-1">
                          <dt className="text-xs font-semibold text-white">{item.title}</dt>
                          <dd className="text-xs leading-relaxed text-slate-300">
                            {item.description}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </>
              ) : (
                <>
                  {/* Project Overview */}
                  <div className="space-y-2">
                    <h3 className="font-display text-base font-bold text-white">
                      Interplanetary Survival Guide: Martian Map
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      Built for the{' '}
                      <span className="font-semibold text-orange-300">
                        NASA International Space Apps Challenge
                      </span>
                      . An interactive 3D Martian globe and survival navigation atlas designed to
                      help astronauts and researchers explore landing sites, monitor radiation and
                      thermal hazards, and plan safe surface traverses.
                    </p>
                  </div>

                  {/* Developers */}
                  <div className="border-t border-white/10 pt-4 space-y-1.5">
                    <h3 className="text-xs font-semibold tracking-wide text-slate-300">
                      Developers
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      Created by two high school students:{' '}
                      <span className="font-semibold text-white">Jatin Kumar</span> and{' '}
                      <span className="font-semibold text-white">Raunak Kumar</span>.
                    </p>
                  </div>

                  {/* AI Assistance & Tool Disclosure */}
                  <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.07] p-4 space-y-1.5">
                    <h3 className="text-xs font-semibold text-cyan-300">
                      AI Assistance &amp; Tool Disclosure (NASA Space Apps Compliance)
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      Developed with the assistance of AI tools — including{' '}
                      <strong className="font-semibold text-white">Google AI Studio (Gemini)</strong>,{' '}
                      <strong className="font-semibold text-white">Manus</strong>, and{' '}
                      <strong className="font-semibold text-white">Google AI</strong> — used for
                      code architecture, CesiumJS geospatial debugging, dataset structuring, and UI
                      refinement.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
