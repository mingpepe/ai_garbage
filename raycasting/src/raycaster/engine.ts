export const MAP_SIZE = 12;
export const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 2, 2, 0, 0, 0, 0, 3, 3, 0, 1],
  [1, 0, 2, 2, 0, 0, 0, 0, 3, 3, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export interface Player {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
}

export interface RayHit {
  rayDirX: number;
  rayDirY: number;
  perpWallDist: number;
  mapX: number;
  mapY: number;
  side: number; // 0 for NS wall, 1 for EW wall
  lineHeight: number;
  wallType: number; // Wall color/texture identifier
}

/**
 * Core DDA Algorithm: Calculates collision for a single ray
 */
export function castRay(x: number, width: number, player: Player, canvasHeight: number): RayHit {
  // calculate ray position and direction
  const cameraX = (2 * x) / width - 1;
  const rayDirX = player.dirX + player.planeX * cameraX;
  const rayDirY = player.dirY + player.planeY * cameraX;

  // which box of the map we're in
  let mapX = Math.floor(player.x);
  let mapY = Math.floor(player.y);

  // length of ray from current position to next x or y-side
  let sideDistX;
  let sideDistY;

  // length of ray from one x or y-side to next x or y-side
  const deltaDistX = Math.abs(1 / rayDirX);
  const deltaDistY = Math.abs(1 / rayDirY);
  let perpWallDist;

  // what direction to step in x or y-direction (either +1 or -1)
  let stepX;
  let stepY;

  let hit = 0; // was there a wall hit?
  let side = 0; // was a NS or a EW wall hit?

  // calculate step and initial sideDist
  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (player.x - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (player.y - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
  }

  // perform DDA
  while (hit === 0) {
    // jump to next map square, either in x-direction, or in y-direction
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    // Check if ray has hit a wall
    if (MAP[mapX][mapY] > 0) hit = 1;
  }

  const wallType = MAP[mapX][mapY];

  // Calculate distance projected on camera direction (Euclidean distance would give fisheye effect!)
  if (side === 0) perpWallDist = (mapX - player.x + (1 - stepX) / 2) / rayDirX;
  else perpWallDist = (mapY - player.y + (1 - stepY) / 2) / rayDirY;

  // Calculate height of line to draw on screen
  const lineHeight = Math.floor(canvasHeight / perpWallDist);

  return { rayDirX, rayDirY, perpWallDist, mapX, mapY, side, lineHeight, wallType };
}

/**
 * Player rotation logic using rotation matrix
 */
export function rotatePlayer(player: Player, angle: number): Player {
  const oldDirX = player.dirX;
  const dirX = player.dirX * Math.cos(angle) - player.dirY * Math.sin(angle);
  const dirY = oldDirX * Math.sin(angle) + player.dirY * Math.cos(angle);
  
  const oldPlaneX = player.planeX;
  const planeX = player.planeX * Math.cos(angle) - player.planeY * Math.sin(angle);
  const planeY = oldPlaneX * Math.sin(angle) + player.planeY * Math.cos(angle);
  
  return { ...player, dirX, dirY, planeX, planeY };
}

/**
 * Player movement logic with simple collision detection
 */
export function movePlayer(player: Player, speed: number): Player {
  let { x, y } = player;
  const nextX = x + player.dirX * speed;
  const nextY = y + player.dirY * speed;
  
  // Check the next step on the map to prevent walking through walls
  if (MAP[Math.floor(nextX)][Math.floor(y)] === 0) x = nextX;
  if (MAP[Math.floor(x)][Math.floor(nextY)] === 0) y = nextY;
  
  return { ...player, x, y };
}
