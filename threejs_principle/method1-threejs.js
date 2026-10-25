/**
 * method1-threejs.js
 * 第一種實作方式：使用 Three.js 官方套件
 */
export class Method1ThreeJS {
  constructor(containerElement, torusData) {
    this.container = containerElement;
    this.torusData = torusData;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mesh = null;
    this.init();
  }

  init() {
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 320;

    // 1. 建立 Scene
    this.scene = new THREE.Scene();

    // 2. 建立相機
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 3.8);

    // 3. 建立 WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x0d0f12, 1);
    this.container.appendChild(this.renderer.domElement);

    // 4. 建立 Geometry (使用共同資料確保頂點與法線完全一致)
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.torusData.positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(this.torusData.normals, 3));
    geom.setIndex(new THREE.BufferAttribute(this.torusData.indices, 1));

    // 5. 建立 Material 與 Mesh
    const mat = new THREE.MeshPhongMaterial({
      color: 0x4aa3df,
      specular: 0xffffff,
      shininess: 35,
      flatShading: false
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.mesh);

    // 6. 燈光配置：環境光 + 定向光
    const ambLight = new THREE.AmbientLight(0x222222);
    this.scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(2, 3, 4);
    this.scene.add(dirLight);
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
