# NPA Documentation Style Guide

This guide defines the standards for writing documentation for the Neptune's Pride Assistant (NPA). Our goal is to create a "book" that feels like it was written for the user, focusing on how to win the game and why specific features are useful, rather than how the software is built or tested.

## 1. Philosophy: User-Centric Documentation

Documentation should always prioritize the user's needs. Every feature overview must answer:
- **What is it?** (Clear definition)
- **Why should I use it?** (Strategic value)
- **When is it most useful?** (Contextual advice)

### Speak to the User
Avoid passive or mechanical descriptions. Instead of "The `%` key cycles timebases," use "Press **%** to cycle through different ways of viewing time, depending on whether you are coordinating with allies or setting personal alarms."

---

## 2. Content Structure

Each documentation section should follow this general flow:

1.  **High-Level Overview:** 1-2 paragraphs explaining the purpose of the toolset or feature.
2.  **Feature Breakdown:** Detailed explanations of specific controls or overlays.
3.  **Walkthrough Examples:** Concrete scenarios using screenshots to illustrate the feature in action.
4.  **Strategic Tips/Caveats:** Real-world advice on how to get the most out of the feature or common pitfalls to avoid.

---

## 3. Handling Screenshots and Examples

Screenshots are **illustrative examples**, not exact replications of the user's game.

### The "Example" Rule
Never tell the user to select a specific star name as if it exists in their game.
- **Incorrect:** "Select Hot Sham and press x."
- **Correct:** "Select an enemy star (such as `Hot Sham` in the example below) and press **x** to create a planning fleet."

### Describing Screenshots
When referring to a screenshot, use phrasing that acknowledges it as an example:
- "As shown in the screenshot, the route line indicates..."
- "In this example, the selected fleet is traveling to..."

---

## 4. Documenting Hotkeys

Hotkeys are the core of the NPA experience. They should be documented by their **intent**.

### Define Purpose First
Before listing the keypress, explain what the user is trying to achieve.
- **Example:** "To coordinate precise arrival times with allies, you can cycle the timebase to show absolute tick numbers by pressing **%**."

### Handle Toggles and Cycles
If a key cycles through multiple modes (like **%** or **.**), explain the whole cycle upfront before diving into the specific screenshots for each state. This helps the user build a mental model of how the key behaves.

---

## 5. What to Avoid (The "Never" List)

-   **No Internal Jargon:** Never reference "book sections," "E2E tests," "playwright scenarios," or "test fixtures."
-   **No Generation Metadata:** Do not include lines like `Book section: [Name]`. This information belongs in the automation layer, not the user-facing text.
-   **No "Test-Talk":** Avoid describing the state as "stable" or "asserted." Talk about the game state (e.g., "Once the fleet has been created...").
-   **No Precise Data Reliance:** Avoid relying on specific numbers (e.g., "Notice the 4-tick ETA") unless you frame them as examples ("The ETA, which is 4 ticks in this scenario, shows...").

---

## 6. Formatting Standards

-   **Keys:** Bold all hotkeys (e.g., **x**, **Ctrl+9**, **%**).
-   **Star/Player Names:** Use backticks for names appearing in examples (e.g., `Mega Segin`, `Macomber`).
-   **Headers:** Use consistent H1 for titles, H2 for major features, and H3 for specific examples/steps.
-   **Lists:** Use bullet points for "How to use it" and "What to expect" sections to keep them scannable.

---

## 7. Tone and Style

-   **Senior Peer:** Write as if you are a veteran player explaining a powerful tool to another serious player.
-   **Direct and Concise:** Avoid fluff. If a sentence doesn't help the user understand or use the tool, remove it.
-   **Empirical:** Base advice on how the tool actually behaves in the game, focusing on the tactical advantage it provides.
