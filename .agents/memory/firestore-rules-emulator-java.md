---
name: Firestore rules emulator Java
description: Local Java runtime requirement for Firebase Firestore emulator tests.
---

Firebase CLI 15's Firestore emulator requires Java 21 or later. In this Replit environment, installing JDK 21 may not change the active `java` while JDK 17 is still installed earlier on `PATH`.

**Why:** The emulator rejected Java 17. Installing JDK 21 alone did not change the active runtime; removing the separately installed JDK 17 made the standard rules-test command use Java 21.

**How to apply:** If `firebase emulators:exec` reports an unsupported Java version, check `java -version`. Install JDK 21 through Replit package management, remove an older manually installed JDK if it shadows 21, then rerun the existing test script.