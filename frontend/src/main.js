import './style.css';
import { EventsOn } from '../wailsjs/runtime/runtime';
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
  SaveLog
} from '../wailsjs/go/main/App';

// Process colors for visual distinction
const PROCESS_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
];

// State
const state = {
  processes: {},
  logs: [],
  activeTab: "all",
  procfilePath: null,
  hiddenProcesses: new Set(),
};

// DOM Elements
const elements = {
  procfilePath: document.getElementById("procfile-path"),
  btnOpen: document.getElementById("btn-open"),
  btnStartAll: document.getElementById("btn-start-all"),
  btnStopAll: document.getElementById("btn-stop-all"),
  btnClearLog: document.getElementById("btn-clear-log"),
  btnSaveLog: document.getElementById("btn-save-log"),
  processList: document.getElementById("process-list"),
  logTabs: document.getElementById("log-tabs"),
  logOutput: document.getElementById("log-output"),
  statusText: document.getElementById("status-text"),
  processCount: document.getElementById("process-count"),
  autoRestartToggle: document.getElementById("auto-restart-toggle"),
  recentProjects: document.getElementById("recent-projects"),
  recentProjectsList: document.getElementById("recent-projects-list"),
};

// Initialize app
async function init() {
  console.log("Initializing app...");
  setupEventListeners();
  setupWailsListeners();
  loadRecentProjects();
  console.log("App initialized");
}

// Setup DOM event listeners
function setupEventListeners() {
  elements.btnOpen.addEventListener("click", openProcfile);
  elements.btnStartAll.addEventListener("click", startAllProcesses);
  elements.btnStopAll.addEventListener("click", stopAllProcesses);
  elements.btnClearLog.addEventListener("click", clearLogs);
  elements.btnSaveLog.addEventListener("click", saveCurrentLog);
  elements.autoRestartToggle.addEventListener("change", toggleAutoRestart);
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
    const { path, processes } = data;
    handleProcfileLoaded(path, processes);
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
function handleProcfileLoaded(path, processes) {
  state.procfilePath = path;
  state.processes = {};
  state.logs = [];
  state.hiddenProcesses.clear();

  elements.procfilePath.textContent = path;
  elements.btnStartAll.disabled = false;

  // Initialize processes
  processes.forEach((name, index) => {
    state.processes[name] = {
      name,
      status: "stopped",
      color: PROCESS_COLORS[index % PROCESS_COLORS.length],
      exitCode: null,
    };
  });

  renderProcessList();
  renderTabs();
  clearLogs();
  updateProcessCount();
  setStatus(`Loaded ${processes.length} processes from Procfile`);
}

// Render process list in sidebar
function renderProcessList() {
  elements.processList.innerHTML = "";

  Object.values(state.processes).forEach((process) => {
    const item = document.createElement("div");
    const isRunning = process.status === "running";
    item.className = `process-item${isRunning ? " running" : ""}`;
    item.dataset.process = process.name;

    const isHidden = state.hiddenProcesses.has(process.name);

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

    // Event listeners for action buttons
    item.querySelectorAll(".action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleProcessAction(process.name, action);
      });
    });

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
    elements.btnSaveLog.classList.add("hidden");
  } else {
    elements.btnSaveLog.classList.remove("hidden");
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

  const showPrefix = state.activeTab === "all";
  const logLine = createLogLineElement(log, showPrefix);
  elements.logOutput.appendChild(logLine);

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
  div.className = `log-line ${log.isStderr ? 'text-red-400' : ''}`;
  if (showPrefix) {
    div.innerHTML = `
      <span class="log-prefix" style="color: ${log.color}">${log.name}</span>
      <span class="log-content">${escapeHtml(log.line)}</span>
    `;
  } else {
    div.innerHTML = `<span class="log-content">${escapeHtml(log.line)}</span>`;
  }
  return div;
}

// Render all visible logs
function renderLogs() {
  elements.logOutput.innerHTML = "";

  const visibleLogs = state.logs.filter((log) => {
    if (state.activeTab !== "all" && state.activeTab !== log.name) return false;
    if (state.hiddenProcesses.has(log.name)) return false;
    return true;
  });

  if (visibleLogs.length === 0) {
    elements.logOutput.innerHTML = '<div class="text-gray-500 italic">No output to display.</div>';
    return;
  }

  const showPrefix = state.activeTab === "all";
  visibleLogs.forEach((log) => {
    elements.logOutput.appendChild(createLogLineElement(log, showPrefix));
  });

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
  const total = Object.keys(state.processes).length;
  const running = Object.values(state.processes).filter((p) => p.status === "running").length;
  elements.processCount.textContent = `${running}/${total} running`;

  // Enable/disable Stop All button based on running processes
  elements.btnStopAll.disabled = running === 0;
}

// Set status text
function setStatus(text, isError = false) {
  elements.statusText.textContent = text;
  elements.statusText.className = isError ? "text-red-400" : "";
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

// Initialize
init();
