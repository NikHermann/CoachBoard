import { fetchTrainingEntries, createTraining, updateTraining, deleteTraining } from "./trainingsService.js";
import { fetchUsers, createUser, updateUserProfile } from "./usersService.js";

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
  detailSourceView: "library",
  editingTrainingId: null,
  editReturnView: "library",
  filters: {
    age: "",
    date: "",
    players: "",
    topic: ""
  },
  exerciseFilters: {
    type: "",
    players: "",
    topic: ""
  }
};

const authScreen = document.getElementById("auth-screen");
const dashboardApp = document.getElementById("dashboard-app");

const authTabButtons = document.querySelectorAll("[data-auth-tab]");
const authLoginPanel = document.getElementById("auth-login-panel");
const authRegisterPanel = document.getElementById("auth-register-panel");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginUsername = document.getElementById("login-username");
const loginPassword = document.getElementById("login-password");

const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");

const listingView = document.getElementById("listing-view");
const exercisesView = document.getElementById("exercises-view");
const trainingDetailView = document.getElementById("training-detail-view");
const trainingCreateView = document.getElementById("training-create-view");
const profileView = document.getElementById("profile-view");
const usernameEditView = document.getElementById("username-edit-view");
const passwordEditView = document.getElementById("password-edit-view");

const statsGrid = document.getElementById("stats-grid");
const trainingsTableWrap = document.getElementById("trainings-table-wrap");
const pagination = document.getElementById("pagination");

const exercisesStatsGrid = document.getElementById("exercises-stats-grid");
const exercisesTableWrap = document.getElementById("exercises-table-wrap");
const exercisesPagination = document.getElementById("exercises-pagination");

const trainingDetailTitle = document.getElementById("training-detail-title");
const trainingDetailSubtitle = document.getElementById("training-detail-subtitle");
const trainingDetailMeta = document.getElementById("training-detail-meta");
const trainingDetailWarmup = document.getElementById("training-detail-warmup");
const trainingDetailExercises = document.getElementById("training-detail-exercises");
const trainingDetailSketch = document.getElementById("training-detail-sketch");
const trainingDetailNotes = document.getElementById("training-detail-notes");
const backFromDetailBtn = document.getElementById("back-from-detail-btn");
const detailDeleteBtn = document.getElementById("detail-delete-btn");
const detailEditBtn = document.getElementById("detail-edit-btn");

const filterAge = document.getElementById("filter-age");
const filterDate = document.getElementById("filter-date");
const filterPlayers = document.getElementById("filter-players");
const filterTopic = document.getElementById("filter-topic");

const exerciseFilterType = document.getElementById("exercise-filter-type");
const exerciseFilterPlayers = document.getElementById("exercise-filter-players");
const exerciseFilterTopic = document.getElementById("exercise-filter-topic");
const applyExerciseFiltersBtn = document.getElementById("apply-exercise-filters-btn");
const resetExerciseFiltersBtn = document.getElementById("reset-exercise-filters-btn");

const trainingAgeGroup = document.getElementById("training-age-group");
const trainingCreateForm = document.getElementById("training-create-form");
const createTrainingBtn = document.getElementById("create-training-btn");
const addExerciseBtn = document.getElementById("add-exercise-btn");
const exerciseBlocks = document.getElementById("exercise-blocks");
const backToLibraryBtn = document.getElementById("back-to-library-btn");
const cancelTrainingBtn = document.getElementById("cancel-training-btn");
const trainingEditorTitle = document.getElementById("training-editor-title");
const trainingEditorSubtitle = document.getElementById("training-editor-subtitle");
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

const devRoleForm = document.getElementById("dev-role-form");
const profileRoleSelect = document.getElementById("profile-role-select");

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
      (warmup.name || warmup.duration || warmup.description || warmup.image_name || warmup.image_preview_url)
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
  authScreen.classList.remove("is-hidden");
  dashboardApp.classList.add("is-hidden");
}

function showApp() {
  authScreen.classList.add("is-hidden");
  dashboardApp.classList.remove("is-hidden");
}

function setCurrentUser(user) {
  state.currentUser = user || null;

  if (state.currentUser) {
    localStorage.setItem(STORAGE_KEY, state.currentUser.id);
    showApp();
  } else {
    localStorage.removeItem(STORAGE_KEY);
    showAuth();
  }

  updateCurrentUserUI();
  render();
}

function syncCurrentUserFromStorage() {
  const savedUserId = localStorage.getItem(STORAGE_KEY);

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
    adminUserSection.classList.add("is-hidden");
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
  adminUserSection.classList.toggle("is-hidden", !isAdmin);
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
      const haystack = [
        training.title,
        training.description,
        training.age_group
      ].join(" ").toLowerCase();

      if (!haystack.includes(state.filters.topic.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
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
            (
                exercise.name ||
                exercise.duration ||
                exercise.description ||
                exercise.material ||
                exercise.sketch_file_name ||
                exercise.sketch_preview_url
            )
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

  return entries.sort((a, b) => {
    const dateA = new Date(a.sortDate).getTime() || 0;
    const dateB = new Date(b.sortDate).getTime() || 0;
    return dateB - dateA;
  });
}

function applyExerciseFiltersToList(list) {
  return list.filter((entry) => {
    if (state.exerciseFilters.type && entry.type !== state.exerciseFilters.type) {
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
        entry.material,
        entry.trainingTitle,
        entry.age_group,
        entry.typeLabel
      ].join(" ").toLowerCase();

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
      entry.material,
      entry.trainingTitle,
      entry.age_group,
      entry.typeLabel
    ].join(" ").toLowerCase();

    return haystack.includes(term);
  });
}

function renderStats() {
  const total = state.trainings.length;
  const templates = state.trainings.filter((training) => training.is_template).length;
  const mine = state.currentUser
      ? state.trainings.filter((training) => !training.is_template && training.created_by_user_id === state.currentUser.id).length
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
  state.detailSourceView = sourceView;
  state.activeView = "training-detail";
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
        <img
          class="detail-image"
          src="${warmup.image_preview_url}"
          alt="${warmup.name ? `Bild zu ${warmup.name}` : "Aufwärmbild"}"
        />
        <div class="detail-image-caption">
          ${warmup.image_name || "Bildvorschau"}
        </div>
      </div>
    `;
  }

  if (warmup.image_name) {
    return createMediaPlaceholder(warmup.image_name);
  }

  return createMediaPlaceholder("Kein Bild hinterlegt");
}

function createExerciseImageMarkup(exercise) {
  if (isImageDataUrl(exercise.sketch_preview_url)) {
    return `
      <div class="detail-image-frame">
        <img
          class="detail-image"
          src="${exercise.sketch_preview_url}"
          alt="${exercise.name ? `Skizze zu ${exercise.name}` : "Übungsskizze"}"
        />
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

function renderTrainingDetail() {
  const training = getSelectedTraining();
  const editable = canEditTraining(training, state.detailSourceView);
  const isAdmin = state.currentUser && normalizeRole(state.currentUser.role) === "admin";

  detailEditBtn.classList.toggle("is-hidden", !editable);
  detailDeleteBtn.classList.toggle("is-hidden", !(isAdmin && training));

  if (!training) {
    detailDeleteBtn.classList.add("is-hidden");
    trainingDetailTitle.textContent = "Training nicht gefunden";
    trainingDetailSubtitle.textContent = "Die ausgewählte Trainingseinheit konnte nicht geladen werden.";
    trainingDetailMeta.innerHTML = `<div class="detail-empty">Kein Training gefunden.</div>`;
    trainingDetailWarmup.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    trainingDetailExercises.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    trainingDetailSketch.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    trainingDetailNotes.innerHTML = `<div class="detail-empty">Keine Daten verfügbar.</div>`;
    return;
  }

  trainingDetailTitle.textContent = training.title;
  trainingDetailSubtitle.textContent = training.is_template
      ? "Detailansicht eines Mustertrainings"
      : "Detailansicht einer Trainingseinheit";

  const typeBadge = training.is_template
      ? `<span class="detail-pill detail-pill--template">Mustertraining</span>`
      : `<span class="detail-pill detail-pill--default">Trainingseinheit</span>`;

  trainingDetailMeta.innerHTML = [
    createDetailMetaItem("Name", training.title),
    createDetailMetaItem("Datum", training.dateLabel),
    createDetailMetaItem("Spieleranzahl", training.required_players || "—"),
    createDetailMetaItem("Altersgruppe", training.age_group || "—"),
    createDetailMetaItem("Dauer", training.duration ? `${training.duration} min` : "—"),
    createDetailMetaItem("Typ", typeBadge),
    createDetailMetaItem("Ersteller", training.created_by_username || "—")
  ].join("");

  const warmup = training.warmup;
  if (warmup && (warmup.name || warmup.duration || warmup.description || warmup.image_name || warmup.image_preview_url)) {
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
          </div>
          <div class="detail-split__media">
            <span class="detail-meta-item__label">Bild</span>
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
        ${training.exercises.map((exercise, index) => `
          <div class="detail-card">
            <h4 class="detail-card__title">Übung ${index + 1}${exercise.name ? ` – ${exercise.name}` : ""}</h4>
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
              </div>
              <div class="detail-split__media">
                <span class="detail-meta-item__label">Skizze / Bild</span>
                ${createExerciseImageMarkup(exercise)}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } else {
    trainingDetailExercises.innerHTML = `<div class="detail-empty">Keine Übungen hinterlegt.</div>`;
  }

  if (training.sketch_file_name) {
    trainingDetailSketch.innerHTML = `
      <div class="detail-sketch-stack">
        <div class="detail-file-box">
          Hinterlegte Datei: <strong>${training.sketch_file_name}</strong>
        </div>

        <a
          href="https://ft-graphics.fussballtraining.com/"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--outline-primary detail-sketch-link"
        >
          Zeichenprogramm
        </a>
      </div>
    `;
  } else {
    trainingDetailSketch.innerHTML = `
      <div class="detail-sketch-stack">
        <div class="detail-empty">Keine Skizze oder Datei hinterlegt.</div>

        <a
          href="https://ft-graphics.fussballtraining.com/"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--outline-primary detail-sketch-link"
        >
          Zeichenprogramm
        </a>
      </div>
    `;
  }

  trainingDetailNotes.innerHTML = training.notes
      ? `<p class="detail-text">${training.notes}</p>`
      : `<div class="detail-empty">Keine Notizen vorhanden.</div>`;
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

  const rows = visibleItems.map((training) => {
    return `
      <tr class="training-table__row--clickable" tabindex="0" data-training-id="${training.id}">
        <td>
          <button class="training-name training-name--button" type="button">
            ${training.title}
          </button>
        </td>
        <td>${training.dateLabel}</td>
        <td>${training.required_players || "—"}</td>
        <td>
          <span class="mt-indicator ${training.is_template ? "mt-indicator--active" : "mt-indicator--inactive"}">
            ${training.is_template ? "✓" : "–"}
          </span>
        </td>
        <td><span class="category-pill">${training.age_group}</span></td>
      </tr>
    `;
  }).join("");

  trainingsTableWrap.innerHTML = `
    <table class="training-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Datum</th>
          <th>Spieler</th>
          <th>MT</th>
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
    <button class="pagination__btn ${state.currentPage === 1 ? "is-disabled" : ""}" data-page="${state.currentPage - 1}">
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
    <button class="pagination__btn ${state.currentPage === totalPages ? "is-disabled" : ""}" data-page="${state.currentPage + 1}">
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

  const rows = visibleItems.map((entry) => {
    const typeBadgeClass = entry.type === "warmup" ? "detail-pill--warmup" : "detail-pill--exercise";

    return `
      <tr class="training-table__row--clickable" tabindex="0" data-exercise-training-id="${entry.trainingId}">
        <td>
          <button class="training-name training-name--button" type="button">
            ${entry.title}
          </button>
        </td>
        <td><span class="detail-pill ${typeBadgeClass}">${entry.typeLabel}</span></td>
        <td>${entry.trainingTitle}</td>
        <td>${entry.required_players || "—"}</td>
        <td><span class="category-pill">${entry.age_group}</span></td>
        <td>${entry.dateLabel}</td>
      </tr>
    `;
  }).join("");

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

  exercisesTableWrap.querySelectorAll("[data-exercise-training-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openTrainingDetail(row.dataset.exerciseTrainingId, "exercises");
    });

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTrainingDetail(row.dataset.exerciseTrainingId, "exercises");
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
    <button class="pagination__btn ${state.currentPage === 1 ? "is-disabled" : ""}" data-exercise-page="${state.currentPage - 1}">
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
    <button class="pagination__btn ${state.currentPage === totalPages ? "is-disabled" : ""}" data-exercise-page="${state.currentPage + 1}">
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

  container.innerHTML = entries.map((entry) => {
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
  }).join("");
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

  setUploadBoxExistingFile(
      warmupUploadBox,
      warmupUploadTitle,
      warmupUploadSubtitle,
      entry.image_name || "",
      "Bild hochladen",
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
    material: entry.material || "",
    sketch_file_name: entry.sketch_file_name || "",
    sketch_preview_url: entry.sketch_preview_url || ""
  });

  closeExerciseLibrary();
}

function updatePageHeader() {
  if (state.activeView === "library") {
    pageTitle.textContent = "Bibliothek";
    pageSubtitle.textContent = "Übersicht über alle Trainingseinheiten";
    return;
  }

  if (state.activeView === "my-trainings") {
    pageTitle.textContent = "Meine Trainings";
    pageSubtitle.textContent = "Übersicht über deine eigenen Trainingseinheiten";
    return;
  }

  if (state.activeView === "template-trainings") {
    pageTitle.textContent = "Mustertrainings";
    pageSubtitle.textContent = "Vorlagen und wiederverwendbare Trainings";
  }
}

function renderViews() {
  const isListing = ["library", "my-trainings", "template-trainings"].includes(state.activeView);

  listingView.classList.toggle("is-active", isListing);
  exercisesView.classList.toggle("is-active", state.activeView === "exercises");
  trainingDetailView.classList.toggle("is-active", state.activeView === "training-detail");
  trainingCreateView.classList.toggle("is-active", state.activeView === "training-create");
  profileView.classList.toggle("is-active", state.activeView === "profile");
  usernameEditView.classList.toggle("is-active", state.activeView === "username-edit");
  passwordEditView.classList.toggle("is-active", state.activeView === "password-edit");
}

function renderActiveNav() {
  navLinks.forEach((link) => {
    const targetView = link.dataset.view;
    const isProfileGroup = ["profile", "username-edit", "password-edit"].includes(state.activeView);
    const isDetailGroup = state.activeView === "training-detail" && targetView === state.detailSourceView;
    const isEditGroup = state.activeView === "training-create" && targetView === state.editReturnView;

    if (targetView === "profile") {
      link.classList.toggle("is-active", isProfileGroup);
      return;
    }

    link.classList.toggle("is-active", state.activeView === targetView || isDetailGroup || isEditGroup);
  });
}

function renderEditorState() {
  const isEditing = Boolean(state.editingTrainingId);

  trainingEditorTitle.textContent = isEditing ? "Training bearbeiten" : "Training erstellen";
  trainingEditorSubtitle.textContent = isEditing
      ? "Bearbeiten Sie die bestehende Trainingseinheit"
      : "Erstellen Sie eine neue Trainingseinheit";
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

function render() {
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

  if (state.activeView === "training-detail") {
    renderTrainingDetail();
  }

  if (state.activeView === "training-create") {
    renderWarmupLibrary();
    renderExerciseLibrary();
  }
}

function readFiltersFromInputs() {
  state.filters.age = filterAge.value;
  state.filters.date = filterDate.value;
  state.filters.players = filterPlayers.value;
  state.filters.topic = filterTopic.value.trim();
}

function resetFilters() {
  state.filters = {
    age: "",
    date: "",
    players: "",
    topic: ""
  };

  filterAge.value = "";
  filterDate.value = "";
  filterPlayers.value = "";
  filterTopic.value = "";
}

function readExerciseFiltersFromInputs() {
  state.exerciseFilters.type = exerciseFilterType.value;
  state.exerciseFilters.players = exerciseFilterPlayers.value;
  state.exerciseFilters.topic = exerciseFilterTopic.value.trim();
}

function resetExerciseFilters() {
  state.exerciseFilters = {
    type: "",
    players: "",
    topic: ""
  };

  exerciseFilterType.value = "";
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

function setUploadBoxExistingFile(
    box,
    titleEl,
    subtitleEl,
    fileName,
    defaultTitle,
    defaultSubtitle,
    previewUrl = ""
) {
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
  box.addEventListener("click", () => {
    input.click();
  });

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) {
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
      return;
    }

    box.classList.add("has-file");
    box.dataset.existingFileName = file.name;
    box.dataset.existingPreviewUrl = "";
    titleEl.textContent = file.name;
    subtitleEl.textContent = `Datei ausgewählt • ${(file.size / 1024 / 1024).toFixed(2)} MB`;
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
      "Skizze oder Bild hochladen",
      "PNG, JPG oder PDF bis 5MB"
  );
}

function createExerciseBlock(exerciseData = null) {
  const wrapper = document.createElement("section");
  wrapper.className = "editor-card exercise-card";

  wrapper.innerHTML = `
    <div class="exercise-card__header">
      <h3 class="editor-card__title exercise-card__title">Übung</h3>
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

    <label class="field">
      <span class="field__label">Material</span>
      <input class="field__control" type="text" name="exercise_material" placeholder="z.B. 4 Hütchen, 1 Ball pro Gruppe" />
    </label>

    <div class="field">
      <span class="field__label">Skizze / Bild zur Übung hochladen</span>
      <input class="visually-hidden exercise-sketch-input" type="file" accept=".png,.jpg,.jpeg,.pdf" />
      <button class="upload-box exercise-upload-box" type="button">
        <span class="upload-box__icon">⇪</span>
        <span class="upload-box__title exercise-upload-title">Skizze oder Bild hochladen</span>
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
    wrapper.querySelector('[name="exercise_material"]').value = exerciseData.material || "";

    const box = wrapper.querySelector(".exercise-upload-box");
    const titleEl = wrapper.querySelector(".exercise-upload-title");
    const subtitleEl = wrapper.querySelector(".exercise-upload-subtitle");

    setUploadBoxExistingFile(
        box,
        titleEl,
        subtitleEl,
        exerciseData.sketch_file_name || "",
        "Skizze oder Bild hochladen",
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

    if (title) {
      title.textContent = `Übung ${index + 1}`;
    }

    if (removeBtn) {
      removeBtn.classList.toggle("is-hidden", blocks.length === 1);
    }
  });
}

function resetTrainingCreateForm() {
  trainingCreateForm.reset();
  state.editingTrainingId = null;
  state.editReturnView = "library";
  populateTrainingAgeGroupSelect();
  resetLibraryPickers();

  exerciseBlocks.innerHTML = "";
  createExerciseBlock();

  warmupImageInput.value = "";
  sketchInput.value = "";

  resetUploadBox(
      warmupUploadBox,
      warmupUploadTitle,
      warmupUploadSubtitle,
      "Bild hochladen",
      "PNG oder JPG bis 5MB"
  );

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
  trainingCreateForm.elements.is_template.checked = Boolean(training.is_template);
  trainingCreateForm.elements.notes.value = training.notes || "";

  trainingCreateForm.elements.warmup_name.value = training.warmup?.name || "";
  trainingCreateForm.elements.warmup_duration.value = training.warmup?.duration || "";
  trainingCreateForm.elements.warmup_description.value = training.warmup?.description || "";

  setUploadBoxExistingFile(
      warmupUploadBox,
      warmupUploadTitle,
      warmupUploadSubtitle,
      training.warmup?.image_name || "",
      "Bild hochladen",
      "PNG oder JPG bis 5MB",
      training.warmup?.image_preview_url || ""
  );

  setUploadBoxExistingFile(
      sketchUploadBox,
      sketchUploadTitle,
      sketchUploadSubtitle,
      training.sketch_file_name || "",
      "Datei hier ablegen oder klicken zum Hochladen",
      "PNG, JPG oder PDF bis 5MB"
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
        exercise.material ||
        exercise.sketch_file_name ||
        exercise.sketch_preview_url
    );
  });
}

async function loadAll() {
  try {
    const [trainingEntries, userEntries] = await Promise.all([
      fetchTrainingEntries(),
      fetchUsers()
    ]);

    state.trainings = trainingEntries.map(normalizeTraining);
    state.users = userEntries.map(normalizeUser);
    state.exerciseEntries = buildExerciseEntries();

    populateAgeFilter();
    populatePlayersFilter();
    populateExercisePlayersFilter();
    populateTrainingAgeGroupSelect();

    if (state.currentUser) {
      state.currentUser = state.users.find((user) => user.id === state.currentUser.id) || null;
    }

    syncCurrentUserFromStorage();
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
    if (
        user.username === username &&
        user.club === club &&
        normalizeRole(user.role) === targetRole
    ) {
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

    await createUser(null, {
      username,
      club,
      role: "trainer",
      password
    });

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

    if (!newUsername) {
      alert("Der Benutzername darf nicht leer sein.");
      return;
    }

    const result = await updateUserProfile(state.currentUser.id, {
      username: newUsername
    });

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

    if (state.currentUser.password && state.currentUser.password !== currentPassword) {
      alert("Das aktuelle Passwort ist nicht korrekt.");
      return;
    }

    const result = await updateUserProfile(state.currentUser.id, {
      username: state.currentUser.username,
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
      username: state.currentUser.username,
      role: selectedRole
    });

    if (!result) return;

    await loadAll();
    state.activeView = "profile";
    render();
    alert(`Rolle wurde auf ${getRoleLabel(selectedRole)} gesetzt.`);
  });

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

    await createUser(null, {
      username,
      club,
      role,
      password
    });

    adminCreateUserForm.reset();
    adminCreateUserForm.querySelector('[name="club"]').value = "TSV Ottensheim";
    adminCreateUserForm.querySelector('[name="role"]').value = "spieler";
    await loadAll();
    state.activeView = "profile";
    render();
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      state.activeView = link.dataset.view;
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
    populateExercisePlayersFilter();
    state.currentPage = 1;
    render();
  });

  createTrainingBtn.addEventListener("click", () => {
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
    const isTemplate = formData.get("is_template") === "on";
    const warmupFile = warmupImageInput.files?.[0] || null;
    const sketchFile = sketchInput.files?.[0] || null;

    const existingTraining = editingId
        ? state.trainings.find((training) => training.id === editingId) || null
        : null;

    const collectedExercises = await collectExercisesFromForm();

    let warmupPreviewUrl = warmupUploadBox.dataset.existingPreviewUrl || "";

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
        image_name: warmupFile
            ? warmupFile.name
            : (warmupUploadBox.dataset.existingFileName || ""),
        image_preview_url: warmupPreviewUrl
      },
      exercises: collectedExercises,
      sketch_file_name: sketchFile
          ? sketchFile.name
          : (sketchUploadBox.dataset.existingFileName || ""),
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
      state.detailSourceView = editingId ? (state.editReturnView || "my-trainings") : "my-trainings";
    }

    resetTrainingCreateForm();
    await loadAll();
  });

  logoutBtn.addEventListener("click", () => {
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
      "Bild hochladen",
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

bindEvents();
setAuthTab("login");
loadAll();