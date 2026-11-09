// Precision 2D Physics Engine with AABB Collisions & Combat Resolve
class PhysicsEngine {
  static checkAABB(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.w &&
      rect1.x + rect1.w > rect2.x &&
      rect1.y < rect2.y + rect2.h &&
      rect1.y + rect1.h > rect2.y
    );
  }

  static checkCircleAABB(circle, rect) {
    // Clamping to find closest point
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    return (dx * dx + dy * dy) < (circle.radius * circle.radius);
  }

  // Update dynamic moving hazards
  static updateLevelHazards(level, dt, bulletsList) {
    // 1. Moving Saws
    for (const saw of level.saws) {
      saw.progress += saw.speed * dt;
      const offset = Math.sin(saw.progress) * (saw.distance / 2);
      if (saw.horizontal) {
        saw.x = saw.originX + offset;
      } else {
        saw.y = saw.originY + offset;
      }
    }

    // 2. Pulsing Lasers
    for (const laser of level.lasers) {
      laser.timer += dt;
      const cycle = laser.activeDuration + laser.inactiveDuration;
      const phase = laser.timer % cycle;
      laser.isActive = phase < laser.activeDuration;
    }

    // 3. Turrets firing energy orbs
    for (const turret of level.turrets) {
      turret.timer += dt;
      if (turret.timer >= turret.fireCooldown) {
        turret.timer = 0;
        // Spawn projectile traveling toward opposite arena side
        const dir = turret.side === 'left' ? 1 : -1;
        bulletsList.push({
          x: turret.x + (dir * 10),
          y: turret.y,
          vx: dir * turret.bulletSpeed,
          vy: 0,
          w: 8,
          h: 8,
          type: 'turret',
          ownerSlot: 0,
          damage: 35
        });
      }
    }

    // 4. Vanishing platforms logic
    for (const plat of level.platforms) {
      if (plat.type === 'vanishing') {
        if (plat.touched) {
          plat.vanishTimer += dt;
          if (plat.vanishTimer >= 0.75) {
            plat.isVanished = true;
          }
        }
      }
    }
  }

  // Solid obstacle resolution
  static resolvePlatformCollisions(entity, platforms) {
    // Horizontal Movement First
    entity.x += entity.vx;
    for (const plat of platforms) {
      if (plat.isVanished) continue;
      if (PhysicsEngine.checkAABB(entity, plat)) {
        if (entity.vx > 0) {
          entity.x = plat.x - entity.w;
        } else if (entity.vx < 0) {
          entity.x = plat.x + plat.w;
        }
        entity.vx = 0;
      }
    }

    // Vertical Movement Second
    entity.y += entity.vy;
    entity.grounded = false;

    for (const plat of platforms) {
      if (plat.isVanished) continue;
      if (PhysicsEngine.checkAABB(entity, plat)) {
        if (entity.vy > 0) {
          // Landing on platform top
          entity.y = plat.y - entity.h;
          entity.vy = 0;
          entity.grounded = true;
          entity.jumpCount = 0;
          if (plat.type === 'vanishing') plat.touched = true;
        } else if (entity.vy < 0) {
          // Hitting ceiling
          entity.y = plat.y + plat.h;
          entity.vy = 0;
        }
      }
    }
  }
}

window.PhysicsEngine = PhysicsEngine;
