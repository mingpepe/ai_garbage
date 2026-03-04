#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <stdbool.h>

#ifdef __APPLE__
#include <GLUT/glut.h>
#else
#include <GL/glut.h>
#endif

// Rendering resolution
#define RENDER_WIDTH 400
#define RENDER_HEIGHT 300

// Vector struct and math functions
typedef struct {
    float x, y, z;
} Vector3;

Vector3 v3_new(float x, float y, float z) { return (Vector3){x, y, z}; }
Vector3 v3_add(Vector3 a, Vector3 b) { return v3_new(a.x + b.x, a.y + b.y, a.z + b.z); }
Vector3 v3_sub(Vector3 a, Vector3 b) { return v3_new(a.x - b.x, a.y - b.y, a.z - b.z); }
Vector3 v3_mul(Vector3 a, Vector3 b) { return v3_new(a.x * b.x, a.y * b.y, a.z * b.z); }
Vector3 v3_mulf(Vector3 a, float f) { return v3_new(a.x * f, a.y * f, a.z * f); }
float v3_dot(Vector3 a, Vector3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
float v3_length(Vector3 v) { return sqrtf(v3_dot(v, v)); }
Vector3 v3_normalize(Vector3 v) {
    float len = v3_length(v);
    if (len > 0) return v3_mulf(v, 1.0f / len);
    return v;
}
float v3_dist(Vector3 a, Vector3 b) { return v3_length(v3_sub(a, b)); }
float clamp(float x, float min, float max) {
    if (x < min) return min;
    if (x > max) return max;
    return x;
}

// Scene settings
Vector3 cameraPos = {0, 1.5f, -4.5f};
Vector3 lightPos = {2, 5, -2};
const float sphereRadius = 1.0f;
const Vector3 sphereCenter = {0, 1, 0};
const Vector3 sphereColor = {1.0f, 0.2f, 0.2f}; // Red
const float lightSize = 0.2f;

unsigned char pixels[RENDER_WIDTH * RENDER_HEIGHT * 3];

float intersect_sphere(Vector3 origin, Vector3 dir, Vector3 center, float radius) {
    Vector3 oc = v3_sub(origin, center);
    float b = v3_dot(oc, dir);
    float c = v3_dot(oc, oc) - radius * radius;
    float h = b * b - c;

    if (h >= 0) {
        float t = -b - sqrtf(h);
        if (t > 0) return t;
    }
    return -1.0f;
}

float intersect_plane(Vector3 origin, Vector3 dir, Vector3 normal, float d) {
    float denom = v3_dot(normal, dir);
    if (fabsf(denom) > 1e-6) {
        float t = (d - v3_dot(normal, origin)) / denom;
        if (t > 0) return t;
    }
    return -1.0f;
}

Vector3 trace(Vector3 rayOrigin, Vector3 rayDir) {
    float tSphere = intersect_sphere(rayOrigin, rayDir, sphereCenter, sphereRadius);
    float tPlane = intersect_plane(rayOrigin, rayDir, v3_new(0, 1, 0), 0);
    float tLight = intersect_sphere(rayOrigin, rayDir, lightPos, lightSize);

    float t = 1e30f;
    int hitObj = -1; // 0: Sphere, 1: Floor, 2: Light Source

    if (tSphere > 0) {
        t = tSphere;
        hitObj = 0;
    }
    if (tPlane > 0 && tPlane < t) {
        t = tPlane;
        hitObj = 1;
    }
    if (tLight > 0 && tLight < t) {
        t = tLight;
        hitObj = 2;
    }

    // No hit: sky gradient
    if (hitObj == -1) {
        float skyT = 0.5f * (rayDir.y + 1.0f);
        Vector3 color1 = v3_new(1.0f, 1.0f, 1.0f);
        Vector3 color2 = v3_new(0.5f, 0.7f, 1.0f);
        return v3_add(v3_mulf(color1, 1.0f - skyT), v3_mulf(color2, skyT));
    }

    // Hit light source
    if (hitObj == 2) return v3_new(2.0f, 2.0f, 2.0f);

    Vector3 hitPoint = v3_add(rayOrigin, v3_mulf(rayDir, t));
    Vector3 normal;
    Vector3 objColor;

    if (hitObj == 0) {
        normal = v3_normalize(v3_sub(hitPoint, sphereCenter));
        objColor = sphereColor;
    } else {
        normal = v3_new(0, 1, 0);
        float scale = 1.0f;
        bool isWhite = ((int)(floorf(hitPoint.x * scale)) + (int)(floorf(hitPoint.z * scale))) % 2 == 0;
        objColor = isWhite ? v3_new(0.9f, 0.9f, 0.9f) : v3_new(0.3f, 0.3f, 0.3f);
    }

    // Lighting
    Vector3 lightDir = v3_normalize(v3_sub(lightPos, hitPoint));
    float distToLight = v3_dist(lightPos, hitPoint);
    
    // Shadow Ray
    Vector3 shadowOrigin = v3_add(hitPoint, v3_mulf(normal, 0.001f));
    float sSphere = intersect_sphere(shadowOrigin, lightDir, sphereCenter, sphereRadius);
    
    bool inShadow = false;
    if (sSphere > 0 && sSphere < distToLight) {
        inShadow = true;
    }

    float ambient = 0.15f;
    float diffuse = inShadow ? 0 : fmaxf(0, v3_dot(normal, lightDir));

    return v3_mulf(objColor, ambient + diffuse * 0.85f);
}

void render_raytracing() {
    for (int y = 0; y < RENDER_HEIGHT; y++) {
        for (int x = 0; x < RENDER_WIDTH; x++) {
            // Map screen coordinates: y=0 is bottom in OpenGL glDrawPixels
            float u = (2.0f * ((float)x + 0.5f) / RENDER_WIDTH - 1.0f) * ((float)RENDER_WIDTH / RENDER_HEIGHT);
            float v = (2.0f * ((float)y + 0.5f) / RENDER_HEIGHT - 1.0f);

            Vector3 rayDir = v3_normalize(v3_new(u, v, 1.0f));
            Vector3 color = trace(cameraPos, rayDir);

            int index = (y * RENDER_WIDTH + x) * 3;
            pixels[index] = (unsigned char)(clamp(color.x, 0, 1) * 255);
            pixels[index + 1] = (unsigned char)(clamp(color.y, 0, 1) * 255);
            pixels[index + 2] = (unsigned char)(clamp(color.z, 0, 1) * 255);
        }
    }
}

void display() {
    glClear(GL_COLOR_BUFFER_BIT);
    // Draw the pixel buffer to the screen
    glDrawPixels(RENDER_WIDTH, RENDER_HEIGHT, GL_RGB, GL_UNSIGNED_BYTE, pixels);
    glutSwapBuffers();
}

void keyboard(unsigned char key, int x, int y) {
    float moveSpeed = 0.1f;
    switch (key) {
        case 'w': case 'W': cameraPos.z += moveSpeed; break;
        case 's': case 'S': cameraPos.z -= moveSpeed; break;
        case 'a': case 'A': cameraPos.x -= moveSpeed; break;
        case 'd': case 'D': cameraPos.x += moveSpeed; break;
        case 27: exit(0); break; // ESC
    }
    render_raytracing();
    glutPostRedisplay();
}

void specialKeys(int key, int x, int y) {
    float moveSpeed = 0.1f;
    switch (key) {
        case GLUT_KEY_UP:    lightPos.y += moveSpeed; break;
        case GLUT_KEY_DOWN:  lightPos.y -= moveSpeed; break;
        case GLUT_KEY_LEFT:  lightPos.x -= moveSpeed; break;
        case GLUT_KEY_RIGHT: lightPos.x += moveSpeed; break;
    }
    render_raytracing();
    glutPostRedisplay();
}

int main(int argc, char** argv) {
    glutInit(&argc, argv);
    glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB);
    glutInitWindowSize(RENDER_WIDTH, RENDER_HEIGHT);
    glutCreateWindow("C Raytracing");

    render_raytracing();

    glutDisplayFunc(display);
    glutKeyboardFunc(keyboard);
    glutSpecialFunc(specialKeys);

    glutMainLoop();
    return 0;
}