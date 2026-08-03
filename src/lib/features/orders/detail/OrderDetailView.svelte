<script>
  import { onMount } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import Loader from "$lib/components/Loader.svelte";
  import SkeletonOrderDetail from "$lib/components/SkeletonOrderDetail.svelte";
  import LightBox from "$lib/components/LightBox.svelte";
  import PIWOTIModal from "$lib/components/PIWOTIModal.svelte";
  import OrderFeedbackModal from "./components/modals/OrderFeedbackModal.svelte";
  import OrderEditOffcanvas from "./components/modals/OrderEditOffcanvas.svelte";
  import OrderAssignedUsersModal from "./components/modals/OrderAssignedUsersModal.svelte";
  import OrderVisitModals from "./components/modals/OrderVisitModals.svelte";
  import OrderQueryModals from "./components/modals/OrderQueryModals.svelte";
  import OrderClientModals from "./components/modals/OrderClientModals.svelte";
  import OrderHeader from "./components/layout/OrderHeader.svelte";
  import OrderSidebar from "./components/layout/OrderSidebar.svelte";
  import OrderPageChrome from "./components/layout/OrderPageChrome.svelte";
  import OrderTabs from "./components/layout/OrderTabs.svelte";
  import { createOrderDetail } from "./hooks/index.js";
  import "./styles/order-detail.css";

  /** @type {string|number} */
  export let orderId;

  // Svelte 3 composable hook (store-based — project is on Svelte 3, not runes)
  const detail = createOrderDetail({ getOrderId: () => orderId });

  const {
    order,
    loadingData,
    errorMessage,
    loading,
    formErrors,
    users,
    categories,
    currentUser,
    title,
    category,
    orderDate,
    startDate,
    deadlineDate,
    price,
    currency,
    priceTerms,
    source,
    description,
    workOrderNumber,
    activeTab,
    activeDate,
    orderInfoExpanded,
    showChangeClientModal,
    showNewClientModal,
    showAddContactModal,
    showEditClientModal,
    piwotiOpen,
    piwotiType,
    showImages,
    showImagesStart,
    orderQueries,
    orderQueriesLoading,
    showQueryModal,
    querySubject,
    queryDescription,
    raisingQuery,
    queryError,
    showEditQueryModal,
    editQuerySubject,
    editQueryDescription,
    editingQueryLoading,
    editQueryError,
    orderVisits,
    showVisitListModal,
    showVisitModal,
    visitCompanyId,
    visitCompanies,
    showFeedbackModal,
    feedbackTriggerStatus,
    feedbackLoading,
    feedbacks,
    loadingFeedbacks,
    statuses,
    loadOrder,
    handleSubmit,
    deleteOrder,
    deleteClient,
    loadOrderQueries,
    openQueryModal,
    submitOrderQuery,
    openEditQueryModal,
    submitEditQuery,
    openVisitModal,
    handleSubmitVisitModal,
    linkContact,
    setPrimaryContact,
    unlinkContact,
    setAssignedUsers,
    handleAddAssignedUser,
    deleteComponent,
    cerateChildOrder,
    editChildOrder,
    handleEditComponentCompat,
    loadFeedbacks,
    submitFeedback,
    deleteFeedback,
    openFeedbackModal,
    toggleAccordion,
    togglePin,
    changeOrderStatus,
    handleAddChat,
    handleDeleteChat,
    handleAddReminder,
    handleDeleteReminder,
    handleAddAttachment,
    handleDeleteAttachment,
    openImageLightbox,
    openAttachment,
    onPIWOTIRefresh,
    addActivityToGroupedActivities,
    maskAssignedName,
    maskAuthorName,
  } = detail;

  onMount(() => loadOrder());
  afterNavigate(() => loadOrder());
</script>

{#if $loadingData && !$order}
  <Loader />
{/if}

<div class="page-wrapper order-detail-page">
  <div class="content pb-0">
    <OrderPageChrome
      order={$order}
      currentUser={$currentUser}
      {deleteOrder}
      {openQueryModal}
    />

    {#if !$loadingData}
      {#if $order}
        <LightBox data={$showImages} startIndex={$showImagesStart} />
        <div class="row">
          <div class="col-md-12">
            <OrderQueryModals
              bind:showQueryModal={$showQueryModal}
              bind:showEditQueryModal={$showEditQueryModal}
              bind:querySubject={$querySubject}
              bind:queryDescription={$queryDescription}
              bind:editQuerySubject={$editQuerySubject}
              bind:editQueryDescription={$editQueryDescription}
              queryError={$queryError}
              raisingQuery={$raisingQuery}
              editQueryError={$editQueryError}
              editingQueryLoading={$editingQueryLoading}
              {submitOrderQuery}
              {submitEditQuery}
            />
            <OrderHeader
              order={$order}
              {statuses}
              {togglePin}
              {changeOrderStatus}
              bind:piwotiOpen={$piwotiOpen}
              bind:piwotiType={$piwotiType}
              orderVisits={$orderVisits}
              {openVisitModal}
              bind:showVisitListModal={$showVisitListModal}
              {openFeedbackModal}
            />
          </div>

          <OrderSidebar
            order={$order}
            bind:orderInfoExpanded={$orderInfoExpanded}
            bind:showChangeClientModal={$showChangeClientModal}
            bind:showAddContactModal={$showAddContactModal}
            bind:showNewClientModal={$showNewClientModal}
            bind:showEditClientModal={$showEditClientModal}
            {linkContact}
            {setPrimaryContact}
            {unlinkContact}
            {setAssignedUsers}
          />

          <div class="col-xl-8">
            <OrderTabs
              order={$order}
              currentUser={$currentUser}
              bind:activeTab={$activeTab}
              activeDate={$activeDate}
              {toggleAccordion}
              {maskAuthorName}
              {maskAssignedName}
              {handleAddAttachment}
              {handleDeleteAttachment}
              {openAttachment}
              {openImageLightbox}
              {handleAddChat}
              {handleDeleteChat}
              {deleteClient}
              {handleAddReminder}
              {handleDeleteReminder}
              orderQueries={$orderQueries}
              orderQueriesLoading={$orderQueriesLoading}
              {loadOrderQueries}
              {openQueryModal}
              {openEditQueryModal}
              feedbacks={$feedbacks}
              loadingFeedbacks={$loadingFeedbacks}
              {loadFeedbacks}
              {openFeedbackModal}
              {deleteFeedback}
              {cerateChildOrder}
              {editChildOrder}
              {deleteComponent}
              {handleEditComponentCompat}
            />
          </div>
        </div>
      {:else}
        <div class="row">
          <div class="col-md-12">
            <div
              class="d-flex flex-column align-items-center justify-content-center text-center"
              style="min-height:50vh; gap:1rem;"
            >
              <div style="font-size:3rem;">⚠️</div>
              <h4 class="fw-semibold mb-1">Order Not Found</h4>
              <p class="text-muted mb-3" style="max-width:380px;">
                {$errorMessage ||
                  "This order could not be loaded. It may have been deleted or you may not have access."}
              </p>
              <div class="d-flex gap-2 flex-wrap justify-content-center">
                <button class="btn btn-primary" on:click={() => location.reload()}>
                  <i class="ti ti-refresh me-1"></i>Retry
                </button>
                <a href="/admin/order" class="btn btn-outline-secondary">
                  <i class="ti ti-arrow-left me-1"></i>Back to Orders
                </a>
              </div>
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <SkeletonOrderDetail />
    {/if}
  </div>
</div>

<OrderFeedbackModal
  show={$showFeedbackModal}
  triggerStatus={$feedbackTriggerStatus}
  loading={$feedbackLoading}
  on:close={() => openFeedbackModal(false)}
  on:submit={(e) => submitFeedback(e.detail)}
/>

<OrderEditOffcanvas
  order={$order}
  categories={$categories}
  {handleSubmit}
  bind:title={$title}
  bind:category={$category}
  bind:orderDate={$orderDate}
  bind:startDate={$startDate}
  bind:deadlineDate={$deadlineDate}
  bind:price={$price}
  bind:currency={$currency}
  bind:priceTerms={$priceTerms}
  bind:source={$source}
  bind:description={$description}
  bind:workOrderNumber={$workOrderNumber}
  bind:formErrors={$formErrors}
  bind:loading={$loading}
  bind:errorMessage={$errorMessage}
/>

<OrderAssignedUsersModal
  order={$order}
  currentUser={$currentUser}
  users={$users}
  addAssignedUser={handleAddAssignedUser}
/>

<OrderVisitModals
  order={$order}
  users={$users}
  orderVisits={$orderVisits}
  bind:showVisitModal={$showVisitModal}
  bind:showVisitListModal={$showVisitListModal}
  bind:visitCompanyId={$visitCompanyId}
  bind:visitCompanies={$visitCompanies}
  {openVisitModal}
  submitVisitModal={handleSubmitVisitModal}
/>

<OrderClientModals
  bind:order={$order}
  {addActivityToGroupedActivities}
  bind:showChangeClientModal={$showChangeClientModal}
  bind:showNewClientModal={$showNewClientModal}
  bind:showAddContactModal={$showAddContactModal}
  bind:showEditClientModal={$showEditClientModal}
/>

<PIWOTIModal
  open={$piwotiOpen}
  type={$piwotiType}
  order={$order}
  on:close={() => piwotiOpen.set(false)}
  on:refresh={onPIWOTIRefresh}
/>
