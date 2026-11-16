import { useEffect, useState } from 'react';

const JULIAN_DATE_UNIX_EPOCH = 2440587.5;
const JULIAN_DATE_J2000 = 2451549.5;
const MARS_SOL_DAYS_PER_EARTH_DAY = 1.0274912517;
const MARS_SOL_DATE_AT_J2000 = 44796;
const NASA_MARS24_EPOCH_CORRECTION = -0.0009626;
// TT−UTC for the current leap-second table (37 s TAI−UTC + 32.184 s TT−TAI).
const TERRESTRIAL_TIME_OFFSET_SECONDS = 69.184;

function formatEarthUtc(epochMs: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(epochMs);
}

function getMarsClock(epochMs: number): { time: string; sol: number } {
  const jdUtc = epochMs / 86_400_000 + JULIAN_DATE_UNIX_EPOCH;
  const jdTt = jdUtc + TERRESTRIAL_TIME_OFFSET_SECONDS / 86_400;
  const marsSolDate =
    (jdTt - JULIAN_DATE_J2000) / MARS_SOL_DAYS_PER_EARTH_DAY +
    MARS_SOL_DATE_AT_J2000 +
    NASA_MARS24_EPOCH_CORRECTION;
  const marsDayFraction = ((marsSolDate % 1) + 1) % 1;
  const secondsInMarsDay = Math.floor(marsDayFraction * 86_400);
  const hours = Math.floor(secondsInMarsDay / 3600);
  const minutes = Math.floor((secondsInMarsDay % 3600) / 60);
  const seconds = secondsInMarsDay % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    time: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    sol: Math.floor(marsSolDate),
  };
}

export function MarsClockWidget() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const marsClock = getMarsClock(now);

  return (
    <div
      aria-label={`Earth UTC ${formatEarthUtc(now)}; Mars Coordinated Time ${marsClock.time}, sol ${marsClock.sol}`}
      title="Earth UTC and Mars Coordinated Time (NASA Mars24 convention)"
      className="mr-1.5 flex min-w-[116px] flex-col gap-0.5 rounded-xl border border-white/15 bg-[#0B0F17]/82 px-2 py-1 text-[9px] leading-tight text-slate-200 shadow-2xl backdrop-blur-md sm:mr-2 sm:min-w-[160px] sm:px-2.5 sm:py-1.5 sm:text-[10px]"
    >
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <span className="font-semibold tracking-wide text-slate-400">
          <span className="hidden sm:inline">EARTH · </span>UTC
        </span>
        <time className="font-mono-tabular text-[10px] tabular-nums text-white sm:text-[11px]">{formatEarthUtc(now)}</time>
      </div>
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <span className="font-semibold tracking-wide text-orange-300/80">
          <span className="hidden sm:inline">MARS · </span>MTC
        </span>
        <time className="font-mono-tabular text-[10px] tabular-nums text-orange-200 sm:text-[11px]">{marsClock.time}</time>
      </div>
      <span className="sr-only">Mars Sol Date {marsClock.sol}</span>
    </div>
  );
}
