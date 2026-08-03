<script>
  import { onMount } from "svelte";
  import Loader from "$lib/components/Loader.svelte";
  import { createHistoryPage } from "./hooks/index.js";
  import HistoryHeader from "./components/HistoryHeader.svelte";
  import HistoryTabs from "./components/HistoryTabs.svelte";
  import OrderHistoryPanel from "./components/OrderHistoryPanel.svelte";
  import AuthHistoryPanel from "./components/AuthHistoryPanel.svelte";
  import HistoryDetailDrawer from "./components/HistoryDetailDrawer.svelte";
  import "./styles/history.css";

  // Svelte 3 composable hook (store-based — project is on Svelte 3, not runes)
  const page = createHistoryPage();

  const {
    loadingData,
    currentUser,
    activeTab,
    refresh,
    activities,
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
    resultSummary,
    hasActiveFilters,
    detailFlags,
    detailTips,
    detailSeverity,
    detailMeta,
    detailWhen,
    detailMapsUrl,
    orderTable,
    authTable,
    mount,
    refreshPage,
    switchTab,
    closeDetail,
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
    clearActiveFilters,
    exportCurrentCsv,
    copyField,
    copyInvestigationLink,
    filterSameUserFromDetail,
    filterSameEventFromDetail,
    flagFilterLabel,
  } = page;

  onMount(() => {
    let destroy = () => {};
    let cancelled = false;
    mount().then((fn) => {
      if (cancelled) {
        if (typeof fn === "function") fn();
        return;
      }
      if (typeof fn === "function") destroy = fn;
    });
    return () => {
      cancelled = true;
      destroy();
    };
  });
</script>

{#if $loadingData && !($activeTab === "order" ? $activities.length : $authActivities.length)}
  <Loader />
{/if}

<div class="page-wrapper hx-page">
  <div class="content">
    <HistoryHeader
      activeTab={$activeTab}
      searchString={$searchString}
      authSearchString={$authSearchString}
      resultSummary={$resultSummary}
      refresh={$refresh}
      hasActiveFilters={$hasActiveFilters}
      onRefresh={refreshPage}
      onExport={exportCurrentCsv}
      onCopyLink={copyInvestigationLink}
      onClearFilters={clearActiveFilters}
    />

    {#if $currentUser?.role === "master" || $currentUser?.role === "admin"}
      <HistoryTabs
        activeTab={$activeTab}
        totalItems={$totalItems}
        authTotalItems={$authTotalItems}
        orderCriticalCount={$orderCriticalCount}
        authCriticalCount={$authCriticalCount}
        onSwitch={switchTab}
      />
    {/if}

    {#if $activeTab === "order"}
      <OrderHistoryPanel
        orderStats={$orderStats}
        orderAttention={$orderAttention}
        orderInsights={$orderInsights}
        orderFlagFilter={$orderFlagFilter}
        {flagFilterLabel}
        {applyOrderInsight}
        clearOrderFlagFilter={() => orderFlagFilter.set("")}
        selectedFilter={$selectedFilter}
        bind:customStartDate={$customStartDate}
        bind:customEndDate={$customEndDate}
        searchTerm={$searchTerm}
        bind:userId={$userId}
        users={$users}
        currentUser={$currentUser}
        chatTypeFilter={$chatTypeFilter}
        sortOrder={$sortOrder}
        loadingData={$loadingData}
        columns={$orderTable.columns}
        actions={$orderTable.actions}
        filteredActivities={$filteredActivities}
        currentPage={$currentPage}
        rowsPerPage={$rowsPerPage}
        totalItems={$totalItems}
        {setOrderDatePreset}
        {handleSearchChange}
        {setSortOrder}
        {clearChatTypeFilter}
        onPageChange={(p) => currentPage.set(p)}
        onRowsPerPageChange={(r) => {
          rowsPerPage.set(r);
          currentPage.set(1);
        }}
      />
    {/if}

    {#if $activeTab === "auth"}
      <AuthHistoryPanel
        authStats={$authStats}
        authAttention={$authAttention}
        authCriticalCount={$authCriticalCount}
        authInsights={$authInsights}
        authFlagFilter={$authFlagFilter}
        authEventFilter={$authEventFilter}
        {flagFilterLabel}
        {applyAuthInsight}
        clearAuthFlagFilter={() => authFlagFilter.set("")}
        authSelectedFilter={$authSelectedFilter}
        bind:authCustomStartDate={$authCustomStartDate}
        bind:authCustomEndDate={$authCustomEndDate}
        authUserEmail={$authUserEmail}
        bind:authIpFilter={$authIpFilter}
        authSortOrder={$authSortOrder}
        loadingData={$loadingData}
        columns={$authTable.columns}
        actions={$authTable.actions}
        filteredAuthActivities={$filteredAuthActivities}
        authCurrentPage={$authCurrentPage}
        authRowsPerPage={$authRowsPerPage}
        authTotalItems={$authTotalItems}
        {setAuthDatePreset}
        {setAuthEvent}
        {handleAuthEmailChange}
        {setAuthSortOrder}
        onPageChange={(p) => authCurrentPage.set(p)}
        onRowsPerPageChange={(r) => {
          authRowsPerPage.set(r);
          authCurrentPage.set(1);
        }}
      />
    {/if}
  </div>
</div>

<HistoryDetailDrawer
  detailRow={$detailRow}
  detailKind={$detailKind}
  detailFlags={$detailFlags}
  detailTips={$detailTips}
  detailSeverity={$detailSeverity}
  detailMeta={$detailMeta}
  detailWhen={$detailWhen}
  detailMapsUrl={$detailMapsUrl}
  currentUser={$currentUser}
  onClose={closeDetail}
  onFilterSameUser={filterSameUserFromDetail}
  onAuthTrail={openAuthTrailForUser}
  onFilterAuthByEmail={filterAuthByEmail}
  onFilterAuthByIp={filterAuthByIp}
  onFilterSameEvent={filterSameEventFromDetail}
  onCopyField={copyField}
/>
