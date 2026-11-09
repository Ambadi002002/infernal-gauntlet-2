// Procedural Deterministic Level Generator for Levels 1 to 100
// Scales hazard count, platform sparseness, saw blade velocities, lasers, turrets, and darkness.

class ProceduralLevelGenerator {
  // Simple seeded pseudo-random number generator (Mulberry32)
  static createRNG(seed) {
    let s = seed >>> 0;
    return function() {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  static generateLevel(levelNum, seed) {
    const clampedLevel = Math.max(1, Math.min(100, levelNum));
    const rng = this.createRNG(seed || (clampedLevel * 99991));

    // Scaling factors based on level (1 to 100)
    const difficultyProgress = (clampedLevel - 1) / 99; // 0.0 to 1.0
    const trapSpeedMultiplier = 1.0 + difficultyProgress * 2.2; // 1.0x to 3.2x speed
    const sawCount = Math.floor(2 + difficultyProgress * 8); // 2 to 10 saws
    const turretCount = Math.floor(1 + difficultyProgress * 6); // 1 to 7 turrets
    const laserCount = Math.floor(1 + difficultyProgress * 5); // 1 to 6 lasers
    const fogOfWar = clampedLevel >= 30; // Darkness fog on high levels
    const vanishingPlatforms = clampedLevel >= 45; // Platforms dissolve after landing

    const level = {
      levelNum: clampedLevel,
      trapSpeedMultiplier,
      fogOfWar,
      vanishingPlatforms,
      platforms: [],
      spikes: [],
      saws: [],
      lasers: [],
      turrets: [],
      spawns: {
        p1: { x: 100, y: 620 },
        p2: { x: 1140, y: 620 }
      },
      altar: { x: 640 - 25, y: 140, w: 50, h: 50, captured: false }
    };

    // 1. Boundary Solid Walls & Floors
    // Floor
    level.platforms.push({ x: 0, y: 680, w: 1280, h: 40, type: 'solid' });
    // Left & Right walls
    level.platforms.push({ x: 0, y: 0, w: 40, h: 720, type: 'solid' });
    level.platforms.push({ x: 1240, y: 0, w: 40, h: 720, type: 'solid' });
    // Ceiling
    level.platforms.push({ x: 0, y: 0, w: 1280, h: 40, type: 'solid' });

    // 2. Base Altar Platform (Center top gauntlet objective)
    level.platforms.push({ x: 560, y: 190, w: 160, h: 20, type: 'solid' });

    // 3. Procedural Platform Gauntlet Architecture
    // Layout 4 tiers of brutal precision jumps
    const tiers = [540, 420, 300, 200];
    tiers.forEach((tierY, tierIdx) => {
      // Calculate platform width: gets smaller on higher levels
      const minWidth = Math.max(70, Math.floor(160 - difficultyProgress * 80));
      const platformCountInTier = 3 + (tierIdx % 2);

      for (let i = 0; i < platformCountInTier; i++) {
        const span = 1100 / platformCountInTier;
        const baseX = 80 + i * span + rng() * 30;
        const width = minWidth + rng() * 40;

        level.platforms.push({
          x: baseX,
          y: tierY,
          w: width,
          h: 18,
          type: (vanishingPlatforms && rng() > 0.6) ? 'vanishing' : 'solid',
          vanishTimer: 0,
          isVanished: false
        });

        // 4. Hazard Spikes (Fair, deadly placements on bottom / tiers)
        if (rng() < 0.4 + difficultyProgress * 0.4) {
          level.spikes.push({
            x: baseX + width * 0.2,
            y: tierY - 12,
            w: width * 0.6,
            h: 12
          });
        }
      }
    });

    // Pit spikes along floor trenches
    level.spikes.push({ x: 300, y: 668, w: 680, h: 12 });

    // 5. Moving Saw Hazards (High lethality, pendulum / linear tracks)
    for (let s = 0; s < sawCount; s++) {
      const startX = 150 + rng() * 950;
      const startY = 150 + rng() * 450;
      const distance = 120 + rng() * 250;
      const horizontal = rng() > 0.4;
      const speed = (2.0 + rng() * 2.5) * trapSpeedMultiplier;

      level.saws.push({
        x: startX,
        y: startY,
        originX: startX,
        originY: startY,
        radius: 20,
        horizontal,
        distance,
        speed,
        progress: rng() * Math.PI * 2,
        damage: 100 // Instant kill or critical
      });
    }

    // 6. Laser Beams (Pulsing high-voltage death corridors)
    for (let l = 0; l < laserCount; l++) {
      const orientation = rng() > 0.5 ? 'horizontal' : 'vertical';
      let lx, ly, lw, lh;
      if (orientation === 'horizontal') {
        lx = 50;
        ly = 240 + l * 90;
        lw = 1180;
        lh = 6;
      } else {
        lx = 220 + l * 200;
        ly = 50;
        lw = 6;
        lh = 620;
      }

      level.lasers.push({
        x: lx,
        y: ly,
        w: lw,
        h: lh,
        orientation,
        activeDuration: 1.8 / trapSpeedMultiplier,
        inactiveDuration: Math.max(1.0, 2.5 / trapSpeedMultiplier),
        timer: rng() * 3,
        isActive: false
      });
    }

    // 7. Auto-Turrets firing tracking energy projectiles
    for (let t = 0; t < turretCount; t++) {
      const side = t % 2 === 0 ? 'left' : 'right';
      level.turrets.push({
        x: side === 'left' ? 45 : 1235,
        y: 160 + t * 90,
        side,
        fireCooldown: Math.max(1.2, 3.2 - difficultyProgress * 1.8),
        timer: rng() * 2,
        bulletSpeed: (220 + difficultyProgress * 180)
      });
    }

    return level;
  }
}

window.ProceduralLevelGenerator = ProceduralLevelGenerator;
