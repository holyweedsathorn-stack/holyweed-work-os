import type { CSSProperties } from "react";

const PATHS: Record<string, string> = {
  grid: '<path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  users:
    '<circle cx="9" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.3 19c.7-3.3 3-5 5.7-5s5 1.7 5.7 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="8.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.6 12.7c2.2.2 3.9 1.7 4.5 4.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  chart: '<path d="M4 20V10M10.5 20V4M17 20v-7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  kanban:
    '<rect x="3.5" y="4" width="5.4" height="16" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9.9" y="4" width="5.4" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="16.3" y="4" width="4.2" height="13" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  search:
    '<circle cx="10.2" cy="10.2" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15 15l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  up: '<path d="M6 15l6-7 6 7" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="M6 9l6 7 6-7" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  warn: '<path d="M12 4 21 19H3L12 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="16.6" r="0.9" fill="currentColor"/>',
  clock:
    '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.2V12l3.2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  check:
    '<path d="M9.5 5.5h7A1.5 1.5 0 0 1 18 7v12.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V7a1.5 1.5 0 0 1 1.5-1.5h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><rect x="9" y="3" width="6" height="3.4" rx="1.1" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 13l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  upload:
    '<path d="M12 16V4.5M7.5 9L12 4.5 16.5 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  report:
    '<path d="M6 3.5h7.5L19 9v11.5A1.5 1.5 0 0 1 17.5 22h-11A1.5 1.5 0 0 1 5 20.5v-15A2 2 0 0 1 6 3.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.2 3.7V9H19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.6 17.5v-3.2M11.9 17.5v-5.4M15.2 17.5v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  inbox:
    '<path d="M3.5 13h4l1.4 2.6h6.2L16.5 13h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.2 4.5h11.6l2.7 8.5v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V13l2.7-8.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  shield:
    '<path d="M12 3.2l7 3v5.2c0 4.3-3 7.8-7 8.6-4-.8-7-4.3-7-8.6V6.2l7-3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.3 12.1l1.9 1.9 3.5-3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  megaphone:
    '<path d="M3.5 10.5v3a1.5 1.5 0 0 0 1.5 1.5h1l1.2 4.6a1 1 0 0 0 1 .75h1a1 1 0 0 0 .95-1.3L8.3 15.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.5V9a1.5 1.5 0 0 1 1.1-1.45l9.3-3.1a1 1 0 0 1 1.32 1V17.5a1 1 0 0 1-1.32.95l-9.3-2.6A1.5 1.5 0 0 1 6 14.4v-.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M20.5 8.5a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  checklist:
    '<rect x="4" y="3.5" width="16" height="17" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8.2l1.4 1.4L11.8 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 8.2h4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 14.2l1.4 1.4 2.4-2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 14.2h4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  camera:
    '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  exchange:
    '<path d="M4 8h13.5M17.5 8L14 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 16H6.5M6.5 16L10 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  logout:
    '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M13 8l4 4-4 4M8.5 12H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  bed:
    '<path d="M3.5 19v-9a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 16h17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 19v2M20.5 19v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="5.5" y="9.5" width="6" height="3.6" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  dots:
    '<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>',
  scale:
    '<path d="M12 3v17M8 20h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 5.5L5 8M12 5.5l7 2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M2.5 9.5L5 8l2.5 1.5a2.5 2.5 0 0 1-5 0Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M16.5 9.5L19 8l2.5 1.5a2.5 2.5 0 0 1-5 0Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
};

export function Icon({
  name,
  className,
  style,
}: {
  name: keyof typeof PATHS;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
