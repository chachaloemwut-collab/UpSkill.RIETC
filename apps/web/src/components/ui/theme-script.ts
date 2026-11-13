// Server-safe (no "use client"): rendered inline in <head> by the root layout with the CSP nonce.
export const THEME_STORAGE_KEY = "vec-ui-theme";
const KEY = THEME_STORAGE_KEY;

/**
 * Inline <head> script (rendered with the CSP nonce) that applies the saved theme before first paint, so there is
 * no light-to-dark flash. Kept in sync with `apply()` in theme.tsx.
 */
export const THEME_INIT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${KEY}")||"{}");var d=typeof s.dark==="boolean"?s.dark:matchMedia("(prefers-color-scheme: dark)").matches;var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=typeof s.color==="string"?s.color:"zinc";if(typeof s.radius==="number")r.style.setProperty("--radius",s.radius+"rem")}catch(e){}`;

