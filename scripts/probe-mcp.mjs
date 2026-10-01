import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transportEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string"),
);
const serverRoot = path.resolve(optionValue("--server-root") || process.cwd());
const probeUserData = await realpath(await mkdtemp(path.join(tmpdir(), "cowart-probe-documents-")));
const maximumStartupMs = Number(optionValue("--max-startup-ms") || 0);
transportEnvironment.COWART_PLUGIN_ROOT = serverRoot;
transportEnvironment.COWART_DOCUMENTS_DIR = probeUserData;
const transport = new StdioClientTransport({
  command: "node",
  args: ["./scripts/start-mcp.mjs"],
  cwd: serverRoot,
  env: transportEnvironment,
});

const client = new Client({
  name: "cowart-probe",
  version: "0.1.0",
});
const toolsOnly = process.argv.includes("--tools-only");

const startupStartedAt = performance.now();
await client.connect(transport);

let downloadedProbePath = null;
let downloadedProbeDirectory = null;
let projectDir = null;

function isCanvasDirectory(value) {
  const canvasDir = String(value || "");
  return (
    path.basename(path.normalize(canvasDir)) === "canvas" ||
    path.win32.basename(path.win32.normalize(canvasDir)) === "canvas"
  );
}

try {
  probe: {
  const tools = await client.listTools();
  const startupMs = performance.now() - startupStartedAt;
  if (maximumStartupMs > 0 && startupMs > maximumStartupMs) {
    throw new Error(
      `Cowart MCP tool discovery took ${Math.round(startupMs)} ms; expected at most ${maximumStartupMs} ms.`,
    );
  }
  const toolNames = tools.tools.map((tool) => tool.name);
  const requiredTools = [
    "render_cowart_canvas_widget",
    "get_cowart_canvas_state",
    "save_cowart_canvas_state",
    "save_cowart_selection_state",
    "save_cowart_view_state",
    "save_cowart_reference_image",
    "read_cowart_page_asset",
    "download_cowart_file",
    "copy_cowart_image_to_clipboard",
    "get_cowart_selection",
    "insert_cowart_image",
    "insert_cowart_html_draft",
    "track_cowart_analytics_event",
  ];

  for (const toolName of requiredTools) {
    if (!toolNames.includes(toolName)) {
      throw new Error(`${toolName} not found. Tools: ${toolNames.join(", ")}`);
    }
  }

  const analyticsTool = tools.tools.find((tool) => tool.name === "track_cowart_analytics_event");
  if (JSON.stringify(analyticsTool?._meta?.ui?.visibility) !== JSON.stringify(["app"])) {
    throw new Error("Cowart analytics tool should only be visible to the widget app.");
  }
  if (analyticsTool?.annotations?.openWorldHint !== true) {
    throw new Error("Cowart analytics tool should declare its external GA4 side effect.");
  }
  if (!/PostHog/.test(analyticsTool?.description || "")) {
    throw new Error("Cowart analytics tool should document dual GA4 and PostHog delivery.");
  }
  if (!Object.hasOwn(analyticsTool?.inputSchema?.properties || {}, "eventId")) {
    throw new Error("Cowart analytics tool should accept a dedupe eventId shared with PostHog.");
  }
  const clipboardTool = tools.tools.find((tool) => tool.name === "copy_cowart_image_to_clipboard");
  if (JSON.stringify(clipboardTool?._meta?.ui?.visibility) !== JSON.stringify(["app"])) {
    throw new Error("Cowart clipboard tool should only be visible to the widget app.");
  }

  const globalLaunch = await client.callTool({ name: "render_cowart_canvas_widget", arguments: {} });
  if (globalLaunch.structuredContent?.view !== "canvas" ||
      globalLaunch.structuredContent?.canvasDir !== path.join(probeUserData, "Cowart", "canvas") ||
      !Object.values(globalLaunch.structuredContent?.canvasState?.snapshot?.store || {}).some((record) => record.typeName === "page")) {
    throw new Error("A global launch must open Documents/Cowart/canvas directly with an initial page.");
  }
  projectDir = await realpath(await mkdtemp(path.join(tmpdir(), "cowart-widget-probe-")));
  const renderResult = await client.callTool({
    name: "render_cowart_canvas_widget",
    arguments: {
      projectDir,
      title: "Probe Cowart",
    },
  });
  if (renderResult._meta?.["openai/outputTemplate"] !== "ui://widget/cowart/canvas.html") {
    throw new Error("Cowart render tool result did not include the expected outputTemplate.");
  }
  if (renderResult.structuredContent?.preferredDisplayMode !== "fullscreen") {
    throw new Error("Cowart render tool did not default to fullscreen display mode.");
  }
  if (renderResult.structuredContent?.projectDir !== projectDir) {
    throw new Error("Cowart render tool did not preserve the requested projectDir.");
  }
  if (toolsOnly) {
    console.log(
      `OK: Cowart MCP tools are available before the widget resource is built (${Math.round(startupMs)} ms).`,
    );
    break probe;
  }

  const stateResult = await client.callTool({
    name: "get_cowart_canvas_state",
    arguments: {
      projectDir,
    },
  });
  if (stateResult.structuredContent?.storage !== "empty") {
    throw new Error("A fresh Cowart project should report empty storage.");
  }
  if (!isCanvasDirectory(stateResult.structuredContent?.canvasDir)) {
    throw new Error("Cowart canvas state did not report a project-local canvas directory.");
  }
  if ((stateResult.structuredContent?.hydratedAssets || []).length !== 0) {
    throw new Error("Cowart canvas state should not hydrate image assets by default.");
  }

  const probePageAssetDir = path.join(projectDir, "canvas", "pages", "probe-page", "assets");
  await mkdir(probePageAssetDir, { recursive: true });
  await writeFile(
    path.join(probePageAssetDir, "tiny.png"),
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"),
  );
  await writeFile(path.join(probePageAssetDir, "draft.html"), "<!doctype html><html><body>draft</body></html>");
  const pageAssetResult = await client.callTool({
    name: "read_cowart_page_asset",
    arguments: {
      projectDir,
      assetUrl: "/page-assets/probe-page/tiny.png",
    },
  });
  if (pageAssetResult.structuredContent?.mimeType !== "image/png" || !pageAssetResult.structuredContent?.dataBase64) {
    throw new Error("Cowart page asset tool did not return the expected png payload.");
  }
  const htmlAssetResult = await client.callTool({
    name: "read_cowart_page_asset",
    arguments: {
      projectDir,
      assetUrl: "/page-assets/probe-page/draft.html",
    },
  });
  if (htmlAssetResult.structuredContent?.mimeType !== "text/html" || !htmlAssetResult.structuredContent?.dataBase64) {
    throw new Error("Cowart page asset tool did not return the expected html payload.");
  }

  const clipboardResult = await client.callTool({
    name: "copy_cowart_image_to_clipboard",
    arguments: {
      projectDir,
      dataBase64: pageAssetResult.structuredContent.dataBase64,
      mimeType: "image/png",
      dryRun: true,
    },
  });
  if (
    clipboardResult.structuredContent?.dryRun !== true ||
    clipboardResult.structuredContent?.width !== 1 ||
    clipboardResult.structuredContent?.height !== 1
  ) {
    throw new Error("Cowart clipboard tool did not validate the expected PNG payload.");
  }

  const downloadResult = await client.callTool({
    name: "download_cowart_file",
    arguments: {
      projectDir,
      assetUrl: "/page-assets/probe-page/tiny.png",
      fileName: `cowart-download-probe-${process.pid}.png`,
    },
  });
  downloadedProbePath = downloadResult.structuredContent?.filePath;
  if (!downloadedProbePath || !(await readFile(downloadedProbePath)).length) {
    throw new Error("Cowart download tool did not write the expected file into Downloads.");
  }

  const folderDownloadResult = await client.callTool({
    name: "download_cowart_file",
    arguments: {
      projectDir,
      dataUrl: "data:text/html;charset=utf-8,%3C!doctype%20html%3E%3Ctitle%3Eprobe%3C%2Ftitle%3E",
      directoryName: `Cowart Slides Probe ${process.pid}`,
      subdirectory: "pages",
      fileName: "page-01.html",
      mimeType: "text/html",
      overwrite: true,
      uniqueDirectory: true,
    },
  });
  downloadedProbeDirectory = folderDownloadResult.structuredContent?.directoryPath;
  const folderDownloadPath = folderDownloadResult.structuredContent?.filePath;
  if (
    !downloadedProbeDirectory ||
    path.basename(path.dirname(folderDownloadPath || "")) !== "pages" ||
    !(await readFile(folderDownloadPath, "utf8")).includes("<title>probe</title>")
  ) {
    throw new Error("Cowart download tool did not create the expected Slides export folder structure.");
  }

  const resource = await client.readResource({
    uri: "ui://widget/cowart/canvas.html",
  });
  const resourceMeta = resource.contents?.[0]?._meta || {};
  const widgetCsp = resourceMeta["openai/widgetCSP"] || {};
  const connectDomains = widgetCsp.connect_domains || [];
  const requiredAnalyticsConnectDomains = [
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://analytics.google.com",
    "https://www.googletagmanager.com",
    "https://stats.g.doubleclick.net",
    "https://www.doubleclick.net",
    "https://pagead2.googlesyndication.com",
    "https://www.googleadservices.com",
    "https://www.google.com",
    "https://www.google.cn",
    "https://www.gstatic.com",
    "https://www.googleapis.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://*.googletagmanager.com",
    "https://*.doubleclick.net",
    "https://*.googlesyndication.com",
    "https://*.googleadservices.com",
    "https://*.google.com",
    "https://*.google.cn",
    "https://*.gstatic.com",
    "https://*.googleapis.com",
    "https://*.merchant-center-analytics.goog",
  ];
  for (const domain of requiredAnalyticsConnectDomains) {
    if (!connectDomains.includes(domain)) {
      throw new Error(`Cowart widget CSP should allow Google Analytics connections to ${domain}.`);
    }
  }
  const resourceDomains = widgetCsp.resource_domains || [];
  if (!resourceDomains.includes("data:") || !resourceDomains.includes("blob:")) {
    throw new Error(`Cowart widget CSP should allow local data/blob resources. Found: ${resourceDomains.join(", ")}`);
  }
  const requiredAnalyticsResourceDomains = requiredAnalyticsConnectDomains;
  for (const domain of requiredAnalyticsResourceDomains) {
    if (!resourceDomains.includes(domain)) {
      throw new Error(`Cowart widget CSP should allow Google Analytics resources from ${domain}.`);
    }
  }
  const frameDomains = widgetCsp.frame_domains || [];
  if (!frameDomains.includes("data:") || !frameDomains.includes("blob:")) {
    throw new Error(`Cowart widget CSP should allow local data/blob iframes for HTML drafts. Found: ${frameDomains.join(", ")}`);
  }

  const widgetHtml = resource.contents?.[0]?.text || "";
  if (!widgetHtml.includes("window.cowartMcp") || !widgetHtml.includes("Cowart Canvas")) {
    throw new Error("Cowart widget HTML does not include the expected bridge and app shell.");
  }
  if (/<script\b[^>]*\btype="module"/i.test(widgetHtml)) {
    throw new Error("Cowart widget HTML should use classic inline scripts for host compatibility.");
  }
  const shellMarkup = widgetHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  if (/<iframe\b/i.test(shellMarkup) || /<script\b[^>]+\bsrc=/i.test(shellMarkup) || /<link\b[^>]+\bhref=/i.test(shellMarkup)) {
    throw new Error("Cowart widget HTML should be direct static markup without iframe or external asset tags.");
  }

  console.log(
    `OK: Cowart MCP tools and native widget resource are available (${Math.round(startupMs)} ms startup).`,
  );
  }
} finally {
  if (downloadedProbePath) {
    await unlink(downloadedProbePath).catch(() => undefined);
  }
  if (downloadedProbeDirectory) {
    await rm(downloadedProbeDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
  }
  await client.close();
  await rm(probeUserData, { recursive: true, force: true });
}

function optionValue(name) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex !== -1) return process.argv[exactIndex + 1] || "";
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : "";
}
