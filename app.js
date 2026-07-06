const SERVICE_UUID = "7d2f6b62-8b7a-4e57-93d9-2c2f1a6b9001";
const COMMAND_UUID = "7d2f6b62-8b7a-4e57-93d9-2c2f1a6b9002";
const STATUS_UUID = "7d2f6b62-8b7a-4e57-93d9-2c2f1a6b9003";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "esp32-p4-web-control:v1";
const GATT_OPERATION_TIMEOUT_MS = 4000;
const SUPPORTED_PROTOCOL_VERSION = 1;
const MACRO_EXPORT_FORMAT = "esp32-p4-web-control-macro";
const MACRO_EXPORT_VERSION = 1;
const bootedAt = performance.now();

const state = {
  device: null,
  server: null,
  commandChar: null,
  statusChar: null,
  connected: false,
  notificationsActive: false,
  demo: false,
  recording: false,
  showcaseRunning: false,
  selfTestRunning: false,
  emergencyRunning: false,
  safetyToken: 0,
  autoRefresh: true,
  autoReconnect: true,
  wakeLockEnabled: false,
  wakeLockActive: false,
  wakeLockSentinel: null,
  lastWakeLockError: null,
  pollTimer: 0,
  reconnectTimer: 0,
  reconnectAttempts: 0,
  manualDisconnect: false,
  notificationReadPending: false,
  gattQueue: Promise.resolve(),
  pendingGattOperations: 0,
  macro: [],
  telemetry: [],
  logs: [],
  lastSelfTest: null,
  lastConnectionError: null,
  lastReconnectAt: null,
  lastDisconnectAt: null,
  lastGattError: null,
  lastProtocolWarning: null,
  lastCommandAt: 0,
  lastStatusAt: 0,
  lastStatusOk: true,
  lastChatSeq: 0,
  status: {
    led: false,
    rgb: { r: 0, g: 0, b: 0 },
    buzzer: false,
    servo: 90,
    distanceCm: null,
    hcsr04Valid: false,
    mpu6050: null,
    ir: null,
    temperature: null,
    humidity: null,
    dhtStatus: "not read",
    dhtGpio: null,
    protocol: null,
    device: null,
    bleTransport: null,
    bleController: null,
    bleReady: null,
    bleConnected: null,
    uptimeMs: null,
    chat: null,
  },
};

const els = {
  supportChip: $("supportChip"),
  connectionChip: $("connectionChip"),
  connectBtn: $("connectBtn"),
  compatBtn: $("compatBtn"),
  disconnectBtn: $("disconnectBtn"),
  demoBtn: $("demoBtn"),
  emergencyBtn: $("emergencyBtn"),
  refreshBtn: $("refreshBtn"),
  selfTestBtn: $("selfTestBtn"),
  autoRefreshToggle: $("autoRefreshToggle"),
  autoReconnectToggle: $("autoReconnectToggle"),
  wakeLockToggle: $("wakeLockToggle"),
  deviceName: $("deviceName"),
  protocolText: $("protocolText"),
  scanModeText: $("scanModeText"),
  syncModeText: $("syncModeText"),
  freshnessText: $("freshnessText"),
  uptimeText: $("uptimeText"),
  latencyText: $("latencyText"),
  ledDot: $("ledDot"),
  ledState: $("ledState"),
  buzzerState: $("buzzerState"),
  servoState: $("servoState"),
  servoRange: $("servoRange"),
  servoOutput: $("servoOutput"),
  sensorState: $("sensorState"),
  distanceText: $("distanceText"),
  irText: $("irText"),
  mpuText: $("mpuText"),
  telemetryChip: $("telemetryChip"),
  exportTelemetryBtn: $("exportTelemetryBtn"),
  temperatureText: $("temperatureText"),
  humidityText: $("humidityText"),
  telemetryCanvas: $("telemetryCanvas"),
  commandForm: $("commandForm"),
  commandInput: $("commandInput"),
  commandSendBtn: $("commandSendBtn"),
  chatForm: $("chatForm"),
  chatInput: $("chatInput"),
  chatSendBtn: $("chatSendBtn"),
  chatReply: $("chatReply"),
  logList: $("logList"),
  diagnosticsBtn: $("diagnosticsBtn"),
  recordBtn: $("recordBtn"),
  playMacroBtn: $("playMacroBtn"),
  showcaseBtn: $("showcaseBtn"),
  exportMacroBtn: $("exportMacroBtn"),
  importMacroBtn: $("importMacroBtn"),
  macroImportInput: $("macroImportInput"),
  clearMacroBtn: $("clearMacroBtn"),
  macroCount: $("macroCount"),
  macroList: $("macroList"),
};

function safeLoadStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function safeSaveStorage(next) {
  try {
    const current = safeLoadStorage();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...next }));
  } catch {
    log("warn", "本地偏好保存失败，浏览器可能禁用了 localStorage。");
  }
}

function sanitizeCommand(command) {
  if (!command || typeof command.cmd !== "string") {
    return null;
  }
  if (command.cmd === "led") {
    if (typeof command.value === "boolean" || command.value === "toggle") {
      return { cmd: "led", value: command.value };
    }
    return null;
  }
  if (command.cmd === "rgb") {
    if (typeof command.color === "string") {
      const color = command.color.toLowerCase();
      if (["off", "black", "red", "green", "blue", "yellow", "cyan", "magenta", "white"].includes(color)) {
        return { cmd: "rgb", color };
      }
      return null;
    }
    const r = Number(command.r);
    const g = Number(command.g);
    const b = Number(command.b);
    if ([r, g, b].every((value) => Number.isFinite(value) && value >= 0 && value <= 255)) {
      return { cmd: "rgb", r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    }
    return null;
  }
  if (command.cmd === "buzzer") {
    const durationMs = Number(command.durationMs ?? 120);
    if (typeof command.value === "boolean") {
      return { cmd: "buzzer", value: command.value };
    }
    if (command.value === "toggle") {
      return { cmd: "buzzer", value: "toggle" };
    }
    if (command.value === "beep" && Number.isFinite(durationMs) && durationMs >= 20 && durationMs <= 2000) {
      return { cmd: "buzzer", value: "beep", durationMs: Math.round(durationMs) };
    }
    return null;
  }
  if (command.cmd === "servo") {
    if (Number.isFinite(command.angle) && command.angle >= 0 && command.angle <= 180) {
      return { cmd: "servo", angle: Math.round(command.angle) };
    }
    return null;
  }
  if (command.cmd === "read") {
    return { cmd: "read" };
  }
  if (command.cmd === "chat") {
    const text = String(command.text || "").trim();
    if (text.length > 0 && text.length <= 120) {
      return { cmd: "chat", text };
    }
    return null;
  }
  return null;
}

function isValidCommand(command) {
  return sanitizeCommand(command) !== null;
}

function parseProtocolCommand(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式错误");
  }

  const command = sanitizeCommand(payload);
  if (!command) {
    throw new Error("只支持 led、rgb、buzzer、servo、read、chat 命令");
  }
  return command;
}

function normalizeMacroStep(item, fallbackDelay = 450) {
  const command = sanitizeCommand(item?.command);
  if (!command) {
    return null;
  }

  const delay = Number.isFinite(item.delay)
    ? Math.max(0, Math.min(5000, Math.round(item.delay)))
    : fallbackDelay;
  return { delay, command };
}

function restorePreferences() {
  const saved = safeLoadStorage();
  if (typeof saved.autoRefresh === "boolean") {
    state.autoRefresh = saved.autoRefresh;
    els.autoRefreshToggle.checked = saved.autoRefresh;
  }

  if (typeof saved.autoReconnect === "boolean") {
    state.autoReconnect = saved.autoReconnect;
    els.autoReconnectToggle.checked = saved.autoReconnect;
  }

  if (Number.isFinite(saved.servoAngle)) {
    state.status.servo = Math.max(0, Math.min(180, Math.round(saved.servoAngle)));
  }

  if (Array.isArray(saved.macro)) {
    state.macro = saved.macro
      .map((item) => normalizeMacroStep(item))
      .filter(Boolean)
      .slice(0, 32);
  }
}

function persistPreferences() {
  safeSaveStorage({
    autoRefresh: state.autoRefresh,
    autoReconnect: state.autoReconnect,
    servoAngle: state.status.servo,
    macro: state.macro,
  });
}

function setChip(el, text, tone) {
  el.textContent = text;
  el.className = `chip ${tone}`;
}

function log(level, message) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;
  const now = new Date();
  state.logs.unshift({
    time: now.toISOString(),
    level,
    message,
  });
  state.logs = state.logs.slice(0, 120);

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = now.toLocaleTimeString("zh-CN", { hour12: false });

  const levelText = document.createElement("span");
  levelText.className = "level";
  levelText.textContent = level.toUpperCase();

  const body = document.createElement("span");
  body.textContent = message;

  entry.append(time, levelText, body);
  els.logList.prepend(entry);
  while (els.logList.children.length > 80) {
    els.logList.lastElementChild.remove();
  }
}

function buildDiagnosticsReport() {
  return {
    generatedAt: new Date().toISOString(),
    page: {
      title: document.title,
      url: window.location.href,
      secureContext: window.isSecureContext,
      webBluetooth: Boolean(navigator.bluetooth),
      userAgent: navigator.userAgent,
    },
    gatt: {
      connected: state.connected,
      demo: state.demo,
      notificationsActive: state.notificationsActive,
      syncMode: els.syncModeText.textContent,
      scanMode: els.scanModeText.textContent,
      deviceName: state.device?.name || els.deviceName.textContent,
      serviceUuid: SERVICE_UUID,
      commandUuid: COMMAND_UUID,
      statusUuid: STATUS_UUID,
      pendingOperations: state.pendingGattOperations,
      operationTimeoutMs: GATT_OPERATION_TIMEOUT_MS,
      autoRefresh: state.autoRefresh,
      autoReconnect: state.autoReconnect,
    },
    reconnect: {
      attempts: state.reconnectAttempts,
      pending: Boolean(state.reconnectTimer),
      lastReconnectAt: state.lastReconnectAt,
      manualDisconnect: state.manualDisconnect,
    },
    status: { ...state.status },
    compatibility: {
      supportedProtocol: SUPPORTED_PROTOCOL_VERSION,
      deviceProtocol: state.status.protocol,
      protocolOk: !Number.isFinite(state.status.protocol) || state.status.protocol === SUPPORTED_PROTOCOL_VERSION,
      lastProtocolWarning: state.lastProtocolWarning,
    },
    wakeLock: {
      supported: Boolean(navigator.wakeLock),
      enabled: state.wakeLockEnabled,
      active: state.wakeLockActive,
      lastError: state.lastWakeLockError,
    },
    selfTest: state.lastSelfTest,
    faults: {
      lastConnectionError: state.lastConnectionError,
      lastDisconnectAt: state.lastDisconnectAt,
      lastGattError: state.lastGattError,
    },
    freshness: {
      lastStatusAt: state.lastStatusAt ? new Date(state.lastStatusAt).toISOString() : null,
      ageMs: state.lastStatusAt ? Date.now() - state.lastStatusAt : null,
      ok: state.lastStatusOk,
    },
    telemetry: state.telemetry.slice(-12),
    macro: state.macro.map((item) => ({
      delay: item.delay,
      command: item.command,
      label: describeCommand(item.command),
    })),
    logs: state.logs,
  };
}

function downloadDiagnostics() {
  const report = buildDiagnosticsReport();
  const text = JSON.stringify(report, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = url;
  link.download = `esp32-p4-ble-diagnostics-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  log("ok", "诊断报告已导出。");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildTelemetryCsv() {
  const baseTime = state.telemetry[0]?.t || Date.now();
  const rows = [["sample", "timeMs", "temperatureC", "humidityPercent"]];
  state.telemetry.forEach((point, index) => {
    rows.push([
      index + 1,
      point.t - baseTime,
      Number.isFinite(point.temperature) ? point.temperature.toFixed(2) : "",
      Number.isFinite(point.humidity) ? point.humidity.toFixed(2) : "",
    ]);
  });
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function downloadTelemetryCsv() {
  if (state.telemetry.length === 0) {
    log("warn", "还没有可导出的遥测数据，请先读取状态或启用演示模式。");
    return;
  }

  const blob = new Blob([buildTelemetryCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = url;
  link.download = `esp32-p4-telemetry-${stamp}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  log("ok", `已导出 ${state.telemetry.length} 条遥测数据。`);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch((error) => {
    log("warn", `离线缓存注册失败：${error.message}`);
  });
}

function updateWakeLockUi() {
  const supported = Boolean(navigator.wakeLock) && window.isSecureContext;
  els.wakeLockToggle.disabled = !supported;
  els.wakeLockToggle.checked = supported && state.wakeLockEnabled;
  els.wakeLockToggle.title = supported
    ? state.wakeLockActive
      ? "屏幕保持唤醒中"
      : "请求屏幕保持唤醒"
    : "当前浏览器不支持 Screen Wake Lock";
}

async function requestWakeLock(options = {}) {
  if (!navigator.wakeLock || !window.isSecureContext) {
    state.wakeLockEnabled = false;
    state.wakeLockActive = false;
    state.wakeLockSentinel = null;
    state.lastWakeLockError = {
      message: "Screen Wake Lock unsupported",
      at: new Date().toISOString(),
    };
    if (!options.quiet) {
      log("warn", "当前浏览器不支持保持唤醒。");
    }
    updateWakeLockUi();
    return;
  }

  try {
    state.wakeLockEnabled = true;
    state.wakeLockSentinel = await navigator.wakeLock.request("screen");
    state.wakeLockActive = true;
    state.lastWakeLockError = null;
    state.wakeLockSentinel.addEventListener("release", () => {
      state.wakeLockActive = false;
      state.wakeLockSentinel = null;
      updateWakeLockUi();
      if (state.wakeLockEnabled && document.visibilityState === "visible") {
        requestWakeLock({ quiet: true }).catch(() => {});
      }
    });
    if (!options.quiet) {
      log("ok", "保持唤醒已开启。");
    }
  } catch (error) {
    state.wakeLockEnabled = false;
    state.wakeLockActive = false;
    state.wakeLockSentinel = null;
    state.lastWakeLockError = {
      message: error.message,
      at: new Date().toISOString(),
    };
    if (!options.quiet) {
      log("warn", `保持唤醒开启失败：${error.message}`);
    }
  } finally {
    updateWakeLockUi();
  }
}

async function releaseWakeLock() {
  state.wakeLockEnabled = false;
  const sentinel = state.wakeLockSentinel;
  state.wakeLockSentinel = null;
  state.wakeLockActive = false;
  if (sentinel) {
    try {
      await sentinel.release();
    } catch (error) {
      state.lastWakeLockError = {
        message: error.message,
        at: new Date().toISOString(),
      };
    }
  }
  updateWakeLockUi();
  log("info", "保持唤醒已关闭。");
}

function isReady() {
  return state.connected || state.demo;
}

function updateSupport() {
  if (!window.isSecureContext) {
    setChip(els.supportChip, "需要 localhost/HTTPS", "warning");
    log("warn", "Web Bluetooth 需要 localhost 或 HTTPS，当前上下文不安全。");
    return;
  }

  if (!navigator.bluetooth) {
    setChip(els.supportChip, "不支持 Web Bluetooth", "danger");
    log("error", "当前浏览器不支持 Web Bluetooth，请使用 Chrome 或 Edge。");
    return;
  }

  setChip(els.supportChip, "浏览器可用", "connected");
}

function supportsQuickReconnect() {
  return Boolean(navigator.bluetooth?.getDevices);
}

async function findAuthorizedControlDevice() {
  if (!supportsQuickReconnect()) {
    return null;
  }

  const devices = await navigator.bluetooth.getDevices();
  const normalizedServiceUuid = SERVICE_UUID.toLowerCase();
  return (
    devices.find((device) =>
      Array.isArray(device.uuids) &&
      device.uuids.some((uuid) => String(uuid).toLowerCase() === normalizedServiceUuid)
    ) ||
    devices.find((device) => /esp32|p4/i.test(device.name || "")) ||
    null
  );
}

function updateConnectionUi() {
  if (state.demo) {
    setChip(els.connectionChip, "演示模式", "warning");
    els.connectBtn.disabled = true;
    els.compatBtn.disabled = true;
    els.disconnectBtn.disabled = false;
    els.deviceName.textContent = "Virtual ESP32-P4";
    els.protocolText.textContent = `v${SUPPORTED_PROTOCOL_VERSION}`;
    els.protocolText.dataset.tone = "connected";
    els.scanModeText.textContent = "演示";
    els.syncModeText.textContent = "模拟数据";
  } else if (state.connected) {
    setChip(els.connectionChip, "已连接", "connected");
    els.connectBtn.disabled = true;
    els.compatBtn.disabled = true;
    els.disconnectBtn.disabled = false;
    els.deviceName.textContent = state.status.device || state.device?.name || "ESP32-P4";
    updateProtocolUi();
    els.syncModeText.textContent = state.notificationsActive ? "通知+读取" : "轮询回退";
  } else {
    setChip(els.connectionChip, "未连接", "idle");
    els.connectBtn.disabled = false;
    els.compatBtn.disabled = false;
    els.disconnectBtn.disabled = true;
    els.deviceName.textContent = "等待连接";
    els.protocolText.textContent = "未知";
    els.protocolText.dataset.tone = "neutral";
    els.scanModeText.textContent = "服务过滤";
    els.syncModeText.textContent = "未连接";
    els.latencyText.textContent = "-- ms";
  }
  updateFreshnessUi();
  updateUptimeUi();
  updateSelfTestUi();
}

function updateProtocolUi() {
  if (!Number.isFinite(state.status.protocol)) {
    els.protocolText.textContent = "未知";
    els.protocolText.dataset.tone = "neutral";
    return;
  }

  const compatible = state.status.protocol === SUPPORTED_PROTOCOL_VERSION;
  els.protocolText.textContent = compatible ? `v${state.status.protocol}` : `v${state.status.protocol} / 需 v${SUPPORTED_PROTOCOL_VERSION}`;
  els.protocolText.dataset.tone = compatible ? "connected" : "danger";
}

function resetConnectionState() {
  state.connected = false;
  state.server = null;
  state.commandChar = null;
  state.statusChar = null;
  state.notificationsActive = false;
  state.lastStatusAt = 0;
  state.lastStatusOk = true;
  state.status.uptimeMs = null;
  resetGattQueue();
}

function cancelAutoReconnect() {
  if (state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = 0;
  }
}

function scheduleAutoReconnect(reason) {
  if (!state.autoReconnect || state.manualDisconnect || state.demo || !state.device || state.reconnectTimer) {
    return;
  }

  if (!supportsQuickReconnect()) {
    log("warn", "当前浏览器不支持授权设备快速重连，自动重连已跳过。");
    return;
  }

  state.reconnectAttempts += 1;
  const delayMs = Math.min(1200 + (state.reconnectAttempts - 1) * 800, 5000);
  els.syncModeText.textContent = `重连中 ${Math.round(delayMs / 1000)}s`;
  log("warn", `${reason}，${delayMs} ms 后尝试自动重连。`);

  state.reconnectTimer = window.setTimeout(async () => {
    state.reconnectTimer = 0;
    if (!state.autoReconnect || state.manualDisconnect || state.connected || state.demo) {
      return;
    }

    try {
      await connect({ quickOnly: true, automatic: true });
      state.lastReconnectAt = new Date().toISOString();
      log("ok", "自动重连成功。");
    } catch (error) {
      state.lastConnectionError = {
        message: error.message,
        scanMode: "auto-reconnect",
        at: new Date().toISOString(),
      };
      log("warn", `自动重连失败：${error.message}`);
      scheduleAutoReconnect("自动重连失败");
    }
  }, delayMs);
}

function formatStatusAge(ageMs) {
  if (ageMs < 1500) {
    return "刚刚";
  }
  if (ageMs < 60000) {
    return `${Math.round(ageMs / 1000)}s 前`;
  }
  return `${Math.round(ageMs / 60000)}m 前`;
}

function formatUptime(uptimeMs) {
  if (!Number.isFinite(uptimeMs) || uptimeMs < 0) {
    return "--";
  }

  const totalSeconds = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function updateFreshnessUi() {
  if (!isReady() || state.lastStatusAt === 0) {
    els.freshnessText.textContent = "--";
    els.freshnessText.dataset.tone = "neutral";
    return;
  }

  const ageMs = Date.now() - state.lastStatusAt;
  els.freshnessText.textContent = formatStatusAge(ageMs);
  if (!state.lastStatusOk) {
    els.freshnessText.dataset.tone = "danger";
  } else if (ageMs > 8000) {
    els.freshnessText.dataset.tone = "warning";
  } else {
    els.freshnessText.dataset.tone = "connected";
  }
}

function updateUptimeUi() {
  els.uptimeText.textContent = isReady() ? formatUptime(state.status.uptimeMs) : "--";
}

function updateSelfTestUi() {
  els.selfTestBtn.disabled = !isReady() || state.selfTestRunning;
  els.selfTestBtn.textContent = state.selfTestRunning ? "自检中" : "安全自检";
}

function updateChatUi() {
  if (!els.chatSendBtn || !els.chatReply) {
    return;
  }

  const chat = state.status.chat || {};
  els.chatSendBtn.disabled = !isReady() || Boolean(chat.busy);

  if (chat.busy) {
    els.chatReply.textContent = "云端大模型思考中...";
    els.chatReply.dataset.tone = "warning";
  } else if (chat.reply) {
    els.chatReply.textContent = chat.reply;
    els.chatReply.dataset.tone = "connected";
  } else if (chat.error) {
    els.chatReply.textContent = `对话失败：${chat.error}`;
    els.chatReply.dataset.tone = "danger";
  } else {
    els.chatReply.textContent = "等待蓝牙对话。";
    els.chatReply.dataset.tone = "neutral";
  }
}

function updateBusyUi() {
  if (state.pendingGattOperations > 0 && (state.connected || state.demo)) {
    els.latencyText.textContent = "同步中...";
  } else if (!state.connected && !state.demo) {
    els.latencyText.textContent = "-- ms";
  } else if (els.latencyText.textContent === "同步中..." && state.lastCommandAt === 0) {
    els.latencyText.textContent = "-- ms";
  }
}

function withTimeout(task, timeoutMs, label) {
  let timeoutId = 0;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} 超时，请确认蓝牙距离、电源和板端固件状态。`));
    }, timeoutMs);
  });

  return Promise.race([task(), timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function enqueueGattOperation(operation) {
  state.pendingGattOperations += 1;
  updateBusyUi();

  const run = state.gattQueue
    .catch(() => {})
    .then(() => withTimeout(operation, GATT_OPERATION_TIMEOUT_MS, "BLE 操作"));
  state.gattQueue = run.finally(() => {
    state.pendingGattOperations = Math.max(0, state.pendingGattOperations - 1);
    updateBusyUi();
  });

  return state.gattQueue;
}

function resetGattQueue() {
  state.gattQueue = Promise.resolve();
  state.pendingGattOperations = 0;
  updateBusyUi();
}

function updatePolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = 0;

  if (!state.autoRefresh || (!state.connected && !state.demo)) {
    return;
  }

  state.pollTimer = window.setInterval(() => {
    readStatus({ quiet: true });
  }, 2500);
}

function updateDeviceUi() {
  const rgb = state.status.rgb || { r: 0, g: 0, b: 0 };
  const rgbOn = Boolean(state.status.led) || rgb.r > 0 || rgb.g > 0 || rgb.b > 0;
  state.status.led = rgbOn;
  els.ledDot.classList.toggle("on", rgbOn);
  els.ledDot.style.background = rgbOn ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "";
  setChip(els.ledState, rgbOn ? `${rgb.r},${rgb.g},${rgb.b}` : "关闭", rgbOn ? "connected" : "idle");
  if (els.buzzerState) {
    setChip(els.buzzerState, state.status.buzzer ? "长鸣" : "关闭", state.status.buzzer ? "warning" : "idle");
  }

  const angle = Number(state.status.servo ?? 90);
  els.servoRange.value = String(angle);
  els.servoOutput.textContent = `${angle}°`;
  setChip(els.servoState, `${angle}°`, "neutral");

  if (els.distanceText) {
    els.distanceText.textContent = state.status.hcsr04Valid && Number.isFinite(state.status.distanceCm)
      ? `${state.status.distanceCm.toFixed(1)} cm`
      : "--.- cm";
  }
  if (els.irText) {
    const ir = state.status.ir || {};
    els.irText.textContent = ir.active ? `有信号 ${ir.edges ?? 0}` : "等待";
  }
  if (els.mpuText) {
    const imu = state.status.mpu6050 || {};
    els.mpuText.textContent = imu.valid
      ? `MPU6050：A ${imu.ax.toFixed(2)} ${imu.ay.toFixed(2)} ${imu.az.toFixed(2)}g  G ${imu.gx.toFixed(0)} ${imu.gy.toFixed(0)} ${imu.gz.toFixed(0)} dps`
      : "MPU6050：未检测到";
  }
  if (els.sensorState) {
    const ok = Boolean(state.status.hcsr04Valid) || Boolean(state.status.mpu6050?.valid) || Boolean(state.status.ir?.active);
    setChip(els.sensorState, ok ? "有数据" : "就绪", ok ? "connected" : "neutral");
  }

  const temp = state.status.temperature;
  const humidity = state.status.humidity;
  els.temperatureText.textContent = Number.isFinite(temp) ? `${temp.toFixed(1)} ℃` : "--.- ℃";
  els.humidityText.textContent = Number.isFinite(humidity) ? `${humidity.toFixed(1)} %` : "--.- %";
  const dhtPin = Number.isFinite(state.status.dhtGpio) ? ` GPIO${state.status.dhtGpio}` : "";
  setChip(els.telemetryChip, `${dhtStatusLabel(state.status.dhtStatus)}${dhtPin}`, state.status.dhtStatus === "ok" ? "connected" : "neutral");

  document.querySelectorAll("[data-servo]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.servo) === angle);
  });
  document.querySelectorAll("[data-rgb]").forEach((button) => {
    const preset = rgbFromCommand({ cmd: "rgb", color: button.dataset.rgb });
    button.classList.toggle("active", rgb.r === preset.r && rgb.g === preset.g && rgb.b === preset.b);
  });

  drawTelemetry();
}

function recordMacro(command) {
  if (!state.recording) {
    return;
  }
  state.macro.push({ command, delay: state.macro.length === 0 ? 0 : 450 });
  persistPreferences();
  renderMacro();
}

function renderMacro() {
  els.macroCount.textContent = `${state.macro.length} 步`;
  els.macroList.innerHTML = "";
  if (state.macro.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "还没有录制动作。";
    els.macroList.append(empty);
    return;
  }
  state.macro.forEach((item, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${describeCommand(item.command)}`;
    els.macroList.append(li);
  });
}

function buildMacroExport() {
  return {
    format: MACRO_EXPORT_FORMAT,
    version: MACRO_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    steps: state.macro.map((item) => ({
      delay: item.delay,
      command: sanitizeCommand(item.command),
    })),
  };
}

function downloadMacroExport() {
  if (state.macro.length === 0) {
    log("warn", "没有可导出的动作编排。");
    return;
  }

  const blob = new Blob([JSON.stringify(buildMacroExport(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `esp32-p4-macro-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  log("ok", `已导出 ${state.macro.length} 步动作编排。`);
}

async function readFileText(file) {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

async function importMacroFromFile(file) {
  if (!file) {
    return;
  }
  if (file.size > 64 * 1024) {
    throw new Error("动作文件过大");
  }

  const raw = await readFileText(file);
  const payload = JSON.parse(raw);
  const sourceSteps = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.steps)
      ? payload.steps
      : Array.isArray(payload.macro)
        ? payload.macro
        : null;

  if (!sourceSteps) {
    throw new Error("文件格式不是动作编排 JSON");
  }

  const macro = sourceSteps
    .map((item) => normalizeMacroStep(item))
    .filter(Boolean)
    .slice(0, 32);

  if (macro.length === 0) {
    throw new Error("没有找到合法动作");
  }

  state.macro = macro;
  state.recording = false;
  els.recordBtn.textContent = "开始录制";
  persistPreferences();
  renderMacro();
  log("ok", `已导入 ${state.macro.length} 步动作编排。`);
}

function describeCommand(command) {
  if (command.cmd === "led") {
    return command.value === "toggle" ? "RGB 白光切换" : `RGB 白光${command.value ? "开启" : "关闭"}`;
  }
  if (command.cmd === "rgb") {
    if (typeof command.color === "string") {
      return `RGB ${command.color}`;
    }
    return `RGB ${command.r},${command.g},${command.b}`;
  }
  if (command.cmd === "buzzer") {
    if (command.value === "beep") {
      return `蜂鸣器短鸣 ${command.durationMs || 120} ms`;
    }
    return command.value === "toggle" ? "蜂鸣器切换" : `蜂鸣器 ${command.value ? "开启" : "关闭"}`;
  }
  if (command.cmd === "servo") {
    return `舵机转到 ${command.angle}°`;
  }
  if (command.cmd === "chat") {
    return `蓝牙对话：${command.text}`;
  }
  return command.cmd;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function rgbFromCommand(command, fallback = state.status.rgb) {
  const presets = {
    off: { r: 0, g: 0, b: 0 },
    black: { r: 0, g: 0, b: 0 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 180, b: 0 },
    cyan: { r: 0, g: 180, b: 255 },
    magenta: { r: 255, g: 0, b: 180 },
    white: { r: 255, g: 255, b: 255 },
  };
  if (command?.cmd === "led") {
    const on = command.value === "toggle" ? !state.status.led : Boolean(command.value);
    return on ? presets.white : presets.off;
  }
  if (command?.cmd === "rgb" && typeof command.color === "string") {
    return presets[command.color] || fallback;
  }
  if (command?.cmd === "rgb") {
    return { r: command.r, g: command.g, b: command.b };
  }
  return fallback;
}

function dhtStatusLabel(status) {
  const labels = {
    ok: "正常",
    "startup wait": "上电等待",
    "gpio error": "GPIO错误",
    "no response": "无响应",
    "bit timeout": "位超时",
    "checksum error": "校验错误",
    "not read": "未读取",
  };
  return labels[status] || status || "待读取";
}

function applyStatus(payload) {
  state.lastStatusAt = Date.now();
  state.lastStatusOk = payload.ok !== false;

  if (typeof payload.led === "boolean") {
    state.status.led = payload.led;
  }
  if (payload.rgb && Number.isFinite(payload.rgb.r) && Number.isFinite(payload.rgb.g) && Number.isFinite(payload.rgb.b)) {
    state.status.rgb = {
      r: Math.max(0, Math.min(255, Math.round(payload.rgb.r))),
      g: Math.max(0, Math.min(255, Math.round(payload.rgb.g))),
      b: Math.max(0, Math.min(255, Math.round(payload.rgb.b))),
    };
    state.status.led = state.status.rgb.r > 0 || state.status.rgb.g > 0 || state.status.rgb.b > 0;
  }
  if (typeof payload.buzzer === "boolean") {
    state.status.buzzer = payload.buzzer;
  }
  if (Number.isFinite(payload.servo)) {
    state.status.servo = Math.max(0, Math.min(180, Math.round(payload.servo)));
  }
  if (Number.isFinite(payload.temperature) && Number.isFinite(payload.humidity)) {
    state.status.temperature = payload.temperature;
    state.status.humidity = payload.humidity;
    state.telemetry.push({
      t: Date.now(),
      temperature: payload.temperature,
      humidity: payload.humidity,
    });
    state.telemetry = state.telemetry.slice(-36);
  }
  if (typeof payload.dhtStatus === "string") {
    state.status.dhtStatus = payload.dhtStatus;
  }
  if (Number.isFinite(payload.distanceCm)) {
    state.status.distanceCm = payload.distanceCm;
    state.status.hcsr04Valid = Boolean(payload.hcsr04Valid);
  }
  if (payload.mpu6050 && typeof payload.mpu6050 === "object") {
    state.status.mpu6050 = payload.mpu6050;
  }
  if (payload.ir && typeof payload.ir === "object") {
    state.status.ir = payload.ir;
  }
  if (Number.isFinite(payload.protocol)) {
    state.status.protocol = payload.protocol;
    if (payload.protocol !== SUPPORTED_PROTOCOL_VERSION) {
      const warning = {
        expected: SUPPORTED_PROTOCOL_VERSION,
        actual: payload.protocol,
        at: new Date().toISOString(),
      };
      if (!state.lastProtocolWarning || state.lastProtocolWarning.actual !== payload.protocol) {
        log("warn", `协议版本不匹配：板端 v${payload.protocol}，网页期望 v${SUPPORTED_PROTOCOL_VERSION}。`);
      }
      state.lastProtocolWarning = warning;
    } else {
      state.lastProtocolWarning = null;
    }
  }
  if (typeof payload.device === "string" && payload.device.trim() !== "") {
    state.status.device = payload.device;
  }
  if (typeof payload.bleTransport === "string") {
    state.status.bleTransport = payload.bleTransport;
  }
  if (typeof payload.bleController === "string") {
    state.status.bleController = payload.bleController;
  }
  if (typeof payload.bleReady === "boolean") {
    state.status.bleReady = payload.bleReady;
  }
  if (typeof payload.bleConnected === "boolean") {
    state.status.bleConnected = payload.bleConnected;
  }
  if (Number.isFinite(payload.uptimeMs)) {
    state.status.uptimeMs = payload.uptimeMs;
  }
  if (payload.chat && typeof payload.chat === "object") {
    state.status.chat = payload.chat;
    if (Number.isFinite(payload.chat.seq) && payload.chat.seq !== state.lastChatSeq) {
      state.lastChatSeq = payload.chat.seq;
      if (payload.chat.busy) {
        log("info", "蓝牙对话已提交，等待云端大模型回复。");
      } else if (payload.chat.reply) {
        log("ok", `云端回复：${payload.chat.reply}`);
      } else if (payload.chat.error) {
        log("error", `蓝牙对话失败：${payload.chat.error}`);
      }
    }
  }
  if (state.lastCommandAt > 0) {
    els.latencyText.textContent = `${Date.now() - state.lastCommandAt} ms`;
    state.lastCommandAt = 0;
  }
  updateConnectionUi();
  updateDeviceUi();
  updateFreshnessUi();
  updateUptimeUi();
  updateProtocolUi();
  updateChatUi();
}

async function readStatus(options = {}) {
  if (!isReady()) {
    if (!options.quiet) {
      log("warn", "请先连接板子，或启用演示模式。");
    }
    return;
  }

  if (state.demo) {
    await demoApply({ cmd: "read" }, { quiet: options.quiet });
    return;
  }

  if (!state.statusChar) {
    if (!options.quiet) {
      log("warn", "状态特征尚未就绪。");
    }
    return;
  }

  try {
    await enqueueGattOperation(async () => {
      if (!options.quiet && state.lastCommandAt === 0) {
        state.lastCommandAt = Date.now();
      }
      const value = await state.statusChar.readValue();
      const text = decoder.decode(value);
      const payload = JSON.parse(text);
      applyStatus(payload);
      if (!options.quiet) {
        log(payload.ok === false ? "warn" : "ok", `读取：${text}`);
      }
    });
  } catch (error) {
    state.lastGattError = {
      phase: "read",
      message: error.message,
      at: new Date().toISOString(),
    };
    if (!options.quiet) {
      log("error", `读取状态失败：${error.message}`);
    }
    state.lastCommandAt = 0;
    els.latencyText.textContent = "超时";
  }
}

function looksLikeFullStatus(payload) {
  return (
    typeof payload.led === "boolean" ||
    Boolean(payload.rgb) ||
    typeof payload.buzzer === "boolean" ||
    Number.isFinite(payload.servo) ||
    Number.isFinite(payload.temperature) ||
    Number.isFinite(payload.humidity) ||
    typeof payload.dhtStatus === "string" ||
    Boolean(payload.chat)
  );
}

function requestStatusReadFromNotification() {
  if (state.notificationReadPending) {
    return;
  }

  state.notificationReadPending = true;
  window.setTimeout(async () => {
    try {
      await readStatus({ quiet: true });
    } finally {
      state.notificationReadPending = false;
    }
  }, 40);
}

async function sendCommand(command, options = {}) {
  if (!isReady()) {
    log("warn", "请先连接板子，或启用演示模式。");
    return;
  }

  state.lastCommandAt = Date.now();
  if (options.record !== false) {
    recordMacro(command);
  }
  if (command.cmd === "servo" && Number.isFinite(command.angle)) {
    state.status.servo = Math.max(0, Math.min(180, Math.round(command.angle)));
    persistPreferences();
  }
  if (command.cmd === "led" || command.cmd === "rgb") {
    state.status.rgb = rgbFromCommand(command);
    state.status.led = state.status.rgb.r > 0 || state.status.rgb.g > 0 || state.status.rgb.b > 0;
    updateDeviceUi();
  }
  if (command.cmd === "buzzer") {
    if (typeof command.value === "boolean") {
      state.status.buzzer = command.value;
    } else if (command.value === "toggle") {
      state.status.buzzer = !state.status.buzzer;
    } else if (command.value === "beep") {
      state.status.buzzer = true;
      window.setTimeout(() => {
        state.status.buzzer = false;
        updateDeviceUi();
      }, command.durationMs || 120);
    }
    updateDeviceUi();
  }
  log("info", `发送：${describeCommand(command)}`);

  if (state.demo) {
    await demoApply(command);
    return;
  }

  const payload = encoder.encode(JSON.stringify(command));
  try {
    await enqueueGattOperation(async () => {
      if (options.withResponse === false && state.commandChar.writeValueWithoutResponse) {
        await state.commandChar.writeValueWithoutResponse(payload);
      } else if (state.commandChar.writeValueWithResponse) {
        await state.commandChar.writeValueWithResponse(payload);
      } else {
        await state.commandChar.writeValue(payload);
      }
    });

    if (command.cmd !== "read") {
      window.setTimeout(() => {
        if (state.lastCommandAt > 0) {
          readStatus({ quiet: true });
        }
      }, 180);
    } else {
      await readStatus({ quiet: options.quiet });
    }
  } catch (error) {
    state.lastGattError = {
      phase: "write",
      command,
      message: error.message,
      at: new Date().toISOString(),
    };
    log("error", `发送失败：${error.message}`);
    state.lastCommandAt = 0;
    els.latencyText.textContent = "超时";
    throw error;
  }
}

function sendCommandFromUi(command, options = {}) {
  sendCommand(command, options).catch(() => {});
}

function sendChatFromUi() {
  const text = els.chatInput.value.trim();
  if (!text) {
    log("warn", "请输入要发送给云端大模型的内容。");
    els.chatInput.focus();
    return;
  }

  state.status.chat = {
    ...(state.status.chat || {}),
    busy: true,
    reply: "",
    error: "",
  };
  updateChatUi();
  log("info", `蓝牙对话：${text}`);
  sendCommandFromUi({ cmd: "chat", text }, { record: false });
}

async function emergencyStop() {
  if (state.emergencyRunning) {
    log("warn", "急停命令正在执行。");
    return;
  }

  if (!isReady()) {
    log("warn", "请先连接板子，或启用演示模式。");
    return;
  }

  state.safetyToken += 1;
  state.showcaseRunning = false;
  state.emergencyRunning = true;
  els.emergencyBtn.disabled = true;
  els.emergencyBtn.textContent = "急停中";

  try {
    log("warn", "执行急停：RGB 置红并触发蜂鸣器短鸣。");
    await sendCommand({ cmd: "read" }, { record: false });
    await sendCommand({ cmd: "rgb", color: "red" }, { record: false });
    await sendCommand({ cmd: "buzzer", value: "beep", durationMs: 300 }, { record: false });
    await readStatus({ quiet: true });
    log("ok", "急停完成。");
  } catch (error) {
    log("error", `急停失败：${error.message}`);
  } finally {
    state.emergencyRunning = false;
      els.emergencyBtn.disabled = false;
    els.emergencyBtn.textContent = "急停";
    updateDeviceUi();
  }
}

async function runSelfTest() {
  if (state.selfTestRunning) {
    log("warn", "安全自检正在执行。");
    return;
  }

  if (!isReady()) {
    log("warn", "请先连接板子，或启用演示模式。");
    return;
  }

  state.selfTestRunning = true;
  const startedAt = Date.now();
  const safetyToken = state.safetyToken;
  updateSelfTestUi();

  try {
    log("info", "开始安全自检：状态读取、RGB 巡检、蜂鸣器短鸣、舵机回中和传感器刷新。");
    await readStatus({ quiet: true });
    if (state.safetyToken !== safetyToken) {
      throw new Error("自检已被急停中断");
    }

    await sendCommand({ cmd: "read" }, { record: false });
    await sendCommand({ cmd: "rgb", color: "red" }, { record: false });
    await sleep(120);
    await sendCommand({ cmd: "rgb", color: "green" }, { record: false });
    await sleep(120);
    await sendCommand({ cmd: "rgb", color: "blue" }, { record: false });
    await sendCommand({ cmd: "buzzer", value: "beep", durationMs: 120 }, { record: false });
    await sleep(180);
    if (state.safetyToken !== safetyToken) {
      throw new Error("自检已被急停中断");
    }

    await sendCommand({ cmd: "rgb", color: "off" }, { record: false });
    await sendCommand({ cmd: "servo", angle: 90 }, { record: false });
    await readStatus({ quiet: true });

    const durationMs = Date.now() - startedAt;
    state.lastSelfTest = {
      ok: true,
      finishedAt: new Date().toISOString(),
      durationMs,
      status: { ...state.status },
    };
    log("ok", `安全自检通过，用时 ${durationMs} ms。`);
  } catch (error) {
    state.lastSelfTest = {
      ok: false,
      finishedAt: new Date().toISOString(),
      message: error.message,
      status: { ...state.status },
    };
    log("error", `安全自检失败：${error.message}`);
  } finally {
    state.selfTestRunning = false;
    updateSelfTestUi();
  }
}

async function runShowcase() {
  if (state.showcaseRunning) {
    log("warn", "展示动作正在执行。");
    return;
  }

  if (!isReady()) {
    log("warn", "请先连接板子，或启用演示模式。");
    return;
  }

  state.showcaseRunning = true;
  const safetyToken = state.safetyToken;
  const wasRecording = state.recording;
  state.recording = false;
  els.recordBtn.textContent = "开始录制";
  els.showcaseBtn.disabled = true;
  els.showcaseBtn.textContent = "展示中";

  const sequence = [
    { delay: 0, command: { cmd: "read" } },
    { delay: 160, command: { cmd: "rgb", color: "red" } },
    { delay: 180, command: { cmd: "rgb", color: "green" } },
    { delay: 180, command: { cmd: "rgb", color: "blue" } },
    { delay: 160, command: { cmd: "buzzer", value: "beep", durationMs: 100 } },
    { delay: 220, command: { cmd: "servo", angle: 45 } },
    { delay: 320, command: { cmd: "servo", angle: 135 } },
    { delay: 320, command: { cmd: "servo", angle: 90 } },
    { delay: 220, command: { cmd: "rgb", color: "magenta" } },
    { delay: 180, command: { cmd: "rgb", color: "white" } },
    { delay: 180, command: { cmd: "rgb", color: "off" } },
  ];

  try {
    log("info", "启动展示：RGB 混色、蜂鸣器短鸣、舵机扫描、遥测刷新。");
    for (const item of sequence) {
      if (state.safetyToken !== safetyToken) {
        log("warn", "展示动作已被急停中断。");
        return;
      }
      await sleep(item.delay);
      if (state.safetyToken !== safetyToken) {
        log("warn", "展示动作已被急停中断。");
        return;
      }
      await sendCommand(item.command);
    }
    await readStatus({ quiet: true });
    log("ok", "展示动作完成。");
  } catch (error) {
    log("error", `展示中断：${error.message}`);
  } finally {
    state.showcaseRunning = false;
    state.recording = wasRecording;
    els.recordBtn.textContent = state.recording ? "停止录制" : "开始录制";
    els.showcaseBtn.disabled = false;
    els.showcaseBtn.textContent = "展示";
  }
}

async function demoApply(command, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, 80));

  if (command.cmd === "led") {
    state.status.rgb = rgbFromCommand(command);
    state.status.led = state.status.rgb.r > 0 || state.status.rgb.g > 0 || state.status.rgb.b > 0;
  } else if (command.cmd === "rgb") {
    state.status.rgb = rgbFromCommand(command);
    state.status.led = state.status.rgb.r > 0 || state.status.rgb.g > 0 || state.status.rgb.b > 0;
  } else if (command.cmd === "buzzer") {
    if (typeof command.value === "boolean") {
      state.status.buzzer = command.value;
    } else if (command.value === "toggle") {
      state.status.buzzer = !state.status.buzzer;
    } else if (command.value === "beep") {
      state.status.buzzer = true;
      window.setTimeout(() => {
        state.status.buzzer = false;
        updateDeviceUi();
      }, command.durationMs || 120);
    }
  } else if (command.cmd === "servo") {
    state.status.servo = Math.max(0, Math.min(180, Math.round(command.angle)));
  } else if (command.cmd === "read") {
    const phase = Date.now() / 12000;
    state.status.temperature = 24.5 + Math.sin(phase) * 2.4;
    state.status.humidity = 58 + Math.cos(phase * 0.8) * 8;
    state.status.dhtStatus = "ok";
    state.status.distanceCm = 32 + Math.sin(phase * 1.2) * 12;
    state.status.hcsr04Valid = true;
    state.status.mpu6050 = {
      valid: true,
      ax: Math.sin(phase) * 0.2,
      ay: Math.cos(phase * 0.9) * 0.2,
      az: 1.0,
      gx: Math.sin(phase * 1.7) * 18,
      gy: Math.cos(phase * 1.3) * 18,
      gz: Math.sin(phase * 0.7) * 8,
    };
    state.status.ir = { active: Math.sin(phase * 2.3) > 0.72, edges: Math.round((Math.sin(phase * 2.3) + 1) * 8), level: 1 };
    state.status.protocol = 1;
    state.status.device = "Virtual ESP32-P4";
  } else if (command.cmd === "chat") {
    state.status.chat = {
      busy: false,
      ok: true,
      seq: state.lastChatSeq + 1,
      reply: `演示回复：${command.text}`,
      error: "",
    };
  }

  applyStatus({ ok: true, ...state.status, uptimeMs: Math.round(performance.now() - bootedAt) });
  if (!options.quiet) {
    log("ok", `完成：${describeCommand(command)}`);
  }
}

async function connectToDevice(device, scanModeLabel) {
  cancelAutoReconnect();
  state.device = device;
  device.removeEventListener("gattserverdisconnected", onDisconnected);
  device.addEventListener("gattserverdisconnected", onDisconnected);

  if (!device.gatt) {
    throw new Error("浏览器没有暴露该设备的 GATT 连接能力");
  }

  log("info", `正在连接 ${device.name || "ESP32-P4"}...`);
  state.server = await device.gatt.connect();
  const service = await state.server.getPrimaryService(SERVICE_UUID);
  state.commandChar = await service.getCharacteristic(COMMAND_UUID);
  state.statusChar = await service.getCharacteristic(STATUS_UUID);
  state.notificationsActive = false;
  try {
    await state.statusChar.startNotifications();
    state.statusChar.removeEventListener("characteristicvaluechanged", onStatusChanged);
    state.statusChar.addEventListener("characteristicvaluechanged", onStatusChanged);
    state.notificationsActive = true;
  } catch (notifyError) {
    log("warn", `通知订阅失败，已切换为轮询回退：${notifyError.message}`);
  }

  state.connected = true;
  state.demo = false;
  state.manualDisconnect = false;
  state.reconnectAttempts = 0;
  state.lastConnectionError = null;
  els.scanModeText.textContent = scanModeLabel;
  updateConnectionUi();
  updatePolling();
  log("ok", "蓝牙连接成功。");
  await readStatus();
}

async function requestControlDevice(compat) {
  const requestOptions = compat
    ? {
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      }
    : {
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      };

  return navigator.bluetooth.requestDevice(requestOptions);
}

async function connect(options = {}) {
  if (!navigator.bluetooth) {
    log("error", "当前浏览器不支持 Web Bluetooth。");
    return;
  }

  const compat = Boolean(options.compat);
  const quickOnly = Boolean(options.quickOnly);

  cancelAutoReconnect();
  state.manualDisconnect = false;

  try {
    if (!compat) {
      const authorizedDevice = await findAuthorizedControlDevice();
      if (authorizedDevice) {
        els.scanModeText.textContent = "快速重连";
        log("info", `${options.automatic ? "自动重连" : "发现已授权设备，尝试快速重连"} ${authorizedDevice.name || "ESP32-P4"}...`);
        try {
          await connectToDevice(authorizedDevice, "快速重连");
          return;
        } catch (quickError) {
          resetConnectionState();
          state.lastConnectionError = {
            message: quickError.message,
            scanMode: "quick-reconnect",
            at: new Date().toISOString(),
          };
          if (quickOnly) {
            throw quickError;
          }
          log("warn", `快速重连失败，改用蓝牙扫描：${quickError.message}`);
        }
      } else if (supportsQuickReconnect()) {
        if (quickOnly) {
          throw new Error("没有找到已授权设备");
        }
        log("info", "没有找到已授权设备，将打开蓝牙扫描。");
      }
    }

    if (quickOnly) {
      throw new Error("当前浏览器不支持快速重连或没有已授权设备");
    }

    els.scanModeText.textContent = compat ? "兼容扫描" : "服务过滤";
    log("info", compat ? "正在兼容扫描蓝牙设备..." : "正在请求蓝牙设备...");
    const device = await requestControlDevice(compat);
    await connectToDevice(device, compat ? "兼容扫描" : "服务过滤");
  } catch (error) {
    resetConnectionState();
    state.lastConnectionError = {
      message: error.message,
      scanMode: compat ? "compat" : "filtered",
      at: new Date().toISOString(),
    };
    if (options.compat) {
      log("warn", "兼容扫描能看到更多设备，但仍要求板端存在指定 GATT 服务 UUID。");
    }
    log(options.automatic ? "warn" : "error", `连接失败：${error.message}`);
    updateConnectionUi();
    updatePolling();
    if (options.automatic) {
      throw error;
    }
  }
}

function onStatusChanged(event) {
  const text = decoder.decode(event.target.value);
  try {
    const payload = JSON.parse(text);
    if (looksLikeFullStatus(payload)) {
      applyStatus(payload);
      log(payload.ok === false ? "warn" : "ok", `状态：${text}`);
      return;
    }

    requestStatusReadFromNotification();
  } catch {
    requestStatusReadFromNotification();
  }
}

function onDisconnected() {
  const wasManualDisconnect = state.manualDisconnect;
  state.lastDisconnectAt = new Date().toISOString();
  resetConnectionState();
  updateConnectionUi();
  updatePolling();
  log("warn", "蓝牙连接已断开。");
  if (wasManualDisconnect) {
    state.manualDisconnect = false;
    return;
  }
  scheduleAutoReconnect("蓝牙连接已断开");
}

function disconnect() {
  state.manualDisconnect = true;
  cancelAutoReconnect();
  if (state.demo) {
    state.demo = false;
    log("info", "已退出演示模式。");
  }
  if (state.device?.gatt?.connected) {
    state.device.gatt.disconnect();
  }
  resetConnectionState();
  updateConnectionUi();
  updatePolling();
}

function toggleDemo() {
  if (state.connected) {
    log("warn", "已连接真实设备，演示模式未启用。");
    return;
  }
  state.demo = !state.demo;
  if (state.demo) {
    log("ok", "演示模式已启用，可以先体验控制流程。");
    readStatus({ quiet: true });
  } else {
    log("info", "演示模式已关闭。");
  }
  updateConnectionUi();
  updatePolling();
}

function drawTelemetry() {
  const canvas = els.telemetryCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101820";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(216, 224, 234, 0.16)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const points = state.telemetry;
  if (points.length < 2) {
    ctx.fillStyle = "#8da1b5";
    ctx.font = "20px Consolas";
    ctx.fillText("等待遥测数据", 20, 84);
    return;
  }

  const drawLine = (key, color, min, max) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * (width - 24) + 12;
      const normalized = (point[key] - min) / (max - min);
      const y = height - 16 - Math.max(0, Math.min(1, normalized)) * (height - 32);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  };

  drawLine("temperature", "#ffb86b", 0, 50);
  drawLine("humidity", "#63d5ff", 0, 100);

  ctx.fillStyle = "#d8e0ea";
  ctx.font = "16px Consolas";
  ctx.fillText("T", 16, 24);
  ctx.fillStyle = "#63d5ff";
  ctx.fillText("H", 40, 24);
}

function bindEvents() {
  els.connectBtn.addEventListener("click", () => connect({ compat: false }));
  els.compatBtn.addEventListener("click", () => connect({ compat: true }));
  els.disconnectBtn.addEventListener("click", disconnect);
  els.demoBtn.addEventListener("click", toggleDemo);
  els.emergencyBtn.addEventListener("click", emergencyStop);
  els.refreshBtn.addEventListener("click", () => readStatus());
  els.selfTestBtn.addEventListener("click", runSelfTest);
  els.autoRefreshToggle.addEventListener("change", () => {
    state.autoRefresh = els.autoRefreshToggle.checked;
    persistPreferences();
    updatePolling();
    log("info", state.autoRefresh ? "自动刷新已开启。" : "自动刷新已关闭。");
  });
  els.autoReconnectToggle.addEventListener("change", () => {
    state.autoReconnect = els.autoReconnectToggle.checked;
    persistPreferences();
    if (!state.autoReconnect) {
      cancelAutoReconnect();
    }
    log("info", state.autoReconnect ? "自动重连已开启。" : "自动重连已关闭。");
  });
  els.wakeLockToggle.addEventListener("change", () => {
    if (els.wakeLockToggle.checked) {
      requestWakeLock().catch(() => {});
    } else {
      releaseWakeLock().catch(() => {});
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.wakeLockEnabled && !state.wakeLockActive) {
      requestWakeLock({ quiet: true }).catch(() => {});
    }
  });
  $("ledOnBtn").addEventListener("click", () => sendCommandFromUi({ cmd: "rgb", color: "white" }));
  $("ledOffBtn").addEventListener("click", () => sendCommandFromUi({ cmd: "rgb", color: "off" }));
  $("ledToggleBtn").addEventListener("click", () => sendCommandFromUi({ cmd: "rgb", r: 255, g: 120, b: 28 }));
  document.querySelectorAll("[data-rgb]").forEach((button) => {
    button.addEventListener("click", () => sendCommandFromUi({ cmd: "rgb", color: button.dataset.rgb }));
  });
  $("buzzerBeepBtn").addEventListener("click", () => sendCommandFromUi({ cmd: "buzzer", value: "beep", durationMs: 120 }));
  $("buzzerOnBtn").addEventListener("click", () => sendCommandFromUi({ cmd: "buzzer", value: true }));
  $("buzzerOffBtn").addEventListener("click", () => sendCommandFromUi({ cmd: "buzzer", value: false }));
  els.diagnosticsBtn.addEventListener("click", downloadDiagnostics);
  els.exportTelemetryBtn.addEventListener("click", downloadTelemetryCsv);
  els.commandForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const command = parseProtocolCommand(els.commandInput.value.trim());
      els.commandInput.value = JSON.stringify(command);
      sendCommandFromUi(command);
    } catch (error) {
      log("error", `协议命令无效：${error.message}`);
      els.commandInput.focus();
    }
  });
  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendChatFromUi();
  });
  document.querySelectorAll("[data-command-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const command = parseProtocolCommand(button.dataset.commandPreset || "");
        els.commandInput.value = JSON.stringify(command);
        els.commandInput.focus();
      } catch (error) {
        log("error", `协议预设无效：${error.message}`);
      }
    });
  });
  $("clearLogBtn").addEventListener("click", () => {
    els.logList.innerHTML = "";
    state.logs = [];
    log("info", "日志已清空。");
  });

  let servoTimer = 0;
  els.servoRange.addEventListener("input", () => {
    const angle = Number(els.servoRange.value);
    state.status.servo = angle;
    updateDeviceUi();
    window.clearTimeout(servoTimer);
    servoTimer = window.setTimeout(() => sendCommandFromUi({ cmd: "servo", angle }), 120);
  });

  document.querySelectorAll("[data-servo]").forEach((button) => {
    button.addEventListener("click", () => sendCommandFromUi({ cmd: "servo", angle: Number(button.dataset.servo) }));
  });

  els.recordBtn.addEventListener("click", () => {
    state.recording = !state.recording;
    els.recordBtn.textContent = state.recording ? "停止录制" : "开始录制";
    log(state.recording ? "ok" : "info", state.recording ? "开始录制动作。" : "录制已停止。");
  });

  els.exportMacroBtn.addEventListener("click", downloadMacroExport);
  els.importMacroBtn.addEventListener("click", () => {
    els.macroImportInput.value = "";
    els.macroImportInput.click();
  });
  els.macroImportInput.addEventListener("change", () => {
    const file = els.macroImportInput.files?.[0];
    importMacroFromFile(file)
      .catch((error) => log("error", `导入失败：${error.message}`))
      .finally(() => {
        els.macroImportInput.value = "";
      });
  });

  els.clearMacroBtn.addEventListener("click", () => {
    state.macro = [];
    persistPreferences();
    renderMacro();
    log("info", "动作编排已清空。");
  });

  els.showcaseBtn.addEventListener("click", runShowcase);

  els.playMacroBtn.addEventListener("click", async () => {
    if (state.macro.length === 0) {
      log("warn", "没有可回放的动作。");
      return;
    }
    log("info", `开始回放 ${state.macro.length} 步动作。`);
    const wasRecording = state.recording;
    const safetyToken = state.safetyToken;
    state.recording = false;
    els.recordBtn.textContent = "开始录制";
    try {
      for (const item of state.macro) {
        if (state.safetyToken !== safetyToken) {
          log("warn", "动作回放已被急停中断。");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, item.delay));
        if (state.safetyToken !== safetyToken) {
          log("warn", "动作回放已被急停中断。");
          return;
        }
        await sendCommand(item.command);
      }
      log("ok", "动作回放完成。");
    } catch (error) {
      log("error", `动作回放中断：${error.message}`);
    } finally {
      state.recording = state.safetyToken === safetyToken ? wasRecording : false;
      els.recordBtn.textContent = state.recording ? "停止录制" : "开始录制";
    }
  });
}

function boot() {
  registerServiceWorker();
  restorePreferences();
  updateSupport();
  updateConnectionUi();
  updateDeviceUi();
  updateWakeLockUi();
  updateChatUi();
  renderMacro();
  bindEvents();
  window.setInterval(() => {
    if (state.demo && Number.isFinite(state.status.uptimeMs)) {
      state.status.uptimeMs = Math.round(performance.now() - bootedAt);
    }
    updateFreshnessUi();
    updateUptimeUi();
  }, 1000);
  log("info", "控制台已启动。");
}

boot();
