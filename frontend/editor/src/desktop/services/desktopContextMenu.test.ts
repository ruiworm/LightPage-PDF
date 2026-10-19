import { afterEach, beforeEach, expect, it } from "vitest";
import { installDesktopContextMenu } from "@app/services/desktopContextMenu";

let cleanup: () => void;
beforeEach(() => {
  cleanup = installDesktopContextMenu();
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function contextMenu(target: Element) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

it("suppresses browser commands on the app shell and removes the listener on cleanup", () => {
  expect(contextMenu(document.body).defaultPrevented).toBe(true);
  cleanup();
  expect(contextMenu(document.body).defaultPrevented).toBe(false);
});

it.each(["input", "textarea", "editable"])(
  "preserves native editing commands for %s",
  (kind) => {
    const field = document.createElement(kind === "editable" ? "div" : kind);
    if (kind === "editable") field.setAttribute("contenteditable", "true");
    document.body.append(field);
    expect(contextMenu(field).defaultPrevented).toBe(false);
  },
);

it("allows nested editable content but suppresses a non-editable island", () => {
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  const text = document.createElement("span");
  editor.append(text);
  document.body.append(editor);
  expect(contextMenu(text).defaultPrevented).toBe(false);
  text.setAttribute("contenteditable", "false");
  expect(contextMenu(text).defaultPrevented).toBe(true);
});

it("leaves custom menu handlers running", () => {
  const row = document.createElement("button");
  let opened = false;
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    opened = true;
  });
  document.body.append(row);
  expect(contextMenu(row).defaultPrevented).toBe(true);
  expect(opened).toBe(true);
});
