# MediCaps Commons

Static forum ready for GitHub Pages, with shared posts stored in Firebase Cloud Firestore.

## Firebase setup

1. Create a Firebase project at https://console.firebase.google.com/.
2. Add a Web app in Project settings.
3. Create a Cloud Firestore database.
4. Copy the Web app config into `firebase-config.js`.
5. For a demo, paste the contents of `firestore.rules` into Firestore Rules and publish them.

The included rules allow public reads and writes so the static site can work without a server. That is fine for a demo, but not safe for a real public forum. For production, use Firebase Authentication and stricter Firestore rules.

## GitHub Pages deploy

1. Push `index.html`, `app.js`, `database.js`, `firebase-config.js`, and `firestore.rules` to a GitHub repository.
2. Open the repository on GitHub.
3. Go to Settings -> Pages.
4. Set the source to the main branch and the root folder.
5. Open the GitHub Pages URL after the deployment finishes.

For local testing, serve the folder with a small web server instead of opening `index.html` directly.
