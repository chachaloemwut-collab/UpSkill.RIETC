"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import "./animated-icons.css";

/*
 * Story icons: each one acts out what its action means (a person walks out of a door and it shuts, a sheet of
 * paper drops into the bin, the plane flies off and loops back…). Keyframes live in index.css under "Story icons".
 *
 *   const [n, play] = usePlay();
 *   <Button onClick={play}><LogoutIcon play={n} /> ออกจากระบบ</Button>
 *
 * Bumping `play` remounts the SVG so the story restarts from the top. Hovering the button that holds an icon shows a
 * small hint of the story. Morphing icons (menu, theme, eye, lock) take a boolean state instead.
 */

/** A counter to pass as an icon's `play` prop; call `play()` to run the icon's story again. */
export function usePlay() {
  const [n, setN] = React.useState(0);
  return [n, React.useCallback(() => setN((x) => x + 1), [])] as const;
}

interface StoryProps {
  /** Increment to play the story; 0 (or omitted) shows the resting icon. */
  play?: number;
  className?: string;
}

function Svg({ name, play = 0, className, data, children }: { name: string; play?: number; className?: string; data?: Record<string, boolean>; children: React.ReactNode }) {
  const attrs = Object.fromEntries(Object.entries(data ?? {}).filter(([, v]) => v).map(([k]) => [`data-${k}`, ""]));
  return (
    <svg
      key={play}
      data-play={play > 0 ? "" : undefined}
      {...attrs}
      className={cn("ai h-4 w-4 shrink-0", `ai-${name}`, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A small walking figure, standing in the doorway (centered on x=16.5). */
function Person() {
  return (
    <g className="person" strokeWidth="1.6">
      <circle cx="16.5" cy="7.2" r="1.6" fill="currentColor" stroke="none" />
      <path d="M16.5 9.5v5M16.5 11l-2 2M16.5 11l2 2" />
      <path className="leg-a" d="M16.5 14.5 15.3 19" />
      <path className="leg-b" d="M16.5 14.5 17.7 19" />
    </g>
  );
}

function Door() {
  return (
    <>
      <rect x="13" y="3" width="8" height="18" rx="1.5" />
      <g className="door-panel">
        <rect x="13" y="3" width="8" height="18" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="none" />
        <circle cx="15.3" cy="12" r="0.9" fill="currentColor" stroke="none" />
      </g>
    </>
  );
}

/** Door opens, a person walks out and away, the door shuts behind them. */
export function LogoutIcon({ play, className }: StoryProps) {
  return (
    <Svg name="logout" play={play} className={className}>
      <Door />
      <Person />
      <g className="arrow">
        <path d="M10 12H3" />
        <path d="m6 9-3 3 3 3" />
      </g>
    </Svg>
  );
}

/** A person walks up, the door opens, they step inside and it closes. */
export function LoginIcon({ play, className }: StoryProps) {
  return (
    <Svg name="login" play={play} className={className}>
      <Door />
      <Person />
      <g className="arrow">
        <path d="M3 12h7" />
        <path d="m7 9 3 3-3 3" />
      </g>
    </Svg>
  );
}

/** The lid lifts, a crumpled sheet drops in, the can takes the weight. */
export function TrashIcon({ play, className }: StoryProps) {
  return (
    <Svg name="trash" play={play} className={className}>
      <rect className="paper" x="10" y="0" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
      <g className="can">
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M10 11v6M14 11v6" />
      </g>
      <g className="lid">
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </g>
    </Svg>
  );
}

/** The paper plane flies off to the top-right and loops back in. */
export function SendIcon({ play, className }: StoryProps) {
  return (
    <Svg name="send" play={play} className={className}>
      <g className="plane">
        <path d="M14.5 21.7a.5.5 0 0 0 .94-.02l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z" />
        <path d="m21.85 2.15-10.94 10.94" />
      </g>
    </Svg>
  );
}

/** The arrow drops into the tray, which dips under the weight; a fresh arrow springs back in. */
export function DownloadIcon({ play, className }: StoryProps) {
  return (
    <Svg name="download" play={play} className={className}>
      <path className="tray" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <g className="arrow">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
      </g>
    </Svg>
  );
}

/** The arrow launches out of the tray and a new one rises back. */
export function UploadIcon({ play, className }: StoryProps) {
  return (
    <Svg name="upload" play={play} className={className}>
      <path className="tray" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <g className="arrow">
        <path d="M12 15V3" />
        <path d="m17 8-5-5-5 5" />
      </g>
    </Svg>
  );
}

/** A duplicate slides out from under the original sheet. */
export function CopyIcon({ play, className }: StoryProps) {
  return (
    <Svg name="copy" play={play} className={className}>
      <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
      <rect className="dup" x="8" y="8" width="14" height="14" rx="2" />
    </Svg>
  );
}

/** The bell swings and its clapper lags behind, settling like a real bell. */
export function BellIcon({ play, className }: StoryProps) {
  return (
    <Svg name="bell" play={play} className={className}>
      <path className="body" d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path className="clapper" d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Svg>
  );
}

/** One full turn with a touch of overshoot. */
export function RefreshIcon({ play, className }: StoryProps) {
  return (
    <Svg name="refresh" play={play} className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </Svg>
  );
}

/** A parcel drops into the basket, which dips; the wheels roll. */
export function CartIcon({ play, className }: StoryProps) {
  return (
    <Svg name="cart" play={play} className={className}>
      <rect className="item" x="10" y="5" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
      <path className="basket" d="M2 3h2.5l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21.5 7H5.6" />
      <circle className="wheel" cx="9" cy="20.5" r="1.3" />
      <circle className="wheel" cx="18" cy="20.5" r="1.3" />
    </Svg>
  );
}

/** The tick draws itself. */
export function CheckDrawIcon({ play = 1, className }: StoryProps) {
  return (
    <Svg name="check" play={play} className={className}>
      <path className="tick" d="M20 6 9 17l-5-5" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}

/* ---------- Morphing icons ---------- */

/** Hamburger ↔ close. */
export function MenuToggleIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <Svg name="menu" className={className} data={{ open }}>
      <line className="l1" x1="4" y1="6" x2="20" y2="6" />
      <line className="l2" x1="4" y1="12" x2="20" y2="12" />
      <line className="l3" x1="4" y1="18" x2="20" y2="18" />
    </Svg>
  );
}

/** Sun ↔ moon: the rays retract and a shadow slides across the growing disc. */
export function ThemeIcon({ dark, className }: { dark: boolean; className?: string }) {
  const id = React.useId();
  return (
    <Svg name="theme" className={className} data={{ dark }}>
      <mask id={id}>
        <rect x="-4" y="-4" width="32" height="32" fill="white" />
        <circle className="cut" cx="16.5" cy="7.5" r="5" fill="black" />
      </mask>
      <circle className="core" cx="12" cy="12" r="4" fill="currentColor" stroke="none" mask={`url(#${id})`} />
      <g className="rays">
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
      </g>
    </Svg>
  );
}

/** Eye ↔ eye closed: the pupil blinks shut, the lid comes down and a slash draws across. */
export function EyeToggleIcon({ hidden, className }: { hidden: boolean; className?: string }) {
  return (
    <Svg name="eye" className={className} data={{ hidden }}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle className="pupil" cx="12" cy="12" r="3" />
      <path className="lid" d="M3 12s3-6.5 9-6.5 9 6.5 9 6.5" fill="currentColor" fillOpacity="0.2" stroke="none" />
      <path className="slash" d="m3 3 18 18" pathLength={1} />
    </Svg>
  );
}

/** Locked ↔ unlocked: the shackle springs up and swings open. */
export function LockToggleIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <Svg name="lock" className={className} data={{ open }}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path className="shackle" d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* ============================================================================================
 * More story icons. Keyframes for these live in ./animated-icons.css.
 * Names that clash with the static set in icons.tsx get a verb-ish name instead
 * (MagnifyIcon, GearIcon, EnvelopeIcon, FavoriteIcon, ScheduleIcon).
 * ============================================================================================ */

const USER = (
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
  </>
);

/** A new member pops up beside you and the plus spins into place. */
export function UserPlusIcon({ play, className }: StoryProps) {
  return (
    <Svg name="user-plus" play={play} className={className}>
      <g className="who">{USER}</g>
      <path className="sign" d="M19 8v6M22 11h-6" />
    </Svg>
  );
}

/** The member slides out and fades; the minus sweeps across. */
export function UserMinusIcon({ play, className }: StoryProps) {
  return (
    <Svg name="user-minus" play={play} className={className}>
      <g className="who">{USER}</g>
      <path className="sign" d="M22 11h-6" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}

/** The key slides into the lock and turns, a spark at the bit. */
export function KeyIcon({ play, className }: StoryProps) {
  return (
    <Svg name="key" play={play} className={className}>
      <g className="key">
        <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
        <path d="m21 2-9.6 9.6" />
        <circle cx="7.5" cy="15.5" r="5.5" />
      </g>
      <g className="spark" strokeWidth="1.5">
        <path d="M22.5 0.5 23.5 -0.5M20 -0.5v-1.2M23.8 3h1.2" />
      </g>
    </Svg>
  );
}

const SHIELD = "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

/** A scan line sweeps the shield, then the tick draws: verified. */
export function ShieldCheckIcon({ play, className }: StoryProps) {
  const id = React.useId();
  return (
    <Svg name="shield" play={play} className={className}>
      <clipPath id={id}><path d={SHIELD} /></clipPath>
      <path className="body" d={SHIELD} />
      <g clipPath={`url(#${id})`}>
        <rect className="scan" x="3" y="1" width="18" height="3" fill="currentColor" fillOpacity="0.35" stroke="none" />
      </g>
      <path className="tick" d="m9 12 2 2 4-4" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}

/** The ridges light up one by one from the core outward: scanned. */
export function FingerprintIcon({ play, className }: StoryProps) {
  const ridges = [
    "M12 12v5",
    "M9.5 17.5v-5.5a2.5 2.5 0 0 1 5 0v2",
    "M7 16v-4a5 5 0 0 1 10 0v4",
    "M4.5 15v-3a7.5 7.5 0 0 1 15 0v1",
    "M4 7.5a10 10 0 0 1 16 0",
  ];
  return (
    <Svg name="finger" play={play} className={className}>
      {ridges.map((d, i) => (
        <path key={i} className="ridge" d={d} pathLength={1} strokeDasharray="1" style={{ animationDelay: `${i * 90}ms` }} />
      ))}
      <path className="beam" d="M3 20h18" strokeWidth="1.5" />
    </Svg>
  );
}

/** An arrow drops into the disk, the disk takes it and the shutter slides. */
export function SaveIcon({ play, className }: StoryProps) {
  return (
    <Svg name="save" play={play} className={className}>
      <g className="disk">
        <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
        <path className="shutter" d="M7 3v4a1 1 0 0 0 1 1h7" />
      </g>
      <path className="in" d="M12 -6v5m-2.5-2.5L12 -1l2.5-2.5" />
    </Svg>
  );
}

/** A sheet peeks up out of the folder and tucks back in. */
export function FolderIcon({ play, className }: StoryProps) {
  return (
    <Svg name="folder" play={play} className={className}>
      <rect className="sheet" x="7" y="5" width="10" height="8" rx="1" fill="currentColor" fillOpacity="0.2" />
      <path className="body" d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <path className="flap" d="M2 10h20" />
    </Svg>
  );
}

/** The lid lifts, a box drops inside, the lid shuts: archived. */
export function ArchiveIcon({ play, className }: StoryProps) {
  return (
    <Svg name="archive" play={play} className={className}>
      <rect className="item" x="9.5" y="-2" width="5" height="4" rx="0.8" fill="currentColor" stroke="none" />
      <g className="box">
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </g>
      <rect className="lid" width="20" height="5" x="2" y="3" rx="1" />
    </Svg>
  );
}

/** The printer hums and the page feeds out line by line. */
export function PrinterIcon({ play, className }: StoryProps) {
  const id = React.useId();
  return (
    <Svg name="print" play={play} className={className}>
      <clipPath id={id}><rect x="0" y="13" width="24" height="12" /></clipPath>
      <g className="body">
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
      </g>
      <g clipPath={`url(#${id})`}>
        <g className="page">
          <rect x="6" y="14" width="12" height="8" rx="1" />
          <path d="M9 17.5h6M9 20h4" strokeWidth="1.5" />
        </g>
      </g>
    </Svg>
  );
}

/** The clip swings down and snaps on. */
export function PaperclipIcon({ play, className }: StoryProps) {
  return (
    <Svg name="clip" play={play} className={className}>
      <path className="clip" d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
    </Svg>
  );
}

/** Two links pull apart and snap together with a spark. */
export function LinkIcon({ play, className }: StoryProps) {
  return (
    <Svg name="link" play={play} className={className}>
      <path className="a" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path className="b" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      <circle className="spark" cx="12" cy="12" r="3.5" strokeWidth="1.2" />
    </Svg>
  );
}

/** The source pulses and sends a line out to each receiver, which pops in. */
export function ShareIcon({ play, className }: StoryProps) {
  return (
    <Svg name="share" play={play} className={className}>
      <path className="line l1" d="M8.59 10.49 15.42 6.51" pathLength={1} strokeDasharray="1" />
      <path className="line l2" d="M8.59 13.51 15.42 17.49" pathLength={1} strokeDasharray="1" />
      <circle className="src" cx="6" cy="12" r="3" />
      <circle className="dst d1" cx="18" cy="5" r="3" />
      <circle className="dst d2" cx="18" cy="19" r="3" />
    </Svg>
  );
}

/** The pencil writes a line of ink and lifts back. */
export function PencilIcon({ play, className }: StoryProps) {
  return (
    <Svg name="pencil" play={play} className={className}>
      <path className="ink" d="M3.5 21.5c2-1.6 3-.2 4.5-1s2.5.8 4 0 2.5.8 4 0 2 .6 4 0" pathLength={1} strokeDasharray="1" strokeWidth="1.6" />
      <g className="pen">
        <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
        <path d="m15 5 3 3" />
      </g>
    </Svg>
  );
}

/** The lens circles around looking, then zooms in on what it found. */
export function MagnifyIcon({ play, className }: StoryProps) {
  return (
    <Svg name="magnify" play={play} className={className}>
      <g className="lens">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
        <path className="glint" d="M7.5 9a4 4 0 0 1 2.5-2.5" strokeWidth="1.5" />
      </g>
    </Svg>
  );
}

/** Drops pour into the funnel; only one makes it through. */
export function FilterIcon({ play, className }: StoryProps) {
  return (
    <Svg name="filter" play={play} className={className}>
      <circle className="drop k1" cx="7" cy="-1" r="1.3" fill="currentColor" stroke="none" />
      <circle className="drop k2" cx="12" cy="-2" r="1.3" fill="currentColor" stroke="none" />
      <circle className="drop k3" cx="17" cy="-1" r="1.3" fill="currentColor" stroke="none" />
      <path className="funnel" d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
    </Svg>
  );
}

/** The bars shuffle out of order, then settle short → long. */
export function SortIcon({ play, className }: StoryProps) {
  return (
    <Svg name="sort" play={play} className={className}>
      <path className="bar b1" d="M4 6h6" />
      <path className="bar b2" d="M4 12h11" />
      <path className="bar b3" d="M4 18h16" />
    </Svg>
  );
}

/** A letter slides into the envelope, the flap folds shut and it hops off. */
export function EnvelopeIcon({ play, className }: StoryProps) {
  const id = React.useId();
  return (
    <Svg name="mail" play={play} className={className}>
      <clipPath id={id}><rect x="-2" y="-14" width="28" height="20" /></clipPath>
      <g clipPath={`url(#${id})`}>
        <g className="letter">
          <rect x="6" y="-4" width="12" height="9" rx="1" />
          <path d="M9 -1h6M9 1.5h4" strokeWidth="1.5" />
        </g>
      </g>
      <g className="env">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path className="flap" d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </g>
    </Svg>
  );
}

/** The bubble pops up and the other person is typing. */
export function ChatIcon({ play, className }: StoryProps) {
  return (
    <Svg name="chat" play={play} className={className}>
      <path className="bubble" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <circle className="dot t1" cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle className="dot t2" cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle className="dot t3" cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The handset buzzes and the signal ripples out. */
export function PhoneIcon({ play, className }: StoryProps) {
  return (
    <Svg name="phone" play={play} className={className}>
      <path className="set" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      <path className="wave w1" d="M14.05 6A5 5 0 0 1 18 10" />
      <path className="wave w2" d="M14.05 2A9 9 0 0 1 22 9.95" />
    </Svg>
  );
}

const BURST = [0, 60, 120, 180, 240, 300];
function Burst({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className="burst">
      {BURST.map((a) => (
        <circle key={a} cx={cx} cy={cy} r="1" fill="currentColor" stroke="none" style={{ "--a": `${a}deg` } as React.CSSProperties} />
      ))}
    </g>
  );
}

/** The heart squeezes, fills, pops and throws off sparks: liked. */
export function HeartIcon({ play, className }: StoryProps) {
  return (
    <Svg name="heart" play={play} className={className}>
      <path className="heart" d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="currentColor" fillOpacity="0" />
      <Burst cx={12} cy={12} />
    </Svg>
  );
}

/** The star spins, fills in and twinkles: favorited. */
export function FavoriteIcon({ play, className }: StoryProps) {
  return (
    <Svg name="star" play={play} className={className}>
      <path className="star" d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="currentColor" fillOpacity="0" />
      <Burst cx={12} cy={12} />
    </Svg>
  );
}

/** The ribbon drops down, stretches and fills: saved for later. */
export function BookmarkIcon({ play, className }: StoryProps) {
  return (
    <Svg name="bookmark" play={play} className={className}>
      <path className="ribbon" d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill="currentColor" fillOpacity="0" />
    </Svg>
  );
}

/** The hand winds back, thrusts up and a +1 floats away. */
export function ThumbsUpIcon({ play, className }: StoryProps) {
  return (
    <Svg name="thumb" play={play} className={className}>
      <g className="hand">
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
      <text className="plus1" x="17" y="4" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">+1</text>
    </Svg>
  );
}

/** The megaphone kicks back and sound waves roll out. */
export function MegaphoneIcon({ play, className }: StoryProps) {
  return (
    <Svg name="mega" play={play} className={className}>
      <g className="horn">
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </g>
      <path className="wave w1" d="M23 9.5a4 4 0 0 1 0 5" strokeWidth="1.5" />
      <path className="wave w2" d="M25 7.5a7 7 0 0 1 0 9" strokeWidth="1.5" />
    </Svg>
  );
}

/** Press: the body dips, the shutter closes and reopens, the flash fires. */
export function CameraIcon({ play, className }: StoryProps) {
  return (
    <Svg name="camera" play={play} className={className}>
      <g className="body">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle className="lens" cx="12" cy="13" r="3" />
      </g>
      <circle className="flash" cx="18.5" cy="3" r="3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The sun rises over the hills inside the frame. */
export function ImageIcon({ play, className }: StoryProps) {
  const id = React.useId();
  return (
    <Svg name="image" play={play} className={className}>
      <clipPath id={id}><rect x="3" y="3" width="18" height="18" rx="2" /></clipPath>
      <g clipPath={`url(#${id})`}>
        <circle className="sun" cx="9" cy="9" r="2" fill="currentColor" fillOpacity="0.2" />
        <path className="hills" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </g>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </Svg>
  );
}

/** A heavy flywheel: winds up, spins past and settles. */
export function GearIcon({ play, className }: StoryProps) {
  return (
    <Svg name="gear" play={play} className={className}>
      <g className="gear">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </g>
    </Svg>
  );
}

/** The switch presses in and the ring charges up around it. */
export function PowerIcon({ play, className }: StoryProps) {
  return (
    <Svg name="power" play={play} className={className}>
      <path className="ring" d="M18.36 6.64A9 9 0 1 1 5.64 6.64" pathLength={1} strokeDasharray="1" />
      <path className="stem" d="M12 2v10" />
    </Svg>
  );
}

/** Signal bars light up from the dot outward, twice. */
export function WifiIcon({ play, className }: StoryProps) {
  return (
    <Svg name="wifi" play={play} className={className}>
      <path className="arc a0" d="M12 20h.01" strokeWidth="3" />
      <path className="arc a1" d="M8.5 16.43a5 5 0 0 1 7 0" />
      <path className="arc a2" d="M5 12.86a10 10 0 0 1 14 0" />
      <path className="arc a3" d="M2 8.82a15 15 0 0 1 20 0" />
    </Svg>
  );
}

/** Charge fills in three steps and the bolt flashes. */
export function BatteryIcon({ play, className }: StoryProps) {
  return (
    <Svg name="battery" play={play} className={className}>
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <path d="M22 11v2" />
      <rect className="level" x="4.5" y="9.5" width="11" height="5" rx="0.8" fill="currentColor" stroke="none" />
      <path className="bolt" d="m11 7.5-3 4.5h4l-3 4.5" strokeWidth="1.6" />
    </Svg>
  );
}

/** The arrow rises into the cloud, which puffs as it swallows it. */
export function CloudUploadIcon({ play, className }: StoryProps) {
  return (
    <Svg name="cloud" play={play} className={className}>
      <path className="cloud" d="M4.2 15.1A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2" />
      <g className="arrow">
        <path d="M12 13v8" />
        <path d="m8 17 4-4 4 4" />
      </g>
    </Svg>
  );
}

/** Ignition: it rumbles, the flame grows, it launches and comes back to the pad. */
export function RocketIcon({ play, className }: StoryProps) {
  return (
    <Svg name="rocket" play={play} className={className}>
      <g className="ship">
        <path className="flame" d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </g>
    </Svg>
  );
}

/** Sand runs down, then the glass flips over. */
export function HourglassIcon({ play, className }: StoryProps) {
  return (
    <Svg name="hourglass" play={play} className={className}>
      <g className="glass">
        <path d="M5 22h14M5 2h14" />
        <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
        <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
        <path className="top" d="M8.5 5.5h7L12 9.5z" fill="currentColor" stroke="none" />
        <path className="bottom" d="M8.5 20.5h7L12 17z" fill="currentColor" stroke="none" />
        <path className="stream" d="M12 10v8" strokeWidth="1" strokeDasharray="1 1.5" />
      </g>
    </Svg>
  );
}

/** Brrring: the clock rattles on its legs and the hands race round. */
export function AlarmIcon({ play, className }: StoryProps) {
  return (
    <Svg name="alarm" play={play} className={className}>
      <g className="clock">
        <circle cx="12" cy="13" r="8" />
        <path className="hands" d="M12 9v4l2 2" />
        <path className="bell l" d="M5 3 2 6" />
        <path className="bell r" d="m22 6-3-3" />
        <path d="M6.38 18.7 4 21M17.64 18.67 20 21" />
      </g>
    </Svg>
  );
}

/** The bulb flickers on and glows: an idea. */
export function LightbulbIcon({ play, className }: StoryProps) {
  return (
    <Svg name="bulb" play={play} className={className}>
      <path className="glass" d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5z" fill="currentColor" fillOpacity="0" />
      <path d="M9 18h6M10 22h4" />
      <path className="rays" d="M2.5 8H1M22.5 8H23M4.2 2.2 3.2 1.2M19.8 2.2l1-1M4.2 13.8l-1 1M19.8 13.8l1 1" />
    </Svg>
  );
}

const SPARK = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}C${cx + r * 0.1} ${cy - r * 0.3} ${cx + r * 0.3} ${cy - r * 0.1} ${cx + r} ${cy}C${cx + r * 0.3} ${cy + r * 0.1} ${cx + r * 0.1} ${cy + r * 0.3} ${cx} ${cy + r}C${cx - r * 0.1} ${cy + r * 0.3} ${cx - r * 0.3} ${cy + r * 0.1} ${cx - r} ${cy}C${cx - r * 0.3} ${cy - r * 0.1} ${cx - r * 0.1} ${cy - r * 0.3} ${cx} ${cy - r}Z`;

/** Magic: the big sparkle turns and flashes, the little ones twinkle after it. */
export function SparklesIcon({ play, className }: StoryProps) {
  return (
    <Svg name="sparkles" play={play} className={className}>
      <path className="s0" d={SPARK(10, 11, 8)} fill="currentColor" fillOpacity="0" />
      <path className="s1" d={SPARK(19.5, 4.5, 2.8)} fill="currentColor" stroke="none" />
      <path className="s2" d={SPARK(19, 18.5, 2.2)} fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The pin lifts, drops, squashes on landing and a ripple spreads. */
export function MapPinIcon({ play, className }: StoryProps) {
  return (
    <Svg name="pin" play={play} className={className}>
      <ellipse className="ripple" cx="12" cy="22" rx="5" ry="1.4" strokeWidth="1.2" />
      <g className="pin">
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </g>
    </Svg>
  );
}

/** The box shakes, the lid pops off and confetti flies out. */
export function GiftIcon({ play, className }: StoryProps) {
  return (
    <Svg name="gift" play={play} className={className}>
      <Burst cx={12} cy={9} />
      <g className="box">
        <path d="M12 12v9" />
        <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      </g>
      <g className="lid">
        <rect x="3" y="8" width="18" height="4" rx="1" />
        <path d="M12 8v4" />
        <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
      </g>
    </Svg>
  );
}

/** A coin flips, drops into the wallet and the wallet takes it. */
export function WalletIcon({ play, className }: StoryProps) {
  const id = React.useId();
  return (
    <Svg name="wallet" play={play} className={className}>
      <clipPath id={id}><rect x="-2" y="-12" width="28" height="19" /></clipPath>
      <g clipPath={`url(#${id})`}>
        <circle className="coin" cx="12" cy="-3" r="2.6" strokeWidth="1.6" />
      </g>
      <g className="wallet">
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </g>
    </Svg>
  );
}

/** The price tag swings on its hole and settles. */
export function TagIcon({ play, className }: StoryProps) {
  return (
    <Svg name="tag" play={play} className={className}>
      <g className="tag">
        <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
        <circle cx="7.5" cy="7.5" r=".6" fill="currentColor" />
        <path className="pct" d="m10.5 13.5 4-4" strokeWidth="1.5" />
      </g>
    </Svg>
  );
}

/** The truck revs, drives off, and pulls back in from the other side with a brake. */
export function TruckIcon({ play, className }: StoryProps) {
  return (
    <Svg name="truck" play={play} className={className}>
      <path className="speed" d="M-1 9h-3M0 13h-4" strokeWidth="1.5" />
      <g className="truck">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle className="wheel" cx="17" cy="18" r="2" />
        <circle className="wheel" cx="7" cy="18" r="2" />
      </g>
    </Svg>
  );
}

/** A page tears off the calendar and the new day gets ticked. */
export function ScheduleIcon({ play, className }: StoryProps) {
  return (
    <Svg name="schedule" play={play} className={className}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path className="rings" d="M8 2v4M16 2v4" />
      <path d="M3 10h18" />
      <path className="page" d="M5 11.5h14v8.5H5z" fill="currentColor" fillOpacity="0.15" stroke="none" />
      <path className="tick" d="m9 15.5 2 2 4-4" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}

/** Sent, then read: the second tick follows the first, like a chat receipt. */
export function ReadReceiptIcon({ play, className }: StoryProps) {
  return (
    <Svg name="receipt" play={play} className={className}>
      <path className="t1" d="M18 6 7 17l-5-5" pathLength={1} strokeDasharray="1" />
      <path className="t2" d="m22 10-7.5 7.5L13 16" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}

/** The trail rewinds back toward the arrowhead, which nudges left. */
export function UndoIcon({ play, className }: StoryProps) {
  return (
    <Svg name="undo" play={play} className={className}>
      <path className="trail" d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" pathLength={1} strokeDasharray="1" />
      <path className="head" d="M9 14 4 9l5-5" />
    </Svg>
  );
}

/** Mirror of undo. */
export function RedoIcon({ play, className }: StoryProps) {
  return (
    <Svg name="redo" play={play} className={className}>
      <path className="trail" d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" pathLength={1} strokeDasharray="1" />
      <path className="head" d="m15 14 5-5-5-5" />
    </Svg>
  );
}

/* ---------- More morphing icons ---------- */

/** Play ↔ pause: the triangle turns away as the bars grow in. */
export function PlayPauseIcon({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <Svg name="playpause" className={className} data={{ playing }}>
      <path className="tri" d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z" fill="currentColor" stroke="none" />
      <rect className="bar b1" x="5" y="3" width="4.5" height="18" rx="1.2" fill="currentColor" stroke="none" />
      <rect className="bar b2" x="14.5" y="3" width="4.5" height="18" rx="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Sound ↔ muted: waves pulse out when on; they collapse and an X draws when muted. */
export function VolumeIcon({ muted, className }: { muted: boolean; className?: string }) {
  return (
    <Svg name="volume" className={className} data={{ muted }}>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path className="wave w1" d="M16 9a5 5 0 0 1 0 6" />
      <path className="wave w2" d="M19.364 18.364a9 9 0 0 0 0-12.728" />
      <path className="x" d="m22 9-6 6M16 9l6 6" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}

/** Live mic ↔ muted: a level meter bounces inside while live; a slash draws when muted. */
export function MicIcon({ muted, className }: { muted: boolean; className?: string }) {
  const id = React.useId();
  return (
    <Svg name="mic" className={className} data={{ muted }}>
      <clipPath id={id}><rect x="9" y="2" width="6" height="13" rx="3" /></clipPath>
      <rect className="level" x="9" y="2" width="6" height="13" fill="currentColor" fillOpacity="0.35" stroke="none" clipPath={`url(#${id})`} />
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
      <path className="slash" d="m2 2 20 20" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}

/** Expand ↔ collapse: each corner flips to point the other way. */
export function ExpandIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <Svg name="expand" className={className} data={{ expanded }}>
      <path className="c" d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path className="c" d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path className="c" d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path className="c" d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

/** Checkbox: the box squeezes and fills, the tick draws on top. */
export function CheckboxIcon({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <Svg name="checkbox" className={className} data={{ checked }}>
      <rect className="box" x="3" y="3" width="18" height="18" rx="4" fill="currentColor" fillOpacity="0" />
      <path className="tick" d="m7.5 12 3 3 6-6" pathLength={1} strokeDasharray="1" />
    </Svg>
  );
}
