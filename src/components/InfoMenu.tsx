import { Database, Info, MoreVertical, Radio, RotateCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MarsClockWidget } from './MarsClockWidget';

export type InfoModalType = 'rescue' | 'details' | 'about' | null;

interface InfoMenuProps {
  hasTargetCardOpen: boolean;
}

const DATA_ATTRIBUTIONS = [
  {
    title: 'Optical Surface Imagery',
    description: (
      <>
        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (
        <span className="font-mono-tabular text-slate-200">232m/px</span>) —{' '}
        <em className="text-slate-300">NASA / JPL / USGS Astrogeology / Esri</em>.
      </>
    ),
  },
  {
    title: 'High-Resolution Orbital Detail',
    description: (
      <>
        High-Resolution Orbital Detail: Bruce Murray Laboratory for Planetary Visualization
        (Caltech) / NASA MRO CTX Global Mosaic (
        <span className="font-mono-tabular text-slate-200">~5 m/px</span>, opt-in Extra Details
        overlay across Optical, Elevation, Temperature, and Radiation modes;{' '}
        <span className="font-mono-tabular text-slate-200">murray-lab.caltech.edu/CTX/</span>
        ) — <em className="text-slate-300">NASA / JPL / MSSS / Caltech Murray Lab</em>.
      </>
    ),
  },
  {
    title: 'PLACEHOLDER_REST_OF_FILE',
    description: <>See full restore</>,
  },
];

export function InfoMenu({ hasTargetCardOpen }: InfoMenuProps) {
  const [activeModal, setActiveModal] = useState<InfoModalType>(null);
  return (
    <div className="fixed top-3 right-2.5 sm:top-4 sm:right-4 z-30">
      <button type="button" onClick={() => setActiveModal('about')} aria-label="Info menu">
        <MoreVertical className="h-5 w-5 text-slate-200" />
      </button>
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setActiveModal(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0B0F17] p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-bold mb-2">Details & Data Sources</h2>
            <dl className="space-y-2">
              {DATA_ATTRIBUTIONS.map((item) => (
                <div key={item.title}>
                  <dt className="text-xs font-semibold text-white">{item.title}</dt>
                  <dd className="text-xs text-slate-300">{item.description}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className="mt-4 text-sm text-cyan-300" onClick={() => setActiveModal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
