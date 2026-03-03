using System;
using System.Numerics;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace wpf_raytracing
{
    public partial class MainWindow : Window
    {
        // Rendering resolution
        private const int RenderWidth = 400;
        private const int RenderHeight = 300;
        
        // Reusable bitmap and pixel array
        private readonly WriteableBitmap bitmap;
        private readonly byte[] pixels;

        // Scene settings
        private Vector3 cameraPos = new Vector3(0, 1.5f, -4.5f);
        private Vector3 lightPos = new Vector3(2, 5, -2);
        
        private readonly float sphereRadius = 1.0f;
        private readonly Vector3 sphereCenter = new Vector3(0, 1, 0);
        private readonly Vector3 sphereColor = new Vector3(1.0f, 0.2f, 0.2f); // Red
        private readonly float lightSize = 0.2f; // Visual size of the light source

        public MainWindow()
        {
            InitializeComponent();
            bitmap = new WriteableBitmap(RenderWidth, RenderHeight, 96, 96, PixelFormats.Bgr32, null);
            pixels = new byte[RenderWidth * RenderHeight * 4];
            RenderRaytracing();
        }

        private void Window_KeyDown(object sender, KeyEventArgs e)
        {
            // Smaller move speed for smoother control
            float moveSpeed = 0.1f;

            // WASD controls for Camera
            if (e.Key == Key.W) cameraPos.Z += moveSpeed;
            if (e.Key == Key.S) cameraPos.Z -= moveSpeed;
            if (e.Key == Key.A) cameraPos.X -= moveSpeed;
            if (e.Key == Key.D) cameraPos.X += moveSpeed;

            // Arrow keys controls for Light
            if (e.Key == Key.Up) lightPos.Y += moveSpeed;
            if (e.Key == Key.Down) lightPos.Y -= moveSpeed;
            if (e.Key == Key.Left) lightPos.X -= moveSpeed;
            if (e.Key == Key.Right) lightPos.X += moveSpeed;

            RenderRaytracing();
        }

        private void RenderRaytracing()
        {
            for (int y = 0; y < RenderHeight; y++)
            {
                for (int x = 0; x < RenderWidth; x++)
                {
                    // Map screen coordinates to [-1, 1] with aspect ratio
                    float u = (2.0f * (x + 0.5f) / RenderWidth - 1.0f) * ((float)RenderWidth / RenderHeight);
                    float v = 1.0f - 2.0f * (y + 0.5f) / RenderHeight;

                    Vector3 rayDir = Vector3.Normalize(new Vector3(u, v, 1.0f));
                    
                    // Trace ray and get final color
                    Vector3 color = Trace(cameraPos, rayDir);

                    // Write to pixel array (BGRA format)
                    int index = (y * RenderWidth + x) * 4;
                    pixels[index] = (byte)(Math.Clamp(color.Z, 0, 1) * 255);     // B
                    pixels[index + 1] = (byte)(Math.Clamp(color.Y, 0, 1) * 255); // G
                    pixels[index + 2] = (byte)(Math.Clamp(color.X, 0, 1) * 255); // R
                    pixels[index + 3] = 255;                                     // A
                }
            }

            bitmap.WritePixels(new Int32Rect(0, 0, RenderWidth, RenderHeight), pixels, RenderWidth * 4, 0);
            RenderImageControl.Source = bitmap;
        }

        private Vector3 Trace(Vector3 rayOrigin, Vector3 rayDir)
        {
            float tSphere = IntersectSphere(rayOrigin, rayDir, sphereCenter, sphereRadius);
            float tPlane = IntersectPlane(rayOrigin, rayDir, new Vector3(0, 1, 0), 0);
            float tLight = IntersectSphere(rayOrigin, rayDir, lightPos, lightSize); // Visualized light

            float t = float.MaxValue;
            int hitObj = -1; // 0: Sphere, 1: Floor, 2: Light Source

            if (tSphere > 0)
            {
                t = tSphere;
                hitObj = 0;
            }
            if (tPlane > 0 && tPlane < t)
            {
                t = tPlane;
                hitObj = 1;
            }
            if (tLight > 0 && tLight < t)
            {
                t = tLight;
                hitObj = 2;
            }

            // If no hit, return sky gradient
            if (hitObj == -1)
            {
                float skyT = 0.5f * (rayDir.Y + 1.0f);
                return (1.0f - skyT) * new Vector3(1.0f, 1.0f, 1.0f) + skyT * new Vector3(0.5f, 0.7f, 1.0f);
            }

            // If hit the light source itself, return bright white
            if (hitObj == 2) return new Vector3(2.0f, 2.0f, 2.0f);

            Vector3 hitPoint = rayOrigin + rayDir * t;
            Vector3 normal;
            Vector3 objColor;

            if (hitObj == 0) // Hit Red Sphere
            {
                normal = Vector3.Normalize(hitPoint - sphereCenter);
                objColor = sphereColor;
            }
            else // Hit Checkerboard Floor
            {
                normal = new Vector3(0, 1, 0);
                float scale = 1.0f;
                bool isWhite = (Math.Floor(hitPoint.X * scale) + Math.Floor(hitPoint.Z * scale)) % 2 == 0;
                objColor = isWhite ? new Vector3(0.9f, 0.9f, 0.9f) : new Vector3(0.3f, 0.3f, 0.3f);
            }

            // Lighting calculations
            Vector3 lightDir = Vector3.Normalize(lightPos - hitPoint);
            float distToLight = Vector3.Distance(lightPos, hitPoint);
            
            // Shadow Ray Detection
            // Offset the origin slightly along the normal to avoid self-intersection (Shadow Acne)
            Vector3 shadowOrigin = hitPoint + normal * 0.001f;
            float sSphere = IntersectSphere(shadowOrigin, lightDir, sphereCenter, sphereRadius);
            
            bool inShadow = false;
            // If shadow ray hits something between the hitPoint and the light source
            if (sSphere > 0 && sSphere < distToLight)
            {
                inShadow = true;
            }

            float ambient = 0.15f;
            float diffuse = inShadow ? 0 : Math.Max(0, Vector3.Dot(normal, lightDir));

            // Simple Lambertian lighting model
            Vector3 finalColor = objColor * (ambient + diffuse * 0.85f);

            return finalColor;
        }

        private float IntersectSphere(Vector3 origin, Vector3 dir, Vector3 center, float radius)
        {
            Vector3 oc = origin - center;
            float b = Vector3.Dot(oc, dir);
            float c = Vector3.Dot(oc, oc) - radius * radius;
            float h = b * b - c;

            if (h >= 0)
            {
                float t = -b - (float)Math.Sqrt(h);
                if (t > 0) return t;
            }
            return -1.0f;
        }

        private float IntersectPlane(Vector3 origin, Vector3 dir, Vector3 normal, float d)
        {
            float denom = Vector3.Dot(normal, dir);
            if (Math.Abs(denom) > 1e-6)
            {
                float t = (d - Vector3.Dot(normal, origin)) / denom;
                if (t > 0) return t;
            }
            return -1.0f;
        }
    }
}