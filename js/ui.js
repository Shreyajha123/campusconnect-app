// ============================================================================
// CAMPUSCONNECT — UI UTILITIES & SHARED RENDERERS
// ============================================================================

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDate(timestamp) {
  if (!timestamp) return "Just now";
  let dateObj;
  if (typeof timestamp.toDate === "function") {
    dateObj = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    dateObj = timestamp;
  } else if (typeof timestamp === "number" || typeof timestamp === "string") {
    dateObj = new Date(timestamp);
  } else if (typeof timestamp.seconds === "number") {
    dateObj = new Date(timestamp.seconds * 1000);
  } else {
    return "Recently";
  }

  if (Number.isNaN(dateObj.getTime())) return "Recently";

  return dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function getTimestampMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.toDate === "function") return timestamp.toDate().getTime();
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatFileSize(bytes) {
  if (!bytes || typeof bytes !== "number") return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function mapFirebaseError(error) {
  if (!error) return "An unexpected error occurred. Please try again.";
  const code = error.code || "";
  const message = error.message || "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password. Please check your credentials and try again.";
    case "auth/email-already-in-use":
      return "An account with this email address already exists. Try signing in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Please choose at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many unsuccessful attempts. Please wait a moment before trying again.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled in Firebase Authentication Console yet.";
    case "permission-denied":
      return "Permission denied by Firestore security rules. Please verify your account role and rules.";
    case "storage/unauthorized":
      return "Permission denied by Firebase Storage rules. Make sure you are signed in and uploading a PDF under 10 MB.";
    case "storage/canceled":
      return "Upload was canceled.";
    default:
      return message || "Operation failed. Please verify your Firebase setup.";
  }
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");

  const iconMarkup =
    type === "success"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      : type === "error"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  toast.innerHTML = `
    <span class="toast-icon">${iconMarkup}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" aria-label="Dismiss notification">&times;</button>
  `;

  const closeBtn = toast.querySelector(".toast-close");
  const removeToast = () => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 200);
  };
  if (closeBtn) closeBtn.addEventListener("click", removeToast);

  container.appendChild(toast);
  setTimeout(removeToast, 4600);
}

export function setAlert(elementId, message, type = "error") {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!message) {
    el.className = "form-alert hidden";
    el.textContent = "";
    return;
  }
  el.className = `form-alert form-alert-${type}`;
  el.textContent = message;
}

export function setButtonLoading(button, isLoading, loadingText = "Processing...") {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.innerHTML;
    }
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

export function renderStatusLabel(status) {
  const normalized = (status || "pending").toLowerCase();
  if (normalized === "approved") {
    return `<span class="status-tag status-approved">Approved</span>`;
  }
  if (normalized === "rejected") {
    return `<span class="status-tag status-rejected">Rejected</span>`;
  }
  return `<span class="status-tag status-pending">Pending Review</span>`;
}

export function renderResourceCard(resource, options = {}) {
  const {
    showStatus = false,
    showOwnerActions = false,
    compact = false
  } = options;

  const title = escapeHtml(resource.title || "Untitled Resource");
  const subject = escapeHtml(resource.subject || "General");
  const semester = escapeHtml(resource.semester || "1");
  const category = escapeHtml(resource.category || "Notes");
  const description = escapeHtml(resource.description || "No description provided.");
  const uploaderName = escapeHtml(resource.uploaderName || "Campus Student");
  const uploadDate = escapeHtml(formatDate(resource.createdAt));
  const fileSize = resource.fileSize ? ` · ${escapeHtml(formatFileSize(resource.fileSize))}` : "";
  const id = escapeHtml(resource.resourceId || resource.id || "");
  const fileUrl = resource.fileURL || "";
  const safeFileUrl = escapeHtml(fileUrl);
  const fileName = escapeHtml(resource.fileName || "study-material.pdf");
  const isImage = fileUrl.startsWith("data:image/");
  const downloadLabel = isImage ? "Download Image" : "Download File";

  return `
    <article class="resource-card ${compact ? "resource-card-compact" : ""}" data-resource-id="${id}">
      ${
        isImage && !compact
          ? `<div class="resource-thumb-wrap"><img src="${safeFileUrl}" alt="${title}" class="resource-thumb" loading="lazy" /></div>`
          : ""
      }
      <div class="resource-card-top">
        <div class="resource-meta-line">
          <span>${subject}</span>
          <span aria-hidden="true">·</span>
          <span>Semester ${semester}</span>
          <span aria-hidden="true">·</span>
          <span>${category}</span>
        </div>
        ${showStatus ? renderStatusLabel(resource.status) : ""}
      </div>

      <h3 class="resource-title">${title}</h3>
      <p class="resource-desc">${description}</p>

      <div class="resource-footer">
        <div class="resource-author-meta">
          <span class="resource-author">By ${uploaderName}</span>
          <span class="resource-date">${uploadDate}${fileSize}</span>
        </div>

        <div class="resource-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm js-download-resource"
            data-url="${safeFileUrl}"
            data-filename="${fileName}"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>${downloadLabel}</span>
          </button>

          ${
            showOwnerActions
              ? `
            <button type="button" class="btn btn-secondary btn-sm js-edit-resource" data-id="${id}">
              Edit
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm js-delete-resource" data-id="${id}">
              Delete
            </button>
          `
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}
