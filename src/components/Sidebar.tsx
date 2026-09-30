"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./Icons";
import { signOut } from "@/app/login/actions";
import { initials } from "@/lib/types";

type NavLeaf = { href: string; label: string; icon: Parameters<typeof Icon>[0]["name"] };
type NavGroup = { group: string; icon: Parameters<typeof Icon>[0]["name"]; items: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "group" in entry;
}

// Two flat items for what gets checked every day; everything else folds
// into a handful of dropdowns so the rail doesn't run to 16 rows deep.
const NAV_ITEMS: NavEntry[] = [
  { href: "/dashboard", label: "Overview", icon: "grid" },
  { href: "/approvals", label: "Approvals", icon: "inbox" },
  {
    group: "Workforce",
    icon: "users",
    items: [
      { href: "/team", label: "Team", icon: "users" },
      { href: "/schedule", label: "Schedule", icon: "calendar" },
      { href: "/hours", label: "Hours", icon: "clock" },
      { href: "/tasks", label: "Tasks", icon: "check" },
    ],
  },
  {
    group: "Business",
    icon: "chart",
    items: [
      { href: "/shop", label: "Shop dashboard", icon: "chart" },
      { href: "/report", label: "Monthly report", icon: "report" },
      { href: "/currency-log", label: "Currency Log", icon: "exchange" },
      { href: "/import", label: "Import sales", icon: "upload" },
      { href: "/reconciliation", label: "Reconciliation", icon: "scale" },
    ],
  },
  {
    group: "Logs",
    icon: "report",
    items: [
      { href: "/received-items", label: "Received Items", icon: "camera" },
      { href: "/hostel", label: "Hostel Log", icon: "bed" },
      { href: "/access-log", label: "Access log", icon: "shield" },
    ],
  },
  {
    group: "More",
    icon: "dots",
    items: [
      { href: "/marketing", label: "Marketing", icon: "megaphone" },
      { href: "/checklist", label: "Checklist", icon: "checklist" },
      { href: "/projects", label: "Projects", icon: "kanban" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Navigation.
 *
 * Static rail from `md` up; an off-canvas drawer below it, because 236px of a
 * 390px phone is most of the screen. The drawer closes on navigation — on a
 * phone the whole point of tapping a link is to see the page behind the menu.
 */
export function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  const [open, setOpen] = useState(false);

  // Which group's dropdown a manager can see open. Starts empty and a
  // group only gets added, never removed by navigation -- so opening
  // "Business" to check the shop dashboard and then tapping into "Logs"
  // leaves both open rather than fighting the manager's own clicks.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const activeGroup = useMemo(() => {
    for (const entry of NAV_ITEMS) {
      if (isGroup(entry) && entry.items.some((it) => isActive(pathname, it.href))) {
        return entry.group;
      }
    }
    return null;
  }, [pathname]);

  // Whatever group the current page lives in should always be visible,
  // even on a fresh page load where nothing has been clicked yet.
  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);

  function toggleGroup(name: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Close on navigation, and whenever the viewport grows past the breakpoint,
  // so the drawer can't be left hanging open over the desktop layout.
  useEffect(() => {
    setOpen(false);
  }, [pathname, qs]);

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel = (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-5 pt-1">
        <div className="w-[34px] h-[34px] rounded-[9px] bg-accent text-white flex items-center justify-center font-display font-bold text-[17px]">
          H
        </div>
        <div>
          <h1 className="font-display font-semibold text-[16px] leading-tight">Holyweed</h1>
          <span className="block text-[11px] uppercase tracking-wide text-inkMuted mt-0.5">
            Work OS
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 mt-1.5 overflow-y-auto">
        {NAV_ITEMS.map((entry) => {
          if (!isGroup(entry)) {
            const active = isActive(pathname, entry.href);
            return (
              <Link
                key={entry.href}
                href={qs ? `${entry.href}?${qs}` : entry.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2.5 rounded-[9px] text-[13.5px] font-medium"
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent)" : "var(--ink-secondary)",
                  minHeight: 44,
                }}
              >
                <Icon name={entry.icon} className="w-[17px] h-[17px] flex-none" />
                <span>{entry.label}</span>
              </Link>
            );
          }

          const groupOpen = openGroups.has(entry.group);
          const groupActive = entry.group === activeGroup;

          return (
            <div key={entry.group} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleGroup(entry.group)}
                aria-expanded={groupOpen}
                className="flex items-center justify-between gap-2.5 px-2.5 rounded-[9px] text-[13.5px] font-semibold"
                style={{
                  color: groupActive ? "var(--accent)" : "var(--ink-secondary)",
                  minHeight: 44,
                }}
              >
                <span className="flex items-center gap-2.5">
                  <Icon name={entry.icon} className="w-[17px] h-[17px] flex-none" />
                  <span>{entry.group}</span>
                </span>
                <Icon
                  name="down"
                  className="w-3.5 h-3.5 flex-none text-inkMuted"
                  style={{
                    transform: groupOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 0.15s ease",
                  }}
                />
              </button>

              {groupOpen && (
                <div
                  className="flex flex-col gap-0.5 ml-[9px] pl-2.5 mt-0.5 mb-1"
                  style={{ borderLeft: "1.5px solid var(--line-strong)" }}
                >
                  {entry.items.map((it) => {
                    const active = isActive(pathname, it.href);
                    return (
                      <Link
                        key={it.href}
                        href={qs ? `${it.href}?${qs}` : it.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-2 rounded-[8px] text-[13px] font-medium"
                        style={{
                          background: active ? "var(--accent-soft)" : "transparent",
                          color: active ? "var(--accent)" : "var(--ink-secondary)",
                          minHeight: 38,
                        }}
                      >
                        <Icon name={it.icon} className="w-[15px] h-[15px] flex-none" />
                        <span>{it.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div
        className="mt-auto pt-3.5 flex items-center gap-2.5"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <div
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-white text-[12px] font-semibold flex-none"
          style={{ background: "linear-gradient(155deg, var(--accent), #1a5c37)" }}
        >
          {initials(userName)}
        </div>
        <div className="min-w-0 flex-1">
          <b className="block text-[13px] font-semibold truncate">{userName}</b>
          <span className="text-[11.5px] text-inkMuted capitalize">{userRole} · Employer view</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="text-inkMuted hover:text-ink flex-none flex items-center justify-center"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            <Icon name="logout" className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Phone header. Only thing visible above the page below md. */}
      <header
        className="md:hidden flex items-center gap-2.5 px-3 py-2 flex-none no-print"
        style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--line)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex items-center justify-center rounded-[9px]"
          style={{ minHeight: 44, minWidth: 44, color: "var(--ink-secondary)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="w-[28px] h-[28px] rounded-[8px] bg-accent text-white flex items-center justify-center font-display font-bold text-[14px]">
          H
        </div>
        <span className="font-display font-semibold text-[15px]">Holyweed</span>
      </header>

      {/* Desktop rail */}
      <aside
        className="hidden md:flex w-[236px] flex-none flex-col p-3.5"
        style={{ background: "var(--surface-2)", borderRight: "1px solid var(--line)" }}
      >
        {panel}
      </aside>

      {/* Phone drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
          />
          <div
            className="relative flex flex-col p-3.5 w-[82%] max-w-[300px] h-full"
            style={{ background: "var(--surface-2)", borderRight: "1px solid var(--line)" }}
          >
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
