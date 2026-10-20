export function isPosixPath(path: string): boolean {
  return path.startsWith("/");
}

export function getPathSeparator(basePath?: string): string {
  if (basePath && isPosixPath(basePath)) {
    return "/";
  }
  // Detectar por navigator.userAgent si no hay basePath claro
  if (typeof navigator !== "undefined" && !navigator.userAgent.includes("Windows")) {
    return "/";
  }
  return "\\";
}

export function normalizePath(path: string): string {
  if (!path) return "";
  if (isPosixPath(path)) {
    // En Linux / Unix, convertir backslashes accidentales a forward slashes
    return path.replace(/\\+/g, "/").replace(/\/+/g, "/");
  }
  // En Windows, normalizar forward slashes a backslashes
  return path.replace(/\/+/g, "\\").replace(/\\+/g, "\\");
}

export function joinPaths(baseDir: string, ...segments: string[]): string {
  if (!baseDir) return segments.join("");
  const isPosix = isPosixPath(baseDir) || (typeof navigator !== "undefined" && !navigator.userAgent.includes("Windows"));
  const sep = isPosix ? "/" : "\\";

  let result = baseDir.replace(/[/\\]+$/, "");

  for (const segment of segments) {
    if (!segment) continue;
    const cleanSegment = segment.replace(/^[/\\]+/, "").replace(/[/\\]+$/, "");
    if (cleanSegment) {
      result = `${result}${sep}${cleanSegment}`;
    }
  }

  return normalizePath(result);
}

export function splitPath(fullPath: string): { dir: string; filename: string } {
  const norm = normalizePath(fullPath);
  const isPosix = isPosixPath(norm);
  const sep = isPosix ? "/" : "\\";
  const lastIndex = norm.lastIndexOf(sep);

  if (lastIndex === -1) {
    return { dir: "", filename: norm };
  }

  return {
    dir: norm.slice(0, lastIndex),
    filename: norm.slice(lastIndex + 1),
  };
}
