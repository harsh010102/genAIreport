// popup.js
// Minimal popup UI to view and edit the `genai_state` stored in chrome.storage.local.
// Supports multi-project: displays current project name and edits are synced back.

document.addEventListener("DOMContentLoaded", () => {
  const checklistContainer = document.getElementById("checklist-container");
  const timelineContainer = document.getElementById("timeline-container");
  const refreshBtn = document.getElementById("refresh-btn");

  function loadState(callback) {
    chrome.storage.local.get("genai_state", (res) => {
      const state = res && res.genai_state ? res.genai_state : {
        currentProjectId: null,
        currentProjectName: "No project selected",
        checklist: [],
        timeline: [],
        config: {},
      };
      callback(state);
    });
  }

  function saveState(state, cb) {
    chrome.storage.local.set({ genai_state: state }, () => {
      if (cb) cb();
    });
  }

  function renderHeader(state) {
    const header = document.querySelector("header");
    const projectInfo = header.querySelector(".project-info") || document.createElement("div");
    projectInfo.className = "project-info";
    const displayName = state.currentProjectName || "No project selected";
    projectInfo.innerHTML = `<small>Project: ${escapeHtml(displayName)}</small>`;
    if (!header.querySelector(".project-info")) {
      header.appendChild(projectInfo);
    }
  }

  function renderChecklist(state) {
    if (!state.checklist || state.checklist.length === 0) {
      checklistContainer.innerHTML = "<div class='empty'>No checklist items</div>";
      return;
    }

    checklistContainer.innerHTML = "";
    state.checklist.forEach((item) => {
      const el = document.createElement("div");
      el.className = "p-item";

      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!item.checked;
      checkbox.addEventListener("change", () => {
        item.checked = checkbox.checked;
        const ts = new Date().toLocaleString();
        item.changes = item.changes || [];
        item.changes.push({ message: `Item ${item.checked ? "completed" : "uncompleted"}`, timestamp: ts });
        state.timeline = state.timeline || [];
        state.timeline.push({ timestamp: ts, itemId: item.id, itemText: item.text, message: `Item ${item.checked ? "completed" : "uncompleted"}` });
        saveState(state, () => renderChecklist(state));
      });

      const span = document.createElement("span");
      span.textContent = item.text;


      const logBtn = document.createElement("button");
      logBtn.textContent = "Log change";
      logBtn.addEventListener("click", () => {
        const msg = prompt("Enter change message for:\n" + item.text);
        if (msg) {
          const ts = new Date().toLocaleString();
          item.changes = item.changes || [];
          item.changes.push({ message: msg, timestamp: ts });
          state.timeline = state.timeline || [];
          state.timeline.push({ timestamp: ts, itemId: item.id, itemText: item.text, message: msg });
          saveState(state, () => {
            renderChecklist(state);
            renderTimeline(state);
          });
        }
      });

      label.appendChild(checkbox);
      label.appendChild(span);
      el.appendChild(label);
      el.appendChild(logBtn);

      checklistContainer.appendChild(el);
    });
  }

  function renderTimeline(state) {
    if (!state.timeline || state.timeline.length === 0) {
      timelineContainer.innerHTML = "<div class='empty'>No timeline events</div>";
      return;
    }

    const sorted = [...state.timeline].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    timelineContainer.innerHTML = "";
    sorted.forEach((ev) => {
      const evEl = document.createElement("div");
      evEl.className = "p-event";
      const time = document.createElement("div");
      time.className = "p-time";
      time.textContent = ev.timestamp;
      const title = document.createElement("div");
      title.className = "p-title";
      title.textContent = ev.itemText || "";
      const msg = document.createElement("div");
      msg.className = "p-msg";
      msg.textContent = ev.message || "";
      evEl.appendChild(time);
      evEl.appendChild(title);
      evEl.appendChild(msg);
      timelineContainer.appendChild(evEl);
    });
  }

  function refresh() {
    loadState((state) => {
      renderHeader(state);
      renderChecklist(state);
      renderTimeline(state);
    });
  }

  refreshBtn.addEventListener("click", refresh);

  // initial load
  refresh();
});

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}
