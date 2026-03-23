// js/auth-guard.js
// Shared auth guard for all protected pages

let currentUser = null;

async function requireAuth() {
  // Wait for Auth to be ready
  let retries = 0;
  while (!window.Auth && retries < 50) {
    await new Promise(r => setTimeout(r, 100));
    retries++;
  }
  
  if (!window.Auth) {
    console.error('Auth not loaded');
    window.location.href = 'login.html';
    return null;
  }
  
  try {
    const user = await Auth.getUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    
    // Check onboarding status unless we're already on onboarding
    if (!window.location.pathname.endsWith('onboarding.html') && !window.location.pathname.endsWith('auth-callback.html')) {
      const profile = await window.ProfileAPI.get(user.id);
      if (!profile || !profile.onboarding_complete) {
        window.location.href = 'onboarding.html';
        return null;
      }
    }
    
    currentUser = user;
    return user;
  } catch (err) {
    console.error('Auth error:', err);
    window.location.href = 'login.html';
    return null;
  }
}

function getUser() {
  return currentUser;
}

// Make functions global
window.requireAuth = requireAuth;
window.getUser = getUser;