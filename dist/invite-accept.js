document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  if (!token) {
    alert("Invalid invitation link.");
    return;
  }

  document.getElementById("invite-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!name || !password) {
      alert("All fields are required.");
      return;
    }

    try {
      const response = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      alert("Account activated successfully!");

      // 📌 Redirect based on role
      if (result.role === "project-manager") {
        window.location.href = '/project-manager-auth.html';
      } else {
        window.location.href = '/sign-inpage.html';
      }

    } catch (error) {
      console.error("Error:", error);
      alert("Failed to activate account.");
    }
  });
});


