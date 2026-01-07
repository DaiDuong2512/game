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
    background: "https://i.pinimg.com/videos/thumbnails/originals/ee/c6/63/eec663343d1d41c9fd5baf68d1e30147.0000000.jpg"
};

const images = {};
let loadedImages = 0;
const totalImages = Object.keys(ASSETS).length;

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
    
    // BOOM System Upgraded
    boomCharges: 2,
    boomMaxCharges: 6,
    boomTimer: 0,
    boomChargeSpeed: 10000, // 10s
    boomGainAmount: 2,      // +2 per cycle
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
    constructor(parent, angleOffset) {
        this.parent = parent;
        this.angleOffset = angleOffset;
        this.currentAngle = angleOffset;
        this.dist = 50; // Much closer to player
        this.x = parent.x;
        this.y = parent.y;
        this.fireTimer = 0;
        this.rotation = -Math.PI / 2;
    }
    update(dt) {
        let prevX = this.x;
        let prevY = this.y;

        // Orbit rotation around player
        this.currentAngle += dt * 0.002;
        const tx = this.parent.x + Math.cos(this.currentAngle) * this.dist;
        const ty = this.parent.y + Math.sin(this.currentAngle) * this.dist;
        
        this.x += (tx - this.x) * 0.15;
        this.y += (ty - this.y) * 0.15;

        // Calculate smooth rotation based on movement direction
        const vx = this.x - prevX;
        const vy = this.y - prevY;
        if (Math.hypot(vx, vy) > 0.5) {
            let targetRot = Math.atan2(vy, vx) + Math.PI/2;
            let diff = targetRot - this.rotation;
            while(diff < -Math.PI) diff += Math.PI * 2;
            while(diff > Math.PI) diff -= Math.PI * 2;
            this.rotation += diff * 0.1;
        }

        this.fireTimer += dt;
        if (this.fireTimer > 300) {
            // Allied fire: 2 small bullets
            // Damage equals 50% of player's current bullet damage
            const playerBulletDmg = player.level <= 5 ? 25 : 25 + (player.level - 5) * 15;
            const allyDmg = playerBulletDmg * 0.5;

            for(let i = 0; i < 2; i++) {
                const angleOffset = (i === 0 ? -0.05 : 0.05);
                const b = new Bullet(this.x, this.y, -Math.PI / 2 + angleOffset, allyDmg);
                b.radius = 2; // Bé lại
                entities.bullets.push(b);
            }
            this.fireTimer = 0;
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Use custom asset for ally - Reduced size (30% of previous 55 = 16.5)
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0ea5e9';
        ctx.drawImage(images.ally, -10, -10, 20, 20);
        
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
        this.level = 1;
        this.slowTimer = 0;
        this.jammedTimer = 0;
        this.hp = 600;
        this.maxHp = 600;
        this.tilt = 0;
    }

    takeDamage(amt) {
        // Ally Shield Mechanic: Sacrifice an ally to block a hit
        if (entities.allies.length > 0) {
            const sacrificed = entities.allies.pop();
            createExplosion(sacrificed.x, sacrificed.y);
            gameState.shake = 20;
            return; // Block the entire instance of damage
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
        
        // Save old position to calculate velocity for tilting
        let oldX = this.x;

        // Follow Mouse/Touch directly
        this.x += (gameState.mouse.x - this.x) * curLerp;
        this.y += (gameState.mouse.y - this.y) * curLerp;

        // Banking/Tilting effect
        const vx = this.x - oldX;
        this.tilt = (vx * 0.08); // Tilt based on horizontal velocity
        this.tilt = Math.max(-0.4, Math.min(0.4, this.tilt)); // Cap tilt

        // Keep player in bounds
        this.x = Math.max(this.width/2, Math.min(canvas.width - this.width/2, this.x));
        this.y = Math.max(this.height/2, Math.min(canvas.height - this.height/2, this.y));

        // Auto-fire logic
        if (this.jammedTimer <= 0) {
            this.fireTimer += dt;
            
            // Scaled fire rate: Base + 0.1 speed per level
            let levelBonus = (gameState.level - 1) * 0.1;
            let currentFireRate = 160 / (1 + levelBonus);
            
            // High bullet count bonus (>10 bullets = +0.5 fire speed)
            const count = Math.min(this.level * 2 + 1, 15);
            if (count > 10) {
                currentFireRate /= 1.5; 
            }

            if (this.fireTimer >= currentFireRate) {
                this.shoot();
                this.fireTimer = 0;
            }
        }
    }

    shoot() {
        // Calculate Bullet Count based on level and tier
        let count = this.level * 2 + 1;
        
        // Weapon Tier Evolution Thresholds
        if (gameState.weaponTier === 0 && count > 10) {
            gameState.weaponTier = 1;
            this.level = 2; // Resets to 5 bullets (2*2+1)
            count = 5;
        } else if (gameState.weaponTier === 1 && count > 10) {
            gameState.weaponTier = 2;
            this.level = 2; // Resets to 5 bullets
            count = 5;
        }

        // Cap Blue Tier (Tier 2) to 10 bullets
        if (gameState.weaponTier === 2) {
            count = Math.min(count, 10);
        }

        const spread = 0.5;
        const startAngle = -spread / 2;
        
        // Base Damage calculation
        let bulletDamage = this.level <= 5 ? 25 : 25 + (this.level - 5) * 15;
        
        // Tier Multipliers
        if (gameState.weaponTier === 1) bulletDamage *= 3.0; // +200% = 3x
        if (gameState.weaponTier === 2) bulletDamage *= 4.0; // +300% = 4x

        // Opacity and brightness for high tiers/counts handled in draw()
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
        ctx.rotate(this.tilt); // Apply tilting effect
        
        ctx.filter = 'brightness(1.3) contrast(1.1)'; // Highlight player
        if (this.jammedTimer > 0) ctx.filter = 'grayscale(100%) brightness(1.5)';
        if (this.slowTimer > 0) ctx.filter = 'hue-rotate(280deg) saturate(2) brightness(1.3)';
        
        ctx.drawImage(images.player, -this.width / 2, -this.height / 2, this.width, this.height);
        
        // Thruster effect (simple)
        if (!gameState.isGameOver) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.beginPath();
            ctx.arc(0, this.height/2 + Math.random()*10, 6, 0, Math.PI*2);
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
                
                // Opacity 40% and Brighter by 40% for player bullets
                ctx.globalAlpha = 0.4;
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
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

class Enemy {
    constructor(type) {
        this.type = type;
        this.width = type === 'small' ? 35 : 55;
        this.height = type === 'small' ? 35 : 55;
        this.x = Math.random() * (canvas.width - this.width) + this.width / 2;
        this.y = -60;
        
        // Calculate Player Power Factor (HP Scaling)
        let baseDmg = 25;
        let pLevel = player.level;
        let currentDmg = pLevel <= 5 ? 25 : 25 + (pLevel - 5) * 15;
        if (gameState.weaponTier === 1) currentDmg *= 3;
        if (gameState.weaponTier === 2) currentDmg *= 4;
        
        let dmgRatio = currentDmg / baseDmg;
        // Enemy HP increases by 80% of dmg ratio + 15% for weapon bullet upgrades
        let hpMultiplier = 1 + (dmgRatio - 1) * 0.8;
        if (player.level > 1) hpMultiplier += 0.15;

        // Scale HP based on difficulty and power factor
        const baseHp = type === 'small' ? 100 : 400;
        this.hp = baseHp * gameState.difficulty * hpMultiplier;
        
        // Slower movement + 0.1 per level
        let levelSpeedBonus = (gameState.level - 1) * 0.1;
        this.speed = (type === 'small' ? 0.75 : 0.55) + levelSpeedBonus;
        this.vx = type === 'medium' ? (Math.random() > 0.5 ? 0.45 : -0.45) : 0;
        this.fireTimer = Math.random() * 1500;

        // Multi-bullet enemy variety (when player is strong)
        this.bulletCount = 1;
        const playerBullets = player.level * 2 + 1;
        if (playerBullets > 10 || gameState.weaponTier > 0) {
            const roll = Math.random();
            if (roll < 0.15) this.bulletCount = 7;
            else if (roll < 0.35) this.bulletCount = 5;
            else if (roll < 0.55) this.bulletCount = 3;
        }
    }

    update(dt) {
        this.y += this.speed;
        this.x += this.vx;
        if (this.type === 'medium') {
            if (this.x < 100 || this.x > canvas.width - 100) this.vx *= -1;
        }

        this.fireTimer += dt;
        // Fire rate increases with level (+0.1 speed per level)
        let levelFireBonus = (gameState.level - 1) * 0.1;
        const baseFireRate = 2500 / (1 + (gameState.difficulty - 1) * 0.3);
        let fireRate = Math.max(600, baseFireRate / (1 + levelFireBonus));
        
        // Multi-bullet enemies shoot 80% slower than normal
        if (this.bulletCount > 1) {
            fireRate *= 1.8; 
        }

        if (this.fireTimer > fireRate) {
            if (this.bulletCount > 1) {
                const spread = 0.6;
                const startAngle = Math.PI/2 - spread/2;
                for(let i=0; i<this.bulletCount; i++) {
                    const step = i / (this.bulletCount - 1);
                    entities.enemyBullets.push(new Bullet(this.x, this.y + this.height/2, startAngle + step * spread, 80, true));
                }
            } else if (this.type === 'medium') {
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height/2, Math.PI/2, 80, true));
            } else {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height/2, angle, 80, true));
            }
            this.fireTimer = 0;
        }
    }

    draw() {
        ctx.save();
        ctx.filter = 'brightness(1.4) saturate(1.2)'; // Highlight enemies
        if (this.bulletCount > 1) ctx.filter += ' hue-rotate(90deg)'; // Tint multi-shot enemies
        const img = this.type === 'small' ? images.enemySmall : images.enemyMedium;
        ctx.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        ctx.restore();
    }
}

class Missile {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.speed = 12;
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
        ctx.rotate(this.angle + Math.PI/2);
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f97316';
        ctx.drawImage(images.missile, -this.width/2, -this.height/2, this.width, this.height);
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
        this.maxHp = this.isSuper ? baseHp * 4.5 : baseHp; // 4.5x HP for Super Boss (was 3.5x)
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
            this.x = canvas.width/2 + Math.sin(this.moveTimer/3500) * (canvas.width/3);
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
                entities.enemyBullets.push(new Bullet(this.x + i*25, this.y + 60, Math.PI/2 + i*0.2, 1, true));
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
        // Boss Health Bar UI handled in gameLoop/update via DOM if we want, but let's keep it here for canvas
        const bw = 400;
        ctx.save();
        
        if (this.isSuper) {
            ctx.filter = 'brightness(1.5) hue-rotate(290deg) saturate(1.5)'; // Darker purple/pink for Super Boss
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#d946ef';
        } else {
            ctx.filter = 'brightness(1.3)'; // Highlight Boss
        }

        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.fillRect(canvas.width/2 - bw/2, 40, bw, 12);
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
        ctx.fillRect(canvas.width/2 - bw/2, 40, hpWidth, 12);

        // HP Text for Boss
        ctx.fillStyle = "white";
        ctx.font = "bold 10px Inter";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.ceil(this.hp)} / ${this.maxHp}`, canvas.width/2, 35);

        ctx.drawImage(images.boss, this.x - this.width/2, this.y - this.height/2, this.width, this.height);
        ctx.restore();
    }
}

class PowerUp {
    constructor(x, y, type = 'W') {
        this.x = x; this.y = y; this.radius = 20;
        this.type = type; // 'W', 'H', 'A', 'B', 'U' (Upgrade)
    }
    update() { this.y += 2.2; }
    draw() {
        let color = '#22c55e';
        let label = 'W';
        if (this.type === 'H') { color = '#f43f5e'; label = '❤'; }
        if (this.type === 'A') { color = '#3b82f6'; label = '★'; }
        if (this.type === 'B') { color = '#f97316'; label = '🔥'; }
        if (this.type === 'U') { color = '#a855f7'; label = '⚡'; }

        ctx.save();
        ctx.shadowBlur = 15;
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

function fireMissile() {
    if (!gameState.isStarted || gameState.isPaused || gameState.isGameOver) return;
    if (gameState.boomCharges > 0) {
        gameState.isFiringBooms = true;
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

    // Update Boom Icons
    const container = document.getElementById('boom-slots');
    container.innerHTML = '';
    // Show count if too many icons
    if (gameState.boomCharges > 8) {
        const div = document.createElement('div');
        div.className = 'bg-orange-600/40 px-3 py-1 rounded-full border border-orange-500/50 flex items-center gap-2 fire-icon-glow text-xs font-bold';
        div.innerHTML = `<img src="${ASSETS.missile}" class="w-4 h-4 object-contain rotate-[-45deg]"> x${gameState.boomCharges}`;
        container.appendChild(div);
    } else {
        for (let i = 0; i < gameState.boomCharges; i++) {
            const div = document.createElement('div');
            div.className = 'w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center fire-icon-glow';
            div.innerHTML = `<img src="${ASSETS.missile}" class="w-5 h-5 object-contain rotate-[-45deg]">`;
            container.appendChild(div);
        }
    }
}

function spawnEnemy() {
    if (gameState.isBossFight) return;
    const type = Math.random() > 0.35 ? 'small' : 'medium';
    entities.enemies.push(new Enemy(type));
}

function gameOver() {
    if (gameState.isGameOver) return;
    gameState.isGameOver = true;

    // Save High Score
    const bestScore = localStorage.getItem('space_shooter_best_score') || 0;
    const bestLevel = localStorage.getItem('space_shooter_best_level') || 1;
    if (gameState.score > bestScore) localStorage.setItem('space_shooter_best_score', gameState.score);
    if (gameState.level > bestLevel) localStorage.setItem('space_shooter_best_level', gameState.level);

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

    // Rapid Boom Discharge Logic (Nerfed GCD)
    if (gameState.isFiringBooms) {
        if (gameState.boomCharges > 0) {
            if (gameState.boomGCD <= 0) {
                entities.missiles.push(new Missile(player.x, player.y));
                gameState.boomCharges--;
                gameState.boomGCD = 1200; // Nerfed: 1.2s per boom discharge (was 1s)
                updateUI();
            }
        } else {
            gameState.isFiringBooms = false;
        }
    }

    if (gameState.boomGCD > 0) gameState.boomGCD -= dt;
    
    // Boom Recharge Logic (+Amount every cycle)
    gameState.boomTimer += dt;
    if (gameState.boomTimer >= gameState.boomChargeSpeed) {
        gameState.boomCharges = Math.min(gameState.boomMaxCharges, gameState.boomCharges + gameState.boomGainAmount);
        gameState.boomTimer = 0;
        updateUI();
    }
    document.getElementById('boom-bar-inner').style.width = (gameState.boomTimer / gameState.boomChargeSpeed * 100) + '%';

    spawnTimer += dt;
    if (spawnTimer > Math.max(400, 1600 - gameState.score/15)) {
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

    // Collisions
    entities.bullets.forEach((b, bi) => {
        entities.enemies.forEach(e => {
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.width/2) {
                e.hp -= b.damage; entities.bullets.splice(bi, 1);
                if (e.hp <= 0) {
                    createExplosion(e.x, e.y);
                    gameState.score += e.type === 'small' ? 50 : 120;
                    
                    // Kill Reward: Regenerate small amount of HP
                    player.hp = Math.min(player.maxHp, player.hp + 10);

                    // Random PowerUp Spawning (Ally Spawn Rate Increased, Heal Decreased)
                    const rand = Math.random();
                    if (rand < 0.25) {
                        let type = 'W';
                        if (rand < 0.08) type = 'A';      // Ally (8% chance)
                        else if (rand < 0.14) type = 'B'; // BOOM Upgrade (6% chance)
                        else if (rand < 0.17) type = 'H'; // Heal (3% chance)
                        
                        // Small chance for Weapon Upgrade (Tier) from medium enemies
                        if (e.type === 'medium' && Math.random() < 0.004) type = 'U';
                        
                        entities.powerUps.push(new PowerUp(e.x, e.y, type));
                    }
                    updateUI();
                }
            }
        });
        if (entities.boss && Math.hypot(b.x - entities.boss.x, b.y - entities.boss.y) < entities.boss.width/3) {
            entities.boss.hp -= b.damage; entities.bullets.splice(bi, 1);
            if (entities.boss.hp <= 0) {
                createExplosion(entities.boss.x, entities.boss.y);
                gameState.score += 2000;
                gameState.bossCount++;
                gameState.nextBossScore = gameState.score + 3000 + (gameState.bossCount * 1000);
                
                // 4% Chance for Weapon Tier Upgrade item from Boss
                if (Math.random() < 0.04) {
                    entities.powerUps.push(new PowerUp(entities.boss.x, entities.boss.y, 'U'));
                }

                gameState.isBossFight = false;
                entities.boss = null;
                updateUI();
            }
        }
    });

    entities.enemyBullets.forEach((eb, ebi) => {
        if (Math.hypot(eb.x - player.x, eb.y - player.y) < 28) {
            if (eb.isDebuff) {
                player.slowTimer = 3500;
                player.jammedTimer = 2500;
                entities.enemyBullets.splice(ebi, 1);
            } else if (eb.isDowngrade) {
                // Downgrade: Lose 3 bullets, drop tier if bullets <= 3
                let currentCount = player.level * 2 + 1;
                if (currentCount > 3) {
                    player.level -= 1.5; // -1.5 level = -3 bullets (count = level*2 + 1)
                    if (player.level < 1) player.level = 1;
                } else if (gameState.weaponTier > 0) {
                    gameState.weaponTier--;
                    player.level = 4; // Reset to 9 bullets (4 * 2 + 1 = 9)
                }
                
                entities.enemyBullets.splice(ebi, 1);
                createExplosion(player.x, player.y); // Visual feedback
                updateUI();
            } else {
                entities.enemyBullets.splice(ebi, 1);
                player.takeDamage(80); // Standard bullet = 80 HP (Reduced from 100)
            }
        }
    });

    entities.enemies.forEach(e => {
        if (Math.hypot(e.x - player.x, e.y - player.y) < 45) {
            // Collision with enemy body
            const dmg = e.type === 'small' ? 70 : 150; // Reduced from 100/200
            player.takeDamage(dmg);
            e.hp = 0; // Destroy enemy on collision
            createExplosion(e.x, e.y);
        }
    });
    
    entities.powerUps.forEach((p, pi) => {
        if (Math.hypot(p.x-player.x, p.y-player.y) < 45) {
            if (p.type === 'W') {
                player.level++; gameState.level = player.level;
            } else if (p.type === 'H') {
                player.hp = Math.min(player.maxHp, player.hp + 200);
            } else if (p.type === 'A') {
                const angle = entities.allies.length % 2 === 0 ? 0 : Math.PI;
                entities.allies.push(new Ally(player, angle));
            } else if (p.type === 'B') {
                // BOOM Buffs
                gameState.boomMaxCharges += 3;
                gameState.boomGainAmount += 1; 
                gameState.boomChargeSpeed = Math.max(3000, gameState.boomChargeSpeed - 800);
                gameState.maxMissileBounces++; // Add bounce on powerup
            } else if (p.type === 'U') {
                // Instant Weapon Tier Upgrade
                if (gameState.weaponTier < 2) {
                    gameState.weaponTier++;
                    player.level = 2; // Start with 5 bullets at new tier
                }
            }
            entities.powerUps.splice(pi, 1); updateUI();
        }
    });

    // Cleanup
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
        ctx.translate(Math.random()*gameState.shake - gameState.shake/2, Math.random()*gameState.shake - gameState.shake/2);
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
    for (const key in ASSETS) {
        const img = new Image();
        img.src = ASSETS[key];
        img.onload = () => {
            loaded++;
            if (loaded === totalImages) init();
        };
        img.onerror = () => {
            console.warn("Retrying asset: " + key);
            const canvasFallback = document.createElement('canvas');
            canvasFallback.width = 100; canvasFallback.height = 100;
            images[key] = canvasFallback;
            loaded++;
            if (loaded === totalImages) init();
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

    // Load and Display Best Scores
    const bestScore = localStorage.getItem('space_shooter_best_score') || 0;
    const bestLevel = localStorage.getItem('space_shooter_best_level') || 1;
    document.getElementById('best-score').innerText = bestScore;
    document.getElementById('best-level').innerText = bestLevel;

    // Start Button Logic
    document.getElementById('start-btn').addEventListener('click', () => {
        gameState.isStarted = true;
        document.getElementById('start-screen').classList.add('hidden');
    });

    // Mobile Boom Button
    const mobileBoom = document.getElementById('mobile-boom-btn');
    if (mobileBoom) {
        mobileBoom.addEventListener('touchstart', (e) => {
            fireMissile();
            e.stopPropagation();
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
    
    // Improved Touch Controls: Follow finger & Tap to fire boom
    canvas.addEventListener('touchstart', (e) => {
        const pos = getPos(e);
        gameState.mouse.x = pos.x;
        gameState.mouse.y = pos.y;
        
        // Multi-touch or just tap to fire boom on mobile
        if (e.touches.length > 1 || gameState.isMobile) {
            fireMissile(); 
        }
        
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        handleMove(e);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('mousedown', (e) => { 
        if (e.button === 0) fireMissile(); 
    });

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
