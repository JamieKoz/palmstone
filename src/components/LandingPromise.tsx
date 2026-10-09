"use client";

import { useEffect, useState } from "react";

const LINES = [
  "No account.",
  "No feed.",
  "No notifications.",
  "No social network.",
  "No ads.",
  "No gamification.",
];

/** Quiet rotating promise — Palmstone is a place, not a product loop. */
export function LandingPromise() {
  const [index, setIndex] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const ms = reduce ? 5000 : 2800;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % LINES.length);
    }, ms);
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <p className="landing-promise" aria-live="polite">
      <span key={index} className="landing-promise__line">
        {LINES[index]}
      </span>
    </p>
  );
}
