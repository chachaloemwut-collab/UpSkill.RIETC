let expiry: ReturnType<typeof setTimeout> | undefined;

// Framework navigations include Link, router.push/replace and history traversal.
export function onRouterTransitionStart(href: string) {
  clearTimeout(expiry);
  const url = new URL(href, location.href);
  if (url.pathname === location.pathname && url.search === location.search) {
    delete document.documentElement.dataset.routePending;
    return;
  }
  document.documentElement.dataset.routePending = "true";
  // A navigation cancelled back to the same URL may never commit a new pathname.
  expiry = setTimeout(() => { delete document.documentElement.dataset.routePending; }, 15000);
}
