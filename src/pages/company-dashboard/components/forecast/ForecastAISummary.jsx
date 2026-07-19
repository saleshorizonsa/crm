import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../../../components/AppIcon";
import { format } from "date-fns";
import { DEFAULT_STAGE_WEIGHTS } from "../../../../utils/forecastEngine";

const OPEN_STAGES = new Set(["lead", "contact_made", "proposal_sent", "negotiation"]);
const VISIBLE_ROLES = ["director", "manager", "supervisor"];
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const ROLE_CONTEXT = {
  director:
    "You are speaking to the Director who oversees the entire company. Focus on overall company performance, team-level patterns, and strategic risks. Mention if any stage or segment appears to be underperforming.",
  manager:
    "You are speaking to the Sales Manager who manages a team. Focus on team pipeline health, which deals need immediate attention, and what coaching or action the team needs to close the gap to target.",
  supervisor:
    "You are speaking to the Supervisor who manages a small team of salesmen. Focus on specific deals in their team pipeline, which deals are at risk, and concrete actions to take this week.",
};

// ── API call ──────────────────────────────────────────────────────────────────

// Calls the same-origin Vercel serverless proxy (/api/ai-assistant), NOT the
// Anthropic API directly. The proxy holds the key server-side, so this avoids
// (a) shipping the API key in the browser bundle and (b) the CORS failures that
// direct browser→Anthropic calls hit — which is why the summary previously
// showed "Could not generate summary". A 30s timeout guards against hangs.
async function callAnthropicAPI(pipelineData, role, currency) {
  const roleCtx = ROLE_CONTEXT[role] || ROLE_CONTEXT.manager;

  const prompt = `You are a sales performance analyst for a CRM used by a Steel, PVC, and Trading company in Saudi Arabia and the GCC region.

Analyse this sales pipeline data and write a concise forecast summary. Be direct, specific, and actionable. Use the actual numbers from the data.

ROLE CONTEXT:
${roleCtx}

PIPELINE DATA:
${JSON.stringify(pipelineData, null, 2)}

Write exactly 3 paragraphs:

Paragraph 1 — Current position (2-3 sentences): Where are they vs target? State committed revenue and weighted forecast. Are they on track?

Paragraph 2 — Key risks and opportunities (2-3 sentences): Biggest deals at risk? How many deals stalled? Which stage has the most value? Name specific deal titles from topOpenDeals if useful.

Paragraph 3 — What needs to happen (1-2 sentences): One clear, specific action to hit target this period. State the gap amount and which stage needs to move.

Rules:
- Use ${currency} and real numbers throughout
- Under 120 words total
- No bullet points, no headers — flowing paragraphs only
- Speak directly to the manager ("you have", "your team")
- Attainment > 90 %: confident but note risks. Attainment < 50 %: urgent but constructive. No target set: focus on pipeline health.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("/api/ai-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const detail =
        errBody?.error?.message || errBody?.error || response.statusText;
      console.error(
        "[ForecastAISummary] Proxy error:",
        response.status,
        detail,
      );
      throw new Error(`API error ${response.status}: ${detail}`);
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) throw new Error("Empty response from API");
    return text;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Request timed out");
    console.error("[ForecastAISummary] error:", err);
    throw err;
  }
}

// ── Pipeline data builder ─────────────────────────────────────────────────────

function buildPipelineSnapshot(deals, target, companyName, period, currency) {
  const openDeals = deals.filter((d) => OPEN_STAGES.has(d.stage));
  const wonDeals  = deals.filter((d) => d.stage === "won");

  const committed = wonDeals.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const openWeighted = openDeals.reduce((s, d) => {
    const w = DEFAULT_STAGE_WEIGHTS[d.stage] ?? 0;
    return s + (parseFloat(d.amount) || 0) * w;
  }, 0);
  const openBestCase = openDeals.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);

  const weighted    = committed + openWeighted;
  const bestCase    = committed + openBestCase;
  const attainment  = target > 0 ? Math.round((weighted / target) * 100) : null;
  const gap         = target > 0 ? target - weighted : null;

  const now = Date.now();
  const stalledDeals = openDeals.filter((d) => {
    if (!d.updated_at) return true;
    return (now - new Date(d.updated_at).getTime()) / 86400000 > 14;
  });

  const topOpenDeals = [...openDeals]
    .sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
    .slice(0, 5)
    .map((d) => ({
      title:  d.title,
      amount: Math.round(parseFloat(d.amount) || 0),
      stage:  d.stage,
    }));

  // Per-stage breakdown
  const byStage = Array.from(OPEN_STAGES).map((stage) => {
    const s = deals.filter((d) => d.stage === stage);
    return {
      stage,
      count: s.length,
      value: Math.round(s.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)),
    };
  });

  return {
    company:      companyName || "Company",
    period,
    currency,
    target:       Math.round(target || 0),
    committed:    Math.round(committed),
    weighted:     Math.round(weighted),
    bestCase:     Math.round(bestCase),
    attainment,
    gap:          gap != null ? Math.round(gap) : null,
    totalDeals:   deals.length,
    openDeals:    openDeals.length,
    wonDeals:     wonDeals.length,
    stalledDeals: stalledDeals.length,
    topOpenDeals,
    byStage,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

const ForecastAISummary = ({
  deals = [],
  target = 0,
  period,
  companyName,
  role,
  currency = "SAR",
  companyId,
}) => {
  if (!VISIBLE_ROLES.includes(role)) return null;

  const displayPeriod = period || format(new Date(), "MMMM yyyy");

  const pipelineData = useMemo(
    () => buildPipelineSnapshot(deals, target, companyName, displayPeriod, currency),
    // Round weighted to nearest 1000 so minor deal edits don't bust the cache key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals.length, Math.round((target || 0) / 1000), displayPeriod, companyId],
  );

  const cacheKey = `forecast_summary_${companyId || "x"}_${displayPeriod}_${Math.round((pipelineData.weighted || 0) / 1000)}`;

  const [summary,     setSummary]     = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isExpanded,  setIsExpanded]  = useState(true);

  // Generate or load from cache on mount / when key changes
  useEffect(() => {
    if (!deals.length) return;
    tryLoadCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  function tryLoadCache() {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const { summary: s, generatedAt } = JSON.parse(raw);
        if (Date.now() - generatedAt < CACHE_TTL_MS) {
          setSummary(s);
          setLastUpdated(new Date(generatedAt));
          return;
        }
      }
    } catch (_) {}
    generateSummary(false);
  }

  async function generateSummary(forceRefresh = true) {
    if (forceRefresh) {
      try { sessionStorage.removeItem(cacheKey); } catch (_) {}
    }
    setLoading(true);
    setError("");
    try {
      const text = await callAnthropicAPI(pipelineData, role, currency);
      setSummary(text);
      const now = Date.now();
      setLastUpdated(new Date(now));
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ summary: text, generatedAt: now }));
      } catch (_) {}
    } catch (err) {
      const raw = err.message || "";
      let msg;
      if (/not configured|not set/i.test(raw) || raw.includes("500")) {
        msg = "AI service not configured — set the Anthropic API key in the Vercel project settings";
      } else if (raw.includes("401") || raw.includes("403") || /authentication|invalid.*key/i.test(raw)) {
        msg = "AI service key is invalid — check the server configuration";
      } else if (raw.includes("429")) {
        msg = "Rate limit reached — try again in a moment";
      } else if (/timed out/i.test(raw)) {
        msg = "Request timed out — try again";
      } else {
        msg = "Could not generate summary";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden enterprise-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center flex-shrink-0">
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              className="text-purple-600"
              aria-hidden
            >
              <path
                d="M8 1l1.5 3.5L13 6l-2.5 2.5L11 12 8 10.5 5 12l.5-3.5L3 6l3.5-1.5L8 1z"
                fill="currentColor"
              />
            </svg>
          </div>
          <span className="text-sm font-semibold text-card-foreground">AI Forecast Summary</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold uppercase tracking-wide">
            Beta
          </span>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {format(lastUpdated, "HH:mm")}
            </span>
          )}
          <button
            onClick={() => generateSummary(true)}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            title="Regenerate summary"
          >
            <Icon
              name="RefreshCw"
              size={12}
              className={loading ? "animate-spin" : ""}
            />
            <span className="hidden sm:inline">
              {loading ? "Generating…" : "Refresh"}
            </span>
          </button>
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={15} />
          </button>
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="px-4 py-3">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-muted rounded-full w-full" />
              <div className="h-3 bg-muted rounded-full w-5/6" />
              <div className="h-3 bg-muted rounded-full w-4/6" />
              <div className="h-2" />
              <div className="h-3 bg-muted rounded-full w-full" />
              <div className="h-3 bg-muted rounded-full w-3/4" />
              <div className="h-2" />
              <div className="h-3 bg-muted rounded-full w-5/6" />
              <div className="h-3 bg-muted rounded-full w-2/3" />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground py-1">
              <Icon name="AlertCircle" size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <span>
                {error}.{" "}
                <button
                  onClick={() => generateSummary(true)}
                  className="underline hover:text-foreground transition-colors"
                >
                  Try again
                </button>
              </span>
            </div>
          )}

          {/* Summary paragraphs */}
          {summary && !loading && (
            <div className="space-y-2.5">
              {summary.split("\n\n").filter(Boolean).map((para, i) => (
                <p key={i} className="text-sm text-card-foreground leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!summary && !loading && !error && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Add deals to the pipeline to generate a forecast summary.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ForecastAISummary;
