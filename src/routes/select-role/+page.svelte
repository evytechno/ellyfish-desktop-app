<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { apiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { saveSession, clearPendingRoleSelection, getRolePermissions } from "$lib/utils/auth";
  import { setUser } from "../../lib/stores/userStore";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Swal from "sweetalert2";

  let roles = [];
  let userId = null;
  let rolePermissions = null;
  let loading = false;
  let selecting = null;
  let errorMessage = "";

  const ROLE_ORDER = ["master", "admin", "manager", "user"];

  const ROLE_LABELS = {
    master: "Master",
    admin: "Admin",
    manager: "Manager",
    user: "User",
  };

  const SUBROLE_LABELS = {
    telecaller: "Telecaller",
    tech: "Tech",
    tech_helper: "Tech Helper",
  };

  const ROLE_ICONS = {
    master: "ti ti-shield-star",
    admin: "ti ti-shield-check",
    manager: "ti ti-briefcase",
    user: "ti ti-user",
  };

  function getRoleDisplayLabel(role) {
    const base = ROLE_LABELS[role] ?? role;
    const subRole = rolePermissions?.[role]?.subRole;
    if (subRole) return `${base} (${SUBROLE_LABELS[subRole] ?? subRole})`;
    return base;
  }

  onMount(() => {
    userId = localStorage.getItem("pending_user_id");
    rolePermissions = getRolePermissions();
    try {
      const raw = JSON.parse(localStorage.getItem("available_roles") || "[]");
      // Sort by privilege: master → admin → manager → user
      roles = [...raw].sort((a, b) => {
        const ai = ROLE_ORDER.indexOf(a);
        const bi = ROLE_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    } catch {
      roles = [];
    }

    if (!userId || roles.length === 0) {
      goto("/login");
    }
  });

  async function selectRole(role) {
    if (loading) return;
    loading = true;
    selecting = role;
    errorMessage = "";

    try {
      const data = await apiFetch(API_ROUTES.SELECT_ROLE, {
        method: "POST",
        data: JSON.stringify({ userId: Number(userId), selectedRole: role }),
      });

      clearPendingRoleSelection();
      await saveSession(data);
      setUser(data.user);

      await Swal.fire("Success!", `Signed in as ${getRoleDisplayLabel(role)}.`, "success");
      window.location.href = "/admin/dashboard";
    } catch (error) {
      errorMessage = errorHandle(error) || "Failed to select role. Please try again.";
    } finally {
      loading = false;
      selecting = null;
    }
  }
</script>

<head>
  <title>Select Role</title>
</head>

<div class="flex justify-center items-center min-h-screen bg-gray-100">
  <div class="bg-white p-8 rounded-lg shadow-md w-96">
    <h2 class="text-2xl font-bold text-center text-gray-700 mb-2">Select Role</h2>
    <p class="text-center text-gray-500 mb-6">
      Your account has multiple roles. Choose how you want to sign in.
    </p>

    {#if errorMessage}
      <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
        {errorMessage}
      </div>
    {/if}

    <div class="flex flex-col gap-3">
      {#each roles as role}
        <button
          class="flex items-center gap-3 w-full p-4 border-2 rounded-lg text-left transition-all
            {selecting === role
              ? 'border-red-500 bg-red-50'
              : 'border-gray-200 hover:border-red-400 hover:bg-red-50'}"
          on:click={() => selectRole(role)}
          disabled={loading}
        >
          <i class="{ROLE_ICONS[role] ?? 'ti ti-user'} text-2xl text-red-500"></i>
          <div>
            <div class="font-semibold text-gray-800">{getRoleDisplayLabel(role)}</div>
            <div class="text-xs text-gray-500">Sign in as {getRoleDisplayLabel(role)}</div>
          </div>
          {#if selecting === role}
            <div class="ml-auto w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
          {/if}
        </button>
      {/each}
    </div>

    <div class="mt-6 text-center">
      <a href="/login" class="text-sm text-gray-500 hover:text-red-500">
        &larr; Back to Login
      </a>
    </div>
  </div>
</div>
