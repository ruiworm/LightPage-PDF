import { createContext, useContext, useState, type ReactNode } from "react";

const ViewActiveContext = createContext(true);

/** Hidden retained views keep document resources alive but must not handle global input. */
export function useViewActive(): boolean {
  return useContext(ViewActiveContext);
}

export function RetainedView({
  active,
  mount = false,
  children,
}: {
  active: boolean;
  /** Mount a controller that needs to register its view before it can activate. */
  mount?: boolean;
  children: ReactNode;
}) {
  const parentActive = useViewActive();
  const visible = parentActive && active;
  const [visited, setVisited] = useState(active || mount);
  if ((active || mount) && !visited) setVisited(true);
  if (!active && !mount && !visited) return null;

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      style={{
        height: "100%",
        minHeight: 0,
        width: "100%",
        position: active ? "relative" : "absolute",
        inset: active ? undefined : 0,
        visibility: visible ? "visible" : "hidden",
        contentVisibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? undefined : "none",
      }}
    >
      <ViewActiveContext.Provider value={visible}>
        {children}
      </ViewActiveContext.Provider>
    </div>
  );
}
