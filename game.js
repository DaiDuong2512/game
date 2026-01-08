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

const SOUNDS = {
    shoot: "Public/shoot.mp3",
    explosion: "Public/explosion.mp3",
    boom: "Public/boom.mp3",
    powerup: "Public/powerup.mp3"
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffers = {};

async function loadSound(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.warn(`Failed to load sound: ${name}`);
    }
}

function playSound(name, volume = 0.4) {
    if (!audioBuffers[name] || audioCtx.state === 'suspended') return;
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffers[name];
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume * gameState.sfxVolume;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
}

const images = {};
let loadedImages = 0;
const totalImages = Object.keys(ASSETS).length;

let bestScore = parseInt(localStorage.getItem('space_shooter_best_score')) || 0;
let bestLevel = parseInt(localStorage.getItem('space_shooter_best_level')) || 1;

const gameState = {
    isStarted: false,
    isLooping: false,
    isGameOver: false,
    isPaused: false,
    score: 0,
    level: 1,
    nextBossScore: 1500,
    isBossFight: false,
    mouse: { x: window.innerWidth / 2, y: window.innerHeight - 100 },
    joystick: { x: 0, y: 0, active: false },
    isMobile: false,
    shake: 0,
    bgY: 0,
    sfxVolume: 0.8,
    graphicsQuality: 'high',

    // BOOM System Upgraded (Modified for Task 9)
    boomCharges: 1,
    boomMaxCharges: 1, // Max 1, no stacking as per Task 9
    boomTimer: 0,
    boomChargeSpeed: 6500, // Increased downtime by 30% (5000 * 1.3 = 6500)
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

        const lerpFactor = 1 - Math.pow(1 - 0.1, dt / 16.6);
        this.x += (tx - this.x) * lerpFactor;
        this.y += (ty - this.y) * lerpFactor;

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
        if (gameState.graphicsQuality === 'high') {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0ea5e9';
        }
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

        const spread = 0.9; // Reduced spread for higher concentration
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
        playSound('shoot', 0.3);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Task 5: Shield visual (Reduced to cover only player)
        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 55, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
            ctx.fill();
        }

        ctx.rotate(this.tilt);
        if (gameState.graphicsQuality === 'high') {
            ctx.filter = 'brightness(1.3) contrast(1.1)';
            if (this.jammedTimer > 0) ctx.filter = 'grayscale(100%) brightness(1.5)';
            if (this.slowTimer > 0) ctx.filter = 'hue-rotate(280deg) saturate(2) brightness(1.3)';
        }
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

    update(dt) {
        const factor = dt / 16.6;
        this.x += this.vx * factor;
        this.y += this.vy * factor;
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
                if (gameState.graphicsQuality === 'high') ctx.filter = 'brightness(1.4)';
            } else {
                color = '#ef4444'; // Enemy Red
            }

            ctx.fillStyle = color;
            if (gameState.graphicsQuality === 'high') {
                ctx.shadowBlur = 15;
                ctx.shadowColor = color;
            }

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
        const timeFactor = dt / 16.6;

        // Stop dash if duration ends OR reaches the target 1/8 position
        if (this.entryTimer < this.dashDuration && this.y < this.dashTargetY) {
            // Dash to position
            const progress = this.entryTimer / this.dashDuration;
            this.y = this.startY + (this.dashTargetY - this.startY) * progress;
        } else {
            this.y += this.speed * timeFactor;
        }

        this.x += this.vx * timeFactor;
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
        if (gameState.graphicsQuality === 'high') {
            ctx.filter = 'brightness(1.4) saturate(1.2)';
            if (this.bulletCount > 1) ctx.filter += ' hue-rotate(90deg)';
        }
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
        const timeFactor = dt / 16.6;
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

        this.x += Math.cos(this.angle) * this.speed * timeFactor;
        this.y += Math.sin(this.angle) * this.speed * timeFactor;

        if (this.target) {
            if (Math.hypot(this.target.x - this.x, this.target.y - this.y) < 40) {
                this.hit(this.target);
            }
        }
    }

    hit(target) {
        const pLevel = player.level;
        const currentBulletDmg = pLevel <= 5 ? 25 : 25 + (pLevel - 5) * 15;
        const missileDmg = currentBulletDmg * 1.45; // 145% of current bullet damage

        if (target === entities.boss) {
            target.hp -= missileDmg * 5; // Boss multiplier for missiles remains higher but scales
            this.bounces = gameState.maxMissileBounces; // Force stop after boss hit
        } else {
            target.hp -= missileDmg;
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
        const timeFactor = dt / 16.6;
        if (this.y < this.targetY) this.y += 0.45 * timeFactor; // Slower descent (30% of 1.5)
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
        const bw = Math.min(canvas.width * 0.85, 400);
        const barY = 70;
        ctx.save();

        if (gameState.graphicsQuality === 'high') {
            if (this.isSuper) {
                ctx.filter = 'brightness(1.5) hue-rotate(290deg) saturate(1.5)';
                ctx.shadowBlur = 30;
                ctx.shadowColor = '#d946ef';
            } else {
                ctx.filter = 'brightness(1.3)';
            }
        }

        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.fillRect(canvas.width / 2 - bw / 2, barY, bw, 12);
        const hpWidth = (this.hp / this.maxHp) * bw;
        const grad = ctx.createLinearGradient(canvas.width / 2 - bw / 2, 0, canvas.width / 2 + bw / 2, 0);
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
    update(dt) { this.y += 2.2 * (dt / 16.6); }

    drawIcon(color) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(0.8, 0.8);
        ctx.fillStyle = '#fff';
        if (gameState.graphicsQuality === 'high') {
            ctx.shadowBlur = 5;
            ctx.shadowColor = 'rgba(255,255,255,0.5)';
        }

        switch (this.type) {
            case 'W': // Weapon - Triple Bullet icon
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.roundRect(i * 6 - 2, -8, 4, 16, 2);
                    ctx.fill();
                }
                break;
            case 'H': // Health - Heart
                ctx.beginPath();
                ctx.moveTo(0, 8);
                ctx.bezierCurveTo(-10, 0, -10, -12, 0, -6);
                ctx.bezierCurveTo(10, -12, 10, 0, 0, 8);
                ctx.fill();
                break;
            case 'A': // Ally - Star
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * 10,
                        Math.sin((18 + i * 72) / 180 * Math.PI) * 10);
                    ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * 5,
                        Math.sin((54 + i * 72) / 180 * Math.PI) * 5);
                }
                ctx.closePath();
                ctx.fill();
                break;
            case 'B': // Boost/Boom - Flame
                ctx.beginPath();
                ctx.moveTo(0, 10);
                ctx.quadraticCurveTo(-8, 5, -5, -2);
                ctx.quadraticCurveTo(-10, -5, 0, -12);
                ctx.quadraticCurveTo(10, -5, 5, -2);
                ctx.quadraticCurveTo(8, 5, 0, 10);
                ctx.fill();
                break;
            case 'U': // Upgrade - Lightning
                ctx.beginPath();
                ctx.moveTo(2, -10);
                ctx.lineTo(-6, 2);
                ctx.lineTo(0, 2);
                ctx.lineTo(-2, 10);
                ctx.lineTo(6, -2);
                ctx.lineTo(0, -2);
                ctx.closePath();
                ctx.fill();
                break;
            case 'S': // Shield
                ctx.beginPath();
                ctx.moveTo(0, -10);
                ctx.lineTo(8, -6);
                ctx.lineTo(8, 2);
                ctx.quadraticCurveTo(8, 8, 0, 11);
                ctx.quadraticCurveTo(-8, 8, -8, 2);
                ctx.lineTo(-8, -6);
                ctx.closePath();
                ctx.fill();
                break;
        }
        ctx.restore();
    }

    draw() {
        ctx.save();
        let color = '#22c55e';
        if (this.type === 'H') color = '#f43f5e';
        if (this.type === 'A') color = '#3b82f6';
        if (this.type === 'B') color = '#f97316';
        if (this.type === 'U') color = '#a855f7';
        if (this.type === 'S') color = '#06b6d4';

        // Outer Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.fillStyle = color;

        // Sphere with gradient
        const grad = ctx.createRadialGradient(this.x - 5, this.y - 5, 2, this.x, this.y, this.radius);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Overlay Icon
        this.drawIcon(color);

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

function createExplosion(x, y, shouldShake = false) {
    entities.explosions.push(new Explosion(x, y));
    if (shouldShake) gameState.shake = 12;
    playSound('explosion', 0.7);
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
        playSound('boom', 0.8);

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

    const timeFactor = dt / 16.6;
    gameState.bgY += 1.2 * timeFactor;
    // Prevent precision loss over long play sessions
    if (gameState.bgY > 1000000) gameState.bgY %= 100000;

    if (gameState.shake > 0) gameState.shake *= Math.pow(0.88, timeFactor);

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

    const bbInner = document.getElementById('boom-bar-inner');
    if (bbInner) {
        const percent = gameState.boomCharges >= 1 ? 100 : (gameState.boomTimer / gameState.boomChargeSpeed * 100);
        bbInner.style.width = percent + '%';
    }

    spawnTimer += dt;
    // Faster spawn rate after 150 points
    let spawnBase = 2500;
    if (gameState.score >= 150) {
        // Increase speed by 30% for small and 20% for medium (averaging ~25% or applying most aggressive)
        spawnBase = 1800;
    }

    if (spawnTimer > Math.max(500, spawnBase - gameState.score / 20)) {
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
    entities.bullets.forEach(e => e.update(dt));
    entities.enemyBullets.forEach(e => e.update(dt));
    entities.enemies.forEach(e => e.update(dt));
    entities.missiles.forEach(e => e.update(dt));
    entities.explosions.forEach(e => e.update(dt));
    entities.powerUps.forEach(e => e.update(dt));
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
                createExplosion(entities.boss.x, entities.boss.y, true); // Boss death = Shake
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
        // Task 5: Shield covers player/teammates nearby (Reduced radius for tighter protection)
        if (player.shield > 0 && Math.hypot(eb.x - player.x, eb.y - player.y) < 60) {
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
                createExplosion(player.x, player.y, true); // Player hit = Shake
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
            createExplosion(e.x, e.y, true); // Player collision = Shake
        }
    });

    entities.powerUps.forEach((p, pi) => {
        if (Math.hypot(p.x - player.x, p.y - player.y) < 38) {
            playSound('powerup', 0.6);
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

    // Cleanup (Now removing entities immediately when they leave the screen)
    entities.bullets = entities.bullets.filter(e => e.y > 0 && e.y < canvas.height && e.x > 0 && e.x < canvas.width);
    entities.enemyBullets = entities.enemyBullets.filter(e => e.y > 0 && e.y < canvas.height && e.x > 0 && e.x < canvas.width);
    entities.enemies = entities.enemies.filter(e => e.y < canvas.height && e.hp > 0);
    entities.missiles = entities.missiles.filter(e => e.bounces < gameState.maxMissileBounces && e.y > 0 && e.y < canvas.height && e.x > 0 && e.x < canvas.width);
    entities.explosions = entities.explosions.filter(e => e.life > 0);
    entities.powerUps = entities.powerUps.filter(e => e.y < canvas.height);
}

function draw() {
    ctx.fillStyle = '#020617'; // Fill with space color to prevent flicker gaps
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (gameState.shake > 1) {
        ctx.translate(Math.random() * gameState.shake - gameState.shake / 2, Math.random() * gameState.shake - gameState.shake / 2);
    }

    // Simplified Seamless Mirrored Scroll (2-Panel Strip)
    const img = images.background;
    if (img && img.complete) {
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const dW = img.width * scale;
        const dH = img.height * scale;
        const dX = (canvas.width - dW) / 2;

        const totalH = dH * 2;
        const sy = (gameState.bgY % totalH);

        // Panel 1: Normal Image
        ctx.drawImage(img, dX, sy, dW, dH);
        ctx.drawImage(img, dX, sy - totalH, dW, dH);

        // Panel 2: Mirrored Image (Offset by dH)
        ctx.save();
        ctx.translate(0, sy - dH);
        ctx.scale(1, -1);
        ctx.drawImage(img, dX, -dH, dW, dH); // Draw at -dH relative to translate
        ctx.drawImage(img, dX, -dH + totalH, dW, dH);
        ctx.restore();
    }

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
    if (dt > 100) dt = 16.6; // Cap to avoid jumps
    gameState.lastFrameTime = now;

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

    // Load Sounds
    for (const key in SOUNDS) {
        loadSound(key, SOUNDS[key]);
    }
}

let listenersInitialized = false;

function setupEventListeners() {
    if (listenersInitialized) return;
    listenersInitialized = true;

    // Resize Logic
    const resize = () => {
        const container = document.getElementById('canvas-container');
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }
    };
    window.addEventListener('resize', resize);
    resize();

    // Start Button Logic
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            gameState.isStarted = true;
            document.getElementById('start-screen').classList.add('hidden');
        });
    }

    // Settings Button Logic
    const settingsBtn = document.getElementById('settings-btn');
    const settingsScreen = document.getElementById('settings-screen');
    const closeSettings = document.getElementById('close-settings');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsScreen.classList.remove('hidden');
        });
    }

    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            settingsScreen.classList.add('hidden');
        });
    }

    // Settings Functionality
    const sfxRange = document.getElementById('sfx-range');
    if (sfxRange) {
        sfxRange.addEventListener('input', (e) => {
            gameState.sfxVolume = e.target.value / 100;
        });
    }

    const highBtn = document.getElementById('graphics-high');
    const lowBtn = document.getElementById('graphics-low');
    if (highBtn && lowBtn) {
        highBtn.addEventListener('click', () => {
            gameState.graphicsQuality = 'high';
            highBtn.classList.replace('bg-white/5', 'bg-amber-400');
            highBtn.classList.replace('text-white', 'text-slate-950');
            lowBtn.classList.replace('bg-amber-400', 'bg-white/5');
            lowBtn.classList.replace('text-slate-950', 'text-white');
        });
        lowBtn.addEventListener('click', () => {
            gameState.graphicsQuality = 'low';
            lowBtn.classList.replace('bg-white/5', 'bg-amber-400');
            lowBtn.classList.replace('text-white', 'text-slate-950');
            highBtn.classList.replace('bg-amber-400', 'bg-white/5');
            highBtn.classList.replace('text-slate-950', 'text-white');
        });
    }

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
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
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
        // Resume audio on first touch if needed
        if (audioCtx.state === 'suspended') audioCtx.resume();
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
}

function init() {
    setupEventListeners();
    updateUI(); // Fix initial HP display

    // Display Best Scores
    const bs = document.getElementById('best-score');
    const bl = document.getElementById('best-level');
    if (bs) bs.innerText = bestScore;
    if (bl) bl.innerText = bestLevel;

    if (!gameState.isLooping) {
        gameState.isLooping = true;
        requestAnimationFrame(gameLoop);
    }
}

preload();
