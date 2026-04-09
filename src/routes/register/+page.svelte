<script>
  let name = "";
  let email = "";
  let password = "";
  let confirmPassword = "";
  let agreeToTerms = false;
  let errorMessage = "";

  const handleSubmit = (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      errorMessage = "Passwords do not match.";
    } else if (!agreeToTerms) {
      errorMessage = "You must agree to the Terms & Privacy.";
    } else {
      errorMessage = "";
      console.log("Submitting registration...");
    }
  };
</script>

<div class="flex justify-center items-center min-h-screen bg-gray-100">
  <form class="bg-white p-8 rounded-lg shadow-md w-96" on:submit={handleSubmit}>
    <h2 class="text-2xl font-bold text-center text-gray-700">Register</h2>
    <p class="text-center text-gray-500 mb-4">Create new CRMS account</p>

    {#if errorMessage}
      <p class="text-red-500 text-center">{errorMessage}</p>
    {/if}

    <div class="mb-4">
      <label for="name" class="block text-sm font-medium text-gray-700"
        >Name</label
      >
      <input
        type="text"
        id="name"
        class="mt-1 p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        placeholder="Full Name"
        bind:value={name}
        required
      />
    </div>

    <div class="mb-4">
      <label for="email" class="block text-sm font-medium text-gray-700"
        >Email Address</label
      >
      <input
        type="email"
        id="email"
        class="mt-1 p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        placeholder="Email Address"
        bind:value={email}
        required
      />
    </div>

    <div class="mb-4">
      <label for="password" class="block text-sm font-medium text-gray-700"
        >Password</label
      >
      <input
        type="password"
        id="password"
        class="mt-1 p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        placeholder="Password"
        bind:value={password}
        required
      />
    </div>

    <div class="mb-4">
      <label
        for="confirmPassword"
        class="block text-sm font-medium text-gray-700">Confirm Password</label
      >
      <input
        type="password"
        id="confirmPassword"
        class="mt-1 p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        placeholder="Confirm Password"
        bind:value={confirmPassword}
        required
      />
    </div>

    <div class="flex items-center mb-4">
      <input
        type="checkbox"
        id="agreeToTerms"
        class="h-4 w-4 text-blue-500 border-gray-300 rounded"
        bind:checked={agreeToTerms}
      />
      <label for="agreeToTerms" class="ml-2 text-sm text-gray-700"
        >I agree to the <a href="#terms&privacy" class="text-blue-500 hover:text-blue-600"
          >Terms & Privacy</a
        ></label
      >
    </div>

    <button
      type="submit"
      class="w-full p-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400"
      >Sign Up</button
    >

    <p class="text-center text-sm text-gray-500 mt-4">
      Already have an account? <a
        href="/login"
        class="text-blue-500 hover:text-blue-600">Sign In Instead</a
      >
    </p>
  </form>
</div>

<style>
</style>
