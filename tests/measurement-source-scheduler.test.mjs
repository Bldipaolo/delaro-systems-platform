import test from "node:test";
import assert from "node:assert/strict";
import { isValidCronAuthorization, sanitizeSyncError } from "../lib/measurement-sources/scheduler-protocol.ts";

test("scheduler authorization requires an exact sufficiently strong bearer secret", () => {
  const secret = "stage4c-test-secret-with-32-characters";
  assert.equal(isValidCronAuthorization(`Bearer ${secret}`, secret), true);
  assert.equal(isValidCronAuthorization(`Bearer ${secret}x`, secret), false);
  assert.equal(isValidCronAuthorization(null, secret), false);
  assert.equal(isValidCronAuthorization("Bearer short", "short"), false);
});

test("sync errors redact credentials and query secrets", () => {
  const sanitized = sanitizeSyncError(new Error("Request failed Bearer abc.def.ghi at https://example.invalid?access_token=secret-value&after=1"));
  assert.doesNotMatch(sanitized, /abc\.def\.ghi|secret-value/);
  assert.match(sanitized, /\[redacted\]/);
});
