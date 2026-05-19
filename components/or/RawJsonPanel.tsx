"use client";

import { useState } from "react";
import type { RecommendationResponse } from "@/lib/or-ui/types";
import { Pill } from "./atoms";

export function RawJsonPanel({ response }: { response: RecommendationResponse | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!response) return null;

  const json = JSON.stringify(response, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be unavailable in some browsers/iframes
    }
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-lg border border-line bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-ink">Raw response</span>
          <Pill tone="muted" size="xs">debug</Pill>
          <span className="text-[10.5px] text-ink-muted">
            {response.recommendations.rankings.length} ranks · source {response.pipeline.source}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {open ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                copy();
              }}
              className="rounded-md border border-line bg-surface px-2 py-0.5 text-[10.5px] font-medium text-ink-soft hover:bg-surface-muted"
            >
              {copied ? "copied" : "copy"}
            </button>
          ) : null}
          <span className="text-[10px] text-ink-faint">{open ? "− collapse" : "+ expand"}</span>
        </div>
      </summary>
      <pre className="scrollbar-thin mono max-h-[280px] overflow-auto border-t border-line bg-surface-muted px-4 py-3 text-[10.5px] leading-snug text-ink-soft">
        {json}
      </pre>
    </details>
  );
}
