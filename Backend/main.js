import { fetchTrainingEntries, createTraining, updateTraining, deleteTraining } from "./trainingsService.js";
import { fetchUsers, createUser, updateUserProfile, deleteUser } from "./usersService.js";

const STORAGE_KEY = "coachboardCurrentUserId";

const state = {
  activeView: "library",
  trainings: [],
  users: [],
  currentUser: null,
  filteredTrainings: [],
  exerciseEntries: [],
  filteredExerciseEntries: [],
  currentPage: 1,
  itemsPerPage: 8,
  selectedTrainingId: null,
  selectedExerciseEntryId: null,
  detailSourceView: "library",
  editingTrainingId: null,
  editReturnView: "library",
  filters: { age: "", date: "", players: "", topic: "" },
  exerciseFilters: { type: "", age: "", players: "", topic: "" }
};

const ROUTE_PATHS = {
  library: "/bibliothek",
  "my-trainings": "/meine-trainings",
  "template-trainings": "/mustertrainings",
  exercises: "/exercises",
  "user-management": "/benutzer",
  profile: "/profil",
  impressum: "/impressum",
  terms: "/nutzungsbedingungen",
  "username-edit": "/profil/benutzername",
  "password-edit": "/profil/passwort",
  "training-create": "/training/neu"
};

function getRoutePathFromState() {
  if (state.activeView === "training-detail" && state.selectedTrainingId) {
    return `/training/${encodeURIComponent(state.selectedTrainingId)}`;
  }

  if (state.activeView === "exercise-detail" && state.selectedExerciseEntryId) {
    return `/exercise/${encodeURIComponent(state.selectedExerciseEntryId)}`;
  }

  if (state.activeView === "training-create" && state.editingTrainingId) {
    return `/training/${encodeURIComponent(state.editingTrainingId)}/bearbeiten`;
  }

  return ROUTE_PATHS[state.activeView] || "/bibliothek";
}

function updateBrowserUrl(replace = false) {
  const nextPath = getRoutePathFromState();

  if (window.location.pathname === nextPath) {
    return;
  }

  window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
}

function applyBrowserRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/bibliothek";
  const segments = path.split("/").filter(Boolean);

  state.selectedTrainingId = null;
  state.selectedExerciseEntryId = null;
  state.editingTrainingId = null;
  state.editReturnView = "library";

  if (path === "/" || path === "/bibliothek") {
    state.activeView = "library";
    return;
  }

  if (path === "/meine-trainings") {
    state.activeView = "my-trainings";
    return;
  }

  if (path === "/mustertrainings") {
    state.activeView = "template-trainings";
    return;
  }

  if (path === "/exercises") {
    state.activeView = "exercises";
    return;
  }

  if (path === "/benutzer") {
    if (state.currentUser && normalizeRole(state.currentUser.role) === "admin") {
      state.activeView = "user-management";
    } else {
      state.activeView = "library";
    }
    return;
  }

  if (path === "/profil") {
    state.activeView = "profile";
    return;
  }

  if (path === "/impressum") {
    state.activeView = "impressum";
    return;
  }

  if (path === "/nutzungsbedingungen") {
    state.activeView = "terms";
    return;
  }

  if (path === "/profil/benutzername") {
    state.activeView = "username-edit";
    return;
  }

  if (path === "/profil/passwort") {
    state.activeView = "password-edit";
    return;
  }

  if (path === "/training/neu") {
    resetTrainingCreateForm();
    state.activeView = "training-create";
    return;
  }

  if (segments[0] === "exercise" && segments[1]) {
    state.selectedExerciseEntryId = decodeURIComponent(segments[1]);
    state.detailSourceView = "exercises";
    state.activeView = "exercise-detail";
    return;
  }

  if (segments[0] === "training" && segments[1] && segments[2] === "bearbeiten") {
    const trainingId = decodeURIComponent(segments[1]);
    const training = state.trainings.find((item) => item.id === trainingId) || null;

    if (!training) {
      state.selectedTrainingId = trainingId;
      state.detailSourceView = "library";
      state.activeView = "training-detail";
      return;
    }

    const role = state.currentUser ? normalizeRole(state.currentUser.role) : "spieler";
    const sourceView = role === "trainer" ? "my-trainings" : "library";

    if (!canEditTraining(training, sourceView)) {
      state.selectedTrainingId = trainingId;
      state.detailSourceView = sourceView;
      state.activeView = "training-detail";
      return;
    }

    populateTrainingFormForEdit(training);
    state.selectedTrainingId = trainingId;
    state.editingTrainingId = trainingId;
    state.editReturnView = sourceView;
    state.detailSourceView = sourceView;
    state.activeView = "training-create";
    return;
  }

  if (segments[0] === "training" && segments[1]) {
    state.selectedTrainingId = decodeURIComponent(segments[1]);
    state.detailSourceView = "library";
    state.activeView = "training-detail";
    return;
  }

  state.activeView = "library";
}

const authScreen = document.getElementById("auth-screen");
const dashboardApp = document.getElementById("dashboard-app");
const appSidebar = document.getElementById("app-sidebar");
const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const mobileMenuBackdrop = document.getElementById("mobile-menu-backdrop");
const authTabButtons = document.querySelectorAll("[data-auth-tab]");
const authLoginPanel = document.getElementById("auth-login-panel");
const authRegisterPanel = document.getElementById("auth-register-panel");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginUsername = document.getElementById("login-username");
const loginPassword = document.getElementById("login-password");

const pageTitle = document.getElementById("page-title");

const listingView = document.getElementById("listing-view");
const exercisesView = document.getElementById("exercises-view");
const userManagementView = document.getElementById("user-management-view");
const trainingDetailView = document.getElementById("training-detail-view");
const trainingCreateView = document.getElementById("training-create-view");
const profileView = document.getElementById("profile-view");
const impressumView = document.getElementById("impressum-view");
const termsView = document.getElementById("terms-view");
const usernameEditView = document.getElementById("username-edit-view");
const passwordEditView = document.getElementById("password-edit-view");

const statsGrid = document.getElementById("stats-grid");
const trainingsTableWrap = document.getElementById("trainings-table-wrap");
const pagination = document.getElementById("pagination");

const exercisesStatsGrid = document.getElementById("exercises-stats-grid");
const exercisesTableWrap = document.getElementById("exercises-table-wrap");
const exercisesPagination = document.getElementById("exercises-pagination");

const trainingDetailTitle = document.getElementById("training-detail-title");
const trainingDetailMeta = document.getElementById("training-detail-meta");
const trainingDetailWarmup = document.getElementById("training-detail-warmup");
const trainingDetailExercises = document.getElementById("training-detail-exercises");
const trainingDetailSketch = document.getElementById("training-detail-sketch");
const trainingDetailNotes = document.getElementById("training-detail-notes");
const backFromDetailBtn = document.getElementById("back-from-detail-btn");
const detailPrintBtn = document.getElementById("detail-print-btn");
const detailDeleteBtn = document.getElementById("detail-delete-btn");
const detailEditBtn = document.getElementById("detail-edit-btn");

const filterAge = document.getElementById("filter-age");
const filterDate = document.getElementById("filter-date");
const filterPlayers = document.getElementById("filter-players");
const filterTopic = document.getElementById("filter-topic");

const exerciseFilterType = document.getElementById("exercise-filter-type");
const exerciseFilterAge = document.getElementById("exercise-filter-age");
const exerciseFilterPlayers = document.getElementById("exercise-filter-players");
const exerciseFilterTopic = document.getElementById("exercise-filter-topic");
const applyExerciseFiltersBtn = document.getElementById("apply-exercise-filters-btn");
const resetExerciseFiltersBtn = document.getElementById("reset-exercise-filters-btn");

const trainingAgeGroup = document.getElementById("training-age-group");
const trainingCreateForm = document.getElementById("training-create-form");
const createTrainingBtn = document.getElementById("create-training-btn");
const templateOptionField = document.getElementById("template-option-field");
const addExerciseBtn = document.getElementById("add-exercise-btn");
const exerciseBlocks = document.getElementById("exercise-blocks");
const backToLibraryBtn = document.getElementById("back-to-library-btn");
const cancelTrainingBtn = document.getElementById("cancel-training-btn");
const trainingEditorTitle = document.getElementById("training-editor-title");
const trainingSubmitBtn = document.getElementById("training-submit-btn");

const openWarmupLibraryBtn = document.getElementById("open-warmup-library-btn");
const warmupLibraryPanel = document.getElementById("warmup-library-panel");
const closeWarmupLibraryBtn = document.getElementById("close-warmup-library-btn");
const warmupLibrarySearch = document.getElementById("warmup-library-search");
const warmupLibraryResults = document.getElementById("warmup-library-results");

const openExerciseLibraryBtn = document.getElementById("open-exercise-library-btn");
const exerciseLibraryPanel = document.getElementById("exercise-library-panel");
const closeExerciseLibraryBtn = document.getElementById("close-exercise-library-btn");
const exerciseLibrarySearch = document.getElementById("exercise-library-search");
const exerciseLibraryResults = document.getElementById("exercise-library-results");

const warmupImageInput = document.getElementById("warmup-image-input");
const warmupUploadBox = document.getElementById("warmup-upload-box");
const warmupUploadTitle = document.getElementById("warmup-upload-title");
const warmupUploadSubtitle = document.getElementById("warmup-upload-subtitle");
const sketchInput = document.getElementById("sketch-input");
const sketchUploadBox = document.getElementById("sketch-upload-box");
const sketchUploadTitle = document.getElementById("sketch-upload-title");
const sketchUploadSubtitle = document.getElementById("sketch-upload-subtitle");

const applyFiltersBtn = document.getElementById("apply-filters-btn");
const resetFiltersBtn = document.getElementById("reset-filters-btn");
const logoutBtn = document.getElementById("logout-btn");
const navLinks = document.querySelectorAll("[data-view]");

const profileAvatar = document.getElementById("profile-avatar");
const topbarUsername = document.getElementById("topbar-username");
const topbarRole = document.getElementById("topbar-role");
const profileUsernameDisplay = document.getElementById("profile-username-display");
const profileRoleDisplay = document.getElementById("profile-role-display");
const profileClubDisplay = document.getElementById("profile-club-display");
const openUsernameEditBtn = document.getElementById("open-username-edit-btn");
const openPasswordEditBtn = document.getElementById("open-password-edit-btn");
const usernameEditForm = document.getElementById("username-edit-form");
const usernameEditInput = document.getElementById("username-edit-input");
const backToProfileFromUsernameBtn = document.getElementById("back-to-profile-from-username-btn");
const cancelUsernameEditBtn = document.getElementById("cancel-username-edit-btn");
const passwordEditForm = document.getElementById("password-edit-form");
const currentPasswordInput = document.getElementById("current-password-input");
const newPasswordInput = document.getElementById("new-password-input");
const repeatPasswordInput = document.getElementById("repeat-password-input");
const backToProfileFromPasswordBtn = document.getElementById("back-to-profile-from-password-btn");
const cancelPasswordEditBtn = document.getElementById("cancel-password-edit-btn");
const adminUserSection = document.getElementById("admin-user-section");
const adminCreateUserForm = document.getElementById("admin-create-user-form");
const userManagementNav = document.getElementById("user-management-nav");
const userManagementTableWrap = document.getElementById("user-management-table-wrap");
const userManagementCreateForm = document.getElementById("user-management-create-form");
const devRoleSection = document.getElementById("dev-role-section");
const devRoleForm = document.getElementById("dev-role-form");
const profileRoleSelect = document.getElementById("profile-role-select");



function isMobileMenuViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function setMobileMenuOpen(isOpen) {
  if (!dashboardApp) return;

  const shouldOpen = Boolean(isOpen) && isMobileMenuViewport();
  dashboardApp.classList.toggle("is-mobile-menu-open", shouldOpen);
  document.body.classList.toggle("mobile-menu-open", shouldOpen);
  mobileMenuToggle?.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  mobileMenuToggle?.setAttribute("aria-label", shouldOpen ? "Menü schließen" : "Menü öffnen");

  if (!shouldOpen) {
    mobileMenuBackdrop?.setAttribute("tabindex", "-1");
    return;
  }

  mobileMenuBackdrop?.setAttribute("tabindex", "0");
}

function closeMobileMenu() {
  setMobileMenuOpen(false);
}

function toggleMobileMenu() {
  const isOpen = dashboardApp?.classList.contains("is-mobile-menu-open");
  setMobileMenuOpen(!isOpen);
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();

  if (value === "trainerteam") return "trainer";
  if (value === "admin") return "admin";
  if (value === "trainer") return "trainer";

  return "spieler";
}

function getRoleLabel(role) {
  const normalized = normalizeRole(role);

  if (normalized === "admin") return "Admin";
  if (normalized === "trainer") return "Trainer";

  return "Spieler";
}

function getRoleAvatarClass(role) {
  const normalized = normalizeRole(role);

  if (normalized === "admin") return "profile-chip__avatar--admin";
  if (normalized === "trainer") return "profile-chip__avatar--trainer";

  return "profile-chip__avatar--spieler";
}

function getInitials(name) {
  const safeName = String(name || "").trim();
  if (!safeName) return "?";

  const parts = safeName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getUsernameValidationError(username) {
  const value = String(username || "").trim();

  if (!value) {
    return "Der Benutzername darf nicht leer sein.";
  }

  if (/\s/.test(value)) {
    return "Der Benutzername darf keine Leerzeichen enthalten.";
  }

  return "";
}

function getPasswordValidationError(password) {
  const value = String(password || "");

  if (value.length < 8) {
    return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  }

  const hasNumber = /\d/.test(value);
  const hasUppercase = /[A-ZÄÖÜ]/.test(value);
  const hasSpecialChar = /[^A-Za-zÄÖÜäöüß0-9\s]/.test(value);
  const fulfilledRules = [hasNumber, hasUppercase, hasSpecialChar].filter(Boolean).length;

  if (fulfilledRules < 2) {
    return "Das Passwort muss mindestens 2 von 3 Kriterien erfüllen: Zahl, Sonderzeichen, Großbuchstabe.";
  }

  return "";
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

function toDateInputValue(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeTraining(training) {
  const effectiveDate = training.session_date || training.created_at || "";

  return {
    ...training,
    id: training.id || "",
    title: training.title || "Unbenanntes Training",
    age_group: training.age_group || "—",
    required_players: Number(training.required_players || 0),
    duration: Number(training.duration || 0),
    session_date: effectiveDate,
    created_at: training.created_at || "",
    updated_at: training.updated_at || "",
    is_template: Boolean(training.is_template),
    description: training.description || "",
    notes: training.notes || "",
    warmup: training.warmup || null,
    exercises: Array.isArray(training.exercises) ? training.exercises : [],
    sketch_file_name: training.sketch_file_name || "",
    sketch_preview_url: training.sketch_preview_url || "",
    created_by_user_id: training.created_by_user_id || "",
    created_by_username: training.created_by_username || "",
    dateLabel: formatDate(effectiveDate),
    dateValue: toDateInputValue(effectiveDate)
  };
}

function normalizeUser(user) {
  return {
    ...user,
    username: user.username || user.name || "Unbekannt",
    club: user.club || "TSV Ottensheim",
    role: normalizeRole(user.role),
    password: typeof user.password === "string" ? user.password : ""
  };
}

function getAgeGroups() {
  return [
    "U6",
    "U7",
    "U8",
    "U9",
    "U10",
    "U11",
    "U12",
    "U13",
    "U14",
    "U15",
    "U16",
    "U17",
    "U18",
    "Kampfmannschaft"
  ];
}

function hasWarmupContent(warmup) {
  return Boolean(
      warmup &&
      (warmup.name ||
          warmup.duration ||
          warmup.description ||
          warmup.coaching_points ||
          warmup.variation ||
          warmup.image_name ||
          warmup.image_preview_url)
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function setAuthTab(tabName) {
  authTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tabName);
  });

  authLoginPanel.classList.toggle("is-hidden", tabName !== "login");
  authRegisterPanel.classList.toggle("is-hidden", tabName !== "register");
}

function showAuth() {
  closeMobileMenu();
  authScreen.classList.remove("is-hidden");
  dashboardApp.classList.add("is-hidden");
}

function showApp() {
  authScreen.classList.add("is-hidden");
  dashboardApp.classList.remove("is-hidden");
}

function setCurrentUser(user) {
  state.currentUser = user || null;

  // Alte dauerhafte Anmeldung entfernen, damit der Login nur pro Browser-Sitzung gilt.
  localStorage.removeItem(STORAGE_KEY);

  if (state.currentUser) {
    sessionStorage.setItem(STORAGE_KEY, state.currentUser.id);
    showApp();
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
    showAuth();
  }

  updateCurrentUserUI();
  render();
}

function syncCurrentUserFromStorage() {
  // Falls von einer älteren Version noch ein Login in localStorage liegt, wird er entfernt.
  localStorage.removeItem(STORAGE_KEY);

  const savedUserId = sessionStorage.getItem(STORAGE_KEY);

  if (!savedUserId) {
    state.currentUser = null;
    showAuth();
    updateCurrentUserUI();
    return;
  }

  const matchedUser = state.users.find((user) => user.id === savedUserId) || null;
  state.currentUser = matchedUser;

  if (matchedUser) {
    showApp();
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
    showAuth();
  }

  updateCurrentUserUI();
}

function updateCurrentUserUI() {
  const user = state.currentUser;

  if (!user) {
    profileAvatar.textContent = "?";
    profileAvatar.className = "profile-chip__avatar profile-chip__avatar--spieler";
    topbarUsername.textContent = "Nicht angemeldet";
    topbarRole.textContent = "—";
    profileUsernameDisplay.textContent = "—";
    profileRoleDisplay.textContent = "—";
    profileClubDisplay.textContent = "—";
    profileRoleSelect.value = "spieler";
    usernameEditInput.value = "";
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    repeatPasswordInput.value = "";
    adminUserSection?.classList.add("is-hidden");
    devRoleSection?.classList.add("is-hidden");
    userManagementNav?.classList.add("is-hidden");
    templateOptionField?.classList.add("is-hidden");
    return;
  }

  profileAvatar.textContent = getInitials(user.username);
  profileAvatar.className = `profile-chip__avatar ${getRoleAvatarClass(user.role)}`;
  topbarUsername.textContent = user.username;
  topbarRole.textContent = getRoleLabel(user.role);
  profileUsernameDisplay.textContent = user.username;
  profileRoleDisplay.textContent = getRoleLabel(user.role);
  profileClubDisplay.textContent = user.club;
  profileRoleSelect.value = normalizeRole(user.role);
  usernameEditInput.value = user.username;
  currentPasswordInput.value = "";
  newPasswordInput.value = "";
  repeatPasswordInput.value = "";

  const isAdmin = normalizeRole(user.role) === "admin";
  adminUserSection?.classList.toggle("is-hidden", !isAdmin);
  devRoleSection?.classList.toggle("is-hidden", !isAdmin);
  userManagementNav?.classList.toggle("is-hidden", !isAdmin);
  templateOptionField?.classList.toggle("is-hidden", !isAdmin);

  if (!isAdmin && trainingCreateForm.elements.is_template) {
    trainingCreateForm.elements.is_template.checked = false;
  }

  if (!isAdmin && state.activeView === "user-management") {
    state.activeView = "library";
  }
}

function populateAgeFilter() {
  const currentValue = state.filters.age;
  const ageGroups = getAgeGroups();
  filterAge.innerHTML = `<option value="">Beliebig</option>`;

  ageGroups.forEach((ageGroup) => {
    const option = document.createElement("option");
    option.value = ageGroup;
    option.textContent = ageGroup;

    if (ageGroup === currentValue) {
      option.selected = true;
    }

    filterAge.appendChild(option);
  });
}

function populateTrainingAgeGroupSelect() {
  const currentValue = trainingAgeGroup.value;
  const ageGroups = getAgeGroups();
  trainingAgeGroup.innerHTML = `<option value="">Altersgruppe auswählen</option>`;

  ageGroups.forEach((ageGroup) => {
    const option = document.createElement("option");
    option.value = ageGroup;
    option.textContent = ageGroup;

    if (ageGroup === currentValue) {
      option.selected = true;
    }

    trainingAgeGroup.appendChild(option);
  });
}

function fillPlayersSelect(selectElement, currentValue = "") {
  selectElement.innerHTML = `<option value="">Beliebig</option>`;

  for (let players = 3; players <= 20; players += 1) {
    const option = document.createElement("option");
    option.value = String(players);
    option.textContent = String(players);

    if (String(players) === currentValue) {
      option.selected = true;
    }

    selectElement.appendChild(option);
  }
}

function populatePlayersFilter() {
  fillPlayersSelect(filterPlayers, state.filters.players);
}

function populateExercisePlayersFilter() {
  fillPlayersSelect(exerciseFilterPlayers, state.exerciseFilters.players);
}

function populateExerciseAgeFilter() {
  const currentValue = state.exerciseFilters.age;
  const ageGroups = getAgeGroups();

  exerciseFilterAge.innerHTML = `<option value="">Beliebig</option>`;

  ageGroups.forEach((ageGroup) => {
    const option = document.createElement("option");
    option.value = ageGroup;
    option.textContent = ageGroup;

    if (ageGroup === currentValue) {
      option.selected = true;
    }

    exerciseFilterAge.appendChild(option);
  });
}

function getCurrentBaseList() {
  if (state.activeView === "my-trainings") {
    if (!state.currentUser) return [];

    const role = normalizeRole(state.currentUser.role);

    if (role === "admin") {
      return state.trainings.filter((training) => !training.is_template);
    }

    return state.trainings.filter((training) => {
      return !training.is_template && training.created_by_user_id === state.currentUser.id;
    });
  }

  if (state.activeView === "template-trainings") {
    return state.trainings.filter((training) => training.is_template);
  }

  return state.trainings;
}

function applyFiltersToList(list) {
  return list.filter((training) => {
    if (state.filters.age && training.age_group !== state.filters.age) {
      return false;
    }

    if (state.filters.date && training.dateValue !== state.filters.date) {
      return false;
    }

    if (state.filters.players) {
      const selectedPlayers = Number(state.filters.players);
      const trainingPlayers = Number(training.required_players || 0);

      if (trainingPlayers !== selectedPlayers) {
        return false;
      }
    }

    if (state.filters.topic) {
      const haystack = [training.title, training.description, training.age_group].join(" ").toLowerCase();

      if (!haystack.includes(state.filters.topic.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

function normalizeExerciseDuplicateValue(value) {
  return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
}

function createExerciseDuplicateKey(entry) {
  return [
    entry.type,
    entry.title,
    entry.duration,
    entry.description,
    entry.coaching_points,
    entry.variation,
    entry.material,
    entry.image_name,
    entry.sketch_file_name
  ]
      .map(normalizeExerciseDuplicateValue)
      .join("|");
}

function buildExerciseEntries() {
  const entries = [];

  state.trainings.forEach((training) => {
    if (hasWarmupContent(training.warmup)) {
      entries.push({
        id: `${training.id}__warmup`,
        trainingId: training.id,
        trainingTitle: training.title,
        type: "warmup",
        typeLabel: "Aufwärmen",
        title: training.warmup.name || "Aufwärmen",
        duration: training.warmup.duration || "",
        description: training.warmup.description || "",
        coaching_points: training.warmup.coaching_points || "",
        variation: training.warmup.variation || "",
        material: "",
        image_name: training.warmup.image_name || "",
        image_preview_url: training.warmup.image_preview_url || "",
        sketch_file_name: "",
        sketch_preview_url: "",
        required_players: training.required_players || 0,
        age_group: training.age_group || "—",
        dateLabel: training.dateLabel,
        dateValue: training.dateValue,
        sortDate: training.dateValue || training.session_date || training.created_at || "",
        trainingIsTemplate: Boolean(training.is_template)
      });
    }

    if (Array.isArray(training.exercises)) {
      training.exercises.forEach((exercise, index) => {
        const hasContent = Boolean(
            exercise &&
            (exercise.name ||
                exercise.duration ||
                exercise.description ||
                exercise.coaching_points ||
                exercise.variation ||
                exercise.material ||
                exercise.sketch_file_name ||
                exercise.sketch_preview_url)
        );

        if (!hasContent) return;

        entries.push({
          id: `${training.id}__exercise_${index}`,
          trainingId: training.id,
          trainingTitle: training.title,
          type: "exercise",
          typeLabel: "Übung",
          title: exercise.name || `Übung ${index + 1}`,
          duration: exercise.duration || "",
          description: exercise.description || "",
          coaching_points: exercise.coaching_points || "",
          variation: exercise.variation || "",
          material: exercise.material || "",
          image_name: "",
          image_preview_url: "",
          sketch_file_name: exercise.sketch_file_name || "",
          sketch_preview_url: exercise.sketch_preview_url || "",
          required_players: training.required_players || 0,
          age_group: training.age_group || "—",
          dateLabel: training.dateLabel,
          dateValue: training.dateValue,
          sortDate: training.dateValue || training.session_date || training.created_at || "",
          trainingIsTemplate: Boolean(training.is_template)
        });
      });
    }
  });

  const sortedEntries = entries.sort((a, b) => {
    const dateA = new Date(a.sortDate).getTime() || 0;
    const dateB = new Date(b.sortDate).getTime() || 0;

    return dateB - dateA;
  });

  const seenExercises = new Set();

  return sortedEntries.filter((entry) => {
    const duplicateKey = createExerciseDuplicateKey(entry);

    if (seenExercises.has(duplicateKey)) {
      return false;
    }

    seenExercises.add(duplicateKey);
    return true;
  });
}

function applyExerciseFiltersToList(list) {
  return list.filter((entry) => {
    if (state.exerciseFilters.type && entry.type !== state.exerciseFilters.type) {
      return false;
    }

    if (state.exerciseFilters.age && entry.age_group !== state.exerciseFilters.age) {
      return false;
    }

    if (state.exerciseFilters.players) {
      const selectedPlayers = Number(state.exerciseFilters.players);

      if (Number(entry.required_players || 0) !== selectedPlayers) {
        return false;
      }
    }

    if (state.exerciseFilters.topic) {
      const haystack = [
        entry.title,
        entry.description,
        entry.coaching_points,
        entry.variation,
        entry.material,
        entry.trainingTitle,
        entry.age_group,
        entry.typeLabel
      ]
          .join(" ")
          .toLowerCase();

      if (!haystack.includes(state.exerciseFilters.topic.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

function filterLibraryEntries(type, searchTerm) {
  const term = String(searchTerm || "").trim().toLowerCase();

  return state.exerciseEntries.filter((entry) => {
    if (entry.type !== type) return false;
    if (!term) return true;

    const haystack = [
      entry.title,
      entry.description,
      entry.coaching_points,
      entry.variation,
      entry.material,
      entry.trainingTitle,
      entry.age_group,
      entry.typeLabel
    ]
        .join(" ")
        .toLowerCase();

    return haystack.includes(term);
  });
}

function renderStats() {
  const total = state.trainings.length;
  const templates = state.trainings.filter((training) => training.is_template).length;
  const mine = state.currentUser
      ? state.trainings.filter(
          (training) => !training.is_template && training.created_by_user_id === state.currentUser.id
      ).length
      : 0;

  statsGrid.innerHTML = `
    <div class="stat-item">
      <span class="stat-item__label">Gesamt Trainings</span>
      <span class="stat-item__value">${total}</span>
    </div>
    <div class="stat-item">
      <span class="stat-item__label">Mustertrainings</span>
      <span class="stat-item__value">${templates}</span>
    </div>
    <div class="stat-item">
      <span class="stat-item__label">Meine Trainings</span>
      <span class="stat-item__value">${mine}</span>
    </div>
  `;
}

function renderExerciseStats() {
  const total = state.exerciseEntries.length;
  const warmups = state.exerciseEntries.filter((entry) => entry.type === "warmup").length;
  const exercises = state.exerciseEntries.filter((entry) => entry.type === "exercise").length;

  exercisesStatsGrid.innerHTML = `
    <div class="stat-item">
      <span class="stat-item__label">Gesamt Exercises</span>
      <span class="stat-item__value">${total}</span>
    </div>
    <div class="stat-item">
      <span class="stat-item__label">Aufwärmen</span>
      <span class="stat-item__value">${warmups}</span>
    </div>
    <div class="stat-item">
      <span class="stat-item__label">Übungen</span>
      <span class="stat-item__value">${exercises}</span>
    </div>
  `;
}

function getSelectedTraining() {
  return state.trainings.find((training) => training.id === state.selectedTrainingId) || null;
}

function canEditTraining(training, sourceView) {
  if (!training || !state.currentUser) return false;

  const role = normalizeRole(state.currentUser.role);

  if (role === "admin") {
    return true;
  }

  if (role === "trainer") {
    return sourceView === "my-trainings" && training.created_by_user_id === state.currentUser.id;
  }

  return false;
}

function openTrainingDetail(trainingId, sourceView = state.activeView) {
  state.selectedTrainingId = trainingId;
  state.selectedExerciseEntryId = null;
  state.detailSourceView = sourceView;
  state.activeView = "training-detail";
  render();
}

function getSelectedExerciseEntry() {
  return state.exerciseEntries.find((entry) => entry.id === state.selectedExerciseEntryId) || null;
}

function openExerciseDetail(entryId) {
  state.selectedExerciseEntryId = entryId;
  state.selectedTrainingId = null;
  state.detailSourceView = "exercises";
  state.activeView = "exercise-detail";
  render();
}

function createDetailMetaItem(label, value) {
  return `
    <div class="detail-meta-item">
      <span class="detail-meta-item__label">${label}</span>
      <div class="detail-meta-item__value">${value}</div>
    </div>
  `;
}

function createMediaPlaceholder(text) {
  return `<div class="detail-media-placeholder">${text}</div>`;
}

function createWarmupImageMarkup(warmup) {
  if (isImageDataUrl(warmup.image_preview_url)) {
    return `
      <div class="detail-image-frame">
        <img class="detail-image" src="${warmup.image_preview_url}" alt="${
        warmup.name ? `Skizze zu ${warmup.name}` : "Aufwärmskizze"
    }" />
        <div class="detail-image-caption">
          ${warmup.image_name || "Bildvorschau"}
        </div>
      </div>
    `;
  }

  if (warmup.image_name) {
    return createMediaPlaceholder(warmup.image_name);
  }

  return createMediaPlaceholder("Keine Skizze hinterlegt");
}

function createExerciseImageMarkup(exercise) {
  if (isImageDataUrl(exercise.sketch_preview_url)) {
    return `
      <div class="detail-image-frame">
        <img class="detail-image" src="${exercise.sketch_preview_url}" alt="${
        exercise.name ? `Skizze zu ${exercise.name}` : "Übungsskizze"
    }" />
        <div class="detail-image-caption">
          ${exercise.sketch_file_name || "Bildvorschau"}
        </div>
      </div>
    `;
  }

  if (exercise.sketch_file_name) {
    return createMediaPlaceholder(exercise.sketch_file_name);
  }

  return createMediaPlaceholder("Keine Skizze hinterlegt");
}

function createTrainingSketchMarkup(training) {
  if (isImageDataUrl(training.sketch_preview_url)) {
    return `
      <div class="detail-image-frame detail-image-frame--training-extra">
        <img
          class="detail-image detail-image--training-extra"
          src="${training.sketch_preview_url}"
          alt="Zusätzliche Skizze zum Training"
        />
      </div>
    `;
  }

  if (training.sketch_file_name) {
    return `<div class="detail-file-box">Zusätzliche Datei hinterlegt.</div>`;
  }

  return "";
}

function renderTrainingDetail() {
  const training = getSelectedTraining();
  const editable = canEditTraining(training, state.detailSourceView);
  const isAdmin = state.currentUser && normalizeRole(state.currentUser.role) === "admin";

  trainingDetailWarmup.parentElement.classList.remove("is-hidden");
  trainingDetailExercises.parentElement.classList.remove("is-hidden");
  trainingDetailSketch.parentElement.classList.add("is-hidden");
  trainingDetailNotes.parentElement.classList.add("is-hidden");

  trainingDetailWarmup.parentElement.querySelector(".detail-section-title").textContent = "Aufwärmen";
  trainingDetailExercises.parentElement.querySelector(".detail-section-title").textContent = "Übungen";

  detailPrintBtn.classList.toggle("is-hidden", !training);
  detailEditBtn.classList.toggle("is-hidden", !editable);
  detailDeleteBtn.classList.toggle("is-hidden", !(isAdmin && training));

  if (!training) {
    detailPrintBtn.classList.add("is-hidden");
    detailDeleteBtn.classList.add("is-hidden");
    trainingDetailTitle.textContent = "Training nicht gefunden";
    trainingDetailMeta.innerHTML = `<div class="detail-empty">Kein Training gefunden.</div>`;
    trainingDetailWarmup.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    trainingDetailExercises.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    trainingDetailSketch.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    trainingDetailNotes.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    return;
  }

  trainingDetailTitle.textContent = training.title;

  const hasTrainingSketch = Boolean(training.sketch_file_name || training.sketch_preview_url);
  const hasTrainingNotes = Boolean(String(training.notes || "").trim());

  const overviewExtraHtml =
      hasTrainingSketch || hasTrainingNotes
          ? `
          <div class="detail-overview-extra">
            ${
              hasTrainingNotes
                  ? `
                      <div class="detail-overview-extra__block">
                        <span class="detail-meta-item__label">Notizen</span>
                        <p class="detail-text">${training.notes}</p>
                      </div>
                    `
                  : ""
          }

            ${
              hasTrainingSketch
                  ? `
                      <div class="detail-overview-extra__block detail-overview-extra__media">
                        <span class="detail-meta-item__label">Zusätzliche Skizze</span>
                        ${createTrainingSketchMarkup(training)}
                      </div>
                    `
                  : ""
          }
          </div>
        `
          : "";

  trainingDetailMeta.innerHTML =
      [
        createDetailMetaItem("Name", training.title),
        createDetailMetaItem("Datum", training.dateLabel),
        createDetailMetaItem("Spieleranzahl", training.required_players || "—"),
        createDetailMetaItem("Altersgruppe", training.age_group || "—"),
        createDetailMetaItem("Dauer", training.duration ? `${training.duration} min` : "—"),
        createDetailMetaItem("Ersteller", training.created_by_username || "—")
      ].join("") + overviewExtraHtml;

  const warmup = training.warmup;

  if (hasWarmupContent(warmup)) {
    trainingDetailWarmup.innerHTML = `
      <div class="detail-card">
        <h4 class="detail-card__title">${warmup.name || "Aufwärmübung"}</h4>
        <div class="detail-split">
          <div class="detail-split__content">
            <div class="detail-inline-grid detail-inline-grid--2">
              <div>
                <span class="detail-meta-item__label">Dauer</span>
                <div class="detail-meta-item__value">${warmup.duration || "—"}</div>
              </div>
            </div>
            <div>
              <span class="detail-meta-item__label">Beschreibung</span>
              <p class="detail-text">${warmup.description || "Keine Beschreibung vorhanden."}</p>
            </div>
            <div>
              <span class="detail-meta-item__label">Coachingpunkte</span>
              <p class="detail-text">${warmup.coaching_points || "Keine Coachingpunkte vorhanden."}</p>
            </div>
            <div>
              <span class="detail-meta-item__label">Variation</span>
              <p class="detail-text">${warmup.variation || "Keine Variation vorhanden."}</p>
            </div>
          </div>
          <div class="detail-split__media">
            <span class="detail-meta-item__label">Skizze</span>
            ${createWarmupImageMarkup(warmup)}
          </div>
        </div>
      </div>
    `;
  } else {
    trainingDetailWarmup.innerHTML = `<div class="detail-empty">Kein Aufwärmen hinterlegt.</div>`;
  }

  if (Array.isArray(training.exercises) && training.exercises.length > 0) {
    trainingDetailExercises.innerHTML = `
      <div class="detail-stack">
        ${training.exercises
        .map(
            (exercise, index) => `
              <div class="detail-card">
                <h4 class="detail-card__title">Übung ${index + 1}${
                exercise.name ? ` – ${exercise.name}` : ""
            }</h4>
                <div class="detail-split">
                  <div class="detail-split__content">
                    <div class="detail-inline-grid detail-inline-grid--2">
                      <div>
                        <span class="detail-meta-item__label">Dauer</span>
                        <div class="detail-meta-item__value">${exercise.duration || "—"}</div>
                      </div>
                      <div>
                        <span class="detail-meta-item__label">Material</span>
                        <div class="detail-meta-item__value">${exercise.material || "—"}</div>
                      </div>
                    </div>
                    <div>
                      <span class="detail-meta-item__label">Beschreibung</span>
                      <p class="detail-text">${exercise.description || "Keine Beschreibung vorhanden."}</p>
                    </div>
                    <div>
                      <span class="detail-meta-item__label">Coachingpunkte</span>
                      <p class="detail-text">${exercise.coaching_points || "Keine Coachingpunkte vorhanden."}</p>
                    </div>
                    <div>
                      <span class="detail-meta-item__label">Variation</span>
                      <p class="detail-text">${exercise.variation || "Keine Variation vorhanden."}</p>
                    </div>
                  </div>
                  <div class="detail-split__media">
                    <span class="detail-meta-item__label">Skizze</span>
                    ${createExerciseImageMarkup(exercise)}
                  </div>
                </div>
              </div>
            `
        )
        .join("")}
      </div>
    `;
  } else {
    trainingDetailExercises.innerHTML = `<div class="detail-empty">Keine Übungen hinterlegt.</div>`;
  }

  trainingDetailSketch.parentElement.classList.add("is-hidden");
  trainingDetailNotes.parentElement.classList.add("is-hidden");

  trainingDetailSketch.innerHTML = "";
  trainingDetailNotes.innerHTML = "";
}

function renderExerciseDetail() {
  const entry = getSelectedExerciseEntry();

  trainingDetailWarmup.parentElement.classList.add("is-hidden");
  trainingDetailExercises.parentElement.classList.remove("is-hidden");
  trainingDetailSketch.parentElement.classList.add("is-hidden");
  trainingDetailNotes.parentElement.classList.add("is-hidden");

  trainingDetailWarmup.parentElement.querySelector(".detail-section-title").textContent = "Aufwärmen";
  trainingDetailExercises.parentElement.querySelector(".detail-section-title").textContent =
      entry?.type === "warmup" ? "Aufwärmen" : "Übung";

  detailPrintBtn.classList.toggle("is-hidden", !entry);
  detailEditBtn.classList.add("is-hidden");
  detailDeleteBtn.classList.add("is-hidden");

  trainingDetailSketch.innerHTML = "";
  trainingDetailNotes.innerHTML = "";
  trainingDetailWarmup.innerHTML = "";

  if (!entry) {
    trainingDetailTitle.textContent = "Übung nicht gefunden";
    trainingDetailMeta.innerHTML = `<div class="detail-empty">Keine Übung gefunden.</div>`;
    trainingDetailExercises.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    return;
  }

  const mediaMarkup =
      entry.type === "warmup"
          ? createWarmupImageMarkup({
            name: entry.title,
            image_name: entry.image_name,
            image_preview_url: entry.image_preview_url
          })
          : createExerciseImageMarkup({
            name: entry.title,
            sketch_file_name: entry.sketch_file_name,
            sketch_preview_url: entry.sketch_preview_url
          });

  trainingDetailTitle.textContent = entry.title || entry.typeLabel;

  trainingDetailMeta.innerHTML = [
    createDetailMetaItem("Name", entry.title || "—"),
    createDetailMetaItem("Typ", entry.typeLabel || "—"),
    createDetailMetaItem("Ursprüngliches Training", entry.trainingTitle || "—"),
    createDetailMetaItem("Datum", entry.dateLabel || "—"),
    createDetailMetaItem("Spieleranzahl", entry.required_players || "—"),
    createDetailMetaItem("Altersgruppe", entry.age_group || "—"),
    createDetailMetaItem("Dauer", entry.duration ? `${entry.duration} min` : "—")
  ].join("");

  trainingDetailExercises.innerHTML = `
    <div class="detail-card">
      <h4 class="detail-card__title">${entry.title || entry.typeLabel}</h4>
      <div class="detail-split">
        <div class="detail-split__content">
          <div class="detail-inline-grid detail-inline-grid--2">
            <div>
              <span class="detail-meta-item__label">Dauer</span>
              <div class="detail-meta-item__value">${entry.duration || "—"}</div>
            </div>
            <div>
              <span class="detail-meta-item__label">Material</span>
              <div class="detail-meta-item__value">${entry.material || "—"}</div>
            </div>
          </div>

          <div>
            <span class="detail-meta-item__label">Beschreibung</span>
            <p class="detail-text">${entry.description || "Keine Beschreibung vorhanden."}</p>
          </div>

          <div>
            <span class="detail-meta-item__label">Coachingpunkte</span>
            <p class="detail-text">${entry.coaching_points || "Keine Coachingpunkte vorhanden."}</p>
          </div>

          <div>
            <span class="detail-meta-item__label">Variation</span>
            <p class="detail-text">${entry.variation || "Keine Variation vorhanden."}</p>
          </div>
        </div>

        <div class="detail-split__media">
          <span class="detail-meta-item__label">Skizze</span>
          ${mediaMarkup}
        </div>
      </div>
    </div>
  `;
}

function renderTable() {
  const totalItems = state.filteredTrainings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / state.itemsPerPage));
  state.currentPage = Math.min(state.currentPage, totalPages);

  const start = (state.currentPage - 1) * state.itemsPerPage;
  const visibleItems = state.filteredTrainings.slice(start, start + state.itemsPerPage);

  if (visibleItems.length === 0) {
    trainingsTableWrap.innerHTML = `<div class="empty-state">Keine Trainings für die aktuelle Filterung gefunden.</div>`;
    pagination.innerHTML = "";
    return;
  }

  const rows = visibleItems
      .map((training) => {
        return `
        <tr class="training-table__row--clickable" tabindex="0" data-training-id="${training.id}">
          <td data-label="Name">
            <button class="training-name training-name--button" type="button">
              ${training.title}
            </button>
          </td>
          <td data-label="Datum">${training.dateLabel}</td>
          <td data-label="Spieler">${training.required_players || "—"}</td>
          <td data-label="Mustertraining">
            <span class="mt-indicator ${
            training.is_template ? "mt-indicator--active" : "mt-indicator--inactive"
        }">
              ${training.is_template ? "X" : "–"}
            </span>
          </td>
          <td data-label="Kategorie"><span class="category-pill">${training.age_group}</span></td>
        </tr>
      `;
      })
      .join("");

  trainingsTableWrap.innerHTML = `
    <table class="training-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Datum</th>
          <th>Spieler</th>
          <th>Mustertraining</th>
          <th>Kategorie</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  trainingsTableWrap.querySelectorAll("[data-training-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openTrainingDetail(row.dataset.trainingId, state.activeView);
    });

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTrainingDetail(row.dataset.trainingId, state.activeView);
      }
    });
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  const buttons = [];

  buttons.push(`
    <button class="pagination__btn ${state.currentPage === 1 ? "is-disabled" : ""}" data-page="${
      state.currentPage - 1
  }">
      Zurück
    </button>
  `);

  for (let page = 1; page <= totalPages; page += 1) {
    buttons.push(`
      <button class="pagination__btn ${page === state.currentPage ? "is-active" : ""}" data-page="${page}">
        ${page}
      </button>
    `);
  }

  buttons.push(`
    <button class="pagination__btn ${
      state.currentPage === totalPages ? "is-disabled" : ""
  }" data-page="${state.currentPage + 1}">
      Weiter
    </button>
  `);

  pagination.innerHTML = buttons.join("");

  pagination.querySelectorAll("[data-page]").forEach((button) => {
    if (button.classList.contains("is-disabled")) return;

    button.addEventListener("click", () => {
      state.currentPage = Number(button.dataset.page);
      renderTable();
    });
  });
}

function renderExercisesTable() {
  const totalItems = state.filteredExerciseEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / state.itemsPerPage));
  state.currentPage = Math.min(state.currentPage, totalPages);

  const start = (state.currentPage - 1) * state.itemsPerPage;
  const visibleItems = state.filteredExerciseEntries.slice(start, start + state.itemsPerPage);

  if (visibleItems.length === 0) {
    exercisesTableWrap.innerHTML = `<div class="empty-state">Keine Exercises für die aktuelle Filterung gefunden.</div>`;
    exercisesPagination.innerHTML = "";
    return;
  }

  const rows = visibleItems
      .map((entry) => {
        const typeBadgeClass = entry.type === "warmup" ? "detail-pill--warmup" : "detail-pill--exercise";

        return `
        <tr class="training-table__row--clickable" tabindex="0" data-exercise-id="${entry.id}">
          <td data-label="Exercise">
            <button class="training-name training-name--button" type="button">
              ${entry.title}
            </button>
          </td>
          <td data-label="Typ"><span class="detail-pill ${typeBadgeClass}">${entry.typeLabel}</span></td>
          <td data-label="Training">${entry.trainingTitle}</td>
          <td data-label="Spieler">${entry.required_players || "—"}</td>
          <td data-label="Kategorie"><span class="category-pill">${entry.age_group}</span></td>
          <td data-label="Datum">${entry.dateLabel}</td>
        </tr>
      `;
      })
      .join("");

  exercisesTableWrap.innerHTML = `
    <table class="training-table">
      <thead>
        <tr>
          <th>Exercise</th>
          <th>Typ</th>
          <th>Training</th>
          <th>Spieler</th>
          <th>Kategorie</th>
          <th>Datum</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  exercisesTableWrap.querySelectorAll("[data-exercise-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openExerciseDetail(row.dataset.exerciseId);
    });

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openExerciseDetail(row.dataset.exerciseId);
      }
    });
  });

  renderExercisesPagination(totalPages);
}

function renderExercisesPagination(totalPages) {
  if (totalPages <= 1) {
    exercisesPagination.innerHTML = "";
    return;
  }

  const buttons = [];

  buttons.push(`
    <button class="pagination__btn ${state.currentPage === 1 ? "is-disabled" : ""}" data-exercise-page="${
      state.currentPage - 1
  }">
      Zurück
    </button>
  `);

  for (let page = 1; page <= totalPages; page += 1) {
    buttons.push(`
      <button class="pagination__btn ${page === state.currentPage ? "is-active" : ""}" data-exercise-page="${page}">
        ${page}
      </button>
    `);
  }

  buttons.push(`
    <button class="pagination__btn ${
      state.currentPage === totalPages ? "is-disabled" : ""
  }" data-exercise-page="${state.currentPage + 1}">
      Weiter
    </button>
  `);

  exercisesPagination.innerHTML = buttons.join("");

  exercisesPagination.querySelectorAll("[data-exercise-page]").forEach((button) => {
    if (button.classList.contains("is-disabled")) return;

    button.addEventListener("click", () => {
      state.currentPage = Number(button.dataset.exercisePage);
      renderExercisesTable();
    });
  });
}

function renderLibraryResults(container, entries, mode) {
  if (entries.length === 0) {
    container.innerHTML = `<div class="library-picker__empty">Keine passenden Einträge gefunden.</div>`;
    return;
  }

  container.innerHTML = entries
      .map((entry) => {
        const typeBadgeClass = entry.type === "warmup" ? "detail-pill--warmup" : "detail-pill--exercise";
        const description = entry.description || "Keine Beschreibung vorhanden.";

        return `
        <div class="library-picker__item">
          <div class="library-picker__meta">
            <div class="library-picker__title">${entry.title}</div>
            <div class="library-picker__subline">
              <span class="detail-pill ${typeBadgeClass}">${entry.typeLabel}</span>
              &nbsp;•&nbsp; ${entry.trainingTitle}
              &nbsp;•&nbsp; ${entry.age_group}
              &nbsp;•&nbsp; ${entry.required_players || "—"} Spieler
            </div>
            <div class="library-picker__copy">${description}</div>
          </div>
          <button class="btn btn--primary" type="button" data-library-select="${mode}" data-library-id="${entry.id}">
            Einfügen
          </button>
        </div>
      `;
      })
      .join("");
}

function renderWarmupLibrary() {
  const entries = filterLibraryEntries("warmup", warmupLibrarySearch.value);
  renderLibraryResults(warmupLibraryResults, entries, "warmup");
}

function renderExerciseLibrary() {
  const entries = filterLibraryEntries("exercise", exerciseLibrarySearch.value);
  renderLibraryResults(exerciseLibraryResults, entries, "exercise");
}

function openWarmupLibrary() {
  warmupLibraryPanel.classList.remove("is-hidden");
  renderWarmupLibrary();
}

function closeWarmupLibrary() {
  warmupLibraryPanel.classList.add("is-hidden");
}

function openExerciseLibrary() {
  exerciseLibraryPanel.classList.remove("is-hidden");
  renderExerciseLibrary();
}

function closeExerciseLibrary() {
  exerciseLibraryPanel.classList.add("is-hidden");
}

function resetLibraryPickers() {
  warmupLibrarySearch.value = "";
  exerciseLibrarySearch.value = "";
  closeWarmupLibrary();
  closeExerciseLibrary();
  warmupLibraryResults.innerHTML = "";
  exerciseLibraryResults.innerHTML = "";
}

function findLibraryEntryById(entryId, type) {
  return state.exerciseEntries.find((entry) => entry.id === entryId && entry.type === type) || null;
}

function useWarmupLibraryEntry(entry) {
  trainingCreateForm.elements.warmup_name.value = entry.title || "";
  trainingCreateForm.elements.warmup_duration.value = entry.duration || "";
  trainingCreateForm.elements.warmup_description.value = entry.description || "";

  if (trainingCreateForm.elements.warmup_coaching_points) {
    trainingCreateForm.elements.warmup_coaching_points.value = entry.coaching_points || "";
  }

  if (trainingCreateForm.elements.warmup_variation) {
    trainingCreateForm.elements.warmup_variation.value = entry.variation || "";
  }

  setUploadBoxExistingFile(
      warmupUploadBox,
      warmupUploadTitle,
      warmupUploadSubtitle,
      entry.image_name || "",
      "Skizze hochladen",
      "PNG oder JPG bis 5MB",
      entry.image_preview_url || ""
  );

  closeWarmupLibrary();
}

function useExerciseLibraryEntry(entry) {
  createExerciseBlock({
    name: entry.title || "",
    duration: entry.duration || "",
    description: entry.description || "",
    coaching_points: entry.coaching_points || "",
    variation: entry.variation || "",
    material: entry.material || "",
    sketch_file_name: entry.sketch_file_name || "",
    sketch_preview_url: entry.sketch_preview_url || ""
  });

  closeExerciseLibrary();
}

function updatePageHeader() {
  if (state.activeView === "library") {
    pageTitle.textContent = "Bibliothek";
    return;
  }

  if (state.activeView === "my-trainings") {
    pageTitle.textContent = "Meine Trainings";
    return;
  }

  if (state.activeView === "template-trainings") {
    pageTitle.textContent = "Mustertrainings";
    return;
  }

  if (state.activeView === "exercises") {
    pageTitle.textContent = "Exercises";
    return;
  }

  if (state.activeView === "user-management") {
    pageTitle.textContent = "Benutzer";
    return;
  }

  if (state.activeView === "impressum") {
    pageTitle.textContent = "Impressum";
    return;
  }

  if (state.activeView === "terms") {
    pageTitle.textContent = "Nutzungsbedingungen";
    return;
  }

  if (state.activeView === "profile") {
    pageTitle.textContent = "Profil";
  }
}

function renderViews() {
  const isListing = ["library", "my-trainings", "template-trainings"].includes(state.activeView);

  listingView.classList.toggle("is-active", isListing);
  exercisesView.classList.toggle("is-active", state.activeView === "exercises");
  userManagementView?.classList.toggle("is-active", state.activeView === "user-management");
  trainingDetailView.classList.toggle("is-active", ["training-detail", "exercise-detail"].includes(state.activeView));
  trainingCreateView.classList.toggle("is-active", state.activeView === "training-create");
  profileView.classList.toggle("is-active", state.activeView === "profile");
  impressumView?.classList.toggle("is-active", state.activeView === "impressum");
  termsView?.classList.toggle("is-active", state.activeView === "terms");
  usernameEditView.classList.toggle("is-active", state.activeView === "username-edit");
  passwordEditView.classList.toggle("is-active", state.activeView === "password-edit");
}

function renderActiveNav() {
  navLinks.forEach((link) => {
    const targetView = link.dataset.view;
    const isProfileGroup = ["profile", "username-edit", "password-edit"].includes(state.activeView);
    const isDetailGroup = state.activeView === "training-detail" && targetView === state.detailSourceView;
    const isExerciseDetailGroup = state.activeView === "exercise-detail" && targetView === "exercises";
    const isEditGroup = state.activeView === "training-create" && targetView === state.editReturnView;

    if (targetView === "profile") {
      link.classList.toggle("is-active", isProfileGroup);
      return;
    }

    link.classList.toggle("is-active", state.activeView === targetView || isDetailGroup || isExerciseDetailGroup || isEditGroup);
  });
}

function renderEditorState() {
  const isEditing = Boolean(state.editingTrainingId);

  trainingEditorTitle.textContent = isEditing ? "Training bearbeiten" : "Training erstellen";
  trainingSubmitBtn.textContent = isEditing ? "Änderungen speichern" : "Speichern";
}

function renderListing() {
  const baseList = getCurrentBaseList();
  state.filteredTrainings = applyFiltersToList(baseList);

  renderStats();
  renderTable();
}

function renderExercisesView() {
  state.filteredExerciseEntries = applyExerciseFiltersToList(state.exerciseEntries);

  renderExerciseStats();
  renderExercisesTable();
}

function escapeHtml(value) {
  return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}

function renderUserManagementView() {
  if (!userManagementTableWrap) return;

  if (!state.currentUser || normalizeRole(state.currentUser.role) !== "admin") {
    userManagementTableWrap.innerHTML = `
      <div class="empty-state">Nur Admins dürfen Benutzer verwalten.</div>
    `;
    return;
  }

  if (!state.users.length) {
    userManagementTableWrap.innerHTML = `
      <div class="empty-state">Keine Benutzer vorhanden.</div>
    `;
    return;
  }

  const rows = state.users
      .map((user) => {
        const isCurrentUser = state.currentUser && user.id === state.currentUser.id;
        const safeUsername = escapeHtml(user.username);
        const safeClub = escapeHtml(user.club || "");

        return `
          <tr>
            <td data-label="Benutzer">
              <strong>${safeUsername}</strong>
              ${isCurrentUser ? `<span class="detail-pill" style="margin-left: 8px;">Du</span>` : ""}
            </td>

            <td data-label="Verein">
              <input
                class="field__control user-club-input"
                type="text"
                value="${safeClub}"
                placeholder="Verein"
                data-user-id="${user.id}"
              />
            </td>

            <td data-label="Rolle">
              <select class="field__control user-role-select" data-user-id="${user.id}">
                <option value="spieler" ${normalizeRole(user.role) === "spieler" ? "selected" : ""}>Spieler</option>
                <option value="trainer" ${normalizeRole(user.role) === "trainer" ? "selected" : ""}>Trainer</option>
                <option value="admin" ${normalizeRole(user.role) === "admin" ? "selected" : ""}>Admin</option>
              </select>
            </td>

            <td data-label="Neues Passwort">
              <input
                class="field__control user-password-input"
                type="password"
                placeholder="Passwort ändern"
                data-user-id="${user.id}"
              />
            </td>

            <td data-label="Aktion">
              <div class="table-actions">
                <button class="btn btn--primary btn--small user-save-btn" type="button" data-user-id="${user.id}">
                  Speichern
                </button>

                <button class="btn btn--secondary btn--small user-delete-btn" type="button" data-user-id="${user.id}">
                  Löschen
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

  userManagementTableWrap.innerHTML = `
    <table class="training-table">
      <thead>
        <tr>
          <th>Benutzer</th>
          <th>Verein</th>
          <th>Rolle</th>
          <th>Neues Passwort</th>
          <th>Aktion</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function render() {
  closeMobileMenu();
  updatePageHeader();
  renderViews();
  renderActiveNav();
  renderEditorState();

  if (["library", "my-trainings", "template-trainings"].includes(state.activeView)) {
    renderListing();
  }

  if (state.activeView === "exercises") {
    renderExercisesView();
  }

  if (state.activeView === "user-management") {
    renderUserManagementView();
  }

  if (state.activeView === "training-detail") {
    renderTrainingDetail();
  }

  if (state.activeView === "exercise-detail") {
    renderExerciseDetail();
  }

  if (state.activeView === "training-create") {
    renderWarmupLibrary();
    renderExerciseLibrary();
  }

  updateBrowserUrl();
}

function readFiltersFromInputs() {
  state.filters.age = filterAge.value;
  state.filters.date = filterDate.value;
  state.filters.players = filterPlayers.value;
  state.filters.topic = filterTopic.value.trim();
}

function resetFilters() {
  state.filters = { age: "", date: "", players: "", topic: "" };

  filterAge.value = "";
  filterDate.value = "";
  filterPlayers.value = "";
  filterTopic.value = "";
}

function readExerciseFiltersFromInputs() {
  state.exerciseFilters.type = exerciseFilterType.value;
  state.exerciseFilters.age = exerciseFilterAge.value;
  state.exerciseFilters.players = exerciseFilterPlayers.value;
  state.exerciseFilters.topic = exerciseFilterTopic.value.trim();
}

function resetExerciseFilters() {
  state.exerciseFilters = { type: "", age: "", players: "", topic: "" };

  exerciseFilterType.value = "";
  exerciseFilterAge.value = "";
  exerciseFilterPlayers.value = "";
  exerciseFilterTopic.value = "";
}

function resetUploadBox(box, titleEl, subtitleEl, title, subtitle) {
  box.classList.remove("has-file");
  box.dataset.existingFileName = "";
  box.dataset.existingPreviewUrl = "";
  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;
}

function setUploadBoxExistingFile(box, titleEl, subtitleEl, fileName, defaultTitle, defaultSubtitle, previewUrl = "") {
  if (!fileName) {
    resetUploadBox(box, titleEl, subtitleEl, defaultTitle, defaultSubtitle);
    return;
  }

  box.classList.add("has-file");
  box.dataset.existingFileName = fileName;
  box.dataset.existingPreviewUrl = previewUrl || "";
  titleEl.textContent = fileName;
  subtitleEl.textContent = "Bereits hinterlegte Datei";
}

function attachUploadBox(box, input, titleEl, subtitleEl, defaultTitle, defaultSubtitle) {
  function showSelectedFile(file) {
    box.classList.add("has-file");
    box.classList.remove("is-dragover");
    box.dataset.existingFileName = file.name;
    box.dataset.existingPreviewUrl = "";
    titleEl.textContent = file.name;
    subtitleEl.textContent = `Datei ausgewählt • ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  }

  function resetToDefaultOrExisting() {
    const existingFileName = box.dataset.existingFileName || "";
    const existingPreviewUrl = box.dataset.existingPreviewUrl || "";

    if (existingFileName) {
      setUploadBoxExistingFile(
          box,
          titleEl,
          subtitleEl,
          existingFileName,
          defaultTitle,
          defaultSubtitle,
          existingPreviewUrl
      );
      return;
    }

    resetUploadBox(box, titleEl, subtitleEl, defaultTitle, defaultSubtitle);
  }

  function isAllowedFile(file) {
    const accept = input.accept
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    if (accept.length === 0) return true;

    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();

    return accept.some((acceptedType) => {
      if (acceptedType.startsWith(".")) {
        return fileName.endsWith(acceptedType);
      }

      if (acceptedType.endsWith("/*")) {
        return fileType.startsWith(acceptedType.replace("/*", "/"));
      }

      return fileType === acceptedType;
    });
  }

  box.addEventListener("click", () => {
    input.click();
  });

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) {
      resetToDefaultOrExisting();
      return;
    }

    showSelectedFile(file);
  });

  box.addEventListener("dragenter", (event) => {
    event.preventDefault();
    box.classList.add("is-dragover");
  });

  box.addEventListener("dragover", (event) => {
    event.preventDefault();
    box.classList.add("is-dragover");
  });

  box.addEventListener("dragleave", () => {
    box.classList.remove("is-dragover");
  });

  box.addEventListener("drop", (event) => {
    event.preventDefault();
    box.classList.remove("is-dragover");

    const file = event.dataTransfer?.files?.[0];

    if (!file) return;

    if (!isAllowedFile(file)) {
      alert("Dieser Dateityp ist nicht erlaubt.");
      return;
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;

    showSelectedFile(file);
  });
}

function attachExerciseUploadBox(block) {
  const input = block.querySelector(".exercise-sketch-input");
  const box = block.querySelector(".exercise-upload-box");
  const titleEl = block.querySelector(".exercise-upload-title");
  const subtitleEl = block.querySelector(".exercise-upload-subtitle");

  if (!input || !box || !titleEl || !subtitleEl) return;

  attachUploadBox(
      box,
      input,
      titleEl,
      subtitleEl,
      "Skizze hochladen",
      "PNG, JPG oder PDF bis 5MB"
  );
}

function createExerciseBlock(exerciseData = null) {
  const wrapper = document.createElement("section");
  wrapper.className = "editor-card exercise-card";
  wrapper.innerHTML = `
    <div class="exercise-card__header">
      <div class="exercise-card__title-row">
        <div class="exercise-card__order-controls" aria-label="Reihenfolge ändern">
          <button
            class="exercise-order-btn"
            type="button"
            data-move-exercise="up"
            aria-label="Übung nach oben verschieben"
            title="Übung nach oben verschieben"
          >↑</button>
          <button
            class="exercise-order-btn"
            type="button"
            data-move-exercise="down"
            aria-label="Übung nach unten verschieben"
            title="Übung nach unten verschieben"
          >↓</button>
        </div>
        <h3 class="editor-card__title exercise-card__title">Übung</h3>
      </div>
      <button class="exercise-remove-btn" type="button" data-remove-exercise>Entfernen</button>
    </div>

    <div class="form-grid form-grid--2">
      <label class="field">
        <span class="field__label">Name der Übung</span>
        <input class="field__control" type="text" name="exercise_name" placeholder="z.B. Passspiel im Quadrat" />
      </label>

      <label class="field">
        <span class="field__label">Dauer</span>
        <input class="field__control" type="text" name="exercise_duration" placeholder="z.B. 20 min" />
      </label>
    </div>

    <label class="field">
      <span class="field__label">Beschreibung</span>
      <textarea class="field__control field__control--textarea" name="exercise_description" placeholder="Beschreiben Sie die Übung detailliert..."></textarea>
    </label>

    <div class="form-grid form-grid--2">
      <label class="field">
        <span class="field__label">Coachingpunkte</span>
        <textarea class="field__control field__control--textarea" name="exercise_coaching_points" placeholder="Wichtige Coachingpunkte..."></textarea>
      </label>

      <label class="field">
        <span class="field__label">Variation</span>
        <textarea class="field__control field__control--textarea" name="exercise_variation" placeholder="Mögliche Variationen..."></textarea>
      </label>
    </div>

    <label class="field">
      <span class="field__label">Material</span>
      <input class="field__control" type="text" name="exercise_material" placeholder="z.B. 4 Hütchen, 1 Ball pro Gruppe" />
    </label>

    <div class="field">
      <span class="field__label">Skizze zur Übung hochladen</span>
      <input class="visually-hidden exercise-sketch-input" type="file" accept=".png,.jpg,.jpeg,.pdf" />
      <button class="upload-box exercise-upload-box" type="button">
        <span class="upload-box__icon">⇪</span>
        <span class="upload-box__title exercise-upload-title">Skizze hochladen</span>
        <span class="upload-box__subtitle exercise-upload-subtitle">PNG, JPG oder PDF bis 5MB</span>
      </button>
    </div>
  `;

  exerciseBlocks.appendChild(wrapper);
  attachExerciseUploadBox(wrapper);

  if (exerciseData) {
    wrapper.querySelector('[name="exercise_name"]').value = exerciseData.name || "";
    wrapper.querySelector('[name="exercise_duration"]').value = exerciseData.duration || "";
    wrapper.querySelector('[name="exercise_description"]').value = exerciseData.description || "";
    wrapper.querySelector('[name="exercise_coaching_points"]').value = exerciseData.coaching_points || "";
    wrapper.querySelector('[name="exercise_variation"]').value = exerciseData.variation || "";
    wrapper.querySelector('[name="exercise_material"]').value = exerciseData.material || "";

    const box = wrapper.querySelector(".exercise-upload-box");
    const titleEl = wrapper.querySelector(".exercise-upload-title");
    const subtitleEl = wrapper.querySelector(".exercise-upload-subtitle");

    setUploadBoxExistingFile(
        box,
        titleEl,
        subtitleEl,
        exerciseData.sketch_file_name || "",
        "Skizze hochladen",
        "PNG, JPG oder PDF bis 5MB",
        exerciseData.sketch_preview_url || ""
    );
  }

  updateExerciseTitles();
}

function updateExerciseTitles() {
  const blocks = [...exerciseBlocks.querySelectorAll(".exercise-card")];

  blocks.forEach((block, index) => {
    const title = block.querySelector(".exercise-card__title");
    const removeBtn = block.querySelector("[data-remove-exercise]");
    const moveUpBtn = block.querySelector('[data-move-exercise="up"]');
    const moveDownBtn = block.querySelector('[data-move-exercise="down"]');

    if (title) {
      title.textContent = `Übung ${index + 1}`;
    }

    if (removeBtn) {
      removeBtn.classList.toggle("is-hidden", blocks.length === 1);
    }

    if (moveUpBtn) {
      moveUpBtn.disabled = index === 0;
    }

    if (moveDownBtn) {
      moveDownBtn.disabled = index === blocks.length - 1;
    }
  });
}

function moveExerciseBlock(card, direction) {
  if (!card || !card.classList.contains("exercise-card")) return;

  if (direction === "up") {
    const previousCard = card.previousElementSibling;

    if (previousCard && previousCard.classList.contains("exercise-card")) {
      exerciseBlocks.insertBefore(card, previousCard);
    }
  }

  if (direction === "down") {
    const nextCard = card.nextElementSibling;

    if (nextCard && nextCard.classList.contains("exercise-card")) {
      exerciseBlocks.insertBefore(nextCard, card);
    }
  }

  updateExerciseTitles();

  const focusButton = card.querySelector(`[data-move-exercise="${direction}"]`);
  if (focusButton) {
    focusButton.focus();
  }
}

function resetTrainingCreateForm() {
  trainingCreateForm.reset();

  if (trainingCreateForm.elements.is_template) {
    const isAdmin = state.currentUser && normalizeRole(state.currentUser.role) === "admin";
    trainingCreateForm.elements.is_template.checked = false;
    templateOptionField?.classList.toggle("is-hidden", !isAdmin);
  }

  state.editingTrainingId = null;
  state.editReturnView = "library";

  populateTrainingAgeGroupSelect();
  resetLibraryPickers();

  exerciseBlocks.innerHTML = "";
  createExerciseBlock();

  warmupImageInput.value = "";
  sketchInput.value = "";

  resetUploadBox(warmupUploadBox, warmupUploadTitle, warmupUploadSubtitle, "Skizze hochladen", "PNG oder JPG bis 5MB");
  resetUploadBox(
      sketchUploadBox,
      sketchUploadTitle,
      sketchUploadSubtitle,
      "Datei hier ablegen oder klicken zum Hochladen",
      "PNG, JPG oder PDF bis 5MB"
  );
}

function populateTrainingFormForEdit(training) {
  resetTrainingCreateForm();

  trainingCreateForm.elements.title.value = training.title || "";
  trainingCreateForm.elements.session_date.value = training.dateValue || "";
  trainingCreateForm.elements.required_players.value = training.required_players || "";
  trainingCreateForm.elements.age_group.value = training.age_group || "";
  trainingCreateForm.elements.duration.value = training.duration || "";

  const isAdmin = state.currentUser && normalizeRole(state.currentUser.role) === "admin";

  trainingCreateForm.elements.is_template.checked = isAdmin
      ? Boolean(training.is_template)
      : false;

  templateOptionField?.classList.toggle("is-hidden", !isAdmin);

  trainingCreateForm.elements.notes.value = training.notes || "";

  trainingCreateForm.elements.warmup_name.value = training.warmup?.name || "";
  trainingCreateForm.elements.warmup_duration.value = training.warmup?.duration || "";
  trainingCreateForm.elements.warmup_description.value = training.warmup?.description || "";

  if (trainingCreateForm.elements.warmup_coaching_points) {
    trainingCreateForm.elements.warmup_coaching_points.value = training.warmup?.coaching_points || "";
  }

  if (trainingCreateForm.elements.warmup_variation) {
    trainingCreateForm.elements.warmup_variation.value = training.warmup?.variation || "";
  }

  setUploadBoxExistingFile(
      warmupUploadBox,
      warmupUploadTitle,
      warmupUploadSubtitle,
      training.warmup?.image_name || "",
      "Skizze hochladen",
      "PNG oder JPG bis 5MB",
      training.warmup?.image_preview_url || ""
  );

  setUploadBoxExistingFile(
      sketchUploadBox,
      sketchUploadTitle,
      sketchUploadSubtitle,
      training.sketch_file_name || "",
      "Datei hier ablegen oder klicken zum Hochladen",
      "PNG, JPG oder PDF bis 5MB",
      training.sketch_preview_url || ""
  );

  exerciseBlocks.innerHTML = "";

  if (Array.isArray(training.exercises) && training.exercises.length > 0) {
    training.exercises.forEach((exercise) => createExerciseBlock(exercise));
  } else {
    createExerciseBlock();
  }
}

function openTrainingCreateView() {
  resetTrainingCreateForm();
  state.activeView = "training-create";
  state.currentPage = 1;
  render();
}

function openTrainingEditView() {
  const training = getSelectedTraining();

  if (!training) return;
  if (!canEditTraining(training, state.detailSourceView)) return;

  populateTrainingFormForEdit(training);

  state.editingTrainingId = training.id;
  state.editReturnView = state.detailSourceView || "library";
  state.activeView = "training-create";

  render();
}

function openUsernameEditView() {
  if (!state.currentUser) return;

  usernameEditInput.value = state.currentUser.username;
  state.activeView = "username-edit";
  render();
}

function openPasswordEditView() {
  if (!state.currentUser) return;

  currentPasswordInput.value = "";
  newPasswordInput.value = "";
  repeatPasswordInput.value = "";
  state.activeView = "password-edit";
  render();
}

async function collectExercisesFromForm() {
  const blocks = [...exerciseBlocks.querySelectorAll(".exercise-card")];

  const exercises = await Promise.all(
      blocks.map(async (block) => {
        const sketchInputField = block.querySelector(".exercise-sketch-input");
        const sketchFile = sketchInputField?.files?.[0] || null;
        const sketchBox = block.querySelector(".exercise-upload-box");
        const existingSketchFileName = sketchBox?.dataset.existingFileName || "";
        const existingPreviewUrl = sketchBox?.dataset.existingPreviewUrl || "";

        let sketchPreviewUrl = existingPreviewUrl;

        if (sketchFile && sketchFile.type.startsWith("image/")) {
          sketchPreviewUrl = await readFileAsDataUrl(sketchFile);
        }

        if (sketchFile && !sketchFile.type.startsWith("image/")) {
          sketchPreviewUrl = "";
        }

        return {
          name: block.querySelector('[name="exercise_name"]')?.value || "",
          duration: block.querySelector('[name="exercise_duration"]')?.value || "",
          description: block.querySelector('[name="exercise_description"]')?.value || "",
          coaching_points: block.querySelector('[name="exercise_coaching_points"]')?.value || "",
          variation: block.querySelector('[name="exercise_variation"]')?.value || "",
          material: block.querySelector('[name="exercise_material"]')?.value || "",
          sketch_file_name: sketchFile ? sketchFile.name : existingSketchFileName,
          sketch_preview_url: sketchPreviewUrl
        };
      })
  );

  return exercises.filter((exercise) => {
    return (
        exercise.name ||
        exercise.duration ||
        exercise.description ||
        exercise.coaching_points ||
        exercise.variation ||
        exercise.material ||
        exercise.sketch_file_name ||
        exercise.sketch_preview_url
    );
  });
}

async function loadAll(options = {}) {
  const applyRoute = Boolean(options.applyRoute);

  try {
    const [trainingEntries, userEntries] = await Promise.all([fetchTrainingEntries(), fetchUsers()]);

    state.trainings = trainingEntries.map(normalizeTraining);
    state.users = userEntries.map(normalizeUser);
    state.exerciseEntries = buildExerciseEntries();

    populateAgeFilter();
    populatePlayersFilter();
    populateExerciseAgeFilter();
    populateExercisePlayersFilter();
    populateTrainingAgeGroupSelect();

    if (state.currentUser) {
      state.currentUser = state.users.find((user) => user.id === state.currentUser.id) || null;
    }

    syncCurrentUserFromStorage();

    if (applyRoute) {
      applyBrowserRoute();
    }

    render();
  } catch (error) {
    console.error("Fehler beim Laden:", error);
    alert("Fehler beim Laden. Schau in die Browser-Konsole.");
  }
}

function findNewestMatchingUser(username, club, role) {
  const targetRole = normalizeRole(role);

  for (let index = state.users.length - 1; index >= 0; index -= 1) {
    const user = state.users[index];

    if (user.username === username && user.club === club && normalizeRole(user.role) === targetRole) {
      return user;
    }
  }

  return null;
}

function bindEvents() {
  authTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAuthTab(button.dataset.authTab);
    });
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const enteredUsername = String(loginUsername.value || "").trim();
    const enteredPassword = String(loginPassword.value || "");

    if (!enteredUsername) {
      alert("Bitte Benutzernamen eingeben.");
      return;
    }

    const matchedUser = state.users.find((user) => user.username === enteredUsername);

    if (!matchedUser) {
      alert("Benutzername nicht gefunden.");
      return;
    }

    if (matchedUser.password && matchedUser.password !== enteredPassword) {
      alert("Das Passwort ist nicht korrekt.");
      return;
    }

    state.activeView = "library";
    state.currentPage = 1;
    loginUsername.value = "";
    loginPassword.value = "";
    setCurrentUser(matchedUser);
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(registerForm);
    const username = String(formData.get("username") || "").trim();
    const club = String(formData.get("club") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!username || !club || !password) {
      alert("Bitte Benutzername, Verein und Passwort angeben.");
      return;
    }

    const usernameError = getUsernameValidationError(username);
    if (usernameError) {
      alert(usernameError);
      return;
    }

    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      alert(passwordError);
      return;
    }

    await createUser(null, { username, club, role: "trainer", password });
    await loadAll();

    const createdUser = findNewestMatchingUser(username, club, "trainer");

    if (createdUser) {
      state.activeView = "library";
      state.currentPage = 1;
      setCurrentUser(createdUser);
    }

    registerForm.reset();
    registerForm.querySelector('[name="club"]').value = "TSV Ottensheim";
    setAuthTab("login");
  });

  usernameEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.currentUser) {
      alert("Kein Benutzer angemeldet.");
      return;
    }

    const newUsername = String(usernameEditInput.value || "").trim();

    const usernameError = getUsernameValidationError(newUsername);
    if (usernameError) {
      alert(usernameError);
      return;
    }

    const result = await updateUserProfile(state.currentUser.id, { username: newUsername });
    if (!result) return;

    await loadAll();
    state.activeView = "profile";
    render();
    alert("Benutzername erfolgreich aktualisiert.");
  });

  passwordEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.currentUser) {
      alert("Kein Benutzer angemeldet.");
      return;
    }

    const currentPassword = String(currentPasswordInput.value || "");
    const newPassword = String(newPasswordInput.value || "");
    const repeatPassword = String(repeatPasswordInput.value || "");

    if (!newPassword || !repeatPassword) {
      alert("Bitte neues Passwort zweimal eingeben.");
      return;
    }

    if (newPassword !== repeatPassword) {
      alert("Die neuen Passwörter stimmen nicht überein.");
      return;
    }

    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      alert(passwordError);
      return;
    }

    if (state.currentUser.password && state.currentUser.password !== currentPassword) {
      alert("Das aktuelle Passwort ist nicht korrekt.");
      return;
    }

    const result = await updateUserProfile(state.currentUser.id, {
      password: newPassword
    });

    if (!result) return;

    await loadAll();
    state.activeView = "profile";
    render();
    alert("Passwort erfolgreich aktualisiert.");
  });

  devRoleForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.currentUser) {
      alert("Kein Benutzer angemeldet.");
      return;
    }

    const selectedRole = normalizeRole(profileRoleSelect.value);
    const result = await updateUserProfile(state.currentUser.id, {
      role: selectedRole
    });

    if (!result) return;

    await loadAll();
    state.activeView = "profile";
    render();
    alert(`Rolle wurde auf ${getRoleLabel(selectedRole)} gesetzt.`);
  });

  if (adminCreateUserForm) {
    adminCreateUserForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!state.currentUser || normalizeRole(state.currentUser.role) !== "admin") {
        alert("Nur Admins dürfen höhere Rollen vergeben.");
        return;
      }

      const formData = new FormData(adminCreateUserForm);
      const username = String(formData.get("username") || "").trim();
      const club = String(formData.get("club") || "").trim();
      const role = String(formData.get("role") || "").trim();
      const password = String(formData.get("password") || "").trim();

      if (!username || !club || !role || !password) {
        alert("Bitte alle Felder ausfüllen.");
        return;
      }

      const usernameError = getUsernameValidationError(username);
      if (usernameError) {
        alert(usernameError);
        return;
      }

      const passwordError = getPasswordValidationError(password);
      if (passwordError) {
        alert(passwordError);
        return;
      }

      await createUser(null, { username, club, role, password });

      adminCreateUserForm.reset();
      adminCreateUserForm.querySelector('[name="club"]').value = "TSV Ottensheim";
      adminCreateUserForm.querySelector('[name="role"]').value = "spieler";

      await loadAll();
      state.activeView = "profile";
      render();
    });
  }

  if (userManagementCreateForm) {
    userManagementCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!state.currentUser || normalizeRole(state.currentUser.role) !== "admin") {
        alert("Nur Admins dürfen Benutzer anlegen.");
        return;
      }

      const formData = new FormData(userManagementCreateForm);
      const username = String(formData.get("username") || "").trim();
      const club = String(formData.get("club") || "").trim();
      const role = normalizeRole(formData.get("role"));
      const password = String(formData.get("password") || "").trim();

      if (!username || !club || !role || !password) {
        alert("Bitte alle Felder ausfüllen.");
        return;
      }

      const usernameError = getUsernameValidationError(username);
      if (usernameError) {
        alert(usernameError);
        return;
      }

      const passwordError = getPasswordValidationError(password);
      if (passwordError) {
        alert(passwordError);
        return;
      }

      await createUser(null, { username, club, role, password });

      userManagementCreateForm.reset();
      userManagementCreateForm.querySelector('[name="club"]').value = "TSV Ottensheim";
      userManagementCreateForm.querySelector('[name="role"]').value = "spieler";

      await loadAll();
      state.activeView = "user-management";
      render();

      alert("Benutzer wurde angelegt.");
    });
  }

  if (userManagementTableWrap) {
    userManagementTableWrap.addEventListener("click", async (event) => {
      const saveButton = event.target.closest(".user-save-btn");
      const deleteButton = event.target.closest(".user-delete-btn");

      if (!saveButton && !deleteButton) return;

      if (!state.currentUser || normalizeRole(state.currentUser.role) !== "admin") {
        alert("Nur Admins dürfen Benutzer verwalten.");
        return;
      }

      const userId = saveButton?.dataset.userId || deleteButton?.dataset.userId;
      const user = state.users.find((item) => item.id === userId);

      if (!user) {
        alert("Benutzer nicht gefunden.");
        return;
      }

      if (deleteButton) {
        if (state.currentUser.id === user.id) {
          alert("Du kannst deinen eigenen Account nicht löschen.");
          return;
        }

        const confirmed = window.confirm(`Soll der Benutzer "${user.username}" wirklich gelöscht werden?`);

        if (!confirmed) return;

        const result = await deleteUser(user.id);

        if (!result) return;

        await loadAll();
        state.activeView = "user-management";
        render();

        alert("Benutzer wurde gelöscht.");
        return;
      }

      if (saveButton) {
        const clubInput = userManagementTableWrap.querySelector(`.user-club-input[data-user-id="${userId}"]`);
        const roleSelect = userManagementTableWrap.querySelector(`.user-role-select[data-user-id="${userId}"]`);
        const passwordInput = userManagementTableWrap.querySelector(`.user-password-input[data-user-id="${userId}"]`);

        const selectedClub = String(clubInput?.value || "").trim();
        const selectedRole = normalizeRole(roleSelect?.value);
        const newPassword = String(passwordInput?.value || "").trim();

        if (!selectedClub) {
          alert("Der Verein darf nicht leer sein.");
          return;
        }

        const payload = {
          club: selectedClub,
          role: selectedRole
        };

        if (newPassword) {
          const passwordError = getPasswordValidationError(newPassword);
          if (passwordError) {
            alert(passwordError);
            return;
          }

          payload.password = newPassword;
        }

        const result = await updateUserProfile(user.id, payload);

        if (!result) return;

        await loadAll();

        if (state.currentUser && normalizeRole(state.currentUser.role) === "admin") {
          state.activeView = "user-management";
        } else {
          state.activeView = "library";
        }

        render();

        alert("Benutzer wurde aktualisiert.");
      }
    });
  }

  mobileMenuToggle?.addEventListener("click", toggleMobileMenu);
  mobileMenuBackdrop?.addEventListener("click", closeMobileMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (!isMobileMenuViewport()) {
      closeMobileMenu();
    }
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const targetView = link.dataset.view;

      if (targetView === "user-management" && (!state.currentUser || normalizeRole(state.currentUser.role) !== "admin")) {
        alert("Nur Admins dürfen die Benutzerverwaltung öffnen.");
        return;
      }

      state.activeView = targetView;
      state.currentPage = 1;
      render();
    });
  });

  openUsernameEditBtn.addEventListener("click", openUsernameEditView);
  openPasswordEditBtn.addEventListener("click", openPasswordEditView);

  backToProfileFromUsernameBtn.addEventListener("click", () => {
    state.activeView = "profile";
    render();
  });

  cancelUsernameEditBtn.addEventListener("click", () => {
    state.activeView = "profile";
    render();
  });

  backToProfileFromPasswordBtn.addEventListener("click", () => {
    state.activeView = "profile";
    render();
  });

  cancelPasswordEditBtn.addEventListener("click", () => {
    state.activeView = "profile";
    render();
  });

  backFromDetailBtn.addEventListener("click", () => {
    state.activeView = state.detailSourceView || "library";
    render();
  });

  detailDeleteBtn.addEventListener("click", async () => {
    if (!state.currentUser || normalizeRole(state.currentUser.role) !== "admin") {
      alert("Nur Admins dürfen Trainings löschen.");
      return;
    }

    const training = getSelectedTraining();

    if (!training) {
      alert("Kein Training ausgewählt.");
      return;
    }

    const confirmed = confirm(`Möchtest du das Training "${training.title}" wirklich löschen?`);

    if (!confirmed) {
      return;
    }

    const deleted = await deleteTraining(training.id, null);

    if (!deleted) {
      return;
    }

    state.selectedTrainingId = null;
    state.activeView = state.detailSourceView || "library";
    state.currentPage = 1;

    await loadAll();
  });

  detailPrintBtn.addEventListener("click", () => {
    const previousTitle = document.title;

    if (state.activeView === "exercise-detail") {
      const entry = getSelectedExerciseEntry();

      if (!entry) {
        alert("Keine Übung ausgewählt.");
        return;
      }

      document.title = `${entry.typeLabel} - ${entry.title}`;
    } else {
      const training = getSelectedTraining();

      if (!training) {
        alert("Kein Training ausgewählt.");
        return;
      }

      document.title = `Training - ${training.title}`;
    }

    window.print();

    setTimeout(() => {
      document.title = previousTitle;
    }, 1000);
  });

  detailEditBtn.addEventListener("click", () => {
    openTrainingEditView();
  });

  applyFiltersBtn.addEventListener("click", () => {
    readFiltersFromInputs();
    state.currentPage = 1;
    render();
  });

  resetFiltersBtn.addEventListener("click", () => {
    resetFilters();
    populateAgeFilter();
    populatePlayersFilter();
    state.currentPage = 1;
    render();
  });

  applyExerciseFiltersBtn.addEventListener("click", () => {
    readExerciseFiltersFromInputs();
    state.currentPage = 1;
    render();
  });

  resetExerciseFiltersBtn.addEventListener("click", () => {
    resetExerciseFilters();
    populateExerciseAgeFilter();
    populateExercisePlayersFilter();
    state.currentPage = 1;
    render();
  });

  createTrainingBtn.addEventListener("click", () => {
    closeMobileMenu();
    openTrainingCreateView();
  });

  openWarmupLibraryBtn.addEventListener("click", () => {
    openWarmupLibrary();
  });

  closeWarmupLibraryBtn.addEventListener("click", () => {
    closeWarmupLibrary();
  });

  warmupLibrarySearch.addEventListener("input", () => {
    renderWarmupLibrary();
  });

  warmupLibraryResults.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest('[data-library-select="warmup"]');
    if (!button) return;

    const entry = findLibraryEntryById(button.dataset.libraryId, "warmup");
    if (!entry) return;

    useWarmupLibraryEntry(entry);
  });

  openExerciseLibraryBtn.addEventListener("click", () => {
    openExerciseLibrary();
  });

  closeExerciseLibraryBtn.addEventListener("click", () => {
    closeExerciseLibrary();
  });

  exerciseLibrarySearch.addEventListener("input", () => {
    renderExerciseLibrary();
  });

  exerciseLibraryResults.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest('[data-library-select="exercise"]');
    if (!button) return;

    const entry = findLibraryEntryById(button.dataset.libraryId, "exercise");
    if (!entry) return;

    useExerciseLibraryEntry(entry);
  });

  backToLibraryBtn.addEventListener("click", () => {
    resetLibraryPickers();

    if (state.editingTrainingId) {
      state.activeView = "training-detail";
      render();
      return;
    }

    state.activeView = "library";
    render();
  });

  cancelTrainingBtn.addEventListener("click", () => {
    resetLibraryPickers();

    if (state.editingTrainingId) {
      state.activeView = "training-detail";
      render();
      return;
    }

    state.activeView = "library";
    render();
  });

  addExerciseBtn.addEventListener("click", () => {
    createExerciseBlock();
  });

  exerciseBlocks.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const moveButton = target.closest("[data-move-exercise]");
    if (moveButton) {
      const card = moveButton.closest(".exercise-card");
      if (!card) return;

      moveExerciseBlock(card, moveButton.dataset.moveExercise);
      return;
    }

    const removeButton = target.closest("[data-remove-exercise]");
    if (!removeButton) return;

    const card = removeButton.closest(".exercise-card");
    if (!card) return;

    card.remove();
    updateExerciseTitles();

    if (exerciseBlocks.querySelectorAll(".exercise-card").length === 0) {
      createExerciseBlock();
    }
  });

  trainingCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.currentUser) {
      alert("Kein Benutzer angemeldet.");
      return;
    }

    const editingId = state.editingTrainingId;
    const formData = new FormData(trainingCreateForm);
    const isAdmin = state.currentUser && normalizeRole(state.currentUser.role) === "admin";
    const isTemplate = isAdmin && formData.get("is_template") === "on";
    const warmupFile = warmupImageInput.files?.[0] || null;
    const sketchFile = sketchInput.files?.[0] || null;
    const existingTraining = editingId
        ? state.trainings.find((training) => training.id === editingId) || null
        : null;
    const collectedExercises = await collectExercisesFromForm();

    let warmupPreviewUrl = warmupUploadBox.dataset.existingPreviewUrl || "";

    let trainingSketchPreviewUrl = sketchUploadBox.dataset.existingPreviewUrl || "";

    if (sketchFile && sketchFile.type.startsWith("image/")) {
      trainingSketchPreviewUrl = await readFileAsDataUrl(sketchFile);
    }

    if (sketchFile && !sketchFile.type.startsWith("image/")) {
      trainingSketchPreviewUrl = "";
    }

    if (warmupFile && warmupFile.type.startsWith("image/")) {
      warmupPreviewUrl = await readFileAsDataUrl(warmupFile);
    }

    if (warmupFile && !warmupFile.type.startsWith("image/")) {
      warmupPreviewUrl = "";
    }

    const payload = {
      title: formData.get("title"),
      session_date: formData.get("session_date"),
      required_players: formData.get("required_players"),
      age_group: formData.get("age_group"),
      duration: formData.get("duration"),
      is_template: isTemplate,
      notes: formData.get("notes"),
      warmup: {
        name: formData.get("warmup_name"),
        duration: formData.get("warmup_duration"),
        description: formData.get("warmup_description"),
        coaching_points: formData.get("warmup_coaching_points"),
        variation: formData.get("warmup_variation"),
        image_name: warmupFile ? warmupFile.name : warmupUploadBox.dataset.existingFileName || "",
        image_preview_url: warmupPreviewUrl
      },
      exercises: collectedExercises,
      sketch_file_name: sketchFile ? sketchFile.name : sketchUploadBox.dataset.existingFileName || "",
      sketch_preview_url: trainingSketchPreviewUrl,
      created_by_user_id: existingTraining?.created_by_user_id || state.currentUser.id,
      created_by_username: existingTraining?.created_by_username || state.currentUser.username,
      created_at: existingTraining?.created_at || null
    };

    let savedTraining = null;

    if (editingId) {
      savedTraining = await updateTraining(editingId, null, payload);
    } else {
      savedTraining = await createTraining(null, payload);
    }

    if (!savedTraining) return;

    state.selectedTrainingId = editingId || savedTraining.id;
    state.activeView = "training-detail";

    if (normalizeRole(state.currentUser.role) === "admin") {
      state.detailSourceView = state.editReturnView || "library";
    } else if (normalizeRole(state.currentUser.role) === "trainer") {
      state.detailSourceView = editingId ? state.editReturnView || "my-trainings" : "my-trainings";
    }

    resetTrainingCreateForm();
    await loadAll();
  });

  logoutBtn.addEventListener("click", () => {
    closeMobileMenu();
    resetTrainingCreateForm();
    setCurrentUser(null);
    setAuthTab("login");
    loginUsername.value = "";
    loginPassword.value = "";
  });

  attachUploadBox(
      warmupUploadBox,
      warmupImageInput,
      warmupUploadTitle,
      warmupUploadSubtitle,
      "Skizze hochladen",
      "PNG oder JPG bis 5MB"
  );

  attachUploadBox(
      sketchUploadBox,
      sketchInput,
      sketchUploadTitle,
      sketchUploadSubtitle,
      "Datei hier ablegen oder klicken zum Hochladen",
      "PNG, JPG oder PDF bis 5MB"
  );
}

window.addEventListener("popstate", () => {
  applyBrowserRoute();
  render();
});

bindEvents();
setAuthTab("login");
loadAll({ applyRoute: true });