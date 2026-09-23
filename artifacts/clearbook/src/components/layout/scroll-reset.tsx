import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * A page opened from a link starts at the top. The browser keeps the scroll position across a
 * pushState, so without this the landing opened from the bottom of a long page would start in
 * the middle of its story. Back and forward keep the position the browser restores itself, and
 * the first render leaves reload and anchor handling to the browser too.
 */
export function ScrollReset() {
  const [location] = useLocation();
  const poppedTo = useRef<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const onPop = () => {
      poppedTo.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A layout effect moves the page before it paints, so the old position never shows.
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // A pop lands on the path it recorded; anything else is a new page.
    const restored = poppedTo.current === window.location.pathname;
    poppedTo.current = null;
    // The stylesheet asks for smooth scrolling, which would animate the new page to its top.
    if (!restored) window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);

  return null;
}
