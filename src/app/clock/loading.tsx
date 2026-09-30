export default function Loading() {
  return (
    <div className="min-h-screen flex justify-center px-4 py-8" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="skeleton w-11 h-11 rounded-full" />
          <div className="flex-1">
            <div className="skeleton h-[15px] w-[120px]" />
            <div className="skeleton h-[12px] w-[160px] mt-2" />
          </div>
        </div>
        <div className="skeleton h-[150px] rounded-[14px]" />
        <div className="skeleton h-[190px] rounded-[14px]" />
      </div>
    </div>
  );
}
