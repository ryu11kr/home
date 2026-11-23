/** UXPWA 홈 — 새 배포 알림·서비스워커 동기화 */

const APP_VERSION_SEEN_KEY = "home-app-version-seen-build";
const APP_UPDATE_COMPLETE_KEY = "home-show-update-complete";

let registration = null;
let reloadOnControllerChange = false;
let appVersionPollId = null;
let appUpdateCompleteDialogBound = false;
let registeredTargetBuild = 0;
let applyingUpdate = false;
const watchedRegistrations = new WeakSet();
/** @type {{ cachePrefix?: string } | null} */
let pwaConfig = null;

const embeddedDeployAtLoad = (() => {
  const v = window.HOME_DEPLOY_VERSION;
  if (!v || typeof v !== "object") return null;
  return {
    build: v.build,
    commitSha: v.commitSha || null,
    updatedAt: v.updatedAt || null,
  };
})();

function cachePrefix() {
  return pwaConfig?.cachePrefix || "uxpwa-home";
}

async function loadPwaConfig() {
  try {
    const res = await fetch("./pwa.config.json", { cache: "no-store" });
    if (res.ok) pwaConfig = await res.json();
  } catch {
    /* ignore */
  }
}

function markAppUpdateCompletePending() {
  try {
    sessionStorage.setItem(APP_UPDATE_COMPLETE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function maybeShowAppUpdateCompleteDialog() {
  try {
    if (sessionStorage.getItem(APP_UPDATE_COMPLETE_KEY) !== "1") return;
    sessionStorage.removeItem(APP_UPDATE_COMPLETE_KEY);
  } catch {
    return;
  }
  const dialog = document.querySelector("#app-update-complete-dialog");
  const okBtn = document.querySelector("#app-update-complete-ok");
  if (!dialog || !okBtn) return;

  if (!appUpdateCompleteDialogBound) {
    appUpdateCompleteDialogBound = true;
    okBtn.addEventListener("click", () => {
      if (dialog.open) dialog.close();
    });
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      dialog.close();
    });
  }

  const banner = document.querySelector("#app-update-banner");
  if (banner) banner.hidden = true;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    okBtn.focus();
  }
}

async function fetchAppVersionMeta() {
  const paths = isLocalDevHost()
    ? ["./version.json"]
    : ["/api/app-version", "./version.json"];
  for (const path of paths) {
    try {
      const response = await fetch(`${path}?t=${Date.now()}`, {
        cache: isLocalDevHost() ? "reload" : "no-store",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.build != null) return data;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function readSeenAppVersion() {
  const raw = localStorage.getItem(APP_VERSION_SEEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore */
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? { build: n } : null;
}

function writeSeenAppVersion(meta) {
  if (!meta?.build) return;
  localStorage.setItem(
    APP_VERSION_SEEN_KEY,
    JSON.stringify({
      build: meta.build,
      commitSha: meta.commitSha || null,
      updatedAt: meta.updatedAt || null,
    })
  );
}

function getLoadedPageDeployVersion() {
  return embeddedDeployAtLoad || getPageDeployVersionFromWindow();
}

function getPageDeployVersionFromWindow() {
  const v = window.HOME_DEPLOY_VERSION;
  if (!v || typeof v !== "object") return null;
  return v;
}

async function hydratePageDeployVersionFromNetwork() {
  if (!isLocalDevHost()) return;
  try {
    const res = await fetch(`./deploy-version.js?h=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return;
    const text = await res.text();
    const eq = text.indexOf("=");
    if (eq < 0) return;
    let payload = text.slice(eq + 1).trim();
    if (payload.endsWith(";")) payload = payload.slice(0, -1);
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && parsed.build != null) {
      window.HOME_DEPLOY_VERSION = parsed;
    }
  } catch {
    /* ignore */
  }
}

function pageBundleIsStale(serverMeta) {
  if (!serverMeta?.build) return false;
  const embedded = getLoadedPageDeployVersion();
  if (!embedded) return false;
  if (serverMeta.commitSha && embedded.commitSha) {
    return serverMeta.commitSha !== embedded.commitSha;
  }
  if (serverMeta.updatedAt && embedded.updatedAt) {
    return serverMeta.updatedAt !== embedded.updatedAt;
  }
  return Number(serverMeta.build) !== Number(embedded.build);
}

/** 페이지 최초 로드 시 박힌 deploy-version 과 서버가 같은지 (hydrate 전 기준) */
function pageAtLoadIsCurrent(serverMeta) {
  const embedded = embeddedDeployAtLoad;
  if (!embedded?.build || !serverMeta?.build) return false;
  return Number(embedded.build) === Number(serverMeta.build);
}

/** 탭에 로드된 빌드·seen 기준으로 배너 필요 여부 (버스첩과 동일) */
function needsUpdateBanner(meta) {
  if (!meta?.build) return false;

  const embeddedBuild = embeddedDeployAtLoad?.build;
  if (embeddedBuild != null && Number(meta.build) > Number(embeddedBuild)) {
    return true;
  }

  const seen = readSeenAppVersion();
  if (seen && serverVersionIsNewer(meta, seen)) {
    return true;
  }

  return false;
}

function isLocalDevHost() {
  const { hostname, protocol } = window.location;
  return protocol.startsWith("http") && (hostname === "localhost" || hostname === "127.0.0.1");
}

/** @param {Record<string, unknown> | null | undefined} meta @param {Record<string, unknown> | null | undefined} seen */
function serverVersionIsNewer(meta, seen) {
  if (!meta?.build || !seen) return false;
  if (meta.commitSha && seen.commitSha) return meta.commitSha !== seen.commitSha;
  if (meta.updatedAt && seen.updatedAt) return meta.updatedAt !== seen.updatedAt;
  return Number(meta.build) !== Number(seen.build);
}

function pageBundleIsCurrent(serverMeta) {
  if (!serverMeta?.build) return false;
  const embedded = getLoadedPageDeployVersion();
  if (!embedded?.build) return false;
  if (serverMeta.commitSha && embedded.commitSha && serverMeta.commitSha !== embedded.commitSha) {
    return false;
  }
  if (serverMeta.updatedAt && embedded.updatedAt && serverMeta.updatedAt !== embedded.updatedAt) {
    return false;
  }
  return Number(serverMeta.build) === Number(embedded.build);
}

function shouldPromptAppUpdate(serverMeta) {
  if (!serverMeta?.build) return false;
  if (needsUpdateBanner(serverMeta)) return true;

  if (pageAtLoadIsCurrent(serverMeta)) {
    return false;
  }

  if (isLocalDevHost()) {
    return false;
  }

  const controllerBuild = getControllerBuild();
  if (controllerBuild && Number(serverMeta.build) > controllerBuild) return true;

  if (pageBundleIsStale(serverMeta)) return true;
  return false;
}

function showAppUpdateBanner(meta) {
  if (applyingUpdate) return;
  const banner = document.querySelector("#app-update-banner");
  if (!banner) return;
  banner.hidden = false;
  banner.removeAttribute("hidden");
  if (meta?.build != null) banner.dataset.pendingBuild = String(meta.build);
  if (meta?.commitSha) banner.dataset.pendingSha = meta.commitSha;
  syncServiceWorker({ quiet: true }).catch(() => {});
}

function acknowledgeCurrentVersion(meta) {
  if (!meta?.build) return;
  writeSeenAppVersion(meta);
}

async function bootstrapAppVersionCheck() {
  const meta = await fetchAppVersionMeta();
  if (!meta?.build) return;

  if (needsUpdateBanner(meta)) {
    showAppUpdateBanner(meta);
    return;
  }

  acknowledgeCurrentVersion(meta);
}

async function checkAppVersionUpdate() {
  if (applyingUpdate) return;

  const meta = await fetchAppVersionMeta();
  if (!meta?.build) return;

  if (needsUpdateBanner(meta)) {
    showAppUpdateBanner(meta);
    return;
  }

  acknowledgeCurrentVersion(meta);
}

async function purgeInstalledAppCaches() {
  if (!("caches" in window)) return;
  const prefix = cachePrefix();
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key === prefix || key.startsWith(`${prefix}-`)).map((key) => caches.delete(key))
    );
  } catch (err) {
    console.error(err);
  }
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: "PURGE_CACHES" });
  } catch {
    /* ignore */
  }
}

async function applyAppUpdate() {
  if (applyingUpdate) return;
  applyingUpdate = true;

  const banner = document.querySelector("#app-update-banner");
  const pending = banner?.dataset.pendingBuild;
  const pendingSha = banner?.dataset.pendingSha;
  if (banner) {
    banner.hidden = true;
    banner.setAttribute("hidden", "");
  }

  await purgeInstalledAppCaches();

  const finish = async () => {
    try {
      const meta = await fetchAppVersionMeta();
      const buildNum = meta?.build ?? (pending ? Number(pending) : 0);
      acknowledgeCurrentVersion(
        meta || {
          build: buildNum,
          commitSha: pendingSha || null,
          updatedAt: null,
        }
      );

      if (isLocalDevHost() && "serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        registration = null;
        registeredTargetBuild = 0;
      }

      markAppUpdateCompletePending();
      const url = new URL(location.href);
      url.search = "";
      url.hash = "";
      if (buildNum) url.searchParams.set("v", String(buildNum));
      location.replace(url.href);
    } catch {
      applyingUpdate = false;
    }
  };

  if (registration) {
    try {
      await registration.update();
    } catch {
      /* ignore */
    }
  }
  if (registration?.waiting) {
    reloadOnControllerChange = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(() => finish(), 400);
    return;
  }
  await finish();
}

function getControllerBuild() {
  const script = navigator.serviceWorker.controller?.scriptURL;
  if (!script) return 0;
  const build = new URL(script, location.href).searchParams.get("build");
  return build ? Number(build) : 0;
}

async function fetchVersionInfo() {
  const response = await fetch(`./version.json?check=${Date.now()}`, {
    cache: isLocalDevHost() ? "reload" : "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
  });
  if (!response.ok) return null;
  return response.json();
}

function watchUpdates(reg) {
  if (watchedRegistrations.has(reg)) return;
  watchedRegistrations.add(reg);

  if (reg.waiting && navigator.serviceWorker.controller) {
    fetchVersionInfo().then((info) => {
      if (info && shouldPromptAppUpdate(info)) showAppUpdateBanner(info);
    });
  }

  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        syncServiceWorker().catch(() => {});
      }
    });
  });
}

async function syncServiceWorker(options = {}) {
  const quiet = options.quiet === true;
  const versionInfo = await fetchVersionInfo();
  const serverBuild = versionInfo?.build ?? 0;
  const controllerBuild = getControllerBuild();

  if (!quiet && versionInfo && shouldPromptAppUpdate(versionInfo)) {
    showAppUpdateBanner(versionInfo);
  }

  if (!versionInfo?.build) return;

  const swUrl = `./sw.js?build=${serverBuild}`;
  const shouldRegister =
    !registration || (serverBuild > controllerBuild && serverBuild > registeredTargetBuild);

  if (shouldRegister) {
    registration = await navigator.serviceWorker.register(swUrl, { scope: "./" });
    registeredTargetBuild = serverBuild;
    watchUpdates(registration);
  }

  await registration?.update();
  if (registration) await navigator.serviceWorker.ready;
}

function bindAppUpdateUi() {
  document.querySelector("#app-update-apply")?.addEventListener("click", () => {
    applyAppUpdate();
  });
  maybeShowAppUpdateCompleteDialog();
  bootstrapAppVersionCheck().catch(() => {});
  if (appVersionPollId) clearInterval(appVersionPollId);
  const pollMs = isLocalDevHost() ? 3_000 : 20_000;
  appVersionPollId = window.setInterval(() => {
    checkAppVersionUpdate().catch(() => {});
    syncServiceWorker().catch(() => {});
  }, pollMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkAppVersionUpdate().catch(() => {});
      syncServiceWorker().catch(() => {});
    }
  });
}

export async function initHomePwaUpdate() {
  await loadPwaConfig();
  bindAppUpdateUi();

  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadOnControllerChange) location.reload();
  });
  try {
    await syncServiceWorker();
  } catch {
    /* serve·file:// 등에서 SW 등록 실패해도 배너·폴링은 유지 */
  }
}