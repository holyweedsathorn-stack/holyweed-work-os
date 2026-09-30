"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtTimeBKK } from "@/lib/types";
import { replyToReceivedItem, toggleReceivedItemResolved } from "@/app/clock/received-item-actions";
import type { ReceivedItem } from "@/app/(app)/received-items/actions";

/**
 * One logged photo -- deliveries or low-stock flags alike. The photo itself
 * is the clickable link (opens full size); everything below it is plain
 * content plus an optional reply thread, so nothing interactive ends up
 * nested inside the anchor.
 *
 * Reply is how a manager answers a low-stock flag ("used the other strain
 * instead") right on the log, visible to whoever logged it and everyone
 * else -- same one-reply-editable-any-time shape as the hostel stay notes.
 */
export function ReceivedItemTile({
  item,
  onChanged,
}: {
  item: ReceivedItem;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [working, start] = useTransition();
  const [editingReply, setEditingReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState(item.reply ?? "");

  const isLowStock = item.type === "low_stock";
  const isResolved = !!item.resolvedAt;

  function saveReply() {
    start(async () => {
      const res = await replyToReceivedItem(item.id, replyDraft);
      if (!res.ok) {
        alert(res.error ?? "Something went wrong.");
        return;
      }
      setEditingReply(false);
      router.refresh();      onChanged?.();
    });
  }

  function toggleDone() {
    start(async () => {
      const res = await toggleReceivedItemResolved(item.id);
      if (!res.ok) {
        alert(res.error ?? "Something went wrong.");
        return;
      }
      router.refresh();      onChanged?.();
    });
  }

  return (
    <div
      className="relative flex flex-col rounded-[11px] overflow-hidden"
      style={{
        border: isLowStock ? `1px solid ${isResolved ? "var(--accent)" : "var(--warning)"}` : "1px solid var(--line)",
        opacity: isResolved ? 0.72 : 1,
      }}
    >
      <a
        href={item.photoUrl ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full"
        style={{
          aspectRatio: "1 / 1",
          background: item.photoUrl
            ? `center / cover no-repeat url(${item.photoUrl})`
            : "var(--surface-2)",
          pointerEvents: item.photoUrl ? "auto" : "none",
          opacity: item.photoUrl ? 1 : 0.6,
        }}
      />
      {isLowStock && (
        <span
          className="chip absolute top-1.5 left-1.5"
          style={{
            background: isResolved ? "var(--accent-soft)" : "var(--warning-soft)",
            color: isResolved ? "var(--accent)" : "var(--warning)",
          }}
        >
          {isResolved ? "Done" : "Low stock"}
        </span>
      )}

      <div className="px-2.5 py-2 flex flex-col gap-1">
        <div className="text-[12.5px] font-semibold truncate">{item.employeeName}</div>
        <div className="text-[11px] text-inkMuted truncate">
          {fmtTimeBKK(item.createdAt)} · {item.branchName}
        </div>
        {item.note && (
          <div className="text-[11.5px] text-inkSecondary leading-snug line-clamp-2">{item.note}</div>
        )}

        {!editingReply && item.reply && (
          <div
            className="text-[11px] rounded-[7px] px-2 py-1 mt-0.5"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <span className="font-semibold">Reply: </span>
            {item.reply}
            {item.replyByName && <span className="opacity-70"> — {item.replyByName}</span>}
          </div>
        )}

        {editingReply && (
          <div className="flex flex-col gap-1 mt-0.5">
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. used the other strain instead"
              className="w-full rounded-[7px] border px-2 py-1 text-[11.5px] outline-none focus:border-accent"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            />
            <div className="flex gap-3">
              <button
                type="button"
                disabled={working}
                onClick={saveReply}
                className="text-[11px] font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {working ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplyDraft(item.reply ?? "");
                  setEditingReply(false);
                }}
                className="text-[11px] font-semibold text-inkMuted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isResolved && (
          <div className="text-[10.5px] text-inkMuted">
            Marked done{item.resolvedByName ? ` by ${item.resolvedByName}` : ""}
          </div>
        )}

        {!editingReply && (
          <div className="flex items-center gap-3 mt-0.5">
            <button
              type="button"
              onClick={() => setEditingReply(true)}
              className="text-[11px] font-semibold text-left"
              style={{ color: "var(--ink-secondary)" }}
            >
              {item.reply ? "Edit reply" : "Reply"}
            </button>
            {isLowStock && (
              <button
                type="button"
                disabled={working}
                onClick={toggleDone}
                className="text-[11px] font-semibold text-left"
                style={{ color: isResolved ? "var(--ink-secondary)" : "var(--accent)" }}
              >
                {isResolved ? "Mark not done" : "Mark done"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
