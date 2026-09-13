import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let auth = null;

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const btnLogin = document.getElementById('btn-login');

  try {
    const configResponse = await fetch('/api/firebase-config');
    const firebaseConfig = await configResponse.json();
    
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    setupAuthentication();
  } catch (err) {
    console.error("Failed to initialize Firebase Auth:", err);
    alert("Security subsystem initialization failed. Page execution aborted.");
  }

  function setupAuthentication() {
    // Auth State Listener: if already logged in, redirect to index.html (root)
    onAuthStateChanged(auth, (user) => {
      if (user) {
        window.location.href = '/';
      }
    });

    // Login handler
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.classList.add('hidden');
      btnLogin.classList.add('loading');
      btnLogin.disabled = true;
      
      const email = loginEmail.value.trim();
      const password = loginPassword.value;
      
      try {
        await signInWithEmailAndPassword(auth, email, password);
        // On success, onAuthStateChanged will handle redirection
      } catch (err) {
        console.error("Login failed:", err);
        let friendlyMessage = "Failed to sign in. Please verify your credentials.";
        if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
          friendlyMessage = "Invalid email or password.";
        } else if (err.code === "auth/invalid-email") {
          friendlyMessage = "Please enter a valid email address.";
        }
        loginError.textContent = friendlyMessage;
        loginError.classList.remove('hidden');
      } finally {
        btnLogin.classList.remove('loading');
        btnLogin.disabled = false;
      }
    });
  }
});
