0,#










,
,
 Recommendations for Improvement

Based on the current state of the codebase, here are several high-impact recommendations to enhance the application's performance, maintainability, and user experience.

## 🏗️ Architecture & Maintainability

### 1. Frontend Componentization
The `index.html` file is currently a single 1500-line document. 
- **Goal**: Split the UI into logical Vue components (e.g., `Sidebar`, `ScheduleTable`, `NotesModal`, `OccupancyScanner`).
- **Benefit**: dramatically improves code readability and makes it easier to work on specific features without wading through unrelated HTML.

### 2. Further Script Modularization
While we've extracted `report.js`, `js/app.js` is still over 1100 lines.
- **Goal**: Extract the following into dedicated modules:
  - `occupancy.js`: All logic related to classroom occupancy scanning.
  - `favorites.js`: Logic for managing favorite groups/teachers and persistence.
  - `admin.js`: Navigation/editing functions for global links.
- **Benefit**: Reduces the cognitive load when reading the main app orchestrator.

### 3. Backend Refactoring (Excel Generation)
The functions `generateMonthSheet` and `generateSummarySheet` in `api/index.js` are very long and handle everything from styling to data transformation.
- **Goal**: Create a set of "Excel Helper" functions for common tasks:
  - `drawBorderedCell(sheet, range, value, style)`
  - `applyLessonSpecificFormatting(row, lessonType)`
- **Benefit**: Makes the core report logic much clearer and reduces code duplication.

## ⚡ Performance

### 4. Persistent API Caching
Currently, the backend caches Osvita API responses in a simple in-memory `Map`. This clears every time the server restarts (common in serverless environments like Vercel).
- **Goal**: Extend the `proxyCache` logic to use **Redis** or **Vercel KV** (which you already have infrastructure for).
- **Benefit**: Significantly faster response times for all users, as data won't need to be re-fetched from the external API as often.

### 5. PWA Enhancements (Offline Mode)
- **Goal**: Improve the Service Worker to cache the *most recently viewed* schedule data in IndexedDB.
- **Benefit**: Allows users to check their schedule even when they have a poor internet connection or are completely offline.

## ✨ User Experience (UX)

### 6. Granular Progress Feedback
Parallel fetching made reports faster, but for 6-month reports, the user still waits 5-10 seconds with a simple "Generating..." spinner.
- **Goal**: Implement a status endpoint or use a multi-step fetch where the frontend can poll for progress (e.g., "Monthly data collected: 4/6").
- **Benefit**: Reduces perceived wait time and provides better feedback.

### 7. Advanced Filtering
- **Goal**: Add the ability to filter the schedule by lesson type (e.g., "Only show Lectures") or specific keywords.
- **Benefit**: Helps users find specific information in dense semester schedules.

---

> [!TIP]
> **Suggested First Step**: I recommend starting with **Persistent API Caching (Point 4)** as it provides the most immediate "hidden" speed boost, followed by **Frontend Componentization (Point 1)** to clean up the workspace.

Would you like me to start implementing any of these?
