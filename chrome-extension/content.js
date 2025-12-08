// content.js
// Listens for messages posted by the page (source: 'genai-tracker') and stores
// the state in chrome.storage.local. Also watches storage changes and posts updates
// back to the page (source: 'genai-extension').
// Supports multi-project: tracks currentProjectId and syncs per-project state.

(function () {
  // Receive messages from the page
  window.addEventListener("message", (event) => {
    if (!event || !event.data) return;
    const msg = event.data;
    // Only accept messages from the page context with expected source/type
    if (msg && msg.source === "genai-tracker" && msg.type === "state" && msg.data) {
      try {
        // Accept full state payload. If no active project, store projects list and null currentProjectId.
        const { currentProjectId, projects, projectId, projectName, config, checklist, timeline } = msg.data;

        if (!currentProjectId) {
          const stateToStore = {
            currentProjectId: null,
            projects: projects || {},
            currentProjectName: null,
            config: null,
            checklist: [],
            timeline: [],
          };
          chrome.storage.local.set({ genai_state: stateToStore }, () => {
            // no-op
          });
        } else {
          // Normal: active project provided
          const stateToStore = {
            currentProjectId: projectId || currentProjectId,
            currentProjectName: projectName || (projects && projects[currentProjectId] && projects[currentProjectId].name) || null,
            config: config || (projects && projects[currentProjectId] && projects[currentProjectId].config) || null,
            checklist: checklist || (projects && projects[currentProjectId] && projects[currentProjectId].checklist) || [],
            timeline: timeline || (projects && projects[currentProjectId] && projects[currentProjectId].timeline) || [],
            projects: projects || {},
          };
          chrome.storage.local.set({ genai_state: stateToStore }, () => {
            // no-op
          });
        }
      } catch (err) {
        console.warn("content.js: failed to set storage", err?.message || err);
      }
    }
  });

  // When storage changes (e.g., via popup), post updated state back to the page
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.genai_state) {
      const newValue = changes.genai_state.newValue;
      try {
        // Extract projectId and post update back to page
        const { currentProjectId, checklist, timeline } = newValue;
        window.postMessage(
          {
            source: "genai-extension",
            type: "update",
            data: {
              projectId: currentProjectId,
              checklist,
              timeline,
            },
          },
          "*"
        );
      } catch (err) {
        console.warn("content.js: failed to post update", err?.message || err);
      }
    }
  });

  // On initial run, forward any stored value to the page
  chrome.storage.local.get("genai_state", (res) => {
    if (res && res.genai_state) {
      try {
        const state = res.genai_state;
        window.postMessage(
          {
            source: "genai-extension",
            type: "update",
            data: {
              projectId: state.currentProjectId,
              checklist: state.checklist,
              timeline: state.timeline,
            },
          },
          "*"
        );
      } catch (err) {
        // noop
      }
    }
  });
})();

