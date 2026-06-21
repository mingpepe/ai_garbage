export interface GCodeCommand {
  raw: string;
  lineNum: number;
  g?: number;
  m?: number;
  x?: number;
  y?: number;
  z?: number;
  i?: number;
  j?: number;
  r?: number;
  f?: number;
  s?: number;
  comment?: string;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

export interface PathSegment {
  type: 'rapid' | 'cut';
  start: PathPoint;
  end: PathPoint;
  points: PathPoint[]; // Interpolated points for smooth rendering
  lineIndex: number; // 0-based index in the parsed lines array
  feedRate: number;
  spindleSpeed: number;
  spindleOn: boolean;
  coolantOn: boolean;
}

export interface MachineState {
  x: number;
  y: number;
  z: number;
  absoluteMode: boolean; // G90 vs G91
  units: 'mm' | 'inch';  // G21 vs G20
  feedRate: number;       // F
  spindleSpeed: number;   // S
  spindleOn: boolean;     // M3/M4 vs M5
  coolantOn: boolean;     // M8 vs M9
}

export interface ParserResult {
  segments: PathSegment[];
  lines: string[];
  commands: GCodeCommand[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  totalCutDistance: number;
  totalRapidDistance: number;
}

// Parses a single line of G-code
export function parseGCodeLine(lineText: string, lineIndex: number): GCodeCommand | null {
  let cleanText = lineText.trim();
  
  // Extract comment (semicolon or brackets)
  let comment = '';
  const semiColIndex = cleanText.indexOf(';');
  if (semiColIndex !== -1) {
    comment = cleanText.substring(semiColIndex + 1).trim();
    cleanText = cleanText.substring(0, semiColIndex);
  }
  
  const bracketMatch = cleanText.match(/\(([^)]+)\)/);
  if (bracketMatch) {
    comment = bracketMatch[1].trim();
    cleanText = cleanText.replace(/\([^)]+\)/g, ' ');
  }
  
  cleanText = cleanText.trim().toUpperCase();
  if (cleanText.length === 0) {
    if (comment) {
      return { raw: lineText, lineNum: lineIndex + 1, comment };
    }
    return null;
  }
  
  const cmd: GCodeCommand = { raw: lineText, lineNum: lineIndex + 1 };
  if (comment) {
    cmd.comment = comment;
  }
  
  // Regex to extract words: Letter followed by number (float, possibly signed)
  // E.g., G01, X-10.5, Z1.35
  const wordRegex = /([A-Z])\s*([-+]?[0-9]*\.?[0-9]+)/g;
  let match;
  let hasWords = false;
  
  while ((match = wordRegex.exec(cleanText)) !== null) {
    hasWords = true;
    const letter = match[1].toLowerCase();
    const value = parseFloat(match[2]);
    
    // Assign value to GCodeCommand
    if (letter === 'g') cmd.g = value;
    else if (letter === 'm') cmd.m = value;
    else if (letter === 'x') cmd.x = value;
    else if (letter === 'y') cmd.y = value;
    else if (letter === 'z') cmd.z = value;
    else if (letter === 'i') cmd.i = value;
    else if (letter === 'j') cmd.j = value;
    else if (letter === 'r') cmd.r = value;
    else if (letter === 'f') cmd.f = value;
    else if (letter === 's') cmd.s = value;
    else {
      // Store custom variables if needed (e.g. T, H)
      (cmd as any)[letter] = value;
    }
  }
  
  return hasWords || comment ? cmd : null;
}

// Helper to interpolate arc
function interpolateArc(
  startX: number, startY: number, startZ: number,
  endX: number, endY: number, endZ: number,
  i: number | undefined, j: number | undefined, r: number | undefined,
  isCW: boolean,
  stepsPerMm: number = 2
): PathPoint[] {
  const points: PathPoint[] = [];
  
  let centerX = startX;
  let centerY = startY;
  let radius = 0;
  
  const dx = endX - startX;
  const dy = endY - startY;
  const chordLen = Math.sqrt(dx * dx + dy * dy);
  
  if (chordLen < 0.001) {
    // Start and end are same
    if (i !== undefined || j !== undefined) {
      centerX = startX + (i || 0);
      centerY = startY + (j || 0);
      radius = Math.sqrt((startX - centerX) * (startX - centerX) + (startY - centerY) * (startY - centerY));
    } else {
      // No movement
      return [{ x: endX, y: endY, z: endZ }];
    }
  } else if (i !== undefined || j !== undefined) {
    // Center specified by offsets
    centerX = startX + (i || 0);
    centerY = startY + (j || 0);
    radius = Math.sqrt((startX - centerX) * (startX - centerX) + (startY - centerY) * (startY - centerY));
  } else if (r !== undefined) {
    // Radius specified
    let radiusVal = Math.abs(r);
    if (radiusVal < chordLen / 2) {
      radiusVal = chordLen / 2; // Clamp to mathematical limit
    }
    radius = radiusVal;
    
    // Distance from midpoint of chord to center
    const h = Math.sqrt(radius * radius - (chordLen / 2) * (chordLen / 2));
    
    // Midpoint
    const mx = (startX + endX) / 2;
    const my = (startY + endY) / 2;
    
    // Perpendicular direction to chord (pointing left when looking from start to end)
    const px = -dy / chordLen;
    const py = dx / chordLen;
    
    // Two possible centers
    const c1x = mx + h * px;
    const c1y = my + h * py;
    const c2x = mx - h * px;
    const c2y = my - h * py;
    
    // We choose the center based on G2/G3 (isCW) and R sign
    // G2 CW, G3 CCW. 
    // Let's check both centers and find which one satisfies the criteria.
    // If r > 0, angle <= 180 degrees. If r < 0, angle > 180 degrees.
    
    const chooseCenter = () => {
      // Test center 1
      const theta1_s = Math.atan2(startY - c1y, startX - c1x);
      const theta1_e = Math.atan2(endY - c1y, endX - c1x);
      let angle1 = theta1_e - theta1_s;
      
      if (isCW) { // G2 CW (angle decreases)
        if (angle1 >= 0) angle1 -= 2 * Math.PI;
      } else { // G3 CCW (angle increases)
        if (angle1 <= 0) angle1 += 2 * Math.PI;
      }
      
      const isLargeArc1 = Math.abs(angle1) > Math.PI;
      const rSignMatch1 = (r > 0 && !isLargeArc1) || (r < 0 && isLargeArc1);
      
      if (rSignMatch1) {
        return { cx: c1x, cy: c1y };
      }
      return { cx: c2x, cy: c2y };
    };
    
    const selectedCenter = chooseCenter();
    centerX = selectedCenter.cx;
    centerY = selectedCenter.cy;
  } else {
    // Fallback if no center or radius specified
    return [{ x: endX, y: endY, z: endZ }];
  }
  
  // Calculate angles relative to center
  const thetaStart = Math.atan2(startY - centerY, startX - centerX);
  const thetaEnd = Math.atan2(endY - centerY, endX - centerX);
  
  let deltaTheta = thetaEnd - thetaStart;
  
  if (isCW) {
    // CW: angle should decrease
    if (deltaTheta >= 0) {
      deltaTheta -= 2 * Math.PI;
    }
  } else {
    // CCW: angle should increase
    if (deltaTheta <= 0) {
      deltaTheta += 2 * Math.PI;
    }
  }
  
  // Calculate steps based on angular distance and radius
  const arcLength = radius * Math.abs(deltaTheta);
  const totalSteps = Math.max(8, Math.ceil(arcLength * stepsPerMm));
  
  for (let k = 1; k <= totalSteps; k++) {
    const t = k / totalSteps;
    const currentTheta = thetaStart + t * deltaTheta;
    const x = centerX + radius * Math.cos(currentTheta);
    const y = centerY + radius * Math.sin(currentTheta);
    const z = startZ + t * (endZ - startZ); // Helical Z interpolation
    points.push({ x, y, z });
  }
  
  return points;
}

// Interprets G-code lines into path segments and tracks machine bounds
export function parseGCode(gcodeText: string): ParserResult {
  const rawLines = gcodeText.split('\n');
  const commands: GCodeCommand[] = [];
  const segments: PathSegment[] = [];
  
  // Initial machine state
  const state: MachineState = {
    x: 0,
    y: 0,
    z: 10, // Start with tool retracted
    absoluteMode: true, // G90
    units: 'mm', // G21
    feedRate: 1000,
    spindleSpeed: 1000,
    spindleOn: false,
    coolantOn: false
  };
  
  let totalCutDistance = 0;
  let totalRapidDistance = 0;
  
  // Bounds tracking
  let minX = 0, maxX = 0;
  let minY = 0, maxY = 0;
  let minZ = 0, maxZ = 0;
  let boundsInitialized = false;
  
  const updateBounds = (x: number, y: number, z: number) => {
    if (!boundsInitialized) {
      minX = maxX = x;
      minY = maxY = y;
      minZ = maxZ = z;
      boundsInitialized = true;
    } else {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  };
  
  // Add starting point to bounds
  updateBounds(state.x, state.y, state.z);
  
  // Modal command state (remembering G0, G1, G2, G3)
  let activeMotionCommand: number | undefined = undefined;
  
  for (let i = 0; i < rawLines.length; i++) {
    const cmd = parseGCodeLine(rawLines[i], i);
    if (!cmd) {
      commands.push({ raw: rawLines[i], lineNum: i + 1 });
      continue;
    }
    
    commands.push(cmd);
    
    // 1. Process M commands (Spindle, coolant, etc.)
    if (cmd.m !== undefined) {
      if (cmd.m === 3 || cmd.m === 4) {
        state.spindleOn = true;
        if (cmd.s !== undefined) state.spindleSpeed = cmd.s;
      } else if (cmd.m === 5) {
        state.spindleOn = false;
      } else if (cmd.m === 8) {
        state.coolantOn = true;
      } else if (cmd.m === 9) {
        state.coolantOn = false;
      }
    }
    
    // Update non-motion parameters from command
    if (cmd.s !== undefined) state.spindleSpeed = cmd.s;
    if (cmd.f !== undefined) state.feedRate = cmd.f;
    
    // 2. Process G commands that set coordinate mode, units
    if (cmd.g !== undefined) {
      if (cmd.g === 90) {
        state.absoluteMode = true;
      } else if (cmd.g === 91) {
        state.absoluteMode = false;
      } else if (cmd.g === 20) {
        state.units = 'inch';
      } else if (cmd.g === 21) {
        state.units = 'mm';
      }
    }
    
    // Check if motion G code is present
    let motionG = cmd.g;
    if (motionG === 0 || motionG === 1 || motionG === 2 || motionG === 3) {
      activeMotionCommand = motionG;
    }
    
    // Check if there's coordinates and we have an active motion command (G0, G1, G2, G3)
    const hasCoordinates = cmd.x !== undefined || cmd.y !== undefined || cmd.z !== undefined;
    
    if (activeMotionCommand !== undefined && (hasCoordinates || (cmd.g !== undefined && (cmd.g === 0 || cmd.g === 1 || cmd.g === 2 || cmd.g === 3)))) {
      const startPoint: PathPoint = { x: state.x, y: state.y, z: state.z };
      
      // Calculate target point
      let targetX = state.x;
      let targetY = state.y;
      let targetZ = state.z;
      
      if (state.absoluteMode) {
        if (cmd.x !== undefined) targetX = cmd.x;
        if (cmd.y !== undefined) targetY = cmd.y;
        if (cmd.z !== undefined) targetZ = cmd.z;
      } else {
        if (cmd.x !== undefined) targetX = state.x + cmd.x;
        if (cmd.y !== undefined) targetY = state.y + cmd.y;
        if (cmd.z !== undefined) targetZ = state.z + cmd.z;
      }
      
      // Scale coordinates if units are in inches (standardizing on mm for 3D engine)
      if (state.units === 'inch') {
        targetX *= 25.4;
        targetY *= 25.4;
        targetZ *= 25.4;
      }
      
      const endPoint: PathPoint = { x: targetX, y: targetY, z: targetZ };
      let points: PathPoint[] = [];
      let type: 'rapid' | 'cut' = 'cut';
      
      if (activeMotionCommand === 0) {
        // G00: Rapid positioning
        type = 'rapid';
        points = [endPoint];
        
        const dist = Math.sqrt(
          (endPoint.x - startPoint.x) ** 2 +
          (endPoint.y - startPoint.y) ** 2 +
          (endPoint.z - startPoint.z) ** 2
        );
        totalRapidDistance += dist;
      } else if (activeMotionCommand === 1) {
        // G01: Linear interpolation
        type = 'cut';
        points = [endPoint];
        
        const dist = Math.sqrt(
          (endPoint.x - startPoint.x) ** 2 +
          (endPoint.y - startPoint.y) ** 2 +
          (endPoint.z - startPoint.z) ** 2
        );
        totalCutDistance += dist;
      } else if (activeMotionCommand === 2 || activeMotionCommand === 3) {
        // G02 / G03: Circular arc
        type = 'cut';
        const isCW = activeMotionCommand === 2;
        
        let iVal = cmd.i;
        let jVal = cmd.j;
        let rVal = cmd.r;
        
        if (state.units === 'inch') {
          if (iVal !== undefined) iVal *= 25.4;
          if (jVal !== undefined) jVal *= 25.4;
          if (rVal !== undefined) rVal *= 25.4;
        }
        
        points = interpolateArc(
          startPoint.x, startPoint.y, startPoint.z,
          endPoint.x, endPoint.y, endPoint.z,
          iVal, jVal, rVal,
          isCW
        );
        
        // Calculate arc distance (sum of interpolated steps)
        let lastPt = startPoint;
        let arcDist = 0;
        for (const pt of points) {
          arcDist += Math.sqrt((pt.x - lastPt.x) ** 2 + (pt.y - lastPt.y) ** 2 + (pt.z - lastPt.z) ** 2);
          lastPt = pt;
        }
        totalCutDistance += arcDist;
      }
      
      // Update machine state coordinates
      state.x = targetX;
      state.y = targetY;
      state.z = targetZ;
      
      // Update bounds with end point and all intermediate points
      updateBounds(state.x, state.y, state.z);
      for (const pt of points) {
        updateBounds(pt.x, pt.y, pt.z);
      }
      
      segments.push({
        type,
        start: startPoint,
        end: endPoint,
        points,
        lineIndex: i,
        feedRate: state.feedRate,
        spindleSpeed: state.spindleSpeed,
        spindleOn: state.spindleOn,
        coolantOn: state.coolantOn
      });
    }
  }
  
  return {
    segments,
    lines: rawLines,
    commands,
    bounds: {
      minX, maxX,
      minY, maxY,
      minZ, maxZ
    },
    totalCutDistance,
    totalRapidDistance
  };
}
