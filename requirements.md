# foundit — Product Requirements

An offline Progressive Web App (PWA) that runs in a phone's browser and helps users track where they put things. All data is stored locally in IndexedDB. The app is only intended to be used once installed on the device's home screen. No authentication is necessary as the app is local only.

---

## Table of Contents

1. [Milestone 1 — MVP: Core Shell & Offline Infrastructure](#milestone-1)
1. [Milestone 3 — Storage Bins](#milestone-2)
1. [Milestone 4 — Object Inventory](#milestone-3)
1. [Milestone 5 — Object Lookup & Movement](#milestone-4)
1. [Milestone 6 — Swipe-to-Inventory](#milestone-5)
1. [Milestone 7 — Orphaned Objects Management](#milestone-6)
1. [Milestone 8 — Polish & Hardening](#milestone-7)

---

## Milestone 1 — MVP: Core Shell & Offline Infrastructure {#milestone-1}

Establish the technical foundation: a working offline-capable PWA shell that installs to the home screen and persists data in IndexedDB.

### Objectives

- **PWA Manifest**: Provide a `manifest.json` with app name, icons, `display: standalone`, and `start_url` so the browser offers an "Add to Home Screen" prompt.
- **Home Screen Gate**: On launch, detect whether the app is running in standalone mode (`window.navigator.standalone` on iOS, `display-mode: standalone` media query on Android). If not, show a full-screen splash that instructs the user to install the app and blocks further use.
- **Service Worker**: Register a service worker that pre-caches all static assets (HTML, CSS, JS, icons) at install time so the app loads fully offline after the first visit.
- **Offline Network Strategy**: Implement a cache-first strategy for all app assets. Network requests are never required for the app to function.
- **IndexedDB Layer**: Create a thin data-access module that wraps IndexedDB with promise-based helpers for CRUD operations. Define initial object stores: `bins` and `items`.
- **Mobile-First UI Shell**: Build a base layout optimised for small screens (375 px+) with a bottom navigation bar, safe-area insets for notched devices, and no horizontal scroll.
- **iOS & Android Compatibility**: Verify the install flow and standalone behaviour on both Safari (iOS 16+) and Chrome (Android 10+).
- **Azure deployment**: App will be deployed to Azure

---

## Milestone 2 — Storage Bins {#milestone-3}

Allow users to model their physical storage locations as a nestable hierarchy of named bins.

### Objectives

- **Create Bin**: Users can create a new bin by providing a name (required, max 64 characters). Each bin is assigned a UUID and stored in IndexedDB.
- **Rename Bin**: Users can edit the name of any existing bin in place.
- **Delete Bin**: Users can delete a bin. If the bin contains child bins or items, the user must confirm. Child bins and items become orphaned (no parent) rather than deleted.
- **Nested Bins**: A bin may have at most one parent bin, allowing a tree structure of arbitrary depth (e.g. House → Bedroom → Wardrobe → Top Shelf). A bin cannot be nested inside itself or its own descendants.
- **Bin Browser**: A screen that displays the top-level bins and lets users drill down into nested bins. The current path (breadcrumb) is shown at the top.
- **Bin Detail View**: Selecting a bin shows its direct child bins and the items directly assigned to it.

---

## Milestone 3 — Object Inventory {#milestone-4}

Allow users to create and manage an inventory of physical objects and assign each to a storage bin.

### Objectives

- **Add Item**: Users can add a new item (name required, max 128 characters, optional short description). Each item is assigned a UUID and stored in the `items` object store.
- **Assign Item to Bin**: When adding an item, the user selects the bin it currently lives in. Assignment is optional — an item with no bin is considered orphaned.
- **Edit Item**: Users can update an item's name and description.
- **Delete Item**: Users can delete an item after confirming. Deletion is permanent.
- **Item List within Bin**: The bin detail view lists all items directly assigned to that bin, showing name and a truncated description.
- **Empty State**: When a bin has no items and no child bins, display a contextual empty state message.

---

## Milestone 4 — Object Lookup & Movement {#milestone-5}

Allow users to quickly find where an object is and move it to a different location.

### Objectives

- **Global Search**: A search bar accessible from the bottom navigation bar. As the user types, items and bins whose names match the query are listed in real time (client-side filtering, no network call).
- **Item Location Display**: Selecting an item from any list shows its full location path (e.g. Car → Glove Compartment), rendered as a tappable breadcrumb.
- **Quick Move**: From the item detail screen, a "Move" action opens a bin picker. The user navigates the bin tree and selects a new destination. The item's `binId` is updated in IndexedDB immediately.
- **Move Confirmation**: After moving, a brief dismissible toast confirms the new location.
- **Recently Accessed Items**: The home screen shows the five most recently viewed or moved items for quick re-access.
- **Location History**: Keep track of last 10 locations of ecah object, along with date and time
- **Most Likely Locations**: For each object, keep track of the most likely storage bins it may be found in

---

## Milestone 5 — Swipe-to-Inventory {#milestone-6}

Allow users to audit the contents of a bin using a card-swipe interaction, confirming or flagging each item one at a time.

### Objectives

- **Swipe Mode Entry**: A "Verify Contents" button in the bin detail view starts swipe mode for items directly within that bin.
- **Card UI**: Each item is displayed as a card showing its name and description. Cards are stacked visually to indicate a queue.
- **Swipe Right — Confirmed**: Swiping right (or tapping a checkmark button) marks the item as confirmed in its current bin. The next item's card animates in.
- **Swipe Left — Misplaced**: Swiping left (or tapping an X button) flags the item as misplaced. The item is not deleted; it becomes orphaned (bin assignment cleared) so it appears in the orphaned items list for rehousing.
- **Progress Indicator**: Show "X of Y" progress during swipe mode.
- **Completion Screen**: When all cards in a bin have been swiped, display a summary (e.g. "12 confirmed, 3 flagged as misplaced") with options to return to the bin or go to orphaned items.
- **Swipe Gesture Physics**: Use CSS transforms and a touch event handler to produce fluid card drag-and-release animations. Include visual feedback (green tint for right, red tint for left) as the card is dragged.

---

## Milestone 6 — Orphaned Objects Management {#milestone-7}

Allow users to review all unhoused items and assign each one to a storage bin.

### Objectives

- **Orphaned Items List**: A dedicated screen (accessible from the bottom nav) lists all items with no bin assignment.
- **Badge Count**: The bottom nav icon for orphaned items shows a badge with the current orphan count when non-zero.
- **Swipe-to-Rehouse Queue**: Users can enter a swipe mode for orphaned items. Swiping right on a card opens the bin picker immediately so the item can be assigned. Swiping left defers the item (leaves it orphaned, moves to end of queue).
- **Quick Assign from List**: Tapping an orphaned item in the list view also opens the bin picker for direct assignment without entering swipe mode.
- **Zero-Orphan State**: When all orphaned items have been assigned, display a celebratory empty state.

---

## Milestone 7 — Polish & Hardening {#milestone-8}

Refine the experience, ensure reliability, and prepare the app for everyday use.

### Objectives

- **Haptic Feedback**: Trigger haptic vibration (`navigator.vibrate`) on swipe commit actions (right or left) where supported.
- **Undo Last Action**: For destructive or movement actions (delete item, move item, swipe-left flag), provide a brief (5-second) undo toast.
- **Keyboard & Focus Management**: Ensure all interactive elements are reachable via external keyboard (for users with Bluetooth keyboards). Trap focus in modals and bottom sheets.
- **Accessible Markup**: Add ARIA roles, labels, and live regions where needed. Swipe cards must have accessible button alternatives (already included in Milestone 6, validated here).
- **IndexedDB Error Handling**: Surface user-facing error messages if a write fails (e.g., storage quota exceeded). Provide guidance to free up space.
- **Service Worker Update Flow**: When a new version of the app is deployed, detect the waiting service worker and prompt the user with a "Update available — tap to refresh" banner.
- **Performance Audit**: Achieve a Lighthouse PWA score ≥ 90 and a First Contentful Paint ≤ 1.5 s on a mid-range device over a throttled connection (simulated first load only; subsequent loads are fully offline).
- **Data Export**: Allow users to export their full inventory (bins + items) as a JSON file via the share sheet or a direct download, as a manual backup mechanism. Allow importing this data, offering a choice of "overwrite mode" or "merge mode"
- **Icon & Branding**: Finalise app icon set (48 px – 512 px), splash screens for iOS, and a themed status bar colour.
