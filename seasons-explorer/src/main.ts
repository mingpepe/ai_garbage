import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- View State ---
let currentView: '2d' | '3d' = '2d';
const btn2d = document.getElementById('btn-2d')!;
const btn3d = document.getElementById('btn-3d')!;
const view2d = document.getElementById('view-2d')!;
const view3d = document.getElementById('view-3d')!;

// --- 2D View Variables ---
const canvas2d = document.getElementById('canvas-2d') as HTMLCanvasElement;
const ctx2d = canvas2d.getContext('2d')!;
const slider2d = document.getElementById('time-slider') as HTMLInputElement;
const icons = {
    spring: document.getElementById('spring')!,
    summer: document.getElementById('summer')!,
    autumn: document.getElementById('autumn')!,
    winter: document.getElementById('winter')!
};

// --- 3D View Variables ---
const container3d = document.getElementById('canvas-3d-container')!;
const speedSlider3d = document.getElementById('speed-slider') as HTMLInputElement;

let scene3d: THREE.Scene, camera3d: THREE.PerspectiveCamera, renderer3d: THREE.WebGLRenderer, controls3d: OrbitControls;
let planets: { mesh: THREE.Mesh; orbit: number; speed: number; angle: number; rotationSpeed: number; name: string }[] = [];
let moon: { mesh: THREE.Mesh; orbit: number; speed: number; angle: number };

// --- Global App Logic ---

function switchView(view: '2d' | '3d') {
    currentView = view;
    if (view === '2d') {
        btn2d.classList.add('active');
        btn3d.classList.remove('active');
        view2d.classList.remove('hidden');
        view3d.classList.add('hidden');
    } else {
        btn2d.classList.remove('active');
        btn3d.classList.add('active');
        view2d.classList.add('hidden');
        view3d.classList.remove('hidden');
        if (!scene3d) init3d();
    }
}

btn2d.onclick = () => switchView('2d');
btn3d.onclick = () => switchView('3d');

// --- 2D Seasons Implementation (Original) ---
let degree2d = 0;
const sunRadius2d = 60;
const earthRadius2d = 45;
const orbitXRadius2d = 380;
const orbitYRadius2d = 200;
const earthTilt2d = 23.5 * Math.PI / 180;

slider2d.oninput = () => degree2d = parseInt(slider2d.value);
window.addEventListener('keydown', (e) => {
    if (currentView !== '2d') return;
    if (e.key === 'ArrowRight') degree2d = (degree2d + 2) % 360;
    if (e.key === 'ArrowLeft') degree2d = (degree2d - 2 + 360) % 360;
    slider2d.value = degree2d.toString();
});

function draw2d() {
    if (currentView !== '2d') return;
    ctx2d.clearRect(0, 0, canvas2d.width, canvas2d.height);
    const centerX = canvas2d.width / 2;
    const centerY = canvas2d.height / 2;

    // Stars
    ctx2d.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 80; i++) {
        const x = (Math.abs(Math.sin(i * 133)) * canvas2d.width);
        const y = (Math.abs(Math.cos(i * 77)) * canvas2d.height);
        ctx2d.fillRect(x, y, 1.5, 1.5);
    }

    // Orbit
    ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx2d.beginPath();
    ctx2d.ellipse(centerX, centerY, orbitXRadius2d, orbitYRadius2d, 0, 0, Math.PI * 2);
    ctx2d.stroke();

    // Sun
    const sunGlow = ctx2d.createRadialGradient(centerX, centerY, 0, centerX, centerY, sunRadius2d + 40);
    sunGlow.addColorStop(0, '#fff200');
    sunGlow.addColorStop(0.4, '#ff9900');
    sunGlow.addColorStop(1, 'rgba(255, 153, 0, 0)');
    ctx2d.fillStyle = sunGlow;
    ctx2d.beginPath();
    ctx2d.arc(centerX, centerY, sunRadius2d + 50, 0, Math.PI * 2);
    ctx2d.fill();

    // Position
    const rad = (-degree2d - 90) * Math.PI / 180;
    const ex = centerX + orbitXRadius2d * Math.cos(rad);
    const ey = centerY + orbitYRadius2d * Math.sin(rad);

    // Light beam
    ctx2d.beginPath();
    ctx2d.strokeStyle = 'rgba(255, 255, 0, 0.6)';
    ctx2d.lineWidth = 4;
    ctx2d.setLineDash([5, 5]);
    ctx2d.moveTo(centerX, centerY);
    ctx2d.lineTo(ex, ey);
    ctx2d.stroke();
    ctx2d.setLineDash([]);

    // Earth
    ctx2d.save();
    ctx2d.translate(ex, ey);
    ctx2d.rotate(earthTilt2d);

    // Earth Ball
    ctx2d.beginPath();
    ctx2d.arc(0, 0, earthRadius2d, 0, Math.PI * 2);
    ctx2d.fillStyle = '#0d47a1';
    ctx2d.fill();

    const angleToSun = Math.atan2(centerY - ey, centerX - ex) - earthTilt2d;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, earthRadius2d, angleToSun - Math.PI / 2, angleToSun + Math.PI / 2);
    const earthGlow = ctx2d.createRadialGradient(Math.cos(angleToSun) * 15, Math.sin(angleToSun) * 15, 5, 0, 0, earthRadius2d);
    earthGlow.addColorStop(0, '#64b5f6');
    earthGlow.addColorStop(1, '#1976d2');
    ctx2d.fillStyle = earthGlow;
    ctx2d.fill();

    // Lines
    const drawLat = (lat: number, color: string, dash = false) => {
        const y = -Math.sin(lat * Math.PI / 180) * earthRadius2d;
        const r = Math.cos(lat * Math.PI / 180) * earthRadius2d;
        if (r <= 0) return;
        ctx2d.beginPath();
        ctx2d.strokeStyle = color;
        if (dash) ctx2d.setLineDash([2, 4]);
        ctx2d.ellipse(0, y, r, r * 0.3, 0, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
    };
    drawLat(0, '#4caf50');
    drawLat(23.5, '#ffeb3b', true);
    drawLat(-23.5, '#ffeb3b', true);

    // Axis
    ctx2d.strokeStyle = 'white';
    ctx2d.lineWidth = 3;
    ctx2d.beginPath();
    ctx2d.moveTo(0, -earthRadius2d - 15);
    ctx2d.lineTo(0, earthRadius2d + 15);
    ctx2d.stroke();
    ctx2d.fillStyle = '#ff5252';
    ctx2d.beginPath();
    ctx2d.arc(0, -earthRadius2d - 15, 5, 0, Math.PI * 2);
    ctx2d.fill();

    ctx2d.restore();

    // Icons
    Object.values(icons).forEach(icon => icon.classList.remove('active'));
    if (degree2d >= 45 && degree2d < 135) icons.summer.classList.add('active');
    else if (degree2d >= 135 && degree2d < 225) icons.autumn.classList.add('active');
    else if (degree2d >= 225 && degree2d < 315) icons.winter.classList.add('active');
    else icons.spring.classList.add('active');
}

// --- 3D Solar System Implementation ---
function init3d() {
    scene3d = new THREE.Scene();
    camera3d = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    renderer3d = new THREE.WebGLRenderer({ antialias: true });
    renderer3d.setSize(window.innerWidth, window.innerHeight);
    container3d.appendChild(renderer3d.domElement);

    controls3d = new OrbitControls(camera3d, renderer3d.domElement);
    camera3d.position.set(0, 500, 1000);
    controls3d.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene3d.add(ambientLight);
    const sunLight = new THREE.PointLight(0xffffff, 5000, 3000);
    scene3d.add(sunLight);

    // Sun
    const sunGeo = new THREE.SphereGeometry(60, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    scene3d.add(sun);

    // Planet Data: Name, OrbitRadius, Size, Color, Speed, RotationSpeed
    const planetData = [
        { name: 'Mercury', orbit: 120, size: 8, color: 0xaaaaaa, speed: 0.047, rotation: 0.01 },
        { name: 'Venus', orbit: 180, size: 15, color: 0xffcc33, speed: 0.035, rotation: 0.005 },
        { name: 'Earth', orbit: 260, size: 16, color: 0x3366ff, speed: 0.029, rotation: 0.02 },
        { name: 'Mars', orbit: 340, size: 12, color: 0xff3300, speed: 0.024, rotation: 0.018 },
        { name: 'Jupiter', orbit: 500, size: 40, color: 0xff9966, speed: 0.013, rotation: 0.04 },
        { name: 'Saturn', orbit: 650, size: 35, color: 0xffcc99, speed: 0.009, rotation: 0.038 },
        { name: 'Uranus', orbit: 800, size: 25, color: 0x66ffff, speed: 0.006, rotation: 0.025 },
        { name: 'Neptune', orbit: 900, size: 24, color: 0x3333ff, speed: 0.005, rotation: 0.023 },
        { name: 'Pluto', orbit: 1000, size: 6, color: 0x996633, speed: 0.004, rotation: 0.008 }
    ];

    planetData.forEach(data => {
        const geo = new THREE.SphereGeometry(data.size, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ color: data.color });
        const mesh = new THREE.Mesh(geo, mat);
        
        // Add orbit line
        const orbitGeo = new THREE.RingGeometry(data.orbit - 1, data.orbit + 1, 128);
        const orbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.1 });
        const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
        orbitMesh.rotation.x = Math.PI / 2;
        scene3d.add(orbitMesh);

        planets.push({
            mesh,
            orbit: data.orbit,
            speed: data.speed,
            rotationSpeed: data.rotation,
            angle: Math.random() * Math.PI * 2,
            name: data.name
        });
        scene3d.add(mesh);
    });

    // Moon for Earth
    const moonGeo = new THREE.SphereGeometry(4, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    moon = {
        mesh: new THREE.Mesh(moonGeo, moonMat),
        orbit: 30,
        speed: 0.1,
        angle: 0
    };
    scene3d.add(moon.mesh);

    // Stars Background
    const starGeo = new THREE.BufferGeometry();
    const starCoords = [];
    for (let i = 0; i < 5000; i++) {
        starCoords.push(THREE.MathUtils.randFloatSpread(4000));
        starCoords.push(THREE.MathUtils.randFloatSpread(4000));
        starCoords.push(THREE.MathUtils.randFloatSpread(4000));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1 });
    scene3d.add(new THREE.Points(starGeo, starMat));
}

function update3d() {
    if (currentView !== '3d' || !scene3d || !renderer3d || !camera3d) return;
    const globalSpeed = parseInt(speedSlider3d.value) / 10;

    let earthMesh: THREE.Mesh | null = null;

    planets.forEach(p => {
        p.angle += p.speed * globalSpeed * 0.5;
        p.mesh.position.x = Math.cos(p.angle) * p.orbit;
        p.mesh.position.z = Math.sin(p.angle) * p.orbit;
        p.mesh.rotation.y += p.rotationSpeed * globalSpeed; // Self-rotation

        if (p.name === 'Earth') earthMesh = p.mesh;
    });

    if (earthMesh) {
        moon.angle += moon.speed * globalSpeed;
        moon.mesh.position.x = (earthMesh as THREE.Mesh).position.x + Math.cos(moon.angle) * moon.orbit;
        moon.mesh.position.z = (earthMesh as THREE.Mesh).position.z + Math.sin(moon.angle) * moon.orbit;
        moon.mesh.position.y = (earthMesh as THREE.Mesh).position.y;
    }

    renderer3d.render(scene3d, camera3d);
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    if (currentView === '2d') draw2d();
    else update3d();
}

function handleResize() {
    canvas2d.width = window.innerWidth;
    canvas2d.height = window.innerHeight;
    if (renderer3d && camera3d) {
        renderer3d.setSize(window.innerWidth, window.innerHeight);
        camera3d.aspect = window.innerWidth / window.innerHeight;
        camera3d.updateProjectionMatrix();
    }
}

window.addEventListener('resize', handleResize);
handleResize();
animate();
