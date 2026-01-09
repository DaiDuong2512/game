/**
 * Space Shooter Pro - Game Engine
 */

// Force scroll to top immediately on script load to fix mobile viewport bugs
window.scrollTo(0, 0);

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
    nextBossScore: 2000,
    isBossFight: false,
    mouse: { x: window.innerWidth / 2, y: window.innerHeight - 100 },
    joystick: { x: 0, y: 0, active: false },
    isMobile: false,
    shake: 0,
    bgY: 0,
    sfxVolume: parseFloat(localStorage.getItem('space_shooter_sfx_volume')) || 0.6,
    bgmVolume: parseFloat(localStorage.getItem('space_shooter_bgm_volume')) || 0.4,
    graphicsQuality: localStorage.getItem('space_shooter_graphics') || 'high',
    language: localStorage.getItem('game_lang') || 'vn',

    // New Mechanics
    uDropChanceModifier: 1.0,
    buffStreak: 0,
    streakTimer: 0,
    streakPenaltyType: 0, // 0: none, 1: 80%, 2: 50%
    accumulatedBossHp: 0,

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
    weaponTier: 0,
    boomDamageMultiplier: 1.1
};

const translations = {
    vn: {
        vanguard: "ĐIỂM SỐ",
        nextBoss: "BOSS TIẾP THEO",
        lvl: "CẤP",
        missionPaused: "TẠM DỪNG NHIỆM VỤ",
        pauseHint: "Nhấn Space hoặc Chuột Phải để tiếp tục",
        resume: "TIẾP TỤC",
        missionAborted: "NHIỆM VỤ THẤT BẠI",
        score: "ĐIỂM SỐ",
        level: "CẤP ĐỘ",
        tryAgain: "THỬ LẠI",
        settingsTitle: "CÀI ĐẶT",
        language: "Ngôn Ngữ",
        bgmVolume: "Âm Lượng Nhạc",
        sfxVolume: "Âm Lượng Hiệu Ứng",
        graphicsQuality: "Chất Lượng Đồ Họa",
        high: "CAO",
        low: "THẤP",
        resetData: "XÓA TOÀN BỘ DỮ LIỆU",
        loadingAssets: "ĐANG TẢI TÀI NGUYÊN...",
        personalBest: "KỶ LỤC CÁ NHÂN",
        maxLevel: "Cấp Tối Đa",
        topScore: "Điểm Cao Nhất",
        startMission: "BẮT ĐẦU NHIỆM VỤ",
        continueMission: "TIẾP TỤC NHIỆM VỤ",
        settings: "CÀI ĐẶT",
        controlHint: "CHẠM HOẶC CLICK ĐỂ DI CHUYỂN & BẮN"
    },
    en: {
        vanguard: "SCORE",
        nextBoss: "NEXT BOSS IN",
        lvl: "LVL",
        missionPaused: "MISSION PAUSED",
        pauseHint: "Space or Right-Click to Resume",
        resume: "RESUME",
        missionAborted: "MISSION ABORTED",
        score: "SCORE",
        level: "LEVEL",
        tryAgain: "TRY AGAIN",
        settingsTitle: "SETTINGS",
        language: "Language",
        bgmVolume: "BGM Volume",
        sfxVolume: "SFX Volume",
        graphicsQuality: "Graphics Quality",
        high: "HIGH",
        low: "LOW",
        resetData: "RESET ALL GAME DATA",
        loadingAssets: "LOADING ASSETS...",
        personalBest: "PERSONAL BEST",
        maxLevel: "Max Level",
        topScore: "Top Score",
        startMission: "START MISSION",
        continueMission: "CONTINUE MISSION",
        settings: "SETTINGS",
        controlHint: "TAP OR CLICK TO CONTROL & SHOOT"
    }
};

function applyLanguage() {
    const lang = gameState.language;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            if (el.tagName === 'INPUT' && el.type === 'button') {
                el.value = translations[lang][key];
            } else {
                el.textContent = translations[lang][key];
            }
        }
    });
}

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

    // Safety check for images
    const requiredImages = ['enemySmall', 'enemyMedium'];
    requiredImages.forEach(key => {
        if (!images[key] || !images[key].complete || images[key].naturalWidth === 0) {
            console.warn(`Asset ${key} not fully loaded, using fallback for prerender`);
            const fallback = document.createElement('canvas');
            fallback.width = 64; fallback.height = 64;
            const fctx = fallback.getContext('2d');
            fctx.fillStyle = key === 'enemySmall' ? '#ef4444' : '#991b1b';
            fctx.beginPath(); fctx.arc(32, 32, 20, 0, Math.PI * 2); fctx.fill();
            images[key] = fallback;
        }
    });

    // --- Prerender Bullets (GPU Texture Batching) ---
    const bulletTypes = [
        { name: 'yellow', color: '#fbbf24', radius: 4 },
        { name: 'green', color: '#22c55e', radius: 4 },
        { name: 'blue', color: '#3b82f6', radius: 4 },
        { name: 'red', color: '#ef4444', radius: 4.2, glow: '#ff0000' }, // Reduced 30% (was 6)
        { name: 'debuff', color: '#a855f7', radius: 7 },         // Reduced 30% (was 10)
        { name: 'downgrade', color: '#ec4899', radius: 7 },      // Reduced 30% (was 10)
        { name: 'cyan', color: '#22d3ee', radius: 3.5 }          // Reduced 30% (was 5)
    ];

    bulletTypes.forEach(t => {
        const canv = document.createElement('canvas');
        const size = (t.radius + 6) * 2; // Extra padding for glow
        canv.width = size;
        canv.height = size;
        const c = canv.getContext('2d');
        const center = size / 2;

        if (t.glow) {
            c.shadowBlur = 10;
            c.shadowColor = t.glow;
        }

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

    // --- Prerender Enemies (GPU Texture Batching) ---
    const enemyTypes = [
        { name: 'small', color: '#ff4444', size: 32, img: images.enemySmall },
        { name: 'medium', color: '#ffaa00', size: 48, img: images.enemyMedium }
    ];

    enemyTypes.forEach(t => {
        // Base and Shield versions
        [false, true].forEach(isBuffed => {
            const canv = document.createElement('canvas');
            canv.width = t.size + 40; // Extra padding for glow and effects
            canv.height = t.size + 40;
            const c = canv.getContext('2d');
            const center = canv.width / 2;

            // Buffed enemies (multi-bullet) use a more intense purple/magenta tint
            const mainColor = isBuffed ? '#d946ef' : t.color;
            const glowColor = isBuffed ? '#ff00ff' : t.color;

            c.save();
            c.translate(center, center);

            // GPU-Style Tinting: STRICTLY using PNGs as requested
            if (t.img && t.img.width > 0) {
                const w = t.size;
                const h = t.size;

                // 1. Shadow/Glow (GPU Accelerated)
                c.shadowBlur = isBuffed ? 18 : 12;
                c.shadowColor = glowColor;

                // 2. Base Image (PNG)
                c.drawImage(t.img, -w / 2, -h / 2, w, h);

                // 3. Color Tinting (GPU source-atop) - 15% tint (85% PNG remains)
                c.globalCompositeOperation = 'source-atop';
                c.fillStyle = mainColor;
                c.globalAlpha = 0.15;
                c.fillRect(-w / 2, -h / 2, w, h);
                c.globalAlpha = 1.0;
                c.globalCompositeOperation = 'source-over';
            }
            c.restore();

            const suffix = (isBuffed ? '_buffed' : '');
            TEXTURES['enemy_' + t.name + suffix] = canv;

            // Shield version
            const sCanv = document.createElement('canvas');
            sCanv.width = canv.width;
            sCanv.height = canv.height;
            const sc = sCanv.getContext('2d');
            sc.drawImage(canv, 0, 0);
            sc.strokeStyle = isBuffed ? '#f0f' : '#00ffff';
            sc.lineWidth = 3;
            sc.beginPath();
            sc.arc(center, center, t.size / 1.3, 0, Math.PI * 2);
            sc.stroke();
            TEXTURES['enemy_' + t.name + suffix + '_shield'] = sCanv;
        });
    });

    //console.log("GPU Optimization: Enemy textures ready.");
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
        ctx.fillText(formatNumber(this.amount), this.x, this.y);
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
        // Task: Increase Ally base HP to 60% of player (was 30%)
        this.maxHp = parent.maxHp * 0.6;
        this.hp = this.maxHp;
        this.target = null;
    }

    update(dt) {
        // Balanced positioning for up to 6 allies
        let offsetX, offsetY;
        const count = entities.allies.length;
        const colIndex = Math.floor(this.index / 2);

        if (count === 3) {
            // Special case for exactly 3: Triangle formation (2 sides, 1 rear/center)
            if (this.index === 0) { offsetX = -50; offsetY = -10; }
            else if (this.index === 1) { offsetX = 50; offsetY = -10; }
            else { offsetX = 0; offsetY = 35; }
        } else {
            // General grid-like formation for other counts
            const isLeft = this.index % 2 === 0;
            offsetX = isLeft ? -45 - (colIndex * 15) : 45 + (colIndex * 15);
            offsetY = -5 + (colIndex * 25);
        }

        const tx = this.parent.x + offsetX;
        const ty = this.parent.y + offsetY;

        const lerpFactor = 1 - Math.pow(1 - 0.1, dt / 16.6);
        this.x += (tx - this.x) * lerpFactor;
        this.y += (ty - this.y) * lerpFactor;

        // Scale HP with player max HP (Consistent with 60% of player HP)
        const targetMaxHp = this.parent.maxHp * 0.6;
        if (this.maxHp !== targetMaxHp) {
            const ratio = targetMaxHp / this.maxHp;
            this.maxHp = targetMaxHp;
            this.hp *= ratio;
        }

        this.fireTimer += dt;
        const playerFireRate = 160 / (1 + (gameState.level - 1) * 0.1);
        const allyFireRate = playerFireRate * 2; // 50% speed = double fire interval

        if (this.fireTimer > allyFireRate) {
            // Updated ally damage scaling to better track player growth
            const playerBulletDmg = (player.level <= 5 ? 60 : 60 + (player.level - 5) * 45) * (1 + (gameState.bossCount || 0) * 0.15);

            // Task: Allies upgrade bullet count (rays) based on Player's weapon tier
            const allyBulletCount = gameState.weaponTier + 1; // Tier 0 (Yellow): 1 ray, 1 (Green): 2 rays, 2 (Blue): 3 rays
            const allySpread = 0.05;

            let baseAngle;
            if (entities.boss) {
                // Auto-target boss: Allies focus fire on the boss
                baseAngle = Math.atan2(entities.boss.y - this.y, entities.boss.x - this.x);
            } else {
                // Straighter angle when no boss is present (Special case for 3rd ally to fire straight)
                if (count === 3 && this.index === 2) {
                    baseAngle = -Math.PI / 2;
                } else {
                    baseAngle = -Math.PI / 2 + (this.index % 2 === 0 ? -0.05 : 0.05) * (colIndex + 1);
                }
            }

            for (let i = 0; i < allyBulletCount; i++) {
                const offsetAngle = allyBulletCount > 1 ? (i - (allyBulletCount - 1) / 2) * allySpread : 0;
                const b = new Bullet(
                    this.x,
                    this.y,
                    baseAngle + offsetAngle,
                    playerBulletDmg * player.allyDamageRatio,
                    false,
                    false,
                    gameState.weaponTier,
                    false,
                    true
                );
                b.radius = 1.6; // Significantly smaller than player (4.0)
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
        this.lerp = 0.10; // Reduced from 0.15 to make it take more time to follow mouse
        this.fireTimer = 0;
        this.level = 0; // Task 3: Start with 1 bullet (0*2+1)
        this.slowTimer = 0;
        this.jammedTimer = 0;
        this.fireRateDebuffTimer = 0; // Now converted to movement slow as per request
        this.hp = 1000;
        this.maxHp = 1000;
        this.shield = 0;
        this.tilt = 0;
        this.damageMultiplier = 1.0;

        // New Mechanics
        this.immunityTimer = 0;
        this.hasteTimer = 0;
        this.damageReductionTimer = 0;
        this.bossKillDamageBonus = 0;
        this.permDamageReduction = 0; // NEW: Permanent reduction from Shields (Max 40%)
        this.allyDamageRatio = 0.20; // Task: Build start at 20%
    }

    getStats() {
        const levelBonus = (gameState.level - 1) * 0.1;
        const baseInterval = 222;
        let hasteMult = this.hasteTimer > 0 ? 2.0 : 1.0;
        const targetInterval = baseInterval / (1 + levelBonus) / hasteMult;
        const INITIAL_CAP_MS = 222;
        const MAX_CAP_MS = 167;
        let currentCap = Math.max(MAX_CAP_MS, INITIAL_CAP_MS - (gameState.level - 1) * 6) / hasteMult;
        const finalInterval = Math.max(currentCap, targetInterval);

        let excessDamageBonus = 1.0;
        if (targetInterval < currentCap) {
            let excessPercent = (currentCap / targetInterval) - 1;
            excessDamageBonus = 1 + (excessPercent * 0.3);
        }

        const rays = Math.floor(this.level * 2 + 1);
        const shotsPerSec = (1000 / finalInterval).toFixed(1);

        let baseDmg = (this.level <= 5 ? 85 : 85 + (this.level - 5) * 60) * (1 + (gameState.bossCount || 0) * 0.15);
        if (gameState.weaponTier === 1) baseDmg *= 3.5;
        if (gameState.weaponTier === 2) baseDmg *= 5.0;
        const excessDmg = Math.max(1, 1 + (this.level - 10) * 0.2);
        const bossBonus = 1 + (this.level >= 10 ? (this.bossKillDamageBonus || 0) : 0);
        const finalDmg = Math.floor(baseDmg * this.damageMultiplier * excessDmg * 2.2 * bossBonus * excessDamageBonus);

        // Calculate Protection % (Include permanent shield reduction)
        let protection = Math.round(this.permDamageReduction * 100);
        if (entities.allies.length === 6) protection += 20;
        else if (entities.allies.length > 2) protection += 10;
        if (this.damageReductionTimer > 0) protection += 30;

        return {
            shotsPerSec,
            rays,
            damageMultiplier: (this.damageMultiplier * bossBonus).toFixed(1),
            allyDamagePercent: Math.round(this.allyDamageRatio * 100),
            finalDmg,
            protection
        };
    }

    takeDamage(amt) {
        // Task: Enemy damage scaling (Adjusted from 1.18 to 1.44 per level)
        // Level starts at 1, so level 1 has no multiplier (1.44^0 = 1)
        const scale = Math.pow(1.44, gameState.level - 1);
        let totalDmg = amt * scale;

        let reductionMult = 1.0;

        // Task 6: Shield/Skill 30% damage reduction
        if (this.damageReductionTimer > 0) {
            reductionMult *= 0.7;
        }

        // New: Ally based damage reduction
        // >2 allies = 10% reduction, 6 allies = 20% reduction
        if (entities.allies.length === 6) {
            reductionMult *= 0.8;
        } else if (entities.allies.length > 2) {
            reductionMult *= 0.9;
        }

        // Permanent Shield reduction (5% per pick, max 40%)
        reductionMult *= (1 - Math.min(0.4, this.permDamageReduction));

        totalDmg *= reductionMult;

        // Task 5: Shield logic (250 + 10% max HP)
        if (this.shield > 0) {
            this.shield -= totalDmg;
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
            ally.hp -= totalDmg;
            if (ally.hp <= 0) {
                createExplosion(ally.x, ally.y);
                entities.allies.pop();
            }
            return;
        }

        this.hp -= totalDmg;
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
        if (this.fireRateDebuffTimer > 0) this.fireRateDebuffTimer -= dt;
        if (this.immunityTimer > 0) this.immunityTimer -= dt;
        if (this.hasteTimer > 0) this.hasteTimer -= dt;
        if (this.damageReductionTimer > 0) this.damageReductionTimer -= dt;

        // Task: Debuff slows movement by 30% (curLerp * 0.7) for 2s
        let curLerp = (this.slowTimer > 0 || this.fireRateDebuffTimer > 0) ? this.lerp * 0.7 : this.lerp;
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

            // Task: Cap fire rate at 1 volley per second (1000ms)
            // Anything beyond that is converted: +10% speed bonus = +3% damage
            let baseInterval = 222; // 4.5 shots/s

            // Task 3: 2s speed boost at boss start
            let hasteMult = this.hasteTimer > 0 ? 2.0 : 1.0;
            let targetInterval = baseInterval / (1 + levelBonus) / hasteMult;

            let finalInterval = targetInterval;
            let excessDamageBonus = 1.0;
            const INITIAL_CAP_MS = 222; // 4.5 shots/s
            const MAX_CAP_MS = 167;     // 6.0 shots/s

            // Limit scales from 4.5 at Level 1 to 6.0 at Level 10
            let currentCap = Math.max(MAX_CAP_MS, INITIAL_CAP_MS - (gameState.level - 1) * 6) / hasteMult;

            if (targetInterval < currentCap) {
                finalInterval = currentCap;
                let excessPercent = (currentCap / targetInterval) - 1;
                excessDamageBonus = 1 + (excessPercent * 0.3); // 10% speed = 3% dmg
            }

            // Note: fireRateDebuffTimer logic removed as per user request to convert it to movement slow

            if (this.fireTimer >= finalInterval) {
                this.shoot(excessDamageBonus);
                this.fireTimer = 0;
            }
        }
    }

    shoot(excessDamageBonus = 1.0) {
        // Task 3: Bullet limit 5, start 1
        let count = Math.floor(this.level * 2 + 1);
        if (gameState.weaponTier === 0 && count > 5) {
            gameState.weaponTier = 1;
            // Upgrade Effect: Start with 3 bullets and 3 allies (Task Update)
            this.level = 1;
            count = 3;
            while (entities.allies.length < 3) {
                entities.allies.push(new Ally(player, entities.allies.length));
            }
        } else if (gameState.weaponTier === 1 && count > 5) {
            gameState.weaponTier = 2;
            this.level = 1;
            count = 3;
            while (entities.allies.length < 3) {
                entities.allies.push(new Ally(player, entities.allies.length));
            }
        }
        count = Math.min(count, 5);

        const spread = 0.12; // Reduced spread for higher concentration
        const startAngle = -spread / 2;
        // Updated damage scaling to be consistent with getStats()
        let bulletDamage = (this.level <= 5 ? 85 : 85 + (this.level - 5) * 60) * (1 + (gameState.bossCount || 0) * 0.15);
        if (gameState.weaponTier === 1) bulletDamage *= 3.5;
        if (gameState.weaponTier === 2) bulletDamage *= 5.0;

        const excessDmg = Math.max(1, 1 + (this.level - 10) * 0.2);
        const bossBonus = 1 + (this.level >= 10 ? (this.bossKillDamageBonus || 0) : 0);

        // Apply PowerUp multipliers and the overflow bonus
        bulletDamage *= (this.damageMultiplier * excessDamageBonus * 2.2 * excessDmg * bossBonus);

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
    constructor(x, y, angle, damage, isEnemy = false, isDebuff = false, tier = 0, isDowngrade = false, isAlly = false) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * (isEnemy ? 4.5 : 9); // Enemy speed reduced by 10% (5 -> 4.5)
        this.vy = Math.sin(angle) * (isEnemy ? 4.5 : 9);
        this.damage = damage;
        this.isEnemy = isEnemy;
        this.isDebuff = isDebuff;
        this.isBossSpeedDebuff = false; // Internal flag

        // Task: Probability 8% for a debuff to be a speed debuff (Cyan)
        if (isDebuff && Math.random() < 0.08) {
            this.isBossSpeedDebuff = true;
        }

        this.isDowngrade = isDowngrade;
        this.isAlly = isAlly;
        this.tier = tier; // 0: Yellow, 1: Green, 2: Blue
        // Reduced enemy bullet radius by 30% for visuals/collision consistency
        this.radius = isDebuff || isDowngrade ? 7 : (isEnemy ? 4.2 : 4);
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
        if (this.isDebuff) {
            // New logic: 10% chance for cyan boss debuff
            if (this.isBossSpeedDebuff) tex = TEXTURES.bullet_cyan;
            else tex = TEXTURES.bullet_debuff;
        }
        else if (this.isDowngrade) tex = TEXTURES.bullet_downgrade;
        else if (this.isEnemy) tex = TEXTURES.bullet_red;
        else {
            const colors = ['yellow', 'green', 'blue'];
            const name = colors[this.tier] || 'yellow';
            tex = this.isLong ? TEXTURES['bullet_long_' + name] : TEXTURES['bullet_' + name];
        }

        if (!tex) return;

        // NEW: Respect this.radius for scaling (Player/Enemy default radius is 4)
        // This ensures ally bullets (radius 1.6) are smaller than player bullets (radius 4.0)
        const scale = (this.isEnemy || this.isDebuff || this.isDowngrade) ? 1.0 : (this.radius / 4);
        const w = tex.width * scale;
        const h = tex.height * scale;

        if (this.isLong) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx));

            // Enemy bullets get a pulse effect to be more visible
            if (this.isEnemy) {
                const pulse = 1 + Math.sin(performance.now() / 50) * 0.2;
                ctx.scale(pulse, pulse);
            }

            ctx.drawImage(tex, -w / 2, -h / 2, w, h);
            ctx.restore();
        } else {
            if (this.isEnemy) {
                const pulse = 1 + Math.sin(performance.now() / 50) * 0.2;
                ctx.drawImage(tex, Math.floor(this.x - (w * pulse) / 2), Math.floor(this.y - (h * pulse) / 2), w * pulse, h * pulse);
            } else {
                ctx.drawImage(tex, Math.floor(this.x - w / 2), Math.floor(this.y - h / 2), w, h);
            }
        }
    }
}

class Enemy {
    constructor(x, y, type, isFromExplosion = false) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.isFromExplosion = isFromExplosion;
        this.isTank = !isFromExplosion && Math.random() < 0.3;

        this.width = type === 'small' ? 32 : 55;
        this.height = type === 'small' ? 32 : 55;
        if (this.isTank) {
            this.width *= 1.2;
            this.height *= 1.2;
        }

        // Calculate Player Power Factor (HP Scaling)
        let baseDmg = 85;
        let pLevel = player.level;
        let currentDmg = pLevel <= 5 ? 85 : 85 + (pLevel - 5) * 60;
        if (gameState.weaponTier === 1) currentDmg *= 3.5;
        if (gameState.weaponTier === 2) currentDmg *= 5.0;

        let dmgRatio = currentDmg / baseDmg;
        let hpMultiplier = 1 + (dmgRatio - 1) * 1.2; // Increased multiplier from 0.8 to 1.2
        if (player.level > 1) hpMultiplier += 0.60; // Increased from 0.15
        if (this.isTank) hpMultiplier *= 5.0; // Increased Tank HP from 4x to 5x

        const baseHp = type === 'small' ? 250 : 800; // Increased base HP (was 100/400)
        // Task: Enemy HP scaling (Added 1.44x power scaling per level)
        const levelHpScale = Math.pow(1.44, gameState.level - 1);
        this.hp = baseHp * gameState.difficulty * hpMultiplier * levelHpScale;
        this.maxHp = this.hp; // Store max for health bar

        // Calculate Contact/Bullet Damage for display (Adjusted scaling from 1.18 to 1.44)
        this.contactDmg = Math.floor(10 * Math.pow(1.44, gameState.level - 1));

        let levelSpeedBonus = (gameState.level - 1) * 0.1;
        this.speed = (type === 'small' ? 0.75 : 0.55) + levelSpeedBonus;
        if (this.isTank) this.speed *= 0.7; // Tanks are slower

        this.vx = type === 'medium' ? (Math.random() > 0.5 ? 0.45 : -0.45) : 0;
        this.fireTimer = Math.random() * 1500;

        // Task 3: Enemy bullet count 1,2,3 when player > 3 bullets (player.level > 1)
        // User update: Strong enemies (multiple bullets) now only 12% chance
        this.bulletCount = 1;
        if (Math.floor(player.level * 2 + 1) > 3) {
            if (Math.random() < 0.12) {
                this.bulletCount = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
            }
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
        // Task: Cap fire rate bonus at Level 10
        let levelFireBonus = (Math.min(10, gameState.level) - 1) * 0.13; // +3% from before (0.1 -> 0.13)
        const baseFireRate = 4000 / (1 + (gameState.difficulty - 1) * 0.3); // Increased 20% speed (5000 * 0.8 = 4000)
        let fireRate = Math.max(640, baseFireRate / (1 + levelFireBonus)); // min 800 * 0.8 = 640

        if (this.bulletCount > 1) {
            fireRate *= 1.8;
        }

        if (this.fireTimer > fireRate) {
            // Damage scaling: base 80 -> 156 then increased by 1.44x after each level
            const levelDmgFactor = Math.pow(1.44, gameState.level - 1);
            const bulletDmg = 80 * 1.3 * 1.5 * levelDmgFactor;

            if (this.bulletCount > 1) {
                const spread = 0.75;
                const startAngle = Math.PI / 2 - spread / 2;
                for (let i = 0; i < this.bulletCount; i++) {
                    const step = i / (this.bulletCount - 1);
                    entities.enemyBullets.push(new Bullet(this.x, this.y + this.height / 2, startAngle + step * spread, bulletDmg, true));
                }
            } else if (this.type === 'medium') {
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height / 2, Math.PI / 2, bulletDmg, true));
            } else {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                entities.enemyBullets.push(new Bullet(this.x, this.y + this.height / 2, angle, bulletDmg, true));
            }
            this.fireTimer = 0;
        }
    }

    takeDamage(amt) {
        // Task 4: Shield 90% only during entry (Ends at 0.8s OR when reaching 1/8 screen height)
        let reduction = 0;
        if (this.entryTimer < 800 && this.y < canvas.height / 8) reduction = 0.9;

        // Medium enemies get 30% damage reduction when boss is present
        if (entities.boss && this.type === 'medium') reduction = Math.max(reduction, 0.3);

        this.hp -= amt * (1 - reduction);
    }

    draw() {
        ctx.save();
        // GPU Optimized: Use pre-rendered textures with integer coordinates
        const isProtected = this.entryTimer < 800 && this.y < canvas.height / 8;
        const isBuffed = this.bulletCount > 1;
        const texName = 'enemy_' + this.type + (isBuffed ? '_buffed' : '') + (isProtected ? '_shield' : '');
        const tex = TEXTURES[texName];

        if (tex) {
            // Visualize Tank status (Darker or slightly different tint)
            if (this.isTank) {
                ctx.filter = 'brightness(0.7) contrast(1.2) sepia(0.3) hue-rotate(-20deg)';
            }
            ctx.drawImage(tex, Math.floor(this.x - tex.width / 2), Math.floor(this.y - tex.height / 2));
            if (this.isTank) ctx.filter = 'none';
        } else {
            // Fallback to images if texture not ready
            const img = this.type === 'small' ? images.enemySmall : images.enemyMedium;
            ctx.drawImage(img, Math.floor(this.x - this.width / 2), Math.floor(this.y - this.height / 2), this.width, this.height);
        }

        // --- ENEMY HP DISPLAY ---
        if (this.y > -50 && this.y < canvas.height + 50) {
            // HP Bar (very small, below enemy)
            const bw = this.width * 0.8;
            const bh = 3;
            const bx = this.x - bw / 2;
            const by = this.y + this.height / 2 + 5;

            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(bx, by, bw, bh);
            ctx.fillStyle = "#ef4444";
            ctx.fillRect(bx, by, (this.hp / this.maxHp) * bw, bh);

            // HP Text
            ctx.fillStyle = "white";
            ctx.font = "bold 8px Inter";
            ctx.textAlign = "center";
            ctx.shadowBlur = 2;
            ctx.shadowColor = "black";
            ctx.fillText(`${formatNumber(this.hp)} HP`, Math.floor(this.x), Math.floor(by + bh + 8));
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }
}

class Missile {
    constructor(x, y, initialTarget = null, isAlly = false) {
        this.x = x;
        this.y = y;
        this.speed = 7.2; // 20% slower than player bullet (9 * 0.8 = 7.2)
        this.target = initialTarget;
        this.bounces = 0;
        this.hitTargets = new Set();
        this.width = 45;
        this.height = 45;
        this.angle = -Math.PI / 2;
        this.isAlly = isAlly;
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
        // Updated missile damage to match new player damage curve
        const currentBulletDmg = (pLevel <= 5 ? 85 : 85 + (pLevel - 5) * 60) * (1 + (gameState.bossCount || 0) * 0.4) * player.damageMultiplier;
        const missileDmg = currentBulletDmg * gameState.boomDamageMultiplier;

        // Boom heal on hit as requested
        player.hp = Math.min(player.maxHp, player.hp + 50);

        let finalDamage = missileDmg;
        if (target === entities.boss) {
            finalDamage = missileDmg * 5;
            // Task: Boss Resistance (20% from allies, 80% from player)
            finalDamage *= (this.isAlly ? 0.2 : 0.8);

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
        this.targetY = canvas.height / 9;

        // Check if it's a Super Boss (every 5th boss)
        this.isSuper = (gameState.bossCount + 1) % 5 === 0;

        // Progressive HP scaling (Significantly increased to match player damage)
        const scalingFactor = gameState.bossCount >= 1 ? 75000 : 35000;
        const baseHp = 25000 + (gameState.bossCount * scalingFactor);

        // Task: HP stacking (previous boss HP + current scaling)
        let finalMaxHp = baseHp + gameState.accumulatedBossHp;
        if (this.isSuper) finalMaxHp *= 6.5;

        // Task: Increase Boss HP > level 2 by 25% (was 15%)
        if (gameState.bossCount >= 1) { // Level 2 and above
            finalMaxHp *= 1.25;
        }

        this.maxHp = finalMaxHp;
        this.hp = this.maxHp;

        if (this.isSuper) {
            this.width *= 1.4;
            this.height *= 1.4;
        }

        this.fireTimer = 0;
        this.lightningTimer = 0; // New timer for lightning attack
        this.debuffTimer = 0;
        this.moveTimer = 0;

        // Thresholds for Super Boss Downgrade Attack
        this.thresholds = [0.8, 0.5, 0.3, 0.1];
        this.triggeredThresholds = new Set();
        this.spawnProtectionTimer = 5000; // 5s protection
    }

    takeDamage(amt, isAlly = false) {
        // Task: Boss Resistance (20% from allies, 80% from player)
        let finalAmt = isAlly ? amt * 0.2 : amt * 0.8;

        if (this.spawnProtectionTimer > 0) {
            finalAmt *= 0.2; // 80% reduction
        }
        this.hp -= finalAmt;
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
        if (this.spawnProtectionTimer > 0) this.spawnProtectionTimer -= dt;
        const timeFactor = dt / 16.6;

        if (this.y < this.targetY) {
            // Fast arrival in first 1s (spawnProtection is 5s, so first 1s is 5000->4000)
            const arrivalSpeed = (this.spawnProtectionTimer > 4000) ? 7 : 0.45;
            this.y += arrivalSpeed * timeFactor;
        } else {
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

        // Task: Boss fire rate 0.6/s (~1667ms), cap at Level 10 (which is Boss 10)
        const bossFireRate = 2000 / (1 + Math.min(9, gameState.bossCount) * 0.2);
        let finalFireRate = this.isSuper ? bossFireRate * 0.7 : bossFireRate;
        finalFireRate = Math.max(1667, finalFireRate);

        if (this.fireTimer > finalFireRate) { // Progressive fire rate
            const spreadCount = this.isSuper ? 5 : 3;
            for (let i = -spreadCount; i <= spreadCount; i++) {
                entities.enemyBullets.push(new Bullet(this.x + i * 25, this.y + 60, Math.PI / 2 + i * 0.2, 1, true));
            }
            this.fireTimer = 0;
        }

        // Lightning Strike Attack removed as per request (Tia giảm tốc)

        this.debuffTimer += dt;
        if (this.debuffTimer > 6000) {
            // Task: Purple rays sparser (reduced from 16 to 10)
            const rayCount = 10;
            for (let i = 0; i < rayCount; i++) {
                const angle = (i / rayCount) * Math.PI * 2 + (this.moveTimer / 400);
                entities.enemyBullets.push(new Bullet(this.x, this.y, angle, 0, true, true));
            }
            this.debuffTimer = 0;
        }
    }

    draw() {
        // Boss Health Bar UI (y moved to 95 to avoid HUD)
        const bw = Math.min(canvas.width * 0.85, 400);
        const barY = 95;
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

        // Spawn Protection Visual
        if (this.spawnProtectionTimer > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width * 0.7, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(147, 197, 253, 0.6)"; // Light blue
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = "rgba(147, 197, 253, 0.1)";
            ctx.fill();
        }
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
    // Scaling: 50 + 2% of max HP
    player.hp = Math.min(player.maxHp, player.hp + (50 + player.maxHp * 0.02));

    // Doubled drop rates as per user request
    let totalDropChance = e.type === 'small' ? 0.20 : 0.42;

    // Applying Luck Fatigue penalty
    if (gameState.streakPenaltyType === 1) totalDropChance *= 0.2; // 80% reduction
    else if (gameState.streakPenaltyType === 2) totalDropChance *= 0.5; // 50% reduction

    const rand = Math.random();
    if (rand < totalDropChance) {
        let type = 'W';
        const innerRand = Math.random();

        // Task: Increase 'W' (Weapon) drop rate significantly in Yellow/Green Tiers
        if (gameState.weaponTier === 0) {
            // 70% chance for 'W', 30% for others
            if (innerRand < 0.70) type = 'W';
            else if (innerRand < 0.77) type = 'A';
            else if (innerRand < 0.84) type = 'B';
            else if (innerRand < 0.91) type = 'H';
            else type = 'S';
        } else if (gameState.weaponTier === 1) {
            // 40% chance for 'W', 60% for others
            if (innerRand < 0.40) type = 'W';
            else if (innerRand < 0.55) type = 'A';
            else if (innerRand < 0.70) type = 'B';
            else if (innerRand < 0.85) type = 'H';
            else type = 'S';
        } else {
            // Normal distribution (Tier 2 and above)
            if (innerRand < 0.25) type = 'A';
            else if (innerRand < 0.45) type = 'B';
            else if (innerRand < 0.65) type = 'H';
            else if (innerRand < 0.85) type = 'S';
            else type = 'W';
        }

        // Small chance for 'U' (Upgrade) - Doubled base rates
        const uBaseRate = (e.type === 'medium') ? 0.04 : 0.01;
        if (Math.random() < (uBaseRate * gameState.uDropChanceModifier)) type = 'U';

        entities.powerUps.push(new PowerUp(e.x, e.y, type));
    }

    // Minion Spawn on Death
    if (e.type === 'medium') {
        const spawnChance = entities.boss ? 0.3 : 0.13; // Reduced from 0.8 / 0.2 to boss: 30% / normal: 13%
        if (Math.random() < spawnChance) {
            for (let i = 0; i < 2; i++) {
                entities.enemies.push(new Enemy(e.x + (i - 0.5) * 40, e.y, 'small', true));
            }
        }
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

        // Task 9: Allies chance to fire bomb (20% default, 30% during boss)
        const allyBoomChance = entities.boss ? 0.3 : 0.2;
        for (let i = 0; i < entities.allies.length; i++) {
            if (Math.random() < allyBoomChance) {
                entities.missiles.push(new Missile(entities.allies[i].x, entities.allies[i].y, null, true));
            }
        }
        updateUI();
    }
}

function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'b';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.floor(num);
}

function updateUI() {
    document.getElementById('score-val').innerText = formatNumber(gameState.score);
    document.getElementById('level-val').innerText = gameState.level;
    const nextBossEl = document.getElementById('next-boss-val');
    const nextBossHpEl = document.getElementById('next-boss-hp');
    const bossRewardEl = document.getElementById('boss-reward-preview');

    if (nextBossEl) {
        nextBossEl.innerText = formatNumber(gameState.nextBossScore);
    }

    if (nextBossHpEl) {
        // Predict next boss HP based on Boss class logic
        // If boss exists, show current boss HP as the target info
        if (entities.boss) {
            nextBossHpEl.innerText = `HP: ${formatNumber(entities.boss.maxHp)}`;
            if (bossRewardEl) {
                bossRewardEl.innerText = entities.boss.isSuper ? "Reward: Super Dmg & HP" : "Reward: +15% HP & Dmg";
            }
        } else {
            const nextBossIdx = gameState.bossCount;
            const isSuper = (nextBossIdx + 1) % 5 === 0;
            const scalingFactor = nextBossIdx >= 1 ? 25000 : 12000;
            const baseHp = 8000 + (nextBossIdx * scalingFactor);
            let predictedHp = baseHp + (gameState.accumulatedBossHp || 0);
            if (isSuper) predictedHp *= 4.5;
            if (nextBossIdx >= 1) predictedHp *= 1.15;

            nextBossHpEl.innerText = `HP: ${formatNumber(predictedHp)}`;
            if (bossRewardEl) {
                bossRewardEl.innerText = isSuper ? "Reward: Super HP & Dmg Boost" : "Reward: +15% HP & Dmg";
            }
        }
    }

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
        hpText.innerText = `${formatNumber(player.hp)}/${formatNumber(player.maxHp)}`;
    }

    if (gameState.level > bestLevel) {
        bestLevel = gameState.level;
        localStorage.setItem('space_shooter_best_level', bestLevel);
    }
    if (gameState.score > bestScore) {
        bestScore = gameState.score;
        localStorage.setItem('space_shooter_best_score', bestScore);
    }

    // Update Mini Stats
    const gameStats = player.getStats();
    const elSpeed = document.getElementById('mini-speed');
    const elDamage = document.getElementById('mini-damage');
    const elDef = document.getElementById('mini-def');
    const elAlly = document.getElementById('mini-ally');

    if (elSpeed) elSpeed.innerText = gameStats.shotsPerSec + '/s';
    if (elDamage) elDamage.innerText = formatNumber(gameStats.finalDmg);
    if (elDef) elDef.innerText = gameStats.protection + '%';
    if (elAlly) elAlly.innerText = gameStats.allyDamagePercent + '%';
}

function gameOver() {
    gameState.isGameOver = true;
    clearSave(); // Remove session when dead
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
        // Update Stats before showing the screen
        const stats = player.getStats();

        document.getElementById('stat-speed').innerText = stats.shotsPerSec + '/s';
        document.getElementById('stat-damage').innerText = stats.damageMultiplier + 'x';
        document.getElementById('stat-ally').innerText = stats.allyDamagePercent + '%';
        document.getElementById('stat-def').innerText = stats.protection + '%';
        document.getElementById('stat-enemy-dmg').innerText = formatNumber(Math.floor(10 * Math.pow(1.6, gameState.level - 1)));
        document.getElementById('stat-rays').innerText = stats.rays;

        // Populate Passive List
        const passiveList = document.getElementById('passive-list');
        if (passiveList) {
            passiveList.innerHTML = '';
            const perks = [];

            if (gameState.level > 1) perks.push({ text: `Lvl ${gameState.level}`, detail: `+${Math.round((gameState.level - 1) * 10)}% Spd`, color: 'bg-slate-700' });
            if (gameState.weaponTier === 1) perks.push({ text: 'Green Tier', detail: '3.0x Power', color: 'bg-emerald-600' });
            if (gameState.weaponTier === 2) perks.push({ text: 'Blue Tier', detail: '4.0x Power', color: 'bg-blue-600' });
            if (entities.allies.length > 2) perks.push({ text: 'Ally Shield', detail: '-10% Damage', color: 'bg-cyan-600' });
            if (entities.allies.length === 6) perks.push({ text: 'Guardian', detail: '-20% Damage', color: 'bg-indigo-600' });
            if (gameState.bossCount > 0) perks.push({ text: `Boss Slayer`, detail: `+${gameState.bossCount * 15}% HP`, color: 'bg-red-600' });
            if (player.damageReductionTimer > 0) perks.push({ text: 'Shielding', detail: '-30% Damage', color: 'bg-blue-400' });
            if (player.permDamageReduction > 0) perks.push({ text: 'Eternal Shield', detail: `-${Math.round(player.permDamageReduction * 100)}% DMG`, color: 'bg-amber-600' });

            perks.forEach(p => {
                const badge = document.createElement('div');
                badge.className = `${p.color} text-[8px] px-2 py-1 rounded-lg text-white font-bold flex flex-col items-center min-w-[60px]`;
                badge.innerHTML = `<span>${p.text}</span><span class="opacity-70 text-[6px] font-normal leading-tight">${p.detail}</span>`;
                passiveList.appendChild(badge);
            });
        }

        screen.classList.remove('hidden');
        screen.classList.add('flex');
    } else {
        screen.classList.remove('flex');
        screen.classList.add('hidden');
        // Force layout reset on resume to catch any mobile viewport shifts
        window.scrollTo(0, 0);
        const container = document.getElementById('canvas-container');
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }
    }
}

/**
 * MAIN LOOP
 */
let spawnTimer = 0;

let saveTimer = 0;
function update(dt) {
    if (gameState.isGameOver) return;

    // Periodic Save (Every 2 seconds)
    saveTimer += dt;
    if (saveTimer > 2000) {
        saveGame();
        saveTimer = 0;
    }

    // Update Difficulty Scaling
    gameState.difficulty = 1 + (gameState.score / 6000);
    gameState.level = Math.floor(gameState.difficulty);

    // Level Up: Increase Max HP
    if (gameState.level > gameState.lastLevel) {
        player.maxHp += 400; // Increased scaling
        player.hp = Math.min(player.maxHp, player.hp + 500); // Increased heal

        // Task: Sync allies with player growth
        entities.allies.forEach(ally => {
            ally.maxHp += 200; // Allies get 50% of player growth
            ally.hp = Math.min(ally.maxHp, ally.hp + 250);
        });

        gameState.lastLevel = gameState.level;
        playSound('levelUp');
        updateUI();
    }

    const timeFactor = dt / 16.6;
    gameState.bgY += 1.2 * timeFactor;

    // Safety modulo to keep precision high on long play sessions
    if (gameState.bgY > 100000) gameState.bgY %= 50000;

    if (gameState.shake > 0) gameState.shake *= Math.pow(0.88, timeFactor);

    // Buff Streak / Luck Fatigue Timer
    if (gameState.streakTimer > 0) {
        gameState.streakTimer -= dt;
        if (gameState.streakTimer <= 0) {
            if (gameState.streakPenaltyType === 1) {
                // Done with 80% penalty, move to 50% penalty for 5s
                gameState.streakPenaltyType = 2;
                gameState.streakTimer = 5000;
            } else {
                // Done with all penalties
                gameState.streakPenaltyType = 0;
                gameState.buffStreak = 0;
            }
        }
    }

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
    let spawnBase = 2500;
    if (gameState.score >= 150) spawnBase = 1800;

    // Task: Dynamic mob limits
    // Normal mode: Random cap 3-6 | Boss fight: Max 2 Medium units during boss
    let mobCap = gameState.isBossFight ? 2 : (3 + (Math.floor(gameState.score / 800) % 4));

    if (spawnTimer > Math.max(500, spawnBase - gameState.score / 20)) {
        if (entities.enemies.length < mobCap) {
            if (gameState.isBossFight) {
                // Occasional medium minion reinforcement during boss
                if (Math.random() < 0.4) {
                    const x = 50 + Math.random() * (canvas.width - 100);
                    entities.enemies.push(new Enemy(x, -50, 'medium'));
                }
            } else if (Math.random() < 0.85) {
                spawnEnemy();
            }
        }
        spawnTimer = 0;
    }

    if (!gameState.isBossFight && gameState.score >= gameState.nextBossScore) {
        gameState.isBossFight = true;

        // Task 3: Boss fight start buffs (Increased to 4s)
        player.immunityTimer = 4000;
        player.hasteTimer = 4000;
        // Fire 5 bombs rapid fire (no cooldown)
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                gameState.boomCharges = 1;
                fireMissile();
            }, i * 60);
        }

        // Buff Boss: 1 Shield + 2 Allies (if < 5)
        player.shield = Math.max(player.shield, 150 + player.maxHp * 0.1);
        const addAllies = 2;
        for (let i = 0; i < addAllies; i++) {
            if (entities.allies.length < 5) {
                entities.allies.push(new Ally(player, entities.allies.length));
            }
        }

        // Task: Spawn 3 + Level medium minions along with boss (Limited to 5-6)
        const minionCount = Math.min(6, 3 + gameState.level);
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
                data = { dmg: 0, count: 0, x: hitEntity.x, y: hitEntity.y, allyDmg: 0 };
                frameHits.set(hitEntity, data);
            }

            let currentDmg = b.damage;
            if (hitEntity === entities.boss) {
                // Task: Boss Resistance (20% from allies, 80% from player)
                currentDmg = b.isAlly ? b.damage * 0.2 : b.damage * 0.8;
            }

            data.dmg += currentDmg;
            data.count++;
            entities.bullets.splice(bi, 1);
        }
    }

    // Process Accumulated Damage
    for (const [entity, data] of frameHits) {
        let finalDmg = data.dmg;
        // Task: 10% Crit chance instead of hit count based crit
        let isCrit = Math.random() < 0.1;
        if (isCrit) finalDmg *= 1.45;

        if (entity.takeDamage) entity.takeDamage(finalDmg, false); // Default isAlly=false as we applied mult above
        else entity.hp -= finalDmg;

        entities.damageNumbers.push(new DamageNumber(data.x, data.y - 20, finalDmg, isCrit));

        if (entity.hp <= 0) {
            if (entity === entities.boss) {
                const isSuper = entities.boss.isSuper;
                createExplosion(entities.boss.x, entities.boss.y, true);
                gameState.score += 6000; // Increase score significantly to trigger an immediate level up
                gameState.bossCount++;
                // Save boss HP for next boss stacking
                gameState.accumulatedBossHp += entities.boss.maxHp;
                // Boss points scaling: Increase more aggressively after each boss
                gameState.nextBossScore = gameState.score + 4000 + (gameState.bossCount * 2500);

                // Drop system: Minimum 2 buffs, potentially more if lucky (Doubled)
                let numDrops = isSuper ? 6 : (Math.floor(Math.random() * 5) + 2); // Super Boss drops even more

                // Luck Fatigue penalty for boss drops too
                if (gameState.streakPenaltyType === 1) numDrops = Math.max(1, Math.floor(numDrops * 0.2));
                else if (gameState.streakPenaltyType === 2) numDrops = Math.max(1, Math.floor(numDrops * 0.5));

                const dropTypes = ['W', 'H', 'A', 'B', 'S'];
                let uChance = (isSuper ? 0.60 : 0.08) * gameState.uDropChanceModifier; // Doubled U chance for bosses

                for (let i = 0; i < numDrops; i++) {
                    // Force 'W' more often in Yellow Tier for bosses
                    let type;
                    if (Math.random() < uChance) {
                        type = 'U';
                    } else if (gameState.weaponTier === 0 && Math.random() < 0.6) {
                        type = 'W'; // 60% of non-U drops are W in Yellow Tier
                    } else if (gameState.weaponTier === 1 && Math.random() < 0.35) {
                        type = 'W'; // 35% of non-U drops are W in Green Tier
                    } else {
                        type = dropTypes[Math.floor(Math.random() * dropTypes.length)];
                    }
                    entities.powerUps.push(new PowerUp(entities.boss.x + (i - (numDrops - 1) / 2) * 40, entities.boss.y, type));
                }

                // Boss death spawns minions (Limit based on level breakpoints: 1,3,5,7,9, Max 5)
                const deadBossMinions = Math.min(5, 1 + Math.floor(gameState.bossCount / 2));
                for (let i = 0; i < deadBossMinions; i++) {
                    entities.enemies.push(new Enemy(entities.boss.x + (i - (deadBossMinions - 1) / 2) * 80, entities.boss.y + 50, 'medium', true));
                }

                // NEW: Excitement Buff (Double fire rate for 2s)
                player.hasteTimer = 2000;
                playSound('levelUp'); // Use levelUp sound for excitement feedback

                gameState.isBossFight = false;

                // Task 4 & 5: Post-boss rewards
                // Permanent HP increase (15% of defeated boss's max HP)
                const hpBonus = entities.boss.maxHp * 0.15;
                player.maxHp += hpBonus;
                player.hp = Math.min(player.maxHp, player.hp + hpBonus);

                // Damage bonus scaling (Increased from 8% to 15% per boss, max 1.5)
                player.bossKillDamageBonus = Math.min(1.5, player.bossKillDamageBonus + 0.15);

                // Ally damage ratio scaling (+12% of player damage, max 1.0 ratio)
                player.allyDamageRatio = Math.min(1.0, player.allyDamageRatio + 0.12);

                // Flat 25% damage multiplier upgrade for each boss win
                player.damageMultiplier += 0.25;

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

        // Task 2: Hitbox reduced 30% (22 -> 15.4, 15.4^2 = 237)
        if (distSq < 237) {
            if (eb.isDebuff || eb.isBossSpeedDebuff) {
                // Task 3: 2s immunity at boss start
                if (player.immunityTimer <= 0) {
                    player.slowTimer = 2000; // 2s movement slow (30%)
                    if (eb.damage > 0) player.takeDamage(eb.damage);
                }
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

        // Task 2: Hitachi hitbox reduced 30% (35 -> 24.5, 24.5^2 = 600)
        if (dx * dx + dy * dy < 600) {
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

            // Luck Fatigue System: 3 buffs trigger reduction
            gameState.buffStreak++;
            if (gameState.buffStreak >= 3) {
                gameState.streakTimer = 5000; // Start first 5s penalty
                gameState.streakPenaltyType = 1; // 80% reduction
            }

            if (p.type === 'W') {
                player.level += 0.5;
                player.damageMultiplier *= 1.12; // Increased from 1.05 (Upgrade damage by 12% for each bullet upgrade buff)

                // Task: Ensure transition from 5 rays (level 2.0) to 3 rays (level 1.0) of next tier
                let count = Math.floor(player.level * 2 + 1);
                if (count > 5 && gameState.weaponTier < 2) {
                    gameState.weaponTier++;
                    player.level = 1; // Start with 3 bullets of new tier
                    while (entities.allies.length < 3) {
                        entities.allies.push(new Ally(player, entities.allies.length));
                    }
                }
            } else if (p.type === 'H') {
                // Task 1: Increase max HP by 12% and heal
                player.maxHp *= 1.12;
                // Scaling: 400 + 15% of max HP
                const healAmt = 400 + player.maxHp * 0.15;
                player.hp = Math.min(player.maxHp, player.hp + healAmt);
                for (let ai = 0; ai < entities.allies.length; ai++) {
                    // Task: Increase Ally heal logic (80% of healAmt)
                    entities.allies[ai].hp = Math.min(entities.allies[ai].maxHp, entities.allies[ai].hp + healAmt * 0.8);
                }
            } else if (p.type === 'A') {
                if (entities.allies.length < 6) {
                    entities.allies.push(new Ally(player, entities.allies.length));
                } else {
                    // Task: If already 6 allies, upgrade all allies HP by 15%
                    entities.allies.forEach(ally => {
                        ally.maxHp *= 1.15;
                        ally.hp *= 1.15;
                    });
                    // Also heal a bit more
                    for (let ai = 0; ai < entities.allies.length; ai++) {
                        entities.allies[ai].hp = Math.min(entities.allies[ai].maxHp, entities.allies[ai].hp + 500);
                    }
                }
            } else if (p.type === 'B') {
                gameState.boomChargeSpeed = Math.max(1500, gameState.boomChargeSpeed - 600);
                if (gameState.maxMissileBounces < 4) {
                    gameState.maxMissileBounces++;
                } else {
                    gameState.boomDamageMultiplier += 0.2; // +20% damage if already at max bounces
                }
            } else if (p.type === 'U') {
                // Decay 'U' (Weapon Upgrade) drop rate
                gameState.uDropChanceModifier = Math.max(0.005, gameState.uDropChanceModifier * 0.4);

                if (gameState.weaponTier < 2) {
                    gameState.weaponTier++;
                    // Task: Upgrade tier while preserving/improving rays
                    // 1 yellow (lvl 0) -> 3 green (lvl 1.0) | 4 yellow (lvl 1.5) -> 4 green (lvl 1.5)
                    player.level = Math.max(1.0, player.level);
                    while (entities.allies.length < 3) {
                        entities.allies.push(new Ally(player, entities.allies.length));
                    }
                } else if (player.level < 2) {
                    player.level = 2; // Jump to max rays for current tier
                } else {
                    // Already at max weapon tier and max rays: increase damage instead
                    player.damageMultiplier += 0.4; // Previously increased from 0.15
                }
            } else if (p.type === 'S') {
                // Task 6: Shield buff 2.5s resistance + 25% HP power
                player.shield = 400 + player.maxHp * 0.25;
                player.damageReductionTimer = 2500; // 2.5s resistance

                // NEW: Permanent 5% Damage Reduction (Max 50%)
                if (player.permDamageReduction < 0.5) {
                    player.permDamageReduction = Math.min(0.5, player.permDamageReduction + 0.05);
                }
                playSound('powerup');
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
        ctx.globalAlpha = 0.7; // Reduce background brightness by 30%

        const iy = Math.floor(y);
        const idx = Math.floor(dX);
        const idw = Math.floor(dW);
        const idh = Math.floor(dH);

        ctx.drawImage(img, idx, iy, idw, idh);
        ctx.drawImage(img, idx, iy - idh, idw, idh);
        ctx.globalAlpha = 1.0;
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

        console.log(`Asset loaded: ${loaded}/${totalImages}`);
        if (loadingBar) {
            loadingBar.style.width = (loaded / totalImages * 100) + '%';
        }
        if (loaded === totalImages) {
            console.log("All assets loaded. Initializing...");
            setTimeout(() => {
                if (loadingContainer) loadingContainer.classList.add('hidden');
                init();
            }, 500);
        }
    };

    for (const key in ASSETS) {
        const img = new Image();
        img.crossOrigin = "anonymous"; // Fix potential canvas tainting
        img.src = ASSETS[key];
        img.onload = checkComplete;
        img.onerror = (e) => {
            console.error("Failed to load: " + key, ASSETS[key]);
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
            // Use visualViewport if available for more stability on mobile browsers with dynamic bars
            const w = window.visualViewport ? window.visualViewport.width : window.innerWidth;
            const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;

            // On mobile, explicitly set body height to prevent jumpy layout with dvh
            if (gameState.isMobile) {
                document.body.style.height = h + 'px';
                container.style.height = h + 'px';
            }

            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;

            // Always scroll to top on resize to prevent browser-level shifts
            window.scrollTo(0, 0);
        }
    };
    window.addEventListener('resize', resize);
    window.addEventListener('focus', () => {
        window.scrollTo(0, 0);
        resize();
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize);
        window.visualViewport.addEventListener('scroll', () => window.scrollTo(0, 0));
    }
    resize();

    // Start Button Logic (New Game)
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            clearSave(); // Start fresh
            initAudio();
            gameState.isStarted = true;
            document.getElementById('start-screen').classList.add('hidden');
            window.scrollTo(0, 0);
            resize();
        });
    }

    // Continue Button Logic
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            if (loadGame()) {
                initAudio();
                gameState.isStarted = true;
                document.getElementById('start-screen').classList.add('hidden');
                window.scrollTo(0, 0);
                resize();
            }
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

    // Restart Button Logic (Game Over)
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            // First scroll to top and force layout reset before reloading
            window.scrollTo(0, 0);
            setTimeout(() => {
                location.reload();
            }, 50);
        });
    }

    // Settings Functionality
    const bgmRange = document.getElementById('bgm-range');
    if (bgmRange) {
        bgmRange.value = gameState.bgmVolume * 100;
        bgmRange.addEventListener('input', (e) => {
            gameState.bgmVolume = e.target.value / 100;
            localStorage.setItem('space_shooter_bgm_volume', gameState.bgmVolume);
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
        // Apply saved settings visual state
        if (gameState.graphicsQuality === 'low') {
            lowBtn.classList.replace('bg-white/5', 'bg-amber-400');
            lowBtn.classList.replace('text-white', 'text-slate-950');
            highBtn.classList.replace('bg-amber-400', 'bg-white/5');
            highBtn.classList.replace('text-slate-950', 'text-white');
        }

        highBtn.addEventListener('click', () => {
            gameState.graphicsQuality = 'high';
            localStorage.setItem('space_shooter_graphics', 'high');
            highBtn.classList.replace('bg-white/5', 'bg-amber-400');
            highBtn.classList.replace('text-white', 'text-slate-950');
            lowBtn.classList.replace('bg-amber-400', 'bg-white/5');
            lowBtn.classList.replace('text-slate-950', 'text-white');
        });
        lowBtn.addEventListener('click', () => {
            gameState.graphicsQuality = 'low';
            localStorage.setItem('space_shooter_graphics', 'low');
            lowBtn.classList.replace('bg-white/5', 'bg-amber-400');
            lowBtn.classList.replace('text-white', 'text-slate-950');
            highBtn.classList.replace('bg-amber-400', 'bg-white/5');
            highBtn.classList.replace('text-slate-950', 'text-white');
        });
    }

    // Language Tab Logic
    const langVi = document.getElementById('lang-vi');
    const langEn = document.getElementById('lang-en');
    if (langVi && langEn) {
        const updateLangButtons = () => {
            if (gameState.language === 'en') {
                langEn.classList.replace('bg-white/5', 'bg-amber-400');
                langEn.classList.replace('text-white', 'text-slate-950');
                langEn.classList.add('font-black');
                langVi.classList.replace('bg-amber-400', 'bg-white/5');
                langVi.classList.replace('text-slate-950', 'text-white');
                langVi.classList.remove('font-black');
            } else {
                langVi.classList.replace('bg-white/5', 'bg-amber-400');
                langVi.classList.replace('text-white', 'text-slate-950');
                langVi.classList.add('font-black');
                langEn.classList.replace('bg-amber-400', 'bg-white/5');
                langEn.classList.replace('text-slate-950', 'text-white');
                langEn.classList.remove('font-black');
            }
        };

        updateLangButtons();

        langVi.addEventListener('click', () => {
            gameState.language = 'vn';
            localStorage.setItem('game_lang', 'vn');
            applyLanguage();
            updateLangButtons();
        });
        langEn.addEventListener('click', () => {
            gameState.language = 'en';
            localStorage.setItem('game_lang', 'en');
            applyLanguage();
            updateLangButtons();
        });
    }

    // Reset Data Logic
    const resetBtn = document.getElementById('reset-data-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("Xác nhận xóa toàn bộ dữ liệu? / Reset all data?")) {
                localStorage.clear();
                location.reload();
            }
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
            // If game not started, space starts it
            if (!gameState.isStarted) {
                const startBtn = document.getElementById('start-btn');
                if (startBtn) startBtn.click();
            } else {
                togglePause();
            }
        }
    });

    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        togglePause();
    });
}

/**
 * PERSISTENCE
 */
function saveGame() {
    if (!gameState.isStarted || gameState.isGameOver) return;

    const saveData = {
        gameState: {
            score: gameState.score,
            level: gameState.level,
            weaponTier: gameState.weaponTier,
            nextBossScore: gameState.nextBossScore,
            bossCount: gameState.bossCount,
            accumulatedBossHp: gameState.accumulatedBossHp,
            lastLevel: gameState.lastLevel
        },
        player: {
            hp: player.hp,
            maxHp: player.maxHp,
            level: player.level,
            damageMultiplier: player.damageMultiplier,
            bossKillDamageBonus: player.bossKillDamageBonus,
            permDamageReduction: player.permDamageReduction
        },
        allyCount: entities.allies.length
    };
    localStorage.setItem('space_shooter_save_game', JSON.stringify(saveData));
}

function loadGame() {
    const raw = localStorage.getItem('space_shooter_save_game');
    if (!raw) return false;

    try {
        const data = JSON.parse(raw);

        // Restore Game State
        Object.assign(gameState, data.gameState);

        // Restore Player
        player.hp = data.player.hp;
        player.maxHp = data.player.maxHp;
        player.level = data.player.level;
        player.damageMultiplier = data.player.damageMultiplier;
        player.bossKillDamageBonus = data.player.bossKillDamageBonus;
        player.permDamageReduction = data.player.permDamageReduction || 0;

        // Restore Allies
        entities.allies = [];
        for (let i = 0; i < (data.allyCount || 0); i++) {
            entities.allies.push(new Ally(player, i));
        }

        updateUI();
        return true;
    } catch (e) {
        console.error("Failed to load game", e);
        return false;
    }
}

function clearSave() {
    localStorage.removeItem('space_shooter_save_game');
}

function init() {
    setupEventListeners();
    applyLanguage();
    prerender(); // CPU-to-GPU Offloading: Generate textures once
    updateUI(); // Fix initial HP display

    // Check for saved session
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
        if (localStorage.getItem('space_shooter_save_game')) {
            continueBtn.classList.remove('hidden');
        } else {
            continueBtn.classList.add('hidden');
        }
    }

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
