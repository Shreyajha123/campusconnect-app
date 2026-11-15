// ============================================================================
// CAMPUSCONNECT — MAIN APPLICATION CONTROLLER
// ============================================================================

import { isFirebaseConfigured, initError, ADMIN_EMAIL } from "./firebase-config.js";
import {
  registerStudent,
  loginUser,
  logoutUser,
  subscribeAuthState,
  isAdminUser
} from "./auth.js";
import {
  fetchApprovedResources,
  fetchMyUploads,
  uploadResource,
  updateResourceDetails,
  deleteResourceAndFile,
  filterResources,
  downloadPdfFile
} from "./resources.js";
import {
  fetchAdminOverview,
  setResourceStatus,
  adminDeleteResource
} from "./admin.js";
import {
  escapeHtml,
  formatDate,
  formatFileSize,
  renderResourceCard,
  renderStatusLabel,
  setAlert,
  setButtonLoading,
  showToast,
  openModal,
  closeModal
} from "./ui.js";

const CORE_SUBJECTS = [
  "Data Structures & Algorithms",
  "Database Management Systems",
  "Operating Systems",
  "Computer Networks",
  "Web Development (HTML & CSS)",
  "Software Engineering",
  "Discrete Mathematics",
  "Artificial Intelligence"
];

const state = {
  currentRoute: "home",
  authResolved: false,
  user: null,
  profile: null,
  approvedResources: [],
  myUploads: [],
  adminUsers: [],
  adminResources: [],
  adminTab: "resources",
  adminStatusFilter: "all",
  filters: {
    search: "",
    subject: "",
    semester: "",
    category: ""
  },
  selectedFile: null,
  pendingDeleteResource: null,
  pendingDeleteContext: null // "my-uploads" | "admin"
};

// ============================================================================
// ROUTING & NAVIGATION
// ============================================================================

const ALL_VIEWS = [
  "home",
  "about",
  "resources",
  "login",
  "register",
  "dashboard",
  "upload",
  "my-uploads",
  "admin"
];

function getRouteFromHash() {
  const raw = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  return ALL_VIEWS.includes(raw) ? raw : "home";
}

export function navigateTo(route) {
  const target = ALL_VIEWS.includes(route) ? route : "home";
  if (window.location.hash !== `#${target}`) {
    window.location.hash = `#${target}`;
  } else {
    renderRoute(target);
  }
}

function renderRoute(route) {
  state.currentRoute = route;

  // Protected routes check
  const protectedRoutes = ["dashboard", "upload", "my-uploads", "admin"];
  if (state.authResolved && protectedRoutes.includes(route) && !state.user) {
    showToast("Please log in to access your student workspace.", "info");
    if (window.location.hash !== "#login") {
      window.location.hash = "#login";
      return;
    }
    route = "login";
    state.currentRoute = "login";
  }

  // Toggle visible view section
  ALL_VIEWS.forEach((viewName) => {
    const el = document.getElementById(`view-${viewName}`);
    if (el) {
      el.classList.toggle("hidden", viewName !== route);
    }
  });

  // Update active nav link highlight
  document.querySelectorAll("[data-route]").forEach((link) => {
    const isActive = link.getAttribute("data-route") === route;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  // Close mobile nav if open
  closeMobileNav();

  // Scroll cleanly to top
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Load route-specific data
  if (route === "home") {
    loadHomeResources();
  } else if (route === "resources") {
    loadBrowseResources();
  } else if (route === "dashboard" && state.user) {
    loadStudentDashboard();
  } else if (route === "my-uploads" && state.user) {
    loadMyUploadsView();
  } else if (route === "admin" && state.user) {
    loadAdminView();
  }
}

function updateNavAuthUI() {
  const isLoggedIn = Boolean(state.user);
  const isAdmin = isAdminUser(state.user, state.profile);

  document.querySelectorAll(".nav-guest-only").forEach((el) => {
    el.classList.toggle("hidden", isLoggedIn);
  });

  document.querySelectorAll(".nav-auth-only").forEach((el) => {
    el.classList.toggle("hidden", !isLoggedIn);
  });

  document.querySelectorAll(".nav-admin-only").forEach((el) => {
    el.classList.toggle("hidden", !isAdmin);
  });

  const userNameEl = document.getElementById("nav-user-name");
  if (userNameEl) {
    const displayName =
      (state.profile && state.profile.fullName) ||
      (state.user && (state.user.displayName || state.user.email)) ||
      "Student";
    userNameEl.textContent = displayName;
  }
}

function closeMobileNav() {
  const navDrawer = document.getElementById("mobile-nav-drawer");
  const toggleBtn = document.getElementById("mobile-menu-toggle");
  if (navDrawer) navDrawer.classList.add("hidden");
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
}

// ============================================================================
// FIREBASE CONFIG BANNER CHECK
// ============================================================================

function syncFirebaseStatusBanner() {
  const banner = document.getElementById("firebase-setup-banner");
  if (!banner) return;

  if (!isFirebaseConfigured()) {
    banner.classList.remove("hidden");
  } else if (initError) {
    banner.classList.remove("hidden");
    const msgEl = document.getElementById("firebase-banner-message");
    if (msgEl) {
      msgEl.textContent = `Firebase initialization error: ${initError}`;
    }
  } else {
    banner.classList.add("hidden");
  }
}

// ============================================================================
// HOME VIEW DATA
// ============================================================================

async function loadHomeResources() {
  const recentGrid = document.getElementById("home-recent-resources");
  const subjectsGrid = document.getElementById("home-popular-subjects");
  if (!recentGrid || !subjectsGrid) return;

  if (!isFirebaseConfigured()) {
    renderPopularSubjects(subjectsGrid, []);
    recentGrid.innerHTML = `
      <div class="empty-state-box">
        <h3>Connect Firebase to View Live Study Materials</h3>
        <p>Paste your Firebase project credentials inside <code>js/firebase-config.js</code> to load approved student notes, enable PDF uploads, and authenticate accounts.</p>
        <a href="#about" class="btn btn-secondary">View Firebase Setup Guide</a>
      </div>
    `;
    return;
  }

  recentGrid.innerHTML = renderLoadingCards(3);

  try {
    const resources = await fetchApprovedResources();
    state.approvedResources = resources;
    renderPopularSubjects(subjectsGrid, resources);

    if (resources.length === 0) {
      recentGrid.innerHTML = `
        <div class="empty-state-box">
          <h3>No approved resources published yet</h3>
          <p>Be the first student to upload lecture notes or question papers for your classmates.</p>
          <a href="#upload" class="btn btn-primary">Upload First Resource</a>
        </div>
      `;
      return;
    }

    const latest = resources.slice(0, 6);
    recentGrid.innerHTML = latest.map((item) => renderResourceCard(item, { compact: true })).join("");
  } catch (error) {
    renderPopularSubjects(subjectsGrid, []);
    recentGrid.innerHTML = `
      <div class="empty-state-box empty-state-error">
        <h3>Unable to load resources</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderPopularSubjects(container, approvedResources) {
  const counts = {};
  approvedResources.forEach((res) => {
    const subj = (res.subject || "").trim();
    if (subj) {
      counts[subj] = (counts[subj] || 0) + 1;
    }
  });

  // Combine dynamic subjects with core curriculum subjects up to 8 cards
  const dynamicSubjects = Object.keys(counts);
  const combined = [...new Set([...dynamicSubjects, ...CORE_SUBJECTS])].slice(0, 8);

  container.innerHTML = combined
    .map((subjectName) => {
      const count = counts[subjectName] || 0;
      const countText = count === 1 ? "1 material" : `${count} materials`;
      return `
        <button
          type="button"
          class="subject-card js-subject-shortcut"
          data-subject="${escapeHtml(subjectName)}"
        >
          <span class="subject-card-title">${escapeHtml(subjectName)}</span>
          <span class="subject-card-meta">${isFirebaseConfigured() ? escapeHtml(countText) : "Filter subject"}</span>
        </button>
      `;
    })
    .join("");
}

// ============================================================================
// BROWSE RESOURCES VIEW
// ============================================================================

async function loadBrowseResources() {
  const grid = document.getElementById("browse-resources-grid");
  const countEl = document.getElementById("browse-result-count");
  if (!grid) return;

  if (!isFirebaseConfigured()) {
    if (countEl) countEl.textContent = "0 resources";
    grid.innerHTML = `
      <div class="empty-state-box">
        <h3>Firebase Not Connected</h3>
        <p>Configure your <code>firebaseConfig</code> in <code>js/firebase-config.js</code> to browse and download uploaded PDF study materials.</p>
        <a href="#about" class="btn btn-secondary">Read Setup Steps</a>
      </div>
    `;
    return;
  }

  grid.innerHTML = renderLoadingCards(6);

  try {
    const resources = await fetchApprovedResources();
    state.approvedResources = resources;
    populateSubjectFilterOptions(resources);
    applyBrowseFiltersAndRender();
  } catch (error) {
    if (countEl) countEl.textContent = "Error loading";
    grid.innerHTML = `
      <div class="empty-state-box empty-state-error">
        <h3>Could not load study materials</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function populateSubjectFilterOptions(resources) {
  const select = document.getElementById("filter-subject");
  if (!select) return;

  const previous = state.filters.subject;
  const subjectsFromDb = [...new Set(resources.map((r) => (r.subject || "").trim()).filter(Boolean))];
  const allSubjects = [...new Set([...subjectsFromDb, ...CORE_SUBJECTS])].sort((a, b) =>
    a.localeCompare(b)
  );

  select.innerHTML = `<option value="">All Subjects</option>` +
    allSubjects
      .map((subj) => `<option value="${escapeHtml(subj)}">${escapeHtml(subj)}</option>`)
      .join("");

  if (previous) {
    select.value = previous;
  }
}

function applyBrowseFiltersAndRender() {
  const grid = document.getElementById("browse-resources-grid");
  const countEl = document.getElementById("browse-result-count");
  if (!grid) return;

  const filtered = filterResources(state.approvedResources, state.filters);

  if (countEl) {
    countEl.textContent =
      filtered.length === 1 ? "1 approved resource" : `${filtered.length} approved resources`;
  }

  if (filtered.length === 0) {
    const hasFilters = Boolean(
      state.filters.search ||
      state.filters.subject ||
      state.filters.semester ||
      state.filters.category
    );

    grid.innerHTML = `
      <div class="empty-state-box">
        <h3>${hasFilters ? "No matching study materials found" : "No approved resources available yet"}</h3>
        <p>${
          hasFilters
            ? "Try adjusting your search keywords, semester, subject, or category filters."
            : "Once students upload study notes and an administrator approves them, they will appear here."
        }</p>
        ${
          hasFilters
            ? `<button type="button" class="btn btn-secondary" id="empty-reset-filters-btn">Clear All Filters</button>`
            : `<a href="#upload" class="btn btn-primary">Upload Study Material</a>`
        }
      </div>
    `;

    const resetBtn = document.getElementById("empty-reset-filters-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", resetBrowseFilters);
    }
    return;
  }

  grid.innerHTML = filtered.map((item) => renderResourceCard(item)).join("");
}

function resetBrowseFilters() {
  state.filters = { search: "", subject: "", semester: "", category: "" };

  const searchInput = document.getElementById("filter-search");
  const subjectSelect = document.getElementById("filter-subject");
  const semesterSelect = document.getElementById("filter-semester");
  const categorySelect = document.getElementById("filter-category");

  if (searchInput) searchInput.value = "";
  if (subjectSelect) subjectSelect.value = "";
  if (semesterSelect) semesterSelect.value = "";
  if (categorySelect) categorySelect.value = "";

  document.querySelectorAll(".category-tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.category === "");
  });

  applyBrowseFiltersAndRender();
}

// ============================================================================
// STUDENT DASHBOARD VIEW
// ============================================================================

async function loadStudentDashboard() {
  if (!state.user) return;

  const welcomeNameEl = document.getElementById("dash-student-name");
  const welcomeMetaEl = document.getElementById("dash-student-meta");
  const totalNotesEl = document.getElementById("dash-total-notes");
  const myCountEl = document.getElementById("dash-my-uploads");
  const pendingCountEl = document.getElementById("dash-my-pending");
  const recentContainer = document.getElementById("dash-recent-list");

  const fullName =
    (state.profile && state.profile.fullName) || state.user.displayName || "Student";
  const college = (state.profile && state.profile.college) || "College Campus";
  const semester = (state.profile && state.profile.semester) || "1";

  if (welcomeNameEl) welcomeNameEl.textContent = `Welcome back, ${fullName}`;
  if (welcomeMetaEl) {
    welcomeMetaEl.textContent = isAdminUser(state.user, state.profile)
      ? "Administrator Account · Moderation Enabled"
      : `${college} · Semester ${semester}`;
  }

  if (!isFirebaseConfigured()) return;

  if (recentContainer) recentContainer.innerHTML = renderLoadingCards(3);

  try {
    const [approved, mine] = await Promise.all([
      fetchApprovedResources(),
      fetchMyUploads(state.user.uid)
    ]);

    state.approvedResources = approved;
    state.myUploads = mine;

    const myPendingCount = mine.filter((r) => r.status === "pending").length;

    if (totalNotesEl) totalNotesEl.textContent = String(approved.length);
    if (myCountEl) myCountEl.textContent = String(mine.length);
    if (pendingCountEl) pendingCountEl.textContent = String(myPendingCount);

    if (recentContainer) {
      if (approved.length === 0) {
        recentContainer.innerHTML = `
          <div class="empty-state-box">
            <h3>No approved notes yet</h3>
            <p>Upload your first PDF note or explore resources once approved.</p>
            <a href="#upload" class="btn btn-primary">Upload Notes</a>
          </div>
        `;
      } else {
        recentContainer.innerHTML = approved
          .slice(0, 4)
          .map((item) => renderResourceCard(item, { compact: true }))
          .join("");
      }
    }
  } catch (error) {
    if (recentContainer) {
      recentContainer.innerHTML = `
        <div class="empty-state-box empty-state-error">
          <h3>Failed to load dashboard data</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }
}

// ============================================================================
// MY UPLOADS VIEW
// ============================================================================

async function loadMyUploadsView() {
  const container = document.getElementById("my-uploads-grid");
  const summaryEl = document.getElementById("my-uploads-summary");
  if (!container || !state.user) return;

  if (!isFirebaseConfigured()) {
    container.innerHTML = `
      <div class="empty-state-box">
        <h3>Firebase Not Connected</h3>
        <p>Configure Firebase in <code>js/firebase-config.js</code> to manage your uploaded resources.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = renderLoadingCards(3);

  try {
    const uploads = await fetchMyUploads(state.user.uid);
    state.myUploads = uploads;

    const approvedCount = uploads.filter((r) => r.status === "approved").length;
    const pendingCount = uploads.filter((r) => r.status === "pending").length;
    const rejectedCount = uploads.filter((r) => r.status === "rejected").length;

    if (summaryEl) {
      summaryEl.textContent = `${uploads.length} total · ${approvedCount} approved · ${pendingCount} pending · ${rejectedCount} rejected`;
    }

    if (uploads.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box">
          <h3>You haven't uploaded any study materials yet</h3>
          <p>Share lecture notes, assignments, or past question papers to help your fellow students.</p>
          <a href="#upload" class="btn btn-primary">Upload Study Material</a>
        </div>
      `;
      return;
    }

    container.innerHTML = uploads
      .map((item) =>
        renderResourceCard(item, {
          showStatus: true,
          showOwnerActions: true
        })
      )
      .join("");
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state-box empty-state-error">
        <h3>Unable to fetch your uploads</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

// ============================================================================
// ADMIN DASHBOARD VIEW
// ============================================================================

async function loadAdminView() {
  const guardEl = document.getElementById("admin-access-denied");
  const contentEl = document.getElementById("admin-workspace");

  const isAdmin = isAdminUser(state.user, state.profile);

  if (guardEl) guardEl.classList.toggle("hidden", isAdmin);
  if (contentEl) contentEl.classList.toggle("hidden", !isAdmin);

  if (!isAdmin || !isFirebaseConfigured()) return;

  const resourcesTableBody = document.getElementById("admin-resources-list");
  const studentsTableBody = document.getElementById("admin-students-tbody");
  if (resourcesTableBody) {
    resourcesTableBody.innerHTML = `<div class="empty-state-box"><p>Loading moderation queue...</p></div>`;
  }
  if (studentsTableBody) {
    studentsTableBody.innerHTML = `<tr><td colspan="6" class="table-empty-cell">Loading student accounts...</td></tr>`;
  }

  try {
    const { users, resources } = await fetchAdminOverview();
    state.adminUsers = users;
    state.adminResources = resources;

    renderAdminMetrics();
    renderAdminResourcesQueue();
    renderAdminStudentsTable();
  } catch (error) {
    showToast(error.message, "error");
    if (resourcesTableBody) {
      resourcesTableBody.innerHTML = `
        <div class="empty-state-box empty-state-error">
          <h3>Failed to load admin records</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }
}

function renderAdminMetrics() {
  const students = state.adminUsers.filter((u) => u.role !== "admin");
  const totalResources = state.adminResources.length;
  const pending = state.adminResources.filter((r) => r.status === "pending").length;
  const approved = state.adminResources.filter((r) => r.status === "approved").length;

  const elStudents = document.getElementById("admin-stat-students");
  const elTotal = document.getElementById("admin-stat-resources");
  const elPending = document.getElementById("admin-stat-pending");
  const elApproved = document.getElementById("admin-stat-approved");

  if (elStudents) elStudents.textContent = String(students.length);
  if (elTotal) elTotal.textContent = String(totalResources);
  if (elPending) elPending.textContent = String(pending);
  if (elApproved) elApproved.textContent = String(approved);
}

function renderAdminResourcesQueue() {
  const container = document.getElementById("admin-resources-list");
  if (!container) return;

  const filtered =
    state.adminStatusFilter === "all"
      ? state.adminResources
      : state.adminResources.filter((r) => r.status === state.adminStatusFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box">
        <h3>No resources in "${escapeHtml(state.adminStatusFilter)}" queue</h3>
        <p>Submitted student study materials will appear here for review.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((item) => {
      const id = escapeHtml(item.resourceId || item.id);
      const status = item.status || "pending";
      return `
        <article class="admin-resource-row" data-resource-id="${id}">
          <div class="admin-resource-info">
            <div class="admin-resource-header">
              ${renderStatusLabel(status)}
              <span class="resource-meta-line">
                <span>${escapeHtml(item.subject || "Subject")}</span>
                <span aria-hidden="true">·</span>
                <span>Sem ${escapeHtml(item.semester || "1")}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(item.category || "Notes")}</span>
              </span>
            </div>
            <h3 class="admin-resource-title">${escapeHtml(item.title)}</h3>
            <p class="admin-resource-desc">${escapeHtml(item.description)}</p>
            <div class="admin-resource-meta">
              <span>Uploaded by <strong>${escapeHtml(item.uploaderName || "Student")}</strong></span>
              <span aria-hidden="true">·</span>
              <span>${escapeHtml(item.fileName || "document.pdf")}</span>
              ${item.fileSize ? `<span aria-hidden="true">·</span><span>${escapeHtml(formatFileSize(item.fileSize))}</span>` : ""}
              <span aria-hidden="true">·</span>
              <span>${escapeHtml(formatDate(item.createdAt))}</span>
            </div>
          </div>

          <div class="admin-resource-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm js-download-resource"
              data-url="${escapeHtml(item.fileURL || "")}"
              data-filename="${escapeHtml(item.fileName || "resource.pdf")}"
            >
              Download File
            </button>
            ${
              status !== "approved"
                ? `<button type="button" class="btn btn-success btn-sm js-admin-approve" data-id="${id}">Approve</button>`
                : ""
            }
            ${
              status !== "rejected"
                ? `<button type="button" class="btn btn-warning btn-sm js-admin-reject" data-id="${id}">Reject</button>`
                : ""
            }
            <button type="button" class="btn btn-danger-outline btn-sm js-admin-delete" data-id="${id}">
              Delete
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAdminStudentsTable() {
  const tbody = document.getElementById("admin-students-tbody");
  if (!tbody) return;

  if (state.adminUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty-cell">No registered accounts found in Firestore USERS collection.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.adminUsers
    .map((user) => {
      const roleClass = user.role === "admin" ? "status-approved" : "status-neutral";
      const roleText = user.role === "admin" ? "Admin" : "Student";
      return `
        <tr>
          <td class="font-medium">${escapeHtml(user.fullName || "—")}</td>
          <td>${escapeHtml(user.email || "—")}</td>
          <td>${escapeHtml(user.college || "—")}</td>
          <td class="tabular-nums">Sem ${escapeHtml(user.semester || "1")}</td>
          <td><span class="status-tag ${roleClass}">${roleText}</span></td>
          <td class="tabular-nums">${escapeHtml(formatDate(user.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

// ============================================================================
// FORM HANDLERS & EVENT DELEGATION
// ============================================================================

function bindFormsAndControls() {
  // Mobile nav toggle
  const mobileToggle = document.getElementById("mobile-menu-toggle");
  const mobileDrawer = document.getElementById("mobile-nav-drawer");
  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener("click", () => {
      const isHidden = mobileDrawer.classList.toggle("hidden");
      mobileToggle.setAttribute("aria-expanded", String(!isHidden));
    });
  }

  // Logout buttons (desktop + mobile)
  document.querySelectorAll(".js-logout-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await logoutUser();
        showToast("You have been logged out.", "success");
        navigateTo("home");
      } catch (error) {
        showToast(error.message || "Logout failed.", "error");
      }
    });
  });

  // Registration Form
  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAlert("register-alert", "");

      const fullName = document.getElementById("reg-fullname").value.trim();
      const email = document.getElementById("reg-email").value.trim();
      const college = document.getElementById("reg-college").value.trim();
      const semester = document.getElementById("reg-semester").value;
      const password = document.getElementById("reg-password").value;
      const confirmPassword = document.getElementById("reg-confirm-password").value;
      const submitBtn = document.getElementById("reg-submit-btn");

      if (fullName.length < 2) {
        setAlert("register-alert", "Please enter your full name (at least 2 characters).");
        return;
      }
      if (!email || !email.includes("@")) {
        setAlert("register-alert", "Please enter a valid student email address.");
        return;
      }
      if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        setAlert("register-alert", "This email is reserved for the system administrator.");
        return;
      }
      if (college.length < 2) {
        setAlert("register-alert", "Please enter your college or university name.");
        return;
      }
      if (password.length < 6) {
        setAlert("register-alert", "Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setAlert("register-alert", "Passwords do not match. Please verify both fields.");
        return;
      }

      setButtonLoading(submitBtn, true, "Creating Account...");

      try {
        await registerStudent({ fullName, email, college, semester, password });
        registerForm.reset();
        showToast("Account created! Welcome to CampusConnect.", "success");
        navigateTo("dashboard");
      } catch (error) {
        setAlert("register-alert", error.message, "error");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Login Form
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAlert("login-alert", "");

      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      const submitBtn = document.getElementById("login-submit-btn");

      if (!email || !password) {
        setAlert("login-alert", "Please enter both your email address and password.");
        return;
      }

      setButtonLoading(submitBtn, true, "Signing In...");

      try {
        const { user, profile } = await loginUser(email, password);
        loginForm.reset();
        showToast("Signed in successfully.", "success");
        if (isAdminUser(user, profile)) {
          navigateTo("admin");
        } else {
          navigateTo("dashboard");
        }
      } catch (error) {
        setAlert("login-alert", error.message, "error");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Upload Notes File Dropzone & Picker
  const fileInput = document.getElementById("upload-file");
  const dropzone = document.getElementById("upload-dropzone");
  const fileLabel = document.getElementById("upload-file-selected");

  const handleSelectedFile = (file) => {
    setAlert("upload-alert", "");
    if (!file) {
      state.selectedFile = null;
      if (fileLabel) fileLabel.textContent = "No file selected yet (PDF or Image up to 10 MB)";
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isImage =
      file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lowerName);

    if (!isPdf && !isImage) {
      state.selectedFile = null;
      if (fileInput) fileInput.value = "";
      if (fileLabel) fileLabel.textContent = "No file selected yet (PDF or Image up to 10 MB)";
      setAlert("upload-alert", "Only PDF (.pdf) or image (.png, .jpg, .jpeg, .webp) files are allowed.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      state.selectedFile = null;
      if (fileInput) fileInput.value = "";
      if (fileLabel) fileLabel.textContent = "No file selected yet (PDF or Image up to 10 MB)";
      setAlert("upload-alert", "File size must be 10 MB or smaller.");
      return;
    }

    state.selectedFile = file;
    if (fileLabel) {
      fileLabel.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
    }
  };

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      handleSelectedFile(file || null);
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("is-dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        handleSelectedFile(file);
      }
    });
  }

  // Upload Notes Form Submit
  const uploadForm = document.getElementById("upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAlert("upload-alert", "");

      const title = document.getElementById("upload-title").value.trim();
      const subject = document.getElementById("upload-subject").value.trim();
      const semester = document.getElementById("upload-semester").value;
      const category = document.getElementById("upload-category").value;
      const description = document.getElementById("upload-description").value.trim();
      const submitBtn = document.getElementById("upload-submit-btn");

      const progressWrap = document.getElementById("upload-progress-wrap");
      const progressBar = document.getElementById("upload-progress-bar");
      const progressText = document.getElementById("upload-progress-text");

      if (title.length < 3) {
        setAlert("upload-alert", "Please enter a descriptive resource title (at least 3 characters).");
        return;
      }
      if (subject.length < 2) {
        setAlert("upload-alert", "Please enter the subject name.");
        return;
      }
      if (description.length < 5) {
        setAlert("upload-alert", "Please write a short description of what this resource covers.");
        return;
      }
      if (!state.selectedFile) {
        setAlert("upload-alert", "Please choose a PDF or image file (max 10 MB) to upload.");
        return;
      }

      setButtonLoading(submitBtn, true, "Saving Material...");
      if (progressWrap) progressWrap.classList.remove("hidden");
      if (progressBar) progressBar.style.width = "0%";
      if (progressText) progressText.textContent = "0%";

      try {
        await uploadResource({
          title,
          subject,
          semester,
          category,
          description,
          file: state.selectedFile,
          user: state.user,
          profile: state.profile,
          onProgress: (percent) => {
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) progressText.textContent = `${percent}%`;
          }
        });

        uploadForm.reset();
        state.selectedFile = null;
        if (fileLabel) fileLabel.textContent = "No file selected yet (PDF or Image up to 10 MB)";
        setAlert(
          "upload-alert",
          "Study material uploaded successfully! It is now pending administrator approval before appearing in public Browse Resources.",
          "success"
        );
        showToast("Upload complete! Pending admin approval.", "success");
      } catch (error) {
        setAlert("upload-alert", error.message, "error");
      } finally {
        setButtonLoading(submitBtn, false);
        setTimeout(() => {
          if (progressWrap) progressWrap.classList.add("hidden");
        }, 1200);
      }
    });
  }

  // Browse Resources Filters
  const searchInput = document.getElementById("filter-search");
  const subjectSelect = document.getElementById("filter-subject");
  const semesterSelect = document.getElementById("filter-semester");
  const categorySelect = document.getElementById("filter-category");
  const resetFiltersBtn = document.getElementById("filter-reset-btn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.filters.search = e.target.value;
      applyBrowseFiltersAndRender();
    });
  }
  if (subjectSelect) {
    subjectSelect.addEventListener("change", (e) => {
      state.filters.subject = e.target.value;
      applyBrowseFiltersAndRender();
    });
  }
  if (semesterSelect) {
    semesterSelect.addEventListener("change", (e) => {
      state.filters.semester = e.target.value;
      applyBrowseFiltersAndRender();
    });
  }
  if (categorySelect) {
    categorySelect.addEventListener("change", (e) => {
      state.filters.category = e.target.value;
      document.querySelectorAll(".category-tab-btn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.category === e.target.value);
      });
      applyBrowseFiltersAndRender();
    });
  }
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", resetBrowseFilters);
  }

  document.querySelectorAll(".category-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.category || "";
      state.filters.category = cat;
      if (categorySelect) categorySelect.value = cat;
      document.querySelectorAll(".category-tab-btn").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      applyBrowseFiltersAndRender();
    });
  });

  // Admin Dashboard Tabs & Filter Pills
  document.querySelectorAll(".admin-main-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.adminTab || "resources";
      state.adminTab = tab;
      document.querySelectorAll(".admin-main-tab").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      const resPanel = document.getElementById("admin-panel-resources");
      const stuPanel = document.getElementById("admin-panel-students");
      if (resPanel) resPanel.classList.toggle("hidden", tab !== "resources");
      if (stuPanel) stuPanel.classList.toggle("hidden", tab !== "students");
    });
  });

  document.querySelectorAll(".admin-status-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.adminStatusFilter = btn.dataset.status || "all";
      document.querySelectorAll(".admin-status-tab").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      renderAdminResourcesQueue();
    });
  });

  // Edit Resource Modal Form
  const editForm = document.getElementById("edit-resource-form");
  if (editForm) {
    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAlert("edit-modal-alert", "");

      const resourceId = document.getElementById("edit-resource-id").value;
      const title = document.getElementById("edit-title").value.trim();
      const subject = document.getElementById("edit-subject").value.trim();
      const semester = document.getElementById("edit-semester").value;
      const category = document.getElementById("edit-category").value;
      const description = document.getElementById("edit-description").value.trim();
      const saveBtn = document.getElementById("edit-save-btn");

      if (title.length < 3 || subject.length < 2 || description.length < 5) {
        setAlert("edit-modal-alert", "Please fill in valid title, subject, and description.");
        return;
      }

      setButtonLoading(saveBtn, true, "Saving...");

      try {
        await updateResourceDetails(resourceId, {
          title,
          subject,
          semester,
          category,
          description
        });
        closeModal("edit-resource-modal");
        showToast("Resource details updated.", "success");
        await loadMyUploadsView();
      } catch (error) {
        setAlert("edit-modal-alert", error.message, "error");
      } finally {
        setButtonLoading(saveBtn, false);
      }
    });
  }

  // Delete Confirm Button
  const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (!state.pendingDeleteResource) return;

      setButtonLoading(confirmDeleteBtn, true, "Deleting...");
      try {
        if (state.pendingDeleteContext === "admin") {
          await adminDeleteResource(state.pendingDeleteResource);
          closeModal("delete-confirm-modal");
          showToast("Resource deleted.", "success");
          await loadAdminView();
        } else {
          await deleteResourceAndFile(state.pendingDeleteResource);
          closeModal("delete-confirm-modal");
          showToast("Your upload was deleted.", "success");
          await loadMyUploadsView();
        }
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        state.pendingDeleteResource = null;
        state.pendingDeleteContext = null;
        setButtonLoading(confirmDeleteBtn, false);
      }
    });
  }

  // Modal close handlers
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-close-modal");
      if (modalId) closeModal(modalId);
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop.id);
      }
    });
  });

  // Global Event Delegation for Dynamic Card & Admin Buttons
  document.addEventListener("click", async (event) => {
    // Subject card shortcut on Home Page
    const subjectBtn = event.target.closest(".js-subject-shortcut");
    if (subjectBtn) {
      const subj = subjectBtn.dataset.subject || "";
      state.filters.subject = subj;
      state.filters.search = "";
      const searchEl = document.getElementById("filter-search");
      if (searchEl) searchEl.value = "";
      navigateTo("resources");
      return;
    }

    // Download PDF Button
    const downloadBtn = event.target.closest(".js-download-resource");
    if (downloadBtn) {
      const url = downloadBtn.dataset.url;
      const filename = downloadBtn.dataset.filename || "study-material.pdf";
      await downloadPdfFile(url, filename);
      return;
    }

    // My Uploads: Edit Resource
    const editBtn = event.target.closest(".js-edit-resource");
    if (editBtn) {
      const id = editBtn.dataset.id;
      const resource = state.myUploads.find((r) => (r.resourceId || r.id) === id);
      if (!resource) return;

      document.getElementById("edit-resource-id").value = id;
      document.getElementById("edit-title").value = resource.title || "";
      document.getElementById("edit-subject").value = resource.subject || "";
      document.getElementById("edit-semester").value = String(resource.semester || "1");
      document.getElementById("edit-category").value = resource.category || "Notes";
      document.getElementById("edit-description").value = resource.description || "";
      setAlert("edit-modal-alert", "");
      openModal("edit-resource-modal");
      return;
    }

    // My Uploads: Delete Resource
    const deleteBtn = event.target.closest(".js-delete-resource");
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const resource = state.myUploads.find((r) => (r.resourceId || r.id) === id);
      if (!resource) return;

      state.pendingDeleteResource = resource;
      state.pendingDeleteContext = "my-uploads";
      const titleEl = document.getElementById("delete-target-title");
      if (titleEl) titleEl.textContent = resource.title || "this resource";
      openModal("delete-confirm-modal");
      return;
    }

    // Admin: Approve Resource
    const approveBtn = event.target.closest(".js-admin-approve");
    if (approveBtn) {
      const id = approveBtn.dataset.id;
      setButtonLoading(approveBtn, true, "Approving...");
      try {
        await setResourceStatus(id, "approved");
        showToast("Resource approved and published for students.", "success");
        await loadAdminView();
      } catch (error) {
        showToast(error.message, "error");
        setButtonLoading(approveBtn, false);
      }
      return;
    }

    // Admin: Reject Resource
    const rejectBtn = event.target.closest(".js-admin-reject");
    if (rejectBtn) {
      const id = rejectBtn.dataset.id;
      setButtonLoading(rejectBtn, true, "Rejecting...");
      try {
        await setResourceStatus(id, "rejected");
        showToast("Resource marked as rejected.", "info");
        await loadAdminView();
      } catch (error) {
        showToast(error.message, "error");
        setButtonLoading(rejectBtn, false);
      }
      return;
    }

    // Admin: Delete Resource
    const adminDeleteBtn = event.target.closest(".js-admin-delete");
    if (adminDeleteBtn) {
      const id = adminDeleteBtn.dataset.id;
      const resource = state.adminResources.find((r) => (r.resourceId || r.id) === id);
      if (!resource) return;

      state.pendingDeleteResource = resource;
      state.pendingDeleteContext = "admin";
      const titleEl = document.getElementById("delete-target-title");
      if (titleEl) titleEl.textContent = resource.title || "this resource";
      openModal("delete-confirm-modal");
    }
  });
}

function renderLoadingCards(count = 3) {
  return Array.from({ length: count })
    .map(
      () => `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-line skeleton-short"></div>
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-mid"></div>
      </div>
    `
    )
    .join("");
}

// ============================================================================
// APP INITIALIZATION
// ============================================================================

function init() {
  syncFirebaseStatusBanner();
  bindFormsAndControls();

  window.addEventListener("hashchange", () => {
    renderRoute(getRouteFromHash());
  });

  // Subscribe to Firebase Auth changes
  subscribeAuthState((user, profile) => {
    state.authResolved = true;
    state.user = user;
    state.profile = profile;

    updateNavAuthUI();
    renderRoute(getRouteFromHash());
  });
}

document.addEventListener("DOMContentLoaded", init);
