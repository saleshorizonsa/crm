import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import { useLanguage } from "../../i18n";
import { DICTIONARY, DICTIONARY_PAGES, entryText } from "../../data/dictionary";

/**
 * DICTIONARY (session 47) — /help. Every term of src/data/dictionary.js: search,
 * A–Z, filter by page, and one address per term (/help#invoiced) that scrolls
 * to the entry and highlights it.
 */
const norm = (s) => String(s || "").toLowerCase();

export default function DictionaryPage() {
  const { t, language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [page, setPage] = useState("");
  const [letter, setLetter] = useState("");
  const anchorId = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  const tx = (e, f) => entryText(e, f, language);

  const all = useMemo(() => Object.values(DICTIONARY)
    .slice()
    .sort((a, b) => tx(a, "term").localeCompare(tx(b, "term"), language === "ar" ? "ar" : "en")),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [language]);
  const first = (e) => tx(e, "term").trim().charAt(0).toUpperCase();
  const letters = useMemo(() => [...new Set(all.map(first))], [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = all.filter((e) => {
    if (page && !(e.pages || []).includes(page)) return false;
    if (letter && first(e) !== letter) return false;
    if (q) {
      const s = norm(q);
      return ["term", "short", "meaning"].some((f) => norm(tx(e, f)).includes(s) || norm(entryText(e, f, "en")).includes(s));
    }
    return true;
  });

  // #anchor: clear filters that would hide it, scroll to it, highlight it.
  useEffect(() => {
    if (!anchorId || !DICTIONARY[anchorId]) return;
    setQ(""); setPage(""); setLetter("");
    const tm = setTimeout(() => {
      const el = document.getElementById(`term-${anchorId}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => clearTimeout(tm);
  }, [anchorId]);

  const sel = "px-3 py-2 border border-gray-300 rounded-md bg-white text-sm";
  return (
    <div className="min-h-screen bg-gray-50" dir={language === "ar" ? "rtl" : "ltr"}>
      <Header />
      <main className="p-6 max-w-4xl mx-auto space-y-4">
        <div>
          <NavigationBreadcrumbs items={[{ label: t("nav.dashboard"), href: "/company-dashboard" }, { label: t("dictionary.title"), href: "/help" }]} />
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">{t("dictionary.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("dictionary.subtitle")}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dictionary.search")}
              aria-label={t("dictionary.search")} data-testid="dict-search" className={`${sel} flex-1`} />
            <select value={page} onChange={(e) => setPage(e.target.value)} data-testid="dict-page-filter" className={sel} aria-label={t("dictionary.byPage")}>
              <option value="">{t("dictionary.allPages")}</option>
              {DICTIONARY_PAGES.map((p) => <option key={p.id} value={p.id}>{p.label[language] || p.label.en}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-1" data-testid="dict-letters">
            <button type="button" onClick={() => setLetter("")} aria-pressed={!letter}
              className={`px-2 py-0.5 rounded text-xs border ${!letter ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>{t("dictionary.all")}</button>
            {letters.map((l) => (
              <button key={l} type="button" onClick={() => setLetter(letter === l ? "" : l)} aria-pressed={letter === l} data-testid={`dict-letter-${l}`}
                className={`px-2 py-0.5 rounded text-xs border ${letter === l ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>{l}</button>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500" data-testid="dict-count">{shown.length} / {all.length}</p>
        <div className="space-y-2">
          {shown.map((e) => {
            const hit = e.id === anchorId;
            return (
              <article key={e.id} id={`term-${e.id}`} data-testid="dict-entry" data-entry={e.id} data-highlight={hit ? "1" : undefined}
                className={`bg-white border rounded-lg p-4 space-y-1.5 scroll-mt-24 ${hit ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-gray-900">
                    <a href={`#${e.id}`} onClick={(ev) => { ev.preventDefault(); navigate(`/help#${e.id}`); }} className="hover:underline">{tx(e, "term")}</a>
                  </h2>
                  <span className="text-[11px] text-gray-400">{(e.pages || []).map((p) => DICTIONARY_PAGES.find((x) => x.id === p)?.label[language] || p).join(" · ")}</span>
                </div>
                <p className="text-sm text-gray-700">{tx(e, "short")}</p>
                <details className="text-sm text-gray-700" open={hit}>
                  <summary className="cursor-pointer text-xs text-blue-600">{t("dictionary.moreInfo")}</summary>
                  <div className="mt-2 space-y-2">
                    {[["meaning", "dictionary.meaning"], ["calculation", "dictionary.calculation"], ["source", "dictionary.source"], ["example", "dictionary.example"]].map(([f, k]) => (
                      <div key={f}><p className="text-xs font-semibold text-gray-500">{t(k)}</p><p className="whitespace-pre-line">{tx(e, f)}</p></div>
                    ))}
                    {(e.related || []).length > 0 && (
                      <p className="text-xs">
                        <span className="font-semibold text-gray-500">{t("dictionary.related")}: </span>
                        {e.related.filter((r) => DICTIONARY[r]).map((r, i) => (
                          <React.Fragment key={r}>
                            {i > 0 && " · "}
                            <a href={`#${r}`} onClick={(ev) => { ev.preventDefault(); navigate(`/help#${r}`); }} className="text-blue-600 hover:underline">{entryText(DICTIONARY[r], "term", language)}</a>
                          </React.Fragment>
                        ))}
                      </p>
                    )}
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
