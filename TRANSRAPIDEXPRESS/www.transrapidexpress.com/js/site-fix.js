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
      // We'll calculate top/left on hover/click
      
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
    // Find all mobile menu sections: `.fixed.top-[64px] .flex-1.flex.flex-col > .flex.flex-col`
    const mobileMenuDivs = document.querySelectorAll('.fixed.top-\\[64px\\] .flex-1.flex.flex-col > .flex.flex-col');
    
    mobileMenuDivs.forEach(container => {
      const label = container.querySelector('a.flex-1');
      if (!label) return;
      const labelText = label.textContent.trim();
      if (labelText.toLowerCase() !== sectionName.toLowerCase()) return;
      
      // Found the matching section, get its sub-links
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
    
    let isOpen = false;
    
    menuBtn.addEventListener('click', function () {
      isOpen = !isOpen;
      menuBtn.setAttribute('aria-expanded', isOpen);
      
      if (isOpen) {
        drawer.style.transform = 'translateX(0)';
        if (backdrop) {
          backdrop.style.opacity = '1';
          backdrop.style.pointerEvents = 'auto';
        }
      } else {
        drawer.style.transform = 'translateX(100%)';
        if (backdrop) {
          backdrop.style.opacity = '0';
          backdrop.style.pointerEvents = 'none';
        }
      }
    });
    
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        isOpen = false;
        menuBtn.setAttribute('aria-expanded', 'false');
        drawer.style.transform = 'translateX(100%)';
        backdrop.style.opacity = '0';
        backdrop.style.pointerEvents = 'none';
      });
    }
    
    // Mobile sub-menu toggles
    const subMenuBtns = drawer.querySelectorAll('button.p-1\\.5');
    subMenuBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const container = btn.closest('.flex.flex-col');
        const submenu = container.querySelector('.overflow-hidden');
        if (!submenu) return;
        
        const isExpanded = submenu.style.maxHeight && submenu.style.maxHeight !== '0px';
        if (isExpanded) {
          submenu.style.maxHeight = '0px';
          submenu.style.opacity = '0';
          btn.querySelector('svg').style.transform = 'rotate(0deg)';
        } else {
          submenu.style.maxHeight = '500px';
          submenu.style.opacity = '1';
          btn.querySelector('svg').style.transform = 'rotate(180deg)';
        }
      });
    });
  }

  // ─── 4. THEME SWITCHER ───
  function initThemeSwitcher() {
    const themeButtons = document.querySelectorAll('button[type="button"]');
    
    themeButtons.forEach(btn => {
      const text = btn.textContent.trim().toLowerCase();
      if (text === 'light' || text === 'dark' || text === 'auto') {
        btn.addEventListener('click', function () {
          const html = document.documentElement;
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
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.classList.remove('light', 'dark');
            html.classList.add(prefersDark ? 'dark' : 'light');
            html.style.colorScheme = prefersDark ? 'dark' : 'light';
            localStorage.setItem('theme', 'system');
          }
        });
      }
    });
    
    // Desktop theme button
    const desktopThemeBtn = document.querySelector('button[data-slot="dropdown-menu-trigger"]');
    if (desktopThemeBtn && desktopThemeBtn.textContent.includes('Theme')) {
      desktopThemeBtn.addEventListener('click', function () {
        const html = document.documentElement;
        const isDark = html.classList.contains('dark');
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
      });
    }
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

  // Live chat code removed, Tawk.to handles everything now.

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

  // ─── INIT ALL ───
  function initAll() {
    initDesktopDropdowns();
    initMobileMenu();
    initThemeSwitcher();
    initScrollToTop();
    initStickyHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
