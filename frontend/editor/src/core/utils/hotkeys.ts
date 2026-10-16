export interface HotkeyBinding {
  code: string;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

const CODE_LABEL_MAP: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  IntlBackslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  Tab: "Tab",
  Escape: "Esc",
  Enter: "Enter",
  NumpadEnter: "Num Enter",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadDecimal: "Num .",
  NumpadComma: "Num ,",
  NumpadEqual: "Num =",
};

export const isMacLike = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  const platform = navigator.platform?.toLowerCase() ?? "";
  const userAgent = navigator.userAgent?.toLowerCase() ?? "";
  return (
    /mac|iphone|ipad|ipod/.test(platform) ||
    /mac|iphone|ipad|ipod/.test(userAgent)
  );
};

export const modShortcut = (key: string): string =>
  isMacLike() ? `⌘${key}` : `Ctrl+${key}`;

const isFunctionKey = (code: string): boolean => /^F\d{1,2}$/.test(code);

const getKeyLabel = (code: string): string => {
  if (CODE_LABEL_MAP[code]) {
    return CODE_LABEL_MAP[code];
  }

  if (code.startsWith("Key")) {
    return code.slice(3);
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  if (code.startsWith("Numpad")) {
    const remainder = code.slice(6);
    if (/^[0-9]$/.test(remainder)) {
      return `Num ${remainder}`;
    }
    return `Num ${remainder}`;
  }

  // Match function keys (F1-F12)
  if (isFunctionKey(code)) {
    return code;
  }

  switch (code) {
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    default:
      return code;
  }
};

export const getDisplayParts = (
  binding: HotkeyBinding | null | undefined,
  macLike: boolean,
): string[] => {
  if (!binding) return [];
  const parts: string[] = [];
  if (binding.meta) {
    parts.push(macLike ? "⌘" : "Win");
  }
  if (binding.ctrl) {
    parts.push(macLike ? "⌃" : "Ctrl");
  }
  if (binding.alt) {
    parts.push(macLike ? "⌥" : "Alt");
  }
  if (binding.shift) {
    parts.push(macLike ? "⇧" : "Shift");
  }
  parts.push(getKeyLabel(binding.code));
  return parts;
};
