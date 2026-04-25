import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";

test("documents embedded image and youtube content", async ({
  appPage,
}, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Embedded Content Validation",
    validationGoal:
      "Verify that NPA renders embedded images and YouTube videos when provided with specific URL patterns in double brackets.",
    docsTitle: "Embedded Images and Videos",
    docsSummary:
      "NPA supports rich content embedding in messages and reports. By wrapping a valid Imgur, ibb.co, or YouTube URL in double brackets, you can display images or video players directly within the interface.",
    bookSection: "Embedded content",
  });

  await waitForAgentHooks(appPage);

  appPage.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  // Step 1: Open NPA UI
  await helper.step("open-npa-ui", {
    description: "Open the NP Agent UI",
    verifications: [
      {
        spec: "Pressing ` opens the NPA report screen",
        check: async () => {
          await appPage.keyboard.press("Backquote");
          await expect(appPage.getByText("NP Agent")).toBeVisible();
        },
      },
    ],
    documentation: {
      summary:
        "Open the Agent UI to prepare for content injection. Images and videos can be rendered in any area that uses the NPA-enhanced Crux.format, such as reports or message logs.",
      howToUse: ["Press **`** to open the Agent UI."],
      expectedResult: [
        "The NP Agent overlay appears.",
      ],
    },
  });

  // Step 2: Render Embedded Image
  await helper.step("embedded-image", {
    description: "Render an embedded image from Imgur",
    verifications: [
      {
        spec: "Double-bracketed Imgur URLs render as <img> tags",
        check: async () => {
          await appPage.evaluate(() => {
            console.log("DEBUG: Starting image injection");
            let output = document.querySelector(".txt_selectable");
            if (!output) {
              console.log("DEBUG: Creating fallback output");
              output = document.createElement("div");
              output.className = "txt_selectable pad12";
              output.style.background = "#000";
              output.style.color = "#fff";
              output.style.minHeight = "200px";
              output.style.width = "400px";
              output.style.position = "absolute";
              output.style.top = "100px";
              output.style.left = "100px";
              output.style.zIndex = "10000";
              document.body.appendChild(output);
            }
            const markup = "Check out this image: [[https://i.imgur.com/8f6D9Rz.png]]";
            const rendered = (window as any).Crux.format(markup, {});
            output.innerHTML = rendered;
          });

          const img = appPage.locator(".txt_selectable img");
          await expect(img).toBeVisible();
          await expect(img).toHaveAttribute("src", "https://i.imgur.com/8f6D9Rz.png");
          await expect(img).toHaveAttribute("width", "100%");
        },
      },
    ],
    documentation: {
      summary:
        "Valid image URLs from supported hosts (Imgur, ibb.co) wrapped in `[[...]]` are automatically converted into full-width images.",
      howToUse: [
        "Include a URL like `[[https://i.imgur.com/example.png]]` in a message or report.",
      ],
      expectedResult: [
        "The URL is replaced by an `<img>` tag displaying the referenced image.",
      ],
    },
  });

  // Step 3: Render Embedded YouTube Video
  await helper.step("embedded-youtube", {
    description: "Render an embedded YouTube video",
    verifications: [
      {
        spec: "Double-bracketed YouTube URLs render as <iframe> embeds",
        check: async () => {
          await appPage.evaluate(() => {
            console.log("DEBUG: Starting youtube injection");
            let output = document.querySelector(".txt_selectable");
            if (!output) {
              output = document.createElement("div");
              output.className = "txt_selectable pad12";
              output.style.background = "#000";
              output.style.color = "#fff";
              output.style.minHeight = "200px";
              output.style.width = "400px";
              output.style.position = "absolute";
              output.style.top = "100px";
              output.style.left = "100px";
              output.style.zIndex = "10000";
              document.body.appendChild(output);
            }
            const markup = "Watch this video: [[https://www.youtube.com/watch?v=dQw4w9WgXcQ]]";
            const rendered = (window as any).Crux.format(markup, {});
            output.innerHTML = rendered;
          });

          const iframe = appPage.locator(".txt_selectable iframe");
          await expect(iframe).toBeVisible();
          await expect(iframe).toHaveAttribute("src", "https://www.youtube.com/embed/dQw4w9WgXcQ");
          
          const link = appPage.locator(".txt_selectable a");
          await expect(link).toContainText("Open Youtube in a new tab");
          await expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        },
      },
    ],
    documentation: {
      summary:
        "YouTube watch URLs wrapped in `[[...]]` are converted into an embedded player with a fallback link to open the video in a new tab.",
      howToUse: [
        "Include a YouTube URL like `[[https://www.youtube.com/watch?v=dQw4w9WgXcQ]]` in your text.",
      ],
      expectedResult: [
        "An `<iframe>` player appears centered in the text area, followed by a direct link.",
      ],
    },
  });

  helper.generateDocs();
});
