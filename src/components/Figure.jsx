import React from "react";

/**
 * A FIGURE THAT NEVER BREAKS MID-NUMBER (session 40).
 *
 * "21 · 1,528,125" used to wrap inside "1,528,125" in a narrow column. Each
 * part between " · " is one unbreakable piece (nowrap, tabular numbers); the
 * line may break only at a " · ". Anything that is not a string is shown as it
 * is. The pieces are marked data-deco="wrap": they add no text.
 */
export default function Figure({ children }) {
  if (typeof children !== "string" && typeof children !== "number") return children ?? null;
  const parts = String(children).split(" · ");
  if (parts.length === 1) return <span data-deco="wrap" className="whitespace-nowrap tabular-nums">{parts[0]}</span>;
  return parts.map((p, i) => (
    <React.Fragment key={`${i}-${p}`}>
      {i ? " · " : ""}
      <span data-deco="wrap" className="whitespace-nowrap tabular-nums">{p}</span>
    </React.Fragment>
  ));
}
