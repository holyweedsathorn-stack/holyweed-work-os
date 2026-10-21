"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  listChatMessages,
  listChatTeamNames,
  markChatSeen,
  sendChatMessage,
  type ChatMessage,
} from "@/app/clock/chat-actions";
import { fmtTimeBKK } from "@/lib/types";

const POS_KEY = "hw-chat-bubble-pos";
const BUBBLE = 56;
const PANEL_W = 320;
const PANEL_H = 420;

type Pos = { right: number; bottom: number };

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore -- just start at the default corner
  }
  return { right: 20, bottom: 20 };
}

function savePos(pos: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    // best-effort only
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights "@Full Name" when it matches someone actually in the org --
 * typing "@" and never finishing a real name just stays plain text. Names
 * are tried longest-first so a short name that happens to prefix a longer
 * one doesn't steal the match.
 */
function renderBody(text: string, team: string[]): React.ReactNode {
  if (team.length === 0) return text;
  const byLengthDesc = [...team].sort((a, b) => b.length - a.length);
  const pattern = byLengthDesc.map(escapeRegExp).join("|");
  const re = new RegExp(`@(${pattern})(?![A-Za-z0-9])`, "gi");

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={key++} className="font-bold" style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
        @{m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * The whole team, floating on every screen -- staff clock page and manager
 * dashboard alike -- rather than one more section to scroll past. Drag it
 * anywhere; that spot is remembered on this device. Tap (without dragging)
 * to open the thread. Polls on its own timer instead of router.refresh(),
 * which would re-fetch the whole page underneath it just to catch up on
 * messages.
 */
export function ChatWidget({ currentUserName }: { currentUserName: string }) {
  const [pos, setPos] = useState<Pos>({ right: 20, bottom: 20 });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, startSend] = useTransition();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionActive, setMentionActive] = useState(0);

  const bubbleRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ dragging: boolean; moved: boolean; startX: number; startY: number; startPos: Pos }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    startPos: { right: 20, bottom: 20 },
  });
  const mounted = useRef(true);

  useEffect(() => {
    setPos(loadPos());
    listChatTeamNames().then((names) => mounted.current && setTeam(names));
  }, []);

  async function load() {
    const res = await listChatMessages();
    if (!mounted.current) return;
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setMessages(res.items);
  }

  // Unread count comes straight from the server's per-message read
  // receipts (seenByMe), not a counter kept in this component's own state
  // -- that in-memory version reset to zero on every page load/navigation,
  // which is why the badge never showed up even with real unread messages
  // sitting in the thread.
  const unread = (messages ?? []).filter((m) => m.authorName !== currentUserName && !m.seenByMe).length;

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, 8000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
    }
  }, [open, messages?.length]);

  useEffect(() => {
    if (open && messages && messages.length > 0) {
      markChatSeen(messages.map((m) => m.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages]);

  // ---- drag ----
  function clamp(p: Pos): Pos {
    return {
      right: Math.max(8, Math.min(window.innerWidth - BUBBLE - 8, p.right)),
      bottom: Math.max(8, Math.min(window.innerHeight - BUBBLE - 8, p.bottom)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { dragging: true, moved: false, startX: e.clientX, startY: e.clientY, startPos: pos };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.current.moved = true;
    if (dragState.current.moved) {
      const next = clamp({
        right: dragState.current.startPos.right - dx,
        bottom: dragState.current.startPos.bottom - dy,
      });
      setPos(next);
      if (open) setOpen(false);
    }
  }
  function onPointerUp() {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    if (dragState.current.moved) {
      savePos(pos);
    } else {
      setOpen((o) => !o);
    }
  }

  const panelStyle = useMemo(() => {
    const right = Math.max(8, pos.right);
    let bottom = pos.bottom + BUBBLE + 10;
    // Also runs during the server render, where there's no window to measure.
    if (typeof window !== "undefined" && window.innerHeight - bottom - PANEL_H < 16) {
      bottom = Math.max(8, pos.bottom - PANEL_H - 10);
    }
    return { right, bottom, width: PANEL_W, height: PANEL_H };
  }, [pos]);

  // ---- composer / mentions ----
  function onDraftChange(value: string) {
    setDraft(value);
    const pos2 = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, pos2);
    const m = before.match(/(?:^|\s)@([A-Za-z]*)$/);
    setMentionQuery(m ? m[1] : null);
    setMentionActive(0);
  }

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return team.filter((n) => n.toLowerCase().startsWith(mentionQuery.toLowerCase()) && n !== currentUserName).slice(0, 6);
  }, [mentionQuery, team, currentUserName]);

  function pickMention(name: string) {
    const ta = textareaRef.current;
    const caret = ta?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([A-Za-z]*)$/, `@${name} `);
    const after = draft.slice(caret);
    const next = before + after;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(before.length, before.length);
    });
  }

  function submit() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setMentionQuery(null);
    startSend(async () => {
      const res = await sendChatMessage(body);
      if (!res.ok) {
        setError(res.error);
        setDraft(body);
        return;
      }
      load();
    });
  }

  return (
    <>
      <button
        ref={bubbleRef}
        type="button"
        aria-label="Team chat"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="fixed rounded-full flex items-center justify-center"
        style={{
          right: pos.right,
          bottom: pos.bottom,
          width: BUBBLE,
          height: BUBBLE,
          background: "var(--accent)",
          color: "#fff",
          boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
          touchAction: "none",
          zIndex: 60,
          cursor: "grab",
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" className="w-[26px] h-[26px]" style={{ pointerEvents: "none" }}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4.5 4V16A2.5 2.5 0 0 1 4 13.5v-8Z" />
        </svg>
        {!open && unread > 0 && (
          <span
            className="absolute flex items-center justify-center rounded-full font-bold"
            style={{
              top: -3,
              right: -3,
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              fontSize: 10.5,
              background: "var(--critical)",
              color: "#fff",
              border: "2px solid var(--bg)",
              pointerEvents: "none",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed flex flex-col rounded-[16px] overflow-hidden"
          style={{
            ...panelStyle,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "calc(100vh - 24px)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            zIndex: 61,
          }}
        >
          <div className="flex items-center justify-between px-3.5 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="font-bold text-[14.5px]">Team chat</div>
              <div className="text-[11px] text-inkMuted">Everyone, all branches</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-inkMuted text-[18px] leading-none p-1" aria-label="Close">
              ✕
            </button>
          </div>

          {error && (
            <div className="text-[12px] px-3.5 py-2" style={{ background: "var(--critical-soft)", color: "var(--critical)" }}>
              {error}
            </div>
          )}

          <div ref={threadRef} className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
            {messages === null ? (
              <p className="text-[13px] text-inkMuted m-0">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-[13px] text-inkMuted m-0">No messages yet — say hi.</p>
            ) : (
              messages.map((m) => {
                const mine = m.authorName === currentUserName;
                return (
                  <div key={m.id} className="flex flex-col" style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                    <div className="flex items-baseline gap-1 mb-0.5" style={{ flexDirection: mine ? "row-reverse" : "row" }}>
                      {!mine && <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>{m.authorName}</span>}
                      <span className="text-[10px] font-semibold text-inkMuted" style={{ fontStyle: m.branchName ? "normal" : "italic" }}>
                        · {m.branchName ?? "Off shift"}
                      </span>
                    </div>
                    <div
                      className="rounded-[13px] px-3 py-2 max-w-[82%] text-[13.5px] leading-snug whitespace-pre-wrap break-words"
                      style={{
                        background: mine ? "var(--accent)" : "var(--surface-2)",
                        color: mine ? "#fff" : "var(--ink)",
                        borderBottomRightRadius: mine ? 4 : 13,
                        borderBottomLeftRadius: mine ? 13 : 4,
                      }}
                    >
                      {renderBody(m.body, team)}
                    </div>
                    <span className="text-[10.5px] text-inkMuted mt-0.5 px-0.5">{fmtTimeBKK(m.createdAt)}</span>
                    {mine && m.seenBy.length > 0 && (
                      <span className="text-[10px] text-inkMuted px-0.5">
                        Seen by {m.seenBy.length > 2 ? `${m.seenBy.slice(0, 2).join(", ")} +${m.seenBy.length - 2}` : m.seenBy.join(", ")}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="relative" style={{ borderTop: "1px solid var(--line)" }}>
            {mentionMatches.length > 0 && (
              <div
                className="absolute left-3 right-3 rounded-[10px] overflow-hidden"
                style={{
                  bottom: "100%",
                  marginBottom: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--line-strong)",
                  boxShadow: "0 8px 22px rgba(0,0,0,0.18)",
                  maxHeight: 160,
                  overflowY: "auto",
                }}
              >
                {mentionMatches.map((name, i) => (
                  <div
                    key={name}
                    onClick={() => pickMention(name)}
                    className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold cursor-pointer"
                    style={{ background: i === mentionActive ? "var(--accent-soft)" : "transparent", color: i === mentionActive ? "var(--accent)" : "var(--ink)" }}
                  >
                    <span
                      className="flex items-center justify-center rounded-full text-[10px] font-bold flex-none"
                      style={{ width: 20, height: 20, background: "var(--surface-2)", color: "var(--ink-secondary)" }}
                    >
                      {name[0]}
                    </span>
                    {name}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 px-3 py-2.5">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (mentionMatches.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionActive((i) => (i + 1) % mentionMatches.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionActive((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      pickMention(mentionMatches[mentionActive]);
                      return;
                    }
                    if (e.key === "Escape") {
                      setMentionQuery(null);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder="Message the team…"
                className="flex-1 rounded-[10px] border px-3 py-2 text-[14px] outline-none focus:border-accent resize-none"
                style={{ borderColor: "var(--line-strong)", background: "var(--bg)", minHeight: 38, maxHeight: 100, color: "var(--ink)" }}
              />
              <button
                type="button"
                disabled={sending || !draft.trim()}
                onClick={submit}
                className="rounded-[10px] font-bold text-white disabled:opacity-50 px-4 flex-none"
                style={{ background: "var(--accent)", minHeight: 38, fontSize: 13.5 }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
