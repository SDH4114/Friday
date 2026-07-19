import assert from "node:assert/strict";
import test from "node:test";
import { displayPromptValue, isShiftEnterKey, isShiftEnterSequence, multilinePromptViewport, promptViewport, styleImageMarkers } from "../src/tui/app.js";
import { insertClipboardImage, insertClipboardText, normalizePastedText, parseMacClipboardOutput, removeImageMarker } from "../src/tui/clipboard.js";

test("pasted text is normalized and inserted as one operation", () => {
  assert.equal(normalizePastedText("first\r\nsecond\0"), "first\nsecond");
  assert.deepEqual(insertClipboardText("before after", 7, "one\r\ntwo"), {
    value: "before one\ntwoafter",
    cursor: 14
  });
  assert.equal(displayPromptValue("one\ntwo"), "one\ntwo");
  assert.doesNotMatch(displayPromptValue("one\ntwo"), /↵/u);
  assert.doesNotMatch(displayPromptValue("safe\x1b[2J"), /\x1b\[2J/);
  assert.deepEqual(promptViewport("a very long pasted prompt", 18, 12), {
    text: "… pasted pr…",
    cursorColumn: 8
  });
});

test("clipboard images get increasing, readable markers", () => {
  const first = insertClipboardImage("describe", 8, 1);
  assert.equal(first.value, "describe [Image 1]");
  assert.equal(first.cursor, first.value.length);

  const second = insertClipboardImage(first.value, first.cursor, 2);
  assert.equal(second.value, "describe [Image 1] [Image 2]");
  assert.equal(second.marker, "[Image 2]");
  assert.match(styleImageMarkers(second.value), /\x1b\[7m\[Image 1\]\x1b\[27m/);

  assert.deepEqual(removeImageMarker(second.value, "describe [Image 1]".length, "backward"), {
    value: "describe [Image 1]",
    cursor: "describe ".length,
    imageIndex: 0
  });
  assert.deepEqual(removeImageMarker(second.value, second.value.indexOf("[Image 2]"), "forward"), {
    value: "describe [Image 1]",
    cursor: "describe [Image 1]".length,
    imageIndex: 1
  });
});

test("Shift+Enter is recognized as a newline instead of submit", () => {
  assert.equal(isShiftEnterKey({ name: "enter", shift: true }), true);
  assert.equal(isShiftEnterKey({ name: "enter", shift: false }), false);
  assert.equal(isShiftEnterSequence("\n"), true);
  assert.equal(isShiftEnterSequence("\x1b\r"), true);
  assert.equal(isShiftEnterSequence("\x1b[13;2u"), true);
  assert.equal(isShiftEnterSequence("\x1b[27;2;13~"), true);
  assert.deepEqual(multilinePromptViewport("first\nsecond", 12, 20), {
    rows: ["first", "second"],
    cursorRow: 1,
    cursorColumn: 6
  });
});

test("macOS clipboard output becomes real multimodal image content", () => {
  const payload = parseMacClipboardOutput(JSON.stringify({
    kind: "image",
    data: Buffer.from("image bytes").toString("base64"),
    mimeType: "image/png"
  }));
  assert.deepEqual(payload, {
    kind: "image",
    image: { type: "image", data: "aW1hZ2UgYnl0ZXM=", mimeType: "image/png" }
  });
});
