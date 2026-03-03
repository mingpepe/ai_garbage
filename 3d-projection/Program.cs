using System;
using System.Numerics;
using System.Threading;

namespace ThreeDProjection
{
    class Program
    {
        struct Triangle
        {
            public Vector3[] Points;
            public Triangle(Vector3 p1, Vector3 p2, Vector3 p3)
            {
                Points = new Vector3[] { p1, p2, p3 };
            }
        }

        static void Main(string[] args)
        {
            Console.CursorVisible = false;

            // Define a static 3D triangle
            Triangle tri = new Triangle(
                new Vector3(0, 1, 0),    // Top
                new Vector3(-1, -1, -0.5f), // Bottom Left
                new Vector3(1, -1, 0.5f)    // Bottom Right
            );

            int width = Console.WindowWidth;
            int height = Console.WindowHeight;

            if (width > 0 && height > 0)
            {
                char[,] buffer = new char[width, height];
                for (int y = 0; y < height; y++)
                    for (int x = 0; x < width; x++)
                        buffer[x, y] = ' ';

                // Rasterize the triangle (filled) once
                FillTriangle(tri, buffer, width, height);

                // Output to screen
                Console.SetCursorPosition(0, 0);
                for (int y = 0; y < height; y++)
                {
                    char[] row = new char[width];
                    for (int x = 0; x < width; x++) row[x] = buffer[x, y];
                    Console.Write(row);
                    if (y < height - 1) Console.WriteLine();
                }
            }

            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
        }

        static void FillTriangle(Triangle tri, char[,] buffer, int width, int height)
        {
            float fov = 2.0f;
            float zOffset = 3.0f;
            Vector2[] p = new Vector2[3];

            // Project 3D points to 2D screen coordinates
            for (int i = 0; i < 3; i++)
            {
                float z = tri.Points[i].Z + zOffset;
                // Simple perspective projection
                p[i] = new Vector2(
                    (tri.Points[i].X * fov / z) * width / 2 + width / 2,
                    (-tri.Points[i].Y * fov / z) * height / 2 + height / 2
                );
            }

            // Find Bounding Box for the projected triangle
            int minX = (int)Math.Max(0, Math.Min(p[0].X, Math.Min(p[1].X, p[2].X)));
            int maxX = (int)Math.Min(width - 1, Math.Max(p[0].X, Math.Max(p[1].X, p[2].X)));
            int minY = (int)Math.Max(0, Math.Min(p[0].Y, Math.Min(p[1].Y, p[2].Y)));
            int maxY = (int)Math.Min(height - 1, Math.Max(p[0].Y, Math.Max(p[1].Y, p[2].Y)));

            // Iterate through every pixel in the bounding box
            for (int y = minY; y <= maxY; y++)
            {
                for (int x = minX; x <= maxX; x++)
                {
                    Vector2 pixel = new Vector2(x, y);

                    // Cross product (Edge Function) check
                    // CrossProduct2D returns the signed area of the triangle formed by (A, B, P)
                    float w0 = CrossProduct2D(p[1], p[2], pixel);
                    float w1 = CrossProduct2D(p[2], p[0], pixel);
                    float w2 = CrossProduct2D(p[0], p[1], pixel);

                    // If the point is on the same side of all three edges, it is inside the triangle
                    if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0))
                    {
                        buffer[x, y] = '#';
                    }
                }
            }
        }

        // 2D Cross Product (Edge Function)
        // Computes: (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x)
        static float CrossProduct2D(Vector2 a, Vector2 b, Vector2 p)
        {
            return (b.X - a.X) * (p.Y - a.Y) - (b.Y - a.Y) * (p.X - a.X);
        }
    }
}
