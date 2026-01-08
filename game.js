/**
 * Space Shooter Pro - Game Engine
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ASSETS = {
    player: "Public/BẠN.png",
    enemySmall: "Public/Mini_Minion.png",
    enemyMedium: "Public/Minion.png",
    boss: "Public/Boss.png",
    missile: "Public/Fire.png",
    explosion: "Public/Nổ.png",
    ally: "Public/đồng đội.png",
    background: "Public/eec663343d1d41c9fd5baf68d1e30147.0000000.jpg"
};

const images = {};
let loadedImages = 0;
const totalImages = Object.keys(ASSETS).length;

let bestScore = parseInt(localStorage.getItem('space_shooter_best_score')) || 0;
let bestLevel = parseInt(localStorage.getItem('space_shooter_best_level')) || 1;

const gameState = {
    isStarted: false,
    isGameOver: false,
    isPaused: false,
    score: 0,
    level: 1,
    nextBossScore: 2500,
    isBossFight: false,
    mouse: { x: window.innerWidth / 2, y: window.innerHeight - 100 },
    joystick: { x: 0, y: 0, active: false },
    isMobile: false,
    shake: 0,
    bgY: 0,

    // BOOM System Upgraded (Modified for Task 9)
    boomCharges: 1,
    boomMaxCharges: 1, // Max 1, no stacking as per Task 9
    boomTimer: 0,
    boomChargeSpeed: 5000, // 5s as per Task 9
    boomGainAmount: 1,
    boomGCD: 0,
    isFiringBooms: false,

    // Missile Bounces (PowerUp dependent)
    maxMissileBounces: 1,

    lastFrameTime: performance.now(),

    // Difficulty Scaling
    difficulty: 1.0,
    bossCount: 0,
    lastLevel: 1,

    // Weapon Tiers: 0 (Yellow), 1 (Green), 2 (Blue)
    weaponTier: 0
};

const entities = {
    bullets: [],
    enemyBullets: [],
    enemies: [],
    missiles: [],
    explosions: [],
    powerUps: [],
    allies: [],
    boss: null
};

/**
 * CLASSES
 */
class Ally {
    constructor(parent, index) {
        this.parent = parent;
        this.index = index; // 0-5
        this.width = 20;
        this.height = 20;
        this.x = parent.x;
        this.y = parent.y;
        this.fireTimer = 0;
        this.maxHp = parent.maxHp * 0.3;
        this.hp = this.maxHp;
        this.target = null;
    }

    update(dt) {
        // Position logic: Balanced 2 columns, slightly higher position
        const isLeft = this.index % 2 === 0;
        const colIndex = Math.floor(this.index / 2); // row in column

        const offsetX = isLeft ? -45 - (colIndex * 15) : 45 + (colIndex * 15);
        const offsetY = -5 + (colIndex * 25); // Negative/near zero is higher than before

        const tx = this.parent.x + offsetX;
        const ty = this.parent.y + offsetY;

        this.x += (tx - this.x) * 0.1;
        this.y += (ty - this.y) * 0.1;

        // Scale HP with player max HP
        const targetMaxHp = this.parent.maxHp * 0.3;
        if (this.maxHp !== targetMaxHp) {
            const ratio = targetMaxHp / this.maxHp;
            this.maxHp = targetMaxHp;
            this.hp *= ratio;
        }

        this.fireTimer += dt;
        const playerFireRate = 160 / (1 + (gameState.level - 1) * 0.1);
        const allyFireRate = playerFireRate * 2; // 50% speed = double fire interval

        if (this.fireTimer > allyFireRate) {
            const playerBulletDmg = player.level <= 5 ? 25 : 25 + (player.level - 5) * 15;
            // Ally fire straight up with slight tilt if many
            const spread = (this.index % 2 === 0 ? -0.1 : 0.1) * (colIndex + 1);
            const b = new Bullet(this.x, this.y, -Math.PI / 2 + spread, playerBulletDmg * 0.5);
            b.radius = 2.5;
            b.isLong = true;
            entities.bullets.push(b);
            this.fireTimer = 0;
        }
    }

    findNearestEnemy() {
        let minD = Infinity;
        let potential = null;
        [...entities.enemies, entities.boss].forEach(e => {
            if (e) {
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < minD) { minD = d; potential = e; }
            }
        });
        this.target = potential;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Ally appearance (straightened)
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0ea5e9';
        ctx.drawImage(images.ally, -10, -10, 20, 20);

        // HP mini-bar for ally
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-10, 12, 20, 3);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(-10, 12, 20 * hpPercent, 3);

        ctx.restore();
    }
}

class Player {
    constructor() {
        this.width = 55;
        this.height = 55;
        this.x = canvas.width / 2;
        this.y = canvas.height - 100;
        this.lerp = 0.15;
        this.fireTimer = 0;
        this.level = 0; // Task 3: Start with 1 bullet (0*2+1)
        this.slowTimer = 0;
        this.jammedTimer = 0;
        this.hp = 600;
        this.maxHp = 600;
        this.shield = 0;
        this.tilt = 0;
    }

    takeDamage(amt) {
        // Task 5: Shield logic (250 + 10% max HP)
        if (this.shield > 0) {
            this.shield -= amt;
            if (this.shield < 0) {
                const leftover = -this.shield;
                this.shield = 0;
                this.hp -= leftover;
            }
            gameState.shake = 5;
            updateUI();
            return;
        }

        // Damage allies first
        if (entities.allies.length > 0) {
            const ally = entities.allies[entities.allies.length - 1];
            ally.hp -= amt;
            if (ally.hp <= 0) {
                createExplosion(ally.x, ally.y);
                entities.allies.pop();
            }
            return;
        }

        this.hp -= amt;
        gameState.shake = 15;
        if (this.hp <= 0) {
            this.hp = 0;
            gameOver();
        }
        updateUI();
    }

    update(dt) {
        if (this.slowTimer > 0) this.slowTimer -= dt;
        if (this.jammedTimer > 0) this.jammedTimer -= dt;

        let curLerp = this.slowTimer > 0 ? this.lerp * 0.4 : this.lerp;
        // Task 8: Mobile speed and smoother lerp
        let lerpFactor = 1 - Math.pow(1 - curLerp, dt / 16.6);
        if (gameState.isMobile) lerpFactor *= 0.8;

        let oldX = this.x;
        this.x += (gameState.mouse.x - this.x) * lerpFactor;
        this.y += (gameState.mouse.y - this.y) * lerpFactor;

        const vx = this.x - oldX;
        this.tilt = (vx * 0.08);
        this.tilt = Math.max(-0.4, Math.min(0.4, this.tilt));

        this.x = Math.max(this.width / 2, Math.min(canvas.width - this.width / 2, this.x));
        this.y = Math.max(this.height / 2, Math.min(canvas.height - this.height / 2, this.y));

        if (this.jammedTimer <= 0) {
            this.fireTimer += dt;
            let levelBonus = (gameState.level - 1) * 0.1;
            let currentFireRate = 160 / (1 + levelBonus);

            if (this.fireTimer >= currentFireRate) {
                this.shoot();
                this.fireTimer = 0;
            }
        }
    }

    shoot() {
        // Task 3: Bullet limit 5, start 1
        let count = Math.floor(this.level * 2 + 1);
        if (gameState.weaponTier === 0 && count > 5) {
            gameState.weaponTier = 1;
            this.level = 0;
            count = 1;
        } else if (gameState.weaponTier === 1 && count > 5) {
            gameState.weaponTier = 2;
            this.level = 0;
            count = 1;
        }
        count = Math.min(count, 5);

        const spread = 0.5;
        const startAngle = -spread / 2;
        let bulletDamage = this.level <= 5 ? 25 : 25 + (this.level - 5) * 15;
        if (gameState.weaponTier === 1) bulletDamage *= 3.0;
        if (gameState.weaponTier === 2) bulletDamage *= 4.0;

        for (let i = 0; i < count; i++) {
            const step = count > 1 ? i / (count - 1) : 0.5;
            const angle = startAngle + step * spread;
            const b = new Bullet(
                this.x,
                this.y - this.height / 2,
                -Math.PI / 2 + angle,
                bulletDamage,
                false,
                false,
                gameState.weaponTier
            );
            entities.bullets.push(b);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Task 5: Shield visual
        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 130, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
            ctx.fill();
        }

        ctx.rotate(this.tilt);
        ctx.filter = 'brightness(1.3) contrast(1.1)';
        if (this.jammedTimer > 0) ctx.filter = 'grayscale(100%) brightness(1.5)';
        if (this.slowTimer > 0) ctx.filter = 'hue-rotate(280deg) saturate(2) brightness(1.3)';
        ctx.drawImage(images.player, -this.width / 2, -this.height / 2, this.width, this.height);

        if (!gameState.isGameOver) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.beginPath();
            ctx.arc(0, this.height / 2 + Math.random() * 10, 6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angle, damage, isEnemy = false, isDebuff = false, tier = 0, isDowngrade = false) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * (isEnemy ? 5 : 9);
        this.vy = Math.sin(angle) * (isEnemy ? 5 : 9);
        this.damage = damage;
        this.isEnemy = isEnemy;
        this.isDebuff = isDebuff;
        this.isDowngrade = isDowngrade;
        this.tier = tier; // 0: Yellow, 1: Green, 2: Blue
        this.radius = isDebuff || isDowngrade ? 10 : 4;
        this.trail = [];
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.save();
        ctx.beginPath();
        if (this.isDebuff || this.isDowngrade) {
            const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.radius);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(1, this.isDowngrade ? '#ec4899' : '#a855f7');
            ctx.fillStyle = grad;
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.isDowngrade ? '#ec4899' : '#a855f7';
        } else {
            let color = '#fbbf24'; // Default Yellow
            if (!this.isEnemy) {
                if (this.tier === 1) color = '#22c55e'; // Green
                if (this.tier === 2) color = '#3b82f6'; // Blue

                // Opacity 100% and Brighter by 40% for player bullets
                ctx.globalAlpha = 1.0;
                ctx.filter = 'brightness(1.4)';
            } else {
                color = '#ef4444'; // Enemy Red
            }

            ctx.fillStyle = color;
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;

            // Add a bright core for player bullets
            if (!this.isEnemy) {
                const grad = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, this.radius);
                grad.addColorStop(0, '#fff');
                grad.addColorStop(1, color);
                ctx.fillStyle = grad;
            }
        }

        if (this.isLong) {
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx));
            ctx.roundRect(-this.radius * 2.5, -this.radius, this.radius * 5, this.radius * 2, this.radius);
            ctx.fill();
        } else {
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = type === 'small' ? 32 : 55;
        this.height = type === 'small' ? 32 : 55;

        // Calculate Player Power Factor (HP Scaling)
        let baseDmg = 25;
        let pLevel = player.level;
        let currentDmg = pLevel <= 5 ? 25 : 25 + (pLevel - 5) * 15;
        if (gameState.weaponTier === 1) currentDmg *= 3;
        if (gameState.weaponTier === 2) currentDmg *= 4;

        let dmgRatio = currentDmg / baseDmg;
        let hpMultiplier = 1 + (dmgRatio - 1) * 0.8;
        if (player.level > 1) hpMultiplier += 0.15;

        const baseHp = type === 'small' ? 100 : 400;
        this.hp = baseHp * gameState.difficulty * hpMultiplier;

        let levelSpeedBonus = (gameState.level - 1) * 0.1;
        this.speed = (type === 'small' ? 0.75 : 0.55) + levelSpeedBonus;
        this.vx = type === 'medium' ? (Math.random() > 0.5 ? 0.45 : -0.45) : 0;
        this.fireTimer = Math.random() * 1500;

        // Task 3: Enemy bullet count 1,2,3 when player > 3 bullets (player.level > 1)
        this.bulletCount = 1;
        const playerBulletsCount = Math.floor(player.level * 2 + 1);
        if (playerBulletsCount > 3) {
            this.bulletCount = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
        }

        // Task 4: Dash and Shield (Adjusted: stop at 1/8 of screen height)
        this.entryTimer = 0;
        this.dashDuration = 800; // 0.8s
        this.dashTargetY = canvas.height / 8;
        this.startY = this.y;
    }

    update(dt) {
        this.entryTimer += dt;

        // Stop dash if duration ends OR reaches the target 1/8 position
        if (this.entryTimer < this.dashDuration && this.y < this.dashTargetY) {
            // Dash to position
            const progress = this.entryTimer / this.dashDuration;
            this.y = this.startY + (this.dashTargetY - this.startY) * progress;
        } else {
            this.y += this.speed;
        }

        this.x += this.vx;
        if (this.type === 'medium') {
            if (this.x < 100 || this.x > canvas.width - 100) this.vx *= -1;
        }

        this.fireTimer += dt;
        let levelFireBonus = (gameState.level - 1) * 0.1;
        const baseFireRate = 2500 / (1 + (gameState.difficulty - 1) * 0.3);
        let fireRate = Math.max(600, baseFireRate / (1 + levelFireBonus));

        if (this.bulletCount > 1) {
            fireRate *= 1.8;
        }

        if (this.fireTimer > fireRate) {
            if (this.bulletCount > 1) {
                const spread = 0.6;
                const startAngle = Math.PI / 2 - spread / 2;
                for (let i = 0; i < this.bulletCount; i++) {
                    const step = i / (this.bulletCount - 1);
                    entities.enemyBullets.push(new Bullet(this.x, this.y + this.height / 2, startAngle + step * spread, 80, true));
                }
            } else if (this.type === 'medium') {
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height / 2, Math.PI / 2, 80, true));
            } else {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height / 2, angle, 80, true));
            }
            this.fireTimer = 0;
        }
    }

    takeDamage(amt) {
        // Task 4: Shield 90% only during entry (Ends at 0.8s OR when reaching 1/8 screen height)
        let reduction = 0;
        if (this.entryTimer < 800 && this.y < canvas.height / 8) reduction = 0.9;
        this.hp -= amt * (1 - reduction);
    }

    draw() {
        ctx.save();
        ctx.filter = 'brightness(1.4) saturate(1.2)';
        if (this.bulletCount > 1) ctx.filter += ' hue-rotate(90deg)';
        const img = this.type === 'small' ? images.enemySmall : images.enemyMedium;
        ctx.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);

        // Shield visual - only during active dash/protection
        if (this.entryTimer < 800 && this.y < canvas.height / 8) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }
}

class Missile {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.speed = 7.2; // 20% slower than player bullet (9 * 0.8 = 7.2)
        this.target = null;
        this.bounces = 0;
        this.hitTargets = new Set();
        this.width = 45;
        this.height = 45;
        this.angle = -Math.PI / 2;
        this.findTarget();
    }

    findTarget() {
        if (entities.boss) { this.target = entities.boss; return; }
        let minD = Infinity;
        let potential = null;
        entities.enemies.forEach(e => {
            if (!this.hitTargets.has(e)) {
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < minD) { minD = d; potential = e; }
            }
        });
        this.target = potential;
    }

    update(dt) {
        if (this.target && (entities.enemies.includes(this.target) || this.target === entities.boss)) {
            const angleTo = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            let diff = angleTo - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            // Smoother turn using dt
            const turnSpeed = 0.012 * dt;
            this.angle += diff * Math.min(1, turnSpeed);
        } else {
            this.findTarget();
        }

        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        if (this.target) {
            if (Math.hypot(this.target.x - this.x, this.target.y - this.y) < 40) {
                this.hit(this.target);
            }
        }
    }

    hit(target) {
        if (target === entities.boss) {
            target.hp -= 1000;
            this.bounces = gameState.maxMissileBounces; // Force stop after boss hit
        } else {
            target.hp -= 1500;
        }
        this.hitTargets.add(target);
        createExplosion(this.x, this.y);
        this.bounces++;
        if (this.bounces < gameState.maxMissileBounces) {
            this.findTarget();
            if (!this.target) this.bounces = gameState.maxMissileBounces;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + Math.PI / 2);
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f97316';
        ctx.drawImage(images.missile, -this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }
}

class Boss {
    constructor() {
        this.width = 180;
        this.height = 140;
        this.x = canvas.width / 2;
        this.y = -250;
        this.targetY = 150;

        // Check if it's a Super Boss (every 5th boss)
        this.isSuper = (gameState.bossCount + 1) % 5 === 0;

        // Progressive HP scaling (Significantly increased from level 2 onwards)
        const scalingFactor = gameState.bossCount >= 1 ? 25000 : 12000;
        const baseHp = 8000 + (gameState.bossCount * scalingFactor);
        let finalMaxHp = this.isSuper ? baseHp * 4.5 : baseHp;

        // Task: Increase Boss HP > level 2 by 15%
        if (gameState.bossCount >= 1) { // Level 2 and above
            finalMaxHp *= 1.15;
        }

        this.maxHp = finalMaxHp;
        this.hp = this.maxHp;

        if (this.isSuper) {
            this.width *= 1.4;
            this.height *= 1.4;
        }

        this.fireTimer = 0;
        this.debuffTimer = 0;
        this.moveTimer = 0;

        // Thresholds for Super Boss Downgrade Attack
        this.thresholds = [0.8, 0.5, 0.3, 0.1];
        this.triggeredThresholds = new Set();
    }

    fireDowngradeWave() {
        // Slow, easy to dodge wave
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const b = new Bullet(this.x, this.y, angle, 0, true, false, 0, true);
            b.vx *= 0.4; // Very slow
            b.vy *= 0.4;
            entities.enemyBullets.push(b);
        }
    }

    update(dt) {
        if (this.y < this.targetY) this.y += 0.45; // Slower descent (30% of 1.5)
        else {
            this.moveTimer += dt;
            // Slower horizontal movement oscillation
            this.x = canvas.width / 2 + Math.sin(this.moveTimer / 3500) * (canvas.width / 3);
        }

        // Super Boss HP Threshold Checks
        if (this.isSuper) {
            const currentHpPercent = this.hp / this.maxHp;
            this.thresholds.forEach(t => {
                if (currentHpPercent <= t && !this.triggeredThresholds.has(t)) {
                    this.fireDowngradeWave();
                    this.triggeredThresholds.add(t);
                }
            });
        }

        this.fireTimer += dt;
        const bossFireRate = Math.max(600, 1500 / (1 + gameState.bossCount * 0.2));
        const finalFireRate = this.isSuper ? bossFireRate * 0.7 : bossFireRate;

        if (this.fireTimer > finalFireRate) { // Progressive fire rate
            const spreadCount = this.isSuper ? 5 : 3;
            for (let i = -spreadCount; i <= spreadCount; i++) {
                entities.enemyBullets.push(new Bullet(this.x + i * 25, this.y + 60, Math.PI / 2 + i * 0.2, 1, true));
            }
            this.fireTimer = 0;
        }

        this.debuffTimer += dt;
        if (this.debuffTimer > 6000) { // Slower (was 4000)
            for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2 + (this.moveTimer / 400);
                entities.enemyBullets.push(new Bullet(this.x, this.y, angle, 0, true, true));
            }
            this.debuffTimer = 0;
        }
    }

    draw() {
        // Boss Health Bar UI (y moved to 70 to avoid HUD)
        const bw = 400;
        const barY = 70;
        ctx.save();

        if (this.isSuper) {
            ctx.filter = 'brightness(1.5) hue-rotate(290deg) saturate(1.5)'; // Darker purple/pink for Super Boss
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#d946ef';
        } else {
            ctx.filter = 'brightness(1.3)'; // Highlight Boss
        }

        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.fillRect(canvas.width / 2 - bw / 2, barY, bw, 12);
        const hpWidth = (this.hp / this.maxHp) * bw;
        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        if (this.isSuper) {
            grad.addColorStop(0, '#d946ef');
            grad.addColorStop(1, '#701a75');
        } else {
            grad.addColorStop(0, '#ef4444');
            grad.addColorStop(1, '#991b1b');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(canvas.width / 2 - bw / 2, barY, hpWidth, 12);

        // HP Text for Boss
        ctx.fillStyle = "white";
        ctx.font = "bold 10px Inter";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.ceil(this.hp)} / ${this.maxHp}`, canvas.width / 2, barY - 5);

        ctx.drawImage(images.boss, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        ctx.restore();
    }
}

class PowerUp {
    constructor(x, y, type = 'W') {
        this.x = x; this.y = y; this.radius = 20;
        this.type = type; // 'W', 'H', 'A', 'B', 'U', 'S' (Shield)
    }
    update() { this.y += 2.2; }
    draw() {
        let color = '#22c55e';
        let label = 'W';
        if (this.type === 'H') { color = '#f43f5e'; label = '❤'; }
        if (this.type === 'A') { color = '#3b82f6'; label = '★'; }
        if (this.type === 'B') { color = '#f97316'; label = '🔥'; }
        if (this.type === 'U') { color = '#a855f7'; label = '⚡'; }
        if (this.type === 'S') { color = '#06b6d4'; label = '🛡'; }
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, this.x, this.y + 8);
        ctx.restore();
    }
}

class Explosion {
    constructor(x, y) {
        this.x = x; this.y = y; this.life = 600;
    }
    update(dt) { this.life -= dt; }
    draw() {
        ctx.globalAlpha = this.life / 600;
        ctx.drawImage(images.explosion, this.x - 60, this.y - 60, 120, 120);
        ctx.globalAlpha = 1.0;
    }
}

/**
 * ENGINE LOGIC
 */
const player = new Player();

function createExplosion(x, y) {
    entities.explosions.push(new Explosion(x, y));
    gameState.shake = 12;
}

function spawnEnemy() {
    // Favor small enemies more at start (Level 1-2)
    const threshold = gameState.level <= 1 ? 0.95 : Math.max(0.6, 1 - (gameState.difficulty * 0.1));
    const type = Math.random() < threshold ? 'small' : 'medium';
    const x = 50 + Math.random() * (canvas.width - 100);
    entities.enemies.push(new Enemy(x, -50, type));
}

function fireMissile() {
    if (!gameState.isStarted || gameState.isPaused || gameState.isGameOver) return;
    if (gameState.boomCharges > 0) {
        entities.missiles.push(new Missile(player.x, player.y));
        gameState.boomCharges = 0; // No stacking, consuming it
        gameState.boomTimer = 0;

        // Task 9: Allies have 50% chance to fire bomb
        entities.allies.forEach(ally => {
            if (Math.random() < 0.5) {
                entities.missiles.push(new Missile(ally.x, ally.y));
            }
        });
        updateUI();
    }
}

function updateUI() {
    document.getElementById('score-val').innerText = gameState.score;
    document.getElementById('level-val').innerText = gameState.level;

    // Update HP Bar & Text
    const hpBar = document.getElementById('hp-bar-inner');
    const hpText = document.getElementById('hp-text');
    if (hpBar) {
        const hpPercent = (player.hp / player.maxHp) * 100;
        hpBar.style.width = hpPercent + '%';
        if (hpPercent < 34) hpBar.classList.add('bg-red-500');
        else hpBar.classList.remove('bg-red-500');
    }
    if (hpText) {
        hpText.innerText = `${Math.ceil(player.hp)}/${player.maxHp}`;
    }

    if (gameState.level > bestLevel) {
        bestLevel = gameState.level;
        localStorage.setItem('space_shooter_best_level', bestLevel);
    }
    if (gameState.score > bestScore) {
        bestScore = gameState.score;
        localStorage.setItem('space_shooter_best_score', bestScore);
    }
}

function gameOver() {
    gameState.isGameOver = true;
    document.getElementById('final-score-val').innerText = gameState.score;
    document.getElementById('final-level-val').innerText = gameState.level;
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('game-over-screen').classList.add('flex');
}

function togglePause() {
    if (gameState.isGameOver) return;
    gameState.isPaused = !gameState.isPaused;
    const screen = document.getElementById('pause-screen');
    if (gameState.isPaused) {
        screen.classList.remove('hidden');
        screen.classList.add('flex');
    } else {
        screen.classList.remove('flex');
        screen.classList.add('hidden');
    }
}

/**
 * MAIN LOOP
 */
let spawnTimer = 0;

function update(dt) {
    if (gameState.isGameOver) return;

    // Update Difficulty Scaling
    gameState.difficulty = 1 + (gameState.score / 6000);
    gameState.level = Math.floor(gameState.difficulty);

    // Level Up: Increase Max HP
    if (gameState.level > gameState.lastLevel) {
        player.maxHp += 200;
        player.hp = Math.min(player.maxHp, player.hp + 200); // Heal a bit on level up
        gameState.lastLevel = gameState.level;
        updateUI();
    }

    gameState.bgY += 1.2;
    if (gameState.shake > 0) gameState.shake *= 0.88;

    player.update(dt);

    // Boom Recharge Logic
    if (gameState.boomCharges < 1) {
        gameState.boomTimer += dt;
        if (gameState.boomTimer >= gameState.boomChargeSpeed) {
            gameState.boomCharges = 1;
            gameState.boomTimer = 0;
            updateUI();
        }
    }

    // Auto-fire Boom if available
    if (gameState.isStarted && !gameState.isPaused && gameState.boomCharges > 0) {
        fireMissile();
    }

    document.getElementById('boom-bar-inner').style.width = (gameState.boomTimer / gameState.boomChargeSpeed * 100) + '%';

    spawnTimer += dt;
    // Slower spawn rate for Level 1, scaling more gradually
    if (spawnTimer > Math.max(600, 2500 - gameState.score / 20)) {
        spawnEnemy();
        spawnTimer = 0;
    }

    if (!gameState.isBossFight && gameState.score >= gameState.nextBossScore) {
        gameState.isBossFight = true;
        entities.boss = new Boss();
        const warn = document.getElementById('boss-warning');
        const warnText = warn.querySelector('div');

        if (entities.boss.isSuper) {
            warnText.innerText = "🚨 SUPER BOSS DETECTED 🚨";
            warnText.className = "text-4xl font-black text-fuchsia-500 tracking-tighter warning-pulse mb-2";
        } else {
            warnText.innerText = "⚠️ BOSS DETECTED ⚠️";
            warnText.className = "text-3xl font-black text-red-600 tracking-tighter warning-pulse mb-2";
        }

        warn.classList.remove('hidden');
        setTimeout(() => warn.classList.add('hidden'), 4000);
    }

    // Entities Updates
    entities.bullets.forEach(e => e.update());
    entities.enemyBullets.forEach(e => e.update());
    entities.enemies.forEach(e => e.update(dt));
    entities.missiles.forEach(e => e.update(dt));
    entities.explosions.forEach(e => e.update(dt));
    entities.powerUps.forEach(e => e.update());
    entities.allies.forEach(e => e.update(dt));
    if (entities.boss) entities.boss.update(dt);

    // Collisions (Optimized)
    for (let bi = entities.bullets.length - 1; bi >= 0; bi--) {
        const b = entities.bullets[bi];
        let hit = false;

        // Check enemies
        for (let ei = entities.enemies.length - 1; ei >= 0; ei--) {
            const e = entities.enemies[ei];
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.width / 2.3) {
                if (e.takeDamage) e.takeDamage(b.damage);
                else e.hp -= b.damage;
                hit = true;
                if (e.hp <= 0) {
                    createExplosion(e.x, e.y);
                    gameState.score += e.type === 'small' ? 50 : 120;
                    player.hp = Math.min(player.maxHp, player.hp + 10);

                    const rand = Math.random();
                    if (rand < 0.25) {
                        let type = 'W';
                        if (rand < 0.08) type = 'A';
                        else if (rand < 0.14) type = 'B';
                        else if (rand < 0.17) type = 'H';
                        else if (rand < 0.20) type = 'S';
                        if (e.type === 'medium' && Math.random() < 0.004) type = 'U';
                        entities.powerUps.push(new PowerUp(e.x, e.y, type));
                    }
                    updateUI();
                }
                break;
            }
        }

        if (hit) {
            entities.bullets.splice(bi, 1);
            continue;
        }

        // Check boss
        if (entities.boss && Math.hypot(b.x - entities.boss.x, b.y - entities.boss.y) < entities.boss.width / 3.5) {
            entities.boss.hp -= b.damage;
            entities.bullets.splice(bi, 1);
            if (entities.boss.hp <= 0) {
                createExplosion(entities.boss.x, entities.boss.y);
                gameState.score += 2000;
                gameState.bossCount++;
                gameState.nextBossScore = gameState.score + 3000 + (gameState.bossCount * 1000);
                if (Math.random() < 0.04) entities.powerUps.push(new PowerUp(entities.boss.x, entities.boss.y, 'U'));
                gameState.isBossFight = false;
                entities.boss = null;
                updateUI();
            }
        }
    }

    entities.enemyBullets.forEach((eb, ebi) => {
        // Task 5: Shield covers player and teammates and captures bullets easier (radius 130)
        if (player.shield > 0 && Math.hypot(eb.x - player.x, eb.y - player.y) < 130) {
            player.takeDamage(80);
            entities.enemyBullets.splice(ebi, 1);
            return;
        }

        if (Math.hypot(eb.x - player.x, eb.y - player.y) < 22) {
            if (eb.isDebuff) {
                player.slowTimer = 3500;
                player.jammedTimer = 2500;
                entities.enemyBullets.splice(ebi, 1);
            } else if (eb.isDowngrade) {
                let currentCount = player.level * 2 + 1;
                if (currentCount > 3) {
                    player.level -= 1.5;
                    if (player.level < 0) player.level = 0;
                } else if (gameState.weaponTier > 0) {
                    gameState.weaponTier--;
                    player.level = 2; // Reset
                }

                entities.enemyBullets.splice(ebi, 1);
                createExplosion(player.x, player.y);
                updateUI();
            } else {
                entities.enemyBullets.splice(ebi, 1);
                player.takeDamage(80);
            }
        }
    });

    entities.enemies.forEach(e => {
        if (Math.hypot(e.x - player.x, e.y - player.y) < 35) {
            const dmg = e.type === 'small' ? 70 : 150;
            player.takeDamage(dmg);
            e.hp = 0;
            createExplosion(e.x, e.y);
        }
    });

    entities.powerUps.forEach((p, pi) => {
        if (Math.hypot(p.x - player.x, p.y - player.y) < 38) {
            if (p.type === 'W') {
                player.level += 0.5;
            } else if (p.type === 'H') {
                const healAmt = 200;
                player.hp = Math.min(player.maxHp, player.hp + healAmt);
                entities.allies.forEach(a => a.hp = Math.min(a.maxHp, a.hp + healAmt * 0.3));
            } else if (p.type === 'A') {
                if (entities.allies.length < 6) {
                    entities.allies.push(new Ally(player, entities.allies.length));
                }
            } else if (p.type === 'B') {
                gameState.boomChargeSpeed = Math.max(2000, gameState.boomChargeSpeed - 500);
                gameState.maxMissileBounces++;
            } else if (p.type === 'U') {
                if (gameState.weaponTier < 2) {
                    gameState.weaponTier++;
                    player.level = 0;
                }
            } else if (p.type === 'S') {
                player.shield = 250 + player.maxHp * 0.1;
            }
            entities.powerUps.splice(pi, 1); updateUI();
        }
    });

    // Cleanup (Optimized: single pass filter can be faster, but let's keep it clean for now)
    entities.bullets = entities.bullets.filter(e => e.y > -100);
    entities.enemyBullets = entities.enemyBullets.filter(e => e.y < canvas.height + 100);
    entities.enemies = entities.enemies.filter(e => e.y < canvas.height + 100 && e.hp > 0);
    entities.missiles = entities.missiles.filter(e => e.bounces < gameState.maxMissileBounces);
    entities.explosions = entities.explosions.filter(e => e.life > 0);
    entities.powerUps = entities.powerUps.filter(e => e.y < canvas.height + 100);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (gameState.shake > 1) {
        ctx.translate(Math.random() * gameState.shake - gameState.shake / 2, Math.random() * gameState.shake - gameState.shake / 2);
    }

    // Scroll background
    const bgH = canvas.height;
    const sy = gameState.bgY % bgH;
    ctx.drawImage(images.background, 0, sy, canvas.width, bgH);
    ctx.drawImage(images.background, 0, sy - bgH, canvas.width, bgH);

    entities.powerUps.forEach(e => e.draw());
    entities.bullets.forEach(e => e.draw());
    entities.enemyBullets.forEach(e => e.draw());
    entities.enemies.forEach(e => e.draw());
    if (entities.boss) entities.boss.draw();
    entities.missiles.forEach(e => e.draw());
    entities.explosions.forEach(e => e.draw());
    entities.allies.forEach(e => e.draw());
    player.draw();

    ctx.restore();
}

function gameLoop(now) {
    let dt = now - gameState.lastFrameTime;
    gameState.lastFrameTime = now;

    // Slow down game speed for mobile (60%)
    if (gameState.isMobile) {
        dt *= 0.6;
    }

    if (gameState.isStarted && !gameState.isPaused) {
        update(dt);
    }
    draw();

    if (!gameState.isGameOver) requestAnimationFrame(gameLoop);
}

/**
 * INITIALIZATION
 */
function preload() {
    let loaded = 0;
    const loadingBar = document.getElementById('loading-bar');
    const loadingContainer = document.getElementById('loading-container');

    const checkComplete = () => {
        loaded++;
        if (loadingBar) {
            loadingBar.style.width = (loaded / totalImages * 100) + '%';
        }
        if (loaded === totalImages) {
            setTimeout(() => {
                if (loadingContainer) loadingContainer.classList.add('hidden');
            }, 500);
            init();
        }
    };

    for (const key in ASSETS) {
        const img = new Image();
        img.src = ASSETS[key];
        img.onload = checkComplete;
        img.onerror = () => {
            console.warn("Retrying asset: " + key);
            const canvasFallback = document.createElement('canvas');
            canvasFallback.width = 100; canvasFallback.height = 100;
            images[key] = canvasFallback;
            checkComplete();
        };
        images[key] = img;
    }
}

function init() {
    const resize = () => {
        const container = document.getElementById('canvas-container');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    };

    window.addEventListener('resize', resize);
    resize();
    updateUI(); // Fix initial HP display

    // Display Best Scores
    document.getElementById('best-score').innerText = bestScore;
    document.getElementById('best-level').innerText = bestLevel;

    // Start Button Logic
    document.getElementById('start-btn').addEventListener('click', () => {
        gameState.isStarted = true;
        document.getElementById('start-screen').classList.add('hidden');
    });

    // Detect Mobile
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        gameState.isMobile = true;
    }

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? (e.touches[0] ? e.touches[0].clientX : 0) : e.clientX;
        const clientY = e.touches ? (e.touches[0] ? e.touches[0].clientY : 0) : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleMove = (e) => {
        const pos = getPos(e);
        gameState.mouse.x = pos.x;
        gameState.mouse.y = pos.y;
    };

    window.addEventListener('mousemove', handleMove);

    // Improved Touch Controls: Follow finger (Auto-firing bombs)
    canvas.addEventListener('touchstart', (e) => {
        const pos = getPos(e);
        gameState.mouse.x = pos.x;
        gameState.mouse.y = pos.y;
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        handleMove(e);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    // Pause functionality
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            togglePause();
        }
    });

    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        togglePause();
    });

    requestAnimationFrame(gameLoop);
}

preload();
