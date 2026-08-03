import { writable, derived, readable, get } from "svelte/store";
import Swal from "sweetalert2";
import { errorHandle } from "$lib/utils/errorHandle";
import { checkAuth } from "$lib/utils/auth";
import {
  companiesAllStore,
  usersAllStore,
  getFromLocalStorage,
  saveToLocalStorage,
} from "$lib/stores/dataStores";
import {
  activityFilterStore,
  authActivityFilterStore,
} from "$lib/stores/filterStore";
import {
  fetchOrderActivities as fetchOrderActivitiesApi,
  fetchAuthActivities as fetchAuthActivitiesApi,
  fetchUsers as fetchUsersApi,
  fetchCompanies as fetchCompaniesApi,
} from "../api/historyApi.js";
import { buildDateParams } from "../lib/dates.js";
import { formatWhen, parseMeta, eventLabel } from "../lib/format.js";
import {
  getAuthFlags,
  getOrderFlags,
  flagLevelRank,
  flagFilterLabel,
  buildAuthInsights,
  buildOrderInsights,
  decisionTips,
} from "../lib/flags.js";
import { buildOrderColumns, buildAuthColumns } from "../lib/columns.js";
import { exportOrderActivitiesCsv, exportAuthActivitiesCsv } from "../lib/export.js";
import { writeHistoryUrlParams, copyText } from "../lib/url.js";
import { showToast } from "$lib/stores/uiToast";

/**
 * Store-based composable for the History page (Svelte 3 — no runes).
 */
export function createHistoryPage() {
  // ── Core / UI ──────────────────────────────────────────────────────────
  const loadingData = writable(true);
  const currentUser = writable(null);
  const activeTab = writable("order");
  const refresh = writable(false);
  const loading = writable(false);
  const errorMessage = writable("");
  const firstLoad = writable(false);
  const authFirstLoad = writable(false);

  // ── Order filters / data ───────────────────────────────────────────────
  const activities = writable([]);
  const companies = writable([]);
  const users = writable([]);
  const userId = writable(null);
  const searchTerm = writable("");
  const currentPage = writable(1);
  const rowsPerPage = writable(10);
  const totalItems = writable(0);
  const selectedFilter = writable("last7days");
  const customStartDate = writable(null);
  const customEndDate = writable(null);
  const searchString = writable("");
  const chatTypeFilter = writable("");
  /** @type {import('svelte/store').Writable<'DESC' | 'ASC'>} */
  const sortOrder = writable("DESC");
  const orderFlagFilter = writable("");

  // ── Auth filters / data ────────────────────────────────────────────────
  const authActivities = writable([]);
  const authCurrentPage = writable(1);
  const authRowsPerPage = writable(10);
  const authTotalItems = writable(0);
  const authSelectedFilter = writable("last7days");
  const authCustomStartDate = writable(null);
  const authCustomEndDate = writable(null);
  const authSearchString = writable("");
  const authEventFilter = writable("");
  const authUserEmail = writable("");
  const authIpFilter = writable("");
  /** @type {import('svelte/store').Writable<'DESC' | 'ASC'>} */
  const authSortOrder = writable("DESC");
  const authFlagFilter = writable("");

  // ── Detail drawer ──────────────────────────────────────────────────────
  const detailRow = writable(null);
  const detailKind = writable("order"); // 'order' | 'auth'

  let debounceRefreshTimeout;
  let debounceTimeout;
  let authDebounceTimeout;
  /** @type {Array<() => void>} */
  const unsubscribers = [];

  // ── Derived helpers ────────────────────────────────────────────────────

  const orderStats = derived([activities, totalItems], ([$activities, $totalItems]) => {
    const chats = $activities.filter((a) => a.title === "Order Chat Added").length;
    const files = $activities.filter((a) => a.title === "Order Attachment Added").length;
    const reminders = $activities.filter((a) => a.title === "Order Reminder Added").length;
    const status = $activities.filter((a) => /status/i.test(a.title || "")).length;
    const actors = new Set($activities.map((a) => a?.user?.id).filter(Boolean)).size;
    return { chats, files, reminders, status, actors, total: $totalItems };
  });

  const authStats = derived([authActivities, authTotalItems], ([$authActivities, $authTotalItems]) => {
    const login = $authActivities.filter((a) => a.event === "login").length;
    const failed = $authActivities.filter((a) => a.event === "failed_login").length;
    const blocked = $authActivities.filter((a) =>
      ["location_blocked", "time_blocked", "account_blocked"].includes(a.event),
    ).length;
    const logout = $authActivities.filter((a) => a.event === "logout").length;
    return { login, failed, blocked, logout, total: $authTotalItems };
  });

  const orderInsights = derived(activities, ($activities) => buildOrderInsights($activities));
  const authInsights = derived(authActivities, ($authActivities) => buildAuthInsights($authActivities));

  const filteredActivities = derived(
    [activities, orderFlagFilter],
    ([$activities, $orderFlagFilter]) =>
      $orderFlagFilter
        ? $activities.filter((r) => getOrderFlags(r).some((f) => f.id === $orderFlagFilter))
        : $activities,
  );

  const filteredAuthActivities = derived(
    [authActivities, authFlagFilter],
    ([$authActivities, $authFlagFilter]) =>
      $authFlagFilter
        ? $authActivities.filter((r) =>
            getAuthFlags(r, $authActivities).some((f) => f.id === $authFlagFilter),
          )
        : $authActivities,
  );

  const orderCriticalCount = derived(orderInsights, ($orderInsights) =>
    $orderInsights.filter((i) => i.level === "critical").reduce((n, i) => n + i.count, 0),
  );
  const authCriticalCount = derived(authInsights, ($authInsights) =>
    $authInsights.filter((i) => i.level === "critical").reduce((n, i) => n + i.count, 0),
  );
  const orderAttention = derived(orderInsights, ($orderInsights) =>
    $orderInsights.filter((i) => i.level === "critical" || i.level === "warn"),
  );
  const authAttention = derived(authInsights, ($authInsights) =>
    $authInsights.filter((i) => i.level === "critical" || i.level === "warn"),
  );

  const detailFlags = derived(
    [detailRow, detailKind, authActivities],
    ([$detailRow, $detailKind, $authActivities]) => {
      if ($detailRow == null) return [];
      return $detailKind === "auth"
        ? getAuthFlags($detailRow, $authActivities)
        : getOrderFlags($detailRow);
    },
  );

  const detailTips = derived(
    [detailRow, detailKind, authActivities],
    ([$detailRow, $detailKind, $authActivities]) =>
      $detailRow ? decisionTips($detailKind, $detailRow, $authActivities) : [],
  );

  const detailSeverity = derived(detailFlags, ($detailFlags) =>
    $detailFlags.reduce(
      (max, f) => (flagLevelRank(f.level) > flagLevelRank(max) ? f.level : max),
      "ok",
    ),
  );

  const detailMeta = derived([detailRow, detailKind], ([$detailRow, $detailKind]) =>
    $detailRow && $detailKind === "auth" ? parseMeta($detailRow.metadata) : null,
  );

  const detailWhen = derived(detailRow, ($detailRow) =>
    $detailRow?.createdAt != null
      ? formatWhen($detailRow.createdAt)
      : { absolute: "-", relative: "" },
  );

  const detailMapsUrl = derived(detailRow, ($detailRow) =>
    $detailRow?.latitude && $detailRow?.longitude
      ? `https://www.google.com/maps?q=${$detailRow.latitude},${$detailRow.longitude}`
      : null,
  );

  // ── Actions ────────────────────────────────────────────────────────────

  function openDetail(idOrRow, kind) {
    let row = idOrRow;
    if (idOrRow != null && typeof idOrRow !== "object") {
      const list = kind === "auth" ? get(authActivities) : get(activities);
      const idNum = Number(idOrRow);
      row = list.find((r) => r.id === idOrRow || r.id === idNum) || null;
    }
    if (!row) return;
    detailKind.set(kind);
    detailRow.set(row);
  }

  function closeDetail() {
    detailRow.set(null);
  }

  // openDetail is stable for the page lifetime; auth columns rebuild when rows change (repeat flags).
  const orderTable = readable(buildOrderColumns({ openDetail }));
  const authTable = derived(authActivities, ($authActivities) =>
    buildAuthColumns({ openDetail, authActivities: $authActivities }),
  );

  function switchTab(tab) {
    if (get(activeTab) === tab) return;
    activeTab.set(tab);
    detailRow.set(null);
    orderFlagFilter.set("");
    authFlagFilter.set("");
  }

  const updateFilterStore = (newValues) => {
    activityFilterStore.update((s) => ({ ...s, ...newValues }));
  };

  const updateAuthFilterStore = (newValues) => {
    authActivityFilterStore.update((s) => ({ ...s, ...newValues }));
  };

  async function getAllCompanies() {
    if (!get(refresh)) {
      const cached = get(companiesAllStore);
      if (cached?.length > 0) {
        companies.set(cached);
        loadingData.set(false);
        return;
      }
    }
    loadingData.set(true);
    try {
      const data = await fetchCompaniesApi();
      companies.set(data);
      companiesAllStore.set(data);
    } catch {
      errorMessage.set("Failed to load company data.");
    } finally {
      setTimeout(() => {
        loadingData.set(false);
      }, 300);
    }
  }

  async function getAllUsers() {
    if (!get(refresh)) {
      const cached = get(usersAllStore);
      if (cached?.length > 0) {
        users.set(cached);
        loadingData.set(false);
        return;
      }
    }
    loadingData.set(true);
    try {
      const data = await fetchUsersApi();
      users.set(data);
      usersAllStore.set(data);
    } catch {
      errorMessage.set("Failed to load user data.");
    } finally {
      setTimeout(() => {
        loadingData.set(false);
      }, 300);
    }
  }

  async function fetchActivities() {
    loadingData.set(true);
    try {
      const query = new URLSearchParams({
        page: get(currentPage).toString(),
        limit: get(rowsPerPage).toString(),
        search: get(searchTerm) || "",
      });
      const label = buildDateParams(
        get(selectedFilter),
        get(customStartDate),
        get(customEndDate),
        query,
      );
      searchString.set(label);
      const uid = get(userId);
      if (uid) query.append("byUserId", uid);
      const chatType = get(chatTypeFilter);
      if (chatType) query.append("chatType", chatType);
      query.append("sortOrder", get(sortOrder));

      updateFilterStore({
        userId: uid,
        searchTerm: get(searchTerm),
        currentPage: get(currentPage),
        rowsPerPage: get(rowsPerPage),
        selectedFilter: get(selectedFilter),
        customStartDate: get(customStartDate),
        customEndDate: get(customEndDate),
        sortOrder: get(sortOrder),
      });

      if (!get(refresh)) {
        const cachedData = getFromLocalStorage("activities_" + query.toString());
        if (cachedData) {
          activities.set(cachedData.activities);
          totalItems.set(cachedData.totalItems);
          return;
        }
      }

      const data = await fetchOrderActivitiesApi(query);
      activities.set(data.data);
      totalItems.set(data.total);
      saveToLocalStorage("activities_" + query.toString(), {
        activities: data.data,
        totalItems: data.total,
      });
    } catch (error) {
      errorHandle(error);
    } finally {
      loading.set(false);
      setTimeout(() => {
        loadingData.set(false);
      }, 300);
    }
  }

  async function fetchAuthActivities() {
    loadingData.set(true);
    try {
      const query = new URLSearchParams({
        page: get(authCurrentPage).toString(),
        limit: get(authRowsPerPage).toString(),
      });
      const label = buildDateParams(
        get(authSelectedFilter),
        get(authCustomStartDate),
        get(authCustomEndDate),
        query,
      );
      authSearchString.set(label);
      const eventFilter = get(authEventFilter);
      if (eventFilter) query.append("event", eventFilter);
      const email = get(authUserEmail);
      if (email) query.append("userEmail", email);
      const ip = get(authIpFilter);
      if (ip) query.append("ipAddress", ip);
      query.append("sortOrder", get(authSortOrder));

      updateAuthFilterStore({
        currentPage: get(authCurrentPage),
        rowsPerPage: get(authRowsPerPage),
        selectedFilter: get(authSelectedFilter),
        customStartDate: get(authCustomStartDate),
        customEndDate: get(authCustomEndDate),
        eventFilter,
        userEmail: email,
        ipFilter: ip,
        sortOrder: get(authSortOrder),
      });

      const data = await fetchAuthActivitiesApi(query);
      authActivities.set(data.data);
      authTotalItems.set(data.total);
    } catch (error) {
      errorHandle(error);
    } finally {
      setTimeout(() => {
        loadingData.set(false);
      }, 300);
    }
  }

  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh.set(true);
      try {
        if (get(activeTab) === "order") {
          await Promise.all([getAllCompanies(), getAllUsers(), fetchActivities()]);
        } else {
          await fetchAuthActivities();
        }
      } finally {
        refresh.set(false);
      }
    }, 200);
  }

  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchTerm.set(value);
      currentPage.set(1);
    }, 300);
  }

  function handleAuthEmailChange(value) {
    clearTimeout(authDebounceTimeout);
    authDebounceTimeout = setTimeout(() => {
      authUserEmail.set(value);
      authCurrentPage.set(1);
    }, 300);
  }

  function setAuthEvent(value) {
    authEventFilter.set(value);
    authCurrentPage.set(1);
  }

  function setOrderDatePreset(value) {
    selectedFilter.set(value);
    currentPage.set(1);
  }

  function setAuthDatePreset(value) {
    authSelectedFilter.set(value);
    authCurrentPage.set(1);
  }

  function setSortOrder(value) {
    if (get(sortOrder) === value) return;
    sortOrder.set(value);
    currentPage.set(1);
  }

  function setAuthSortOrder(value) {
    if (get(authSortOrder) === value) return;
    authSortOrder.set(value);
    authCurrentPage.set(1);
  }

  function applyAuthInsight(insight) {
    if (insight.event) {
      authEventFilter.set(get(authEventFilter) === insight.event ? "" : insight.event);
      authFlagFilter.set("");
      authCurrentPage.set(1);
    } else if (insight.flag) {
      authFlagFilter.set(get(authFlagFilter) === insight.flag ? "" : insight.flag);
    }
  }

  function applyOrderInsight(insight) {
    orderFlagFilter.set(get(orderFlagFilter) === insight.flag ? "" : insight.flag);
  }

  function filterAuthByEmail(email) {
    if (!email) return;
    authUserEmail.set(email);
    authEventFilter.set("");
    authFlagFilter.set("");
    authCurrentPage.set(1);
    activeTab.set("auth");
    closeDetail();
  }

  function filterAuthByIp(ip) {
    if (!ip) return;
    authIpFilter.set(ip);
    authEventFilter.set("");
    authFlagFilter.set("");
    authCurrentPage.set(1);
    activeTab.set("auth");
    closeDetail();
  }

  function openAuthTrailForUser(user) {
    const email = user?.email;
    if (!email) return;
    filterAuthByEmail(email);
  }

  function clearChatTypeFilter() {
    chatTypeFilter.set("");
    fetchActivities();
  }

  function filterSameUserFromDetail() {
    const row = get(detailRow);
    if (!row?.user?.id) return;
    userId.set(row.user.id);
    activeTab.set("order");
    currentPage.set(1);
    closeDetail();
  }

  function filterSameEventFromDetail() {
    const row = get(detailRow);
    if (!row?.event) return;
    authEventFilter.set(row.event);
    authCurrentPage.set(1);
    closeDetail();
  }

  function clearOrderFilters() {
    searchTerm.set("");
    userId.set(null);
    chatTypeFilter.set("");
    orderFlagFilter.set("");
    selectedFilter.set("last7days");
    customStartDate.set(null);
    customEndDate.set(null);
    sortOrder.set("DESC");
    currentPage.set(1);
  }

  function clearAuthFilters() {
    authEventFilter.set("");
    authUserEmail.set("");
    authIpFilter.set("");
    authFlagFilter.set("");
    authSelectedFilter.set("last7days");
    authCustomStartDate.set(null);
    authCustomEndDate.set(null);
    authSortOrder.set("DESC");
    authCurrentPage.set(1);
  }

  function clearActiveFilters() {
    if (get(activeTab) === "auth") clearAuthFilters();
    else clearOrderFilters();
  }

  function exportCurrentCsv() {
    try {
      let n = 0;
      if (get(activeTab) === "auth") {
        n = exportAuthActivitiesCsv(get(filteredAuthActivities));
      } else {
        n = exportOrderActivitiesCsv(get(filteredActivities));
      }
      if (n === 0) {
        showToast({ type: "info", message: "Nothing to export on this view.", duration: 2500 });
      } else {
        showToast({
          type: "success",
          message: `Exported ${n} row${n === 1 ? "" : "s"} to CSV.`,
          duration: 2500,
        });
      }
    } catch {
      showToast({ type: "error", message: "Export failed.", duration: 2800 });
    }
  }

  async function copyField(value, label = "Value") {
    const ok = await copyText(value);
    if (ok) {
      showToast({ type: "success", message: `${label} copied.`, duration: 2000 });
    } else {
      showToast({ type: "error", message: "Could not copy.", duration: 2200 });
    }
  }

  function copyInvestigationLink() {
    syncUrlToBrowser();
    const url = window.location.href;
    copyField(url, "Investigation link");
  }

  function syncUrlToBrowser() {
    writeHistoryUrlParams({
      tab: get(activeTab),
      filter: get(selectedFilter) !== "last7days" ? get(selectedFilter) : null,
      start: get(selectedFilter) === "custom" ? get(customStartDate) : null,
      end: get(selectedFilter) === "custom" ? get(customEndDate) : null,
      byUserId: get(userId),
      chatType: get(chatTypeFilter),
      q: get(searchTerm),
      sort: get(sortOrder) !== "DESC" ? get(sortOrder) : null,
      event: get(authEventFilter),
      email: get(authUserEmail),
      ip: get(authIpFilter),
      authFilter: get(authSelectedFilter) !== "last7days" ? get(authSelectedFilter) : null,
      authStart: get(authSelectedFilter) === "custom" ? get(authCustomStartDate) : null,
      authEnd: get(authSelectedFilter) === "custom" ? get(authCustomEndDate) : null,
      authSort: get(authSortOrder) !== "DESC" ? get(authSortOrder) : null,
    });
  }

  function setupUrlSync() {
    const urlDeps = [
      activeTab,
      selectedFilter,
      customStartDate,
      customEndDate,
      userId,
      chatTypeFilter,
      searchTerm,
      sortOrder,
      authEventFilter,
      authUserEmail,
      authIpFilter,
      authSelectedFilter,
      authCustomStartDate,
      authCustomEndDate,
      authSortOrder,
      firstLoad,
    ];
    const urlKey = derived(urlDeps, (vals) => vals.join("|"));
    unsubscribers.push(
      urlKey.subscribe(() => {
        if (!get(firstLoad)) return;
        syncUrlToBrowser();
      }),
    );
  }

  const resultSummary = derived(
    [
      activeTab,
      filteredActivities,
      filteredAuthActivities,
      totalItems,
      authTotalItems,
      orderFlagFilter,
      authFlagFilter,
      sortOrder,
      authSortOrder,
    ],
    ([
      $tab,
      $filteredActivities,
      $filteredAuthActivities,
      $totalItems,
      $authTotalItems,
      $orderFlagFilter,
      $authFlagFilter,
      $sortOrder,
      $authSortOrder,
    ]) => {
      if ($tab === "auth") {
        const shown = $filteredAuthActivities.length;
        const total = $authFlagFilter ? shown : $authTotalItems;
        return `${shown} shown${$authFlagFilter ? " (flagged)" : ""} · ${total} total · ${
          $authSortOrder === "ASC" ? "Oldest" : "Newest"
        }`;
      }
      const shown = $filteredActivities.length;
      const total = $orderFlagFilter ? shown : $totalItems;
      return `${shown} shown${$orderFlagFilter ? " (flagged)" : ""} · ${total} total · ${
        $sortOrder === "ASC" ? "Oldest" : "Newest"
      }`;
    },
  );

  const hasActiveFilters = derived(
    [
      activeTab,
      searchTerm,
      userId,
      chatTypeFilter,
      orderFlagFilter,
      selectedFilter,
      authEventFilter,
      authUserEmail,
      authIpFilter,
      authFlagFilter,
      authSelectedFilter,
    ],
    ([
      $tab,
      $searchTerm,
      $userId,
      $chatTypeFilter,
      $orderFlagFilter,
      $selectedFilter,
      $authEventFilter,
      $authUserEmail,
      $authIpFilter,
      $authFlagFilter,
      $authSelectedFilter,
    ]) => {
      if ($tab === "auth") {
        return Boolean(
          $authEventFilter ||
            $authUserEmail ||
            $authIpFilter ||
            $authFlagFilter ||
            $authSelectedFilter !== "last7days",
        );
      }
      return Boolean(
        $searchTerm ||
          $userId ||
          $chatTypeFilter ||
          $orderFlagFilter ||
          $selectedFilter !== "last7days",
      );
    },
  );

  let orderFetchScheduled = false;
  let authFetchScheduled = false;

  function checkFetchRecord() {
    if (!get(firstLoad)) return;
    if (get(selectedFilter) === "custom" && (!get(customStartDate) || !get(customEndDate))) return;
    // Batch multiple store writes in the same tick (mirrors Svelte $: reactivity).
    if (orderFetchScheduled) return;
    orderFetchScheduled = true;
    queueMicrotask(() => {
      orderFetchScheduled = false;
      if (!get(firstLoad)) return;
      if (get(selectedFilter) === "custom" && (!get(customStartDate) || !get(customEndDate))) return;
      fetchActivities();
    });
  }

  function checkAuthFetchRecord() {
    if (!get(authFirstLoad)) return;
    if (
      get(authSelectedFilter) === "custom" &&
      (!get(authCustomStartDate) || !get(authCustomEndDate))
    )
      return;
    if (authFetchScheduled) return;
    authFetchScheduled = true;
    queueMicrotask(() => {
      authFetchScheduled = false;
      if (!get(authFirstLoad)) return;
      if (
        get(authSelectedFilter) === "custom" &&
        (!get(authCustomStartDate) || !get(authCustomEndDate))
      )
        return;
      fetchAuthActivities();
    });
  }

  function setupReactiveFetches() {
    const orderDeps = [
      searchTerm,
      selectedFilter,
      customStartDate,
      customEndDate,
      currentPage,
      rowsPerPage,
      userId,
      chatTypeFilter,
      sortOrder,
      firstLoad,
    ];
    const orderKey = derived(orderDeps, (vals) => vals.join("|"));
    unsubscribers.push(orderKey.subscribe(() => checkFetchRecord()));

    const authDeps = [
      authEventFilter,
      authUserEmail,
      authIpFilter,
      authSelectedFilter,
      authCustomStartDate,
      authCustomEndDate,
      authCurrentPage,
      authRowsPerPage,
      authSortOrder,
      authFirstLoad,
    ];
    const authKey = derived(authDeps, (vals) => vals.join("|"));
    unsubscribers.push(authKey.subscribe(() => checkAuthFetchRecord()));
  }

  /**
   * Initialize page: auth gate, restore filters, URL params, initial fetches.
   * Returns a cleanup function for onMount.
   */
  async function mount() {
    const user = checkAuth();
    currentUser.set(user);
    if (user?.role === "user") {
      loadingData.set(false);
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You are not authorized to view this page.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return () => {};
    }

    const filterState = get(activityFilterStore);
    userId.set(filterState.userId || null);
    searchTerm.set(filterState.searchTerm || "");
    currentPage.set(filterState.currentPage || 1);
    rowsPerPage.set(filterState.rowsPerPage || 10);
    selectedFilter.set(filterState.selectedFilter || "last7days");
    customStartDate.set(filterState.customStartDate || null);
    customEndDate.set(filterState.customEndDate || null);
    sortOrder.set(filterState.sortOrder === "ASC" ? "ASC" : "DESC");

    const authState = get(authActivityFilterStore);
    authCurrentPage.set(authState.currentPage || 1);
    authRowsPerPage.set(authState.rowsPerPage || 10);
    authSelectedFilter.set(authState.selectedFilter || "last7days");
    authCustomStartDate.set(authState.customStartDate || null);
    authCustomEndDate.set(authState.customEndDate || null);
    authEventFilter.set(authState.eventFilter || "");
    authUserEmail.set(authState.userEmail || "");
    authIpFilter.set(authState.ipFilter || "");
    authSortOrder.set(authState.sortOrder === "ASC" ? "ASC" : "DESC");

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("chatType")) chatTypeFilter.set(urlParams.get("chatType"));
    if (urlParams.get("byUserId")) userId.set(Number(urlParams.get("byUserId")));
    if (urlParams.get("filter")) selectedFilter.set(urlParams.get("filter"));
    if (urlParams.get("start")) customStartDate.set(urlParams.get("start"));
    if (urlParams.get("end")) customEndDate.set(urlParams.get("end"));
    if (urlParams.get("tab")) activeTab.set(urlParams.get("tab"));
    if (urlParams.get("q")) searchTerm.set(urlParams.get("q"));
    if (urlParams.get("sort") === "ASC" || urlParams.get("sort") === "DESC") {
      sortOrder.set(urlParams.get("sort"));
    }
    if (urlParams.get("event")) authEventFilter.set(urlParams.get("event"));
    if (urlParams.get("email")) authUserEmail.set(urlParams.get("email"));
    if (urlParams.get("ip")) authIpFilter.set(urlParams.get("ip"));
    if (urlParams.get("authFilter")) authSelectedFilter.set(urlParams.get("authFilter"));
    if (urlParams.get("authStart")) authCustomStartDate.set(urlParams.get("authStart"));
    if (urlParams.get("authEnd")) authCustomEndDate.set(urlParams.get("authEnd"));
    if (urlParams.get("authSort") === "ASC" || urlParams.get("authSort") === "DESC") {
      authSortOrder.set(urlParams.get("authSort"));
    }

    setupReactiveFetches();
    setupUrlSync();

    fetchActivities();
    getAllUsers();
    getAllCompanies();

    if (user?.role === "master" || user?.role === "admin") {
      fetchAuthActivities();
    }

    const firstLoadTimer = setTimeout(() => {
      firstLoad.set(true);
      authFirstLoad.set(true);
    }, 500);

    const onHistoryKeydown = (e) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onHistoryKeydown);

    return () => {
      clearTimeout(firstLoadTimer);
      window.removeEventListener("keydown", onHistoryKeydown);
      if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (authDebounceTimeout) clearTimeout(authDebounceTimeout);
      unsubscribers.forEach((u) => u());
      unsubscribers.length = 0;
    };
  }

  return {
    // stores
    loadingData,
    currentUser,
    activeTab,
    refresh,
    loading,
    errorMessage,
    firstLoad,
    authFirstLoad,
    activities,
    companies,
    users,
    userId,
    searchTerm,
    currentPage,
    rowsPerPage,
    totalItems,
    selectedFilter,
    customStartDate,
    customEndDate,
    searchString,
    chatTypeFilter,
    sortOrder,
    orderFlagFilter,
    authActivities,
    authCurrentPage,
    authRowsPerPage,
    authTotalItems,
    authSelectedFilter,
    authCustomStartDate,
    authCustomEndDate,
    authSearchString,
    authEventFilter,
    authUserEmail,
    authIpFilter,
    authSortOrder,
    authFlagFilter,
    detailRow,
    detailKind,
    // derived
    orderStats,
    authStats,
    orderInsights,
    authInsights,
    filteredActivities,
    filteredAuthActivities,
    orderCriticalCount,
    authCriticalCount,
    orderAttention,
    authAttention,
    detailFlags,
    detailTips,
    detailSeverity,
    detailMeta,
    detailWhen,
    detailMapsUrl,
    orderTable,
    authTable,
    resultSummary,
    hasActiveFilters,
    // actions
    mount,
    refreshPage,
    switchTab,
    openDetail,
    closeDetail,
    fetchActivities,
    fetchAuthActivities,
    getAllUsers,
    getAllCompanies,
    handleSearchChange,
    handleAuthEmailChange,
    setAuthEvent,
    setOrderDatePreset,
    setAuthDatePreset,
    setSortOrder,
    setAuthSortOrder,
    applyAuthInsight,
    applyOrderInsight,
    filterAuthByEmail,
    filterAuthByIp,
    openAuthTrailForUser,
    clearChatTypeFilter,
    clearOrderFilters,
    clearAuthFilters,
    clearActiveFilters,
    exportCurrentCsv,
    copyField,
    copyInvestigationLink,
    filterSameUserFromDetail,
    filterSameEventFromDetail,
    flagFilterLabel,
    eventLabel,
  };
}
