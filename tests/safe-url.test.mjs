import assert from "node:assert/strict";
import test from "node:test";
import { safeEvidenceUrl } from "../lib/security/safe-url.ts";

test("evidence links require credential-free HTTPS", () => {
  assert.equal(safeEvidenceUrl("https://example.org/report.pdf"), "https://example.org/report.pdf");
  for (const value of ["javascript:alert(1)","data:text/html,hi","http://example.org/report",
    "https://user:pass@example.org/report","/relative/path","not a URL",null]) {
    assert.equal(safeEvidenceUrl(value), null);
  }
});
