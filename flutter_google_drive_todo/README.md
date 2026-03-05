# Google Drive Todo (Flutter Web)

A Flutter web implementation of the Google Drive Todo application, ported from a React-based project.

## Features

- **Google Drive Integration**: Automatically searches for or creates `todo_list.xls`.
- **Google Sheets Sync**: Real-time two-way synchronization of tasks and their status.
- **Todo Management**: Add, edit, and toggle task completion.
- **Filter Support**: View all, done, or pending tasks.
- **Responsive Design**: Modern Material 3 UI optimized for web usage.

## Implementation Details

- **Language**: Dart (Flutter Framework).
- **Core Libraries**: `google_sign_in`, `googleapis`, `http`.
- **UI**: Responsive Column-based layout with `ConstrainedBox`.

## Known Issues

- **Google Sign-In (Web)**: Currently experiencing initialization issues in some environments. Users may see console warnings regarding `gapi.client` not being loaded or OAuth token handling. The login button may not consistently trigger the authentication popup on all browsers.

## Getting Started

1.  Navigate to the project directory: `cd flutter_google_drive_todo`.
2.  Install dependencies: `flutter pub get`.
3.  Run the application on a fixed port: `flutter run -d chrome --web-port 8080`.
4.  Ensure `http://localhost:8080` is added to your **Authorized JavaScript origins** in Google Cloud Console.
