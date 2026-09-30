"use client";

import { useId, useState } from "react";
import { fmtTHB, fmtTHBk } from "@/lib/types";

/**
 * Server Components can't pass functions to Client Components, so the caller
 * names a format instead of handing over a formatter.
 */
export type ValueFormat = "thbk" | "thb" | "number";

const FORMATTERS: Record<ValueFormat, (v: number) => string> = {
  thbk: fmtTHBk,
  thb: fmtTHB,
  number: (v: number) => String(Math.round(v)),
};

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  data: { x: string; y: number }[];
};

export function LineChart({
  series,
  area = false,
  height = 220,
  xTickEvery = 1,
  yFormat = "number",
}: {
  series: ChartSeries[];
  area?: boolean;
  height?: number;
  xTickEvery?: number;
  yFormat?: ValueFormat;
}) {
  const yfmt = FORMATTERS[yFormat] ?? FORMATTERS.number;
  // useId, not Math.random: the server and the browser must produce the same
  // gradient id or React reports a hydration mismatch. Punctuation is stripped
  // because React's ids contain characters that url(#...) can't reference.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const [ttPos, setTtPos] = useState({ x: 0 });

  const W = 640;
  const H = height;
  const pad = { l: 44, r: 14, t: 14, b: 26 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const allVals = series.flatMap((s) => s.data.map((d) => d.y));
  const maxV = Math.max(...allVals) * 1.12 || 1;
  const n = series[0]?.data.length ?? 0;
  const xAt = (i: number) => pad.l + (n === 1 ? 0 : (innerW * i) / (n - 1));
  const yAt = (v: number) => pad.t + innerH - (v / maxV) * innerH;

  const gridN = 4;
  const gridLines = Array.from({ length: gridN + 1 }, (_, i) => {
    const v = (maxV * i) / gridN;
    return { y: yAt(v), label: yfmt(v) };
  });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`grad-${uid}-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={g.y} y2={g.y} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 8} y={g.y + 3} fontSize={10} textAnchor="end" fill="var(--ink-muted)" fontFamily="var(--font-plex-mono)">
              {g.label}
            </text>
          </g>
        ))}

        {series.map((s, si) => {
          const pts = s.data.map((d, i) => [xAt(i), yAt(d.y)] as const);
          const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
          const last = pts[pts.length - 1];
          return (
            <g key={si}>
              {area && (
                <path
                  d={`${linePath} L${last[0].toFixed(1)},${yAt(0).toFixed(1)} L${pts[0][0].toFixed(1)},${yAt(0).toFixed(1)} Z`}
                  fill={`url(#grad-${uid}-${si})`}
                  opacity={0.55}
                />
              )}
              <path d={linePath} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />}
            </g>
          );
        })}

        {series[0]?.data.map((d, i) => {
          if (xTickEvery && i % xTickEvery !== 0 && i !== n - 1) return null;
          return (
            <text key={i} x={xAt(i)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--ink-muted)">
              {d.x}
            </text>
          );
        })}

        {hover !== null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.t} y2={pad.t + innerH} stroke="var(--line-strong)" strokeWidth={1} />
        )}

        {series[0]?.data.map((_, i) => (
          <rect
            key={i}
            x={xAt(i) - innerW / n / 2}
            y={pad.t}
            width={innerW / n}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => {
              setHover(i);
              setTtPos({ x: (xAt(i) / W) * 100 });
            }}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hover !== null && (
        <div
          className="absolute pointer-events-none rounded-[9px] px-2.5 py-2 text-[12px] whitespace-nowrap z-10"
          style={{
            left: `${ttPos.x}%`,
            top: 4,
            transform: "translate(-50%, 0)",
            background: "var(--ink)",
            color: "var(--bg)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
          }}
        >
          <div className="font-semibold opacity-75 text-[11px] mb-1">{series[0].data[hover].x}</div>
          {series.map((s, si) => (
            <div key={si} className="flex items-center gap-1.5">
              <span className="w-[7px] h-[7px] rounded-[2px]" style={{ background: s.color }} />
              {s.label}: <b className="num">{yfmt(s.data[hover].y)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
