/** Native builds contribute caption controls; browser navigation needs none. */
export function WindowControls(_props: {
  placement?: "navigation" | "caption";
}) {
  return null;
}
