/**
 * GenAI Reproducibility Tracker - Multi-Project Support
 * Manages multiple projects, each with its own research plan, checklist, and timeline.
 */

// ============================================================================
// STATE & CONSTANTS
// ============================================================================

let currentProjectId = null;
let projects = {}; // { projectId: { id, name, researchPlan, projectStage, config, checklist, timeline } }

const STORAGE_KEY = "genai_projects";
const CURRENT_PROJECT_KEY = "genai_current_project";

const TAB_KEYS = {
  SETUP: "setup",
  CHECKLIST: "checklist",
  TIMELINE: "timeline",
};

const STATIC_TRACKING_ITEMS = [
  "Log prompt changes (if modified from initial)",
  "Track temperature updates (if adjusted)",
  "Record model version changes (if switched)",
  "Document performance metrics (if available)",
  "Note data modifications or augmentations",
  "Track hyperparameter adjustments",
  "Document test/validation results",
];

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const projectSelector = document.getElementById("project-selector");
const newProjectBtn = document.getElementById("new-project-btn");
const deleteProjectBtn = document.getElementById("delete-project-btn");
const configForm = document.getElementById("config-form");
const statusArea = document.getElementById("status-area");
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");
const checklistItemsContainer = document.getElementById("checklist-items");
const checklistSection = document.getElementById("checklist-section");
const checklistEmpty = document.getElementById("checklist-empty");
const timelineContainer = document.getElementById("timeline-container");
const timelineSection = document.getElementById("timeline-section");
const timelineEmpty = document.getElementById("timeline-empty");
const exportBtn = document.getElementById("export-btn");
const generateBtn = document.getElementById("generate-btn");

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  loadProjectsFromStorage();
  setupEventListeners();
  renderProjectsList();
  const savedProjectId = localStorage.getItem(CURRENT_PROJECT_KEY);
  if (savedProjectId && projects[savedProjectId]) {
    switchProject(savedProjectId);
  }
});

function setupEventListeners() {
  projectSelector.addEventListener("change", (e) => {
    if (e.target.value) switchProject(e.target.value);
  });

  newProjectBtn.addEventListener("click", createNewProject);
  deleteProjectBtn.addEventListener("click", deleteCurrentProject);

  configForm.addEventListener("submit", generateChecklistForCurrentProject);
  exportBtn.addEventListener("click", exportCurrentProject);

  tabButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      const tabKey = e.target.dataset.tab;
      switchTab(tabKey);
    });
  });

  window.addEventListener("message", handleExtensionMessage);
}

// ============================================================================
// PROJECT MANAGEMENT
// ============================================================================

function loadProjectsFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      projects = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to load projects:", e);
      projects = {};
    }
  }
}

function saveProjectsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function createNewProject() {
  const name = prompt("Enter a name for the new project:").trim();
  if (!name) return;

  const projectId = `project-${Date.now()}`;
  projects[projectId] = {
    id: projectId,
    name,
    researchPlan: "",
    projectStage: "unspecified",
    openrouterApiKey: "",
    customModel: "",
    config: {
      modelName: "amazon/nova-2-lite-v1:free",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 900,
      topP: 1,
    },
    checklist: [],
    timeline: [],
  };

  saveProjectsToStorage();
  renderProjectsList();
  switchProject(projectId);
  // Ensure the setup form is visible when a project is created
  configForm.hidden = false;
  setStatus(`✓ Project "${name}" created`, "success");
}

function switchProject(projectId) {
  if (!projects[projectId]) return;

  currentProjectId = projectId;
  localStorage.setItem(CURRENT_PROJECT_KEY, projectId);

  // Populate form with current project data
  const project = projects[projectId];
  configForm.researchPlan.value = project.researchPlan || "";
  configForm.projectStage.value = project.projectStage || "";
  configForm.openrouterApiKey.value = project.openrouterApiKey || "";
  configForm.customModel.value = project.customModel || "";
  configForm.modelName.value = project.config.modelName || "";
  configForm.systemPrompt.value = project.config.systemPrompt || "";
  configForm.temperature.value = project.config.temperature || 0.7;
  configForm.maxTokens.value = project.config.maxTokens || 900;
  configForm.topP.value = project.config.topP || 1;

  projectSelector.value = projectId;
  deleteProjectBtn.hidden = false;
  renderProjectsList();
  renderChecklist();
  renderTimeline();
  switchTab(TAB_KEYS.SETUP);
  setStatus(`Switched to project: ${project.name}`, "info");

  // Emit state for extension
  // Make sure the config form is visible for the active project
  configForm.hidden = false;
  emitProjectState();
}

function deleteCurrentProject() {
  if (!currentProjectId || !confirm("Are you sure you want to delete this project?")) return;

  const projectName = projects[currentProjectId].name;
  delete projects[currentProjectId];
  currentProjectId = null;
  localStorage.removeItem(CURRENT_PROJECT_KEY);

  saveProjectsToStorage();
  renderProjectsList();
  deleteProjectBtn.hidden = true;
  clearForm();
  // Hide the setup form when no project is active
  configForm.hidden = true;
  checklistSection.hidden = true;
  timelineSection.hidden = true;
  setStatus(`✓ Project "${projectName}" deleted`, "success");
}

function renderProjectsList() {
  const projectIds = Object.keys(projects);
  const options = projectIds.map(
    (id) => `<option value="${id}">${escapeHtml(projects[id].name)}</option>`
  );

  projectSelector.innerHTML = '<option value="">Select a project...</option>' + options.join("");
  if (currentProjectId) projectSelector.value = currentProjectId;
}

function clearForm() {
  configForm.reset();
  configForm.temperature.value = 0.7;
  configForm.maxTokens.value = 900;
  configForm.topP.value = 1;
  checklistItemsContainer.innerHTML = "";
  timelineContainer.innerHTML = "";
  statusArea.textContent = "";
}

// ============================================================================
// CHECKLIST GENERATION
// ============================================================================

async function generateChecklistForCurrentProject(e) {
  e.preventDefault();
  if (!currentProjectId) {
    setStatus("Please select or create a project first.", "error");
    return;
  }

  const formData = new FormData(configForm);
  const researchPlan = formData.get("researchPlan")?.trim();
  const projectStage = formData.get("projectStage")?.trim() || "unspecified";
  const openrouterApiKey = formData.get("openrouterApiKey")?.trim() || "";
  const customModel = formData.get("customModel")?.trim() || "";

  if (!researchPlan || researchPlan.length < 25) {
    setStatus("Please provide at least a few sentences describing your project.", "error");
    return;
  }

  // Save form data to current project
  const project = projects[currentProjectId];
  project.researchPlan = researchPlan;
  project.projectStage = projectStage;
  project.openrouterApiKey = openrouterApiKey;
  project.customModel = customModel;
  project.config = {
    modelName: formData.get("modelName") || "amazon/nova-2-lite-v1:free",
    systemPrompt: formData.get("systemPrompt") || "",
    temperature: parseFloat(formData.get("temperature")) || 0.7,
    maxTokens: parseInt(formData.get("maxTokens")) || 900,
    topP: parseFloat(formData.get("topP")) || 1,
  };

  generateBtn.disabled = true;
  setStatus("Generating checklist from your research plan...");

  try {
    const response = await fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        researchPlan,
        projectStage,
        config: project.config,
        openrouterApiKey,
        customModel,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate checklist.");
    }

    // Parse and merge items
    const grokItems = parseChecklistItems(payload.checklist);
    const staticItems = STATIC_TRACKING_ITEMS.map((text) => ({
      id: `static-${Math.random().toString(36).substr(2, 9)}`,
      text,
      category: "Reproducibility Tracking",
      checked: false,
      notes: "",
      changes: [],
    }));

    project.checklist = [...grokItems, ...staticItems];
    project.timeline = [];

    saveProjectsToStorage();
    emitProjectState();

    setStatus("✓ Checklist generated successfully!", "success");
    renderChecklist();
    switchTab(TAB_KEYS.CHECKLIST);
  } catch (error) {
    console.error("Error:", error);
    setStatus(`Error: ${error.message}`, "error");
  } finally {
    generateBtn.disabled = false;
  }
}

function parseChecklistItems(checklistInput) {
  if (!checklistInput) return createDefaultChecklist();

  if (Array.isArray(checklistInput)) {
    return checklistInput.map((it) => ({
      id: `item-${Math.random().toString(36).substr(2, 9)}`,
      text: (it.text || it.requirement || "").trim(),
      category: (it.category || "General").trim(),
      checked: false,
      notes: "",
      changes: [],
    }));
  }

  if (typeof checklistInput === "object" && checklistInput.items && Array.isArray(checklistInput.items)) {
    return checklistInput.items.map((it) => ({
      id: `item-${Math.random().toString(36).substr(2, 9)}`,
      text: (it.text || it.requirement || "").trim(),
      category: (it.category || "General").trim(),
      checked: false,
      notes: "",
      changes: [],
    }));
  }

  if (typeof checklistInput === "string") {
    const s = checklistInput.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parseChecklistItems(parsed);
      if (parsed && Array.isArray(parsed.items)) return parseChecklistItems(parsed);
    } catch (e) {
      const jsonMatch = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/m);
      if (jsonMatch) {
        try {
          const recovered = JSON.parse(jsonMatch[0]);
          if (Array.isArray(recovered) || (recovered && Array.isArray(recovered.items))) {
            return parseChecklistItems(recovered);
          }
        } catch (err) {
          // fall through to markdown fallback
        }
      }

      const items = [];
      const lines = s.split(/\r?\n/);
      lines.forEach((line) => {
        const m = line.match(/^\s*[-*\u2022]?\s*(?:\[([ xX])\]\s*)?(.*)$/);
        if (m) {
          const text = m[2].trim();
          if (!text) return;
          const categoryMatch = text.match(/^([^—:-]+)\s*[—:-]\s*(.+)$/);
          const category = categoryMatch ? categoryMatch[1].trim() : "General";
          const requirement = categoryMatch ? categoryMatch[2].trim() : text;
          items.push({
            id: `item-${Math.random().toString(36).substr(2, 9)}`,
            text: requirement,
            category,
            checked: false,
            notes: "",
            changes: [],
          });
        }
      });
      return items.length > 0 ? items : createDefaultChecklist();
    }
  }

  return createDefaultChecklist();
}

function createDefaultChecklist() {
  return [
    {
      id: "default-1",
      text: "Document initial system prompt and configuration",
      category: "Planning",
      checked: false,
      notes: "",
      changes: [],
    },
    {
      id: "default-2",
      text: "Define evaluation metrics and baselines",
      category: "Evaluation",
      checked: false,
      notes: "",
      changes: [],
    },
  ];
}

// ============================================================================
// RENDERING
// ============================================================================

function renderChecklist() {
  if (!currentProjectId) return;
  const project = projects[currentProjectId];
  const items = project.checklist || [];

  if (items.length === 0) {
    checklistSection.hidden = true;
    checklistEmpty.hidden = false;
    return;
  }

  checklistSection.hidden = false;
  checklistEmpty.hidden = true;

  checklistItemsContainer.innerHTML = items.map((item) => renderChecklistItem(item)).join("");

  items.forEach((item) => {
    const checkbox = document.querySelector(`input[data-item-id="${item.id}"]`);
    const noteInput = document.querySelector(`textarea[data-item-id="${item.id}"]`);
    const logChangeBtn = document.querySelector(`button[data-action="log"][data-item-id="${item.id}"]`);
    const removeBtn = document.querySelector(`button[data-action="remove"][data-item-id="${item.id}"]`);

    if (checkbox) {
      checkbox.checked = item.checked;
      checkbox.addEventListener("change", (e) => {
        item.checked = e.target.checked;
        logChange(item.id, `Item ${item.checked ? "completed" : "uncompleted"}`);
        saveProjectsToStorage();
        renderChecklist();
        renderTimeline();
      });
    }

    if (noteInput) {
      noteInput.value = item.notes;
      noteInput.addEventListener("blur", (e) => {
        const oldNotes = item.notes;
        item.notes = e.target.value;
        if (oldNotes !== item.notes) {
          logChange(item.id, `Notes updated: "${item.notes}"`);
          saveProjectsToStorage();
          renderTimeline();
        }
      });
    }

    if (logChangeBtn) {
      logChangeBtn.addEventListener("click", () => {
        const message = prompt(`Log a change for: ${item.text}\n\nEnter change details:`);
        if (message) {
          logChange(item.id, message);
          saveProjectsToStorage();
          renderTimeline();
          renderChecklist();
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        project.checklist = project.checklist.filter((i) => i.id !== item.id);
        logChange(item.id, "Item removed from checklist");
        saveProjectsToStorage();
        renderChecklist();
        renderTimeline();
      });
    }
  });
}

function renderChecklistItem(item) {
  return `
    <div class="checklist-item ${item.checked ? "completed" : ""}">
      <input type="checkbox" data-item-id="${item.id}" />
      <div class="item-content">
        <div class="item-text">${escapeHtml(item.text)}</div>
        <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 0.5rem;">
          Category: <strong>${escapeHtml(item.category)}</strong>
        </div>
        <textarea
          class="item-note-input"
          data-item-id="${item.id}"
          placeholder="Add notes, links, or findings related to this item..."
        ></textarea>
        <div class="item-buttons">
          <button class="item-btn log-change" data-action="log" data-item-id="${item.id}">
            Log Change
          </button>
          <button class="item-btn remove" data-action="remove" data-item-id="${item.id}">
            Remove
          </button>
        </div>
        ${
          item.changes.length > 0
            ? `<div class="item-notes">
               <strong>Recent changes:</strong><br/>
               ${item.changes
                 .slice(-3)
                 .map((c) => `• ${escapeHtml(c.message)} (${c.timestamp})`)
                 .join("<br/>")}
             </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderTimeline() {
  if (!currentProjectId) return;
  const project = projects[currentProjectId];
  const events = project.timeline || [];

  if (events.length === 0) {
    timelineSection.hidden = true;
    timelineEmpty.hidden = false;
    return;
  }

  timelineSection.hidden = false;
  timelineEmpty.hidden = true;

  const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  timelineContainer.innerHTML = `
    <div class="timeline">
      ${sortedEvents.map((event) => renderTimelineEvent(event)).join("")}
    </div>
  `;
}

function renderTimelineEvent(event) {
  return `
    <div class="timeline-event">
      <div class="timeline-event-time">${event.timestamp}</div>
      <div class="timeline-event-title">${escapeHtml(event.itemText)}</div>
      <div class="timeline-event-content">${escapeHtml(event.message)}</div>
    </div>
  `;
}

function switchTab(tabKey) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabKey);
  });

  tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === tabKey);
  });
}

// ============================================================================
// CHANGE TRACKING
// ============================================================================

function logChange(itemId, message) {
  if (!currentProjectId) return;
  const project = projects[currentProjectId];
  const item = project.checklist.find((i) => i.id === itemId);
  if (!item) return;

  const timestamp = new Date().toLocaleString();
  item.changes.push({ message, timestamp });

  project.timeline.push({
    timestamp,
    itemId,
    itemText: item.text,
    message,
  });

  emitProjectState();
}

// ============================================================================
// EXPORT & EXTENSION MESSAGING
// ============================================================================

function exportCurrentProject() {
  if (!currentProjectId) {
    setStatus("Please select a project to export.", "error");
    return;
  }

  const project = projects[currentProjectId];
  const data = {
    name: project.name,
    config: project.config,
    checklist: project.checklist,
    timeline: project.timeline,
    exportedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  setStatus("✓ Project exported as JSON", "success");
}

function emitProjectState() {
  if (!currentProjectId) return;
  const project = projects[currentProjectId];

  try {
    window.postMessage(
      {
        source: "genai-tracker",
        type: "state",
        data: {
          projectId: currentProjectId,
          projectName: project.name,
          config: project.config,
          checklist: project.checklist,
          timeline: project.timeline,
        },
      },
      "*"
    );
  } catch (err) {
    console.warn("emitProjectState failed:", err?.message || err);
  }
}

function handleExtensionMessage(event) {
  if (!event || !event.data) return;
  const m = event.data;

  if (m && m.source === "genai-extension" && m.type === "update" && m.data) {
    try {
      const { projectId, checklist, timeline } = m.data;
      if (projectId && projects[projectId]) {
        projects[projectId].checklist = checklist;
        projects[projectId].timeline = timeline;
        saveProjectsToStorage();

        if (currentProjectId === projectId) {
          renderChecklist();
          renderTimeline();
        }
      }
    } catch (err) {
      console.warn("Failed to apply update from genai-extension:", err?.message || err);
    }
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function setStatus(message, type = "info") {
  statusArea.textContent = message;
  statusArea.className = `status ${type}`;
  if (type === "success" || type === "error") {
    setTimeout(() => {
      if (statusArea.textContent === message) {
        statusArea.textContent = "";
        statusArea.className = "status";
      }
    }, 4000);
  }
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
