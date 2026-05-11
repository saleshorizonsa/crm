import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invitation",
];

const SESSION_LIMIT = 30;

const SUGGESTED_PROMPTS = [
  "Summarise my pipeline this month",
  "Draft a follow-up for a stalled deal",
  "What should I focus on today?",
  "Why is my win rate changing?",
];

async function callAnthropicAPI(userMessage, history, user, userProfile, company) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("NO_API_KEY");

  const systemPrompt = `You are an AI assistant built into Jasco CRM — a sales CRM used by Steel, PVC and Trading companies in Saudi Arabia and the GCC region.

You help salesmen and managers with:
- Analysing their pipeline and deals
- Drafting professional follow-up messages to clients in English or Arabic
- Suggesting next actions for stalled deals
- Explaining CRM features and how to use them
- Answering questions about their performance

Current user: ${userProfile?.full_name || user?.email || "Unknown"}
Role: ${userProfile?.role || "Unknown"}
Company: ${company?.name || "Unknown"}
Keep responses concise and actionable. Maximum 3-4 sentences unless drafting a message.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-allow-browser": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        ...history.slice(-6),
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) throw new Error("API_ERROR");
  const data = await response.json();
  return (
    data.content?.[0]?.text ||
    "Sorry, I could not respond. Please try again."
  );
}

const TypingIndicator = () => (
  <div className="flex items-end gap-2 mb-3">
    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
      <span className="text-purple-600 text-xs">✦</span>
    </div>
    <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
      <div className="flex gap-1 items-center h-4">
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  </div>
);

const AIAssistant = () => {
  const location = useLocation();
  const { user, userProfile, company } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [showPulse, setShowPulse] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Pulse animation on first load to draw attention
  useEffect(() => {
    const start = setTimeout(() => setShowPulse(true), 800);
    const stop = setTimeout(() => setShowPulse(false), 3500);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, []);

  // Auto-scroll to bottom on new messages or typing indicator
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen]);

  // Hide on public/auth routes
  if (PUBLIC_ROUTES.includes(location.pathname)) return null;

  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const appendMessage = (role, content) => {
    const msg = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  };

  const handleSend = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading || sessionCount >= SESSION_LIMIT) return;

    setInput("");
    setSessionCount((c) => c + 1);

    // Check API key before touching state
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      appendMessage("user", message);
      appendMessage(
        "error",
        "AI Assistant not configured. Contact your administrator."
      );
      return;
    }

    appendMessage("user", message);
    setLoading(true);

    // Build history array for API — only user/assistant pairs, last 6
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map(({ role, content }) => ({ role, content }));

    try {
      const reply = await callAnthropicAPI(
        message,
        history,
        user,
        userProfile,
        company
      );
      appendMessage("assistant", reply);
    } catch {
      appendMessage("error", "Could not connect to AI. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const atLimit = sessionCount >= SESSION_LIMIT;

  return (
    <>
      {/* ── Chat panel ── */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-6 z-[500] flex flex-col bg-white rounded-xl shadow-xl overflow-hidden"
          style={{
            width: 360,
            height: 480,
            animation: "aiSlideUp 0.2s ease-out",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-white text-base leading-none">✦</span>
              <span className="text-white font-semibold text-sm">
                AI Assistant
              </span>
              <span className="bg-purple-500/50 text-purple-100 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none">
                Haiku
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-purple-200 hover:text-white transition-colors w-6 h-6 flex items-center justify-center rounded"
              aria-label="Close AI Assistant"
            >
              ✕
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !loading ? (
              /* Empty state — suggested prompts */
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <div className="text-center">
                  <div className="text-3xl mb-2 text-purple-400">✦</div>
                  <p className="text-sm font-medium text-gray-700">
                    How can I help you?
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Ask me anything about your pipeline or deals
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="text-left text-xs px-3 py-2.5 bg-gray-50 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 border border-gray-200 rounded-lg transition-colors leading-snug"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message list */
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col mb-3 ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    {msg.role === "user" && (
                      <div className="bg-purple-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    )}

                    {msg.role === "assistant" && (
                      <div className="flex items-end gap-2">
                        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mb-0.5">
                          <span className="text-purple-600 text-xs leading-none">
                            ✦
                          </span>
                        </div>
                        <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content}
                        </div>
                      </div>
                    )}

                    {msg.role === "error" && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed">
                        {msg.content}
                      </div>
                    )}

                    <span className="text-[10px] text-gray-400 mt-1 px-1">
                      {msg.role === "user"
                        ? "You"
                        : msg.role === "error"
                        ? "System"
                        : "AI"}{" "}
                      · {formatTime(msg.timestamp)}
                    </span>
                  </div>
                ))}

                {loading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Session limit banner */}
          {atLimit && (
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-700 text-center flex-shrink-0">
              You have reached the session limit. Please refresh to start a new
              conversation.
            </div>
          )}

          {/* Input area */}
          <div className="flex items-end gap-2 px-3 py-3 border-t border-gray-100 flex-shrink-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 96) + "px";
              }}
              placeholder="Ask anything..."
              disabled={loading || atLimit}
              rows={1}
              className="flex-1 resize-none text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 leading-relaxed"
              style={{ minHeight: 38, maxHeight: 96, overflowY: "auto" }}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim() || atLimit}
              className="w-9 h-9 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={[
          "fixed bottom-6 right-6 z-[500]",
          "w-12 h-12 rounded-full",
          "bg-purple-600 hover:bg-purple-700",
          "text-white shadow-lg hover:shadow-xl",
          "flex items-center justify-center",
          "transition-all duration-200",
          showPulse && !isOpen ? "animate-pulse" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title="AI Assistant"
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <span className="text-xl leading-none select-none">✦</span>
        )}
      </button>

      {/* Slide-up keyframe — injected once */}
      <style>{`
        @keyframes aiSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </>
  );
};

export default AIAssistant;
