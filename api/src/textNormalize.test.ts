import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "./textNormalize.js";

test("replaces every em dash with a plain hyphen", () => {
  assert.equal(normalizeText("Carry forward — no time."), "Carry forward - no time.");
  assert.equal(normalizeText("A—B—C"), "A-B-C");
});

test("leaves text with no em dash unchanged", () => {
  assert.equal(normalizeText("Nothing to change here."), "Nothing to change here.");
});

test("does not touch a plain hyphen or an en dash", () => {
  assert.equal(normalizeText("Already a hyphen - fine."), "Already a hyphen - fine.");
  assert.equal(normalizeText("An en dash – untouched."), "An en dash – untouched.");
});
