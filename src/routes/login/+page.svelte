<script>
  import { setUser } from "../../lib/stores/userStore";
  import { onMount } from "svelte";
  import { checkAuth, saveSession, restoreSession } from "$lib/utils/auth";
  import { secureStorage } from "$lib/utils/secureStorage";

  import { goto } from "$app/navigation";
  import { apiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";

  let email = "";
  let password = "";
  let rememberMe = false;
  let errorMessage = "";
  let loading = false;
  let showPassword = false;
  let checkingSession = true; // show "Checking session..." on startup
  let deviceName = "";
  let emailInput;

  // ✅ Get device name from Windows username via Tauri, fallback for browser
  async function autoDetectDeviceName() {
    const saved = localStorage.getItem("device_name");
    if (saved) { deviceName = saved; return; }

    let name = "User PC";
    try {
      if (window.__TAURI__) {
        const { invoke } = await import("@tauri-apps/api/tauri");
        name = await invoke("get_device_name");
      } else {
        // Browser dev fallback
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

  // ✅ Get location: try browser GPS first (2s), fall back to IP-based
  function getLocation() {
    return new Promise((resolve) => {
      // Try browser geolocation with short timeout
      if (navigator.geolocation) {
        const timer = setTimeout(() => {
          // GPS timed out — fall back to IP-based
          getIPLocation().then(resolve);
        }, 2000);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timer);
            resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          },
          () => {
            clearTimeout(timer);
            // GPS denied/error — fall back to IP-based
            getIPLocation().then(resolve);
          },
          { enableHighAccuracy: true, timeout: 2000 }
        );
      } else {
        getIPLocation().then(resolve);
      }
    });
  }

  // ✅ IP-based geolocation fallback (city-level, no API key needed)
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
      // Restore tokens from secure file storage into localStorage
      await restoreSession();
    } catch {
      // Keychain failed — checkAuth will still try localStorage below
    }

    if (checkAuth()) {
      // Token exists — skip login screen, go straight to dashboard
      goto("/admin/dashboard");
      return;
    }

    checkingSession = false;

    // Restore last used email + password (remember me)
    const lastEmail = localStorage.getItem("last_email");
    if (lastEmail) {
      email = lastEmail;
      rememberMe = true;
      const lastPassword = await secureStorage.get("last_password");
      if (lastPassword) password = lastPassword;
    }

    await autoDetectDeviceName();

    // Fix: WebView2 on Windows needs explicit focus to enable keyboard input
    window.focus();
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();

    // Delayed focus on email input — ensures WebView2 is fully ready
    setTimeout(() => {
      window.focus();
      if (emailInput) emailInput.focus();
    }, 300);
  });

  const handleSubmit = async (event) => {
    errorMessage = "";
    loading = true;
    event.preventDefault();

    if (!email || !password) {
      errorMessage = "Please fill in all fields.";
      loading = false;
      return;
    }

    try {
      // ✅ Get location before login
      const coords = await getLocation();
      const data = await apiFetch(API_ROUTES.LOGIN, {
        method: "POST",
        data: JSON.stringify({
          email,
          password,
          latitude: coords?.latitude || null,
          longitude: coords?.longitude || null,
          deviceName: localStorage.getItem("device_name") || null,
        }),
      });
      Swal.fire("Success!", "Sign in successfully.", "success");
      // Store tokens securely
      await saveSession(data);
      setUser(data.user);

      // Remember last email + password if checked
      if (rememberMe) {
        localStorage.setItem("last_email", email);
        await secureStorage.set("last_password", password);
      } else {
        localStorage.removeItem("last_email");
        await secureStorage.delete("last_password");
      }

      goto("/admin/dashboard");
    } catch (error) {
      console.log("error : ", error);
      let n_errors = errorHandle(error);
      errorMessage = n_errors;
    } finally {
      loading = false;
    }
  };
</script>

<head>
  <title>Login</title>
</head>


{#if checkingSession}
  <div class="flex flex-col justify-center items-center min-h-screen bg-gray-100 gap-4">
    <div class="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
    <p class="text-gray-500 text-sm">Checking session...</p>
  </div>
{:else}
<div class="flex justify-center items-center min-h-screen bg-gray-100">
  <form
    class="bg-white p-8 rounded-lg shadow-md w-96"
    on:submit|preventDefault={handleSubmit}
  >
    <h2 class="text-2xl font-bold text-center text-gray-700">Sign In</h2>
    <p class="text-center text-gray-500 mb-4">
      Access the CRMS panel using your email and passcode.
    </p>

    <div class="mb-4">
      <label for="email" class="block text-sm font-medium text-gray-700">
        Email Address
      </label>
      <input
        type="email"
        id="email"
        class="mt-1 p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        placeholder="Email Address"
        bind:value={email}
        bind:this={emailInput}
        required
      />
    </div>

    <div class="mb-4">
      <label for="password" class="block text-sm font-medium text-gray-700">
        Password
      </label>
      <div class="relative mt-1">
        {#if showPassword}
          <input
            type="text"
            id="password"
            class="p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 pr-10"
            placeholder="Password"
            bind:value={password}
            required
          />
        {:else}
          <input
            type="password"
            id="password"
            class="p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 pr-10"
            placeholder="Password"
            bind:value={password}
            required
          />
        {/if}
        <button
          type="button"
          class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
          on:click={() => (showPassword = !showPassword)}
          tabindex="-1"
        >
          {#if showPassword}
            <!-- Eye Off -->
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7a9.77 9.77 0 012.17-3.585M6.343 6.343A9.956 9.956 0 0112 5c5 0 9 4 9 7a9.77 9.77 0 01-2.17 3.585M15 12a3 3 0 11-6 0 3 3 0 016 0zM3 3l18 18" />
            </svg>
          {:else}
            <!-- Eye -->
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          {/if}
        </button>
      </div>
    </div>

    <div class="flex items-center mb-4">
      <input
        type="checkbox"
        id="rememberMe"
        class="h-4 w-4 text-blue-500 border-gray-300 rounded"
        bind:checked={rememberMe}
      />
      <label for="rememberMe" class="ml-2 text-sm text-gray-700"
        >Remember Me</label
      >
    </div>

    <button
      type="submit"
      class="w-full p-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400"
      disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button
    >

    <!-- <p class="text-center text-sm text-gray-500 mt-4">
      <a href="#ForgotPassword" class="text-red-500 hover:text-red-600"
        >Forgot Password?</a
      >
    </p> -->

    <!-- <p class="text-center text-sm text-gray-500 mt-2">
      New on our platform? <a
        href="/register"
        class="text-blue-500 hover:text-blue-600">Create an account</a
      >
    </p> -->
  </form>
</div>
{/if}
