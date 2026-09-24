import assert from "node:assert/strict";
import { test } from "node:test";
import { findAiPolicy } from "./policy";

test("finds a real contribution policy about AI", () => {
  const guide = "# Contributing\n\nPlease be kind.\n\n## AI-assisted contributions\nPRs written with AI tools must be disclosed and understood by the author.\n";
  assert.match(findAiPolicy([guide]) ?? "", /disclosed and understood/);
});

test("handles Windows line endings", () => {
  const guide = "# Contributing\r\nWe do not accept AI-generated pull requests without disclosure.\r\n";
  assert.match(findAiPolicy([guide]) ?? "", /AI-generated pull requests/);
});

test("ignores instruction files written for coding agents", () => {
  assert.equal(findAiPolicy(["This file provides guidance to AI coding assistants (Claude Code, Cursor) when working with code in this repository."]), null);
  assert.equal(findAiPolicy(["Guidance for AI agents working in this repository."]), null);
});

test("does not match 'AI' inside other words, and tolerates missing files", () => {
  assert.equal(findAiPolicy(["Our main branch is protected and we accept contributions gladly."]), null);
  assert.equal(findAiPolicy([undefined, undefined]), null);
});
