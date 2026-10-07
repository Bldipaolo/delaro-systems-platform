"use client";

import { useState } from "react";

const demoKeys = ["delaro.demo.opportunities", "delaro.demo.initiatives", "delaro.demo.documents", "delaro.demo.measures"];

export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");

  function resetDemo() {
    demoKeys.forEach((key) => window.localStorage.removeItem(key));
    window.location.reload();
  }

  function exportBrief() {
    const brief = [
      "DELARO SYSTEMS · NORTHSTAR MANUFACTURING",
      "Demo review brief",
      "",
      "Current priorities",
      "- Shorten the quote-to-order handoff",
      "- Create reliable production capacity visibility",
      "- Measure rework cost at the source",
      "",
      "Demo note: values marked as pending require verified evidence before they can be reported as realized value.",
    ].join("\n");
    const blob = new Blob([brief], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "northstar-demo-review-brief.txt";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Review brief downloaded.");
  }

  return <div className="demo-controls"><button className="demo-control-trigger" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Demo controls <span>{open ? "−" : "+"}</span></button>{open && <div className="demo-control-menu"><span className="demo-control-label">Presentation tools</span><button type="button" onClick={exportBrief}>Export review brief <span>↓</span></button><button type="button" onClick={resetDemo}>Reset demo data <span>↺</span></button><small>Demo changes stay on this device.</small></div>}{notice && <button className="demo-control-notice" type="button" onClick={() => setNotice("")} role="status">{notice}</button>}</div>;
}
