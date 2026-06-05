import React from "react";

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Success is not final, failure is not fatal — it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Coming together is a beginning, staying together is progress, working together is success.", author: "Henry Ford" },
  { text: "Quality is not an act — it is a habit.", author: "Aristotle" },
  { text: "Don't watch the clock — do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Every sale has five basic obstacles: no need, no money, no hurry, no desire, no trust.", author: "Zig Ziglar" },
  { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
  { text: "You don't close a sale — you open a relationship.", author: "Patricia Fripp" },
  { text: "Make a customer, not a sale.", author: "Katherine Barchetti" },
  { text: "Alone we can do so little — together we can do so much.", author: "Helen Keller" },
  { text: "Great things in business are never done by one person.", author: "Steve Jobs" },
  { text: "Talent wins games but teamwork wins championships.", author: "Michael Jordan" },
  { text: "A goal is a dream with a deadline.", author: "Napoleon Hill" },
  { text: "Don't find customers for your products. Find products for your customers.", author: "Seth Godin" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "Believe you can and you are halfway there.", author: "Theodore Roosevelt" },
  { text: "It does not matter how slowly you go, so long as you do not stop.", author: "Confucius" },
  { text: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
  { text: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson" },
  { text: "Your attitude, not your aptitude, will determine your altitude.", author: "Zig Ziglar" },
  { text: "The harder the conflict, the more glorious the triumph.", author: "Thomas Paine" },
  { text: "If everyone is moving forward together, success takes care of itself.", author: "Henry Ford" },
  { text: "Excellence is doing ordinary things extraordinarily well.", author: "John W. Gardner" },
  { text: "The key to success is to focus on goals, not obstacles.", author: "Unknown" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Unknown" },
  { text: "A satisfied customer is the best business strategy of all.", author: "Michael LeBoeuf" },
  { text: "Build something 100 people love, not something 1 million people kind of like.", author: "Brian Chesky" },
  { text: "Your work is going to fill a large part of your life — make it great.", author: "Steve Jobs" },
];

const DAY_LABELS = [
  "Sunday Reflection", "Monday Motivation", "Tuesday Tip", "Wednesday Wisdom",
  "Thursday Thought", "Friday Focus", "Saturday Spark",
];

export default function DailyQuote() {
  const now       = new Date();
  const start     = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const quote     = QUOTES[dayOfYear % QUOTES.length];
  const dayLabel  = DAY_LABELS[now.getDay()];
  const dateLabel = now.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="bg-white/8 rounded-xl p-4 border border-white/10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-blue-200 bg-white/10 px-2 py-0.5 rounded-full">
          {dayLabel}
        </span>
        <span className="text-xs text-blue-300/60">{dateLabel}</span>
      </div>
      <p className="text-sm text-white/90 leading-relaxed italic mb-2">
        "{quote.text}"
      </p>
      <p className="text-xs text-blue-200/70">— {quote.author}</p>
    </div>
  );
}
