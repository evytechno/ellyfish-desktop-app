<script>
  import DispatchProcess from "$lib/components/DispatchProcess.svelte";
  import OrderActivityTab from "../tabs/OrderActivityTab.svelte";
  import OrderChatsTab from "../tabs/OrderChatsTab.svelte";
  import OrderFilesTab from "../tabs/OrderFilesTab.svelte";
  import OrderRemindersTab from "../tabs/OrderRemindersTab.svelte";
  import OrderLegacyClientsTab from "../tabs/OrderLegacyClientsTab.svelte";
  import OrderQueriesTab from "../tabs/OrderQueriesTab.svelte";
  import OrderComponentsTab from "../tabs/OrderComponentsTab.svelte";
  import OrderFeedbackTab from "../tabs/OrderFeedbackTab.svelte";

  export let order;
  export let currentUser;
  export let activeTab = "Activity";
  export let activeDate;
  export let toggleAccordion = () => {};
  export let maskAuthorName = (n) => n;
  export let maskAssignedName = (n) => n;
  export let handleAddAttachment = async () => {};
  export let handleDeleteAttachment = async () => {};
  export let openAttachment = () => {};
  export let openImageLightbox = () => {};
  export let handleAddChat = async () => {};
  export let handleDeleteChat = async () => {};
  export let deleteClient = async () => {};
  export let handleAddReminder = async () => {};
  export let handleDeleteReminder = async () => {};
  export let orderQueries = [];
  export let orderQueriesLoading = false;
  export let loadOrderQueries = async () => {};
  export let openQueryModal = () => {};
  export let openEditQueryModal = () => {};
  export let feedbacks = [];
  export let loadingFeedbacks = false;
  export let loadFeedbacks = async () => {};
  export let openFeedbackModal = () => {};
  export let deleteFeedback = async () => {};
  export let cerateChildOrder = async () => {};
  export let editChildOrder = () => {};
  export let deleteComponent = async () => {};
  export let handleEditComponentCompat = async () => {};
</script>

<div class="card mb-3">
  <div class="card-body pb-0 pt-2 px-2">
    <ul class="nav nav-tabs nav-bordered border-0 mb-0">
      <li class="nav-item" role="presentation">
        <a
          href="#tab_1"
          data-bs-toggle="tab"
          class="nav-link border-3"
          class:active={activeTab === "Activity"}
          on:click|preventDefault={() => (activeTab = "Activity")}
          aria-selected={activeTab === "Activity"}
          role="tab"
        >
          <span class="d-md-inline-block">
            <i class="ti ti-alarm-minus me-1"></i>Activities
          </span>
        </a>
      </li>
      <li class="nav-item" role="presentation">
        <a
          href="#tab_2"
          data-bs-toggle="tab"
          class="nav-link border-3"
          class:active={activeTab === "Files"}
          on:click|preventDefault={() => (activeTab = "Files")}
          aria-selected={activeTab === "Files"}
          role="tab"
          tabindex="-1"
        >
          <span class="d-md-inline-block"><i class="ti ti-file me-1"></i>Files</span>
        </a>
      </li>
      <li class="nav-item" role="presentation">
        <a
          href="#tab_3"
          data-bs-toggle="tab"
          class="nav-link border-3"
          class:active={activeTab === "Chats"}
          on:click|preventDefault={() => (activeTab = "Chats")}
          aria-selected={activeTab === "Chats"}
          role="tab"
          tabindex="-1"
        >
          <span class="d-md-inline-block">
            <i class="ti ti-brand-hipchat me-1"></i>Chats
          </span>
        </a>
      </li>
      <li class="nav-item" role="presentation">
        <a
          href="#tab_6"
          data-bs-toggle="tab"
          class="nav-link border-3"
          class:active={activeTab === "Client"}
          on:click|preventDefault={() => (activeTab = "Client")}
          aria-selected={activeTab === "Client"}
          role="tab"
          tabindex="-1"
        >
          <span class="d-md-inline-block">
            <i class="ti ti-user me-1"></i>Clients
          </span>
        </a>
      </li>
      <li class="nav-item" role="presentation">
        <a
          href="#tab_7"
          data-bs-toggle="tab"
          class="nav-link border-3"
          class:active={activeTab === "Reminders"}
          on:click|preventDefault={() => (activeTab = "Reminders")}
          aria-selected={activeTab === "Reminders"}
          role="tab"
          tabindex="-1"
        >
          <span class="d-md-inline-block">
            <i class="ti ti-alarm-snooze me-1"></i>Reminders
          </span>
        </a>
      </li>
      <li class="nav-item" role="presentation">
        <a
          href="#tab_10"
          data-bs-toggle="tab"
          class="nav-link border-3"
          class:active={activeTab === "Queries"}
          on:click|preventDefault={() => {
            activeTab = "Queries";
            loadOrderQueries();
          }}
          aria-selected={activeTab === "Queries"}
          role="tab"
          tabindex="-1"
        >
          <span class="d-md-inline-block">
            <i class="ti ti-help-circle me-1"></i>Queries
            {#if currentUser?.subRole === "tech"}
              {@const myCount = orderQueries.filter(
                (q) =>
                  q.isRaisedByMe ||
                  q.assignedToId === currentUser?.id ||
                  q.assignedTo?.id === currentUser?.id,
              ).length}
              {#if myCount > 0}
                <span class="badge bg-success ms-1" style="font-size:10px;">{myCount}</span>
              {/if}
            {:else if orderQueries.length > 0}
              <span class="badge bg-primary ms-1" style="font-size:10px;">{orderQueries.length}</span>
            {/if}
          </span>
        </a>
      </li>
      <li class="nav-item" role="presentation">
        <a
          href="#tab_fb"
          data-bs-toggle="tab"
          class="nav-link border-3"
          class:active={activeTab === "Feedback"}
          on:click|preventDefault={() => {
            activeTab = "Feedback";
            loadFeedbacks();
          }}
          aria-selected={activeTab === "Feedback"}
          role="tab"
          tabindex="-1"
        >
          <span class="d-md-inline-block">
            <i class="ti ti-message-star me-1"></i>Feedback
            {#if feedbacks.length > 0}
              <span class="badge bg-primary ms-1" style="font-size:10px;">{feedbacks.length}</span>
            {/if}
          </span>
        </a>
      </li>
      {#if ["Deal Won", "Dispatched", "Completed"].includes(order?.status)}
        <li class="nav-item" role="presentation">
          <a
            href="#tab_8"
            data-bs-toggle="tab"
            class="nav-link border-3"
            class:active={activeTab === "Components"}
            on:click|preventDefault={() => (activeTab = "Components")}
            aria-selected={activeTab === "Components"}
            role="tab"
            tabindex="-1"
          >
            <span class="d-md-inline-block">
              <i class="ti ti-stack me-1"></i>Multiple Orders
            </span>
          </a>
        </li>
      {/if}
      {#if ["Dispatched", "Completed"].includes(order?.status)}
        <li class="nav-item" role="presentation">
          <a
            href="#tab_9"
            data-bs-toggle="tab"
            class="nav-link border-3"
            class:active={activeTab === "Installation"}
            on:click|preventDefault={() => (activeTab = "Installation")}
            aria-selected={activeTab === "Installation"}
            role="tab"
            tabindex="-1"
          >
            <span class="d-md-inline-block">
              <i class="ti ti-truck-delivery me-1"></i>Dispatched
            </span>
          </a>
        </li>
      {/if}
    </ul>
  </div>
</div>

<div class="tab-content pt-0">
  {#if activeTab === "Activity"}
    <OrderActivityTab {order} {currentUser} {activeDate} {toggleAccordion} />
  {/if}
  {#if activeTab === "Files"}
    <OrderFilesTab
      {order}
      {maskAuthorName}
      addAttachment={handleAddAttachment}
      deleteAttachment={handleDeleteAttachment}
      {openAttachment}
      {openImageLightbox}
    />
  {/if}
  {#if activeTab === "Chats"}
    <OrderChatsTab
      {order}
      {currentUser}
      {maskAuthorName}
      addChat={handleAddChat}
      deleteChat={handleDeleteChat}
    />
  {/if}
  {#if activeTab === "Client"}
    <OrderLegacyClientsTab {order} {deleteClient} />
  {/if}
  {#if activeTab === "Reminders"}
    <OrderRemindersTab
      {order}
      {maskAuthorName}
      addReminder={handleAddReminder}
      deleteReminder={handleDeleteReminder}
    />
  {/if}
  {#if activeTab === "Queries"}
    <OrderQueriesTab
      {order}
      {currentUser}
      {orderQueries}
      {orderQueriesLoading}
      {maskAssignedName}
      {openQueryModal}
      {openEditQueryModal}
    />
  {/if}
  {#if activeTab === "Feedback"}
    <OrderFeedbackTab
      {order}
      {feedbacks}
      {loadingFeedbacks}
      {currentUser}
      on:openFeedbackModal={openFeedbackModal}
      on:deleteFeedback={(e) => deleteFeedback(e.detail)}
    />
  {/if}
  {#if ["Deal Won", "Dispatched", "Completed"].includes(order?.status)}
    {#if activeTab === "Components"}
      <OrderComponentsTab
        {order}
        {cerateChildOrder}
        {editChildOrder}
        {deleteComponent}
        editComponent={handleEditComponentCompat}
      />
    {/if}
  {/if}
  {#if ["Dispatched", "Completed"].includes(order?.status)}
    {#if activeTab === "Installation"}
      <DispatchProcess {order} />
    {/if}
  {/if}
</div>
