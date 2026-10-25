/**
 * method2-webgl.js
 * 第二種實作方式：使用瀏覽器原生 WebGL API (Web API)
 */
import { vsSource, fsSource, createShader } from './shared-data.js';

export class Method2WebGL {
  constructor(canvasElement, torusData) {
    this.canvas = canvasElement;
    this.torusData = torusData;
    this.gl = null;
    this.program = null;
    this.indexCount = 0;

    // Uniform locations
    this.uModelView = null;
    this.uProj = null;
    this.uNormalMat = null;
    this.uLightPos = null;

    this.init();
  }

  init() {
    const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
    if (!gl) {
      alert('WebGL not supported');
      return;
    }
    this.gl = gl;

    // 1. 編譯 Vertex & Fragment Shaders
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.program = prog;

    // 2. 獲取 Uniform 位置
    this.uModelView = gl.getUniformLocation(prog, 'uModelViewMatrix');
    this.uProj = gl.getUniformLocation(prog, 'uProjectionMatrix');
    this.uNormalMat = gl.getUniformLocation(prog, 'uNormalMatrix');
    this.uLightPos = gl.getUniformLocation(prog, 'uLightPos');

    // 3. 獲取 Attribute 位置
    const posLoc = gl.getAttribLocation(prog, 'aPosition');
    const normLoc = gl.getAttribLocation(prog, 'aNormal');

    // 4. 配置頂點與法向量 Buffers
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.torusData.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    const normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.torusData.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(normLoc);
    gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);

    // 5. 配置索引 Buffer
    const idxBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.torusData.indices, gl.STATIC_DRAW);

    this.indexCount = this.torusData.indices.length;

    // 6. 狀態機設置：啟用深度測試
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(13 / 255, 15 / 255, 18 / 255, 1.0);
  }

  resize(width, height) {
    if (!this.gl) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  render(rotation) {
    const gl = this.gl;
    if (!gl) return;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    // 計算投影矩陣
    const aspect = this.canvas.width / this.canvas.height;
    const projMat = mat4.create();
    mat4.perspective(projMat, (45 * Math.PI) / 180, aspect, 0.1, 100);
    gl.uniformMatrix4fv(this.uProj, false, projMat);

    // 計算 ModelView 矩陣 (View * Model)
    const mvMat = mat4.create();
    mat4.identity(mvMat);
    mat4.translate(mvMat, mvMat, [0, 0, -3.8]);
    mat4.rotateX(mvMat, mvMat, rotation.x);
    mat4.rotateY(mvMat, mvMat, rotation.y);
    gl.uniformMatrix4fv(this.uModelView, false, mvMat);

    // 計算 Normal Matrix: transpose(inverse(MV))
    const normMat = mat3.create();
    mat3.normalFromMat4(normMat, mvMat);
    gl.uniformMatrix3fv(this.uNormalMat, false, normMat);

    // 設置光源位置 (在 Camera View 空間)
    gl.uniform3fv(this.uLightPos, [2, 3, 4]);

    // 繪製索引幾何體
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }
}
