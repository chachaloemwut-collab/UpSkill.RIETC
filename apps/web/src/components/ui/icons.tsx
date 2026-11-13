"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type IconProps = { className?: string };

function icon(children: React.ReactNode) {
  return ({ className }: IconProps) => (
    <svg className={cn("h-4 w-4 shrink-0", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />);
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);
export const ChevronUpIcon = icon(<path d="m18 15-6-6-6 6" />);
export const ChevronLeftIcon = icon(<path d="m15 18-6-6 6-6" />);
export const ChevronRightIcon = icon(<path d="m9 18 6-6-6-6" />);
export const XIcon = icon(<path d="M18 6 6 18M6 6l12 12" />);
export const PlusIcon = icon(<path d="M5 12h14M12 5v14" />);
export const MinusIcon = icon(<path d="M5 12h14" />);
export const SearchIcon = icon(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>);
export const EyeIcon = icon(<><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>);
export const EyeOffIcon = icon(<><path d="M9.9 9.9a3 3 0 1 0 4.2 4.2M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="m2 2 20 20" /></>);
export const ArrowUpDownIcon = icon(<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />);
export const ArrowUpIcon = icon(<path d="m5 12 7-7 7 7M12 19V5" />);
export const ArrowDownIcon = icon(<path d="M12 5v14m7-7-7 7-7-7" />);
export const TrendingUpIcon = icon(<path d="M22 7 13.5 15.5l-5-5L2 17M16 7h6v6" />);
export const TrendingDownIcon = icon(<path d="m22 17-8.5-8.5-5 5L2 7M16 17h6v-6" />);
export const InboxIcon = icon(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" /></>);
export const BoldIcon = icon(<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />);
export const ItalicIcon = icon(<path d="M19 4h-9M14 20H5M15 4 9 20" />);
export const UnderlineIcon = icon(<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" />);
export const AlignLeftIcon = icon(<path d="M21 6H3M15 12H3M17 18H3" />);
export const AlignCenterIcon = icon(<path d="M21 6H3M17 12H7M19 18H5" />);
export const AlignRightIcon = icon(<path d="M21 6H3M21 12H9M21 18H7" />);
export const CalendarIcon = icon(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const GripIcon = icon(<><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></>);
export const SunIcon = icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></>);
export const MoonIcon = icon(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);
export const HomeIcon = icon(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />);
export const SettingsIcon = icon(<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />);
export const UserIcon = icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const FileIcon = icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>);
export const MailIcon = icon(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>);
export const MenuIcon = icon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const MoreIcon = icon(<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>);
export const StarIcon = icon(<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1Z" />);
export const PaletteIcon = icon(<><circle cx="13.5" cy="6.5" r="1" /><circle cx="17.5" cy="10.5" r="1" /><circle cx="8.5" cy="7.5" r="1" /><circle cx="6.5" cy="12.5" r="1" /><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-.5a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4C22 7 17.5 2 12 2Z" /></>);
export const PanelLeftIcon = icon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>);
