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

  // Toggle for advanced/additional settings in the setup form
  const toggleAdvancedBtn = document.getElementById("toggle-advanced-btn");
  const additionalSettings = document.getElementById("additional-settings");
  if (toggleAdvancedBtn && additionalSettings) {
    toggleAdvancedBtn.addEventListener("click", () => {
      const wasHidden = additionalSettings.hidden;
      additionalSettings.hidden = !wasHidden;
      toggleAdvancedBtn.textContent = wasHidden ? "Hide additional settings" : "Additional settings";
    });
  }

  // Custom checklist add button
  const addItemBtn = document.getElementById("add-item-btn");
  const newItemText = document.getElementById("new-item-text");
  const newItemCategory = document.getElementById("new-item-category");
  if (addItemBtn) {
    addItemBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addCustomItem();
    });
  }

  // Timeline export buttons
  const exportTimelineJsonBtn = document.getElementById("export-timeline-json");
  const exportTimelineMdBtn = document.getElementById("export-timeline-md");
  if (exportTimelineJsonBtn) exportTimelineJsonBtn.addEventListener("click", exportTimelineJSON);
  if (exportTimelineMdBtn) exportTimelineMdBtn.addEventListener("click", exportTimelineMarkdown);

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
  // Reset advanced settings collapsed state
  const additionalSettings = document.getElementById("additional-settings");
  const toggleAdvancedBtn = document.getElementById("toggle-advanced-btn");
  if (additionalSettings) additionalSettings.hidden = true;
  if (toggleAdvancedBtn) toggleAdvancedBtn.textContent = "Additional settings";
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
  // Ensure advanced settings are collapsed by default when switching projects
  const additionalSettings = document.getElementById("additional-settings");
  const toggleAdvancedBtn = document.getElementById("toggle-advanced-btn");
  if (additionalSettings) additionalSettings.hidden = true;
  if (toggleAdvancedBtn) toggleAdvancedBtn.textContent = "Additional settings";
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
  // Emit updated state so the extension clears any stored project data
  emitProjectState();
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

// Add a custom checklist item from the UI
function addCustomItem() {
  if (!currentProjectId) {
    setStatus("Please select or create a project first.", "error");
    return;
  }

  const textEl = document.getElementById("new-item-text");
  const catEl = document.getElementById("new-item-category");
  if (!textEl) return;

  const text = (textEl.value || "").trim();
  const category = (catEl && catEl.value) ? catEl.value : "General";

  if (!text) {
    setStatus("Please enter text for the checklist item.", "error");
    return;
  }

  const project = projects[currentProjectId];
  const newItem = {
    id: `item-${Math.random().toString(36).substr(2, 9)}`,
    text,
    category,
    checked: false,
    notes: "",
    changes: [],
  };

  project.checklist = project.checklist || [];
  project.checklist.unshift(newItem);

  // Log change and persist
  const ts = new Date().toLocaleString();
  newItem.changes.push({ message: "Item added", timestamp: ts });
  project.timeline = project.timeline || [];
  project.timeline.push({ timestamp: ts, itemId: newItem.id, itemText: newItem.text, message: "Item added" });

  saveProjectsToStorage();
  emitProjectState();
  renderChecklist();
  renderTimeline();
  setStatus("✓ Item added", "success");

  // clear input
  textEl.value = "";
  if (catEl) catEl.value = "General";
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
        emitProjectState();
        renderChecklist();
        renderTimeline();
      });
    }

    if (noteInput) {
      noteInput.value = item.notes;
      // Update note on blur and mark unsaved changes while typing
      noteInput.addEventListener("input", (e) => {
        const currentVal = e.target.value || "";
        if (logChangeBtn) {
          if (currentVal.trim() !== (item.notes || "").trim()) {
            logChangeBtn.classList.add("active");
          } else {
            logChangeBtn.classList.remove("active");
          }
        }
      });

      noteInput.addEventListener("blur", (e) => {
        const oldNotes = item.notes || "";
        const newNotes = e.target.value || "";
        if (oldNotes !== newNotes) {
          const savedNote = newNotes;
          // Record the change in the timeline (via logChange) but clear the editable field
          logChange(item.id, `Notes updated: "${savedNote}"`);
          // Clear the live note so the UI doesn't retain transient text
          item.notes = "";
          if (noteInput) noteInput.value = "";
          saveProjectsToStorage();
          emitProjectState();
          renderTimeline();
          if (logChangeBtn) logChangeBtn.classList.remove("active");
        }
      });
    }

    if (logChangeBtn) {
      logChangeBtn.addEventListener("click", () => {
        // If there are unsaved notes in the textarea, commit them as a notes update
        const currentNoteVal = noteInput ? (noteInput.value || "") : "";
        if (currentNoteVal.trim() !== (item.notes || "").trim()) {
          // Save the note as a timeline entry, then clear the editable field
          const savedNote = currentNoteVal;
          const msg = `Notes updated: "${savedNote}"`;
          logChange(item.id, msg);
          // persist timeline and changes
          item.changes = item.changes || [];
          const ts = new Date().toLocaleString();
          item.changes.push({ message: msg, timestamp: ts });
          project.timeline = project.timeline || [];
          project.timeline.push({ timestamp: ts, itemId: item.id, itemText: item.text, message: msg });
          // Clear the live note field so user can continue
          item.notes = "";
          if (noteInput) noteInput.value = "";
          saveProjectsToStorage();
          emitProjectState();
          renderTimeline();
          renderChecklist();
          return;
        }

        // Otherwise if the textarea matches the already-saved note, just clear it (avoid duplicate timeline entries)
        if (currentNoteVal.trim() && currentNoteVal.trim() === (item.notes || "").trim()) {
          item.notes = "";
          if (noteInput) noteInput.value = "";
          saveProjectsToStorage();
          emitProjectState();
          renderChecklist();
          return;
        }

        // Otherwise prompt for a custom change message
        const message = prompt(`Log a change for: ${item.text}\n\nEnter change details:`);
        if (message) {
          logChange(item.id, message);
          saveProjectsToStorage();
          emitProjectState();
          renderTimeline();
          renderChecklist();
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        // Capture item text before removal so timeline can reference it
        const removedItemText = item.text;
        project.checklist = project.checklist.filter((i) => i.id !== item.id);

        const tsRemove = new Date().toLocaleString();
        // Push a removal event to the timeline with the removed item's text
        project.timeline = project.timeline || [];
        project.timeline.push({
          timestamp: tsRemove,
          itemId: item.id,
          itemText: removedItemText,
          message: "Item removed from checklist",
        });

        saveProjectsToStorage();
        emitProjectState();
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

function exportTimelineJSON() {
  if (!currentProjectId) {
    setStatus("Please select a project to export timeline.", "error");
    return;
  }
  const project = projects[currentProjectId];
  const data = project.timeline || [];
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name}-timeline-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("✓ Timeline exported as JSON", "success");
}

function exportTimelineMarkdown() {
  if (!currentProjectId) {
    setStatus("Please select a project to export timeline.", "error");
    return;
  }
  const project = projects[currentProjectId];
  const events = project.timeline || [];
  const lines = [];
  lines.push(`# Timeline for ${project.name}`);
  lines.push("\n");
  events
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach((ev) => {
      lines.push(`- **${ev.timestamp}** — _${ev.itemText || "(item)"}_: ${ev.message}`);
    });

  const md = lines.join("\n");
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name}-timeline-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("✓ Timeline exported as Markdown", "success");
}

function emitProjectState() {
  try {
    const payload = {
      currentProjectId: currentProjectId,
      projects: projects,
    };

    if (currentProjectId && projects[currentProjectId]) {
      const project = projects[currentProjectId];
      payload.projectId = currentProjectId;
      payload.projectName = project.name;
      payload.config = project.config;
      payload.checklist = project.checklist;
      payload.timeline = project.timeline;
    }

    window.postMessage(
      {
        source: "genai-tracker",
        type: "state",
        data: payload,
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
