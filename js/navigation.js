function initMobileNavigation() {
  // Check if hamburger already exists
  if (document.querySelector('.hamburger-btn')) return;
  
  // Find header
  const header = document.querySelector('header');
  if (!header) return;
  
  // Create hamburger button (only on mobile)
  const hamburgerBtn = document.createElement('button');
  hamburgerBtn.className = 'hamburger-btn md:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-[#191b22] text-primary';
  hamburgerBtn.innerHTML = '<span class="material-symbols-outlined">menu</span>';
  hamburgerBtn.onclick = openMobileMenu;
  
  // Insert at beginning of header
  const firstChild = header.firstChild;
  if (firstChild) {
    header.insertBefore(hamburgerBtn, firstChild);
  } else {
    header.appendChild(hamburgerBtn);
  }
  
  // Create drawer menu if not exists
  if (!document.querySelector('.mobile-drawer')) {
    const drawer = document.createElement('div');
    drawer.className = 'mobile-drawer fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm hidden';
    drawer.onclick = function(e) {
      if (e.target === this) closeMobileMenu();
    };
    drawer.innerHTML = `
      <div class="absolute top-0 left-0 w-72 h-full bg-[#191b22] shadow-2xl p-6 flex flex-col gap-4 transform -translate-x-full transition-transform duration-300">
        <div class="flex items-center justify-between mb-8">
          <div class="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 4 L20 12 L28 13 L22 19 L23.5 27 L16 23 L8.5 27 L10 19 L4 13 L12 12 Z" fill="none" stroke="#c4c0ff" stroke-width="1.5"/>
              <circle cx="16" cy="16" r="4" fill="#8781ff" opacity="0.6"/>
            </svg>
            <span class="font-black text-sm text-primary uppercase">Itachi</span>
          </div>
          <button onclick="closeMobileMenu()" class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
        <nav class="flex flex-col gap-2">
          <a href="dashboard.html" class="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-white/5 transition-all">
            <span class="material-symbols-outlined">dashboard</span>Dashboard
          </a>
          <a href="subjects.html" class="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-white/5 transition-all">
            <span class="material-symbols-outlined">menu_book</span>Subjects
          </a>
          <a href="timetable.html" class="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-white/5 transition-all">
            <span class="material-symbols-outlined">calendar_today</span>Timetable
          </a>
          <a href="focus.html" class="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-white/5 transition-all">
            <span class="material-symbols-outlined">timer</span>Focus Mode
          </a>
          <a href="progress.html" class="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-white/5 transition-all">
            <span class="material-symbols-outlined">insights</span>Progress
          </a>
          <a href="settings.html" class="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-white/5 transition-all">
            <span class="material-symbols-outlined">settings</span>Settings
          </a>
        </nav>
        <div class="mt-auto pt-6 border-t border-white/10">
          <button onclick="if(window.Auth) Auth.signOut()" class="flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-white/5 transition-all w-full">
            <span class="material-symbols-outlined">logout</span>Sign Out
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);
  }
}

function openMobileMenu() {
  const drawer = document.querySelector('.mobile-drawer');
  const menu = drawer?.querySelector('.absolute');
  if (drawer && menu) {
    drawer.classList.remove('hidden');
    setTimeout(() => {
      menu.style.transform = 'translateX(0)';
    }, 10);
  }
}

function closeMobileMenu() {
  const drawer = document.querySelector('.mobile-drawer');
  const menu = drawer?.querySelector('.absolute');
  if (drawer && menu) {
    menu.style.transform = 'translateX(-100%)';
    setTimeout(() => {
      drawer.classList.add('hidden');
    }, 300);
  }
}

function removeBottomNav() {
  // Remove all mobile bottom navigation bars
  document.querySelectorAll('.md\\:hidden.fixed.bottom-0, nav.fixed.bottom-0, .bottom-nav').forEach(el => el.remove());
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initMobileNavigation();
  removeBottomNav();
});

// Make functions global
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;