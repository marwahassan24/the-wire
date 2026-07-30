import { test } from "node:test";
import assert from "node:assert/strict";
import { extractActionLines, taskTextForAction } from "./meetingNoteActions.js";

test("extracts a TCFP: line as a tcfp action with the prefix stripped", () => {
  const actions = extractActionLines("Next steps & actions\nTCFP: confirm the position before the Annual.");
  assert.deepEqual(actions, [{ kind: "tcfp", text: "confirm the position before the Annual." }]);
});

test("extracts a Client: line as a client action with the prefix stripped", () => {
  const actions = extractActionLines("Next steps & actions\nClient: send through the share scheme booklet.");
  assert.deepEqual(actions, [{ kind: "client", text: "send through the share scheme booklet." }]);
});

test("is case-insensitive and tolerates whitespace around the colon", () => {
  const actions = extractActionLines("tcfp : lowercase and spaced\nCLIENT:no space at all");
  assert.deepEqual(actions, [
    { kind: "tcfp", text: "lowercase and spaced" },
    { kind: "client", text: "no space at all" },
  ]);
});

test("extracts multiple action lines in document order, ignoring narrative text", () => {
  const body =
    "Overall position\nA quiet six months.\n\nNext steps & actions\nTCFP: confirm the DD position.\nClient: let us know once the conversation has moved on.\nTCFP: prepare a protection comparison.";
  const actions = extractActionLines(body);
  assert.deepEqual(actions, [
    { kind: "tcfp", text: "confirm the DD position." },
    { kind: "client", text: "let us know once the conversation has moved on." },
    { kind: "tcfp", text: "prepare a protection comparison." },
  ]);
});

test("tolerates a leading bullet marker before the label", () => {
  const body = "Next steps & actions\n- TCFP: confirm the DD position.\n• Client: send the booklet.\n* TCFP: chase the transfer.";
  const actions = extractActionLines(body);
  assert.deepEqual(actions, [
    { kind: "tcfp", text: "confirm the DD position." },
    { kind: "client", text: "send the booklet." },
    { kind: "tcfp", text: "chase the transfer." },
  ]);
});

test("a bullet in front of narrative text is still not an action", () => {
  const actions = extractActionLines("- The client mentioned a house move.\n- We discussed what TCFP can offer.");
  assert.deepEqual(actions, []);
});

test("a line that merely mentions 'client' or 'tcfp' without a leading label is not an action", () => {
  const actions = extractActionLines(
    "We discussed what TCFP can offer.\nThe client mentioned a house move.\nClient mentioned nothing else."
  );
  assert.deepEqual(actions, []);
});

test("a label with nothing after the colon is not an action", () => {
  const actions = extractActionLines("TCFP:\nClient:   ");
  assert.deepEqual(actions, []);
});

test("a body with no action lines extracts nothing", () => {
  assert.deepEqual(extractActionLines("Overall position\nA strong year, nothing further needed."), []);
});

test("taskTextForAction leaves a TCFP action's text unchanged", () => {
  assert.equal(taskTextForAction({ kind: "tcfp", text: "prepare gifting options." }), "prepare gifting options.");
});

test("taskTextForAction words a Client action so it reads as our follow-up, not an instruction to them", () => {
  assert.equal(
    taskTextForAction({ kind: "client", text: "send through the share scheme booklet." }),
    "Client action - send through the share scheme booklet."
  );
});
