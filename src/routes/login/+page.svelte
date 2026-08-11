<script>
  import { setUser } from "../../lib/stores/userStore";
  import { onMount } from "svelte";
  import { checkAuth, saveSession, restoreSession, savePendingRoleSelection, setLoginWelcome } from "$lib/utils/auth";
  import { secureStorage } from "$lib/utils/secureStorage";

  import { goto } from "$app/navigation";
  import { apiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";

  let email = "";
  let password = "";
  let rememberMe = false;
  let errorMessage = "";
  let fieldErrors = { email: false, password: false };
  let loading = false;
  let showPassword = false;
  let checkingSession = true;
  let deviceName = "";
  let emailInput;
  let passwordInput;

  function clearError() {
    if (!errorMessage && !fieldErrors.email && !fieldErrors.password) return;
    errorMessage = "";
    fieldErrors = { email: false, password: false };
  }

  /** Friendly login errors — no blocking popup */
  function resolveLoginError(error) {
    if (error?.isNetworkError || error?.status === 0) {
      return error?.isTimeout
        ? "Request timed out. Check your connection and try again."
        : "Can't reach the server. Check your connection and try again.";
    }

    const status = error?.status;
    const raw = error?.data?.message;
    let text = "";
    if (typeof raw === "string") text = raw;
    else if (Array.isArray(raw)) {
      text = raw
        .map((m) => (typeof m === "string" ? m : m?.constraints ? Object.values(m.constraints).join(" ") : ""))
        .filter(Boolean)
        .join(" ");
    }

    if (status === 401 || status === 400) {
      return text || "Invalid email or password.";
    }
    if (status === 403) {
      return text || "This account doesn't have access.";
    }
    if (status === 429) {
      return text || "Too many attempts. Please wait a moment and try again.";
    }
    if (status >= 500) {
      return "Server error. Please try again in a moment.";
    }
    return text || "Sign in failed. Please try again.";
  }

  async function autoDetectDeviceName() {
    const saved = localStorage.getItem("device_name");
    if (saved) { deviceName = saved; return; }

    let name = "User PC";
    try {
      if (window.__TAURI__) {
        const { invoke } = await import("@tauri-apps/api/tauri");
        name = await invoke("get_device_name");
      } else {
        const ua = navigator.userAgent;
        if (/Windows/i.test(ua)) name = "Windows PC";
        else if (/Mac OS X/i.test(ua)) name = "Mac";
        else if (/Linux/i.test(ua)) name = "Linux PC";
      }
    } catch {
      name = "User PC";
    }

    deviceName = name;
    localStorage.setItem("device_name", name);
  }

  function getLocation() {
    return new Promise((resolve) => {
      if (navigator.geolocation) {
        const timer = setTimeout(() => {
          getIPLocation().then(resolve);
        }, 2000);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timer);
            resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          },
          () => {
            clearTimeout(timer);
            getIPLocation().then(resolve);
          },
          { enableHighAccuracy: true, timeout: 2000 }
        );
      } else {
        getIPLocation().then(resolve);
      }
    });
  }

  async function getIPLocation() {
    try {
      const res = await fetch("https://ipwho.is/");
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        return { latitude: data.latitude, longitude: data.longitude };
      }
    } catch {
      // silent fail
    }
    return null;
  }

  onMount(async () => {
    try {
      await restoreSession();
    } catch {
      // Keychain failed — checkAuth will still try localStorage below
    }

    if (checkAuth()) {
      goto("/admin/dashboard");
      return;
    }

    checkingSession = false;

    // Show reason when redirected here by an expired/invalidated session
    const urlReason = new URLSearchParams(window.location.search).get("reason");
    if (urlReason) errorMessage = urlReason;

    const lastEmail = localStorage.getItem("last_email");
    if (lastEmail) {
      email = lastEmail;
      rememberMe = true;
    }

    await autoDetectDeviceName();

    window.focus();
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();

    setTimeout(() => {
      window.focus();
      if (emailInput) emailInput.focus();
    }, 300);
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    loading = true;

    const missingEmail = !email.trim();
    const missingPassword = !password;
    if (missingEmail || missingPassword) {
      fieldErrors = { email: missingEmail, password: missingPassword };
      errorMessage = missingEmail && missingPassword
        ? "Please enter your email and password."
        : missingEmail
          ? "Please enter your email address."
          : "Please enter your password.";
      loading = false;
      setTimeout(() => {
        if (missingEmail) emailInput?.focus();
        else passwordInput?.focus();
      }, 0);
      return;
    }

    try {
      const coords = await getLocation();
      const data = await apiFetch(API_ROUTES.LOGIN, {
        method: "POST",
        data: JSON.stringify({
          email: email.trim(),
          password,
          latitude: coords?.latitude || null,
          longitude: coords?.longitude || null,
          deviceName: localStorage.getItem("device_name") || null,
        }),
      });

      if (rememberMe) {
        localStorage.setItem("last_email", email.trim());
        await secureStorage.set("last_password", password);
      } else {
        localStorage.removeItem("last_email");
        await secureStorage.delete("last_password");
      }

      if (data.requireRoleSelection) {
        savePendingRoleSelection(data.userId, data.roles, data.rolePermissions);
        goto("/select-role");
        return;
      }

      await saveSession(data);
      setUser(data.user);
      const welcomeName = data.user?.name?.trim();
      setLoginWelcome(welcomeName ? `Welcome back, ${welcomeName}` : "Signed in successfully");
      goto("/admin/dashboard");
    } catch (error) {
      errorMessage = resolveLoginError(error);
      const credFail = error?.status === 400 || error?.status === 401;
      fieldErrors = { email: credFail, password: credFail };
      setTimeout(() => passwordInput?.focus(), 0);
    } finally {
      loading = false;
    }
  };
</script>

<head>
  <title>Login</title>
</head>

{#if checkingSession}
  <div class="login-page flex flex-col justify-center items-center min-h-screen gap-4">
    <div class="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
    <p class="text-gray-500 text-sm">Checking session...</p>
  </div>
{:else}
<div class="login-page flex justify-center items-center min-h-screen">
  <form
    class="login-card bg-white rounded-lg shadow-md"
    class:login-card--error={!!errorMessage}
    on:submit|preventDefault={handleSubmit}
    novalidate
  >
    <h2 class="login-title">Sign In</h2>
    <p class="login-subtitle">
      Access the CRMS panel using your email and passcode.
    </p>

    {#if errorMessage}
      <div class="login-alert" role="alert" aria-live="assertive">
        <div class="login-alert-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
          </svg>
        </div>
        <p class="login-alert-text">{errorMessage}</p>
        <button type="button" class="login-alert-dismiss" on:click={clearError} aria-label="Dismiss">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    {/if}

    <div class="mb-3">
      <label for="email" class="login-label">
        Email Address
      </label>
      <input
        type="email"
        id="email"
        class="login-input mt-1 w-full"
        class:login-input--invalid={fieldErrors.email}
        placeholder="Email Address"
        bind:value={email}
        bind:this={emailInput}
        on:input={clearError}
        autocomplete="username"
        required
      />
    </div>

    <div class="mb-3">
      <label for="password" class="login-label">
        Password
      </label>
      <div class="relative mt-1">
        {#if showPassword}
          <input
            type="text"
            id="password"
            class="login-input w-full login-input--with-icon"
            class:login-input--invalid={fieldErrors.password}
            placeholder="Password"
            bind:value={password}
            bind:this={passwordInput}
            on:input={clearError}
            autocomplete="current-password"
            required
          />
        {:else}
          <input
            type="password"
            id="password"
            class="login-input w-full login-input--with-icon"
            class:login-input--invalid={fieldErrors.password}
            placeholder="Password"
            bind:value={password}
            bind:this={passwordInput}
            on:input={clearError}
            autocomplete="current-password"
            required
          />
        {/if}
        <button
          type="button"
          class="login-eye"
          on:click={() => (showPassword = !showPassword)}
          tabindex="-1"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {#if showPassword}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7a9.77 9.77 0 012.17-3.585M6.343 6.343A9.956 9.956 0 0112 5c5 0 9 4 9 7a9.77 9.77 0 01-2.17 3.585M15 12a3 3 0 11-6 0 3 3 0 016 0zM3 3l18 18" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          {/if}
        </button>
      </div>
    </div>

    <div class="flex items-center gap-2 mb-3">
      <input
        type="checkbox"
        id="rememberMe"
        class="login-check"
        bind:checked={rememberMe}
      />
      <label for="rememberMe" class="login-label mb-0" style="cursor:pointer;">Remember Me</label>
    </div>

    <button
      type="submit"
      class="login-submit w-full"
      disabled={loading}
    >
      {#if loading}
        <span class="login-submit-inner">
          <span class="login-spinner" aria-hidden="true"></span>
          Signing in…
        </span>
      {:else}
        Sign In
      {/if}
    </button>
  </form>
</div>
{/if}

<style>
  .login-page {
    background: #f3f4f6;
    font-size: 13px;
  }

  .login-card {
    width: 340px;
    padding: 1.5rem 1.5rem 1.35rem;
  }

  .login-title {
    margin: 0 0 4px;
    font-size: 1.25rem;
    font-weight: 700;
    text-align: center;
    color: #374151;
    line-height: 1.3;
  }

  .login-subtitle {
    margin: 0 0 1rem;
    text-align: center;
    color: #6b7280;
    font-size: 12px;
    line-height: 1.4;
  }

  .login-label {
    display: block;
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: #374151;
  }

  .login-card--error {
    animation: login-shake 0.35s ease;
  }

  @keyframes login-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-4px); }
    40% { transform: translateX(4px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
  }

  .login-alert {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 12px;
    padding: 8px 10px;
    border-radius: 6px;
    background: #fff5f5;
    border: 1px solid #ffc9c9;
    color: #c92a2a;
  }

  .login-alert-icon {
    flex-shrink: 0;
    margin-top: 1px;
    color: #e03131;
  }

  .login-alert-text {
    flex: 1;
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    font-weight: 500;
  }

  .login-alert-dismiss {
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    color: #fa5252;
    cursor: pointer;
    opacity: 0.7;
    line-height: 1;
  }

  .login-alert-dismiss:hover {
    opacity: 1;
  }

  .login-input {
    height: 34px;
    padding: 0 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.3;
    color: #111827;
    background: #fff;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .login-input--with-icon {
    padding-right: 34px;
  }

  .login-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  .login-input--invalid {
    border-color: #fa5252 !important;
    background: #fff5f5;
  }

  .login-input--invalid:focus {
    box-shadow: 0 0 0 3px rgba(250, 82, 82, 0.12) !important;
  }

  .login-eye {
    position: absolute;
    inset: 0 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    border: none;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
  }

  .login-eye:hover {
    color: #374151;
  }

  .login-check {
    width: 16px;
    height: 16px;
    min-width: 16px;
    accent-color: #ef4444;
    cursor: pointer;
    margin: 0;
  }

  .login-submit {
    height: 34px;
    padding: 0 12px;
    border: none;
    border-radius: 6px;
    background: #ef4444;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .login-submit:hover:not(:disabled) {
    background: #dc2626;
  }

  .login-submit:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25);
  }

  .login-submit:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .login-submit-inner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .login-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: login-spin 0.7s linear infinite;
  }

  @keyframes login-spin {
    to { transform: rotate(360deg); }
  }
</style>
