class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mySlot = 1;
    this.roomId = null;
    this.socket = null;

    this.levelData = null;
    this.bullets = [];
    this.particles = [];
    this.slashEffects = [];

    this.players = {
      1: this.createPlayerInstance(1, 120, 620),
      2: this.createPlayerInstance(2, 1140, 620)
    };

    this.keys = {};
    this.isRunning = false;
    this.lastTime = performance.now();
    this.matchTimer = 0;

    this.initInputListeners();
  }

  createPlayerInstance(slot, x, y) {
    return {
      slot,
      x,
      y,
      w: 24,
      h: 36,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      facing: slot === 1 ? 1 : -1,
      grounded: false,
      jumpCount: 0,
      maxJumps: 2,
      isDashing: false,
      dashTimer: 0,
      dashCooldown: 0,
      slashTimer: 0,
      shootCooldown: 0,
      isInvulnerable: false,
      invulnTimer: 0,
      color: slot === 1 ? '#ff2a4b' : '#00e5ff',
      isDead: false
    };
  }

  initInputListeners() {
    // Physical Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.handleInstantActions(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Virtual Touch Buttons
    this.initTouchListeners();
  }

  initTouchListeners() {
    const touchButtons = document.querySelectorAll('.touch-btn');

    touchButtons.forEach(btn => {
      const keyCode = btn.getAttribute('data-key');

      const startAction = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();

        if (window.soundFX) window.soundFX.init();

        this.keys[keyCode] = true;
        this.handleInstantActions(keyCode);
      };

      const stopAction = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();

        this.keys[keyCode] = false;
      };

      // Native Touch Handlers
      btn.addEventListener('touchstart', startAction, { passive: false });
      btn.addEventListener('touchend', stopAction, { passive: false });
      btn.addEventListener('touchcancel', stopAction, { passive: false });

      // Mouse Fallback
      btn.addEventListener('mousedown', startAction);
      btn.addEventListener('mouseup', stopAction);
      btn.addEventListener('mouseleave', stopAction);
    });
  }

  handleInstantActions(code) {
    if (!this.isRunning) return;
    const me = this.players[this.mySlot];
    if (!me || me.isDead) return;

    // Jump & Double Jump
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') {
      if (me.grounded || me.jumpCount < me.maxJumps) {
        me.vy = -10.5;
        me.jumpCount++;
        me.grounded = false;
        if (window.soundFX) window.soundFX.playJump();
        this.spawnDust(me.x + me.w / 2, me.y + me.h, 6, '#8899aa');
      }
    }

    // Hyper Dash
    if ((code === 'KeyK' || code === 'KeyX' || code === 'ShiftLeft') && me.dashCooldown <= 0) {
      me.isDashing = true;
      me.dashTimer = 0.16;
      me.dashCooldown = 0.9;
      me.isInvulnerable = true;
      me.invulnTimer = 0.2;
      me.vx = me.facing * 18;
      me.vy = 0;
      if (window.soundFX) window.soundFX.playDash();
      this.spawnDust(me.x + me.w / 2, me.y + me.h / 2, 10, me.color);
    }

    // Melee Slash
    if ((code === 'KeyJ' || code === 'KeyZ' || code === 'KeyF') && me.slashTimer <= 0) {
      me.slashTimer = 0.25;
      if (window.soundFX) window.soundFX.playSlash();
      this.executeMeleeSlash(me);
    }

    // Plasma Shot
    if ((code === 'KeyL' || code === 'KeyC') && me.shootCooldown <= 0) {
      me.shootCooldown = 0.65;
      if (window.soundFX) window.soundFX.playShoot();
      const bullet = {
        x: me.x + (me.facing === 1 ? me.w + 5 : -15),
        y: me.y + 12,
        vx: me.facing * 12,
        vy: 0,
        w: 12,
        h: 6,
        type: 'plasma',
        ownerSlot: me.slot,
        damage: 25
      };
      this.bullets.push(bullet);

      if (this.socket) {
        this.socket.emit('playerAttack', {
          roomId: this.roomId,
          attackData: { type: 'bullet', bullet }
        });
      }
    }
  }

  executeMeleeSlash(me) {
    const slashBox = {
      x: me.facing === 1 ? me.x + me.w : me.x - 38,
      y: me.y - 6,
      w: 38,
      h: 46
    };

    this.slashEffects.push({
      x: slashBox.x + slashBox.w / 2,
      y: slashBox.y + slashBox.h / 2,
      facing: me.facing,
      timer: 0.15,
      color: me.color
    });

    if (this.socket) {
      this.socket.emit('playerAttack', {
        roomId: this.roomId,
        attackData: { type: 'slash', slashBox, slot: me.slot }
      });
    }

    const opponentSlot = me.slot === 1 ? 2 : 1;
    const rival = this.players[opponentSlot];
    if (PhysicsEngine.checkAABB(slashBox, rival) && !rival.isInvulnerable && !rival.isDead) {
      this.applyDamageToPlayer(opponentSlot, 40, me.slot, 'MELEE_SLASH');
    }
  }

  applyDamageToPlayer(targetSlot, damage, dealerSlot, reason) {
    const victim = this.players[targetSlot];
    if (!victim || victim.isDead || victim.isInvulnerable) return;

    victim.hp = Math.max(0, victim.hp - damage);
    victim.isInvulnerable = true;
    victim.invulnTimer = 0.35;
    if (window.soundFX) window.soundFX.playHit();
    this.spawnDust(victim.x + victim.w / 2, victim.y + victim.h / 2, 14, '#ff0033');

    if (this.socket) {
      this.socket.emit('playerDamaged', {
        roomId: this.roomId,
        targetSlot,
        damage,
        dealerSlot,
        reason
      });
    }

    if (victim.hp <= 0 && !victim.isDead) {
      victim.isDead = true;
      if (window.soundFX) window.soundFX.playDeath();
      if (this.socket && targetSlot === this.mySlot) {
        this.socket.emit('playerDied', {
          roomId: this.roomId,
          victimSlot: targetSlot,
          killerSlot: dealerSlot,
          reason
        });
      }
    }
  }

  loadLevel(levelNum, seed) {
    this.levelData = ProceduralLevelGenerator.generateLevel(levelNum, seed);
    this.bullets = [];
    this.particles = [];
    this.slashEffects = [];
    this.matchTimer = 0;

    this.players[1] = this.createPlayerInstance(1, this.levelData.spawns.p1.x, this.levelData.spawns.p1.y);
    this.players[2] = this.createPlayerInstance(2, this.levelData.spawns.p2.x, this.levelData.spawns.p2.y);

    document.getElementById('hud-level-num').innerText = levelNum < 10 ? '0' + levelNum : levelNum;
    document.getElementById('hazard-modifier').innerText = `HAZARD VELOCITY: ${this.levelData.trapSpeedMultiplier.toFixed(2)}x`;
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
  }

  loop(timestamp) {
    if (!this.isRunning) return;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.matchTimer += dt;
    this.updateHUDTimer();

    PhysicsEngine.updateLevelHazards(this.levelData, dt, this.bullets);

    const me = this.players[this.mySlot];
    if (me && !me.isDead) {
      this.updateLocalPlayerPhysics(me, dt);
    }

    [1, 2].forEach(slot => {
      const p = this.players[slot];
      if (p.invulnTimer > 0) {
        p.invulnTimer -= dt;
        if (p.invulnTimer <= 0) p.isInvulnerable = false;
      }
      if (p.dashCooldown > 0) p.dashCooldown -= dt;
      if (p.slashTimer > 0) p.slashTimer -= dt;
      if (p.shootCooldown > 0) p.shootCooldown -= dt;
    });

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx;
      b.y += b.vy;

      let hitSolid = false;
      for (const plat of this.levelData.platforms) {
        if (!plat.isVanished && PhysicsEngine.checkAABB(b, plat)) {
          hitSolid = true;
          break;
        }
      }

      if (!hitSolid) {
        [1, 2].forEach(slot => {
          const target = this.players[slot];
          if (b.ownerSlot !== slot && !target.isDead && !target.isInvulnerable) {
            if (PhysicsEngine.checkAABB(b, target)) {
              this.applyDamageToPlayer(slot, b.damage, b.ownerSlot, 'PROJECTILE');
              hitSolid = true;
            }
          }
        });
      }

      if (hitSolid || b.x < 0 || b.x > 1280 || b.y < 0 || b.y > 720) {
        this.spawnDust(b.x, b.y, 5, '#ffff00');
        this.bullets.splice(i, 1);
      }
    }

    if (!this.levelData.altar.captured && me && !me.isDead) {
      if (PhysicsEngine.checkAABB(me, this.levelData.altar)) {
        this.levelData.altar.captured = true;
        if (window.soundFX) window.soundFX.playVictory();
        if (this.socket) {
          this.socket.emit('objectiveClaimed', {
            roomId: this.roomId,
            claimerSlot: me.slot
          });
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.slashEffects.length - 1; i >= 0; i--) {
      const s = this.slashEffects[i];
      s.timer -= dt;
      if (s.timer <= 0) this.slashEffects.splice(i, 1);
    }

    if (this.socket && this.roomId && me) {
      this.socket.emit('playerSync', {
        roomId: this.roomId,
        state: {
          x: me.x,
          y: me.y,
          vx: me.vx,
          vy: me.vy,
          hp: me.hp,
          facing: me.facing,
          isDashing: me.isDashing,
          isDead: me.isDead
        }
      });
    }

    this.updateHUDDisplay();
  }

  updateLocalPlayerPhysics(me, dt) {
    if (me.isDashing) {
      me.dashTimer -= dt;
      if (me.dashTimer <= 0) {
        me.isDashing = false;
        me.vx *= 0.3;
      }
    } else {
      const moveLeft = this.keys['KeyA'] || this.keys['ArrowLeft'];
      const moveRight = this.keys['KeyD'] || this.keys['ArrowRight'];

      const accel = me.grounded ? 1.2 : 0.8;
      const friction = me.grounded ? 0.78 : 0.90;
      const maxSpeed = 5.8;

      if (moveLeft) {
        me.vx = Math.max(-maxSpeed, me.vx - accel);
        me.facing = -1;
      } else if (moveRight) {
        me.vx = Math.min(maxSpeed, me.vx + accel);
        me.facing = 1;
      } else {
        me.vx *= friction;
        if (Math.abs(me.vx) < 0.1) me.vx = 0;
      }

      me.vy += 0.52;
      if (me.vy > 12) me.vy = 12;
    }

    PhysicsEngine.resolvePlatformCollisions(me, this.levelData.platforms);

    for (const spike of this.levelData.spikes) {
      if (PhysicsEngine.checkAABB(me, spike)) {
        this.applyDamageToPlayer(me.slot, 100, 0, 'SPIKES_IMPALED');
      }
    }

    for (const saw of this.levelData.saws) {
      if (PhysicsEngine.checkCircleAABB(saw, me)) {
        this.applyDamageToPlayer(me.slot, 100, 0, 'SAW_DISMEMBERMENT');
      }
    }

    for (const laser of this.levelData.lasers) {
      if (laser.isActive && PhysicsEngine.checkAABB(me, laser)) {
        this.applyDamageToPlayer(me.slot, 100, 0, 'LASER_INCINERATION');
      }
    }
  }

  spawnDust(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        size: Math.random() * 3 + 1,
        life: 0.35,
        color
      });
    }
  }

  updateHUDTimer() {
    const mins = Math.floor(this.matchTimer / 60);
    const secs = (this.matchTimer % 60).toFixed(1);
    const formatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    document.getElementById('hud-timer').innerText = formatted;
  }

  updateHUDDisplay() {
    const p1 = this.players[1];
    const p2 = this.players[2];

    document.getElementById('p1-hp-bar').style.width = `${Math.max(0, p1.hp)}%`;
    document.getElementById('p1-hp-text').innerText = `${Math.ceil(p1.hp)} / 100`;

    document.getElementById('p2-hp-bar').style.width = `${Math.max(0, p2.hp)}%`;
    document.getElementById('p2-hp-text').innerText = `${Math.ceil(p2.hp)} / 100`;

    const me = this.players[this.mySlot];
    const dashTag = document.getElementById(this.mySlot === 1 ? 'p1-dash-cd' : 'p2-dash-cd');
    if (me && dashTag) {
      if (me.dashCooldown <= 0) {
        dashTag.innerText = 'DASH READY';
        dashTag.style.color = '#39ff14';
      } else {
        dashTag.innerText = `DASH: ${me.dashCooldown.toFixed(1)}s`;
        dashTag.style.color = '#ff4444';
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.strokeStyle = '#141b27';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }

    if (!this.levelData) return;

    for (const plat of this.levelData.platforms) {
      if (plat.isVanished) continue;
      ctx.fillStyle = plat.type === 'vanishing' ? (plat.touched ? '#ff7733' : '#aa4400') : '#1c2434';
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      ctx.fillStyle = plat.type === 'vanishing' ? '#ffa500' : '#4f6889';
      ctx.fillRect(plat.x, plat.y, plat.w, 3);
    }

    ctx.fillStyle = '#ff1133';
    for (const spike of this.levelData.spikes) {
      const count = Math.max(1, Math.floor(spike.w / 10));
      const step = spike.w / count;
      for (let s = 0; s < count; s++) {
        ctx.beginPath();
        ctx.moveTo(spike.x + s * step, spike.y + spike.h);
        ctx.lineTo(spike.x + (s + 0.5) * step, spike.y);
        ctx.lineTo(spike.x + (s + 1) * step, spike.y + spike.h);
        ctx.closePath();
        ctx.fill();
      }
    }

    for (const saw of this.levelData.saws) {
      ctx.save();
      ctx.translate(saw.x, saw.y);
      ctx.rotate(saw.progress * 8);
      ctx.fillStyle = '#dd1133';
      ctx.beginPath();
      ctx.arc(0, 0, saw.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      for (let t = 0; t < 8; t++) {
        ctx.rotate((Math.PI * 2) / 8);
        ctx.strokeRect(-2, -saw.radius - 4, 4, 6);
      }
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const laser of this.levelData.lasers) {
      if (laser.isActive) {
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
        ctx.fillRect(laser.x, laser.y, laser.w, laser.h);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.fillRect(laser.x, laser.y, laser.w, laser.h);
      }
    }

    const altar = this.levelData.altar;
    ctx.fillStyle = '#ffbe0b';
    ctx.shadowColor = '#ffbe0b';
    ctx.shadowBlur = 20;
    ctx.fillRect(altar.x, altar.y, altar.w, altar.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 12px Chakra Petch';
    ctx.fillText('ALTAR', altar.x + 6, altar.y + 28);

    for (const b of this.bullets) {
      ctx.fillStyle = b.type === 'turret' ? '#ff3300' : (b.ownerSlot === 1 ? '#ff2a4b' : '#00e5ff');
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;
    }

    for (const s of this.slashEffects) {
      ctx.strokeStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, s.facing === 1 ? -Math.PI / 3 : Math.PI * 2 / 3, s.facing === 1 ? Math.PI / 3 : Math.PI * 4 / 3);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    [1, 2].forEach(slot => {
      const p = this.players[slot];
      if (!p || p.isDead) return;

      if (p.isInvulnerable && Math.floor(performance.now() / 60) % 2 === 0) return;

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.isDashing ? 18 : 6;
      ctx.fillRect(p.x, p.y, p.w, p.h);

      ctx.fillStyle = '#ffffff';
      const eyeX = p.facing === 1 ? p.x + p.w - 8 : p.x + 2;
      ctx.fillRect(eyeX, p.y + 6, 6, 4);

      if (p.isDashing) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(p.x - p.facing * 12, p.y, p.w, p.h);
        ctx.globalAlpha = 1.0;
      }
      ctx.restore();
    });

    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    if (this.levelData.fogOfWar) {
      const me = this.players[this.mySlot];
      if (me) {
        const grad = ctx.createRadialGradient(
          me.x + me.w / 2, me.y + me.h / 2, 70,
          me.x + me.w / 2, me.y + me.h / 2, 360
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.92)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
  }
}

window.GameEngine = GameEngine;