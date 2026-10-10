import assert from "node:assert/strict";
import test from "node:test";
import { getSupabasePublicConfig } from "../lib/supabase/config.ts";

const keys = ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_DELARO_DEMO_MODE","NODE_ENV"];
const original = Object.fromEntries(keys.map((key) => [key,process.env[key]]));

function restore() {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

test("production fails closed without Supabase, even if demo is requested", () => {
  try {
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "production";
    assert.throws(getSupabasePublicConfig, /configuration is incomplete/);
    process.env.NEXT_PUBLIC_DELARO_DEMO_MODE = "true";
    assert.throws(getSupabasePublicConfig, /configuration is incomplete/);
  } finally { restore(); }
});

test("development demo requires an explicit flag", () => {
  try {
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "development";
    assert.throws(getSupabasePublicConfig, /configuration is incomplete/);
    process.env.NEXT_PUBLIC_DELARO_DEMO_MODE = "true";
    assert.equal(getSupabasePublicConfig(), null);
  } finally { restore(); }
});

test("partial configuration fails closed and complete configuration is accepted", () => {
  try {
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    assert.throws(getSupabasePublicConfig, /configuration is incomplete/);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    assert.deepEqual(getSupabasePublicConfig(), {
      url: "https://example.supabase.co", key: "test-publishable-key",
    });
  } finally { restore(); }
});
