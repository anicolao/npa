import { defineHotkey, setClip } from "./hotkey";
import { logCount } from "./logging";

declare global {
  var NeptunesPride: {
    npui: {
      map: {
        canvas: HTMLCanvasElement[];
      };
    };
  };
}

export interface ScreenshotSettings {
  ibbApiKey: string;
}

let settings: ScreenshotSettings;

export const setScreenshotSettings = (newSettings: ScreenshotSettings) => {
  settings = newSettings;
};

export const screenshot = async (): Promise<void> => {
  const map = NeptunesPride.npui.map;
  const key = settings.ibbApiKey;
  if (!key) {
    // Import showOptions dynamically to avoid circular dependency
    const { showOptions } = await import("./ui-controls");
    showOptions({ missingKey: "ibbApiKey" });
    return;
  }
  const dataUrl = map.canvas[0].toDataURL("image/webp", 0.45);
  const split = dataUrl.indexOf(",") + 1;
  const params = {
    expiration: 2592000,
    key,
    image: dataUrl.substring(split),
  };
  const resp = await fetch(`https://api.imgbb.com/1/upload`, {
    method: "POST",
    redirect: "follow",
    body: new URLSearchParams(params as any),
  });
  const r = await resp.json();
  if (r?.data?.url) {
    setClip(`[[${r.data.url}]]`);
  } else {
    const message = `Error: ${JSON.stringify(r)}`;
    logCount(message);
    setClip(message);
  }
};

export const registerScreenshotHotkeys = () => {
  defineHotkey(
    "#",
    screenshot,
    "Uses your imgbb API key to upload a screenshot of the map.",
    "Screenshot",
  );
};
