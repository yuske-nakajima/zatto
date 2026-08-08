export async function requestSessionChange(
  path: string,
  init: RequestInit,
): Promise<boolean> {
  try {
    return (await fetch(path, init)).ok;
  } catch {
    return false;
  }
}
