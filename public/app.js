/**
 * GenAI Reproducibility Tracker
 * Manages checklist generation, editing, change tracking, and timeline visualization
 */

// State
let projectState = {
  config: {
    modelName: "",
    systemPrompt: "",
    temperature: 0.7,
    maxTokens: 900,
    topP: 1,
  },
  checklist: [],
  timeline: [],
};

const TAB_KEYS = {
  SETUP: "setup",
  CHECKLIST: "checklist",
  TIMELINE: "timeline",
};

// Static tracking items to merge with Grok output
const STATIC_TRACKING_ITEMS = [
  "📝 Log prompt changes (if modified from initial)",
  "🌡️ Track temperature updates (if adjusted)",
  "🔄 Record model version changes (if switched)",
  "📊 Document performance metrics (if available)",
  "📌 Note data modifications or augmentations",
  "⚙️ Track hyperparameter adjustments",
  "🧪 Document test/validation results",
];

// DOM Elements
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
// TAB NAVIGATION
// ============================================================================

tabButtons.forEach((button) => {
  button.addEventListener("click", (e) => {
    const tabKey = e.target.dataset.tab;
    switchTab(tabKey);
  });
});

function switchTab(tabKey) {
  // Update button states
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabKey);
  });

  // Update content visibility
  tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === tabKey);
  });
}

// ============================================================================
// GENERATE CHECKLIST
// ============================================================================

configForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(configForm);
  const researchPlan = formData.get("researchPlan")?.trim();
  const projectStage = formData.get("projectStage")?.trim() || "unspecified";

  if (!researchPlan || researchPlan.length < 25) {
    setStatus("Please provide at least a few sentences describing your project.", "error");
    return;
  }

  // Save config
  projectState.config = {
    modelName: formData.get("modelName") || "grok-4",
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
      body: JSON.stringify({ researchPlan, projectStage, config: projectState.config }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate checklist.");
    }

    // Parse Grok output and merge with static items
    const grokItems = parseChecklistItems(payload.checklist);
    const staticItems = STATIC_TRACKING_ITEMS.map((text) => ({
      id: `static-${Math.random().toString(36).substr(2, 9)}`,
      text,
      category: "Reproducibility Tracking",
      checked: false,
      notes: "",
      changes: [],
    }));

    projectState.checklist = [...grokItems, ...staticItems];
    projectState.timeline = [];

    setStatus("✓ Checklist generated successfully!", "success");
    renderChecklist();
    switchTab(TAB_KEYS.CHECKLIST);
  } catch (error) {
    console.error("Error:", error);
    setStatus(`Error: ${error.message}`, "error");
  } finally {
    generateBtn.disabled = false;
  }
});

function parseChecklistItems(checklistInput) {
  /**
   * Accepts several input shapes:
   * - Array of { category, text }
   * - Object with `items` array
   * - JSON string containing the above
   * - Fallback: markdown checklist string
   */
  if (!checklistInput) return createDefaultChecklist();

  // If already an array of items
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

  // If an object with items
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

  // If string, try to parse JSON first
  if (typeof checklistInput === "string") {
    const s = checklistInput.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parseChecklistItems(parsed);
      if (parsed && Array.isArray(parsed.items)) return parseChecklistItems(parsed);
    } catch (e) {
      // attempt to extract JSON substring
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

      // Markdown fallback: extract list-like lines
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
  // Fallback if parsing fails
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
// RENDER CHECKLIST
// ============================================================================

function renderChecklist() {
  if (projectState.checklist.length === 0) {
    checklistSection.hidden = true;
    checklistEmpty.hidden = false;
    return;
  }

  checklistSection.hidden = false;
  checklistEmpty.hidden = true;

  checklistItemsContainer.innerHTML = projectState.checklist
    .map((item) => renderChecklistItem(item))
    .join("");

  // Attach event listeners
  projectState.checklist.forEach((item) => {
    const checkbox = document.querySelector(`input[data-item-id="${item.id}"]`);
    const noteInput = document.querySelector(`textarea[data-item-id="${item.id}"]`);
    const logChangeBtn = document.querySelector(`button[data-action="log"][data-item-id="${item.id}"]`);
    const removeBtn = document.querySelector(`button[data-action="remove"][data-item-id="${item.id}"]`);

    if (checkbox) {
      checkbox.checked = item.checked;
      checkbox.addEventListener("change", (e) => {
        item.checked = e.target.checked;
        logChange(item.id, `Item ${item.checked ? "completed" : "uncompleted"}`);
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
          renderTimeline();
        }
      });
    }

    if (logChangeBtn) {
      logChangeBtn.addEventListener("click", () => {
        const message = prompt(`Log a change for: ${item.text}\n\nEnter change details:`);
        if (message) {
          logChange(item.id, message);
          renderTimeline();
          renderChecklist();
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        projectState.checklist = projectState.checklist.filter(
          (i) => i.id !== item.id
        );
        logChange(item.id, "Item removed from checklist");
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
            📝 Log Change
          </button>
          <button class="item-btn remove" data-action="remove" data-item-id="${item.id}">
            🗑️ Remove
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

// ============================================================================
// CHANGE TRACKING & TIMELINE
// ============================================================================

function logChange(itemId, message) {
  const item = projectState.checklist.find((i) => i.id === itemId);
  if (!item) return;

  const timestamp = new Date().toLocaleString();
  item.changes.push({ message, timestamp });

  projectState.timeline.push({
    timestamp,
    itemId,
    itemText: item.text,
    message,
  });
}

function renderTimeline() {
  if (projectState.timeline.length === 0) {
    timelineSection.hidden = true;
    timelineEmpty.hidden = false;
    return;
  }

  timelineSection.hidden = false;
  timelineEmpty.hidden = true;

  const sortedEvents = [...projectState.timeline].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

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

// ============================================================================
// EXPORT & UTILITIES
// ============================================================================

exportBtn.addEventListener("click", () => {
  const data = {
    config: projectState.config,
    checklist: projectState.checklist,
    timeline: projectState.timeline,
    exportedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `genai-project-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  setStatus("✓ Checklist exported as JSON", "success");
});

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
