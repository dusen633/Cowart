import { execFile } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function resolveDocumentsDir({
  systemPlatform = process.platform, userHome = homedir(), env = process.env, run = execFileAsync,
} = {}) {
  const paths = systemPlatform === "win32" ? win32 : { isAbsolute, join, resolve };
  // Tests redirect only the global workspace, never the explicit project route.
  if (env.COWART_DOCUMENTS_DIR) {
    if (!paths.isAbsolute(env.COWART_DOCUMENTS_DIR)) throw new Error("COWART_DOCUMENTS_DIR must be an absolute path.");
    return paths.resolve(env.COWART_DOCUMENTS_DIR);
  }
  if (systemPlatform !== "win32") return paths.join(userHome, "Documents");

  // The shell's Documents folder can be redirected (for example to OneDrive).
  // Do not guess USERPROFILE/Documents when the system lookup fails.
  try {
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", [
      "$ErrorActionPreference = 'Stop'",
      "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
      "[Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments, [Environment+SpecialFolderOption]::DoNotVerify)",
    ].join("; ")], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    const documentsDir = stdout.trim();
    if (!documentsDir || !win32.isAbsolute(documentsDir)) throw new Error("Documents folder is unavailable.");
    return win32.normalize(documentsDir);
  } catch (error) {
    throw new Error("无法读取系统文稿文件夹，请检查 Windows 文稿目录设置后重新打开 Cowart。", { cause: error });
  }
}

function absolutePath(value) {
  const input = typeof value === "string" ? value.trim() : "";
  const expanded = input === "~" ? homedir() : input.startsWith("~/") ? join(homedir(), input.slice(2)) : input;
  if (!expanded || !isAbsolute(expanded)) throw new Error("请选择项目文件夹的绝对路径。");
  return resolve(expanded);
}

async function canonicalPath(value) {
  try {
    return await realpath(value);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = dirname(value);
    if (parent === value) return value;
    return join(await canonicalPath(parent), basename(value));
  }
}

async function assertOutsidePluginCache(value) {
  const cache = await canonicalPath(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "plugins", "cache"));
  const rel = relative(cache, value);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) {
    throw new Error("请选择自己的项目文件夹，不能使用插件缓存目录。");
  }
}

// Only an empty launch uses Documents/Cowart. Explicit project calls keep their
// own target and must not depend on Documents being available or writable.
export async function resolveLauncherTarget(input = {}) {
  if (!input.projectDir?.trim() && !input.canvasDir?.trim()) {
    const projectDir = await canonicalPath(join(await resolveDocumentsDir(), "Cowart"));
    const canvasDir = await canonicalPath(join(projectDir, "canvas"));
    await assertOutsidePluginCache(projectDir);
    await assertOutsidePluginCache(canvasDir);
    await mkdir(canvasDir, { recursive: true });
    return { projectDir, canvasDir };
  }
  const projectPath = input.projectDir?.trim()
    ? absolutePath(input.projectDir)
    : dirname(absolutePath(input.canvasDir));
  let projectDir;
  try {
    projectDir = await realpath(projectPath);
    if (!(await stat(projectDir)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error("找不到这个项目文件夹，请检查路径后重试。");
  }
  const canvasDir = await canonicalPath(input.canvasDir?.trim() ? absolutePath(input.canvasDir) : join(projectDir, "canvas"));
  await assertOutsidePluginCache(projectDir);
  await assertOutsidePluginCache(canvasDir);
  return { projectDir, canvasDir };
}
