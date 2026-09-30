"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStaff,
  updateStaff,
  inviteStaff,
  invitePartner,
  setStaffActive,
  deleteStaff,
} from "@/app/(app)/team/actions";
import type { Branch, Employee } from "@/lib/types";

type Invite = { name: string; url: string };

const inputStyle = { borderColor: "var(--line-strong)", background: "var(--surface)" } as const;
const inputClass =
  "mt-1 w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-semibold text-inkSecondary block">
      {label}
      {children}
    </label>
  );
}

/** Shown after an invite is created — the link is the thing to pass on. */
function InvitePanel({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="card mb-4" style={{ borderColor: "var(--accent)" }}>
      <h3 className="font-display text-[15px] font-semibold mb-1">Invite link for {invite.name}</h3>
      <p className="text-[12.5px] text-inkMuted mb-3">
        Send this to them on LINE. They open it, set their own password, and they&apos;re in. The link
        works once and expires in 14 days.
      </p>
      <div
        className="rounded-[9px] px-3 py-2.5 text-[12px] break-all font-mono"
        style={{ background: "var(--surface-2)" }}
      >
        {invite.url}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(invite.url).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              },
              () => setCopied(false)
            );
          }}
          className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          onClick={onClose}
          className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
          style={{ border: "1px solid var(--line-strong)" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function StaffForm({
  branches,
  employee,
  onCancel,
  onSaved,
}: {
  branches: Branch[];
  employee?: Employee;
  onCancel: () => void;
  onSaved: (invite?: Invite) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editing = !!employee;

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = editing ? await updateStaff(formData) : await createStaff(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const url = (res as { inviteUrl?: string }).inviteUrl;
      onSaved(url ? { name: String(formData.get("full_name")), url } : undefined);
    });
  }

  return (
    <div className="card mb-4">
      <h3 className="font-display text-[15px] font-semibold mb-3">
        {editing ? `Edit ${employee!.full_name}` : "Add team member"}
      </h3>
      <form action={submit} className="flex flex-col gap-3">
        {editing && <input type="hidden" name="id" value={employee!.id} />}

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <Field label="Full name">
            <input
              name="full_name"
              required
              defaultValue={employee?.full_name}
              placeholder="e.g. Somchai Jaidee"
              className={inputClass}
              style={inputStyle}
            />
          </Field>
          <Field label="Job title">
            <input
              name="role_title"
              required
              defaultValue={employee?.role_title}
              placeholder="e.g. Budtender"
              className={inputClass}
              style={inputStyle}
            />
          </Field>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <Field label="Branch">
            <select
              name="branch_id"
              required
              defaultValue={employee?.branch_id ?? ""}
              className={inputClass}
              style={inputStyle}
            >
              <option value="" disabled>
                Choose a branch
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phone (optional)">
            <input
              name="phone"
              defaultValue={employee?.phone ?? ""}
              placeholder="e.g. 081 234 5678"
              className={inputClass}
              style={inputStyle}
            />
          </Field>
        </div>

        {!editing && (
          <label className="flex items-center gap-2 text-[12.5px] text-inkSecondary font-medium">
            <input type="checkbox" name="with_login" defaultChecked className="w-4 h-4" />
            Create an invite link so they can set up their own login
          </label>
        )}

        {error && (
          <p
            className="text-[12.5px] font-medium rounded-[9px] px-3 py-2"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Add to team"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ border: "1px solid var(--line-strong)" }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function PartnerForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (invite: Invite) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await invitePartner(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved({ name: res.name, url: res.inviteUrl });
    });
  }

  return (
    <div className="card mb-4">
      <h3 className="font-display text-[15px] font-semibold mb-1">Invite a partner or manager</h3>
      <p className="text-[12.5px] text-inkMuted mb-3">
        They see the dashboards, not the clock screen. No employee record is created.
      </p>
      <form action={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <Field label="Full name">
            <input name="full_name" required placeholder="e.g. Somsak P." className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Access level">
            <select name="role" defaultValue="owner" className={inputClass} style={inputStyle}>
              <option value="owner">Owner — full access, same as you</option>
              <option value="manager">Manager — same views, can also manage staff</option>
            </select>
          </Field>
        </div>

        {error && (
          <p
            className="text-[12.5px] font-medium rounded-[9px] px-3 py-2"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {pending ? "Creating…" : "Create invite link"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ border: "1px solid var(--line-strong)" }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function StaffManager({
  branches,
  employees,
  withHours,
}: {
  branches: Branch[];
  employees: Employee[];
  /** Employee ids with at least one recorded shift — these cannot be deleted. */
  withHours?: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "add" | "partner" | string>("idle");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Errors used to render at the top of this card, sixty lines of markup above
  // the row that caused them — with a dozen staff the explanation landed
  // off-screen and Delete looked like it did nothing. Keep it beside the row.
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();
  const hasHours = new Set(withHours ?? []);

  const editing =
    mode !== "idle" && mode !== "add" && mode !== "partner"
      ? employees.find((e) => e.id === mode)
      : undefined;

  function run(fn: () => Promise<any>, name?: string, rowId?: string) {
    setError(null);
    setRowError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        if (rowId) setRowError({ id: rowId, text: res.error });
        else setError(res.error);
        return;
      }
      if (res.inviteUrl) setInvite({ name: name ?? res.name, url: res.inviteUrl });
      router.refresh();
    });
  }

  return (
    <div>
      {invite && <InvitePanel invite={invite} onClose={() => setInvite(null)} />}

      {error && (
        <div
          className="card mb-4 text-[13px] font-medium"
          style={{ borderColor: "var(--critical)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {mode === "add" && (
        <StaffForm
          branches={branches}
          onCancel={() => setMode("idle")}
          onSaved={(inv) => {
            setMode("idle");
            if (inv) setInvite(inv);
            router.refresh();
          }}
        />
      )}

      {mode === "partner" && (
        <PartnerForm
          onCancel={() => setMode("idle")}
          onSaved={(inv) => {
            setMode("idle");
            setInvite(inv);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <StaffForm
          branches={branches}
          employee={editing}
          onCancel={() => setMode("idle")}
          onSaved={() => {
            setMode("idle");
            router.refresh();
          }}
        />
      )}

      {mode === "idle" && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setMode("add")}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            + Add team member
          </button>
          <button
            onClick={() => setMode("partner")}
            className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ border: "1px solid var(--line-strong)" }}
          >
            + Invite partner or manager
          </button>
        </div>
      )}

      {employees.some((e) => e.active === false) && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-[12.5px] font-semibold mb-2"
          style={{ color: "var(--accent)", minHeight: 40 }}
        >
          {showArchived
            ? "Hide archived"
            : `Show archived (${employees.filter((e) => e.active === false).length})`}
        </button>
      )}

      <div className="flex flex-col gap-1.5">
        {employees
          .filter((e) => showArchived || e.active !== false)
          .map((e) => {
            const locked = hasHours.has(e.id);
            const btn =
              "rounded-[7px] px-3 font-semibold flex items-center justify-center flex-none";
            const btnStyle = {
              border: "1px solid var(--line-strong)",
              minHeight: 40,
            } as const;
            return (
              <div
                key={e.id}
                className="py-1.5"
                style={{ borderTop: "1px solid var(--line)", opacity: e.active === false ? 0.55 : 1 }}
              >
                <div className="flex items-center gap-2 flex-wrap text-[12px]">
                  <span className="font-semibold min-w-[150px]">{e.full_name}</span>
                  <span className="text-inkMuted flex-1 min-w-[100px]">
                    {e.role_title}
                    {e.active === false ? " · archived" : ""}
                  </span>
                  {e.phone && <span className="text-inkMuted">{e.phone}</span>}

                  <button onClick={() => setMode(e.id)} disabled={pending} className={btn} style={btnStyle}>
                    Edit
                  </button>
                  <button
                    onClick={() => run(() => inviteStaff(e.id), e.full_name, e.id)}
                    disabled={pending}
                    className={btn}
                    style={btnStyle}
                  >
                    Invite link
                  </button>
                  <button
                    onClick={() => run(() => setStaffActive(e.id, e.active === false), undefined, e.id)}
                    disabled={pending}
                    className={btn}
                    style={{
                      ...btnStyle,
                      ...(locked && e.active !== false
                        ? { borderColor: "var(--accent)", color: "var(--accent)" }
                        : {}),
                    }}
                  >
                    {e.active === false ? "Restore" : "Archive"}
                  </button>

                  {/* Someone with recorded hours can't be deleted — time_entries
                      cascades, so it would erase their payroll history. Say that
                      here rather than letting the click fail. */}
                  {locked ? (
                    <span
                      className="text-[11.5px] flex-none"
                      style={{ color: "var(--ink-muted)" }}
                      title="Deleting would erase this person's recorded hours. Archive keeps them for payroll."
                    >
                      has hours — archive only
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm(`Permanently delete ${e.full_name}? This cannot be undone.`)) {
                          run(() => deleteStaff(e.id), undefined, e.id);
                        }
                      }}
                      disabled={pending}
                      className={btn}
                      style={{ ...btnStyle, color: "var(--critical)" }}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {rowError?.id === e.id && (
                  <div
                    className="text-[12px] font-medium rounded-[7px] px-2.5 py-2 mt-1.5"
                    style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
                  >
                    {rowError.text}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
