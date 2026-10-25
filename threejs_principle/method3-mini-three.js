/**
 * method3-mini-three.js
 * 第三種實作方式：把原生 WebGL API 封裝成類似 Three.js 架構的自製微型庫
 */
import { vsSource, fsSource, createShader } from './shared-data.js';

// ==========================================
// MiniThree 核心命名空間與物件設計
// ==========================================
export const MiniThree = {
  // 1. 場景樹容器 (對標 Three.js 的 Scene & Object3D)
  Scene: class {
    constructor() {
      this.children = [];
    }
    add(obj) {
      this.children.push(obj);
    }
  },

  // 2. 透視相機 (對標 Three.js 的 PerspectiveCamera)
  PerspectiveCamera: class {
    constructor(fov, aspect, near, far) {
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
      this.position = [0, 0, 0];
      this.projectionMatrix = mat4.create();
      this.viewMatrix = mat4.create();
      this.updateProjectionMatrix();
    }
    updateProjectionMatrix() {
      mat4.perspective(
        this.projectionMatrix,
        (this.fov * Math.PI) / 180,
        this.aspect,
        this.near,
        this.far
      );
    }
    updateViewMatrix() {
      mat4.identity(this.viewMatrix);
      mat4.translate(this.viewMatrix, this.viewMatrix, [
        -this.position[0],
        -this.position[1],
        -this.position[2]
      ]);
    }
  },

  // 3. 幾何體 (對標 Three.js 的 BufferGeometry)
  TorusGeometry: class {
    constructor(data) {
      this.positions = data.positions;
      this.normals = data.normals;
      this.indices = data.indices;
    }
  },

  // 4. 材質 (對標 Three.js 的 MeshPhongMaterial)
  MeshPhongMaterial: class {
    constructor(params = {}) {
      this.color = params.color || [0.29, 0.64, 0.87];
      this.shininess = params.shininess || 35.0;
    }
  },

  // 5. 網格物體 (對標 Three.js 的 Mesh)
  Mesh: class {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.rotation = { x: 0, y: 0, z: 0 };
      this.position = [0, 0, 0];
      this.modelMatrix = mat4.create();
    }
    updateModelMatrix() {
      mat4.identity(this.modelMatrix);
      mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
      mat4.rotateX(this.modelMatrix, this.modelMatrix, this.rotation.x);
      mat4.rotateY(this.modelMatrix, this.modelMatrix, this.rotation.y);
      mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.rotation.z);
    }
  },

  // 6. 光源 (對標 Three.js 的 DirectionalLight)
  DirectionalLight: class {
    constructor(color = 0xffffff, intensity = 1.0) {
      this.position = [2, 3, 4];
    }
  },

  // 7. WebGL 渲染器 (對標 Three.js 的 WebGLRenderer)
  WebGLRenderer: class {
    constructor({ canvas }) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl');
      this.gl.enable(this.gl.DEPTH_TEST);
      this.gl.clearColor(13 / 255, 15 / 255, 18 / 255, 1.0);
      this.program = this._initProgram();
      this._meshCache = new WeakMap(); // Buffer 快取管理
    }

    _initProgram() {
      const gl = this.gl;
      const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      return prog;
    }

    setSize(w, h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }

    render(scene, camera) {
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);

      camera.updateViewMatrix();

      // 從場景樹中取得 DirectionalLight
      let lightPos = [2, 3, 4];
      for (const child of scene.children) {
        if (child instanceof MiniThree.DirectionalLight) {
          lightPos = child.position;
        }
      }
      const uLightPos = gl.getUniformLocation(this.program, 'uLightPos');
      gl.uniform3fv(uLightPos, lightPos);

      const uProj = gl.getUniformLocation(this.program, 'uProjectionMatrix');
      const uModelView = gl.getUniformLocation(this.program, 'uModelViewMatrix');
      const uNormalMat = gl.getUniformLocation(this.program, 'uNormalMatrix');

      gl.uniformMatrix4fv(uProj, false, camera.projectionMatrix);

      // 遍歷 Scene 進行渲染
      for (const child of scene.children) {
        if (child instanceof MiniThree.Mesh) {
          child.updateModelMatrix();

          // 計算 ModelView 矩陣 = View * Model
          const mvMatrix = mat4.create();
          mat4.multiply(mvMatrix, camera.viewMatrix, child.modelMatrix);
          gl.uniformMatrix4fv(uModelView, false, mvMatrix);

          // 計算 Normal Matrix = transpose(inverse(MV))
          const normalMatrix = mat3.create();
          mat3.normalFromMat4(normalMatrix, mvMatrix);
          gl.uniformMatrix3fv(uNormalMat, false, normalMatrix);

          // 綁定 Buffer (透過 WeakMap 快取)
          let buffers = this._meshCache.get(child.geometry);
          if (!buffers) {
            const pb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, pb);
            gl.bufferData(gl.ARRAY_BUFFER, child.geometry.positions, gl.STATIC_DRAW);

            const nb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, nb);
            gl.bufferData(gl.ARRAY_BUFFER, child.geometry.normals, gl.STATIC_DRAW);

            const ib = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, child.geometry.indices, gl.STATIC_DRAW);

            buffers = { pb, nb, ib, count: child.geometry.indices.length };
            this._meshCache.set(child.geometry, buffers);
          }

          const posLoc = gl.getAttribLocation(this.program, 'aPosition');
          gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pb);
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

          const normLoc = gl.getAttribLocation(this.program, 'aNormal');
          gl.bindBuffer(gl.ARRAY_BUFFER, buffers.nb);
          gl.enableVertexAttribArray(normLoc);
          gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.ib);
          gl.drawElements(gl.TRIANGLES, buffers.count, gl.UNSIGNED_SHORT, 0);
        }
      }
    }
  }
};

/**
 * 封裝呼叫介面
 */
export class Method3MiniThree {
  constructor(canvasElement, torusData) {
    this.canvas = canvasElement;
    this.torusData = torusData;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mesh = null;
    this.init();
  }

  init() {
    const width = this.canvas.parentElement.clientWidth || 300;
    const height = this.canvas.parentElement.clientHeight || 320;

    // 1. 初始化 Scene
    this.scene = new MiniThree.Scene();

    // 2. 初始化 PerspectiveCamera
    this.camera = new MiniThree.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position = [0, 0, 3.8];

    // 3. 初始化 Geometry, Material 與 Mesh
    const geom = new MiniThree.TorusGeometry(this.torusData);
    const mat = new MiniThree.MeshPhongMaterial();
    this.mesh = new MiniThree.Mesh(geom, mat);
    this.scene.add(this.mesh);

    // 4. 加入 DirectionalLight
    const light = new MiniThree.DirectionalLight();
    this.scene.add(light);

    // 5. 初始化 WebGLRenderer
    this.renderer = new MiniThree.WebGLRenderer({ canvas: this.canvas });
    this.renderer.setSize(width, height);
  }

  resize(width, height) {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(rotation) {
    if (!this.mesh || !this.renderer) return;
    this.mesh.rotation.x = rotation.x;
    this.mesh.rotation.y = rotation.y;
    this.renderer.render(this.scene, this.camera);
  }
}
