/** Describes the result of copying a file path to the clipboard. */
export interface CopyFeedback {
  kind: "success" | "error";
  message: string;
}
