import { useEffect } from "react";

const SCRIPT_ID = "wowhead-tooltips";
const SCRIPT_URL = "https://wow.zamimg.com/js/tooltips.js";

declare global {
  interface Window {
    whTooltips?: { colorLinks: boolean; iconizeLinks: boolean; renameLinks: boolean };
  }
}

/**
 * Loads Wowhead's tooltip script once, on the first armory page. It shows the in-game tooltip on
 * hover for any link to wowhead.com, including links rendered later, so pages only render links.
 * The armory draws its own names and icons, so the script must not rewrite the links.
 */
export function useWowheadTooltips(): void {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID) !== null) return;
    window.whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    document.head.appendChild(script);
  }, []);
}
