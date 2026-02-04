import './style.css';
import { EventsOn, BrowserOpenURL } from '../wailsjs/runtime/runtime';
import {
  OpenFileDialog,
  LoadProcfile,
  StartProcess,
  StopProcess,
  RestartProcess,
  StartAllProcesses,
  StopAllProcesses,
  SetGlobalAutoRestart,
  GetRecentProjects,
  AddRecentProject,
  SaveLog,
  GetActivePorts,
  KillPort,
  AskOpenCode,
  GetSettings,
  SaveSetting,
  GetInstalledApps,
  GetAppIcon,
  OpenFileInEditor,
  CheckOpenCode,
  EnableProcess
} from '../wailsjs/go/main/App';

// Process colors for visual distinction - vibrant and well-separated hues
const PROCESS_COLORS = [
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#a3e635", // lime
  "#fb923c", // orange
  "#a78bfa", // violet
  "#fbbf24", // amber
  "#34d399", // emerald
  "#f87171", // red
  "#60a5fa", // blue
  "#e879f9", // fuchsia
  "#4ade80", // green
  "#facc15", // yellow
];

// ANSI color codes mapping
const ANSI_COLORS = {
  // Standard colors (30-37)
  30: "#1f2937", // black (dark gray for visibility)
  31: "#ef4444", // red
  32: "#22c55e", // green
  33: "#eab308", // yellow
  34: "#3b82f6", // blue
  35: "#a855f7", // magenta/purple
  36: "#06b6d4", // cyan
  37: "#f3f4f6", // white
  // Bright colors (90-97)
  90: "#6b7280", // bright black (gray)
  91: "#f87171", // bright red
  92: "#4ade80", // bright green
  93: "#fde047", // bright yellow
  94: "#60a5fa", // bright blue
  95: "#c084fc", // bright magenta
  96: "#22d3ee", // bright cyan
  97: "#ffffff", // bright white
};

const ANSI_BG_COLORS = {
  // Background colors (40-47)
  40: "#1f2937", // black
  41: "#dc2626", // red
  42: "#16a34a", // green
  43: "#ca8a04", // yellow
  44: "#2563eb", // blue
  45: "#9333ea", // magenta
  46: "#0891b2", // cyan
  47: "#e5e7eb", // white
  // Bright backgrounds (100-107)
  100: "#4b5563", // bright black
  101: "#ef4444", // bright red
  102: "#22c55e", // bright green
  103: "#eab308", // bright yellow
  104: "#3b82f6", // bright blue
  105: "#a855f7", // bright magenta
  106: "#06b6d4", // bright cyan
  107: "#f9fafb", // bright white
};

// Parse ANSI escape codes and convert to HTML
function parseAnsi(text) {
  // First escape HTML entities
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // ANSI escape sequence regex: ESC[ followed by params and ending with 'm'
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  let result = "";
  let lastIndex = 0;
  let currentStyles = {
    color: null,
    bgColor: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
  };
  let spanOpen = false;

  let match;
  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      if (spanOpen) {
        result += text.slice(lastIndex, match.index);
      } else {
        result += text.slice(lastIndex, match.index);
      }
    }
    lastIndex = ansiRegex.lastIndex;

    // Parse the ANSI codes
    const codes = match[1].split(";").map((c) => parseInt(c, 10) || 0);

    for (const code of codes) {
      if (code === 0) {
        // Reset all
        if (spanOpen) {
          result += "</span>";
          spanOpen = false;
        }
        currentStyles = {
          color: null,
          bgColor: null,
          bold: false,
          dim: false,
          italic: false,
          underline: false,
        };
      } else if (code === 1) {
        currentStyles.bold = true;
      } else if (code === 2) {
        currentStyles.dim = true;
      } else if (code === 3) {
        currentStyles.italic = true;
      } else if (code === 4) {
        currentStyles.underline = true;
      } else if (code === 22) {
        currentStyles.bold = false;
        currentStyles.dim = false;
      } else if (code === 23) {
        currentStyles.italic = false;
      } else if (code === 24) {
        currentStyles.underline = false;
      } else if (code >= 30 && code <= 37) {
        currentStyles.color = ANSI_COLORS[code];
      } else if (code === 39) {
        currentStyles.color = null;
      } else if (code >= 40 && code <= 47) {
        currentStyles.bgColor = ANSI_BG_COLORS[code];
      } else if (code === 49) {
        currentStyles.bgColor = null;
      } else if (code >= 90 && code <= 97) {
        currentStyles.color = ANSI_COLORS[code];
      } else if (code >= 100 && code <= 107) {
        currentStyles.bgColor = ANSI_BG_COLORS[code];
      }
    }

    // Close previous span if open
    if (spanOpen) {
      result += "</span>";
      spanOpen = false;
    }

    // Build new style string
    const styles = [];
    if (currentStyles.color) styles.push(`color:${currentStyles.color}`);
    if (currentStyles.bgColor) styles.push(`background-color:${currentStyles.bgColor}`);
    if (currentStyles.bold) styles.push("font-weight:bold");
    if (currentStyles.dim) styles.push("opacity:0.6");
    if (currentStyles.italic) styles.push("font-style:italic");
    if (currentStyles.underline) styles.push("text-decoration:underline");

    if (styles.length > 0) {
      result += `<span style="${styles.join(";")}">`;
      spanOpen = true;
    }
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result += text.slice(lastIndex);
  }

  // Close any remaining span
  if (spanOpen) {
    result += "</span>";
  }

  return result;
}

// State
const state = {
  processes: {},
  logs: [],
  activeTab: "all",
  procfilePath: null,
  hiddenProcesses: new Set(),
  searchQuery: "",
  showTimestamps: false,
  lastOpenCodeQuestion: "",
  settings: {},
  installedApps: [],
  opencodeInstalled: false,
};

// DOM Elements
const elements = {
  procfilePath: document.getElementById("procfile-path"),
  btnOpen: document.getElementById("btn-open"),
  btnStartAll: document.getElementById("btn-start-all"),
  btnStopAll: document.getElementById("btn-stop-all"),
  btnClearLog: document.getElementById("btn-clear-log"),
  btnCopyPath: document.getElementById("btn-copy-path"),
  btnSaveLog: document.getElementById("btn-save-log"),
  processList: document.getElementById("process-list"),
  logTabs: document.getElementById("log-tabs"),
  logOutput: document.getElementById("log-output"),
  statusText: document.getElementById("status-text"),
  processCount: document.getElementById("process-count"),
  autoRestartToggle: document.getElementById("auto-restart-toggle"),
  recentProjects: document.getElementById("recent-projects"),
  recentProjectsList: document.getElementById("recent-projects-list"),
  logSearch: document.getElementById("log-search"),
  searchCount: document.getElementById("search-count"),
  timestampToggle: document.getElementById("timestamp-toggle"),
  portsList: document.getElementById("ports-list"),
  btnRefreshPorts: document.getElementById("btn-refresh-ports"),
  askOpencodeBar: document.getElementById("ask-opencode-bar"),
  askOpencodeInput: document.getElementById("ask-opencode-input"),
  btnAskOpencode: document.getElementById("btn-ask-opencode"),
  btnCopyOpencodeQ: document.getElementById("btn-copy-opencode-q"),
  btnPickEditor: document.getElementById("btn-pick-editor"),
  appPickerModal: document.getElementById("app-picker-modal"),
  appPickerSearch: document.getElementById("app-picker-search"),
  appPickerList: document.getElementById("app-picker-list"),
  appPickerClose: document.getElementById("app-picker-close"),
  appPickerBackdrop: document.getElementById("app-picker-backdrop"),
};

// Initialize app
async function init() {
  console.log("Initializing app...");
  setupEventListeners();
  setupWailsListeners();
  loadRecentProjects();
  await loadSettings();
  await checkOpenCodeInstalled();
  console.log("App initialized");
}

// Setup DOM event listeners
function setupEventListeners() {
  elements.btnOpen.addEventListener("click", openProcfile);
  elements.btnStartAll.addEventListener("click", startAllProcesses);
  elements.btnStopAll.addEventListener("click", stopAllProcesses);
  elements.btnClearLog.addEventListener("click", clearLogs);
  elements.btnSaveLog.addEventListener("click", saveCurrentLog);
  elements.btnCopyPath.addEventListener("click", copyLogPath);
  elements.autoRestartToggle.addEventListener("change", toggleAutoRestart);

  // Author link
  document.getElementById("author-link").addEventListener("click", () => {
    BrowserOpenURL("https://github.com/dux");
  });

  // Search input
  elements.logSearch.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderLogs();
    updateSearchCount();
  });

  // Timestamp toggle
  elements.timestampToggle.addEventListener("change", (e) => {
    state.showTimestamps = e.target.checked;
    renderLogs();
  });

  // Refresh ports button
  elements.btnRefreshPorts.addEventListener("click", refreshPorts);

  // Ask OpenCode
  elements.btnAskOpencode.addEventListener("click", askOpenCode);
  elements.btnCopyOpencodeQ.addEventListener("click", copyOpenCodeQuestion);
  elements.askOpencodeInput.addEventListener("keydown", handleAskOpencodeKeydown);

  // App picker
  elements.btnPickEditor.addEventListener("click", openAppPicker);
  elements.appPickerClose.addEventListener("click", closeAppPicker);
  elements.appPickerBackdrop.addEventListener("click", closeAppPicker);
  elements.appPickerSearch.addEventListener("input", filterAppPicker);

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
}

// Setup Wails event listeners
function setupWailsListeners() {
  EventsOn("process-output", (data) => {
    console.log("process-output event:", data);
    const { name, line, is_stderr } = data;
    addLogLine(name, line, is_stderr);
  });

  EventsOn("process-status", (data) => {
    console.log("process-status event:", data);
    const { name, status, exit_code } = data;
    updateProcessStatus(name, status, exit_code);
  });

  EventsOn("procfile-loaded", (data) => {
    console.log("procfile-loaded event:", data);
    const { path, processes, env_loaded, env_count } = data;
    handleProcfileLoaded(path, processes, env_loaded, env_count);
  });
}

// Open Procfile dialog
async function openProcfile() {
  try {
    const selected = await OpenFileDialog();

    if (selected) {
      await loadProcfileWithPath(selected);
    }
  } catch (err) {
    console.error("Dialog error:", err);
    setStatus(`Error: ${err}`, true);
  }
}

// Load procfile by path (stops all running processes first)
async function loadProcfileWithPath(path) {
  try {
    // Stop all running processes first
    await StopAllProcesses();

    // Load the new procfile
    await LoadProcfile(path);

    // Add to recent projects
    const recentProjects = await AddRecentProject(path);
    renderRecentProjects(recentProjects);
  } catch (err) {
    console.error("Load error:", err);
    setStatus(`Error: ${err}`, true);
  }
}

// Load and render recent projects
async function loadRecentProjects() {
  try {
    const projects = await GetRecentProjects();
    renderRecentProjects(projects);
  } catch (err) {
    console.error("Failed to load recent projects:", err);
  }
}

// Render recent project buttons
function renderRecentProjects(projects) {
  if (!projects || projects.length === 0) {
    elements.recentProjects.classList.add("hidden");
    return;
  }

  elements.recentProjects.classList.remove("hidden");
  elements.recentProjectsList.innerHTML = "";

  projects.forEach((path) => {
    const btn = document.createElement("button");
    btn.className = "recent-project-btn";

    // Extract project name from path (parent directory name)
    const parts = path.split("/");
    const fileName = parts[parts.length - 1]; // e.g. "Procfile" or "Procfile.foo"
    const projectName = parts[parts.length - 2] || parts[parts.length - 1];

    // Check if Procfile has a suffix (e.g. Procfile.foo -> foo)
    let displayName = projectName;
    if (fileName.startsWith("Procfile.") && fileName.length > 9) {
      const suffix = fileName.substring(9); // everything after "Procfile."
      displayName = `${projectName} (${suffix})`;
    }

    btn.textContent = displayName;
    btn.title = path;

    btn.addEventListener("click", () => loadProcfileWithPath(path));

    elements.recentProjectsList.appendChild(btn);
  });
}

// Handle procfile loaded
function handleProcfileLoaded(path, processes, envLoaded, envCount) {
  state.procfilePath = path;
  state.processes = {};
  state.logs = [];
  state.hiddenProcesses.clear();
  state.searchQuery = "";
  elements.logSearch.value = "";

  elements.procfilePath.textContent = path;
  elements.btnStartAll.disabled = false;

  // Initialize processes
  processes.forEach((proc, index) => {
    state.processes[proc.name] = {
      name: proc.name,
      status: "stopped",
      color: PROCESS_COLORS[index % PROCESS_COLORS.length],
      exitCode: null,
      disabled: proc.disabled || false,
    };
  });

  renderProcessList();
  renderTabs();
  clearLogs();
  updateProcessCount();
  updateSearchCount();

  const activeCount = processes.filter(p => !p.disabled).length;
  let statusMsg = `Loaded ${activeCount} processes from Procfile`;
  if (processes.length > activeCount) {
    statusMsg += ` (${processes.length - activeCount} disabled)`;
  }
  if (envLoaded) {
    statusMsg += ` (${envCount} env vars from .env)`;
  }
  setStatus(statusMsg);
}

// Render process list in sidebar
function renderProcessList() {
  elements.processList.innerHTML = "";

  Object.values(state.processes).forEach((process) => {
    const item = document.createElement("div");
    const isRunning = process.status === "running";
    const isDisabled = process.disabled;
    item.className = `process-item${isRunning ? " running" : ""}${isDisabled ? " disabled" : ""}`;
    item.dataset.process = process.name;

    const isHidden = state.hiddenProcesses.has(process.name);

    if (isDisabled) {
      // Disabled process: show greyed out, clickable to enable
      item.innerHTML = `
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="status-dot disabled"></span>
          <span class="truncate text-gray-500">${process.name}</span>
        </div>
        <span class="text-xs text-gray-600 italic">disabled</span>
      `;
      item.style.cursor = "pointer";
      item.title = "Click to enable this process";
      item.addEventListener("click", async () => {
        try {
          setStatus(`Enabling ${process.name}...`);
          await EnableProcess(process.name);
          setStatus(`Enabled ${process.name}`);
        } catch (err) {
          setStatus(`Error enabling process: ${err}`, true);
        }
      });
    } else {
      item.innerHTML = `
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="status-dot ${process.status}" style="background-color: ${isRunning ? process.color : ''}"></span>
          <span class="truncate">${process.name}</span>
        </div>
        <div class="process-actions">
          <button class="action-btn" data-action="toggle-visibility" title="${isHidden ? 'Show' : 'Hide'} output">
            ${isHidden ? eyeOffIcon() : eyeIcon()}
          </button>
          ${isRunning ? `
            <button class="action-btn" data-action="restart" title="Restart">
              ${restartIcon()}
            </button>
            <button class="action-btn text-red-400" data-action="stop" title="Stop">
              ${stopIcon()}
            </button>
          ` : `
            <button class="action-btn text-green-400" data-action="start" title="Start">
              ${playIcon()}
            </button>
          `}
        </div>
      `;

      // Event listeners for action buttons (only for non-disabled)
      item.querySelectorAll(".action-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          handleProcessAction(process.name, action);
        });
      });
    }

    elements.processList.appendChild(item);
  });
}

// Render tabs
function renderTabs() {
  elements.logTabs.innerHTML = "";

  // Create "All" tab
  const allTab = document.createElement("button");
  allTab.className = "tab-btn active px-4 py-2 text-sm";
  allTab.dataset.process = "all";
  allTab.textContent = "All";
  allTab.addEventListener("click", () => setActiveTab("all"));
  elements.logTabs.appendChild(allTab);

  Object.values(state.processes).forEach((process) => {
    const tab = document.createElement("button");
    tab.className = "tab-btn px-4 py-2 text-sm";
    tab.dataset.process = process.name;
    tab.style.borderColor = process.color;
    tab.innerHTML = `<span style="color: ${process.color}">${process.name}</span>`;

    tab.addEventListener("click", () => setActiveTab(process.name));

    elements.logTabs.appendChild(tab);
  });

  setActiveTab("all");
}

// Set active tab
function setActiveTab(processName) {
  state.activeTab = processName;

  elements.logTabs.querySelectorAll(".tab-btn").forEach((tab) => {
    if (tab.dataset.process === processName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Show/hide Save button (only for individual process tabs)
  if (processName === "all") {
    elements.btnCopyPath.classList.add("hidden");
    elements.btnSaveLog.classList.add("hidden");
    elements.askOpencodeBar.classList.add("hidden");
  } else {
    elements.btnCopyPath.classList.remove("hidden");
    elements.btnSaveLog.classList.remove("hidden");
    elements.askOpencodeBar.classList.remove("hidden");
  }

  renderLogs();
}

// Handle process actions
async function handleProcessAction(name, action) {
  try {
    switch (action) {
      case "start":
        await StartProcess(name);
        break;
      case "stop":
        await StopProcess(name);
        break;
      case "restart":
        await RestartProcess(name);
        break;
      case "toggle-visibility":
        if (state.hiddenProcesses.has(name)) {
          state.hiddenProcesses.delete(name);
        } else {
          state.hiddenProcesses.add(name);
        }
        renderProcessList();
        renderLogs();
        break;
    }
  } catch (err) {
    setStatus(`Error: ${err}`, true);
  }
}

// Start all processes
async function startAllProcesses() {
  try {
    await StartAllProcesses();
    setStatus("Starting all processes...");
  } catch (err) {
    setStatus(`Error: ${err}`, true);
  }
}

// Stop all processes
async function stopAllProcesses() {
  try {
    await StopAllProcesses();
    setStatus("Stopping all processes...");
  } catch (err) {
    setStatus(`Error: ${err}`, true);
  }
}

// Toggle auto-restart global setting
async function toggleAutoRestart() {
  const enabled = elements.autoRestartToggle.checked;
  try {
    await SetGlobalAutoRestart(enabled);
    setStatus(`Auto-restart ${enabled ? "enabled" : "disabled"}`);
  } catch (err) {
    setStatus(`Error: ${err}`, true);
  }
}

// Save current process log to file
async function saveCurrentLog() {
  if (state.activeTab === "all") return;

  const processLogs = state.logs.filter((log) => log.name === state.activeTab);
  if (processLogs.length === 0) {
    setStatus("No logs to save");
    return;
  }

  const content = processLogs.map((log) => log.line).join("\n");

  try {
    const filePath = await SaveLog(state.activeTab, content);
    setStatus(`Log saved to ${filePath}`);
  } catch (err) {
    setStatus(`Error saving log: ${err}`, true);
  }
}

// Copy log path to clipboard
async function copyLogPath() {
  if (state.activeTab === "all") return;

  const processLogs = state.logs.filter((log) => log.name === state.activeTab);
  if (processLogs.length === 0) {
    setStatus("No logs to copy path for");
    return;
  }

  const content = processLogs.map((log) => {
    const cleanLine = log.line.replace(/\x1b\[[0-9;]*m/g, "");
    return cleanLine;
  }).join("\n");

  try {
    const filePath = await SaveLog(state.activeTab, content);
    await navigator.clipboard.writeText(filePath);
    setStatus(`Path copied: ${filePath}`);
  } catch (err) {
    setStatus(`Error copying path: ${err}`, true);
  }
}

// Update process status
function updateProcessStatus(name, status, exitCode) {
  if (state.processes[name]) {
    state.processes[name].status = status;
    state.processes[name].exitCode = exitCode;
    renderProcessList();
    updateProcessCount();

    if (status === "stopped" && exitCode !== null && exitCode !== 0) {
      addLogLine(name, `Process exited with code ${exitCode}`, true);
    }
  }
}

// Add log line
function addLogLine(name, line, isStderr = false) {
  console.log("addLogLine called:", name, line, isStderr);
  const process = state.processes[name];
  if (!process) {
    console.log("Process not found:", name, "Available:", Object.keys(state.processes));
    return;
  }

  state.logs.push({
    name,
    line,
    isStderr,
    color: process.color,
    timestamp: new Date(),
  });

  // Keep only last 10000 lines
  if (state.logs.length > 10000) {
    state.logs = state.logs.slice(-10000);
  }

  appendLogLine({ name, line, isStderr, color: process.color });
}

// Append single log line (for real-time updates)
function appendLogLine(log) {
  // Check if should be visible
  if (state.activeTab !== "all" && state.activeTab !== log.name) return;
  if (state.hiddenProcesses.has(log.name)) return;
  // Filter by search query
  if (state.searchQuery && !log.line.toLowerCase().includes(state.searchQuery)) {
    // Still update search count
    updateSearchCount();
    return;
  }

  const showPrefix = state.activeTab === "all";
  const logLine = createLogLineElement(log, showPrefix);
  elements.logOutput.appendChild(logLine);

  // Update search count if we have a search query
  if (state.searchQuery) {
    updateSearchCount();
  }

  // Auto-scroll if near bottom
  const container = elements.logOutput.parentElement;
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  if (isNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

// Create log line element
function createLogLineElement(log, showPrefix = true) {
  const div = document.createElement("div");
  div.className = `log-line ${log.isStderr ? 'stderr' : ''}`;

  const timestampHtml = state.showTimestamps
    ? `<span class="log-timestamp text-gray-500">[${formatTimestamp(log.timestamp)}]</span> `
    : '';

  const contentHtml = linkifyFilePaths(highlightMatches(log.line, state.searchQuery));

  if (showPrefix) {
    div.innerHTML = `
      ${timestampHtml}<span class="log-prefix" style="color: ${log.color}">${log.name}</span>
      <span class="log-content">${contentHtml}</span>
    `;
  } else {
    div.innerHTML = `${timestampHtml}<span class="log-content">${contentHtml}</span>`;
  }

  // Attach click handlers to file links
  div.querySelectorAll(".file-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      let file = link.dataset.file;
      const line = parseInt(link.dataset.line, 10) || 1;

      // Resolve relative paths against Procfile directory
      if (!file.startsWith("/") && state.procfilePath) {
        const procfileDir = state.procfilePath.substring(0, state.procfilePath.lastIndexOf("/"));
        // Remove leading ./ if present
        if (file.startsWith("./")) file = file.substring(2);
        file = procfileDir + "/" + file;
      }

      OpenFileInEditor(file, line).catch((err) => {
        setStatus(`Error opening file: ${err}`, true);
      });
    });
  });

  return div;
}

// Render all visible logs
function renderLogs() {
  elements.logOutput.innerHTML = "";

  // First filter by tab and hidden processes
  const filteredLogs = state.logs.filter((log) => {
    if (state.activeTab !== "all" && state.activeTab !== log.name) return false;
    if (state.hiddenProcesses.has(log.name)) return false;
    return true;
  });

  // If search query, show context lines
  if (state.searchQuery) {
    const matchIndices = [];
    filteredLogs.forEach((log, idx) => {
      if (log.line.toLowerCase().includes(state.searchQuery)) {
        matchIndices.push(idx);
      }
    });

    if (matchIndices.length === 0) {
      elements.logOutput.innerHTML = '<div class="text-gray-500 italic">No matching log lines found.</div>';
      return;
    }

    // Build set of indices to show (matches + 2 context lines above/below)
    const indicesToShow = new Set();
    const contextSize = 2;

    matchIndices.forEach((matchIdx) => {
      for (let i = matchIdx - contextSize; i <= matchIdx + contextSize; i++) {
        if (i >= 0 && i < filteredLogs.length) {
          indicesToShow.add(i);
        }
      }
    });

    // Convert to sorted array
    const sortedIndices = Array.from(indicesToShow).sort((a, b) => a - b);

    // Render with separators between non-consecutive groups
    const showPrefix = state.activeTab === "all";
    let lastIdx = -1;

    sortedIndices.forEach((idx) => {
      // Add separator if there's a gap
      if (lastIdx !== -1 && idx > lastIdx + 1) {
        const separator = document.createElement("div");
        separator.className = "log-separator";
        separator.innerHTML = '<span>···</span>';
        elements.logOutput.appendChild(separator);
      }

      const log = filteredLogs[idx];
      const isMatch = log.line.toLowerCase().includes(state.searchQuery);
      const logEl = createLogLineElement(log, showPrefix);
      if (isMatch) {
        logEl.classList.add("search-match");
      }
      elements.logOutput.appendChild(logEl);
      lastIdx = idx;
    });
  } else {
    // No search - show all filtered logs
    if (filteredLogs.length === 0) {
      elements.logOutput.innerHTML = '<div class="text-gray-500 italic">No output to display.</div>';
      return;
    }

    const showPrefix = state.activeTab === "all";
    filteredLogs.forEach((log) => {
      elements.logOutput.appendChild(createLogLineElement(log, showPrefix));
    });
  }

  // Scroll to bottom
  const container = elements.logOutput.parentElement;
  container.scrollTop = container.scrollHeight;
}

// Clear logs
function clearLogs() {
  state.logs = [];
  elements.logOutput.innerHTML = '<div class="text-gray-500 italic">No processes running. Click "Start All" to begin.</div>';
}

// Update process count
function updateProcessCount() {
  const activeProcesses = Object.values(state.processes).filter((p) => !p.disabled);
  const total = activeProcesses.length;
  const running = activeProcesses.filter((p) => p.status === "running").length;
  elements.processCount.textContent = `${running}/${total} running`;

  // Enable/disable Stop All button based on running processes
  elements.btnStopAll.disabled = running === 0;
}

// Set status text
function setStatus(text, isError = false) {
  elements.statusText.textContent = text;
  elements.statusText.className = isError ? "text-red-400" : "";
}

// Show toast message in center of screen
function showToast(text, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.querySelector("div").textContent = text;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), duration);
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Icons
function playIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>`;
}

function stopIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" /></svg>`;
}

function restartIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`;
}

function eyeIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`;
}

function eyeOffIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>`;
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Don't trigger shortcuts if user is typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      // Allow Escape to blur input
      if (e.key === "Escape") {
        e.target.blur();
        clearSearch();
      }
      return;
    }

    // Ctrl/Cmd + Shift + R: Restart all processes
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "R") {
      e.preventDefault();
      restartAllProcesses();
      return;
    }

    // Ctrl/Cmd + Shift + S: Stop all processes
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
      e.preventDefault();
      stopAllProcesses();
      return;
    }

    // Ctrl/Cmd + Shift + A: Start all processes
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "A") {
      e.preventDefault();
      startAllProcesses();
      return;
    }

    // Ctrl/Cmd + L: Clear logs
    if ((e.ctrlKey || e.metaKey) && e.key === "l") {
      e.preventDefault();
      clearLogs();
      return;
    }

    // Ctrl/Cmd + F: Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      focusSearch();
      return;
    }

    // Ctrl/Cmd + O: Open Procfile
    if ((e.ctrlKey || e.metaKey) && e.key === "o") {
      e.preventDefault();
      openProcfile();
      return;
    }

    // Escape: Clear search
    if (e.key === "Escape") {
      clearSearch();
      return;
    }
  });
}

// Restart all processes
async function restartAllProcesses() {
  try {
    await StopAllProcesses();
    // Small delay before starting
    setTimeout(async () => {
      await StartAllProcesses();
      setStatus("Restarting all processes...");
    }, 500);
  } catch (err) {
    setStatus(`Error: ${err}`, true);
  }
}

// Focus search input
function focusSearch() {
  const searchInput = document.getElementById("log-search");
  if (searchInput) {
    searchInput.focus();
  }
}

// Clear search
function clearSearch() {
  const searchInput = document.getElementById("log-search");
  if (searchInput) {
    searchInput.value = "";
    state.searchQuery = "";
    renderLogs();
    updateSearchCount();
  }
}

// Update search match count
function updateSearchCount() {
  if (!state.searchQuery) {
    elements.searchCount.classList.add("hidden");
    return;
  }

  const matchCount = state.logs.filter((log) => {
    if (state.activeTab !== "all" && state.activeTab !== log.name) return false;
    if (state.hiddenProcesses.has(log.name)) return false;
    return log.line.toLowerCase().includes(state.searchQuery);
  }).length;

  elements.searchCount.textContent = `${matchCount}`;
  elements.searchCount.classList.remove("hidden");
}

// Format timestamp
function formatTimestamp(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

// Linkify file paths in HTML content
// Matches paths like /path/file.ext or path/file.ext, optionally with :line or :line:col
function linkifyFilePaths(html) {
  if (!state.settings.textEditor) return html;

  // Split by HTML tags to only process text nodes
  const parts = html.split(/(<[^>]+>)/);
  return parts.map(part => {
    if (part.startsWith('<')) return part; // HTML tag, skip
    // Match paths: must contain at least one / and end with .ext
    // Optionally followed by :line or :line:col
    return part.replace(
      /([a-zA-Z0-9_.\-\/]+\/[a-zA-Z0-9_.\-]+\.\w+)(?::(\d+)(?::(\d+))?)?/g,
      (match, filePath, line, col) => {
        const lineNum = line || "1";
        let display = filePath;
        if (line) display += `:${line}`;
        if (col) display += `:${col}`;
        return `<a class="file-link" data-file="${filePath}" data-line="${lineNum}" title="Open in editor">${display}</a>`;
      }
    );
  }).join('');
}

// Highlight search matches in text (works on plain text, before ANSI parsing)
function highlightMatches(text, query) {
  if (!query) return parseAnsi(text);

  // For search highlighting with ANSI, we need to:
  // 1. Strip ANSI codes for search
  // 2. If match found, highlight in the ANSI-parsed version

  const plainText = text.replace(/\x1b\[[0-9;]*m/g, "");
  const lowerPlain = plainText.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (!lowerPlain.includes(lowerQuery)) {
    return parseAnsi(text);
  }

  // Parse ANSI first, then try to highlight
  // This is a simplified approach - highlight in the parsed HTML
  let parsed = parseAnsi(text);

  // Escape regex special chars in query
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  // We need to be careful not to match inside HTML tags
  // Split by tags, highlight only text portions
  const parts = parsed.split(/(<[^>]+>)/);
  parsed = parts.map(part => {
    if (part.startsWith('<')) {
      return part; // HTML tag, don't modify
    }
    return part.replace(regex, '<mark class="bg-yellow-500/50 text-white">$1</mark>');
  }).join('');

  return parsed;
}

// Refresh active ports list
async function refreshPorts() {
  elements.portsList.innerHTML = '<div class="text-xs text-gray-500 italic px-2">Scanning...</div>';

  try {
    const ports = await GetActivePorts();

    if (!ports || ports.length === 0) {
      elements.portsList.innerHTML = '<div class="text-xs text-gray-500 italic px-2">No active ports (3000-9000)</div>';
      return;
    }

    renderPorts(ports);
  } catch (err) {
    elements.portsList.innerHTML = `<div class="text-xs text-red-400 px-2">Error: ${err}</div>`;
  }
}

// Render ports list
function renderPorts(ports) {
  elements.portsList.innerHTML = "";

  ports.forEach((portInfo) => {
    const item = document.createElement("div");
    item.className = "port-item";

    item.innerHTML = `
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <span class="port-number">${portInfo.port}</span>
        <span class="port-process truncate" title="${escapeHtml(portInfo.command)}">${escapeHtml(portInfo.process)}</span>
      </div>
      <button class="port-kill-btn" data-port="${portInfo.port}" title="Kill process (PID: ${portInfo.pid})">
        ${killIcon()}
      </button>
    `;

    // Kill button handler
    item.querySelector(".port-kill-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      await killPortProcess(portInfo.port);
    });

    elements.portsList.appendChild(item);
  });
}

// Kill process on port
async function killPortProcess(port) {
  try {
    await KillPort(port);
    setStatus(`Killed process on port ${port}`);
    // Refresh the list after a short delay
    setTimeout(refreshPorts, 500);
  } catch (err) {
    setStatus(`Error killing port ${port}: ${err}`, true);
  }
}

// Kill icon
function killIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`;
}

// Ask OpenCode with logs as context
async function askOpenCode() {
  const question = elements.askOpencodeInput.value.trim();
  if (!question) {
    setStatus("Please enter a question for OpenCode");
    return;
  }

  if (state.activeTab === "all") {
    setStatus("Please select a specific process tab first");
    return;
  }

  // Get last 200 log lines for the current process
  const processLogs = state.logs
    .filter((log) => log.name === state.activeTab)
    .slice(-200)
    .map((log) => {
      const timestamp = state.showTimestamps ? `[${formatTimestamp(log.timestamp)}] ` : "";
      // Strip ANSI codes for clean output
      const cleanLine = log.line.replace(/\x1b\[[0-9;]*m/g, "");
      return `${timestamp}${cleanLine}`;
    })
    .join("\n");

  if (!processLogs) {
    setStatus("No logs available for this process");
    return;
  }

  try {
    setStatus("Opening OpenCode...");
    await AskOpenCode(state.activeTab, processLogs, question);
    // Save the question and clear input
    state.lastOpenCodeQuestion = question;
    elements.askOpencodeInput.value = "";
    setStatus("OpenCode session opened in terminal");
  } catch (err) {
    setStatus(`Error opening OpenCode: ${err}`, true);
  }
}

// Copy OpenCode question with log path to clipboard
async function copyOpenCodeQuestion() {
  const question = elements.askOpencodeInput.value.trim();
  if (!question) {
    setStatus("Please enter a question");
    return;
  }

  if (state.activeTab === "all") {
    setStatus("Please select a specific process tab first");
    return;
  }

  const processLogs = state.logs
    .filter((log) => log.name === state.activeTab)
    .slice(-200)
    .map((log) => log.line.replace(/\x1b\[[0-9;]*m/g, ""))
    .join("\n");

  if (!processLogs) {
    setStatus("No logs available for this process");
    return;
  }

  try {
    const filePath = await SaveLog(state.activeTab, processLogs);
    const text = `use this log ${filePath} to answer this question: ${question}`;
    await navigator.clipboard.writeText(text);
    state.lastOpenCodeQuestion = question;
    elements.askOpencodeInput.value = "";
    showToast("Question copied to clipboard, paste it to your favorite LLM");
  } catch (err) {
    setStatus(`Error: ${err}`, true);
  }
}

// Handle keydown on Ask OpenCode input
function handleAskOpencodeKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    askOpenCode();
    return;
  }
  // Up arrow: restore last question if input is empty
  if (e.key === "ArrowUp" && elements.askOpencodeInput.value === "" && state.lastOpenCodeQuestion) {
    e.preventDefault();
    elements.askOpencodeInput.value = state.lastOpenCodeQuestion;
  }
}

// --- Settings ---

async function loadSettings() {
  try {
    state.settings = await GetSettings();
    updateEditorButton();
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

function updateEditorButton() {
  const editor = state.settings.textEditor;
  if (editor) {
    // Show just the app name without .app
    const name = editor.split("/").pop().replace(/\.app$/, "");
    elements.btnPickEditor.textContent = name;
    elements.btnPickEditor.title = editor;
  } else {
    elements.btnPickEditor.textContent = "Not set";
    elements.btnPickEditor.title = "Click to select text editor";
  }
}

async function checkOpenCodeInstalled() {
  try {
    const path = await CheckOpenCode();
    state.opencodeInstalled = !!path;
    if (state.opencodeInstalled) {
      elements.btnAskOpencode.disabled = false;
      elements.btnAskOpencode.classList.remove("hidden");
    }
  } catch (err) {
    state.opencodeInstalled = false;
  }
}

// --- App Picker ---

async function openAppPicker() {
  elements.appPickerModal.classList.remove("hidden");
  elements.appPickerSearch.value = "";
  elements.appPickerSearch.focus();

  if (state.installedApps.length === 0) {
    elements.appPickerList.innerHTML = '<div class="text-xs text-gray-500 italic px-2 py-4">Loading apps...</div>';
    try {
      state.installedApps = await GetInstalledApps();
    } catch (err) {
      elements.appPickerList.innerHTML = `<div class="text-xs text-red-400 px-2">Error: ${err}</div>`;
      return;
    }
  }

  renderAppPickerList("");
}

function closeAppPicker() {
  elements.appPickerModal.classList.add("hidden");
}

function filterAppPicker() {
  renderAppPickerList(elements.appPickerSearch.value.toLowerCase());
}

function renderAppPickerList(filter) {
  elements.appPickerList.innerHTML = "";

  const filtered = state.installedApps.filter((app) => {
    const name = app.split("|")[0].toLowerCase();
    return !filter || name.includes(filter);
  });

  if (filtered.length === 0) {
    elements.appPickerList.innerHTML = '<div class="text-xs text-gray-500 italic px-2 py-4">No matching apps</div>';
    return;
  }

  filtered.forEach((app) => {
    const [name, path] = app.split("|");
    const isSelected = state.settings.textEditor === path;
    const btn = document.createElement("button");
    btn.className = `w-full text-left px-3 py-1.5 rounded text-sm transition flex items-center gap-2 ${isSelected ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"}`;

    const icon = document.createElement("img");
    icon.className = "w-5 h-5 shrink-0 rounded";
    icon.style.imageRendering = "auto";
    // Placeholder while loading
    icon.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' fill='%234b5563' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";

    const label = document.createElement("span");
    label.className = "truncate";
    label.textContent = name;

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.title = path;

    // Load icon lazily
    GetAppIcon(path).then((dataUri) => {
      if (dataUri) icon.src = dataUri;
    });

    btn.addEventListener("click", async () => {
      try {
        await SaveSetting("textEditor", path);
        state.settings.textEditor = path;
        updateEditorButton();
        closeAppPicker();
        setStatus(`Editor set to ${name}`);
      } catch (err) {
        setStatus(`Error saving setting: ${err}`, true);
      }
    });
    elements.appPickerList.appendChild(btn);
  });
}

// Initialize
init();
