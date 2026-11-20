import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../i18n";
import { DICTIONARY, entryText, termIdForLabel } from "../../data/dictionary";

/**
 * A label that is a dictionary term when the dictionary knows it: the label as
 * the page writes it is looked up (term or alias); unknown labels render as-is.
 *   <AutoTerm>Stuck</AutoTerm>   <AutoTerm id="open_deals">Open deals</AutoTerm>
 */
export function AutoTerm({ id = null, children }) {
  const tid = id || termIdForLabel(typeof children === "string" ? children : null);
  // eslint-disable-next-line no-use-before-define
  return tid ? <Term id={tid}>{children}</Term> : <>{children}</>;
}

/**
 * DICTIONARY TERM (session 47).
 *
 *   <Term id="invoiced">Invoiced</Term>
 *
 * The label keeps its own text; it gets a dotted underline and a small ⓘ.
 *   - hover (300 ms) or keyboard focus on the ⓘ → a short tip: the term, one
 *     sentence, "More info"
 *   - tap / click on the ⓘ → the same tip (touch screens)
 *   - "More info" → a pop-up: meaning, how it is calculated, where the number
 *     comes from, an example, related terms, "Open in Dictionary"
 *   - Escape or a click outside closes it.
 *
 * The ⓘ is drawn by CSS (::before), so the page's TEXT is unchanged; a click on
 * the label itself still reaches the card or row it sits in — only the ⓘ keeps
 * its own click. An id with no entry renders the label alone.
 */

const STYLE_ID = "jd-term-style";
const CSS = `
.jd-term{text-decoration-line:underline;text-decoration-style:dotted;text-decoration-thickness:1px;text-underline-offset:3px;text-decoration-color:rgba(100,116,139,.7)}
.jd-term-i{display:inline-block;cursor:help;margin-inline-start:2px;line-height:1;vertical-align:baseline;border-radius:9999px;color:#64748B;font-weight:400;text-decoration:none}
.jd-term-i::before{content:"\\24D8";font-size:.78em}
.jd-term-i:hover,.jd-term-i:focus-visible{color:#1D4ED8;outline:none}
.jd-term-i:focus-visible{box-shadow:0 0 0 2px #93C5FD}
`;
function useTermStyle() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

const OPEN_DELAY = 300;
const CLOSE_DELAY = 150;

/** The "More info" pop-up. Related terms switch it in place. */
export function DictionaryModal({ id, onClose }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(id);
  useEffect(() => setCurrent(id), [id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const e = DICTIONARY[current];
  if (!e) return null;
  const tx = (f) => entryText(e, f, language);
  const rtl = language === "ar";
  const Section = ({ k, label }) => (tx(k) ? (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</h3>
      <p className="text-sm text-gray-800 whitespace-pre-line" data-testid={`dict-${k}`}>{tx(k)}</p>
    </div>
  ) : null);
  return createPortal(
    <div className="fixed inset-0 z-[960] flex items-center justify-center p-4" dir={rtl ? "rtl" : "ltr"} data-testid="dict-modal" onClick={(ev) => ev.stopPropagation()}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="dict-modal-title" className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="dict-modal-title" className="text-lg font-semibold text-gray-900" data-testid="dict-modal-term">{tx("term")}</h2>
          <button type="button" onClick={onClose} aria-label={t("dictionary.close")} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <Section k="meaning" label={t("dictionary.meaning")} />
        <Section k="calculation" label={t("dictionary.calculation")} />
        <Section k="source" label={t("dictionary.source")} />
        <Section k="example" label={t("dictionary.example")} />
        {(e.related || []).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t("dictionary.related")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {e.related.filter((r) => DICTIONARY[r]).map((r) => (
                <button key={r} type="button" data-testid={`dict-related-${r}`} onClick={() => setCurrent(r)}
                  className="px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-xs hover:bg-blue-100">
                  {entryText(DICTIONARY[r], "term", language)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">{e.status === "draft" ? t("dictionary.draft") : ""}</span>
          <button type="button" data-testid="dict-open-page" onClick={() => { onClose(); navigate(`/help#${current}`); }}
            className="text-sm text-blue-600 hover:underline">{t("dictionary.openInDictionary")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function Term({ id, children, className = "" }) {
  useTermStyle();
  const { t, language } = useLanguage();
  const entry = DICTIONARY[id];
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [pos, setPos] = useState(null);
  const anchor = useRef(null);
  const tip = useRef(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const clear = () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); };
  const place = useCallback(() => {
    const r = anchor.current?.getBoundingClientRect?.();
    if (!r) return;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, (window.innerWidth || 1024) - 296)) });
  }, []);
  const show = useCallback(() => { clear(); place(); setOpen(true); }, [place]);
  const hideSoon = () => { clear(); closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY); };
  const onEnter = () => { clear(); openTimer.current = setTimeout(show, OPEN_DELAY); };
  useEffect(() => () => clear(), []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  // Escape / click outside close the tip.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => {
      if (anchor.current?.contains(e.target) || tip.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  if (!entry) return <>{children}</>;
  const term = entryText(entry, "term", language);
  const rtl = language === "ar";

  return (
    <span ref={anchor} className={`jd-term ${className}`} data-term={id} onMouseEnter={onEnter} onMouseLeave={hideSoon}>
      {children}
      <span
        role="button"
        tabIndex={0}
        aria-label={`${term}: ${t("dictionary.whatIs")}`}
        aria-expanded={open}
        data-testid={`term-i-${id}`}
        className="jd-term-i"
        onFocus={show}
        onBlur={(e) => { if (!tip.current?.contains(e.relatedTarget)) hideSoon(); }}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (open) setOpen(false); else show(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(false); setModal(true); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && pos && createPortal(
        <div
          ref={tip}
          role="tooltip"
          dir={rtl ? "rtl" : "ltr"}
          data-testid="term-tip"
          data-term-tip={id}
          onMouseEnter={clear}
          onMouseLeave={hideSoon}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 950, width: 288 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-left text-sm font-normal normal-case tracking-normal text-gray-700"
        >
          <p className="font-semibold text-gray-900 mb-0.5">{term}</p>
          <p className="text-[13px] leading-snug" data-testid="term-tip-short">{entryText(entry, "short", language)}</p>
          <button
            type="button"
            data-testid="term-more"
            className="mt-1.5 text-xs text-blue-600 hover:underline"
            onClick={(e) => { e.stopPropagation(); setOpen(false); setModal(true); }}
          >
            {t("dictionary.moreInfo")}
          </button>
        </div>,
        document.body,
      )}
      {modal && <DictionaryModal id={id} onClose={() => setModal(false)} />}
    </span>
  );
}
