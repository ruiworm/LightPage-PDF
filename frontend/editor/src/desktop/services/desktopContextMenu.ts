/** Keeps editable-field menus and in-app menus while suppressing WebView navigation commands. */
export function installDesktopContextMenu(): () => void {
  const handleContextMenu = (event: MouseEvent) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const field = event.target.closest("input, textarea, [contenteditable]");
    if (
      field &&
      (field.matches("input, textarea") ||
        field.getAttribute("contenteditable") !== "false")
    )
      return;
    event.preventDefault();
  };
  window.addEventListener("contextmenu", handleContextMenu);
  return () => window.removeEventListener("contextmenu", handleContextMenu);
}
