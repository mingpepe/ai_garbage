# Flutter Raytracing

A Flutter implementation of a simple raytracer, rewritten from a WPF (C#) project.

## Features

- **Raytracing Engine**: Supports sphere and plane intersections.
- **Lighting**: Simple Lambertian lighting model with ambient and diffuse components.
- **Shadows**: Real-time shadow ray calculation.
- **Environment**: Sky gradient and a procedural checkerboard floor.
- **Interactive Controls**:
  - `W` / `S` / `A` / `D`: Move the camera.
  - `Arrow Keys`: Move the light source.

## Implementation Details

- **Language**: Dart (Flutter Framework).
- **Core Library**: `vector_math` for 3D vector operations.
- **Rendering**: Directly writes to a `Uint8List` pixel buffer and displays using `ui.ImageDescriptor`.
- **Comments**: All source code is documented in English as requested.

## Getting Started

1.  Ensure you have Flutter installed.
2.  Navigate to the project directory: `cd flutter_raytracing`.
3.  Install dependencies: `flutter pub get`.
4.  Run the application: `flutter run`.
