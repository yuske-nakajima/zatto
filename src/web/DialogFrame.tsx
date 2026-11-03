import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/** 閉じるアニメーションの animationend が届かない場合に打ち切るまでの時間。 */
const CLOSE_FALLBACK_MS = 400;

const FOCUSABLE_SELECTOR =
  'input:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])';

export type DialogTone = "default" | "danger";

interface DialogFrameProps {
  title: string;
  description: string;
  tone?: DialogTone;
  /** 開いたときにフォーカスする要素。省略すると最初のフォーカス可能な要素。 */
  initialFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  children: (close: (afterClose: () => void) => void) => ReactNode;
}

/**
 * Renders a modal frame that closes on Escape or backdrop click and plays enter and exit animations.
 * @param props - Dialog text, tone, and content renderer that receives the close function
 * @returns Accessible modal dialog
 * @throws Never
 */
export function DialogFrame({
  title,
  description,
  tone = "default",
  initialFocusRef,
  onCancel,
  children,
}: DialogFrameProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const afterCloseRef = useRef<(() => void) | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const target =
      initialFocusRef?.current ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    target?.focus();
  }, [initialFocusRef]);

  useEffect(() => {
    if (!isClosing) return;
    const dialog = dialogRef.current;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      afterCloseRef.current?.();
    };
    const animationName = dialog ? getComputedStyle(dialog).animationName : "";
    // CSS が当たらない環境と prefers-reduced-motion では animationend が来ない。
    if (!animationName || animationName === "none") {
      finish();
      return;
    }
    const handleEnd = (event: AnimationEvent) => {
      if (event.target === dialog) finish();
    };
    dialog?.addEventListener("animationend", handleEnd);
    const timer = window.setTimeout(finish, CLOSE_FALLBACK_MS);
    return () => {
      dialog?.removeEventListener("animationend", handleEnd);
      window.clearTimeout(timer);
    };
  }, [isClosing]);

  function close(afterClose: () => void): void {
    if (afterCloseRef.current) return;
    afterCloseRef.current = afterClose;
    setIsClosing(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close(onCancel);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable =
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="choice-dialog-overlay"
      data-state={isClosing ? "closing" : "open"}
    >
      <button
        className="choice-dialog-backdrop"
        type="button"
        aria-label="Cancel dialog"
        tabIndex={-1}
        onClick={() => close(onCancel)}
      />
      <div
        ref={dialogRef}
        className="choice-dialog"
        data-tone={tone}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {children(close)}
      </div>
    </div>
  );
}
