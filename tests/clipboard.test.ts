import assert from "node:assert/strict";
import test from "node:test";
import { advanceLegacyShiftEnterKeypress, decodeTerminalKeySequence, deletePromptLine, deletePromptRange, displayPromptValue, isDeletePromptLineKey, isShiftEnterKey, isShiftEnterSequence, lineWordEnd, lineWordStart, movePromptCursorVertically, multilinePromptViewport, promptLineEnd, promptLineStart, promptNextCharacter, promptPreviousCharacter, promptSelectionRange, promptViewport, promptWordEnd, promptWordStart, styleImageMarkers } from "../src/tui/app.js";
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
  assert.equal(isShiftEnterSequence("\x1b[13;2~"), true);
  assert.equal(isShiftEnterSequence("\x1b[27;2;13~"), true);
  assert.deepEqual(advanceLegacyShiftEnterKeypress(undefined, "\x1b[27;2;"), { kind: "pending", suffix: "" });
  assert.deepEqual(advanceLegacyShiftEnterKeypress("", "1"), { kind: "pending", suffix: "1" });
  assert.deepEqual(advanceLegacyShiftEnterKeypress("1", "3"), { kind: "pending", suffix: "13" });
  assert.deepEqual(advanceLegacyShiftEnterKeypress("13", "~"), { kind: "newline" });
  assert.deepEqual(advanceLegacyShiftEnterKeypress("1", "x"), { kind: "replay", text: "1" });
  assert.deepEqual(decodeTerminalKeySequence("\x1b[107;6u"), {
    text: "",
    key: { name: "k", ctrl: true, meta: false, shift: true, sequence: "\x1b[107;6u" }
  });
  assert.deepEqual(decodeTerminalKeySequence("\x1b[27;6;107~"), {
    text: "",
    key: { name: "k", ctrl: true, meta: false, shift: true, sequence: "\x1b[27;6;107~" }
  });
  assert.deepEqual(decodeTerminalKeySequence("\x1b[57350;10u"), {
    text: "",
    key: { name: "left", ctrl: false, meta: true, shift: true, sequence: "\x1b[57350;10u" }
  });
  assert.deepEqual(multilinePromptViewport("first\nsecond", 12, 20), {
    rows: ["first", "second"],
    cursorRow: 1,
    cursorColumn: 6
  });
});

test("vertical arrows move through prompt lines and preserve the intended column", () => {
  const value = "12345\nx\nabcde";
  const up = movePromptCursorVertically(value, value.length, -1);
  assert.deepEqual(up, { cursor: 7, preferredColumn: 5 });
  assert.deepEqual(movePromptCursorVertically(value, up.cursor, -1, up.preferredColumn), {
    cursor: 5,
    preferredColumn: 5
  });
  assert.deepEqual(movePromptCursorVertically(value, 0, -1), { cursor: 0, preferredColumn: 0 });
  assert.deepEqual(movePromptCursorVertically(value, value.length, 1), { cursor: value.length, preferredColumn: 5 });
});

test("standard editor motions handle lines, words, selections, and grapheme clusters", () => {
  const value = "alpha beta\nemoji 👨‍👩‍👧‍👦 done";
  const emojiStart = value.indexOf("👨");
  const emojiEnd = emojiStart + "👨‍👩‍👧‍👦".length;
  assert.equal(promptLineStart(value, value.length), value.indexOf("emoji"));
  assert.equal(promptLineEnd(value, 2), value.indexOf("\n"));
  assert.equal(promptWordStart(value, value.indexOf("beta") + 4), value.indexOf("beta"));
  assert.equal(promptWordEnd(value, 0), "alpha".length);
  assert.equal(promptNextCharacter(value, emojiStart), emojiEnd);
  assert.equal(promptPreviousCharacter(value, emojiEnd), emojiStart);
  assert.deepEqual(promptSelectionRange(3, 8), { start: 3, end: 8 });
  assert.deepEqual(promptSelectionRange(8, 3), { start: 3, end: 8 });
  assert.equal(promptSelectionRange(3, 3), undefined);
});

test("range deletion removes selected images and keeps later markers aligned", () => {
  const value = "a [Image 1]\nb [Image 2]\nc [Image 3]";
  assert.deepEqual(deletePromptRange(value, 0, value.indexOf("c")), {
    value: "c [Image 1]",
    cursor: 0,
    removedImageIndexes: [0, 1]
  });
});

test("Ctrl+Backspace and Ctrl+Delete remove the entire cursor line", () => {
  const value = "first line\n  second word\nthird line";
  const secondLineStart = value.indexOf("\n") + 1;
  const secondLineEnd = value.indexOf("\n", secondLineStart);

  assert.equal(lineWordStart(value, secondLineStart), secondLineStart);
  assert.equal(lineWordStart(value, secondLineStart + 2), secondLineStart);
  assert.equal(lineWordStart(value, secondLineEnd), value.indexOf("word"));
  assert.equal(lineWordEnd(value, secondLineEnd), secondLineEnd);
  assert.equal(lineWordEnd(value, secondLineStart), value.indexOf("second") + "second".length);
  assert.deepEqual(deletePromptLine(value, secondLineStart + 4), {
    value: "first line\nthird line",
    cursor: secondLineStart,
    removedImageIndexes: []
  });
  assert.deepEqual(deletePromptLine("first\nlast", 10), {
    value: "first",
    cursor: 5,
    removedImageIndexes: []
  });
  assert.deepEqual(deletePromptLine("only line", 4), {
    value: "",
    cursor: 0,
    removedImageIndexes: []
  });
  assert.deepEqual(deletePromptLine("first\n\nthird", 6), {
    value: "first\nthird",
    cursor: 6,
    removedImageIndexes: []
  });
  assert.deepEqual(deletePromptLine("\nsecond", 0), {
    value: "second",
    cursor: 0,
    removedImageIndexes: []
  });
  assert.equal(isDeletePromptLineKey({ name: "backspace", ctrl: true }), true);
  assert.equal(isDeletePromptLineKey({ name: "backspace", ctrl: false, sequence: "\x08" }), true);
  assert.equal(isDeletePromptLineKey({ name: "h", ctrl: true }), true);
  assert.equal(isDeletePromptLineKey({ name: "delete", ctrl: true }), true);
  assert.equal(isDeletePromptLineKey({ name: "delete", ctrl: false }), false);
  assert.equal(isDeletePromptLineKey({ name: "backspace", ctrl: false, sequence: "\x7f" }), false);
  assert.equal(isDeletePromptLineKey({ name: "w", ctrl: true }), false);
});

test("deleting a prompt line removes its image attachments and renumbers later markers", () => {
  assert.deepEqual(deletePromptLine("one [Image 1]\ntwo [Image 2]\nthree [Image 3]", 20), {
    value: "one [Image 1]\nthree [Image 2]",
    cursor: 14,
    removedImageIndexes: [1]
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

test("Windows clipboard JSON uses the same bounded text and image parser", () => {
  assert.deepEqual(parseMacClipboardOutput('{"kind":"text","text":"windows\\r\\nclipboard"}'), {
    kind: "text",
    text: "windows\nclipboard"
  });
  assert.deepEqual(parseMacClipboardOutput('{"kind":"image","data":"aGVsbG8=","mimeType":"image/png"}'), {
    kind: "image",
    image: { type: "image", data: "aGVsbG8=", mimeType: "image/png" }
  });
});
