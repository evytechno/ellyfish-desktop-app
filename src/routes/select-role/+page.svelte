<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { apiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { saveSession, clearPendingRoleSelection, getRolePermissions, setLoginWelcome } from "$lib/utils/auth";
  import { setUser } from "../../lib/stores/userStore";

  let roles = [];
  let userId = null;
  let rolePermissions = null;
  let loading = false;
  let selecting = null;
  let errorMessage = "";

  function resolveSelectError(error) {
    if (error?.isNetworkError || error?.status === 0) {
      return error?.isTimeout
        ? "Request timed out. Check your connection and try again."
        : "Can't reach the server. Check your connection and try again.";
    }
    const raw = error?.data?.message;
    const text = typeof raw === "string" ? raw : "";
    if (error?.status === 403) return text || "You can't sign in with that role.";
    if (error?.status >= 500) return "Server error. Please try again in a moment.";
    return text || "Failed to select role. Please try again.";
  }

  function clearError() {
    errorMessage = "";
  }

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

      const label = getRoleDisplayLabel(role);
      const welcomeName = data.user?.name?.trim();
      setLoginWelcome(
        welcomeName
          ? `Welcome back, ${welcomeName} · ${label}`
          : `Signed in as ${label}`
      );
      window.location.href = "/admin/dashboard";
    } catch (error) {
      errorMessage = resolveSelectError(error);
    } finally {
      loading = false;
      selecting = null;
    }
  }
</script>

<head>
  <title>Select Role</title>
</head>

<div class="select-role-page flex justify-center items-center min-h-screen">
  <div class="select-role-card bg-white p-8 rounded-lg shadow-md w-96" class:select-role-card--error={!!errorMessage}>
    <h2 class="text-2xl font-bold text-center text-gray-700 mb-2">Select Role</h2>
    <p class="text-center text-gray-500 mb-6">
      Your account has multiple roles. Choose how you want to sign in.
    </p>

    {#if errorMessage}
      <div class="select-role-alert" role="alert" aria-live="assertive">
        <div class="select-role-alert-icon" aria-hidden="true">
          <i class="ti ti-alert-circle"></i>
        </div>
        <p class="select-role-alert-text">{errorMessage}</p>
        <button type="button" class="select-role-alert-dismiss" on:click={clearError} aria-label="Dismiss">
          <i class="ti ti-x"></i>
        </button>
      </div>
    {/if}

    <div class="flex flex-col gap-3">
      {#each roles as role}
        <button
          class="flex items-center gap-3 w-full p-4 border-2 rounded-lg text-left transition-all
            {selecting === role
              ? 'border-red-500 bg-red-50'
              : 'border-gray-200 hover:border-red-400 hover:bg-red-50'}"
          on:click={() => { clearError(); selectRole(role); }}
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

<style>
  .select-role-page {
    background: #f3f4f6;
  }

  .select-role-card--error {
    animation: select-role-shake 0.35s ease;
  }

  @keyframes select-role-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-4px); }
    40% { transform: translateX(4px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
  }

  .select-role-alert {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #fff5f5;
    border: 1px solid #ffc9c9;
    color: #c92a2a;
  }

  .select-role-alert-icon {
    flex-shrink: 0;
    margin-top: 1px;
    font-size: 16px;
    color: #e03131;
  }

  .select-role-alert-text {
    flex: 1;
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    font-weight: 500;
  }

  .select-role-alert-dismiss {
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    color: #fa5252;
    cursor: pointer;
    opacity: 0.7;
    line-height: 1;
    font-size: 14px;
  }

  .select-role-alert-dismiss:hover {
    opacity: 1;
  }
</style>
