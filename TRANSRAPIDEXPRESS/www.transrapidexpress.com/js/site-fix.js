/**
 * site-fix.js — Replaces React/Radix UI interactivity with vanilla JS
 * Fixes: preloader, nav dropdowns, mobile menu, theme switcher, scroll-to-top
 */
(function () {
  "use strict";

  // ─── 1. PRELOADER: Auto-hide after page loads ───
  function hidePreloader() {
    const preloader = document.querySelector('.fixed.inset-0.z-\\[200\\]');
    if (preloader) {
      preloader.style.opacity = '0';
      preloader.style.pointerEvents = 'none';
      setTimeout(() => { preloader.style.display = 'none'; }, 600);
    }
  }

  // Hide preloader on load, with a fallback timeout
  if (document.readyState === 'complete') {
    setTimeout(hidePreloader, 300);
  } else {
    window.addEventListener('load', function () {
      setTimeout(hidePreloader, 300);
    });
  }
  // Safety: always hide after 3s max
  setTimeout(hidePreloader, 3000);

  // ─── 2. DESKTOP NAV DROPDOWNS ───
  function initDesktopDropdowns() {
    const navTriggers = document.querySelectorAll('nav [aria-haspopup="menu"]');
    
    navTriggers.forEach(trigger => {
      // Build dropdown content from the mobile menu data
      const triggerText = trigger.textContent.trim().replace(/\s+/g, ' ').split(' ')[0];
      
      // Find the corresponding mobile menu section
      const mobileLinks = findMobileMenuLinks(triggerText);
      
      if (mobileLinks.length === 0) return;
      
      // Create dropdown panel
      const dropdown = document.createElement('div');
      dropdown.className = 'nav-dropdown-panel';
      dropdown.style.cssText = `
        position: absolute;
        min-width: 220px;
        background: var(--card, #fff);
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
        padding: 8px;
        z-index: 99999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s, transform 0.2s;
        transform: translateX(-50%) translateY(4px);
      `;
      
      mobileLinks.forEach(link => {
        const a = document.createElement('a');
        a.href = link.href;
        a.textContent = link.text;
        a.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 500;
          color: var(--muted-foreground, #6b7280);
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.15s;
        `;
        a.addEventListener('mouseenter', () => {
          a.style.backgroundColor = 'var(--secondary, #f3f4f6)';
          a.style.color = 'var(--foreground, #111827)';
        });
        a.addEventListener('mouseleave', () => {
          a.style.backgroundColor = 'transparent';
          a.style.color = 'var(--muted-foreground, #6b7280)';
        });
        dropdown.appendChild(a);
      });
      
      document.body.appendChild(dropdown);
      
      function positionDropdown() {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        dropdown.style.left = (rect.left + window.scrollX + (rect.width / 2)) + 'px';
      }
      
      // Prevent navigation on click, toggle dropdown instead
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeAllDropdowns();
        const isOpen = dropdown.style.opacity === '1';
        if (!isOpen) {
          positionDropdown();
          dropdown.style.opacity = '1';
          dropdown.style.pointerEvents = 'auto';
          dropdown.style.transform = 'translateX(-50%) translateY(0)';
        }
      });
      
      // Close on mouse leave
      trigger.addEventListener('mouseleave', function () {
        setTimeout(() => {
          if (!trigger.matches(':hover') && !dropdown.matches(':hover')) {
            dropdown.style.opacity = '0';
            dropdown.style.pointerEvents = 'none';
            dropdown.style.transform = 'translateX(-50%) translateY(4px)';
          }
        }, 100);
      });
      
      dropdown.addEventListener('mouseleave', function () {
        dropdown.style.opacity = '0';
        dropdown.style.pointerEvents = 'none';
        dropdown.style.transform = 'translateX(-50%) translateY(4px)';
      });
    });
    
    // Close dropdowns on outside click
    document.addEventListener('click', closeAllDropdowns);
  }
  
  function closeAllDropdowns() {
    document.querySelectorAll('.nav-dropdown-panel').forEach(d => {
      d.style.opacity = '0';
      d.style.pointerEvents = 'none';
      d.style.transform = 'translateX(-50%) translateY(4px)';
    });
  }
  
  function findMobileMenuLinks(sectionName) {
    const links = [];
    const mobileMenuDivs = document.querySelectorAll('.fixed.top-\\[64px\\] .flex-1.flex.flex-col > .flex.flex-col');
    
    mobileMenuDivs.forEach(container => {
      const label = container.querySelector('a.flex-1');
      if (!label) return;
      const labelText = label.textContent.trim();
      if (labelText.toLowerCase() !== sectionName.toLowerCase()) return;
      
      const subLinks = container.querySelectorAll('.overflow-hidden a');
      subLinks.forEach(a => {
        links.push({ href: a.getAttribute('href'), text: a.textContent.trim() });
      });
    });
    
    return links;
  }

  // ─── 3. MOBILE MENU TOGGLE ───
  function initMobileMenu() {
    const menuBtn = document.querySelector('button[aria-label="Toggle navigation menu"]');
    const backdrop = document.querySelector('.fixed.inset-0.top-\\[64px\\].z-40');
    const drawer = document.querySelector('.fixed.top-\\[64px\\].right-0.z-50.h-\\[calc\\(100dvh-64px\\)\\]');
    
    if (!menuBtn || !drawer) return;

    // ── CRITICAL FIX: Clone ALL three elements (button, backdrop, drawer) ──
    // This breaks React's DOM references entirely, preventing React hydration
    // or re-renders from wiping the drawer content or resetting classes/styles.
    // React's virtual DOM still points to the OLD nodes which are now detached.
    var newMenuBtn = menuBtn.cloneNode(true);
    menuBtn.parentNode.replaceChild(newMenuBtn, menuBtn);

    var activeBackdrop = null;
    if (backdrop) {
      var newBackdrop = backdrop.cloneNode(true);
      backdrop.parentNode.replaceChild(newBackdrop, backdrop);
      activeBackdrop = newBackdrop;
    }

    var newDrawer = drawer.cloneNode(true);
    drawer.parentNode.replaceChild(newDrawer, drawer);
    // From this point on, use newDrawer exclusively — React no longer controls it

    // Force drawer to be properly hidden initially
    // Tailwind v4 uses CSS 'translate' property, NOT 'transform'
    newDrawer.style.willChange = 'translate';
    // Ensure the drawer starts off-screen
    newDrawer.classList.remove('translate-x-0');
    newDrawer.classList.add('translate-x-full');
    // Explicitly set the closed translate state via inline style
    // This overrides any stale class-based translate
    newDrawer.style.translate = '100% 0';
    // Fix: add a proper transition for the 'translate' CSS property
    // The 'transition-transform' class in the HTML has NO CSS rule defined
    // in Tailwind v4's output, so we set it manually
    newDrawer.style.transitionProperty = 'translate';
    newDrawer.style.transitionDuration = '300ms';
    newDrawer.style.transitionTimingFunction = 'ease-in-out';
    
    // Ensure all text inside the drawer is visible by applying explicit colors
    // This overrides any CSS variable issues
    var isDark = document.documentElement.classList.contains('dark');
    function applyMenuColors() {
      isDark = document.documentElement.classList.contains('dark');
      var fg = isDark ? '#f8f6f1' : '#111827';
      var muted = isDark ? '#94a3b8' : '#6b7280';
      var bg = isDark ? '#0a1628' : '#ffffff';
      var accent = '#c8a45e';
      
      newDrawer.style.backgroundColor = bg;
      newDrawer.style.color = fg;
      
      // Style all links inside the drawer
      newDrawer.querySelectorAll('a').forEach(function(a) {
        if (!a.closest('.overflow-hidden')) {
          a.style.color = fg;
        } else {
          a.style.color = muted;
        }
      });
      
      // Style sub-menu labels
      newDrawer.querySelectorAll('.flex-1.py-1').forEach(function(el) {
        el.style.color = fg;
      });
      
      // Style all buttons
      newDrawer.querySelectorAll('button').forEach(function(btn) {
        btn.style.color = fg;
      });
      
      // Style the Track Shipment button at the bottom
      var trackBtn = newDrawer.querySelector('a[href="track.html"] button, a[href="/track"] button');
      if (trackBtn) {
        trackBtn.style.backgroundColor = accent;
        trackBtn.style.color = '#ffffff';
      }
    }
    
    applyMenuColors();

    // Add a close button at the top of the drawer if not already present
    let closeBtn = newDrawer.querySelector('.mobile-menu-close-btn');
    if (!closeBtn) {
      closeBtn = document.createElement('button');
      closeBtn.className = 'mobile-menu-close-btn';
      closeBtn.setAttribute('aria-label', 'Close navigation menu');
      closeBtn.innerHTML = '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
      closeBtn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: none;
        background: transparent;
        cursor: pointer;
        transition: background 0.2s;
        margin-left: auto;
        margin-bottom: 8px;
      `;
      closeBtn.addEventListener('mouseenter', function() {
        closeBtn.style.backgroundColor = isDark ? 'rgba(200,164,94,0.1)' : '#f3f4f6';
      });
      closeBtn.addEventListener('mouseleave', function() {
        closeBtn.style.backgroundColor = 'transparent';
      });

      const scrollContainer = newDrawer.querySelector('.flex-1.overflow-y-auto, .flex-1.flex.flex-col.overflow-y-auto');
      if (scrollContainer) {
        scrollContainer.insertBefore(closeBtn, scrollContainer.firstChild);
      } else {
        const firstChild = newDrawer.querySelector('.flex-1');
        if (firstChild) {
          firstChild.insertBefore(closeBtn, firstChild.firstChild);
        }
      }
    }

    let isOpen = false;

    function openMenu() {
      isOpen = true;
      newMenuBtn.setAttribute('aria-expanded', 'true');
      // Tailwind v4 uses CSS 'translate' property, NOT 'transform'
      newDrawer.style.translate = '0 0';
      newDrawer.classList.remove('translate-x-full');
      newDrawer.classList.add('translate-x-0');
      if (activeBackdrop) {
        activeBackdrop.style.opacity = '1';
        activeBackdrop.style.pointerEvents = 'auto';
      }
      document.body.style.overflow = 'hidden';
      applyMenuColors();
    }

    function closeMenu() {
      isOpen = false;
      newMenuBtn.setAttribute('aria-expanded', 'false');
      // Tailwind v4 uses CSS 'translate' property, NOT 'transform'
      newDrawer.style.translate = '100% 0';
      newDrawer.classList.remove('translate-x-0');
      newDrawer.classList.add('translate-x-full');
      if (activeBackdrop) {
        activeBackdrop.style.opacity = '0';
        activeBackdrop.style.pointerEvents = 'none';
      }
      document.body.style.overflow = '';
    }
    
    newMenuBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });
    
    if (activeBackdrop) {
      activeBackdrop.addEventListener('click', closeMenu);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeMenu);
    }
    
    // Close menu on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) {
        closeMenu();
      }
    });

    // Close menu when clicking a link inside it
    newDrawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function () {
        closeMenu();
      });
    });
    
    // Mobile sub-menu toggles — use broad selector to catch all accordion buttons
    newDrawer.querySelectorAll('button.p-1\\.5, button.hover\\:bg-secondary, button[class*="chevron"]').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        var container = btn.closest('.flex.flex-col');
        var submenu = container ? container.querySelector('.overflow-hidden') : null;
        if (!submenu) return;
        
        var isExpanded = submenu.style.maxHeight && submenu.style.maxHeight !== '0px' && submenu.style.maxHeight !== '';
        if (isExpanded) {
          submenu.style.maxHeight = '0px';
          submenu.style.opacity = '0';
          var svg = btn.querySelector('svg');
          if (svg) svg.style.transform = 'rotate(0deg)';
        } else {
          submenu.style.maxHeight = '500px';
          submenu.style.opacity = '1';
          var svg = btn.querySelector('svg');
          if (svg) svg.style.transform = 'rotate(180deg)';
        }
      });
    });
    
    // Watch for theme changes to re-apply colors
    var observer = new MutationObserver(function() {
      applyMenuColors();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // ─── 4. THEME SWITCHER ───
  function initThemeSwitcher() {
    // Apply saved theme on load (respect user preference)
    var savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else if (savedTheme === 'system') {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(prefersDark ? 'dark' : 'light');
      document.documentElement.style.colorScheme = prefersDark ? 'dark' : 'light';
    } else {
      // Default to light theme if no preference saved
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
      if (!savedTheme) localStorage.setItem('theme', 'light');
    }

    // Helper: toggle between light and dark
    function toggleTheme() {
      var html = document.documentElement;
      var isDark = html.classList.contains('dark');
      if (isDark) {
        html.classList.remove('dark');
        html.classList.add('light');
        html.style.colorScheme = 'light';
        localStorage.setItem('theme', 'light');
      } else {
        html.classList.remove('light');
        html.classList.add('dark');
        html.style.colorScheme = 'dark';
        localStorage.setItem('theme', 'dark');
      }
    }

    // Attach to buttons with explicit light/dark/auto text
    var themeButtons = document.querySelectorAll('button[type="button"]');
    themeButtons.forEach(function(btn) {
      var text = btn.textContent.trim().toLowerCase();
      if (text === 'light' || text === 'dark' || text === 'auto') {
        btn.addEventListener('click', function () {
          var html = document.documentElement;
          if (text === 'light') {
            html.classList.remove('dark');
            html.classList.add('light');
            html.style.colorScheme = 'light';
            localStorage.setItem('theme', 'light');
          } else if (text === 'dark') {
            html.classList.remove('light');
            html.classList.add('dark');
            html.style.colorScheme = 'dark';
            localStorage.setItem('theme', 'dark');
          } else {
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.classList.remove('light', 'dark');
            html.classList.add(prefersDark ? 'dark' : 'light');
            html.style.colorScheme = prefersDark ? 'dark' : 'light';
            localStorage.setItem('theme', 'system');
          }
        });
      }
    });

    // Desktop theme toggle button (text contains "Theme")
    // This catches the button in the header: <span>Theme</span>
    var desktopThemeBtn = document.querySelector('button[data-slot="dropdown-menu-trigger"]');
    if (desktopThemeBtn && desktopThemeBtn.textContent.includes('Theme')) {
      desktopThemeBtn.addEventListener('click', toggleTheme);
    }

    // Also find the Theme button by its text content (for pages without data-slot)
    // This catches the header Theme button on track.html and other pages
    document.querySelectorAll('button[type="button"]').forEach(function(btn) {
      var text = btn.textContent.trim().toLowerCase();
      // Match "Theme" button but not already-handled light/dark/auto buttons
      if (text.indexOf('theme') !== -1 && text !== 'light' && text !== 'dark' && text !== 'auto') {
        // Check it's not already the data-slot button we handled above
        if (!btn.hasAttribute('data-slot')) {
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
          });
        }
      }
    });
  }

  // ─── 5. SCROLL TO TOP ───
  function initScrollToTop() {
    const scrollBtn = document.querySelector('button[aria-label="Scroll to top"]');
    if (!scrollBtn) return;
    
    window.addEventListener('scroll', function () {
      if (window.scrollY > 400) {
        scrollBtn.style.opacity = '1';
        scrollBtn.style.pointerEvents = 'auto';
      } else {
        scrollBtn.style.opacity = '0';
        scrollBtn.style.pointerEvents = 'none';
      }
    });
    
    scrollBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ─── 7. STICKY HEADER SCROLL EFFECT ───
  function initStickyHeader() {
    const header = document.querySelector('header.sticky');
    if (!header) return;
    
    window.addEventListener('scroll', function () {
      if (window.scrollY > 10) {
        header.style.boxShadow = '0 1px 3px 0 rgba(0,0,0,0.1)';
      } else {
        header.style.boxShadow = 'none';
      }
    });
  }

  // ─── 8. REMOVE ANY STALE TRACK OVERLAYS ───
  function removeStaleOverlays() {
    // Remove any leftover custom-track-overlay elements that might have been
    // injected by previous versions of track-sync-v3.js
    document.querySelectorAll('.custom-track-overlay').forEach(el => {
      el.remove();
    });
    // Also remove any close buttons for the old overlay
    document.querySelectorAll('.close-track-btn').forEach(el => {
      el.remove();
    });
  }

  // ─── 9. TRACKING PAGE SPECIFIC FIXES ───
  // The tracking page (track.html) may have issues with buttons not being
  // properly initialized due to Next.js hydration or timing issues.
  // This function runs aggressive re-initialization specifically for that page.
  function initTrackingPageFixes() {
    var isTrackPage = window.location.pathname.includes('track.html') || window.location.pathname.endsWith('/track');
    if (!isTrackPage) return;

    // --- AGGRESSIVE THEME BUTTON FIX ---
    // Find ALL buttons and check if any contain "Theme" text
    // Use a broader search and attach with capture phase to ensure we catch the click
    function forceThemeToggle() {
      var html = document.documentElement;
      var isDark = html.classList.contains('dark');
      if (isDark) {
        html.classList.remove('dark');
        html.classList.add('light');
        html.style.colorScheme = 'light';
        localStorage.setItem('theme', 'light');
      } else {
        html.classList.remove('light');
        html.classList.add('dark');
        html.style.colorScheme = 'dark';
        localStorage.setItem('theme', 'dark');
      }
    }

    // Search for Theme button using multiple strategies
    var allButtons = document.querySelectorAll('button');
    allButtons.forEach(function(btn) {
      var btnText = (btn.textContent || '').trim().toLowerCase();
      var hasThemeText = btnText.indexOf('theme') !== -1;
      var hasMonitorSvg = btn.querySelector('svg rect[height="14"][rx="2"]'); // Monitor SVG icon

      if (hasThemeText || (hasMonitorSvg && btn.type === 'button')) {
        // Remove existing click handlers by cloning
        var newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          forceThemeToggle();
        }, true); // Use capture phase
      }
    });

    // --- AGGRESSIVE MOBILE MENU FIX ---
    // Re-ensure the mobile menu button works
    var mobileMenuBtn = document.querySelector('button[aria-label="Toggle navigation menu"]');
    var mobileBackdrop = document.querySelector('.fixed.inset-0.top-\\[64px\\].z-40');
    var mobileDrawer = document.querySelector('.fixed.top-\\[64px\\].right-0.z-50');

    if (mobileMenuBtn && mobileDrawer) {
      // Check if the button already has our custom handler by testing a click
      // If the drawer doesn't respond, we need to re-attach
      var drawerClosed = mobileDrawer.style.translate === '100% 0' || mobileDrawer.classList.contains('translate-x-full') || !mobileDrawer.style.translate;

      // Always re-clone to be safe (break any stale React references)
      var freshBtn = mobileMenuBtn.cloneNode(true);
      mobileMenuBtn.parentNode.replaceChild(freshBtn, mobileMenuBtn);

      var freshBackdrop = null;
      if (mobileBackdrop) {
        freshBackdrop = mobileBackdrop.cloneNode(true);
        mobileBackdrop.parentNode.replaceChild(freshBackdrop, mobileBackdrop);
      }

      var freshDrawer = mobileDrawer.cloneNode(true);
      mobileDrawer.parentNode.replaceChild(freshDrawer, mobileDrawer);

      // Force initial closed state
      freshDrawer.style.willChange = 'translate';
      freshDrawer.style.translate = '100% 0';
      freshDrawer.style.transitionProperty = 'translate';
      freshDrawer.style.transitionDuration = '300ms';
      freshDrawer.style.transitionTimingFunction = 'ease-in-out';
      freshDrawer.classList.remove('translate-x-0');
      freshDrawer.classList.add('translate-x-full');

      if (freshBackdrop) {
        freshBackdrop.style.opacity = '0';
        freshBackdrop.style.pointerEvents = 'none';
      }

      var menuOpen = false;

      function openMobileMenu() {
        menuOpen = true;
        freshDrawer.style.translate = '0 0';
        freshDrawer.classList.remove('translate-x-full');
        freshDrawer.classList.add('translate-x-0');
        if (freshBackdrop) {
          freshBackdrop.style.opacity = '1';
          freshBackdrop.style.pointerEvents = 'auto';
        }
        document.body.style.overflow = 'hidden';
        // Apply colors
        var isDark = document.documentElement.classList.contains('dark');
        freshDrawer.style.backgroundColor = isDark ? '#0a1628' : '#ffffff';
        freshDrawer.style.color = isDark ? '#f8f6f1' : '#111827';
        freshDrawer.querySelectorAll('a').forEach(function(a) {
          if (!a.closest('.overflow-hidden')) {
            a.style.color = isDark ? '#f8f6f1' : '#111827';
          } else {
            a.style.color = isDark ? '#94a3b8' : '#6b7280';
          }
        });
      }

      function closeMobileMenu() {
        menuOpen = false;
        freshDrawer.style.translate = '100% 0';
        freshDrawer.classList.remove('translate-x-0');
        freshDrawer.classList.add('translate-x-full');
        if (freshBackdrop) {
          freshBackdrop.style.opacity = '0';
          freshBackdrop.style.pointerEvents = 'none';
        }
        document.body.style.overflow = '';
      }

      freshBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (menuOpen) closeMobileMenu();
        else openMobileMenu();
      }, true);

      if (freshBackdrop) {
        freshBackdrop.addEventListener('click', closeMobileMenu);
      }

      // Add close button inside drawer
      var closeBtn = freshDrawer.querySelector('.mobile-menu-close-btn');
      if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-menu-close-btn';
        closeBtn.setAttribute('aria-label', 'Close navigation menu');
        closeBtn.innerHTML = '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
        closeBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;border:none;background:transparent;cursor:pointer;margin-left:auto;margin-bottom:8px;';
        var scrollContainer = freshDrawer.querySelector('.flex-1');
        if (scrollContainer) scrollContainer.insertBefore(closeBtn, scrollContainer.firstChild);
      }
      closeBtn.addEventListener('click', closeMobileMenu);

      // Sub-menu toggles inside mobile menu
      freshDrawer.querySelectorAll('button.p-1\\.5, button.hover\\:bg-secondary').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          e.preventDefault();
          var container = btn.closest('.flex.flex-col');
          var submenu = container ? container.querySelector('.overflow-hidden') : null;
          if (!submenu) return;
          var isExpanded = submenu.style.maxHeight && submenu.style.maxHeight !== '0px' && submenu.style.maxHeight !== '';
          if (isExpanded) {
            submenu.style.maxHeight = '0px';
            submenu.style.opacity = '0';
            var svg = btn.querySelector('svg');
            if (svg) svg.style.transform = 'rotate(0deg)';
          } else {
            submenu.style.maxHeight = '500px';
            submenu.style.opacity = '1';
            var svg = btn.querySelector('svg');
            if (svg) svg.style.transform = 'rotate(180deg)';
          }
        });
      });

      // Close menu when clicking links inside it
      freshDrawer.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', closeMobileMenu);
      });

      // Escape key to close
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && menuOpen) closeMobileMenu();
      });

      // Watch for theme changes
      var themeObserver = new MutationObserver(function() {
        var isDark = document.documentElement.classList.contains('dark');
        freshDrawer.style.backgroundColor = isDark ? '#0a1628' : '#ffffff';
        freshDrawer.style.color = isDark ? '#f8f6f1' : '#111827';
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    // --- ADD THEME TOGGLE TO MOBILE MENU ---
    // Since the Theme button is hidden on mobile (hidden md:inline-flex),
    // add a theme toggle option inside the mobile drawer
    if (mobileDrawer) {
      var drawer = document.querySelector('.fixed.top-\\[64px\\].right-0.z-50') || freshDrawer;
      if (drawer) {
        var existingThemeToggle = drawer.querySelector('.mobile-theme-toggle');
        if (!existingThemeToggle) {
          var themeToggleItem = document.createElement('div');
          themeToggleItem.className = 'mobile-theme-toggle';
          themeToggleItem.style.cssText = 'padding:12px 16px;border-top:1px solid var(--border, #e5e7eb);margin-top:8px;';
          var themeToggleBtn = document.createElement('button');
          themeToggleBtn.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--border, #e5e7eb);background:transparent;cursor:pointer;font-size:14px;font-weight:600;transition:background 0.15s;';
          themeToggleBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> <span>Toggle Dark Mode</span>';
          themeToggleBtn.addEventListener('click', function() {
            forceThemeToggle();
            // Update button text
            var isNowDark = document.documentElement.classList.contains('dark');
            themeToggleBtn.querySelector('span').textContent = isNowDark ? 'Toggle Light Mode' : 'Toggle Dark Mode';
            // Update colors in drawer
            var drawerEl = document.querySelector('.fixed.top-\\[64px\\].right-0.z-50');
            if (drawerEl) {
              drawerEl.style.backgroundColor = isNowDark ? '#0a1628' : '#ffffff';
              drawerEl.style.color = isNowDark ? '#f8f6f1' : '#111827';
              themeToggleBtn.style.color = isNowDark ? '#f8f6f1' : '#111827';
              themeToggleBtn.style.borderColor = isNowDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
            }
          });
          // Set initial state
          var isInitiallyDark = document.documentElement.classList.contains('dark');
          themeToggleBtn.querySelector('span').textContent = isInitiallyDark ? 'Toggle Light Mode' : 'Toggle Dark Mode';
          themeToggleBtn.style.color = isInitiallyDark ? '#f8f6f1' : '#111827';
          themeToggleBtn.style.borderColor = isInitiallyDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
          themeToggleItem.appendChild(themeToggleBtn);

          // Insert before the Track Shipment button at the bottom
          var trackBtnContainer = drawer.querySelector('.p-6.border-t');
          if (trackBtnContainer) {
            trackBtnContainer.parentNode.insertBefore(themeToggleItem, trackBtnContainer);
          } else {
            drawer.appendChild(themeToggleItem);
          }
        }
      }
    }
  }

  // ─── INIT ALL ───
  function initAll() {
    removeStaleOverlays();
    initDesktopDropdowns();
    initMobileMenu();
    initThemeSwitcher();
    initScrollToTop();
    initStickyHeader();
    // Run tracking page fixes AFTER everything else
    setTimeout(initTrackingPageFixes, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
