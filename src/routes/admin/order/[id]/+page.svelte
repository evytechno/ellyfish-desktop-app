<script>
  import { onDestroy, onMount } from "svelte";
  import { goto } from "$app/navigation";
  import jQuery from "jquery";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  let loadingData = true;
  import { usersAllStore, categoriesAllStore } from "$lib/stores/dataStores";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { get } from "svelte/store";
  import LightBox from "$lib/components/LightBox.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import DispatchProcess from "$lib/components/DispatchProcess.svelte";

  let errorMessage = "";
  let order = null;
  let users = [];

  // Form state
  let title = "";
  let category = "";
  let orderDate = null;
  let startDate = null;
  let deadlineDate = null;
  let price = null;
  let currency = "INR";
  let priceTerms = null;
  let source = null;
  let description = "";
  let company = "";
  let gstNumber = "";
  let workOrderNumber = "";
  let importStatus = "false";

  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let address = "";
  let alternateMobile = "";
  let designation = "";
  let remark = "";

  let aTitle = "";
  let link = "";
  let files = [];

  let type = "";
  let message = "";

  let reminderTime = null;
  let reminderMessage = "";

  let selectedUsers = [];
  let userSearch = "";
  let categories = [];

  let orderTitle = "";
  let orderWorkOrderNumber = "";
  let childOrderId = null;

  let dispatchedDetails = null;

  let loading = false;

  // Field-specific error messages
  let formErrors = {};

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length > 0) {
      files = [...files, ...selectedFiles];
    }
  }

  let isDragging = false;

  function handleDragOver(event) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleDrop(event) {
    event.preventDefault();
    isDragging = false;
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) {
      files = [...files, ...dropped];
    }
  }

  function handleFileChangePaste(file) {
    if (file) {
      files = [...files, file];
    }
  }

  function removeFile(fileToRemove) {
    files = files.filter((file) => file !== fileToRemove);
  }

  function closeModalMenual(id) {
    const $ = jQuery;
    $(id).removeClass("show d-block");
    $(".modal-backdrop").removeClass("show");

    setTimeout(() => {
      $(".modal-backdrop").remove();
      $(id).removeClass("d-block");
      $("body").removeClass("modal-open");
      $("body").css({ overflow: "", paddingRight: "" });
    }, 300);
  }

  function closeOffcanvas() {
    const $ = jQuery;
    $("#offcanvas_add").removeClass("show");
    $(".offcanvas-backdrop").remove();
    $("body").css({ overflow: "", paddingRight: "" });
  }

  function addActivityToGroupedActivities(newActivity) {
    let groupedActivities = order.groupedActivities || [];

    const formatDate = (dateStr) =>
      new Date(dateStr).toISOString().split("T")[0]; // returns "YYYY-MM-DD"

    const activityDate = formatDate(newActivity.createdAt);

    // Normalize existing group dates for reliable comparison
    let group = groupedActivities.find(
      (g) => formatDate(g.date) === activityDate,
    );

    if (group) {
      group.activities.unshift(newActivity);
      group.activities.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
    } else {
      groupedActivities.unshift({
        date: activityDate, // normalized string "YYYY-MM-DD"
        activities: [newActivity],
      });
    }

    return groupedActivities;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const updateOrder = {
      title,
      price,
      currency,
      priceTerms,
      source,
      description,
      company,
      gstNumber,
      workOrderNumber,
      importStatus,
    };
    if (category) {
      updateOrder.category = category;
    } else {
      updateOrder.category = "";
    }
    if (orderDate) {
      updateOrder.orderDate = orderDate;
    }
    if (startDate) {
      updateOrder.startDate = startDate;
    }
    if (deadlineDate) {
      updateOrder.deadlineDate = deadlineDate;
    }
    if (price) {
      updateOrder.price = Number(price);
    }

    let newActivity = {
      title: "Order Updated",
      description: `Order details have been updated.`,
    };
    updateOrder.orderActivity = newActivity;
    if (title == "") {
      formErrors.title = ["Title is required."];
      loading = false;
      return;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify(updateOrder),
      });

      order = data.data;
      Swal.fire("Success!", data.message, "success");
      closeOffcanvas();
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      console.log("formErrors : ", formErrors);

      loading = false;
    }
  }

  async function getAllCategories() {
    const cached = get(categoriesAllStore);
    if (cached && cached.length > 0 && typeof cached[0] === "object" && cached[0].label) {
      categories = cached;
      loadingData = false;
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.CATEGORY + "/all");
      categories = data.map((parent) => ({
        label: parent.name,
        options:
          parent.children && parent.children.length > 0
            ? parent.children.map((c) => c.name)
            : [parent.name],
      }));
      categoriesAllStore.set(categories);
    } catch (err) {
      errorMessage = "Failed to load category data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  let orderId;
  $: orderId = $page.params.id;
  let currentUser = null;

  // Related Queries
  let orderQueries = [];
  let orderQueriesLoading = false;

  async function loadOrderQueries() {
    if (!orderId) return;
    orderQueriesLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/order/${orderId}`);
      orderQueries = Array.isArray(res) ? res : [];
    } catch (_) {
      orderQueries = [];
    } finally {
      orderQueriesLoading = false;
    }
  }

  // Raise Query from order detail
  let showQueryModal = false;
  let querySubject = "";
  let queryDescription = "";
  let raisingQuery = false;
  let queryError = "";

  async function submitOrderQuery() {
    queryError = "";
    if (!querySubject.trim() || !queryDescription.trim()) {
      queryError = "Subject and description are required.";
      return;
    }
    raisingQuery = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}`, {
        method: "POST",
        data: JSON.stringify({
          subject: querySubject,
          description: queryDescription,
          orderId: Number(orderId),
        }),
      });
      showQueryModal = false;
      querySubject = "";
      queryDescription = "";
      Swal.fire({ icon: "success", title: "Query raised successfully", timer: 1500, showConfirmButton: false });
      loadOrderQueries();
    } catch (e) {
      const msg = e?.data?.message;
      if (typeof msg === "string") {
        queryError = msg;
      } else if (Array.isArray(msg)) {
        queryError = msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" • ");
      } else {
        queryError = "Failed to raise query.";
      }
    } finally {
      raisingQuery = false;
    }
  }

  onMount(async () => {
    let loginUser = checkAuth();
    currentUser = loginUser;

    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`);
      order = data;

      order.orderAttachments = data.orderAttachments.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      order.orderChats = data.orderChats.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      order.orderReminders = data.orderReminders.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      order.orderClients = data.orderClients.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      // update params
      title = data?.title;
      category = data?.category;
      orderDate = data?.orderDate
        ? new Date(data.orderDate).toISOString().substring(0, 10)
        : "";
      startDate = data?.startDate
        ? new Date(data.startDate).toISOString().substring(0, 10)
        : "";
      deadlineDate = data?.deadlineDate
        ? new Date(data.deadlineDate).toISOString().substring(0, 10)
        : "";

      price = data?.price;
      priceTerms = data?.priceTerms;
      currency = data?.currency;
      source = data?.source;
      description = data?.description;
      gstNumber = data?.gstNumber;
      workOrderNumber = data?.workOrderNumber;
      importStatus = data?.importStatus;
      company = data?.company;

      data?.assignedUsers.map((user) => {
        if (user?.role == "user") {
          seletedUsers.push(user?.id);
        }
      });
    } catch (err) {
      errorMessage = "Failed to load order data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
    getAllCategories();
    loadOrderQueries();
  });

  onMount(async () => {
    try {
      const cached = get(usersAllStore);
      if (cached && cached.length > 0) {
        users = cached;
        loadingData = false;
        return;
      }
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data;
      usersAllStore.set(data);
    } catch (err) {
      errorMessage = "Failed to load user data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  function getAvatarText(title) {
    if (!title) return "";
    const words = title.trim().split(" ");
    if (words.length === 1) {
      return words[0][0].toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  async function deleteOrder(id) {
    try {
      Swal.fire({
        title: "Archive Confirmation",
        text: "Are you sure you want to archive this record.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, archive it!",
      }).then(async (result) => {
        if (result.isConfirmed) {
          const data = await authApiFetch(API_ROUTES.ORDER + "/" + id, {
            method: "DELETE",
          });
          Swal.fire("Deleted!", data.message, "success");
          goto("/admin/order");
        }
      });
    } catch (error) {
      const validationErrors = errorHandle(error);

      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      console.log("formErrors : ", formErrors);
    }
  }

  async function addAttachment(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const attachmentPayload = new FormData();

    attachmentPayload.append("title", aTitle);
    attachmentPayload.append("link", link);
    if (files && files.length > 0) {
      files.forEach((file) => {
        attachmentPayload.append("file", file);
      });
    }

    if (orderId) {
      const parsedOrderId = parseInt(orderId, 10);
      if (isNaN(parsedOrderId)) {
        formErrors.orderId = ["Order ID must be a number."];
      } else {
        attachmentPayload.append("orderId", parsedOrderId);
      }
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER_ATTACHMENT, {
        method: "POST",
        data: attachmentPayload, // Send FormData
      });

      // Reset Form
      aTitle = "";
      link = "";
      files = [];
      formErrors = {};

      if (data) {
        order.orderAttachments = [data.data, ...order.orderAttachments];
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#new_file");

        let newActivity = {
          title: "Order Attachment Added",
          description: "A new attachment has been added to the order.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };

        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
      loading = false;
    }
  }

  async function deleteAttachment(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(
            `${API_ROUTES.ORDER_ATTACHMENT}/${id}`,
            {
              method: "DELETE",
            },
          );

          order.orderAttachments = order.orderAttachments.filter(
            (attachment) => attachment.id !== id,
          );
          Swal.fire("Deleted!", data.message, "success");

          let newActivity = {
            title: "Order Attachment Deleted",
            description: "Order attachment has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  async function addChat(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const chatPayload = {
      type,
      message,
    };
    if (order) {
      chatPayload.orderId = order.id;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify(chatPayload),
      });

      // Reset Form
      type = "";
      message = "";
      formErrors = {};

      if (data) {
        order.orderChats = [data.data, ...order.orderChats];

        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#create_call");

        let newActivity = {
          title: "Order Chat Added",
          description: "A new message has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
      loading = false;
    }
  }

  async function deleteChat(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.ORDER_CHAT}/${id}`, {
            method: "DELETE",
          });

          order.orderChats = order.orderChats.filter((chat) => chat.id !== id);
          Swal.fire("Deleted!", data.message, "success");

          let newActivity = {
            title: "Order Chat Deleted",
            description: "Order chat has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  async function addReminder(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const reminderPayload = {
      reminderTime: reminderTime ? new Date(reminderTime).toISOString() : null,
      message: reminderMessage,
    };
    if (order) {
      reminderPayload.orderId = order.id;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER_REMINDER, {
        method: "POST",
        data: JSON.stringify(reminderPayload),
      });

      // Reset Form
      reminderTime = null;
      reminderMessage = "";
      formErrors = {};

      if (data) {
        order.orderReminders = [data.data, ...order.orderReminders];

        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#create_reminder");

        let newActivity = {
          title: "Order Reminder Added",
          description: "A new reminder has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
      loading = false;
    }
  }

  async function deleteReminder(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(
            `${API_ROUTES.ORDER_REMINDER}/${id}`,
            {
              method: "DELETE",
            },
          );

          order.orderReminders = order.orderReminders.filter(
            (reminder) => reminder.id !== id,
          );
          Swal.fire("Deleted!", data.message, "success");

          let newActivity = {
            title: "Order Reminder Deleted",
            description: "Order reminder has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  async function addClient(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const clientPayload = {
      name,
      mobile,
      whatsapp,
      address,
      alternateMobile,
      designation,
      remark,
    };
    if (order) {
      clientPayload.orderId = order.id;
    }
    if (email || email != "") {
      clientPayload.email = email;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CLIENT, {
        method: "POST",
        data: JSON.stringify(clientPayload),
      });

      // Reset Form
      name = "";
      mobile = "";
      whatsapp = "";
      address = "";
      alternateMobile = "";
      designation = "";
      remark = "";
      formErrors = {};

      if (data) {
        order.orderClients = [data.data, ...order.orderClients];

        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#create_client");

        let newActivity = {
          title: "Order Client Added",
          description: "A new client has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
      loading = false;
    }
  }

  async function deleteClient(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${id}`, {
            method: "DELETE",
          });

          order.orderClients = order.orderClients.filter(
            (client) => client.id !== id,
          );
          Swal.fire("Deleted!", data.message, "success");

          let newActivity = {
            title: "Order Client Deleted",
            description: "Order client has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  async function editComponent(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const componentPayload = {
      title: orderTitle,
      workOrderNumber: orderWorkOrderNumber,
      status: order.status,
    };

    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + childOrderId, {
        method: "PUT",
        data: JSON.stringify(componentPayload),
      });

      if (data) {
        const index = order.childOrders.findIndex((o) => o.id === childOrderId);

        if (index !== -1) {
          order.childOrders[index] = {
            ...order.childOrders[index],
            ...componentPayload,
          };
        }

        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");

        let newActivity = {
          title: "Order Updated",
          description: `Order details have been updated.`,
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        // order.groupedActivities = addActivityToGroupedActivities(newActivity);

        // Reset Form
        orderTitle = "";
        orderWorkOrderNumber = "";
        childOrderId = null;
        formErrors = {};
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
      loading = false;
    }
  }

  async function deleteComponent(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.ORDER}/${id}`, {
            method: "DELETE",
          });

          order.childOrders = order.childOrders.filter(
            (child) => child.id !== id,
          );
          Swal.fire("Deleted!", data.message, "success");

          let newActivity = {
            title: "Order Deleted",
            description: "Order has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  async function addAssignedUser(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const updateOrder = {
      title,
    };
    let newAssignedUsers = [];
    newAssignedUsers = selectedUsers
      .map((id) => users.find((u) => u.id === id))
      .filter(Boolean);
    const existingAdminUsers = order.assignedUsers.filter(
      (user) => user.role === "admin",
    );
    updateOrder.assignedUsers = [...newAssignedUsers, ...existingAdminUsers];

    const prevUserIds = order.assignedUsers
      .filter((u) => u.role === "user")
      .map((u) => u.id);
    const addedUsers = newAssignedUsers.filter((u) => !prevUserIds.includes(u.id));
    const removedUsers = order.assignedUsers.filter(
      (u) => u.role === "user" && !selectedUsers.includes(u.id),
    );
    const parts = [];
    if (addedUsers.length) parts.push(`Assigned: ${addedUsers.map((u) => u.name).join(", ")}`);
    if (removedUsers.length) parts.push(`Removed: ${removedUsers.map((u) => u.name).join(", ")}`);
    let newActivity = {
      title: "Assigned Users Updated",
      description: parts.length ? parts.join(". ") + "." : "Assigned users updated.",
    };
    updateOrder.orderActivity = newActivity;

    if (!updateOrder?.assignedUsers?.length) {
      Swal.fire("Warning!", "Please select one user for assign.", "warning");
      loading = false;
    } else {
      try {
        const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
          method: "PUT",
          data: JSON.stringify(updateOrder),
        });

        order = data.data;
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#add_contact");
      } catch (error) {
        loading = false;
        const validationErrors = errorHandle(error);
        if (validationErrors && typeof validationErrors === "object") {
          formErrors = validationErrors;
        } else {
          errorMessage = "An unexpected error occurred.";
        }
      } finally {
        console.log("formErrors : ", formErrors);

        loading = false;
      }
    }
  }

  async function cerateChildOrder() {
    errorMessage = "";
    loading = true;
    formErrors = {};

    const componentPayload = {};
    if (order) {
      componentPayload.title = order.title;
      componentPayload.parentId = order.id;
      componentPayload.status = order.status;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/children", {
        method: "POST",
        data: JSON.stringify(componentPayload),
      });

      // Reset Form
      formErrors = {};

      if (data) {
        order.childOrders = [data.data, ...order.childOrders];

        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");

        let newActivity = {
          title: "Order Component Added",
          description: "A new component has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
      loading = false;
    }
  }

  let activeTab = "Activity";

  let statusesColors = {
    "New Lead": "bg-blue",
    Contacted: "bg-purple",
    "Follow Up": "bg-yellow",
    Qualified: "bg-[#2ecc71]",
    Unqualified: "bg-[#e74c3c]",
    "Needs Assessment": "bg-orange",
    "Quotation Sent": "bg-teal",
    "Negotiation In Progress": "bg-[#FFBF00]",
    "Deal Won": "bg-green",
    "Deal Lost": "bg-red",
  };

  function setAssignedUsers() {
    selectedUsers = [];
    userSearch = "";
    order?.assignedUsers.forEach((user) => {
      if (user?.role === "user") {
        selectedUsers.push(user?.id);
      }
    });
  }

  const statuses = [
    "New Lead",
    "Contacted",
    "Follow Up",
    "Qualified",
    "Unqualified",
    "Needs Assessment",
    "Quotation Sent",
    "Negotiation In Progress",
    "Deal Won",
    "Deal Lost",
  ];

  let activeDate = new Date().toISOString().split("T")[0];
  function toggleAccordion(date) {
    activeDate = activeDate === date ? null : date;
  }

  function shortenFileName(name, keepStart = 8, keepEnd = 12) {
    if (name.length <= keepStart + keepEnd) return name;
    return name.slice(0, keepStart) + "..." + name.slice(-keepEnd);
  }

  function convertDate(rawTimestamp, format) {
    if (!rawTimestamp) return "";
    let s = String(rawTimestamp);
    if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
    return new Date(s).toLocaleString("en-GB", format);
  }

  let observer;
  function handlePaste(event) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") === 0) {
        const blob = item.getAsFile();
        if (blob) {
          handleFileChangePaste(blob);

          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(blob);
          document.getElementById("attachmentFile").files = dataTransfer.files;
        }
      }
    }
  }

  async function editChildOrder(component) {
    childOrderId = component?.id;
    orderTitle = component?.title;
    orderWorkOrderNumber = component?.workOrderNumber;
  }

  onMount(() => {
    const checkModalAndAttachPaste = () => {
      const modal = document.getElementById("new_file");
      if (modal?.classList.contains("show")) {
        document.addEventListener("paste", handlePaste);
      } else {
        document.removeEventListener("paste", handlePaste);
      }
    };

    const modal = document.getElementById("new_file");
    if (modal) {
      observer = new MutationObserver(checkModalAndAttachPaste);
      observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
    }
  });

  onDestroy(() => {
    observer?.disconnect();
    if (typeof document !== "undefined") {
      document.removeEventListener("paste", handlePaste);
    }
  });

  function newDateFormate(date, format) {
    let formattedDate;

    if (typeof date === "string" && date.includes(".") && !date.endsWith("Z")) {
      const [datePart, msPart] = date.split(".");
      const trimmedMs = msPart.slice(0, 3);
      const isoFormatted = `${datePart}.${trimmedMs}Z`;

      formattedDate = new Date(isoFormatted);
    } else {
      formattedDate = new Date(date);
    }

    if (isNaN(formattedDate)) {
      console.error("Invalid date format:", date);
      return "Invalid date";
    }

    return formattedDate.toLocaleString("en-GB", format);
  }

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];

  function togglePin(id) {
    let pinstatus = "false";
    if (order?.pinStatus === "true") {
      pinstatus = "false";
    } else {
      pinstatus = "true";
    }
    Swal.fire({
      title: "Change Pin Status",
      text: "Are you sure you want to chnage pin status this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, change it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          setOrderPinStatus(pinstatus);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  async function setOrderPinStatus(status) {
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const updateOrder = { pinStatus: status };

    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify(updateOrder),
      });

      order = data.data;
      Swal.fire("Success!", "Pin Status updated successfully.", "success");
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }

  let visibilityMap = {};

  function toggleVisibility(index) {
    visibilityMap[index] = !visibilityMap[index];
  }
  const sources = ["Whatsapp", "Website", "Mail"];
  let showImages = [];
  let showImagesStart = 0;

  function openImageLightbox(urls, index = 0) {
    showImagesStart = index;
    showImages = Array.isArray(urls) ? urls : [urls];
  }

  // Open image in lightbox; open other files in a new tab
  function openAttachment(url, mime, name) {
    const isImg = mime
      ? mime.startsWith("image/")
      : /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name ?? "");
    if (isImg) {
      openImageLightbox([url], 0);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  // Return { icon, bg } based on mime type or filename
  function fileIcon(mime, name) {
    const m = mime ?? "";
    const n = (name ?? "").toLowerCase();
    if (m.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(n))
      return { icon: "ti-photo", bg: "bg-success" };
    if (m === "application/pdf" || n.endsWith(".pdf"))
      return { icon: "ti-file-type-pdf", bg: "bg-danger" };
    if (m.includes("word") || /\.(doc|docx)$/.test(n))
      return { icon: "ti-file-type-doc", bg: "bg-primary" };
    if (m.includes("excel") || m.includes("spreadsheet") || /\.(xls|xlsx|csv)$/.test(n))
      return { icon: "ti-file-spreadsheet", bg: "bg-success" };
    if (m.includes("zip") || m.includes("rar") || /\.(zip|rar|7z|tar|gz)$/.test(n))
      return { icon: "ti-file-zip", bg: "bg-warning" };
    return { icon: "ti-file", bg: "bg-secondary" };
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div
      class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap"
    >
      <div>
        <h4 class="mb-1">Order</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/order">Orders</a></li>
            <li class="breadcrumb-item active" aria-current="page">Order</li>
          </ol>
        </nav>
      </div>
    </div>
    <!-- End Page Header -->
    {#if !loadingData}
      {#if order}
        <LightBox data={showImages} startIndex={showImagesStart} />
        <div class="row">
          <div class="col-md-12">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <button on:click={() => history.length > 2 ? history.back() : goto('/admin/order')}>
                  <i class="ti ti-arrow-narrow-left me-1"></i>Back to Orders
                </button>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  class="btn btn-secondary"
                  on:click={() => deleteOrder(order?.id)}
                >
                  <i class="ti ti-archive me-1"></i>Archive Order
                </button>
                <a
                  href="#offcanvas_add"
                  class="btn btn-primary"
                  data-bs-toggle="offcanvas"
                  data-bs-target="#offcanvas_add"
                >
                  <i class="ti ti-square-rounded-plus-filled me-1"></i>Edit
                  Order
                </a>
                {#if currentUser?.subRole === "telecaller" || (currentUser?.role === "user" && !currentUser?.subRole)}
                  <button
                    class="btn btn-warning"
                    on:click={() => (showQueryModal = true)}
                  >
                    <i class="ti ti-help-circle me-1"></i>Raise Query
                  </button>
                {/if}
              </div>
            </div>

            <!-- Raise Query Modal -->
            {#if showQueryModal}
              <div
                style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1055;display:flex;align-items:center;justify-content:center;padding:1rem;"
                on:click|self={() => (showQueryModal = false)}
              >
                <div class="card shadow-lg p-4" style="max-width:520px;width:100%;">
                  <h5 class="fw-bold mb-3">Raise Query for This Order</h5>
                  {#if queryError}
                    <div class="alert alert-danger py-2">{queryError}</div>
                  {/if}
                  <div class="mb-3">
                    <label class="form-label">Subject <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" bind:value={querySubject} placeholder="Brief subject..." maxlength="150" />
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Description <span class="text-danger">*</span></label>
                    <textarea class="form-control" rows="4" bind:value={queryDescription} placeholder="Describe the issue in detail..."></textarea>
                  </div>
                  <div class="d-flex gap-2 justify-content-end">
                    <button class="btn btn-secondary btn-sm" on:click={() => (showQueryModal = false)}>Cancel</button>
                    <button class="btn btn-primary btn-sm" on:click={submitOrderQuery} disabled={raisingQuery}>
                      {raisingQuery ? "Submitting..." : "Submit Query"}
                    </button>
                  </div>
                </div>
              </div>
            {/if}


            <div class="card">
              <div class="card-body pb-2">
                <div
                  class="d-flex align-items-center justify-content-between flex-wrap"
                >
                  <div class="d-flex align-items-center mb-2">
                    <div
                      class="avatar avatar-xxl avatar-rounded border border-warning bg-soft-warning me-3 flex-shrink-0"
                    >
                      <h6 class="mb-0 text-warning">
                        {getAvatarText(order?.title)}
                      </h6>
                    </div>
                    <div>
                      <h5 class="mb-1 capitalize">
                        {order?.title}
                        <i class="ti ti-star-filled text-warning"></i>
                      </h5>
                      <p class="mb-1 capitalize">
                        <i class="ti ti-layout-grid me-1"></i>{order?.category}
                      </p>
                      <p class="mb-0 capitalize">
                        <i class="ti ti-mailbox me-1"></i>{order?.source}
                      </p>
                    </div>
                  </div>
                  <div class="d-flex align-items-center flex-wrap gap-2">
                    <button
                      class="py-1 px-2 fs-12 bg-soft-danger rounded text-danger fw-medium"
                      on:click={() => togglePin(order?.id)}
                    >
                      {#if order?.pinStatus === "true"}
                        <i class="ti ti-pinned me-1"></i>Pinned
                      {:else}
                        <i class="ti ti-pin me-1"></i>Pin
                      {/if}
                    </button>
                    <div class="dropdown">
                      <a
                        href="#status"
                        class={`btn btn-xs bg-success fs-12 py-1 px-2 fw-medium d-inline-flex align-items-center text-white ${statusesColors[order?.status] || "bg-gray"}`}
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <i class="ti ti-thumb-up me-1"></i>
                        {$statusNamesStore[order?.status]?.name
                          ? $statusNamesStore[order?.status]?.name
                          : order?.status}
                        <i class="ti ti-chevron-down ms-1"></i>
                      </a>
                      <div class="dropdown-menu dropdown-menu-right">
                        {#each statuses as status}
                          <a class="dropdown-item" href={`#${status}`}
                            ><span>{status}</span></a
                          >
                        {/each}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- /Contact User -->
          </div>

          <!-- Contact Sidebar -->
          <div class="col-xl-4">
            <div class="card !sticky top-[75px]">
              <div class="card-body p-3">
                <h6 class="mb-3 fw-semibold">Order Information</h6>
                <div class="border-bottom mb-3 pb-3">
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0">Order ID</p>
                    <p class="mb-0 text-dark">
                      {order?.financialYear}/{order?.pId
                        ?.toString()
                        .padStart(6, "0")}
                    </p>
                  </div>
                  {#if order?.workOrderNumber}
                    <div
                      class="d-flex align-items-center justify-content-between mb-2"
                    >
                      <p class="mb-0">Work Order Number</p>
                      <p class="mb-0 text-dark">
                        {order?.workOrderNumber}
                      </p>
                    </div>
                  {/if}
                  {#if order?.inqCode}
                    <div
                      class="d-flex align-items-center justify-content-between mb-2"
                    >
                      <p class="mb-0">Inq. Code</p>
                      <p class="mb-0 text-dark font-mono">
                        {order?.inqCode}
                      </p>
                    </div>
                  {/if}
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0">Order Date</p>
                    <p class="mb-0 text-dark">
                      {order?.orderDate &&
                        convertDate(order?.orderDate, {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                    </p>
                  </div>
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0">Created Date</p>
                    <p class="mb-0 text-dark">
                      {order?.createdAt &&
                        convertDate(order?.createdAt, {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                    </p>
                  </div>
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0 min-w-[30%]">Price Terms</p>
                    <p class="mb-0 text-dark text-right">{order?.priceTerms}</p>
                  </div>
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0">Price</p>
                    <p class="mb-0 text-dark">
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: order?.currency || "INR",
                      })
                        .format(order?.price || 0)
                        .replace("₹", "₹ ")
                        .replace("$", "$ ")}
                    </p>
                  </div>
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0">Start Date</p>
                    <p class="mb-0 text-dark">
                      {order?.startDate &&
                        convertDate(order?.startDate, {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                    </p>
                  </div>
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0">Deadline Date</p>
                    <p class="mb-0 text-dark">
                      {order?.deadlineDate &&
                        convertDate(order?.deadlineDate, {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                    </p>
                  </div>
                  <div
                    class="d-flex align-items-center justify-content-between mb-2"
                  >
                    <p class="mb-0">Source</p>
                    <p class="mb-0 text-dark capitalize">{order?.source}</p>
                  </div>
                </div>
                <div
                  class="d-flex align-items-center justify-content-between flex-wrap"
                >
                  <h6 class="mb-3 fw-semibold">Order Owner</h6>
                  <a
                    href="#tag"
                    class="link-primary mb-3"
                    data-bs-toggle="modal"
                    data-bs-target="#create_client"
                  >
                    <i class="ti ti-plus me-1"></i>Add New
                  </a>
                </div>
                <div class="border-bottom pb-3 mb-3">
                  {#each order.orderClients as orderClient, index}
                    {#if orderClient?.deletedAt == null}
                      <div class="mb-3">
                        <div class="d-flex align-items-center justify-between">
                          <div class="d-flex align-items-center">
                            <span class="avatar avatar-xs rounded-circle me-2">
                              <img
                                src="/assets/img/profiles/user.png"
                                alt="Img"
                                class="img-fluid rounded-circle w-auto h-auto"
                              />
                            </span>
                            <div>
                              <p
                                class="mb-0 divide-x-2 space-x-1 divide-slate-300"
                              >
                                <span class="capitalize">
                                  <span>{orderClient?.name}</span>
                                  {#if orderClient?.designation}
                                    <span class="fs-10"
                                      >({orderClient?.designation})</span
                                    >
                                  {/if}
                                </span>

                                {#if visibilityMap[index]}
                                  {#if orderClient?.email}
                                    <span class="fs-12 pl-2"
                                      >{orderClient?.email}</span
                                    >
                                  {/if}
                                  {#if orderClient?.mobile}
                                    <span class="fs-12 pl-2"
                                      >{orderClient?.mobile}</span
                                    >
                                  {/if}
                                {/if}
                              </p>
                            </div>
                          </div>

                          <button
                            on:click={() => toggleVisibility(index)}
                            class="btn btn-sm"
                          >
                            {#if visibilityMap[index]}
                              <i class="ti ti-eye-off me-1"></i>
                            {:else}
                              <i class="ti ti-eye me-1"></i>
                            {/if}
                          </button>
                        </div>
                      </div>
                    {/if}
                  {/each}
                </div>

                <div
                  class="d-flex align-items-center justify-content-between flex-wrap"
                >
                  <h6 class="mb-3 fw-semibold">Assigned Users</h6>
                  <a
                    on:click={() => setAssignedUsers()}
                    href="#tag"
                    class="link-primary mb-3"
                    data-bs-toggle="modal"
                    data-bs-target="#add_contact"
                  >
                    <i class="ti ti-plus me-1"></i>Add New
                  </a>
                </div>

                {#if order.assignedUsers?.some(u => u.status === 'banned')}
                  <div class="alert alert-danger py-1 px-2 mb-2 d-flex align-items-center gap-1" style="font-size:12px;">
                    <i class="ti ti-alert-triangle"></i>
                    <span>Some assigned users are <strong>banned</strong> — consider reassigning.</span>
                  </div>
                {/if}
                {#if order.assignedUsers?.some(u => u.status === 'inactive')}
                  <div class="alert alert-warning py-1 px-2 mb-2 d-flex align-items-center gap-1" style="font-size:12px;">
                    <i class="ti ti-alert-circle"></i>
                    <span>Some assigned users are <strong>inactive</strong>.</span>
                  </div>
                {/if}
                {#each order.assignedUsers as assignedUser}
                  <div class="mb-3">
                    <div class="d-flex align-items-center">
                      <span class="avatar avatar-xs rounded-circle me-2">
                        <img
                          src="/assets/img/profiles/user.png"
                          alt="Img"
                          class="img-fluid rounded-circle w-auto h-auto"
                        />
                      </span>
                      <div class="d-flex align-items-center gap-1 flex-wrap">
                        <p class="mb-0">{assignedUser?.name}</p>
                        {#if assignedUser?.status === 'banned'}
                          <span class="badge bg-danger" style="font-size:10px;">Banned</span>
                        {:else if assignedUser?.status === 'inactive'}
                          <span class="badge bg-secondary" style="font-size:10px;">Inactive</span>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
                <div
                  class="d-flex align-items-center justify-content-between mb-2"
                >
                  <p class="mb-0">Last Modified</p>
                  <p class="mb-0 text-dark">
                    {order?.updatedAt &&
                      convertDate(order?.updatedAt, {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                  </p>
                </div>
                <div
                  class="d-flex align-items-center justify-content-between mb-0"
                >
                  <p class="mb-0">Modified By</p>
                  <div class="d-flex align-items-center">
                    <span class="avatar avatar-xs rounded-circle me-2">
                      <img
                        src="/assets/img/profiles/user.png"
                        alt="Img"
                        class="img-fluid rounded-circle w-auto h-auto"
                      />
                    </span>
                    <div>
                      <p class="mb-0">{order?.assignedUsers[0]?.name}</p>
                    </div>
                  </div>
                </div>

                {#if (order?.workOrders?.length > 0) || (order?.orderPayments?.length > 0)}
                  <div class="border-top pt-3 mt-3">
                    <h6 class="mb-3 fw-semibold">Linked Documents</h6>

                    {#if order?.workOrders?.length > 0}
                      <p class="mb-1 text-muted fs-12 fw-semibold">Work Orders</p>
                      {#each order.workOrders as wo}
                        <div class="mb-1">
                          <a
                            href="/admin/workorder/{wo.id}"
                            class="text-primary fs-12 d-inline-flex align-items-center gap-1"
                          >
                            <i class="ti ti-file-description"></i>
                            WO {wo.financialYear}/{String(wo.workOrderNo).padStart(6, "0")}
                          </a>
                        </div>
                      {/each}
                    {/if}

                    {#if order?.orderPayments?.length > 0}
                      <p class="mb-1 mt-2 text-muted fs-12 fw-semibold">Proforma Invoices</p>
                      {#each order.orderPayments as pi}
                        <div class="mb-1">
                          <a
                            href="/admin/invoice/{pi.id}"
                            class="text-primary fs-12 d-inline-flex align-items-center gap-1"
                          >
                            <i class="ti ti-receipt"></i>
                            PI {pi.financialYear}/{String(pi.invoiceNo).padStart(6, "0")}
                          </a>
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}

              </div>
            </div>
          </div>
          <!-- /Contact Sidebar -->

          <!-- Contact Details -->
          <div class="col-xl-8">
            <!-- <div class="mb-3 pb-3 border-bottom">
            <h5 class="mb-3">Order Pipeline Status</h5>
            <div class="step-progress d-flex flex-wrap gap-2">
              {#each statuses as status}
                <div class={`step bg-indigo ${statusesColors[status] || "bg-gray"}`}>{status}</div>
              {/each}
            </div>
          </div> -->
            <div class="card mb-3">
              <div class="card-body pb-0 pt-2 px-2">
                <ul class="nav nav-tabs nav-bordered border-0 mb-0">
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_1"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link active border-3"
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
                      aria-expanded="true"
                      class="nav-link border-3"
                      class:active={activeTab === "Files"}
                      on:click|preventDefault={() => (activeTab = "Files")}
                      aria-selected={activeTab === "Files"}
                      role="tab"
                      tabindex="-1"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-file me-1"></i>Files
                      </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_3"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Chats"}
                      on:click|preventDefault={() => (activeTab = "Chats")}
                      aria-selected={activeTab === "Chats"}
                      tabindex="-1"
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-brand-hipchat me-1"></i>Chats
                      </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_5"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Email"}
                      on:click|preventDefault={() => (activeTab = "Email")}
                      aria-selected={activeTab === "Email"}
                      tabindex="-1"
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-mail-check me-1"></i>Email
                      </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_6"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Client"}
                      on:click|preventDefault={() => (activeTab = "Client")}
                      aria-selected={activeTab === "Client"}
                      tabindex="-1"
                      role="tab"
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
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Reminders"}
                      on:click|preventDefault={() => (activeTab = "Reminders")}
                      aria-selected={activeTab === "Reminders"}
                      tabindex="-1"
                      role="tab"
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
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Queries"}
                      on:click|preventDefault={() => { activeTab = "Queries"; loadOrderQueries(); }}
                      aria-selected={activeTab === "Queries"}
                      tabindex="-1"
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-help-circle me-1"></i>Queries
                        {#if currentUser?.subRole === "tech"}
                          {@const myCount = orderQueries.filter(q => q.assignedTo?.id === currentUser?.id).length}
                          {#if myCount > 0}
                            <span class="badge bg-success ms-1" style="font-size:10px;">{myCount}</span>
                          {/if}
                        {:else if orderQueries.length > 0}
                          <span class="badge bg-primary ms-1" style="font-size:10px;">{orderQueries.length}</span>
                        {/if}
                      </span>
                    </a>
                  </li>
                  {#if ["Deal Won", "Dispatched", "Completed"].includes(order?.status)}
                    <li class="nav-item" role="presentation">
                      <a
                        href="#tab_8"
                        data-bs-toggle="tab"
                        aria-expanded="false"
                        class="nav-link border-3"
                        class:active={activeTab === "Components"}
                        on:click|preventDefault={() =>
                          (activeTab = "Components")}
                        aria-selected={activeTab === "Components"}
                        tabindex="-1"
                        role="tab"
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
                        aria-expanded="false"
                        class="nav-link border-3"
                        class:active={activeTab === "Installation"}
                        on:click|preventDefault={() =>
                          (activeTab = "Installation")}
                        aria-selected={activeTab === "Installation"}
                        tabindex="-1"
                        role="tab"
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

            <!-- Tab Content -->
            <div class="tab-content pt-0">
              {#if activeTab === "Activity"}
                <!-- Activities -->
                <div class="tab-pane active show" id="tab_1">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Activities</h5>
                    </div>
                    <div class="card-body">
                      {#if order?.groupedActivities?.length}
                        {#each order?.groupedActivities as dateActivity}
                          <button
                            on:click={() => toggleAccordion(dateActivity?.date)}
                            class="flex items-center justify-between gap-2 mb-3 w-full border-bottom pb-2"
                          >
                            <div class="badge badge-soft-info border-0">
                              <i class="ti ti-calendar-check me-1"></i>
                              {dateActivity?.date &&
                                convertDate(dateActivity?.date, {
                                  timeZone: "Asia/Kolkata",
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                            </div>
                            <div>
                              <i
                                class={`ti ${activeDate === dateActivity?.date ? "ti-chevron-up" : "ti-chevron-down"}`}
                              >
                              </i>
                            </div>
                          </button>

                          {#if activeDate === dateActivity?.date}
                            {#each dateActivity?.activities as activity}
                              <div class="card border shadow-none mb-3">
                                <div class="card-body p-3">
                                  <div
                                    class="d-flex align-items-center flex-lg-nowrap flex-wrap row-gap-2"
                                  >
                                    {#if activity.title == "Order Created"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-green-500 text-green-600"
                                      >
                                        <i class="ti ti-plus fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Updated"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-blue-500 text-blue-600"
                                      >
                                        <i class="ti ti-edit fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Status Changed"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-gray-500 text-gray-600"
                                      >
                                        <i class="ti ti-arrows-shuffle fs-20"
                                        ></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-red-500 text-red-600"
                                      >
                                        <i class="ti ti-trash fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Chat Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-cyan-500 text-cyan-600"
                                      >
                                        <i class="ti ti-mail-code fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Chat Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-cyan-500 text-cyan-600"
                                      >
                                        <i class="ti ti-message-off fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Attachment Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-indigo-500 text-indigo-600"
                                      >
                                        <i class="ti ti-paperclip fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Attachment Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-indigo-500 text-indigo-600"
                                      >
                                        <i class="ti ti-link-off fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Client Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-purple-500 text-purple-600"
                                      >
                                        <i class="ti ti-user-plus fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Client Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-red-500 text-red-600"
                                      >
                                        <i class="ti ti-user-cancel fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Assigned to User"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600"
                                      >
                                        <i class="ti ti-user-pin fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Payment Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-green-500 text-green-600"
                                      >
                                        <i class="ti ti-credit-card fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Reminder Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600"
                                      >
                                        <i class="ti ti-alarm-snooze fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Reminder Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600"
                                      >
                                        <i class="ti ti-alarm-off fs-20"></i>
                                      </span>
                                    {/if}
                                    <div>
                                      <h6 class="fw-medium fs-14 mb-1">
                                        {activity?.description}
                                      </h6>
                                      {#if activity.title == "Order Chat Added"}
                                        <p class="mb-1">
                                          {activity?.data?.message}
                                        </p>
                                      {/if}
                                      {#if activity.title == "Order Attachment Added"}
                                        <p class="mb-1">
                                          {#await Promise.resolve() then _}
                                            {(() => {
                                              let description = "";
                                              const data = activity.data;
                                              const files = data?.files || [];
                                              if (data?.title) {
                                                description += ` Title: "${data.title}".`;
                                              }
                                              if (files.length) {
                                                description += ` File Names:`;
                                                files.forEach((file, i) => {
                                                  if (file?.originalName) {
                                                    description += ` "${file.originalName}"${i < files.length - 1 ? "," : "."}`;
                                                  }
                                                });
                                              }
                                              if (data?.link) {
                                                description += ` Link: ${data.link}.`;
                                              }
                                              return description;
                                            })()}
                                          {/await}
                                        </p>
                                      {/if}
                                      {#if activity.title == "Order Reminder Added"}
                                        <p class="mb-1">
                                          {#await Promise.resolve() then _}
                                            {(() => {
                                              let description = "";
                                              const data = activity.data;
                                              if (data?.reminderTime) {
                                                const date = new Date(
                                                  data.reminderTime,
                                                );
                                                const formattedTime =
                                                  date.toLocaleString("en-IN", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true,
                                                  });
                                                description += `Reminder Time: ${formattedTime}. `;
                                              }
                                              if (data?.message) {
                                                description += ` Message: ${data.message}.`;
                                              }
                                              return description;
                                            })()}
                                          {/await}
                                        </p>
                                      {/if}
                                      <p class="mb-0">
                                        {newDateFormate(activity?.createdAt, {
                                          timeZone: "Asia/Kolkata",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            {/each}
                          {/if}
                        {/each}
                      {:else}
                        <div>No activities found.</div>
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Activities -->
              {/if}

              {#if activeTab === "Files"}
                <!-- Files -->
                <div class="tab-pane active show" id="tab_2">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Files</h5>

                      <div class="d-inline-flex align-items-center">
                        <button
                          href="#new_file"
                          data-bs-toggle="modal"
                          data-bs-target="#new_file"
                          class="link-primary fw-medium"
                          ><i class="ti ti-circle-plus me-1"></i>Add New</button
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      <div class="notes-activity">
                        {#if order?.orderAttachments.length}
                          {#each order.orderAttachments as attachment}
                            <div class="card mb-3 relative">
                              {#if attachment?.deletedAt}
                                <div class="ribbon ribbon-top-left">
                                  <span class="bg-red-500">Deleted</span>
                                </div>
                              {/if}
                              <div class="card-body">
                                {#if !attachment?.deletedAt}
                                  <div class="absolute top-5 right-5">
                                    <button
                                      on:click={deleteAttachment(
                                        attachment?.id,
                                      )}
                                      class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                    >
                                      <i class="ti ti-trash"></i>
                                    </button>
                                  </div>
                                {/if}
                                <div
                                  class="d-flex align-items-center justify-content-between flex-wrap row-gap-2 pb-2"
                                >
                                  <div
                                    class="d-inline-flex align-items-center mb-2"
                                  >
                                    <span
                                      class="avatar avatar-md me-2 flex-shrink-0"
                                    >
                                      <img
                                        src="/assets/img/profiles/user.png"
                                        alt="img"
                                      />
                                    </span>
                                    <div>
                                      <h6 class="fw-medium fs-14 mb-1">
                                        {attachment?.user?.name}
                                      </h6>
                                      <p class="mb-0 fs-13">
                                        {attachment?.createdAt &&
                                          convertDate(attachment?.createdAt, {
                                            timeZone: "Asia/Kolkata",
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                {#if attachment?.title}
                                  <h5 class="fw-medium fs-14 mb-1">
                                    {attachment?.title}
                                  </h5>
                                {/if}
                                {#if attachment?.link}
                                  <p class="mb-0">
                                    Attachment Link :
                                    <a href={attachment?.link} target="_blank">
                                      {attachment?.link}
                                    </a>
                                  </p>
                                {/if}
                                {#if attachment?.file}
                                  {@const fi = fileIcon(null, attachment?.fileName ?? attachment?.file)}
                                  <div
                                    class="row"
                                    class:mt-3={attachment?.title || attachment?.link}
                                  >
                                    <div class="col-xxl-4 col-lg-5">
                                      <div
                                        class="card mb-0"
                                        role="button"
                                        tabindex="0"
                                        aria-label="Open attachment"
                                        on:click={() => openAttachment(ATTACHMENT_BASE_URL + attachment?.file, null, attachment?.fileName)}
                                        on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") openAttachment(ATTACHMENT_BASE_URL + attachment?.file, null, attachment?.fileName); }}
                                        style="cursor:pointer;"
                                      >
                                        <div class="card-body p-2">
                                          <div class="d-flex align-items-center justify-content-between flex-wrap row-gap-3">
                                            <div class="d-flex align-items-center me-3">
                                              <span class="avatar {fi.bg} me-2">
                                                <i class="ti {fi.icon} fs-20"></i>
                                              </span>
                                              <div>
                                                <h6 class="fw-medium fs-14 mb-1 trank" title={attachment?.fileName}>
                                                  {shortenFileName(attachment?.fileName)}
                                                </h6>
                                              </div>
                                            </div>
                                            <button
                                              on:click|stopPropagation={() => openAttachment(ATTACHMENT_BASE_URL + attachment?.file, null, attachment?.fileName)}
                                              class="avatar avatar-xs rounded-circle bg-light text-dark"
                                              title="Open"
                                            >
                                              <i class="ti ti-external-link"></i>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                {/if}
                                {#if attachment?.files}
                                  {@const attachImgUrls = attachment.files
                                    .filter(f => f?.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f?.originalName ?? ""))
                                    .map(f => ATTACHMENT_BASE_URL + f.url)}
                                  <div
                                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                                    class:mt-3={attachment?.title || attachment?.link}
                                  >
                                    {#each attachment?.files as file}
                                      {@const fi = fileIcon(file?.mimeType, file?.originalName)}
                                      {@const isImg = file?.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file?.originalName ?? "")}
                                      {@const imgIdx = attachImgUrls.indexOf(ATTACHMENT_BASE_URL + file?.url)}
                                      <div
                                        class="card mb-0"
                                        role="button"
                                        tabindex="0"
                                        aria-label="Open attachment"
                                        on:click={() => isImg ? openImageLightbox(attachImgUrls, imgIdx) : openAttachment(ATTACHMENT_BASE_URL + file?.url, file?.mimeType, file?.originalName)}
                                        on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") isImg ? openImageLightbox(attachImgUrls, imgIdx) : openAttachment(ATTACHMENT_BASE_URL + file?.url, file?.mimeType, file?.originalName); }}
                                        style="cursor:pointer;"
                                      >
                                        <div class="card-body p-2">
                                          <div class="d-flex align-items-center justify-content-between flex-wrap row-gap-3">
                                            <div class="d-flex align-items-center me-3">
                                              {#if isImg}
                                                <span class="avatar border me-2">
                                                  <img src={ATTACHMENT_BASE_URL + file?.url} alt={file?.originalName} class="object-contain" />
                                                </span>
                                              {:else}
                                                <span class="avatar {fi.bg} me-2">
                                                  <i class="ti {fi.icon} fs-20"></i>
                                                </span>
                                              {/if}
                                              <div>
                                                <h6 class="fw-medium lg:fs-14 fs-12 mb-1 trank" title={file?.originalName}>
                                                  {shortenFileName(file?.originalName)}
                                                </h6>
                                                <p class="mb-0 fs-12 md:fs-10">
                                                  {(file.size / 1024).toFixed(2)} KB
                                                </p>
                                              </div>
                                            </div>
                                            <button
                                              on:click|stopPropagation={() => isImg ? openImageLightbox(attachImgUrls, imgIdx) : openAttachment(ATTACHMENT_BASE_URL + file?.url, file?.mimeType, file?.originalName)}
                                              class="avatar avatar-xs rounded-circle bg-light text-dark"
                                              title="Open"
                                            >
                                              <i class="ti ti-external-link"></i>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    {/each}
                                  </div>
                                {/if}
                              </div>
                            </div>
                          {/each}
                        {:else}
                          <div>No attachments found.</div>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
                <!-- /Notes -->
              {/if}

              {#if activeTab === "Chats"}
                <!-- Chats -->
                <div class="tab-pane active show" id="tab_3">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Chats</h5>
                      <div class="d-inline-flex align-items-center">
                        <a
                          href="#create_call"
                          data-bs-toggle="modal"
                          data-bs-target="#create_call"
                          class="link-primary fw-medium"
                          ><i class="ti ti-circle-plus me-1"></i>Add New</a
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      {#if order?.orderChats.length}
                        {#each order.orderChats as chat}
                          <div class="card mb-3 relative">
                            {#if chat?.deletedAt}
                              <div class="ribbon ribbon-top-left">
                                <span class="bg-red-500">Deleted</span>
                              </div>
                            {/if}
                            <div class="card-body">
                              {#if !chat?.deletedAt}
                                <div class="absolute top-5 right-5">
                                  <button
                                    on:click={deleteChat(chat?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button>
                                </div>
                              {/if}
                              <div
                                class="d-sm-flex align-items-center justify-content-between pb-2"
                              >
                                <div class="d-flex align-items-center mb-2">
                                  <span
                                    class="avatar avatar-md me-2 flex-shrink-0"
                                  >
                                    <img
                                      src="/assets/img/profiles/user.png"
                                      alt="img"
                                    />
                                  </span>
                                  <p class="mb-0">
                                    <span class="text-dark fw-medium">{chat?.user?.name}</span>
                                    {#if chat?.user?.status === 'banned'}
                                      <span class="badge bg-danger ms-1" style="font-size:10px;">Banned</span>
                                    {:else if chat?.user?.status === 'inactive'}
                                      <span class="badge bg-secondary ms-1" style="font-size:10px;">Inactive</span>
                                    {/if}
                                    ........ on
                                    {chat?.createdAt &&
                                      convertDate(chat?.createdAt, {
                                        timeZone: "Asia/Kolkata",
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                  </p>
                                </div>
                                <div
                                  class="d-inline-flex align-items-center mb-2"
                                >
                                  <!-- <div class="dropdown me-2">
                                  <a
                                    href="#dropdown"
                                    class="btn btn-sm btn-outline-light"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false"
                                    >Busy<i class="ti ti-chevron-down ms-2"
                                    ></i></a
                                  >
                                  <div
                                    class="dropdown-menu dropdown-menu-right"
                                  >
                                    <a class="dropdown-item" href="#busy"
                                      >Busy</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >No Answer</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Unavailable</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Wrong Number</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Left Voice Message</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Moving Forward</a
                                    >
                                  </div>
                                </div>
                                <div class="dropdown">
                                  <a
                                    href="#dropdown"
                                    class="action-icon btn btn-icon btn-sm btn-outline-light shadow"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false"
                                    ><i class="ti ti-dots-vertical"></i></a
                                  >
                                  <div
                                    class="dropdown-menu dropdown-menu-right"
                                  >
                                    <a
                                      class="dropdown-item"
                                      href="#tag"
                                      data-bs-toggle="modal"
                                      data-bs-target="#edit_call"
                                      ><i class="ti ti-edit me-1"></i>Edit</a
                                    >
                                    <a
                                      class="dropdown-item"
                                      href="#tag"
                                      data-bs-toggle="modal"
                                      data-bs-target="#delete_call"
                                      ><i class="ti ti-trash me-1"></i>Delete</a
                                    >
                                  </div>
                                </div> -->
                                </div>
                              </div>
                              <p class="mb-0">
                                {chat?.message}
                              </p>
                            </div>
                          </div>
                        {/each}
                      {:else}
                        <div>No chats found.</div>
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Chats -->
              {/if}

              {#if activeTab === "Email"}
                <!-- Email -->
                <div class="tab-pane active show" id="tab_5">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="mb-1">Email</h5>
                      <div class="d-inline-flex align-items-center">
                        <a
                          href="#tag"
                          class="link-primary fw-medium"
                          data-bs-toggle="tooltip"
                          data-bs-placement="left"
                          data-bs-custom-class="tooltip-dark"
                          data-bs-original-title="There are no email accounts configured, Please configured your email account in order to Send/ Create EMails"
                          ><i class="ti ti-circle-plus me-1"></i>Create Email</a
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      <div class="card border mb-0">
                        <div class="card-body pb-0">
                          <div class="row align-items-center">
                            <div class="col-md-8">
                              <div class="mb-3">
                                <h6 class="mb-1">Manage Emails</h6>
                                <p>
                                  You can send and reply to emails directly via
                                  this section.
                                </p>
                              </div>
                            </div>
                            <div class="col-md-4 text-md-end">
                              <div class="mb-3">
                                <a href="#create_email" class="btn btn-primary"
                                  >Connect Account</a
                                >
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- /Email -->
              {/if}

              {#if activeTab === "Client"}
                <!-- Client -->
                <div class="tab-pane active show" id="tab_3">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Clients</h5>
                      <div class="d-inline-flex align-items-center">
                        <a
                          href="#create_call"
                          data-bs-toggle="modal"
                          data-bs-target="#create_client"
                          class="link-primary fw-medium"
                          ><i class="ti ti-circle-plus me-1"></i>Add New</a
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      {#if order?.orderClients.length}
                        {#each order.orderClients as orderClient}
                          <div class="card mb-3 relative">
                            {#if orderClient?.deletedAt}
                              <div class="ribbon ribbon-top-left">
                                <span class="bg-red-500">Deleted</span>
                              </div>
                            {/if}
                            <div class="card-body">
                              {#if !orderClient?.deletedAt}
                                <div class="absolute top-5 right-5">
                                  <button
                                    on:click={deleteClient(orderClient?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button>
                                </div>
                              {/if}
                              <div
                                class="d-sm-flex align-items-center justify-content-between"
                              >
                                <div>
                                  {#if orderClient?.name}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-user fs-14"></i>
                                      </span>
                                      <p class="mb-0 capitalize">
                                        {orderClient?.name}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.designation}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-id fs-14"></i>
                                      </span>
                                      <p class="mb-0 capitalize">
                                        {orderClient?.designation}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.email}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-mail fs-14"></i>
                                      </span>
                                      <p class="mb-0">
                                        <a href="mailto:{orderClient?.email}"
                                          >{orderClient?.email}</a
                                        >
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.mobile}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-phone fs-14"></i>
                                      </span>
                                      <p class="mb-0">
                                        {orderClient?.mobile}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.alternateMobile}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-device-mobile fs-14"
                                        ></i>
                                      </span>
                                      <p class="mb-0">
                                        {orderClient?.alternateMobile}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.whatsapp}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-brand-whatsapp fs-14"
                                        ></i>
                                      </span>
                                      <p class="mb-0">
                                        {orderClient?.whatsapp}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.address}
                                    <div class="d-flex align-items-center">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-location-pin fs-14"></i>
                                      </span>
                                      <p class="mb-0 capitalize">
                                        {orderClient?.address}
                                      </p>
                                    </div>
                                  {/if}
                                </div>
                              </div>
                            </div>
                          </div>
                        {/each}
                      {:else}
                        <div>No clients found.</div>
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Client -->
              {/if}

              {#if activeTab === "Reminders"}
                <!-- Reminders -->
                <div class="tab-pane active show" id="tab_7">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Reminders</h5>
                      <div class="d-inline-flex align-items-center">
                        <a
                          href="#create_reminder"
                          data-bs-toggle="modal"
                          data-bs-target="#create_reminder"
                          class="link-primary fw-medium"
                          ><i class="ti ti-circle-plus me-1"></i>Add New</a
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      {#if order?.orderReminders?.length}
                        {#each order.orderReminders as reminder}
                          <div class="card mb-3 relative">
                            {#if reminder?.deletedAt}
                              <div class="ribbon ribbon-top-left">
                                <span class="bg-red-500">Deleted</span>
                              </div>
                            {/if}
                            <div class="card-body">
                              {#if !reminder?.deletedAt}
                                <div class="absolute top-5 right-5">
                                  <button
                                    on:click={deleteReminder(reminder?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button>
                                </div>
                              {/if}
                              <div
                                class="d-sm-flex align-items-center justify-content-between pb-2"
                              >
                                <div class="d-flex align-items-center mb-2">
                                  <span
                                    class="avatar avatar-md me-2 flex-shrink-0"
                                  >
                                    <img
                                      src="/assets/img/profiles/user.png"
                                      alt="img"
                                    />
                                  </span>

                                  <div>
                                    <h6 class="fw-medium fs-14 mb-1">
                                      {reminder?.user?.name}
                                    </h6>
                                    <p class="mb-0 fs-13">
                                      {reminder?.createdAt &&
                                        convertDate(reminder?.createdAt, {
                                          timeZone: "Asia/Kolkata",
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                        })}
                                    </p>
                                  </div>
                                </div>
                                <div
                                  class="d-inline-flex align-items-center mb-2"
                                ></div>
                              </div>
                              {#if reminder?.reminderTime}
                                <p class="mb-0">
                                  Reminder Time :
                                  <span class="text-black">
                                    {reminder?.reminderTime &&
                                      convertDate(reminder?.reminderTime, {
                                        timeZone: "Asia/Kolkata",
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                  </span>
                                </p>
                              {/if}
                              {#if reminder?.message}
                                <p class="mb-0">
                                  {reminder?.message}
                                </p>
                              {/if}
                            </div>
                          </div>
                        {/each}
                      {:else}
                        <div>No reminders found.</div>
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Chats -->
              {/if}
              {#if activeTab === "Queries"}
                <!-- Queries Tab -->
                <div class="tab-pane active show" id="tab_10">
                  <div class="card">
                    <div class="card-header d-flex align-items-center justify-content-between py-2">
                      <h5 class="fw-semibold mb-0">
                        <i class="ti ti-help-circle me-1 text-primary"></i>
                        {#if currentUser?.subRole === "tech"}
                          My Assigned Queries
                        {:else}
                          Related Queries
                        {/if}
                      </h5>
                      {#if currentUser?.subRole === "telecaller" || (currentUser?.role === "user" && !currentUser?.subRole)}
                        <button class="btn btn-sm btn-outline-warning" on:click={() => (showQueryModal = true)}>
                          <i class="ti ti-plus me-1"></i>Raise Query
                        </button>
                      {/if}
                    </div>
                    <div class="card-body p-0">
                      {#if orderQueriesLoading}
                        <div class="text-center py-4">
                          <span class="spinner-border spinner-border-sm text-primary"></span>
                        </div>
                      {:else}
                        {@const visibleQueries = currentUser?.subRole === "tech"
                          ? orderQueries.filter(q => q.assignedTo?.id === currentUser?.id)
                          : currentUser?.subRole === "telecaller"
                            ? orderQueries.filter(q => q.raisedBy?.id === currentUser?.id)
                            : orderQueries}
                        {#if visibleQueries.length === 0}
                          <div class="text-center py-4 text-muted small">
                            {#if currentUser?.subRole === "tech"}
                              <i class="ti ti-help-off me-1"></i>No queries assigned to you for this order.
                            {:else if currentUser?.subRole === "telecaller"}
                              <i class="ti ti-help-off me-1"></i>You haven't raised any queries for this order yet.
                            {:else}
                              <i class="ti ti-help-off me-1"></i>No queries raised for this order yet.
                            {/if}
                          </div>
                        {:else}
                          <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0 small">
                              <thead class="table-light">
                                <tr>
                                  <th>Subject</th>
                                  {#if currentUser?.subRole === "tech"}
                                    <th>Raised By</th>
                                  {:else if currentUser?.subRole === "telecaller"}
                                    <th>Assigned To</th>
                                  {:else}
                                    <th>Raised By</th>
                                    <th>Assigned To</th>
                                  {/if}
                                  <th>Status</th>
                                  <th>Date</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {#each visibleQueries as q}
                                  <tr>
                                    <td class="fw-semibold">{q.subject}</td>
                                    {#if currentUser?.subRole === "tech"}
                                      <td>{q.raisedBy?.name ?? "-"}</td>
                                    {:else if currentUser?.subRole === "telecaller"}
                                      <td>
                                        {#if q.assignedTo}
                                          <span class="badge bg-success-subtle text-success-emphasis">{q.assignedTo.name}</span>
                                        {:else}
                                          <span class="text-muted">Unassigned</span>
                                        {/if}
                                      </td>
                                    {:else}
                                      <td>
                                        {#if q.raisedBy}
                                          {#if q.raisedBy.name === "Telecaller"}
                                            <span class="text-muted small"><i class="ti ti-lock me-1"></i>Hidden</span>
                                          {:else}
                                            <div class="d-flex align-items-center gap-1">
                                              <span>{q.raisedBy.name}</span>
                                              <span class="badge bg-warning-subtle text-warning-emphasis" style="font-size:10px;">Telecaller</span>
                                            </div>
                                          {/if}
                                        {:else}-{/if}
                                      </td>
                                      <td>
                                        {#if q.assignedTo}
                                          {#if q.assignedTo.name === "Tech"}
                                            <span class="text-muted small"><i class="ti ti-lock me-1"></i>Hidden</span>
                                          {:else}
                                            <div class="d-flex align-items-center gap-1">
                                              <span>{q.assignedTo.name}</span>
                                              <span class="badge bg-success-subtle text-success-emphasis" style="font-size:10px;">Tech</span>
                                            </div>
                                          {/if}
                                        {:else}<span class="text-muted">Unassigned</span>{/if}
                                      </td>
                                    {/if}
                                    <td>
                                      <span class="badge {q.status === 'open' ? 'bg-primary' : q.status === 'in_progress' ? 'bg-warning text-dark' : q.status === 'resolved' ? 'bg-success' : q.status === 'reopened' ? 'bg-danger' : 'bg-secondary'}">
                                        {q.status?.replace("_", " ")}
                                      </span>
                                    </td>
                                    <td class="text-muted">
                                      {new Date(q.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    </td>
                                    <td>
                                      <a href="/admin/query/{q.id}" class="btn btn-sm btn-outline-primary">
                                        <i class="ti ti-eye"></i>
                                      </a>
                                    </td>
                                  </tr>
                                {/each}
                              </tbody>
                            </table>
                          </div>
                        {/if}
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Queries Tab -->
              {/if}
              {#if ["Deal Won", "Dispatched", "Completed"].includes(order?.status)}
                {#if activeTab === "Components"}
                  <!-- Components -->
                  <div class="tab-pane active show" id="tab_8">
                    <div class="card">
                      <div
                        class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                      >
                        <h5 class="fw-semibold mb-0">Multiple Orders</h5>
                        <div class="d-inline-flex align-items-center">
                          {#if order.status === "Deal Won"}
                            <button
                              on:click={() => cerateChildOrder()}
                              disabled={order.status === "Deal Won"}
                              class="link-primary fw-medium flex items-center"
                              ><i class="ti ti-circle-plus me-1"></i>Create New</button
                            >
                          {/if}
                        </div>
                      </div>
                      <div class="card-body">
                        {#if order?.childOrders?.length}
                          {#each order.childOrders as component}
                            <div class="card mb-3 relative">
                              {#if component?.deletedAt}
                                <div class="ribbon ribbon-top-left">
                                  <span class="bg-red-500">Deleted</span>
                                </div>
                              {/if}
                              <div class="card-body">
                                <div class="absolute top-5 right-14">
                                  <!-- <button
                                    on:click={editComponent(component?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button> -->
                                  <a
                                    href="#edit_component"
                                    data-bs-toggle="modal"
                                    data-bs-target="#edit_component"
                                    on:click={() => editChildOrder(component)}
                                    class="bg-secondary text-white text-md px-1.5 py-1.5 rounded"
                                  >
                                    <i class="ti ti-pencil"></i>
                                  </a>
                                </div>
                                {#if !component?.deletedAt}
                                  <div class="absolute top-4 right-5">
                                    <button
                                      on:click={deleteComponent(component?.id)}
                                      class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                    >
                                      <i class="ti ti-trash"></i>
                                    </button>
                                  </div>
                                {/if}
                                <div
                                  class="d-sm-flex align-items-center justify-content-between"
                                >
                                  <div class="d-flex align-items-center">
                                    <div
                                      class="avatar avatar-lg avatar-rounded border border-warning bg-soft-warning me-1 flex-shrink-0"
                                    >
                                      <h6 class="mb-0 text-warning">
                                        {getAvatarText(component?.title)}
                                      </h6>
                                    </div>

                                    <div>
                                      <h6 class="fw-medium fs-14 mb-1">
                                        {component?.title} ({component?.workOrderNumber})
                                      </h6>
                                      <p class="mb-0 fs-13">
                                        {component?.createdAt &&
                                          convertDate(component?.createdAt, {
                                            timeZone: "Asia/Kolkata",
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          {/each}
                        {:else}
                          <div>No components found.</div>
                        {/if}
                      </div>
                    </div>
                  </div>
                  <!-- /Components -->
                {/if}
              {/if}
              {#if ["Dispatched", "Completed"].includes(order?.status)}
                {#if activeTab === "Installation"}
                  <DispatchProcess {order} />
                {/if}
              {/if}
            </div>
            <!-- /Tab Content -->
          </div>
          <!-- /Contact Details -->
        </div>
      {:else}
        <div class="row">
          <div class="col-md-12">No order details found.</div>
        </div>
      {/if}
    {:else}
      <div class="row">
        <div class="col-md-12">Loading order details...</div>
      </div>
    {/if}
    <!-- Start Footer -->
  </div>
  <!-- End Content -->
</div>

<!-- Add Canvas -->
<div
  class="offcanvas offcanvas-end offcanvas-large"
  tabindex="-1"
  id="offcanvas_add"
>
  <div class="offcanvas-header border-bottom">
    <h5 class="mb-0">Update Order</h5>
    <button
      type="button"
      class="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
      data-bs-dismiss="offcanvas"
      aria-label="Close"
    >
    </button>
  </div>
  <div class="offcanvas-body">
    <form
      on:submit={handleSubmit}
      class="needs-validation space-y-4"
      novalidate
    >
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="form-label" for="title">
            Title <span class="text-danger">*</span>
          </label>
          <input
            type="text"
            name="title"
            class="form-control"
            class:is-invalid={formErrors.title}
            bind:value={title}
            required
            id="title"
            placeholder="Title"
          />
          {#if formErrors.title}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.title[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="category">Category</label>
          {#key categories.length}
            <TypeableSelect
              id="category"
              options={categories}
              grouped={true}
              value={category != "" ? category : null}
              placeholder="Select Category"
              on:change={(e) => (category = e.detail)}
            />
          {/key}
          <!-- <input
            type="text"
            name="category"
            class="form-control"
            class:is-invalid={formErrors.category}
            bind:value={category}
            id="category"
            placeholder="Category"
          /> -->
          {#if formErrors.category}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.category[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="workOrderNumber"
            >Work Order Number</label
          >
          <input
            type="text"
            name="workOrderNumber"
            class="form-control"
            class:is-invalid={formErrors.workOrderNumber}
            bind:value={workOrderNumber}
            id="workOrderNumber"
            placeholder="Work Order Number"
          />
          {#if formErrors.workOrderNumber}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.workOrderNumber[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="orderDate">Order Date</label>
          <input
            type="date"
            name="orderDate"
            class="form-control"
            class:is-invalid={formErrors.orderDate}
            bind:value={orderDate}
            id="orderDate"
            placeholder="Order Date"
          />
          {#if formErrors.orderDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.orderDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="startDate">Start Date</label>
          <input
            type="date"
            name="startDate"
            class="form-control"
            class:is-invalid={formErrors.startDate}
            bind:value={startDate}
            id="startDate"
            placeholder="Start Date"
          />
          {#if formErrors.startDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.startDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="deadlineDate">Deadline Date</label>
          <input
            type="date"
            name="deadlineDate"
            class="form-control"
            class:is-invalid={formErrors.deadlineDate}
            bind:value={deadlineDate}
            id="deadlineDate"
            placeholder="Deadline Date"
          />
          {#if formErrors.deadlineDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.deadlineDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="price">Price</label>
          <!-- <input
            type="number"
            name="price"
            class="form-control"
            class:is-invalid={formErrors.price}
            bind:value={price}
            id="price"
            placeholder="Price"
          /> -->
          <div
            class="!flex items-center rounded-md bg-white !p-0 !pl-3 outline-1 -outline-offset-1 outline-gray-300 has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-indigo-600 form-control"
            class:is-invalid={formErrors.price}
            class:border={!formErrors.price}
          >
            <div
              class="shrink-0 text-base text-gray-500 select-none sm:text-sm/6"
            >
              {currencies.find((c) => c.code === currency)?.symbol}
            </div>
            <input
              id="price"
              type="number"
              name="price"
              bind:value={price}
              placeholder="0.00"
              class="block min-w-0 grow py-1.5 pr-3 pl-1 text-base placeholder:text-gray-400 focus:outline-none sm:text-sm/6"
            />
            <div class="grid shrink-0 grid-cols-1 focus-within:relative">
              <select
                id="currency"
                name="currency"
                bind:value={currency}
                aria-label="Currency"
                class="col-start-1 row-start-1 w-full border-l appearance-none rounded-md rounded-l-[0px] py-1.5 pr-7 pl-3 text-base text-gray-500 placeholder:text-gray-400 focus:outline-0 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              >
                {#each currencies as currency}
                  <option value={currency.code}>{currency.code}</option>
                {/each}
              </select>
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                data-slot="icon"
                aria-hidden="true"
                class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
              >
                <path
                  d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                  clip-rule="evenodd"
                  fill-rule="evenodd"
                />
              </svg>
            </div>
          </div>
          {#if formErrors.price}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.price[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="priceTerms">Price Terms</label>
          <input
            type="text"
            name="priceTerms"
            class="form-control"
            class:is-invalid={formErrors.priceTerms}
            bind:value={priceTerms}
            id="priceTerms"
            placeholder="Price Terms"
          />
          {#if formErrors.priceTerms}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.priceTerms[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="source">Source</label>
          <TypeableSelect
            id="source"
            options={sources}
            value={source}
            placeholder="Select Source"
            on:change={(e) => (source = e.detail)}
          />
          {#if formErrors.source}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.source[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="company">Company</label>
          <input
            type="text"
            name="company"
            class="form-control"
            class:is-invalid={formErrors.company}
            bind:value={company}
            id="company"
            placeholder="Company"
          />
          {#if formErrors.company}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.company[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="gstNumber">GST Number</label>
          <input
            type="text"
            name="gstNumber"
            class="form-control"
            class:is-invalid={formErrors.gstNumber}
            bind:value={gstNumber}
            id="gstNumber"
            placeholder="GST Number"
          />
          {#if formErrors.gstNumber}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.gstNumber[0]}</li>
            </ul>
          {/if}
        </div>
      </div>
      <div class="col-span-2">
        <label class="form-label" for="description"> Description </label>
        <textarea
          name="description"
          id="description"
          class="form-control"
          class:is-invalid={formErrors.description}
          bind:value={description}
          required
          placeholder="Description"
        ></textarea>

        {#if formErrors.description}
          <ul class="text-danger mt-1 text-xs capitalize">
            <li>{formErrors.description[0]}</li>
          </ul>
        {/if}
      </div>
      <div class="d-flex align-items-center justify-content-end mt-4">
        <button
          type="button"
          data-bs-dismiss="offcanvas"
          class="btn btn-light me-2">Cancel</button
        >

        <button class="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update Now"}
        </button>
      </div>
    </form>
  </div>
</div>
<!-- /Add Canvas -->

<!-- Add Attachment -->
<div class="modal fade" id="new_file" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Add New Attachment</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form
        on:submit={addAttachment}
        class="needs-validation space-y-4"
        novalidate
      >
        <div class="modal-body space-y-4">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="title">
                Title <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="title"
                class="form-control"
                class:is-invalid={formErrors.title}
                bind:value={aTitle}
                required
                id="title"
                placeholder="Title"
              />
              {#if formErrors.title}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.title[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="link"> Link </label>
              <input
                type="text"
                name="link"
                class="form-control"
                class:is-invalid={formErrors.link}
                bind:value={link}
                id="link"
                placeholder="Link"
              />
              {#if formErrors.link}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.link[0]}</li>
                </ul>
              {/if}
            </div>
            <!-- File Upload -->
            <div>
              <label class="form-label" for="attachment">
                Attachment <span class="text-danger">*</span>
              </label>
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="file-upload drag-file w-100 d-flex border shadow align-items-center justify-content-center flex-column p-3 transition-all"
                class:bg-primary={isDragging}
                class:bg-light={!isDragging}
                style="border-style: dashed !important; border-color: {isDragging ? '#4f46e5' : '#dee2e6'} !important;"
                on:dragover={handleDragOver}
                on:dragleave={handleDragLeave}
                on:drop={handleDrop}
              >
                <span class="upload-img d-block mb-1">
                  <i class="ti ti-folder-open fs-16 {isDragging ? 'text-white' : 'text-primary'}"></i>
                </span>
                <p class="mb-0 fs-14 {isDragging ? 'text-white' : 'text-dark'}">
                  {#if isDragging}
                    Release to upload files
                  {:else}
                    Drop your files here or
                    <a
                      href="#browse"
                      class="text-decoration-underline text-primary">browse</a
                    >
                  {/if}
                </p>

                <input
                  type="file"
                  name="file"
                  accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  id="attachmentFile"
                  multiple
                  on:change={handleFileChange}
                />
                <p class="fs-13 mb-0 {isDragging ? 'text-white' : ''}">Maximum limit: 10 Files</p>
              </div>

              {#if formErrors.file}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.file[0]}</li>
                </ul>
              {/if}
            </div>
          </div>

          {#if files && files.length}
            <div class="grid grid-cols-2 gap-3">
              {#each files as file}
                <div class="card mb-0">
                  <div class="card-body p-2">
                    <div
                      class="d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <div class="d-flex align-items-center me-3">
                        {#if file.type && file.type.startsWith("image")}
                          <span class="avatar border me-2">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file?.name}
                              class="object-contain"
                            />
                          </span>
                        {:else}
                          <span class="avatar bg-success me-2">
                            <i class="ti ti-file-spreadsheet fs-20"></i>
                          </span>
                        {/if}
                        <div>
                          <h6
                            class="fw-medium fs-12 mb-1 trank"
                            title={file?.name}
                          >
                            {shortenFileName(file?.name, 4, 8)}
                          </h6>
                          <p class="mb-0 fs-10">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="avatar avatar-xs rounded-circle bg-danger text-white"
                        on:click={() => removeFile(file)}
                      >
                        <i class="ti ti-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          <div class="modal-footer">
            <a class="btn btn-light" href="#cancel" data-bs-dismiss="modal"
              >Cancel</a
            >
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm"}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Add Attachment -->

<!-- Create Chat -->
<div class="modal fade" id="create_call" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Chat</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form on:submit={addChat} class="needs-validation space-y-4" novalidate>
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="type">
                Type <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="type"
                class="form-control"
                class:is-invalid={formErrors.type}
                bind:value={type}
                required
                id="type"
                placeholder="Type"
              />
              {#if formErrors.type}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.type[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="message">
                Message <span class="text-danger">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                class="form-control"
                rows="4"
                bind:value={message}
                class:is-invalid={formErrors.message}
                required
              ></textarea>
              {#if formErrors.message}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.message[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Chat -->

<!-- Create Reminder -->
<div class="modal fade" id="create_reminder" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Reminder</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form
        on:submit={addReminder}
        class="needs-validation space-y-4"
        novalidate
      >
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="reminderTime">
                Reminder Time <span class="text-danger">*</span>
              </label>
              <input
                type="datetime-local"
                name="reminderTime"
                class="form-control"
                class:is-invalid={formErrors.reminderTime}
                bind:value={reminderTime}
                required
                id="reminderTime"
                placeholder="Reminder Time"
              />
              {#if formErrors.reminderTime}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.reminderTime[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="reminderMessage">
                Message <span class="text-danger">*</span>
              </label>
              <textarea
                id="reminderMessage"
                name="reminderMessage"
                class="form-control"
                rows="4"
                bind:value={reminderMessage}
                class:is-invalid={formErrors.reminderMessage}
                required
              ></textarea>
              {#if formErrors.message}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.message[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Reminder -->

<!-- Manage Assigned Users -->
<div class="modal custom-modal fade" id="add_contact" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h5 class="modal-title">Manage Assigned Users</h5>
          <small class="text-muted">
            {selectedUsers.length} user{selectedUsers.length === 1 ? "" : "s"} selected
          </small>
        </div>
        <button
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="modal-body">
        <form
          on:submit={addAssignedUser}
          class="needs-validation"
          novalidate
        >
          <!-- Search -->
          <div class="input-group mb-3">
            <span class="input-group-text bg-white border-end-0">
              <i class="ti ti-search text-muted"></i>
            </span>
            <input
              type="text"
              class="form-control border-start-0 ps-0"
              placeholder="Search users..."
              bind:value={userSearch}
            />
          </div>

          <!-- User list -->
          <div class="access-wrap" style="max-height: 300px; overflow-y: auto; overflow-x: hidden;">
            {#if users.length}
              {@const filteredUsers = users
                .filter((u) => u.status !== "banned")
                .filter((u) => u.name?.toLowerCase().includes(userSearch.toLowerCase()))
              }
              {#if filteredUsers.length}
                <div class="row g-2">
                  {#each filteredUsers as user}
                    <div class="col-6">
                      <label
                        class="checkboxs d-flex align-items-center p-2 rounded border h-100"
                        class:bg-light={selectedUsers.includes(user.id)}
                        class:border-primary={selectedUsers.includes(user.id)}
                        class:opacity-50={user.status === "inactive"}
                        style="cursor:{user.status === 'inactive' ? 'not-allowed' : 'pointer'}; transition: background 0.15s;"
                      >
                        <input
                          type="checkbox"
                          class="form-check-input me-2 mt-0 flex-shrink-0"
                          bind:group={selectedUsers}
                          value={user.id}
                          disabled={user.status === "inactive"}
                        />
                        <span class="avatar avatar-xs rounded-circle me-2 flex-shrink-0">
                          <img
                            src="/assets/img/profiles/user.png"
                            alt="img"
                            class="rounded-circle"
                            style="width:28px;height:28px;object-fit:cover;"
                          />
                        </span>
                        <div class="overflow-hidden">
                          <p class="fw-medium mb-0 text-truncate" style="font-size:0.85rem;">{user?.name}</p>
                          <span class="text-muted text-capitalize" style="font-size:0.72rem;">
                            {#if user.status === "inactive"}
                              Inactive
                            {:else}
                              {user?.subRole || user?.role}
                            {/if}
                          </span>
                        </div>
                      </label>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-muted text-center py-3 mb-0">No users match "{userSearch}"</p>
              {/if}
            {:else}
              <p class="text-muted text-center py-3 mb-0">No users available</p>
            {/if}
          </div>

          <div class="modal-btn text-end mt-3">
            <button
              type="button"
              class="btn btn-light me-2"
              data-bs-dismiss="modal"
            >
              Cancel
            </button>
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
<!-- /Manage Assigned Users -->

<!-- Create Client -->
<div class="modal fade" id="create_client" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Client</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form on:submit={addClient} class="needs-validation space-y-4" novalidate>
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="name">
                Name <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="name"
                class="form-control"
                class:is-invalid={formErrors.name}
                bind:value={name}
                required
                id="name"
                placeholder="Name"
              />
              {#if formErrors.name}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.name[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="designation"> Designation </label>
              <input
                type="text"
                name="designation"
                class="form-control"
                class:is-invalid={formErrors.designation}
                bind:value={designation}
                id="designation"
                placeholder="Designation"
              />
              {#if formErrors.designation}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.designation[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="email"> Email </label>
              <input
                type="email"
                name="email"
                class="form-control"
                class:is-invalid={formErrors.email}
                bind:value={email}
                id="email"
                placeholder="Email"
              />
              {#if formErrors.email}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.email[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="mobile"> Mobile </label>
              <input
                type="text"
                name="mobile"
                class="form-control"
                class:is-invalid={formErrors.mobile}
                bind:value={mobile}
                id="mobile"
                placeholder="Mobile"
              />
              {#if formErrors.mobile}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.mobile[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="alternateMobile">
                Alternate Mobile
              </label>
              <input
                type="text"
                name="alternateMobile"
                class="form-control"
                class:is-invalid={formErrors.alternateMobile}
                bind:value={alternateMobile}
                id="alternateMobile"
                placeholder="Alternate Mobile"
              />
              {#if formErrors.alternateMobile}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.alternateMobile[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="whatsapp"> Whatsapp </label>
              <input
                type="text"
                name="whatsapp"
                class="form-control"
                class:is-invalid={formErrors.whatsapp}
                bind:value={whatsapp}
                id="whatsapp"
                placeholder="Whatsapp"
              />
              {#if formErrors.whatsapp}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.whatsapp[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="address">
                Address <span class="text-danger">*</span>
              </label>
              <textarea
                id="address"
                name="address"
                class="form-control"
                rows="2"
                bind:value={address}
                class:is-invalid={formErrors.address}
                required
              ></textarea>
              {#if formErrors.address}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.address[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Client -->

<!-- Create Component -->
<div class="modal fade" id="edit_component" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Update Order</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form
        on:submit={editComponent}
        class="needs-validation space-y-4"
        novalidate
      >
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="orderTitle">
                Title <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="orderTitle"
                class="form-control"
                class:is-invalid={formErrors.orderTitle}
                bind:value={orderTitle}
                required
                id="orderTitle"
                placeholder="Title"
              />
              {#if formErrors.orderTitle}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.orderTitle[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="orderWorkOrderNumber">
                Work Order Number
              </label>
              <input
                type="text"
                name="orderWorkOrderNumber"
                class="form-control"
                class:is-invalid={formErrors.orderWorkOrderNumber}
                bind:value={orderWorkOrderNumber}
                id="orderWorkOrderNumber"
                placeholder="Work Order Number"
              />
              {#if formErrors.orderWorkOrderNumber}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.orderWorkOrderNumber[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Now"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- /Create Client -->

<style>
  .ribbon {
    position: absolute;
    overflow: hidden;
    width: 75px;
    height: 75px;
    z-index: 99;
  }

  .ribbon-top-right {
    top: -3px;
    right: -3px;
  }

  .ribbon-top-left {
    top: -3px;
    left: -3px;
  }

  .ribbon span {
    position: absolute;
    display: block;
    width: 100px;
    padding: 4px 0;
    color: #fff;
    font-size: 8px;
    font-weight: 600;
    text-align: center;
    text-transform: uppercase;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
  }

  .ribbon-top-left span {
    left: -25px;
    top: 15px;
    transform: rotate(-45deg);
  }
</style>
