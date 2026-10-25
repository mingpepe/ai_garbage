/**
 * shared-data.js
 * 共同幾何數據產生器 (保證三種實作頂點/法線數據 100% 相同)
 */
export function generateTorusData(radius = 1.0, tube = 0.35, radialSegments = 30, tubularSegments = 30) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let j = 0; j <= radialSegments; j++) {
    for (let i = 0; i <= tubularSegments; i++) {
      const u = (i / tubularSegments) * Math.PI * 2;
      const v = (j / radialSegments) * Math.PI * 2;

      const x = (radius + tube * Math.cos(v)) * Math.cos(u);
      const y = (radius + tube * Math.cos(v)) * Math.sin(u);
      const z = tube * Math.sin(v);

      positions.push(x, y, z);

      // 法線向量 (從圓管中心指向表面點)
      const cx = radius * Math.cos(u);
      const cy = radius * Math.sin(u);
      const cz = 0;
      let nx = x - cx;
      let ny = y - cy;
      let nz = z - cz;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
    }
  }

  for (let j = 1; j <= radialSegments; j++) {
    for (let i = 1; i <= tubularSegments; i++) {
      const a = (tubularSegments + 1) * j + i - 1;
      const b = (tubularSegments + 1) * (j - 1) + i - 1;
      const c = (tubularSegments + 1) * (j - 1) + i;
      const d = (tubularSegments + 1) * j + i;

      // 兩面三角形構成一個 quad
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices)
  };
}

// 共享的著色器代碼，供原生 WebGL 與 Mini-Three 共用
export const vsSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;

  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform mat3 uNormalMatrix;

  varying vec3 vNormal;
  varying vec3 vFragPos;

  void main() {
    vec4 viewPos = uModelViewMatrix * vec4(aPosition, 1.0);
    vFragPos = viewPos.xyz;
    vNormal = normalize(uNormalMatrix * aNormal);
    gl_Position = uProjectionMatrix * viewPos;
  }
`;

export const fsSource = `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vFragPos;

  uniform vec3 uLightPos; // 在相機空間中的光源位置
  const vec3 uColor = vec3(0.29, 0.64, 0.87); // #4aa3df
  const vec3 uAmbient = vec3(0.13, 0.13, 0.13); // #222222

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightPos - vFragPos);
    vec3 V = normalize(-vFragPos);

    // 漫反射 (Diffuse)
    float diff = max(dot(N, L), 0.0);
    vec3 diffuse = diff * uColor;

    // 高光 (Specular - Blinn-Phong)
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 35.0);
    vec3 specular = spec * vec3(1.0);

    vec3 finalColor = uAmbient * uColor + diffuse + specular;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
  }
  return shader;
}
