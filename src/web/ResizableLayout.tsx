import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  readSidebarWidth,
  SIDEBAR_WIDTH_LARGE_STEP,
  SIDEBAR_WIDTH_STEP,
  storeSidebarWidth,
} from "./sidebar-width.js";

interface ResizableLayoutProps {
  isFilePanelVisible: boolean;
  filePanel: ReactNode;
  viewer: ReactNode;
}

interface SidebarResizeHandleProps {
  width: number;
  onWidthChange: (width: number) => void;
}

type LayoutStyle = CSSProperties & {
  "--sidebar-width": string;
};

export function ResizableLayout({
  isFilePanelVisible,
  filePanel,
  viewer,
}: ResizableLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);

  function updateSidebarWidth(width: number): void {
    const nextWidth = clampSidebarWidth(width);
    setSidebarWidth(nextWidth);
    storeSidebarWidth(nextWidth);
  }

  const style: LayoutStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  };

  return (
    <div
      className={`app-shell${isFilePanelVisible ? "" : " app-shell--panel-hidden"}`}
      style={style}
    >
      {isFilePanelVisible && (
        <>
          {filePanel}
          <SidebarResizeHandle
            width={sidebarWidth}
            onWidthChange={updateSidebarWidth}
          />
        </>
      )}
      {viewer}
    </div>
  );
}

function SidebarResizeHandle({
  width,
  onWidthChange,
}: SidebarResizeHandleProps) {
  const activePointerId = useRef<number | null>(null);

  function handlePointerDown(event: PointerEvent<HTMLHRElement>): void {
    event.preventDefault();
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onWidthChange(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLHRElement>): void {
    if (activePointerId.current === event.pointerId) {
      onWidthChange(event.clientX);
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLHRElement>): void {
    if (activePointerId.current !== event.pointerId) {
      return;
    }
    activePointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLHRElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? SIDEBAR_WIDTH_LARGE_STEP : SIDEBAR_WIDTH_STEP;
    onWidthChange(width + (event.key === "ArrowRight" ? step : -step));
  }

  return (
    <hr
      className="sidebar-resize-handle"
      data-status-description="Resize the file panel."
      aria-label="Resize file panel"
      aria-orientation="vertical"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onDoubleClick={() => onWidthChange(DEFAULT_SIDEBAR_WIDTH)}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={() => {
        activePointerId.current = null;
      }}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    />
  );
}
