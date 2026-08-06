import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, ageOn, alertDateFor, daysAliveOn, isValidDateString, milestoneDateFor } from "./calc.js";

test("daysAliveOn counts whole calendar days, date-only, no time component involved", () => {
  assert.equal(daysAliveOn("2000-01-01", "2000-01-02"), 1);
  assert.equal(daysAliveOn("2000-01-01", "2000-01-01"), 0);
  assert.equal(daysAliveOn("2000-01-01", "2010-01-01"), 3653); // 10 years incl. 2 leap days (2004, 2008)
});

test("a client exactly 30 days before a milestone: alertDate equals today", () => {
  // dob chosen so milestone 10000 lands on 2026-04-12; alert (30 days
  // before) should land on 2026-03-13.
  const dob = "1998-11-25";
  const milestoneDate = milestoneDateFor(dob, 10000);
  assert.equal(milestoneDate, "2026-04-12");
  const alertDate = alertDateFor(milestoneDate, 30);
  assert.equal(alertDate, "2026-03-13");
});

test("29 days before a milestone does not match the alert date", () => {
  const dob = "1998-11-25";
  const milestoneDate = milestoneDateFor(dob, 10000); // 2026-04-12
  const alertDate = alertDateFor(milestoneDate, 30); // 2026-03-13
  const twentyNineDaysBefore = addDays(milestoneDate, -29);
  assert.equal(twentyNineDaysBefore, "2026-03-14");
  assert.notEqual(twentyNineDaysBefore, alertDate);
});

test("31 days before a milestone does not match the alert date", () => {
  const dob = "1998-11-25";
  const milestoneDate = milestoneDateFor(dob, 10000); // 2026-04-12
  const alertDate = alertDateFor(milestoneDate, 30); // 2026-03-13
  const thirtyOneDaysBefore = addDays(milestoneDate, -31);
  assert.equal(thirtyOneDaysBefore, "2026-03-12");
  assert.notEqual(thirtyOneDaysBefore, alertDate);
});

test("leap years are counted correctly in daysAliveOn", () => {
  // 2000, 2004, 2008, 2012, 2016, 2020, 2024 are all leap years in this
  // span (2000 is divisible by 400, so it counts too).
  const days = daysAliveOn("2000-01-01", "2025-01-01");
  assert.equal(days, 9132);
});

test("a leap-day (29 Feb) date of birth is handled correctly", () => {
  const dob = "2000-02-29";
  // In a non-leap year, addDays should land cleanly - no invalid
  // "29 Feb 2001" is ever produced because arithmetic is by day-count,
  // not by incrementing calendar fields.
  assert.equal(milestoneDateFor(dob, 365), "2001-02-28");
  assert.equal(milestoneDateFor(dob, 366), "2001-03-01");
  // Age on the next real 29 Feb (2004, a leap year) should read as 4.
  assert.equal(ageOn(dob, "2004-02-29"), 4);
  // The day before their 4th "real" birthday, still 3.
  assert.equal(ageOn(dob, "2004-02-28"), 3);
});

test("daylight-saving clock changes do not shift the result by a day", () => {
  // UK clocks changed 30 Mar 2025 (spring forward) and 26 Oct 2025
  // (autumn back). A pure calendar-day span across either boundary
  // must still count whole days only.
  assert.equal(daysAliveOn("2025-03-29", "2025-03-31"), 2);
  assert.equal(daysAliveOn("2025-10-25", "2025-10-27"), 2);
  assert.equal(addDays("2025-03-29", 2), "2025-03-31");
  assert.equal(addDays("2025-10-25", 2), "2025-10-27");
});

test("dates are treated as date-only values - a malformed or non-existent calendar date is rejected", () => {
  assert.equal(isValidDateString("2026-07-31"), true);
  assert.equal(isValidDateString("2023-02-30"), false); // no such date
  assert.equal(isValidDateString("2026-13-01"), false); // no month 13
  assert.equal(isValidDateString("not-a-date"), false);
  assert.equal(isValidDateString(""), false);
  assert.throws(() => daysAliveOn("not-a-date", "2026-01-01"));
  assert.throws(() => addDays("2023-02-30", 1));
});

test("ageOn calculates real calendar age, not milestoneDays / 365", () => {
  // Born 27 April 1960; on the 24,242-day milestone (27 April 2026 per
  // the brief's own worked example) they are 66, not round(24242/365)=66.4.
  assert.equal(ageOn("1960-04-27", "2026-04-27"), 66);
  // The day before their birthday they are still one year younger.
  assert.equal(ageOn("1960-04-27", "2026-04-26"), 65);
  // The day after, already incremented.
  assert.equal(ageOn("1960-04-27", "2026-04-28"), 66);
});

test("the brief's own worked example reproduces exactly", () => {
  // "Client: John Todd, Milestone: 24,242 days, Age on that date: 66
  // years old, Milestone date: 27 April 2026, Send card by: 22 April 2026"
  const dob = "1959-12-13"; // 2026-04-27 minus 24,242 days
  const milestoneDate = milestoneDateFor(dob, 24242);
  assert.equal(milestoneDate, "2026-04-27");
  assert.equal(ageOn(dob, milestoneDate), 66);
  assert.equal(addDays(milestoneDate, -5), "2026-04-22"); // send-card-by
});
