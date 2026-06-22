const AUTH_KEY = "personalFinanceAuth_v1";
const SESSION_KEY = "pf_authenticated";
const OTP_SESSION_KEY = "personalFinanceOtp_session";

const PBKDF2_ITERATIONS = 120000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

let otpResendTimer = null;

const auth$ = (sel) => document.querySelector(sel);

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function hashSecret(secret, saltBuf) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bufToB64(bits);
}

function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuth(data) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

function setAuthenticated(value) {
  if (value) sessionStorage.setItem(SESSION_KEY, "1");
  else sessionStorage.removeItem(SESSION_KEY);
}

function showAuthScreen(id) {
  ["authSetup", "authLogin", "authForgot", "authReset"].forEach((screenId) => {
    const el = auth$(`#${screenId}`);
    if (el) el.classList.toggle("hidden", screenId !== id);
  });
  auth$("#authGate")?.classList.remove("hidden");
  auth$("#mainApp")?.classList.add("hidden");
}

function showApp() {
  auth$("#authGate")?.classList.add("hidden");
  auth$("#mainApp")?.classList.remove("hidden");
  if (typeof window.initFinanceApp === "function") {
    window.initFinanceApp();
  }
}

function showAuthError(id, msg) {
  const el = auth$(`#${id}`);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideAuthErrors() {
  auth$$(".auth-error").forEach((el) => el.classList.add("hidden"));
}

function auth$$(sel) {
  return document.querySelectorAll(sel);
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getOtpSession() {
  try {
    const raw = sessionStorage.getItem(OTP_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOtpSession(data) {
  sessionStorage.setItem(OTP_SESSION_KEY, JSON.stringify(data));
}

function clearOtpSession() {
  sessionStorage.removeItem(OTP_SESSION_KEY);
  if (otpResendTimer) {
    clearInterval(otpResendTimer);
    otpResendTimer = null;
  }
}

async function createAndShowOtp(email) {
  const otp = generateOtp();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const otpHash = await hashSecret(otp, salt);

  saveOtpSession({
    email: normalizeEmail(email),
    otpHash,
    salt: bufToB64(salt),
    expiry: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    sentAt: Date.now(),
  });

  const masked = maskEmail(email);
  auth$("#otpSentEmail").textContent = masked;
  auth$("#otpDisplayCode").textContent = otp;
  auth$("#otpExpiryHint").textContent = "Valid for 10 minutes";

  showAuthScreen("authReset");
  startResendCooldown();
}

function maskEmail(email) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

function startResendCooldown() {
  const btn = auth$("#resendOtpBtn");
  if (!btn) return;

  const session = getOtpSession();
  if (!session) return;

  const update = () => {
    const left = OTP_RESEND_COOLDOWN_MS - (Date.now() - session.sentAt);
    if (left <= 0) {
      btn.disabled = false;
      btn.textContent = "Resend OTP";
      clearInterval(otpResendTimer);
      otpResendTimer = null;
      return;
    }
    btn.disabled = true;
    btn.textContent = `Resend in ${Math.ceil(left / 1000)}s`;
  };

  update();
  otpResendTimer = setInterval(update, 1000);
}

async function handleSetup(e) {
  e.preventDefault();
  hideAuthErrors();

  const password = auth$("#setupPassword").value;
  const confirm = auth$("#setupConfirm").value;
  const email = auth$("#setupEmail").value;

  if (password.length < 6) {
    showAuthError("setupError", "Password must be at least 6 characters.");
    return;
  }
  if (password !== confirm) {
    showAuthError("setupError", "Passwords do not match.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError("setupError", "Enter a valid recovery email.");
    return;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashSecret(password, salt);

  saveAuth({
    passwordHash,
    salt: bufToB64(salt),
    recoveryEmail: normalizeEmail(email),
    createdAt: new Date().toISOString(),
  });

  setAuthenticated(true);
  auth$("#setupForm").reset();
  showApp();
}

async function handleLogin(e) {
  e.preventDefault();
  hideAuthErrors();

  const auth = getAuth();
  if (!auth) {
    showAuthScreen("authSetup");
    return;
  }

  const password = auth$("#loginPassword").value;
  const salt = b64ToBuf(auth.salt);
  const hash = await hashSecret(password, salt);

  if (hash !== auth.passwordHash) {
    showAuthError("loginError", "Incorrect password. Try again.");
    return;
  }

  setAuthenticated(true);
  auth$("#loginForm").reset();
  showApp();
}

async function handleForgot(e) {
  e.preventDefault();
  hideAuthErrors();

  const auth = getAuth();
  const email = normalizeEmail(auth$("#forgotEmail").value);

  if (!auth) {
    showAuthScreen("authSetup");
    return;
  }

  if (email !== auth.recoveryEmail) {
    showAuthError("forgotError", "Recovery email does not match our records.");
    return;
  }

  await createAndShowOtp(email);
  auth$("#forgotForm").reset();
}

async function handleReset(e) {
  e.preventDefault();
  hideAuthErrors();

  const session = getOtpSession();
  if (!session || Date.now() > session.expiry) {
    showAuthError("resetError", "OTP expired. Request a new one.");
    return;
  }

  if (session.attempts >= 5) {
    showAuthError("resetError", "Too many attempts. Request a new OTP.");
    return;
  }

  const otp = auth$("#resetOtp").value.trim();
  const newPassword = auth$("#resetPassword").value;
  const confirm = auth$("#resetConfirm").value;

  if (!/^\d{6}$/.test(otp)) {
    showAuthError("resetError", "Enter the 6-digit OTP.");
    return;
  }

  const salt = b64ToBuf(session.salt);
  const otpHash = await hashSecret(otp, salt);

  if (otpHash !== session.otpHash) {
    session.attempts += 1;
    saveOtpSession(session);
    const left = 5 - session.attempts;
    showAuthError(
      "resetError",
      left > 0 ? `Invalid OTP. ${left} attempt(s) left.` : "Invalid OTP. Request a new one."
    );
    return;
  }

  if (newPassword.length < 6) {
    showAuthError("resetError", "New password must be at least 6 characters.");
    return;
  }
  if (newPassword !== confirm) {
    showAuthError("resetError", "Passwords do not match.");
    return;
  }

  const authData = getAuth();
  const passSalt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashSecret(newPassword, passSalt);

  saveAuth({
    ...authData,
    passwordHash,
    salt: bufToB64(passSalt),
    updatedAt: new Date().toISOString(),
  });

  clearOtpSession();
  setAuthenticated(true);
  auth$("#resetForm").reset();
  showApp();
}

function destroyChartsOnLock() {
  if (typeof window.destroyFinanceCharts === "function") {
    window.destroyFinanceCharts();
  }
}

function initAuth() {
  auth$("#setupForm")?.addEventListener("submit", handleSetup);
  auth$("#loginForm")?.addEventListener("submit", handleLogin);
  auth$("#forgotForm")?.addEventListener("submit", handleForgot);
  auth$("#resetForm")?.addEventListener("submit", handleReset);

  auth$("#gotoForgot")?.addEventListener("click", () => {
    hideAuthErrors();
    showAuthScreen("authForgot");
  });

  auth$("#backToLogin")?.addEventListener("click", () => {
    hideAuthErrors();
    clearOtpSession();
    showAuthScreen("authLogin");
  });

  auth$("#backFromForgot")?.addEventListener("click", () => {
    hideAuthErrors();
    showAuthScreen("authLogin");
  });

  auth$("#resendOtpBtn")?.addEventListener("click", async () => {
    const session = getOtpSession();
    if (!session) return;
    const left = OTP_RESEND_COOLDOWN_MS - (Date.now() - session.sentAt);
    if (left > 0) return;
    await createAndShowOtp(session.email);
  });

  auth$("#logoutBtn")?.addEventListener("click", () => {
    setAuthenticated(false);
    hideAuthErrors();
    auth$("#loginPassword").value = "";
    destroyChartsOnLock();
    showAuthScreen("authLogin");
  });

  if (isAuthenticated() && getAuth()) {
    showApp();
    return;
  }

  setAuthenticated(false);
  if (getAuth()) {
    showAuthScreen("authLogin");
  } else {
    showAuthScreen("authSetup");
  }
}

document.addEventListener("DOMContentLoaded", initAuth);
