/**
 * Shown the instant a link is tapped, instead of the previous page sitting
 * frozen while the server fetches. Mirrors the real page's shape so the
 * swap-in doesn't jump.
 */
export default function Loading() {
  return (
    <>
      <div
        className="flex items-center justify-between gap-4 px-4 md:px-4 md:px-7 py-4 flex-wrap"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div>
          <div className="skeleton h-[21px] w-[150px]" />
          <div className="skeleton h-[12px] w-[210px] mt-2" />
        </div>
        <div className="skeleton h-[38px] w-[190px]" />
      </div>

      <div className="flex-1 overflow-hidden px-4 md:px-4 md:px-7 py-6">
        <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[104px]" />
          ))}
        </div>
        <div className="grid gap-3.5 mt-3.5 grid-cols-1 lg:grid-cols-[2fr_1fr]">
          <div className="skeleton h-[220px]" />
          <div className="skeleton h-[220px]" />
        </div>
      </div>
    </>
  );
}
