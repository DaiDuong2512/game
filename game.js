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
    background: "https://i.pinimg.com/videos/thumbnails/originals/ee/c6/63/eec663343d1d41c9fd5baf68d1e30147.0000000.jpg"
};

const images = {};
let loadedImages = 0;
const totalImages = Object.keys(ASSETS).length;

const gameState = {
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

    lastFrameTime: performance.now(),
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
        this.dist = 80;
        this.x = parent.x;
        this.y = parent.y;
        this.fireTimer = 0;
    }
    update(dt) {
        const tx = this.parent.x + Math.cos(this.angleOffset) * this.dist;
        const ty = this.parent.y + Math.sin(this.angleOffset) * this.dist;
        this.x += (tx - this.x) * 0.1;
        this.y += (ty - this.y) * 0.1;
        this.fireTimer += dt;
        if (this.fireTimer > 350) {
            entities.bullets.push(new Bullet(this.x, this.y, -Math.PI / 2, 1));
            this.fireTimer = 0;
        }
    }
    draw() {
        ctx.save();
        ctx.fillStyle = '#0ea5e9';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0ea5e9';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 12, 0, Math.PI * 2);
        ctx.fill();
        // Inner core
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        ctx.fill();
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
        this.hp = 6;
        this.maxHp = 6;
    }

    takeDamage(amt) {
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
        
        if (gameState.isMobile && gameState.joystick.active) {
            // Speed for joystick movement
            const speed = (this.slowTimer > 0 ? 3 : 7);
            this.x += gameState.joystick.x * speed;
            this.y += gameState.joystick.y * speed;
        } else {
            // Mouse/Direct Follow
            this.x += (gameState.mouse.x - this.x) * curLerp;
            this.y += (gameState.mouse.y - this.y) * curLerp;
        }

        // Keep player in bounds
        this.x = Math.max(this.width/2, Math.min(canvas.width - this.width/2, this.x));
        this.y = Math.max(this.height/2, Math.min(canvas.height - this.height/2, this.y));

        // Auto-fire logic
        if (this.jammedTimer <= 0) {
            this.fireTimer += dt;
            let currentFireRate = this.level <= 5 ? 160 : 160 / (1 + (this.level - 5) * 0.15);
            if (this.fireTimer >= currentFireRate) {
                this.shoot();
                this.fireTimer = 0;
            }
        }
    }

    shoot() {
        const count = Math.min(this.level, 5);
        const spread = 0.18;
        const startAngle = -((count - 1) * spread) / 2;
        const bulletDamage = this.level <= 5 ? 1 : 1 + (this.level - 5) * 0.6;

        for (let i = 0; i < count; i++) {
            const angle = startAngle + i * spread;
            entities.bullets.push(new Bullet(
                this.x, 
                this.y - this.height / 2, 
                -Math.PI / 2 + angle, 
                bulletDamage
            ));
        }
    }

    draw() {
        ctx.save();
        ctx.filter = 'brightness(1.3) contrast(1.1)'; // Highlight player
        if (this.jammedTimer > 0) ctx.filter = 'grayscale(100%) brightness(1.5)';
        if (this.slowTimer > 0) ctx.filter = 'hue-rotate(280deg) saturate(2) brightness(1.3)';
        
        ctx.drawImage(images.player, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        
        // Thruster effect (simple)
        if (!gameState.isGameOver) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.beginPath();
            ctx.arc(this.x, this.y + this.height/2 + Math.random()*10, 6, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angle, damage, isEnemy = false, isDebuff = false) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * (isEnemy ? 5 : 9);
        this.vy = Math.sin(angle) * (isEnemy ? 5 : 9);
        this.damage = damage;
        this.isEnemy = isEnemy;
        this.isDebuff = isDebuff;
        this.radius = isDebuff ? 10 : 4;
        this.trail = [];
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.beginPath();
        if (this.isDebuff) {
            const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.radius);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(1, '#a855f7');
            ctx.fillStyle = grad;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#a855f7';
        } else {
            ctx.fillStyle = this.isEnemy ? '#ef4444' : '#fbbf24';
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.isEnemy ? '#ef4444' : '#fbbf24';
            
            // Add a bright core for player bullets
            if (!this.isEnemy) {
                const grad = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, this.radius);
                grad.addColorStop(0, '#fff');
                grad.addColorStop(1, '#fbbf24');
                ctx.fillStyle = grad;
            }
        }
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Enemy {
    constructor(type) {
        this.type = type;
        this.width = type === 'small' ? 35 : 55;
        this.height = type === 'small' ? 35 : 55;
        this.x = Math.random() * (canvas.width - this.width) + this.width / 2;
        this.y = -60;
        this.hp = type === 'small' ? 1 : 4;
        this.speed = type === 'small' ? 2.5 : 1.8;
        this.vx = type === 'medium' ? (Math.random() > 0.5 ? 1.5 : -1.5) : 0;
        this.fireTimer = Math.random() * 1500;
    }

    update(dt) {
        this.y += this.speed;
        this.x += this.vx;
        if (this.type === 'medium') {
            if (this.x < 100 || this.x > canvas.width - 100) this.vx *= -1;
        }

        this.fireTimer += dt;
        if (this.fireTimer > 2500) {
            if (this.type === 'medium') {
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height/2, Math.PI/2, 1, true));
            } else {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height/2, angle, 1, true));
            }
            this.fireTimer = 0;
        }
    }

    draw() {
        ctx.save();
        ctx.filter = 'brightness(1.4) saturate(1.2)'; // Highlight enemies
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

    update() {
        if (this.target && (entities.enemies.includes(this.target) || this.target === entities.boss)) {
            const angleTo = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            let diff = angleTo - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.angle += diff * 0.2;
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
            target.hp -= 60;
            this.bounces = 3;
        } else {
            target.hp -= 100;
        }
        this.hitTargets.add(target);
        createExplosion(this.x, this.y);
        this.bounces++;
        if (this.bounces < 3) {
            this.findTarget();
            if (!this.target) this.bounces = 3;
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
        this.hp = 800;
        this.maxHp = 800;
        this.fireTimer = 0;
        this.debuffTimer = 0;
        this.moveTimer = 0;
    }

    update(dt) {
        if (this.y < this.targetY) this.y += 1.5;
        else {
            this.moveTimer += dt;
            this.x = canvas.width/2 + Math.sin(this.moveTimer/1200) * (canvas.width/3);
        }

        this.fireTimer += dt;
        if (this.fireTimer > 1500) { // Slower (was 900)
            for (let i = -3; i <= 3; i++) {
                entities.enemyBullets.push(new Bullet(this.x + i*25, this.y + 60, Math.PI/2 + i*0.25, 1, true));
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
        ctx.filter = 'brightness(1.3)'; // Highlight Boss
        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.fillRect(canvas.width/2 - bw/2, 40, bw, 12);
        const hpWidth = (this.hp / this.maxHp) * bw;
        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        grad.addColorStop(0, '#ef4444');
        grad.addColorStop(1, '#991b1b');
        ctx.fillStyle = grad;
        ctx.fillRect(canvas.width/2 - bw/2, 40, hpWidth, 12);

        ctx.drawImage(images.boss, this.x - this.width/2, this.y - this.height/2, this.width, this.height);
        ctx.restore();
    }
}

class PowerUp {
    constructor(x, y, type = 'W') {
        this.x = x; this.y = y; this.radius = 20;
        this.type = type; // 'W', 'H', 'A', 'B' (Boom)
    }
    update() { this.y += 2.2; }
    draw() {
        let color = '#22c55e';
        let label = 'W';
        if (this.type === 'H') { color = '#f43f5e'; label = '❤'; }
        if (this.type === 'A') { color = '#3b82f6'; label = '★'; }
        if (this.type === 'B') { color = '#f97316'; label = '🔥'; }

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
    if (gameState.boomCharges > 0) {
        gameState.isFiringBooms = true;
    }
}

function updateUI() {
    document.getElementById('score-val').innerText = gameState.score;
    document.getElementById('level-val').innerText = gameState.level;
    
    // Update HP Bar
    const hpBar = document.getElementById('hp-bar-inner');
    if (hpBar) {
        const hpPercent = (player.hp / player.maxHp) * 100;
        hpBar.style.width = hpPercent + '%';
        if (hpPercent < 34) hpBar.classList.add('bg-red-500');
        else hpBar.classList.remove('bg-red-500');
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

    gameState.bgY += 1.2;
    if (gameState.shake > 0) gameState.shake *= 0.88;

    player.update(dt);

    // Rapid Boom Discharge Logic
    if (gameState.isFiringBooms) {
        if (gameState.boomCharges > 0) {
            if (gameState.boomGCD <= 0) {
                entities.missiles.push(new Missile(player.x, player.y));
                gameState.boomCharges--;
                gameState.boomGCD = 1000; // 1s per boom discharge
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
        warn.classList.remove('hidden');
        setTimeout(() => warn.classList.add('hidden'), 4000);
    }

    // Entities Updates
    entities.bullets.forEach(e => e.update());
    entities.enemyBullets.forEach(e => e.update());
    entities.enemies.forEach(e => e.update(dt));
    entities.missiles.forEach(e => e.update());
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
                    
                    // Random PowerUp Spawning
                    const rand = Math.random();
                    if (rand < 0.22) {
                        let type = 'W';
                        if (rand < 0.04) type = 'A'; // Ally
                        else if (rand < 0.09) type = 'B'; // BOOM Upgrade
                        else if (rand < 0.16) type = 'H'; // Heal
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
                gameState.nextBossScore = gameState.score + 3000;
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
            } else {
                entities.enemyBullets.splice(ebi, 1);
                player.takeDamage(1); // Standard bullet = 1 HP
            }
        }
    });

    entities.enemies.forEach(e => {
        if (Math.hypot(e.x - player.x, e.y - player.y) < 45) {
            // Collision with enemy body
            const dmg = e.type === 'small' ? 1 : 2; // small = 1/6, large = 2/6 (3 hits)
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
                player.hp = Math.min(player.maxHp, player.hp + 2);
            } else if (p.type === 'A') {
                const angle = entities.allies.length % 2 === 0 ? 0 : Math.PI;
                entities.allies.push(new Ally(player, angle));
            } else if (p.type === 'B') {
                // BOOM Buffs
                gameState.boomMaxCharges += 3;
                gameState.boomGainAmount += 1; // Double or more gain
                gameState.boomChargeSpeed = Math.max(3000, gameState.boomChargeSpeed - 800);
            }
            entities.powerUps.splice(pi, 1); updateUI();
        }
    });

    // Cleanup
    entities.bullets = entities.bullets.filter(e => e.y > -100);
    entities.enemyBullets = entities.enemyBullets.filter(e => e.y < canvas.height + 100);
    entities.enemies = entities.enemies.filter(e => e.y < canvas.height + 100 && e.hp > 0);
    entities.missiles = entities.missiles.filter(e => e.bounces < 3);
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
    const dt = now - gameState.lastFrameTime;
    gameState.lastFrameTime = now;
    
    if (!gameState.isPaused) {
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

    // Detect Mobile
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        gameState.isMobile = true;
        const mobileUI = document.getElementById('mobile-controls');
        if (mobileUI) {
            mobileUI.classList.remove('opacity-0');
            mobileUI.classList.add('opacity-100');
        }
    }

    const knob = document.getElementById('joystick-knob');
    const zone = document.getElementById('joystick-zone');
    let zoneRect = zone ? zone.getBoundingClientRect() : null;

    if (zone && knob) {
        const handleJoystick = (ex, ey) => {
            if (!zoneRect) zoneRect = zone.getBoundingClientRect();
            const centerX = zoneRect.left + zoneRect.width / 2;
            const centerY = zoneRect.top + zoneRect.height / 2;
            let dx = ex - centerX;
            let dy = ey - centerY;
            const dist = Math.hypot(dx, dy);
            const maxDist = 40;

            if (dist > maxDist) {
                dx = (dx / dist) * maxDist;
                dy = (dy / dist) * maxDist;
            }

            knob.style.transform = `translate(${dx}px, ${dy}px)`;
            gameState.joystick.x = dx / maxDist;
            gameState.joystick.y = dy / maxDist;
            gameState.joystick.active = true;
        };

        zone.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            handleJoystick(touch.clientX, touch.clientY);
        });
        zone.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            handleJoystick(touch.clientX, touch.clientY);
            if (e.cancelable) e.preventDefault();
        });
        zone.addEventListener('touchend', () => {
            knob.style.transform = `translate(0, 0)`;
            gameState.joystick.active = false;
        });
    }

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleMove = (e) => {
        if (gameState.joystick.active) return; // Prioritize joystick
        const pos = getPos(e);
        gameState.mouse.x = pos.x;
        gameState.mouse.y = pos.y;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', (e) => {
        handleMove(e);
        // Only prevent default if we're touching the canvas/game area
        if (e.cancelable && e.target.id === 'gameCanvas') e.preventDefault();
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

    // Mobile specific fire button
    const fireBtn = document.getElementById('mobile-fire');
    if (fireBtn) {
        fireBtn.addEventListener('touchstart', (e) => {
            fireMissile();
            if (e.cancelable) e.preventDefault();
        }, { passive: false });
        fireBtn.addEventListener('mousedown', (e) => {
            fireMissile();
        });
    }

    requestAnimationFrame(gameLoop);
}

preload();
