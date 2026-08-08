import {
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useState,
} from "react";

interface StatusBarFrameProps {
  children: ReactNode;
}

const DEFAULT_DESCRIPTION = "";

/**
 * 操作要素の文脈説明とアプリケーション本体を上下に配置する。
 *
 * @param props - ステータスバーの対象にするアプリケーション本体
 * @returns 文脈説明を追跡するアプリケーションフレーム
 */
export function StatusBarFrame({ children }: StatusBarFrameProps) {
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);

  function handlePointerOver(event: PointerEvent<HTMLElement>): void {
    setDescription(readDescription(event.target));
  }

  function handlePointerOut(event: PointerEvent<HTMLElement>): void {
    setDescription(readDescription(event.relatedTarget));
  }

  function handleFocus(event: FocusEvent<HTMLElement>): void {
    setDescription(readDescription(event.target));
  }

  function handleBlur(event: FocusEvent<HTMLElement>): void {
    setDescription(readDescription(event.relatedTarget));
  }

  return (
    <main
      className="app-frame"
      onBlur={handleBlur}
      onFocus={handleFocus}
      onPointerOut={handlePointerOut}
      onPointerOver={handlePointerOver}
    >
      {children}
      <section className="status-bar" aria-label="Action descriptions">
        <span className="status-bar-left" aria-hidden="true" />
        <span className="status-bar-description">
          <span key={description}>{description}</span>
        </span>
      </section>
    </main>
  );
}

function readDescription(target: EventTarget | null): string {
  if (!(target instanceof Element)) return DEFAULT_DESCRIPTION;
  return (
    target.closest<HTMLElement>("[data-status-description]")?.dataset
      .statusDescription ?? DEFAULT_DESCRIPTION
  );
}
