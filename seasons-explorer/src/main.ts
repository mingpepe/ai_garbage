const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const slider = document.getElementById('time-slider') as HTMLInputElement;

const icons = {
    spring: document.getElementById('spring')!,
    summer: document.getElementById('summer')!,
    autumn: document.getElementById('autumn')!,
    winter: document.getElementById('winter')!
};

// Set constants
const sunRadius = 60;
const earthRadius = 45; // Slightly larger for better detail
const orbitXRadius = 380;
const orbitYRadius = 200;
const earthTilt = 23.5 * Math.PI / 180; 

let degree = 0; 

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

slider.addEventListener('input', () => {
    degree = parseInt(slider.value);
});

// Keyboard control: Arrow keys for infinite rotation
window.addEventListener('keydown', (e) => {
    const step = 2; // Degrees to move per key press
    if (e.key === 'ArrowRight') {
        degree += step;
    } else if (e.key === 'ArrowLeft') {
        degree -= step;
    }

    // Wrap around logic (Infinite rotation)
    if (degree >= 360) degree -= 360;
    if (degree < 0) degree += 360;

    // Update slider UI to match
    slider.value = degree.toString();
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // 1. Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 80; i++) {
        const x = (Math.abs(Math.sin(i * 133)) * canvas.width);
        const y = (Math.abs(Math.cos(i * 77)) * canvas.height);
        ctx.fillRect(x, y, 1.5, 1.5);
    }

    // 2. Orbit
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, orbitXRadius, orbitYRadius, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Sun
    const sunGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, sunRadius + 40);
    sunGlow.addColorStop(0, '#fff200');
    sunGlow.addColorStop(0.4, '#ff9900');
    sunGlow.addColorStop(1, 'rgba(255, 153, 0, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, sunRadius + 50, 0, Math.PI * 2);
    ctx.fill();

    // 4. Calculate Earth Position
    const rad = (-degree - 90) * Math.PI / 180; 
    const ex = centerX + orbitXRadius * Math.cos(rad);
    const ey = centerY + orbitYRadius * Math.sin(rad);

    // 5. Draw DIRECT SUNLIGHT RAY (The "Hot Beam")
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. Draw Earth
    ctx.save();
    ctx.translate(ex, ey);
    
    // Draw Atmosphere glow
    const atmosGlow = ctx.createRadialGradient(0, 0, earthRadius, 0, 0, earthRadius + 10);
    atmosGlow.addColorStop(0, 'rgba(100, 181, 246, 0.3)');
    atmosGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = atmosGlow;
    ctx.beginPath();
    ctx.arc(0, 0, earthRadius + 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(earthTilt); 

    // Earth Shadow
    ctx.beginPath();
    ctx.arc(0, 0, earthRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d47a1'; 
    ctx.fill();

    // Earth Light
    const angleToSun = Math.atan2(centerY - ey, centerX - ex) - earthTilt;
    ctx.beginPath();
    ctx.arc(0, 0, earthRadius, angleToSun - Math.PI/2, angleToSun + Math.PI/2);
    const earthGlow = ctx.createRadialGradient(
        Math.cos(angleToSun)*15, Math.sin(angleToSun)*15, 5,
        0, 0, earthRadius
    );
    earthGlow.addColorStop(0, '#64b5f6'); 
    earthGlow.addColorStop(1, '#1976d2');
    ctx.fillStyle = earthGlow;
    ctx.fill();

    // --- Draw Equator and Tropics ---
    const drawLatitude = (latDegree: number, color: string, width: number, dashed = false) => {
        const y = -Math.sin(latDegree * Math.PI / 180) * earthRadius;
        const r = Math.cos(latDegree * Math.PI / 180) * earthRadius;
        if (r <= 0) return;

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (dashed) ctx.setLineDash([2, 4]);
        ctx.ellipse(0, y, r, r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    };

    // Equator (Green)
    drawLatitude(0, '#4caf50', 2);
    // Tropic of Cancer (Yellow - North)
    drawLatitude(23.5, '#ffeb3b', 1.5, true);
    // Tropic of Capricorn (Yellow - South)
    drawLatitude(-23.5, '#ffeb3b', 1.5, true);

    // Draw Axis
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -earthRadius - 15);
    ctx.lineTo(0, earthRadius + 15);
    ctx.stroke();

    // North Pole Marker
    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.arc(0, -earthRadius - 15, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 7. Update Icons
    updateSeasonIcons(degree);

    requestAnimationFrame(draw);
}

function updateSeasonIcons(deg: number) {
    Object.values(icons).forEach(icon => icon.classList.remove('active'));
    if (deg >= 45 && deg < 135) {
        icons.summer.classList.add('active');
    } else if (deg >= 135 && deg < 225) {
        icons.autumn.classList.add('active');
    } else if (deg >= 225 && deg < 315) {
        icons.winter.classList.add('active');
    } else {
        icons.spring.classList.add('active');
    }
}

draw();
