"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCurrencyTransaction } from "@/app/(app)/currency-log/actions";

export function DeleteTransactionButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() => {
        if (!confirm(`Delete this transaction (${label})? This can't be undone.`)) return;
        start(async () => {
          const res = await deleteCurrencyTransaction(id);
          if (!res.ok) {
            alert(res.error ?? "Something went wrong.");
            return;
          }
          router.refresh();
        });
      }}
      disabled={pending}
      className="text-[11px] font-semibold"
      style={{ color: "var(--critical)" }}
      title="Delete this transaction"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
