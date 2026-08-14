import { execFile } from "node:child_process";

const CANCELLED_OUTPUT = "__ZATTO_CANCELLED__";
const FILE_PICKER_SCRIPT = `set cancelToken to "${CANCELLED_OUTPUT}"
try
  set selectedFiles to choose file with prompt "Select HTML files" of type {"public.html"} with multiple selections allowed
  set pathText to ""
  repeat with selectedFile in selectedFiles
    if pathText is not "" then set pathText to pathText & (character id 0)
    set pathText to pathText & POSIX path of selectedFile
  end repeat
  return pathText
on error number -128
  return cancelToken
end try`;
const DIRECTORY_PICKER_SCRIPT = `set cancelToken to "${CANCELLED_OUTPUT}"
try
  set selectedDirectory to choose folder with prompt "Select a folder containing HTML files"
  return POSIX path of selectedDirectory
on error number -128
  return cancelToken
end try`;

export type FilePickerResult =
  | { kind: "selected"; paths: string[] }
  | { kind: "cancelled" };

export type PickFiles = () => Promise<FilePickerResult>;
export type DirectoryPickerResult =
  | { kind: "selected"; path: string }
  | { kind: "cancelled" };
export type PickDirectory = () => Promise<DirectoryPickerResult>;
export type RunCommand = (
  executable: string,
  args: string[],
) => Promise<string>;

export function createNativeFilePicker(
  platform: NodeJS.Platform = process.platform,
  runCommand: RunCommand = runExecutable,
): PickFiles | undefined {
  if (platform !== "darwin") {
    return undefined;
  }

  return async () => {
    const stdout = await runCommand("/usr/bin/osascript", [
      "-e",
      FILE_PICKER_SCRIPT,
    ]);
    const output = stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
    if (output === CANCELLED_OUTPUT) {
      return { kind: "cancelled" };
    }
    return {
      kind: "selected",
      paths: output.split("\0").filter((filePath) => filePath.length > 0),
    };
  };
}

/**
 * Creates a macOS directory picker backed by AppleScript.
 *
 * @param platform - Host platform that controls native picker availability
 * @param runCommand - Command runner used to invoke AppleScript
 * @returns A directory picker on macOS, or undefined on unsupported platforms
 * @throws When AppleScript cannot be executed
 */
export function createNativeDirectoryPicker(
  platform: NodeJS.Platform = process.platform,
  runCommand: RunCommand = runExecutable,
): PickDirectory | undefined {
  if (platform !== "darwin") {
    return undefined;
  }

  return async () => {
    const stdout = await runCommand("/usr/bin/osascript", [
      "-e",
      DIRECTORY_PICKER_SCRIPT,
    ]);
    const output = stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
    if (output === CANCELLED_OUTPUT) {
      return { kind: "cancelled" };
    }
    return { kind: "selected", path: output };
  };
}

function runExecutable(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(
          new Error("ネイティブ選択ダイアログを開けませんでした", {
            cause: error,
          }),
        );
        return;
      }
      resolve(stdout);
    });
  });
}
