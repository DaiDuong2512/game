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
    ally: "Public/Đồng đội.png",
    background: "Public/eec663343d1d41c9fd5baf68d1e30147.0000000.jpg"
};

const SOUNDS = {};

// Audio System (Pixel-style Synth)
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const sfxVol = gameState.sfxVolume || 0.5;

    if (type === 'shoot') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(sfxVol * 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'explosion') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(20, now + 0.4);
        gain.gain.setValueAtTime(sfxVol * 0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    } else if (type === 'powerup') {
        [440, 554, 659].forEach((f, i) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(f, now + i * 0.05);
            g.gain.setValueAtTime(sfxVol * 0.2, now + i * 0.05);
            g.gain.exponentialRampToValueAtTime(0.01, now + (i + 1) * 0.05);
            o.connect(g);
            g.connect(audioCtx.destination);
            o.start(now + i * 0.05);
            o.stop(now + (i + 1) * 0.05);
        });
    } else if (type === 'levelUp') {
        [523, 659, 784, 1046].forEach((f, i) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(f, now + i * 0.1);
            g.gain.setValueAtTime(sfxVol * 0.25, now + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.01, now + (i + 1) * 0.1);
            o.connect(g);
            g.connect(audioCtx.destination);
            o.start(now + i * 0.1);
            o.stop(now + (i + 1) * 0.1);
        });
    } else if (type === 'debuff') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(sfxVol * 0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
    }
}

function scheduleBGM() { }
function playBGM() { }

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
    sfxVolume: parseFloat(localStorage.getItem('space_shooter_sfx_volume')) || 0.6,
    bgmVolume: 0.4,
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
    damageNumbers: [],
    boss: null
};

const TEXTURES = {};

function prerender() {
    console.log("Starting GPU optimization (prerendering textures)...");

    // --- Prerender Bullets (GPU Texture Batching) ---
    const bulletTypes = [
        { name: 'yellow', color: '#fbbf24', radius: 4 },
        { name: 'green', color: '#22c55e', radius: 4 },
        { name: 'blue', color: '#3b82f6', radius: 4 },
        { name: 'red', color: '#ef4444', radius: 4 },
        { name: 'debuff', color: '#a855f7', radius: 10 },
        { name: 'downgrade', color: '#ec4899', radius: 10 }
    ];

    bulletTypes.forEach(t => {
        const canv = document.createElement('canvas');
        const size = (t.radius + 2) * 2;
        canv.width = size;
        canv.height = size;
        const c = canv.getContext('2d');
        const center = size / 2;

        const grad = c.createRadialGradient(center, center, 1, center, center, t.radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, t.color);
        c.fillStyle = grad;
        c.beginPath();
        c.arc(center, center, t.radius, 0, Math.PI * 2);
        c.fill();
        TEXTURES['bullet_' + t.name] = canv;

        // Long version for allies
        const lCanv = document.createElement('canvas');
        lCanv.width = Math.floor(t.radius * 5);
        lCanv.height = Math.floor(t.radius * 2 + 2);
        const lc = lCanv.getContext('2d');
        lc.fillStyle = t.color;

        // Horizontal pill shape for rotation
        lc.beginPath();
        const r = (lCanv.height - 2) / 2;
        lc.roundRect(0, 1, lCanv.width, lCanv.height - 2, r);
        lc.fill();

        // Add a small core to long bullets
        lc.fillStyle = '#fff';
        lc.beginPath();
        lc.roundRect(lCanv.width * 0.2, lCanv.height * 0.3, lCanv.width * 0.6, lCanv.height * 0.4, r);
        lc.fill();

        TEXTURES['bullet_long_' + t.name] = lCanv;
    });

    // --- Prerender PowerUps (Avoid shadowBlur in loop) ---
    const types = ['W', 'H', 'A', 'B', 'U', 'S'];
    const colors = { W: '#22c55e', H: '#f43f5e', A: '#3b82f6', B: '#f97316', U: '#a855f7', S: '#06b6d4' };

    types.forEach(type => {
        const canv = document.createElement('canvas');
        canv.width = 80; // Extra room for glow
        canv.height = 80;
        const c = canv.getContext('2d');
        const color = colors[type];

        c.translate(40, 40);

        // Draw glow (Cheap GPU-friendly circle instead of shadowBlur)
        const glow = c.createRadialGradient(0, 0, 5, 0, 0, 30);
        glow.addColorStop(0, color);
        glow.addColorStop(1, 'transparent');
        c.fillStyle = glow;
        c.globalAlpha = 0.4;
        c.beginPath();
        c.arc(0, 0, 30, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1.0;

        c.fillStyle = color;
        c.strokeStyle = '#fff';
        c.lineWidth = 1;

        // Simplified path drawing
        switch (type) {
            case 'W': // Wrench
                c.beginPath(); c.arc(0, -6, 5, 0, Math.PI * 2); c.rect(-3, -6, 6, 14); c.fill();
                break;
            case 'H': // Heart
                c.beginPath(); c.moveTo(0, 5); c.bezierCurveTo(-10, -5, -10, -15, 0, -10); c.bezierCurveTo(10, -15, 10, -5, 0, 5); c.fill();
                break;
            case 'A': // Ally
                c.beginPath(); c.moveTo(0, -10); c.lineTo(-8, 8); c.lineTo(0, 3); c.lineTo(8, 8); c.fill();
                break;
            case 'B': // Boost/Boom (Flame)
                c.beginPath();
                c.moveTo(0, 12);
                c.bezierCurveTo(-10, 10, -10, -2, -2, -6);
                c.bezierCurveTo(-6, -12, 0, -15, 0, -15);
                c.bezierCurveTo(0, -15, 6, -12, 2, -6);
                c.bezierCurveTo(10, -2, 10, 10, 0, 12);
                c.fill();
                break;
            case 'U': // Upgrade (Arrow)
                c.beginPath();
                c.moveTo(0, -14); // Tip
                c.lineTo(-10, -2); // Left wing
                c.lineTo(-4, -2); // Left neck
                c.lineTo(-4, 12); // Bottom left
                c.lineTo(4, 12); // Bottom right
                c.lineTo(4, -2); // Right neck
                c.lineTo(10, -2); // Right wing
                c.closePath();
                c.fill();
                break;
            case 'S': // Shield icon
                c.beginPath(); c.moveTo(0, -10); c.lineTo(8, -6); c.lineTo(8, 2); c.quadraticCurveTo(8, 8, 0, 11); c.quadraticCurveTo(-8, 8, -8, 2); c.lineTo(-8, -6); c.fill();
                break;
        }
        TEXTURES['powerup_' + type] = canv;
    });

    // --- Prerender Shield ---
    const shieldCanv = document.createElement('canvas');
    shieldCanv.width = 120; shieldCanv.height = 120;
    const sc = shieldCanv.getContext('2d');
    sc.beginPath();
    sc.arc(60, 60, 55, 0, Math.PI * 2);
    sc.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    sc.lineWidth = 3;
    sc.stroke();
    sc.fillStyle = 'rgba(56, 189, 248, 0.1)';
    sc.fill();
    TEXTURES['player_shield'] = shieldCanv;

    // --- Prerender Missile (GPU Offload) ---
    const missileCanv = document.createElement('canvas');
    missileCanv.width = 60; missileCanv.height = 60;
    const mc = missileCanv.getContext('2d');
    mc.translate(30, 30);
    const fGrad = mc.createRadialGradient(0, 0, 5, 0, 0, 25);
    fGrad.addColorStop(0, '#f97316');
    fGrad.addColorStop(1, 'transparent');
    mc.fillStyle = fGrad;
    mc.beginPath(); mc.arc(0, 0, 25, 0, Math.PI * 2); mc.fill();
    mc.fillStyle = '#f59e0b';
    mc.beginPath(); mc.moveTo(0, -15); mc.lineTo(-8, 5); mc.lineTo(0, 15); mc.lineTo(8, 5); mc.closePath(); mc.fill();
    TEXTURES['missile_tex'] = missileCanv;
}

class DamageNumber {
    constructor(x, y, amount, isCrit = false) {
        this.x = x;
        this.y = y;
        this.amount = Math.ceil(amount);
        this.isCrit = isCrit;
        this.life = 500; // 0.5s
        this.maxLife = 500;
        this.vy = -1.5;
    }
    update(dt) {
        this.life -= dt;
        this.y += this.vy;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.isCrit ? '#facc15' : '#fff';
        ctx.font = this.isCrit ? 'bold 20px sans-serif' : '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.amount, this.x, this.y);
        ctx.restore();
    }
}

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
            const playerBulletDmg = (player.level <= 5 ? 40 : 40 + (player.level - 5) * 20) * (1 + gameState.bossCount * 0.4);

            // Task: Allies upgrade bullet count (rays) based on Player's weapon tier
            const allyBulletCount = gameState.weaponTier + 1; // Tier 0 (Yellow): 1 ray, 1 (Green): 2 rays, 2 (Blue): 3 rays
            const allySpread = 0.05;
            
            let baseAngle;
            if (entities.boss) {
                // Auto-target boss: Allies focus fire on the boss
                baseAngle = Math.atan2(entities.boss.y - this.y, entities.boss.x - this.x);
            } else {
                // Straighter angle when no boss is present (reduced from 0.1 to 0.05)
                baseAngle = -Math.PI / 2 + (this.index % 2 === 0 ? -0.05 : 0.05) * (colIndex + 1);
            }

            for (let i = 0; i < allyBulletCount; i++) {
                const offsetAngle = allyBulletCount > 1 ? (i - (allyBulletCount - 1) / 2) * allySpread : 0;
                const b = new Bullet(
                    this.x,
                    this.y,
                    baseAngle + offsetAngle,
                    playerBulletDmg * 0.5,
                    false,
                    false,
                    gameState.weaponTier
                );
                b.radius = 2.5;
                b.isLong = true;
                entities.bullets.push(b);
            }
            this.fireTimer = 0;
        }
    }

    findNearestEnemy() {
        let minDSq = Infinity;
        let potential = null;

        // Optimize: use for loops instead of [...]forEach
        for (let i = 0; i < entities.enemies.length; i++) {
            const e = entities.enemies[i];
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < minDSq) { minDSq = dSq; potential = e; }
        }

        if (entities.boss) {
            const e = entities.boss;
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < minDSq) { minDSq = dSq; potential = e; }
        }

        this.target = potential;
    }

    draw() {
        const floorX = Math.floor(this.x);
        const floorY = Math.floor(this.y);
        ctx.save();
        ctx.translate(floorX, floorY);

        // Ally appearance (straightened)
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
        this.hp = 1000;
        this.maxHp = 1000;
        this.shield = 0;
        this.tilt = 0;
        this.damageMultiplier = 1.0;
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
        playSound('debuff');
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
            // Upgrade Buff: Add ally if less than 2
            if (entities.allies.length < 2) {
                entities.allies.push(new Ally(player, entities.allies.length));
            }
        } else if (gameState.weaponTier === 1 && count > 5) {
            gameState.weaponTier = 2;
            this.level = 0;
            count = 1;
            // Upgrade Buff: Add ally if less than 2
            if (entities.allies.length < 2) {
                entities.allies.push(new Ally(player, entities.allies.length));
            }
        }
        count = Math.min(count, 5);

        const spread = 0.09; // Reduced spread for higher concentration
        const startAngle = -spread / 2;
        let bulletDamage = (this.level <= 5 ? 40 : 40 + (this.level - 5) * 20) * (1 + gameState.bossCount * 0.4);
        if (gameState.weaponTier === 1) bulletDamage *= 3.0;
        if (gameState.weaponTier === 2) bulletDamage *= 4.0;
        
        // Apply PowerUp multipliers
        bulletDamage *= this.damageMultiplier;

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
        playSound('shoot');
    }

    draw() {
        ctx.save();
        ctx.translate(Math.floor(this.x), Math.floor(this.y));

        // GPU Offloading: Use prerendered shield texture
        if (this.shield > 0 && TEXTURES.player_shield) {
            ctx.drawImage(TEXTURES.player_shield, -60, -60);
        }

        ctx.rotate(this.tilt);
        if (this.jammedTimer > 0) ctx.globalAlpha = 0.5;
        ctx.drawImage(images.player, -this.width / 2, -this.height / 2, this.width, this.height);
        ctx.globalAlpha = 1.0;

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
        // GPU Offloading: Use drawImage for textures
        let tex = null;
        if (this.isDebuff) tex = TEXTURES.bullet_debuff;
        else if (this.isDowngrade) tex = TEXTURES.bullet_downgrade;
        else if (this.isEnemy) tex = TEXTURES.bullet_red;
        else {
            const colors = ['yellow', 'green', 'blue'];
            const name = colors[this.tier] || 'yellow';
            tex = this.isLong ? TEXTURES['bullet_long_' + name] : TEXTURES['bullet_' + name];
        }

        if (!tex) return;

        if (this.isLong) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx));
            ctx.drawImage(tex, -tex.width / 2, -tex.height / 2);
            ctx.restore();
        } else {
            ctx.drawImage(tex, Math.floor(this.x - tex.width / 2), Math.floor(this.y - tex.height / 2));
        }
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
        const img = this.type === 'small' ? images.enemySmall : images.enemyMedium;
        // GPU: drawImage with integer coords
        ctx.drawImage(img, Math.floor(this.x - this.width / 2), Math.floor(this.y - this.height / 2), this.width, this.height);

        // Shield visual - only during active dash/protection
        if (this.entryTimer < 800 && this.y < canvas.height / 8) {
            ctx.beginPath();
            ctx.arc(Math.floor(this.x), Math.floor(this.y), this.width * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }
}

class Missile {
    constructor(x, y, initialTarget = null) {
        this.x = x;
        this.y = y;
        this.speed = 7.2; // 20% slower than player bullet (9 * 0.8 = 7.2)
        this.target = initialTarget;
        this.bounces = 0;
        this.hitTargets = new Set();
        this.width = 45;
        this.height = 45;
        this.angle = -Math.PI / 2;
        if (!this.target) this.findTarget();
    }

    findTarget() {
        if (entities.boss) { this.target = entities.boss; return; }
        let minDSq = Infinity;
        let potential = null;
        for (let i = 0; i < entities.enemies.length; i++) {
            const e = entities.enemies[i];
            if (!this.hitTargets.has(e)) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const dSq = dx * dx + dy * dy;
                if (dSq < minDSq) { minDSq = dSq; potential = e; }
            }
        }
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
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            if (dx * dx + dy * dy < 1600) { // 40^2 = 1600
                this.hit(this.target);
            }
        }
    }

    hit(target) {
        const pLevel = player.level;
        const currentBulletDmg = pLevel <= 5 ? 25 : 25 + (pLevel - 5) * 15;
        const missileDmg = currentBulletDmg * 1.45; // 145% of current bullet damage

        // Boom heal on hit as requested
        player.hp = Math.min(player.maxHp, player.hp + 50);

        let finalDamage = missileDmg;
        if (target === entities.boss) {
            finalDamage = missileDmg * 5;
            target.hp -= finalDamage;
            this.bounces = gameState.maxMissileBounces; // Force stop after boss hit
            if (target.hp <= 0) {
                player.hp = Math.min(player.maxHp, player.hp + 100);
            }
        } else {
            target.hp -= finalDamage;
            if (target.hp <= 0) {
                killEnemy(target);
            } else {
                // Explosion only if not killed (killEnemy handles explosion)
                createExplosion(this.x, this.y);
            }
        }

        // Show damage number for missile (treat as crit color)
        entities.damageNumbers.push(new DamageNumber(this.x, this.y - 20, finalDamage, true));

        this.hitTargets.add(target);
        this.bounces++;
        if (this.bounces < gameState.maxMissileBounces) {
            this.findTarget();
            if (!this.target) this.bounces = gameState.maxMissileBounces;
        }
        updateUI();
    }

    draw() {
        const tex = TEXTURES.missile_tex;
        if (!tex) return;
        ctx.save();
        ctx.translate(Math.floor(this.x), Math.floor(this.y));
        ctx.rotate(this.angle + Math.PI / 2);
        // GPU: Using prerendered missile texture
        ctx.drawImage(tex, -30, -30);
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
            for (let i = 0; i < this.thresholds.length; i++) {
                const t = this.thresholds[i];
                if (currentHpPercent <= t && !this.triggeredThresholds.has(t)) {
                    this.fireDowngradeWave();
                    this.triggeredThresholds.add(t);
                }
            }
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
        ctx.fillText(`${Math.ceil(this.hp)} / ${this.maxHp}`, Math.floor(canvas.width / 2), barY - 5);

        ctx.drawImage(images.boss, Math.floor(this.x - this.width / 2), Math.floor(this.y - this.height / 2), this.width, this.height);
        ctx.restore();
    }
}

class PowerUp {
    constructor(x, y, type = 'W') {
        this.x = x; this.y = y; this.radius = 20;
        this.type = type; // 'W', 'H', 'A', 'B', 'U', 'S' (Shield)
    }
    update(dt) { this.y += 2.2 * (dt / 16.6); }

    draw() {
        const tex = TEXTURES['powerup_' + this.type];
        
        // Draw a distinct circular boundary to distinguish from bullets
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, 25, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]); // Dashed line for a "collectible" feel
        ctx.stroke();
        
        // Outer glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'white';
        ctx.restore();

        if (tex) {
            // GPU: drawImage is much faster than path calculations + shadowBlur
            ctx.drawImage(tex, Math.floor(this.x - 40), Math.floor(this.y - 40));
        } else {
            // Minimal fallback
            ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(Math.floor(this.x), Math.floor(this.y), 10, 0, Math.PI * 2); ctx.fill();
        }
    }
}

class Explosion {
    constructor(x, y) {
        this.x = x; this.y = y; this.life = 600;
    }
    update(dt) { this.life -= dt; }
    draw() {
        ctx.globalAlpha = this.life / 600;
        // GPU: Integer coordinates for better performance
        ctx.drawImage(images.explosion, Math.floor(this.x - 60), Math.floor(this.y - 60), 120, 120);
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
    playSound('explosion');
}

function killEnemy(e) {
    if (e.hp > 0) return; // safety
    createExplosion(e.x, e.y);
    gameState.score += e.type === 'small' ? 50 : 120;

    // Healing - Increased heal for Boom or just general?
    // User mentioned "boom nổ mà không hồi hp" - let's make sure it heals.
    player.hp = Math.min(player.maxHp, player.hp + 15); // Slightly more heal on death

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
        // Boom Upgrade: More missiles based on bullet count (level)
        const bulletCount = Math.floor(player.level * 2 + 1);
        const extraMissiles = Math.floor(bulletCount / 2);
        const totalMissiles = 1 + extraMissiles;

        // Smart targeting: Try to assign unique targets to each missile
        const availableTargets = [...entities.enemies];
        if (entities.boss) availableTargets.push(entities.boss);

        for (let i = 0; i < totalMissiles; i++) {
            let target = null;
            if (availableTargets.length > 0) {
                const targetIdx = Math.floor(Math.random() * availableTargets.length);
                target = availableTargets.splice(targetIdx, 1)[0];
            }
            entities.missiles.push(new Missile(player.x, player.y, target));
        }

        gameState.boomCharges = 0;
        gameState.boomTimer = 0;
        playSound('explosion');

        // Task 9: Allies 50% chance to fire bomb
        for (let i = 0; i < entities.allies.length; i++) {
            if (Math.random() < 0.5) {
                entities.missiles.push(new Missile(entities.allies[i].x, entities.allies[i].y));
            }
        }
        updateUI();
    }
}

function updateUI() {
    document.getElementById('score-val').innerText = gameState.score;
    document.getElementById('level-val').innerText = gameState.level;
    const nextBossEl = document.getElementById('next-boss-val');
    if (nextBossEl) nextBossEl.innerText = gameState.nextBossScore;

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
        playSound('levelUp');
        updateUI();
    }

    const timeFactor = dt / 16.6;
    gameState.bgY += 1.2 * timeFactor;

    // Safety modulo to keep precision high on long play sessions
    if (gameState.bgY > 100000) gameState.bgY %= 50000;

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

    if (!gameState.isBossFight && spawnTimer > Math.max(500, spawnBase - gameState.score / 20)) {
        spawnEnemy();
        spawnTimer = 0;
    }

    if (!gameState.isBossFight && gameState.score >= gameState.nextBossScore) {
        gameState.isBossFight = true;

        // Buff Boss: 1 Shield + 2 Allies (if < 5)
        player.shield = Math.max(player.shield, 150 + player.maxHp * 0.1);
        const addAllies = 2;
        for (let i = 0; i < addAllies; i++) {
            if (entities.allies.length < 5) {
                entities.allies.push(new Ally(player, entities.allies.length));
            }
        }

        // Task: Spawn 3 + Level medium minions along with boss
        const minionCount = 3 + gameState.level;
        for (let i = 0; i < minionCount; i++) {
            const x = 50 + Math.random() * (canvas.width - 100);
            entities.enemies.push(new Enemy(x, -50 - (Math.random() * 150), 'medium'));
        }

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

    // Entities Updates (Using for loops for speed)
    for (let i = 0; i < entities.bullets.length; i++) entities.bullets[i].update(dt);
    for (let i = 0; i < entities.enemyBullets.length; i++) entities.enemyBullets[i].update(dt);
    for (let i = 0; i < entities.enemies.length; i++) entities.enemies[i].update(dt);
    for (let i = 0; i < entities.missiles.length; i++) entities.missiles[i].update(dt);
    for (let i = 0; i < entities.explosions.length; i++) entities.explosions[i].update(dt);
    for (let i = 0; i < entities.powerUps.length; i++) entities.powerUps[i].update(dt);
    for (let i = 0; i < entities.allies.length; i++) entities.allies[i].update(dt);
    if (entities.boss) entities.boss.update(dt);
    for (let i = entities.damageNumbers.length - 1; i >= 0; i--) {
        const dn = entities.damageNumbers[i];
        dn.update(dt);
        if (dn.life <= 0) entities.damageNumbers.splice(i, 1);
    }

    // Collisions (Accumulated Damage & Crit Logic)
    const frameHits = new Map();

    for (let bi = entities.bullets.length - 1; bi >= 0; bi--) {
        const b = entities.bullets[bi];
        let hitEntity = null;

        for (let ei = entities.enemies.length - 1; ei >= 0; ei--) {
            const e = entities.enemies[ei];
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            const r = e.width / 2.3;
            if (dx * dx + dy * dy < r * r) {
                hitEntity = e;
                break;
            }
        }

        if (!hitEntity && entities.boss) {
            const dx = b.x - entities.boss.x;
            const dy = b.y - entities.boss.y;
            const r = entities.boss.width / 3.5;
            if (dx * dx + dy * dy < r * r) {
                hitEntity = entities.boss;
            }
        }

        if (hitEntity) {
            let data = frameHits.get(hitEntity);
            if (!data) {
                data = { dmg: 0, count: 0, x: hitEntity.x, y: hitEntity.y };
                frameHits.set(hitEntity, data);
            }
            data.dmg += b.damage;
            data.count++;
            entities.bullets.splice(bi, 1);
        }
    }

    // Process Accumulated Damage
    for (const [entity, data] of frameHits) {
        let finalDmg = data.dmg;
        let isCrit = data.count > 1;
        if (isCrit) finalDmg *= 1.45;

        if (entity.takeDamage) entity.takeDamage(finalDmg);
        else entity.hp -= finalDmg;

        entities.damageNumbers.push(new DamageNumber(data.x, data.y - 20, finalDmg, isCrit));

        if (entity.hp <= 0) {
            if (entity === entities.boss) {
                createExplosion(entities.boss.x, entities.boss.y, true);
                gameState.score += 6000; // Increase score significantly to trigger an immediate level up
                gameState.bossCount++;
                gameState.nextBossScore = gameState.score + 3000 + (gameState.bossCount * 1000);
                
                // Drop system: Minimum 1 buff, potentially more if lucky
                const numDrops = Math.floor(Math.random() * 3) + 1; // 1 to 3 drops
                const dropTypes = ['U', 'W', 'H', 'A', 'B', 'S'];
                for (let i = 0; i < numDrops; i++) {
                    const type = i === 0 ? 'U' : dropTypes[Math.floor(Math.random() * dropTypes.length)];
                    entities.powerUps.push(new PowerUp(entities.boss.x + (i - (numDrops-1)/2) * 40, entities.boss.y, type));
                }
                
                gameState.isBossFight = false;
                entities.boss = null;
                updateUI();
            } else {
                killEnemy(entity);
                updateUI();
            }
        }
    }

    for (let ebi = entities.enemyBullets.length - 1; ebi >= 0; ebi--) {
        const eb = entities.enemyBullets[ebi];
        const dx = eb.x - player.x;
        const dy = eb.y - player.y;
        const distSq = dx * dx + dy * dy;

        // Task 5: Shield covers player/teammates nearby (60^2 = 3600)
        if (player.shield > 0 && distSq < 3600) {
            player.takeDamage(80);
            entities.enemyBullets.splice(ebi, 1);
            continue;
        }

        if (distSq < 484) { // 22^2 = 484
            if (eb.isDebuff) {
                player.slowTimer = 3500;
                player.jammedTimer = 2500;
                entities.enemyBullets.splice(ebi, 1);
            } else if (eb.isDowngrade) {
                let currentCount = player.level * 2 + 1;
                if (currentCount > 3) {
                    player.level -= 1.5;
                    player.damageMultiplier = Math.max(1.0, player.damageMultiplier * 0.7); // Reduce damage when level is lost
                    if (player.level < 0) player.level = 0;
                } else if (gameState.weaponTier > 0) {
                    gameState.weaponTier--;
                    player.damageMultiplier = Math.max(1.0, player.damageMultiplier * 0.7); // Also reduce on tier loss
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
    }

    for (let ei = entities.enemies.length - 1; ei >= 0; ei--) {
        const e = entities.enemies[ei];
        const dx = e.x - player.x;
        const dy = e.y - player.y;

        // Collision with player (35^2 = 1225)
        if (dx * dx + dy * dy < 1225) {
            const dmg = e.type === 'small' ? 70 : 150;
            player.takeDamage(dmg);
            e.hp = 0;
            createExplosion(e.x, e.y, true); // Player collision = Shake
        }

        // Task: Penalty if enemy passes the player (reaches bottom)
        if (e.y >= canvas.height && e.hp > 0) {
            const dmg = e.type === 'small' ? 70 : 150;
            player.takeDamage(dmg);
            gameState.score = Math.max(0, gameState.score - 50); // -50 points penalty
            e.hp = 0; // Mark as "processed" so it doesn't trigger again
            updateUI();
        }
    }

    for (let pi = entities.powerUps.length - 1; pi >= 0; pi--) {
        const p = entities.powerUps[pi];
        const dx = p.x - player.x;
        const dy = p.y - player.y;

        if (dx * dx + dy * dy < 1444) { // 38^2 = 1444
            playSound('powerup');
            if (p.type === 'W') {
                player.level += 0.5;
                player.damageMultiplier *= 1.3; // Upgrade damage by 30% for each bullet upgrade buff
            } else if (p.type === 'H') {
                const healAmt = 200;
                player.hp = Math.min(player.maxHp, player.hp + healAmt);
                for (let ai = 0; ai < entities.allies.length; ai++) {
                    entities.allies[ai].hp = Math.min(entities.allies[ai].maxHp, entities.allies[ai].hp + healAmt * 0.3);
                }
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
                } else if (player.level < 2) {
                    player.level = 2; // Jump to max rays for current tier
                } else {
                    // Already at max weapon tier and max rays: increase damage instead
                    player.damageMultiplier += 0.8; // Strong damage increase when maxed
                }
            } else if (p.type === 'S') {
                player.shield = 250 + player.maxHp * 0.1;
            }
            entities.powerUps.splice(pi, 1); updateUI();
        }
    }

    // Cleanup (Optimized in-place removal to avoid GC)
    for (let i = entities.bullets.length - 1; i >= 0; i--) {
        const e = entities.bullets[i];
        if (e.y <= -50 || e.y >= canvas.height + 50 || e.x <= -50 || e.x >= canvas.width + 50) {
            entities.bullets.splice(i, 1);
        }
    }
    for (let i = entities.enemyBullets.length - 1; i >= 0; i--) {
        const e = entities.enemyBullets[i];
        if (e.y <= -50 || e.y >= canvas.height + 50 || e.x <= -50 || e.x >= canvas.width + 50) {
            entities.enemyBullets.splice(i, 1);
        }
    }
    for (let i = entities.enemies.length - 1; i >= 0; i--) {
        const e = entities.enemies[i];
        if (e.y >= canvas.height || e.hp <= 0) {
            entities.enemies.splice(i, 1);
        }
    }
    for (let i = entities.missiles.length - 1; i >= 0; i--) {
        const e = entities.missiles[i];
        if (e.bounces >= gameState.maxMissileBounces || e.y <= -50 || e.y >= canvas.height + 50) {
            entities.missiles.splice(i, 1);
        }
    }
    for (let i = entities.explosions.length - 1; i >= 0; i--) {
        if (entities.explosions[i].life <= 0) {
            entities.explosions.splice(i, 1);
        }
    }
    for (let i = entities.powerUps.length - 1; i >= 0; i--) {
        if (entities.powerUps[i].y >= canvas.height) {
            entities.powerUps.splice(i, 1);
        }
    }
}

function draw() {
    // 1. Clear with solid black (best for perf)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // 2. Shake effect
    if (gameState.shake > 1) {
        ctx.translate(Math.floor(Math.random() * gameState.shake - gameState.shake / 2), Math.floor(Math.random() * gameState.shake - gameState.shake / 2));
    }

    // 3. Simple, Efficient Background Scroll
    const img = images.background;
    if (img && img.complete) {
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const dW = Math.ceil(img.width * scale);
        const dH = Math.ceil(img.height * scale);
        const dX = Math.floor((canvas.width - dW) / 2);

        let y = (gameState.bgY % dH + dH) % dH;
        ctx.imageSmoothingEnabled = false;

        const iy = Math.floor(y);
        const idx = Math.floor(dX);
        const idw = Math.floor(dW);
        const idh = Math.floor(dH);

        ctx.drawImage(img, idx, iy, idw, idh);
        ctx.drawImage(img, idx, iy - idh, idw, idh);
    }

    // 4. Draw entities (Using for loops for speed)
    for (let i = 0; i < entities.powerUps.length; i++) entities.powerUps[i].draw();
    for (let i = 0; i < entities.bullets.length; i++) entities.bullets[i].draw();
    for (let i = 0; i < entities.enemyBullets.length; i++) entities.enemyBullets[i].draw();
    for (let i = 0; i < entities.enemies.length; i++) entities.enemies[i].draw();
    if (entities.boss) entities.boss.draw();
    for (let i = 0; i < entities.missiles.length; i++) entities.missiles[i].draw();
    for (let i = 0; i < entities.explosions.length; i++) entities.explosions[i].draw();
    for (let i = 0; i < entities.allies.length; i++) entities.allies[i].draw();
    for (let i = 0; i < entities.damageNumbers.length; i++) entities.damageNumbers[i].draw();
    player.draw();

    ctx.restore();
}

function gameLoop(now) {
    if (!gameState.lastFrameTime) {
        gameState.lastFrameTime = now;
        requestAnimationFrame(gameLoop);
        return;
    }

    let dt = now - gameState.lastFrameTime;
    if (dt > 100) dt = 16.6;
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
            initAudio();
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
    const bgmRange = document.getElementById('bgm-range');
    if (bgmRange) {
        bgmRange.addEventListener('input', (e) => {
            gameState.bgmVolume = e.target.value / 100;
        });
    }

    const sfxRange = document.getElementById('sfx-range');
    if (sfxRange) {
        sfxRange.value = gameState.sfxVolume * 100;
        sfxRange.addEventListener('input', (e) => {
            gameState.sfxVolume = e.target.value / 100;
            localStorage.setItem('space_shooter_sfx_volume', gameState.sfxVolume);
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
}

function init() {
    setupEventListeners();
    prerender(); // CPU-to-GPU Offloading: Generate textures once
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
