function main() {

    /* =========================================================
       CANVAS & WEBGL SETUP
    ========================================================= */

    var CANVAS = document.getElementById("mycanvas");
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;

    var GL = CANVAS.getContext("webgl", { antialias: true });
    if (!GL) { alert("WebGL tidak didukung."); return; }


    /* =========================================================
       COURT CONFIGURATIONS & THEMES
    ========================================================= */

    var COURT_THEMES = {
        cyber: { 
            name: "CYBER NEON ALLEY", 
            floor: [0.08, 0.09, 0.16],     // Aspal basah
            lines: [1.00, 0.00, 0.55],     // Hot Pink / Magenta Neon
            clear: [0.01, 0.02, 0.06], 
            skyColor: [0.05, 0.12, 0.28], 
            particle: [1.0, 0.0, 0.65], 
            flashColor: [1.0, 0.0, 0.8], 
            hasWind: false 
        },
        beach: { 
            name: "SUNSET BEACH", 
            floor: [0.85, 0.65, 0.35],     // Pasir hangat
            lines: [0.98, 0.98, 0.95],     // Garis putih
            clear: [0.12, 0.25, 0.45], 
            skyColor: [0.95, 0.45, 0.20],  // Langit oranye sunset
            particle: [1.0, 0.8, 0.3], 
            flashColor: [1.0, 0.6, 0.0], 
            hasWind: true 
        },
        indoor: { 
            name: "STADIUM ARENA", 
            floor: [0.85, 0.45, 0.10],    // Parquet kayu
            lines: [0.95, 0.95, 0.20],    // Garis kuning
            clear: [0.05, 0.08, 0.15], 
            skyColor: [0.10, 0.15, 0.30], 
            particle: [1.0, 0.8, 0.4], 
            flashColor: [1.0, 0.5, 0.1], 
            hasWind: false 
        }
    };

    var currentCourtKey = "cyber";

    var BALL_SKINS = {
        cyber:    { ballColor: [0.00, 0.85, 0.95], seamColor: [1.0, 0.0, 0.6] },
        classic:  { ballColor: [0.88, 0.40, 0.05], seamColor: [0.1, 0.1, 0.1] },
        gold:     { ballColor: [1.00, 0.82, 0.10], seamColor: [0.2, 0.15, 0.0] },
        moneyball:{ ballColor: [1.00, 0.00, 0.55], seamColor: [0.0, 0.9, 1.0] }
    };

    var currentBallSkinKey = "cyber";

    var SHOOTING_SPOTS = {
        freethrow:  { name: "Free Throw",    x: 0.0,  z: 1.0, distLabel: "4.50 m (Free Throw)" },
        leftcorner: { name: "Left Corner",   x: -5.2, z: 0.5, distLabel: "6.75 m (Left Corner)" },
        leftwing:   { name: "Left Wing",     x: -3.8, z: 3.2, distLabel: "6.75 m (Left Wing)" },
        center:     { name: "Top of Key",    x: 0.0,  z: 5.2, distLabel: "6.75 m (Top of Key)" },
        rightwing:  { name: "Right Wing",    x: 3.8,  z: 3.2, distLabel: "6.75 m (Right Wing)" },
        rightcorner:{ name: "Right Corner",  x: 5.2,  z: 0.5, distLabel: "6.75 m (Right Corner)" }
    };

    var contestSpotOrder = ["leftcorner", "leftwing", "center", "rightwing", "rightcorner"];
    var contestCurrentSpotIdx = 0;
    var contestBallInSpot = 0;
    var chosenMoneyRackIdx = 2;

    var currentSpotKey = "center";


    /* =========================================================
       GAMEPLAY TIMER, MODE, WIND, SCORE & STATS
    ========================================================= */

    var score = 0;
    var streakCount = 0;
    var bestStreak = 0;
    var totalShots = 0;
    var successfulShots = 0;
    var highScore = parseInt(localStorage.getItem("3d_bb_high_score") || "0");

    var selectedGameMode = "timeattack";
    var selectedTimeLimit = 60;
    var gameTimeLeft = 60;
    var isPaused = false;
    var windForce = { x: 0.0, z: 0.0 };

    var dynamicHoopX = 0.0;
    var hoopMoveDir = 1;
    var hoopBaseSpeed = 0.65;

    var rimFlashTimer = 0.0;
    var backboardFlashTimer = 0.0;

    function updateHighScoreDisplay() {
        var hsEl = document.getElementById("highScoreVal");
        if (hsEl) hsEl.textContent = highScore;
    }

    function generateNewWind() {
        var windEl = document.getElementById("windVal");
        if (COURT_THEMES[currentCourtKey].hasWind) {
            windForce.x = (Math.random() - 0.5) * 3.5;
            windForce.z = (Math.random() - 0.5) * 2.0;
            var windSpeed = Math.sqrt(windForce.x * windForce.x + windForce.z * windForce.z);
            var dir = windForce.x > 0 ? "→ " : "← ";
            if (windEl) windEl.textContent = dir + windSpeed.toFixed(1) + " m/s";
        } else {
            windForce.x = 0.0;
            windForce.z = 0.0;
            if (windEl) windEl.textContent = "0.0 m/s";
        }
    }


    /* =========================================================
       SHADERS
    ========================================================= */

    var shader_vertex_source = `
        attribute vec3 position;
        attribute vec3 color;
        uniform mat4 Pmatrix, Vmatrix, Mmatrix;
        varying vec3 vColor;
        void main(void) {
            gl_Position = Pmatrix * Vmatrix * Mmatrix * vec4(position, 1.0);
            vColor = color;
        }
    `;

    var shader_fragment_source = `
        precision mediump float;
        varying vec3 vColor;
        void main(void) { gl_FragColor = vec4(vColor, 1.0); }
    `;

    function compile_shader(source, type) {
        var s = GL.createShader(type);
        GL.shaderSource(s, source);
        GL.compileShader(s);
        return s;
    }

    var SHADER_PROGRAM = GL.createProgram();
    GL.attachShader(SHADER_PROGRAM, compile_shader(shader_vertex_source, GL.VERTEX_SHADER));
    GL.attachShader(SHADER_PROGRAM, compile_shader(shader_fragment_source, GL.FRAGMENT_SHADER));
    GL.linkProgram(SHADER_PROGRAM);
    GL.useProgram(SHADER_PROGRAM);

    var _Pmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Pmatrix");
    var _Vmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Vmatrix");
    var _Mmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Mmatrix");
    var _position = GL.getAttribLocation(SHADER_PROGRAM, "position");
    var _color = GL.getAttribLocation(SHADER_PROGRAM, "color");

    GL.enableVertexAttribArray(_position);
    GL.enableVertexAttribArray(_color);


    /* =========================================================
       3D GEOMETRY GENERATORS
    ========================================================= */

    function createSphere(radius, latBands, longBands, color) {
        var vertices = [], faces = [];
        for (var lat = 0; lat <= latBands; lat++) {
            var theta = lat * Math.PI / latBands;
            var sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
            for (var lon = 0; lon <= longBands; lon++) {
                var phi = lon * 2 * Math.PI / longBands;
                var x = Math.cos(phi) * sinTheta * radius;
                var y = cosTheta * radius;
                var z = Math.sin(phi) * sinTheta * radius;
                vertices.push(x, y, z, color[0], color[1], color[2]);
            }
        }
        for (var lat = 0; lat < latBands; lat++) {
            for (var lon = 0; lon < longBands; lon++) {
                var first = lat * (longBands + 1) + lon;
                var second = first + longBands + 1;
                faces.push(first, second, first + 1, second, second + 1, first + 1);
            }
        }
        return { vertices: vertices, faces: faces };
    }

    function createTricolorSphere(radius, latBands, longBands) {
        var vertices = [], faces = [];
        for (var lat = 0; lat <= latBands; lat++) {
            var theta = lat * Math.PI / latBands;
            var sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
            for (var lon = 0; lon <= longBands; lon++) {
                var phi = lon * 2 * Math.PI / longBands;
                var x = Math.cos(phi) * sinTheta * radius;
                var y = cosTheta * radius;
                var z = Math.sin(phi) * sinTheta * radius;

                var col = [0.0, 0.85, 0.95];
                if (y > radius * 0.25) {
                    col = [1.0, 0.0, 0.55];
                } else if (y < -radius * 0.25) {
                    col = [0.1, 0.1, 0.2];
                }

                vertices.push(x, y, z, col[0], col[1], col[2]);
            }
        }
        for (var lat = 0; lat < latBands; lat++) {
            for (var lon = 0; lon < longBands; lon++) {
                var first = lat * (longBands + 1) + lon;
                var second = first + longBands + 1;
                faces.push(first, second, first + 1, second, second + 1, first + 1);
            }
        }
        return { vertices: vertices, faces: faces };
    }

    function createCylinder(radiusTop, radiusBottom, height, segments, color) {
        var vertices = [], faces = [];
        for (var i = 0; i <= segments; i++) {
            var angle = i * 2 * Math.PI / segments;
            var c = Math.cos(angle), s = Math.sin(angle);
            vertices.push(radiusBottom * c, -height / 2, radiusBottom * s, color[0], color[1], color[2]);
            vertices.push(radiusTop * c, height / 2, radiusTop * s, color[0], color[1], color[2]);
        }
        for (var i = 0; i < segments; i++) {
            var b1 = i * 2, t1 = i * 2 + 1, b2 = (i + 1) * 2, t2 = (i + 1) * 2 + 1;
            faces.push(b1, b2, t1, t1, b2, t2);
        }
        return { vertices: vertices, faces: faces };
    }

    function createBox(width, height, depth, color) {
        var x = width / 2, y = height / 2, z = depth / 2;
        var vertices = [
            -x,-y,-z, color[0],color[1],color[2],  x,-y,-z, color[0],color[1],color[2],
             x, y,-z, color[0],color[1],color[2], -x, y,-z, color[0],color[1],color[2],
            -x,-y, z, color[0],color[1],color[2],  x,-y, z, color[0],color[1],color[2],
             x, y, z, color[0],color[1],color[2], -x, y, z, color[0],color[1],color[2]
        ];
        var faces = [
            0,1,2, 0,2,3, 4,5,6, 4,6,7, 0,3,7, 0,7,4, 1,2,6, 1,6,5, 3,2,6, 3,6,7, 0,1,5, 0,5,4
        ];
        return { vertices: vertices, faces: faces };
    }

    function createTorus(centerRadius, tubeRadius, radialSeg, tubularSeg, color) {
        var vertices = [], faces = [];
        for (var i = 0; i <= radialSeg; i++) {
            var u = i * 2 * Math.PI / radialSeg;
            var cu = Math.cos(u), su = Math.sin(u);
            for (var j = 0; j <= tubularSeg; j++) {
                var v = j * 2 * Math.PI / tubularSeg;
                var cv = Math.cos(v), sv = Math.sin(v);
                var x = (centerRadius + tubeRadius * cv) * cu;
                var y = tubeRadius * sv;
                var z = (centerRadius + tubeRadius * cv) * su;
                vertices.push(x, y, z, color[0], color[1], color[2]);
            }
        }
        for (var i = 0; i < radialSeg; i++) {
            for (var j = 0; j < tubularSeg; j++) {
                var a = i * (tubularSeg + 1) + j;
                var b = a + tubularSeg + 1;
                faces.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        return { vertices: vertices, faces: faces };
    }

    function createCourtLines(lineColor) {
        var vertices = [], lines = [], c = lineColor, y = -2.89;

        function addLine(x1, z1, x2, z2) {
            var idx = vertices.length / 6;
            vertices.push(x1, y, z1, c[0], c[1], c[2]);
            vertices.push(x2, y, z2, c[0], c[1], c[2]);
            lines.push(idx, idx + 1);
        }

        addLine(-6.0, -6.0,  6.0, -6.0); addLine( 6.0, -6.0,  6.0,  6.0);
        addLine( 6.0,  6.0, -6.0,  6.0); addLine(-6.0,  6.0, -6.0, -6.0);

        addLine(-2.0, -5.4, -2.0,  0.5); addLine( 2.0, -5.4,  2.0,  0.5);
        addLine(-2.0,  0.5,  2.0,  0.5);

        var segs = 20;
        for (var i = 0; i < segs; i++) {
            var a1 = (i / segs) * Math.PI, a2 = ((i + 1) / segs) * Math.PI;
            addLine(2.0 * Math.cos(a1), 0.5 + 2.0 * Math.sin(a1), 2.0 * Math.cos(a2), 0.5 + 2.0 * Math.sin(a2));
        }

        var r3 = 5.2;
        addLine(-r3, -5.4, -r3, -2.0); addLine( r3, -5.4,  r3, -2.0);
        for (var i = 0; i < segs; i++) {
            var a1 = (i / segs) * Math.PI, a2 = ((i + 1) / segs) * Math.PI;
            addLine(r3 * Math.cos(a1), -2.0 + r3 * Math.sin(a1), r3 * Math.cos(a2), -2.0 + r3 * Math.sin(a2));
        }

        return { vertices: vertices, faces: lines };
    }


    /* =========================================================
       TRAJECTORY PREVIEW GENERATOR
    ========================================================= */

    var trajectoryMesh = null;

    function buildTrajectoryMesh(startX, startY, startZ, vx, vy, vz, steps) {
        var vertices = [], faces = [];
        var dt = 0.05;
        var currX = startX, currY = startY, currZ = startZ;
        var currVx = vx, currVy = vy, currVz = vz;

        for (var i = 0; i < steps; i++) {
            var alpha = 1.0 - (i / steps);
            var color = streakCount >= 3 ? [1.0, 0.0, 0.55] : [0.0, 0.85 * alpha, 1.0 * alpha];

            vertices.push(currX, currY, currZ, color[0], color[1], color[2]);

            currX += currVx * dt;
            currY += currVy * dt;
            currZ += currVz * dt;

            currVx += windForce.x * dt;
            currVy += GRAVITY * dt;
            currVz += windForce.z * dt;

            if (i < steps - 1) {
                faces.push(i, i + 1);
            }
        }
        return createMesh({ vertices: vertices, faces: faces }, true);
    }


    /* =========================================================
       PARTICLE SYSTEM & TRAIL
    ========================================================= */

    var particles = [];
    var ballTrails = [];
    var particleCubeMesh = createMesh(createBox(0.08, 0.08, 0.08, [1, 1, 1]));
    var shadowMesh = createMesh(createCylinder(0.32, 0.32, 0.01, 20, [0.05, 0.05, 0.05]));

    function spawnParticles(px, py, pz, count, color) {
        for (var i = 0; i < count; i++) {
            particles.push({
                x: px, y: py, z: pz,
                vx: (Math.random() - 0.5) * 4.0,
                vy: Math.random() * 3.5 + 1.0,
                vz: (Math.random() - 0.5) * 4.0,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.7,
                color: color || [1.0, 0.0, 0.55]
            });
        }
    }

    function triggerFireworkExplosion(px, py, pz) {
        var fireColors = [[1.0, 0.0, 0.55], [0.0, 0.85, 0.95], [0.9, 0.1, 1.0], [1.0, 0.9, 0.0]];
        for (var i = 0; i < 60; i++) {
            var c = fireColors[Math.floor(Math.random() * fireColors.length)];
            particles.push({
                x: px, y: py, z: pz,
                vx: (Math.random() - 0.5) * 7.0,
                vy: (Math.random() - 0.2) * 6.0,
                vz: (Math.random() - 0.5) * 7.0,
                life: 0.6 + Math.random() * 0.5,
                maxLife: 1.1,
                color: c
            });
        }
    }

    function triggerConfetti() {
        var colors = [[1, 0, 0.55], [0, 0.85, 1], [0.8, 0, 1], [1, 0.9, 0]];
        for (var i = 0; i < 80; i++) {
            var randColor = colors[Math.floor(Math.random() * colors.length)];
            particles.push({
                x: (Math.random() - 0.5) * 6,
                y: Math.random() * 3 + 1,
                z: HOOP_Z + Math.random() * 2,
                vx: (Math.random() - 0.5) * 5.0,
                vy: Math.random() * 4.0 + 2.0,
                vz: (Math.random() - 0.5) * 5.0,
                life: 1.5 + Math.random() * 1.0,
                maxLife: 2.5,
                color: randColor
            });
        }
    }

    function updateAndDrawParticles(dt) {
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.vy += GRAVITY * 0.3 * dt;

            var scale = p.life / p.maxLife;
            drawPart(particleCubeMesh, p.x, p.y, p.z, scale, scale, scale, 0, 0, 0);
        }
    }

    function updateAndDrawTrail(dt) {
        if (ball.flying) {
            var isFire = streakCount >= 3 || isCurrentBallMoneyBall() || ball.isPerfectShot;
            ballTrails.push({
                x: ball.x, y: ball.y, z: ball.z,
                life: isFire ? 0.40 : 0.25,
                maxLife: isFire ? 0.40 : 0.25,
                isFire: isFire
            });

            if (isFire && Math.random() < 0.6) {
                spawnParticles(ball.x, ball.y, ball.z, 2, [1.0, 0.0, 0.55]);
            }
        }

        for (var i = ballTrails.length - 1; i >= 0; i--) {
            var t = ballTrails[i];
            t.life -= dt;
            if (t.life <= 0) {
                ballTrails.splice(i, 1);
                continue;
            }
            var scale = (t.life / t.maxLife) * (t.isFire ? 0.95 : 0.70);
            drawPart(particleCubeMesh, t.x, t.y, t.z, scale, scale, scale, 0, 0, 0);
        }
    }


    /* =========================================================
       CAMERA SHAKE & SLOW MOTION
    ========================================================= */

    var cameraShakeTime = 0.0;
    var cameraShakeIntensity = 0.0;
    var timeScale = 1.0;

    function triggerShake(intensity, duration) {
        cameraShakeIntensity = intensity;
        cameraShakeTime = duration;
    }


    /* =========================================================
       DYNAMIC NET STRUCTURE
    ========================================================= */

    var netData = { baseVertices: [], currentVertices: [], velocities: [], faces: [], ringsCount: 6, radialSegments: 16 };

    function initNetData(radiusTop, radiusBottom, height, radialSegments, ringsCount, color) {
        netData.baseVertices = []; netData.currentVertices = []; netData.velocities = []; netData.faces = [];
        netData.ringsCount = ringsCount; netData.radialSegments = radialSegments;

        for (var r = 0; r <= ringsCount; r++) {
            var progress = r / ringsCount;
            var currentRadius = radiusTop + (radiusBottom - radiusTop) * Math.pow(progress, 0.85);
            var currentY = -height * progress;

            for (var i = 0; i < radialSegments; i++) {
                var angle = i * 2 * Math.PI / radialSegments;
                var x = currentRadius * Math.cos(angle);
                var z = currentRadius * Math.sin(angle);

                netData.baseVertices.push(x, currentY, z, color[0], color[1], color[2]);
                netData.currentVertices.push(x, currentY, z, color[0], color[1], color[2]);
                netData.velocities.push(0, 0, 0);
            }
        }

        for (var r = 0; r < ringsCount; r++) {
            for (var i = 0; i < radialSegments; i++) {
                var currIdx = r * radialSegments + i;
                var nextRingRightIdx = (r + 1) * radialSegments + ((i + 1) % radialSegments);
                var nextRingLeftIdx = (r + 1) * radialSegments + ((i - 1 + radialSegments) % radialSegments);
                netData.faces.push(currIdx, nextRingRightIdx, currIdx, nextRingLeftIdx);
            }
        }
    }

    function createMesh(geometry, isDynamic) {
        var vertexBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
        GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(geometry.vertices), isDynamic ? GL.DYNAMIC_DRAW : GL.STATIC_DRAW);

        var indexBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, indexBuffer);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.faces), GL.STATIC_DRAW);

        return { vertex: vertexBuffer, index: indexBuffer, count: geometry.faces.length };
    }


    /* =========================================================
       ENVIRONMENT DECORATIONS
    ========================================================= */

    var decoMeshes = [];

    function buildEnvironmentDecorations() {
        decoMeshes = [];

        if (currentCourtKey === "cyber") {
            var buildingDark = createMesh(createBox(4.5, 18.0, 14.0, [0.04, 0.05, 0.10]));
            var windowPink   = createMesh(createBox(0.1, 0.8, 1.2, [1.0, 0.0, 0.55]));
            var windowCyan   = createMesh(createBox(0.1, 0.8, 1.2, [0.0, 0.85, 0.95]));

            decoMeshes.push(
                { mesh: buildingDark, x: -9.5, y: FLOOR_Y + 9.0, z: -1.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: buildingDark, x:  9.5, y: FLOOR_Y + 9.0, z: -1.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },

                { mesh: windowPink, x: -7.2, y: FLOOR_Y + 12.0, z: -3.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: windowCyan, x: -7.2, y: FLOOR_Y + 8.0,  z:  1.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: windowPink, x:  7.2, y: FLOOR_Y + 10.0, z: -2.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: windowCyan, x:  7.2, y: FLOOR_Y + 6.0,  z:  2.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 }
            );
        } else if (currentCourtKey === "beach") {
            var oceanMesh = createMesh(createBox(40.0, 0.1, 15.0, [0.0, 0.4, 0.75]));
            var waveMesh  = createMesh(createBox(38.0, 0.12, 1.2, [0.8, 0.95, 1.0]));

            var trunkMesh = createMesh(createCylinder(0.2, 0.35, 5.0, 10, [0.45, 0.28, 0.12]));
            var leafMesh  = createMesh(createBox(2.4, 0.1, 0.6, [0.15, 0.75, 0.25]));

            var surfMesh  = createMesh(createBox(0.4, 2.2, 0.1, [1.0, 0.2, 0.3]));

            decoMeshes.push(
                { mesh: oceanMesh, x: 0, y: FLOOR_Y - 0.05, z: -14.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: waveMesh,  x: 0, y: FLOOR_Y - 0.02, z: -7.5,  rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },

                { mesh: trunkMesh, x: -9.0, y: FLOOR_Y + 2.5, z: -2.0, rx: 0, ry: 0, rz: 0.15, sx: 1, sy: 1, sz: 1 },
                { mesh: leafMesh,  x: -9.5, y: FLOOR_Y + 5.0, z: -2.0, rx: 0.2, ry: 0.5, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: trunkMesh, x:  9.0, y: FLOOR_Y + 2.5, z: -1.0, rx: 0, ry: 0, rz: -0.12, sx: 1, sy: 1, sz: 1 },
                { mesh: leafMesh,  x:  9.4, y: FLOOR_Y + 5.0, z: -1.0, rx: -0.2, ry: 0.8, rz: 0, sx: 1, sy: 1, sz: 1 },

                { mesh: surfMesh,  x: -7.0, y: FLOOR_Y + 0.8, z: -3.0, rx: 0.2, ry: 0.3, rz: -0.1, sx: 1, sy: 1, sz: 1 }
            );
        } else if (currentCourtKey === "indoor") {
            var benchStep1 = createMesh(createBox(16.0, 0.6, 1.2, [0.3, 0.32, 0.38]));
            var benchStep2 = createMesh(createBox(16.0, 1.2, 1.2, [0.25, 0.27, 0.32]));
            var benchStep3 = createMesh(createBox(16.0, 1.8, 1.2, [0.2, 0.22, 0.26]));

            var spectatorBody = createMesh(createBox(0.4, 0.6, 0.4, [0.8, 0.2, 0.2]));
            var spectatorHead = createMesh(createSphere(0.2, 10, 10, [0.95, 0.75, 0.6]));

            var adBoard = createMesh(createBox(5.0, 1.2, 0.2, [0.9, 0.1, 0.2]));

            decoMeshes.push(
                { mesh: benchStep1, x: -9.0, y: FLOOR_Y + 0.3, z: -1.0, rx: 0, ry: Math.PI / 2, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: benchStep2, x: -10.2, y: FLOOR_Y + 0.6, z: -1.0, rx: 0, ry: Math.PI / 2, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: benchStep3, x: -11.4, y: FLOOR_Y + 0.9, z: -1.0, rx: 0, ry: Math.PI / 2, rz: 0, sx: 1, sy: 1, sz: 1 },

                { mesh: benchStep1, x: 9.0, y: FLOOR_Y + 0.3, z: -1.0, rx: 0, ry: Math.PI / 2, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: benchStep2, x: 10.2, y: FLOOR_Y + 0.6, z: -1.0, rx: 0, ry: Math.PI / 2, rz: 0, sx: 1, sy: 1, sz: 1 },

                { mesh: spectatorBody, x: -9.0, y: FLOOR_Y + 0.9, z: -2.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: spectatorHead, x: -9.0, y: FLOOR_Y + 1.4, z: -2.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: spectatorBody, x: -10.2, y: FLOOR_Y + 1.5, z: 1.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: spectatorHead, x: -10.2, y: FLOOR_Y + 2.0, z: 1.0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },

                { mesh: adBoard, x: -6.0, y: FLOOR_Y + 0.6, z: -7.0, rx: 0, ry: 0.2, rz: 0, sx: 1, sy: 1, sz: 1 },
                { mesh: adBoard, x:  6.0, y: FLOOR_Y + 0.6, z: -7.0, rx: 0, ry: -0.2, rz: 0, sx: 1, sy: 1, sz: 1 }
            );
        }
    }


    /* =========================================================
       SCENE OBJECTS BUILDER & SKYBOX
    ========================================================= */

    var BALL_RADIUS = 0.30;
    var RIM_CENTER_RADIUS = 0.62;
    var RIM_TUBE_RADIUS = 0.045;
    var NET_HEIGHT = 0.85;

    var ballMesh, ballSeamH, ballSeamV, rimMesh, backboardMesh, backboardLine, backboardLine2;
    var poleMesh, armMesh, baseMesh, netMesh, floorMesh, courtLinesMesh, spotMarkerMesh, skyboxMesh;

    var playerArmMesh, playerHandMesh;

    function buildCourtObjects() {
        var theme = COURT_THEMES[currentCourtKey];
        var skin = BALL_SKINS[currentBallSkinKey];

        var isMoney = isCurrentBallMoneyBall();
        if (selectedGameMode === "3ptcontest" && isMoney) {
            skin = BALL_SKINS["moneyball"];
            ballMesh = createMesh(createTricolorSphere(BALL_RADIUS, 24, 24));
        } else {
            ballMesh = createMesh(createSphere(BALL_RADIUS, 24, 24, skin.ballColor));
        }

        ballSeamH = createMesh(createTorus(BALL_RADIUS - 0.005, 0.012, 40, 6, skin.seamColor));
        ballSeamV = createMesh(createTorus(BALL_RADIUS - 0.005, 0.012, 40, 6, skin.seamColor));

        var rimColor = currentCourtKey === "cyber" ? [1.0, 0.0, 0.55] : [1.0, 0.3, 0.02];
        rimMesh        = createMesh(createTorus(RIM_CENTER_RADIUS, RIM_TUBE_RADIUS, 28, 10, rimColor));
        backboardMesh  = createMesh(createBox(1.6, 1.0, 0.06, [0.05, 0.06, 0.12]));
        backboardLine  = createMesh(createBox(1.35, 0.75, 0.07, rimColor));
        backboardLine2 = createMesh(createBox(1.28, 0.68, 0.075, [0.05, 0.06, 0.12]));

        poleMesh       = createMesh(createCylinder(0.12, 0.12, 5.4, 16, [0.15, 0.16, 0.22]));
        armMesh        = createMesh(createCylinder(0.07, 0.07, 0.9, 12, [0.15, 0.16, 0.22]));
        baseMesh       = createMesh(createBox(1.1, 0.18, 1.1, [0.10, 0.12, 0.18]));

        initNetData(RIM_CENTER_RADIUS - 0.03, RIM_CENTER_RADIUS * 0.42, NET_HEIGHT, 16, 6, [0.98, 0.98, 0.95]);
        netMesh = createMesh({ vertices: netData.currentVertices, faces: netData.faces }, true);

        floorMesh       = createMesh(createBox(24, 0.2, 24, theme.floor));
        courtLinesMesh  = createMesh(createCourtLines(theme.lines));
        spotMarkerMesh  = createMesh(createCylinder(0.45, 0.45, 0.02, 20, [1.0, 0.0, 0.55]));
        skyboxMesh      = createMesh(createBox(45, 45, 45, theme.skyColor));

        playerArmMesh  = createMesh(createCylinder(0.14, 0.12, 1.1, 14, [0.85, 0.62, 0.45]));
        playerHandMesh = createMesh(createBox(0.28, 0.10, 0.32, [0.85, 0.62, 0.45]));

        buildEnvironmentDecorations();

        GL.clearColor(theme.clear[0], theme.clear[1], theme.clear[2], 1.0);
        var courtHintEl = document.getElementById("courtLabelHint");
        if (courtHintEl) courtHintEl.textContent = theme.name;

        var ballTag = document.getElementById("ballTypeTag");
        if (ballTag) {
            if (isMoney) {
                ballTag.textContent = "🔥 BOLA 2 POIN (MONEY BALL)";
                ballTag.className = "ball-tag money";
            } else {
                ballTag.textContent = "BOLA 1 POIN";
                ballTag.className = "ball-tag normal";
            }
        }
    }


    /* =========================================================
       MATRICES & CAMERA CONTROL
    ========================================================= */

    function createLocalMatrix(x, y, z, sx, sy, sz, rx, ry, rz) {
        var m = LIBS.get_I4();
        LIBS.translateX(m, x); LIBS.translateY(m, y); LIBS.translateZ(m, z);
        LIBS.rotateZ(m, rz); LIBS.rotateY(m, ry); LIBS.rotateX(m, rx);
        m[0] *= sx; m[1] *= sx; m[2] *= sx;
        m[4] *= sy; m[5] *= sy; m[6] *= sy;
        m[8] *= sz; m[9] *= sz; m[10] *= sz;
        return m;
    }

    var PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 100);
    var VIEWMATRIX = LIBS.get_I4();
    var ROOTMATRIX = LIBS.get_I4();

    var cameraState = { theta: 0.0, phi: 1.57, dist: 14.0, targetY: 0.0 };

    window.addEventListener("resize", function () {
        CANVAS.width = window.innerWidth;
        CANVAS.height = window.innerHeight;
        PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 100);
    });

    function drawPart(mesh, x, y, z, sx, sy, sz, rx, ry, rz, mode) {
        if (!mesh) return;
        mode = mode || GL.TRIANGLES;
        var local = createLocalMatrix(x, y, z, sx, sy, sz, rx, ry, rz);
        var finalMatrix = LIBS.multiply(ROOTMATRIX, local);

        GL.uniformMatrix4fv(_Pmatrix, false, PROJMATRIX);
        GL.uniformMatrix4fv(_Vmatrix, false, VIEWMATRIX);
        GL.uniformMatrix4fv(_Mmatrix, false, finalMatrix);

        GL.bindBuffer(GL.ARRAY_BUFFER, mesh.vertex);
        GL.vertexAttribPointer(_position, 3, GL.FLOAT, false, 24, 0);
        GL.vertexAttribPointer(_color, 3, GL.FLOAT, false, 24, 12);

        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, mesh.index);
        GL.drawElements(mode, mesh.count, GL.UNSIGNED_SHORT, 0);
    }


    /* =========================================================
       WORLD & BALL PHYSICS
    ========================================================= */

    var FLOOR_Y = -3.0;
    var HOOP_BASE_X = 0, HOOP_Z = -5.4, RIM_Y = 1.65;
    var BACKBOARD_Y = 2.45, BACKBOARD_Z = HOOP_Z - 0.35;
    var BACKBOARD_WIDTH = 1.6, BACKBOARD_HEIGHT = 1.0;

    var RIM_HIT_RADIUS = RIM_CENTER_RADIUS - BALL_RADIUS * 0.70;
    var GRAVITY = -9.81;

    var ballStartPos = { x: 0, y: -0.5, z: 5.2 };

    var ball = {
        x: 0, y: -0.5, z: 5.2,
        vx: 0, vy: 0, vz: 0,
        flying: false, scored: false, swishPlayed: false, touchedRim: false, lastBounceTime: 0, rotX: 0, rotZ: 0,
        isPerfectShot: false
    };

    var armAnimProgress = 0.0;


    /* =========================================================
       AUDIO SYNTHESIZER
    ========================================================= */

    var audioContext = null;

    function initAudio() {
        if (!audioContext) {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) audioContext = new AudioCtx();
        }
        if (audioContext && audioContext.state === "suspended") {
            audioContext.resume();
        }
    }

    function playSwish() {
        initAudio(); if (!audioContext) return;
        var duration = 0.45;
        var buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) { data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2); }
        var source = audioContext.createBufferSource(); source.buffer = buffer;
        var filter = audioContext.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 2500;
        var gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.50, audioContext.currentTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
        source.connect(filter).connect(gain).connect(audioContext.destination);
        source.start(); source.stop(audioContext.currentTime + duration);
    }

    function playRimSound() {
        initAudio(); if (!audioContext) return;
        var osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = "triangle"; osc.frequency.setValueAtTime(680, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(160, audioContext.currentTime + 0.15);
        gain.gain.setValueAtTime(0.45, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.15);
        osc.connect(gain).connect(audioContext.destination);
        osc.start(); osc.stop(audioContext.currentTime + 0.15);
    }

    function playThudSound() {
        initAudio(); if (!audioContext) return;
        var osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = "sine"; 
        osc.frequency.setValueAtTime(120, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.12);

        gain.gain.setValueAtTime(0.9, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);

        osc.connect(gain).connect(audioContext.destination);
        osc.start(); osc.stop(audioContext.currentTime + 0.12);
    }

    function playFloorBounce() {
        initAudio(); if (!audioContext) return;
        var osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = "triangle";
        var startFreq = currentCourtKey === "beach" ? 180 : 220;
        osc.frequency.setValueAtTime(startFreq, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.18);

        gain.gain.setValueAtTime(0.85, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);

        osc.connect(gain).connect(audioContext.destination);
        osc.start(); osc.stop(audioContext.currentTime + 0.18);
    }

    function playCheerSound() {
        initAudio(); if (!audioContext) return;
        var duration = 1.8;
        var buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.sin((i / data.length) * Math.PI);
        }
        var source = audioContext.createBufferSource(); source.buffer = buffer;
        var filter = audioContext.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 2000;
        var gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.01, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(0.75, audioContext.currentTime + 0.20);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

        source.connect(filter).connect(gain).connect(audioContext.destination);
        source.start(); source.stop(audioContext.currentTime + duration);
    }

    function playBuzzerSound() {
        initAudio(); if (!audioContext) return;
        var osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, audioContext.currentTime);

        gain.gain.setValueAtTime(0.5, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.2);

        osc.connect(gain).connect(audioContext.destination);
        osc.start(); osc.stop(audioContext.currentTime + 1.2);
    }

    function playTickSound() {
        initAudio(); if (!audioContext) return;
        var osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, audioContext.currentTime);
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);

        osc.connect(gain).connect(audioContext.destination);
        osc.start(); osc.stop(audioContext.currentTime + 0.05);
    }

    function playSelectSound() {
        initAudio(); if (!audioContext) return;
        var osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.08);

        gain.gain.setValueAtTime(0.15, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);

        osc.connect(gain).connect(audioContext.destination);
        osc.start(); osc.stop(audioContext.currentTime + 0.08);
    }


    /* =========================================================
       3-POINT CONTEST HELPER FUNCTIONS
    ========================================================= */

    function isCurrentBallMoneyBall() {
        if (selectedGameMode !== "3ptcontest") return false;
        if (contestCurrentSpotIdx === chosenMoneyRackIdx) return true;
        if (contestBallInSpot === 4) return true; 
        return false;
    }


    /* =========================================================
       STATE MACHINE & FLOW CONTROL
    ========================================================= */

    var gameState = 0;

    var mainMenuEl         = document.getElementById("mainMenu");
    var courtSelectOverlay = document.getElementById("courtSelectOverlay");
    var spotSelectOverlay  = document.getElementById("spotSelectOverlay");
    var gameplayUIEl       = document.getElementById("gameplayUI");
    var gameOverModal      = document.getElementById("gameOverModal");
    var pauseModal         = document.getElementById("pauseModal");

    var modeSelectEl       = document.getElementById("modeSelect");
    var timeSelectEl       = document.getElementById("timeSelect");
    var skinSelectEl       = document.getElementById("skinSelect");
    var timeOptionGroup    = document.getElementById("timeOptionGroup");
    var moneyRackGroup     = document.getElementById("moneyRackGroup");
    var moneyRackSelectEl  = document.getElementById("moneyRackSelect");

    var aimIndicator   = document.getElementById("aimIndicator");
    var angleIndicator = document.getElementById("angleIndicator");
    var speedIndicator = document.getElementById("speedIndicator");
    var aimValEl       = document.getElementById("aimVal");
    var angleValEl     = document.getElementById("angleVal");
    var speedValEl     = document.getElementById("speedVal");
    var throwBtn       = document.getElementById("throwBtn");
    var distanceValEl  = document.getElementById("distanceVal");

    var timingStage = 0;
    var aimPosition = Math.random(), anglePosition = Math.random(), speedPosition = Math.random();
    var aimDirection = Math.random() > 0.5 ? 1 : -1, angleDirection = Math.random() > 0.5 ? 1 : -1, speedDirection = Math.random() > 0.5 ? 1 : -1;
    var aimValue = 0, angleValue = 50, speedValue = 9.5;
    
    var BASE_AIM_SPEED   = 0.90;
    var BASE_ANGLE_SPEED = 1.05;
    var BASE_SPEED_SPEED = 0.95;

    var aimBarSpeed   = BASE_AIM_SPEED;
    var angleBarSpeed = BASE_ANGLE_SPEED;
    var speedBarSpeed = BASE_SPEED_SPEED;

    function updateBarSpeeds() {
        var speedMultiplier = Math.pow(1.15, streakCount);
        aimBarSpeed   = BASE_AIM_SPEED   * speedMultiplier;
        angleBarSpeed = BASE_ANGLE_SPEED * speedMultiplier;
        speedBarSpeed = BASE_SPEED_SPEED * speedMultiplier;
    }

    var SWEET_SPOT_CENTER = 0.50;
    var YELLOW_MIN = 0.49;
    var YELLOW_MAX = 0.51;

    function isInsideYellowZone(pos) {
        return pos >= YELLOW_MIN && pos <= YELLOW_MAX;
    }

    modeSelectEl.addEventListener("change", function () {
        playSelectSound();
        if (modeSelectEl.value === "practice") {
            timeOptionGroup.style.display = "none";
            if (moneyRackGroup) moneyRackGroup.style.display = "none";
        } else if (modeSelectEl.value === "3ptcontest") {
            timeOptionGroup.style.display = "none";
            if (moneyRackGroup) moneyRackGroup.style.display = "block";
        } else {
            timeOptionGroup.style.display = "block";
            if (moneyRackGroup) moneyRackGroup.style.display = "none";
        }
    });

    document.getElementById("btnPlay").addEventListener("click", function () {
        playSelectSound();
        selectedGameMode = modeSelectEl.value;
        if (selectedGameMode === "3ptcontest") {
            selectedTimeLimit = 90;
            chosenMoneyRackIdx = parseInt(moneyRackSelectEl ? moneyRackSelectEl.value : "2");
        } else {
            selectedTimeLimit = parseInt(timeSelectEl.value);
        }
        currentBallSkinKey = skinSelectEl.value;

        gameState = 1;
        mainMenuEl.classList.add("hidden");
        courtSelectOverlay.classList.remove("hidden");
    });

    document.getElementById("btnQuit").addEventListener("click", function () {
        playSelectSound();
        alert("Terima kasih sudah bermain!");
    });

    var courtBtns = document.querySelectorAll(".courtPickBtn");
    courtBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            playSelectSound();
            courtBtns.forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            currentCourtKey = btn.getAttribute("data-court");
            buildCourtObjects();
            generateNewWind();
        });
    });

    document.getElementById("btnConfirmCourt").addEventListener("click", function () {
        playSelectSound();
        if (selectedGameMode === "3ptcontest") {
            document.getElementById("btnStartGame").click();
        } else {
            gameState = 2;
            courtSelectOverlay.classList.add("hidden");
            spotSelectOverlay.classList.remove("hidden");
        }
    });

    var spotBtns = document.querySelectorAll(".spotBtn");
    spotBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            playSelectSound();
            spotBtns.forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            currentSpotKey = btn.getAttribute("data-spot");

            var sp = SHOOTING_SPOTS[currentSpotKey];
            ballStartPos.x = sp.x;
            ballStartPos.z = sp.z;
            if (distanceValEl) distanceValEl.textContent = sp.distLabel;
            resetBall();
        });
    });

    document.getElementById("btnStartGame").addEventListener("click", function () {
        playSelectSound();
        gameState = 3;
        isPaused = false;
        score = 0;
        totalShots = 0;
        successfulShots = 0;
        streakCount = 0;
        bestStreak = 0;
        dynamicHoopX = 0.0;

        contestCurrentSpotIdx = 0;
        contestBallInSpot = 0;

        if (selectedGameMode === "3ptcontest") {
            currentSpotKey = contestSpotOrder[0];
            var sp = SHOOTING_SPOTS[currentSpotKey];
            ballStartPos.x = sp.x; ballStartPos.z = sp.z;
        }

        buildCourtObjects();
        document.getElementById("scoreVal").textContent = score;
        courtSelectOverlay.classList.add("hidden");
        spotSelectOverlay.classList.add("hidden");
        gameplayUIEl.classList.remove("hidden");
        pauseModal.classList.add("hidden");
        updateHighScoreDisplay();
        resetTimingGame();

        var currentLabel = SHOOTING_SPOTS[currentSpotKey].distLabel;
        if (selectedGameMode === "3ptcontest") {
            currentLabel += " [Bola " + (contestBallInSpot + 1) + "/5]";
        }
        if (distanceValEl) distanceValEl.textContent = currentLabel;

        if (selectedGameMode === "timeattack" || selectedGameMode === "3ptcontest") {
            startTimer();
        } else {
            stopTimer();
            document.getElementById("timerVal").textContent = "∞";
        }
    });

    function togglePause() {
        if (gameState !== 3 && gameState !== 5) return;
        playSelectSound();
        if (!isPaused) {
            isPaused = true;
            gameState = 5;
            pauseModal.classList.remove("hidden");
        } else {
            isPaused = false;
            gameState = 3;
            pauseModal.classList.add("hidden");
        }
    }

    function restartCurrentGame() {
        playSelectSound();
        isPaused = false;
        pauseModal.classList.add("hidden");
        gameOverModal.classList.add("hidden");
        gameState = 3;
        score = 0;
        totalShots = 0;
        successfulShots = 0;
        streakCount = 0;
        bestStreak = 0;
        dynamicHoopX = 0.0;
        contestCurrentSpotIdx = 0;
        contestBallInSpot = 0;

        if (selectedGameMode === "3ptcontest") {
            currentSpotKey = contestSpotOrder[0];
            var sp = SHOOTING_SPOTS[currentSpotKey];
            ballStartPos.x = sp.x; ballStartPos.z = sp.z;
        }

        buildCourtObjects();
        document.getElementById("scoreVal").textContent = score;
        gameplayUIEl.classList.remove("hidden");
        resetBall();
        resetTimingGame();

        if (selectedGameMode === "timeattack" || selectedGameMode === "3ptcontest") {
            startTimer();
        }
    }

    document.getElementById("btnResume").addEventListener("click", togglePause);
    document.getElementById("btnRestartPause").addEventListener("click", restartCurrentGame);
    document.getElementById("btnQuitPause").addEventListener("click", function () {
        playSelectSound();
        isPaused = false;
        pauseModal.classList.add("hidden");
        gameState = 0;
        gameplayUIEl.classList.add("hidden");
        mainMenuEl.classList.remove("hidden");
        stopTimer();
        resetBall();
    });

    document.getElementById("btnBackMenu").addEventListener("click", togglePause);
    document.getElementById("btnRestart").addEventListener("click", restartCurrentGame);

    var timerInterval = null;
    function startTimer() {
        stopTimer();
        gameTimeLeft = selectedTimeLimit;
        document.getElementById("timerVal").textContent = gameTimeLeft;
        timerInterval = setInterval(function () {
            if (gameState === 3 && !isPaused) {
                gameTimeLeft--;
                document.getElementById("timerVal").textContent = gameTimeLeft;
                if (gameTimeLeft <= 10 && gameTimeLeft > 0) {
                    playTickSound();
                }
                if (gameTimeLeft <= 0) {
                    stopTimer();
                    playBuzzerSound();
                    finishGame();
                }
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) clearInterval(timerInterval);
    }

    function finishGame() {
        gameState = 4;
        gameplayUIEl.classList.add("hidden");

        var accuracy = totalShots > 0 ? Math.round((successfulShots / totalShots) * 100) : 0;
        document.getElementById("summaryScore").textContent = score;
        document.getElementById("summaryAccuracy").textContent = accuracy + "%";
        document.getElementById("summaryStreak").textContent = bestStreak;

        var newRecordBadge = document.getElementById("newRecordBadge");
        if (score > highScore) {
            highScore = score;
            localStorage.setItem("3d_bb_high_score", highScore.toString());
            updateHighScoreDisplay();
            newRecordBadge.style.display = "block";
            triggerConfetti();
        } else {
            newRecordBadge.style.display = "none";
        }

        gameOverModal.classList.remove("hidden");
    }

    function resetBall() {
        ball.x = ballStartPos.x;
        ball.y = ballStartPos.y;
        ball.z = ballStartPos.z;
        ball.vx = 0; ball.vy = 0; ball.vz = 0;
        ball.flying = false; ball.scored = false; ball.swishPlayed = false; ball.touchedRim = false;
        ball.lastBounceTime = 0; ball.rotX = 0; ball.rotZ = 0;
        ball.isPerfectShot = false;
        timeScale = 1.0;
        armAnimProgress = 0.0;
        ballTrails = [];

        buildCourtObjects(); 
        generateNewWind();
    }


    /* =========================================================
       CALCULATE DYNAMIC LAUNCH VELOCITY WITH 2% YELLOW SWEET SPOT
    ========================================================= */

    function computeLaunchVelocity() {
        var isYellowAim   = isInsideYellowZone(aimPosition);
        var isYellowAngle = isInsideYellowZone(anglePosition);
        var isYellowSpeed = isInsideYellowZone(speedPosition);

        var isPerfectYellowRelease = isYellowAim && isYellowAngle && isYellowSpeed;
        ball.isPerfectShot = isPerfectYellowRelease;

        var targetX = dynamicHoopX;
        var targetZ = HOOP_Z;
        var targetY = RIM_Y + 0.12;

        var dx = targetX - ballStartPos.x;
        var dz = targetZ - ballStartPos.z;
        var distToHoop = Math.sqrt(dx * dx + dz * dz);

        var flightTime = 1.05 + (distToHoop * 0.045);

        var idealVx = (dx / flightTime) - (0.5 * windForce.x * flightTime);
        var idealVz = (dz / flightTime) - (0.5 * windForce.z * flightTime);
        var idealVy = (targetY - ballStartPos.y - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;

        if (isPerfectYellowRelease) {
            return {
                vx: idealVx,
                vy: idealVy,
                vz: idealVz
            };
        }

        var aimErr   = aimPosition - SWEET_SPOT_CENTER;
        var angleErr = anglePosition - SWEET_SPOT_CENTER;
        var speedErr = speedPosition - SWEET_SPOT_CENTER;

        var devX = aimErr * 3.2;
        var devY = angleErr * 3.8;
        var devZ = speedErr * 3.5;

        return {
            vx: idealVx + devX,
            vy: idealVy + devY,
            vz: idealVz + devZ
        };
    }

    function updateTimingBars(dt) {
        if (timingStage === 0) {
            aimPosition += aimDirection * aimBarSpeed * dt;
            if (aimPosition >= 1) { aimPosition = 1; aimDirection = -1; }
            if (aimPosition <= 0) { aimPosition = 0; aimDirection = 1; }
            aimValue = -3.5 + aimPosition * 7.0;
            if (aimIndicator) aimIndicator.style.left = (aimPosition * 100) + "%";
            if (aimValEl) aimValEl.textContent = aimValue.toFixed(1) + " m";
        }
        if (timingStage === 1) {
            anglePosition += angleDirection * angleBarSpeed * dt;
            if (anglePosition >= 1) { anglePosition = 1; angleDirection = -1; }
            if (anglePosition <= 0) { anglePosition = 0; angleDirection = 1; }
            angleValue = 35 + anglePosition * 30;
            if (angleIndicator) angleIndicator.style.left = (anglePosition * 100) + "%";
            if (angleValEl) angleValEl.textContent = angleValue.toFixed(1) + "°";
        }
        if (timingStage === 2) {
            speedPosition += speedDirection * speedBarSpeed * dt;
            if (speedPosition >= 1) { speedPosition = 1; speedDirection = -1; }
            if (speedPosition <= 0) { speedPosition = 0; speedDirection = 1; }
            speedValue = 5 + speedPosition * 9;
            if (speedIndicator) speedIndicator.style.left = (speedPosition * 100) + "%";
            if (speedValEl) speedValEl.textContent = speedValue.toFixed(1) + " m/s";
        }

        var vel = computeLaunchVelocity();
        trajectoryMesh = buildTrajectoryMesh(ballStartPos.x, ballStartPos.y, ballStartPos.z, vel.vx, vel.vy, vel.vz, 22);
    }

    function resetTimingGame() {
        timingStage = 0;
        aimPosition = Math.random(); anglePosition = Math.random(); speedPosition = Math.random();
        aimDirection = Math.random() > 0.5 ? 1 : -1; angleDirection = Math.random() > 0.5 ? 1 : -1; speedDirection = Math.random() > 0.5 ? 1 : -1;

        updateBarSpeeds();

        if (throwBtn) {
            throwBtn.textContent = "STOP BAR";
            throwBtn.classList.remove("ready"); throwBtn.classList.remove("throwing");
            throwBtn.disabled = false;
        }

        if (aimIndicator) aimIndicator.style.left = (aimPosition * 100) + "%";
        if (angleIndicator) angleIndicator.style.left = (anglePosition * 100) + "%";
        if (speedIndicator) speedIndicator.style.left = (speedPosition * 100) + "%";

        aimValue = -3.5 + aimPosition * 7.0; angleValue = 35 + anglePosition * 30; speedValue = 5 + speedPosition * 9;
        if (aimValEl) aimValEl.textContent = aimValue.toFixed(1) + " m";
        if (angleValEl) angleValEl.textContent = angleValue.toFixed(1) + "°";
        if (speedValEl) speedValEl.textContent = speedValue.toFixed(1) + " m/s";

        generateNewWind();
    }

    function stopCurrentBar() {
        if (isPaused) return;
        playSelectSound();
        if (ball.flying) return;
        if (timingStage === 0) { timingStage = 1; throwBtn.textContent = "STOP ELEVASI"; return; }
        if (timingStage === 1) { timingStage = 2; throwBtn.textContent = "STOP KECEPATAN"; return; }
        if (timingStage === 2) { timingStage = 3; throwBtn.textContent = "LEMPAR BOLA"; throwBtn.classList.add("ready"); return; }
        if (timingStage === 3) {
            throwBall(); timingStage = 4;
            throwBtn.textContent = "BOLA TERBANG";
            throwBtn.classList.remove("ready"); throwBtn.classList.add("throwing");
        }
    }

    function throwBall() {
        if (ball.flying || isPaused) return;
        totalShots++;

        var vel = computeLaunchVelocity();
        ball.vx = vel.vx;
        ball.vy = vel.vy;
        ball.vz = vel.vz;

        ball.x = ballStartPos.x; ball.y = ballStartPos.y; ball.z = ballStartPos.z;
        ball.flying = true; ball.scored = false; ball.swishPlayed = false; ball.touchedRim = false;
        armAnimProgress = 1.0;
    }

    function advanceContestBallOrSpot() {
        contestBallInSpot++;
        if (contestBallInSpot >= 5) {
            contestBallInSpot = 0;
            contestCurrentSpotIdx++;
            if (contestCurrentSpotIdx >= contestSpotOrder.length) {
                finishGame();
                return;
            } else {
                currentSpotKey = contestSpotOrder[contestCurrentSpotIdx];
                var sp = SHOOTING_SPOTS[currentSpotKey];
                ballStartPos.x = sp.x; ballStartPos.z = sp.z;
                showPopup("NEXT SPOT: " + sp.name.toUpperCase(), "net");
            }
        }

        var label = SHOOTING_SPOTS[currentSpotKey].distLabel + " [Bola " + (contestBallInSpot + 1) + "/5]";
        if (isCurrentBallMoneyBall()) label += " 🔥 MONEY BALL";
        if (distanceValEl) distanceValEl.textContent = label;

        resetBall(); resetTimingGame();
    }

    function showPopup(text, type) {
        var popup = document.getElementById("popup");
        if (!popup) return;
        popup.textContent = text;
        popup.classList.remove("miss"); popup.classList.remove("net");
        if (type === "miss") popup.classList.add("miss");
        if (type === "net") popup.classList.add("net");
        popup.classList.add("show");
        clearTimeout(popup._timer);
        popup._timer = setTimeout(function () { popup.classList.remove("show"); }, 850);
    }


    /* =========================================================
       PHYSICS COLLISION & MOVING HOOP UPDATE
    ========================================================= */

    function updateMovingHoop(dt) {
        if (selectedGameMode === "timeattack" && score >= 5 && !isPaused) {
            var currentSpeed = hoopBaseSpeed + (score - 5) * 0.08;
            dynamicHoopX += hoopMoveDir * currentSpeed * dt;

            if (dynamicHoopX > 2.0) {
                dynamicHoopX = 2.0;
                hoopMoveDir = -1;
            } else if (dynamicHoopX < -2.0) {
                dynamicHoopX = -2.0;
                hoopMoveDir = 1;
            }
        } else {
            dynamicHoopX = 0.0;
        }
    }

    function checkBackboardCollision() {
        var isZColliding = (ball.z - BALL_RADIUS <= BACKBOARD_Z + 0.03) && (ball.z + BALL_RADIUS >= BACKBOARD_Z - 0.05);
        var isXWithin = Math.abs(ball.x - dynamicHoopX) <= (BACKBOARD_WIDTH / 2 + BALL_RADIUS * 0.5);
        var isYWithin = Math.abs(ball.y - BACKBOARD_Y) <= (BACKBOARD_HEIGHT / 2 + BALL_RADIUS * 0.5);

        if (isZColliding && isXWithin && isYWithin && ball.vz < 0) {
            ball.z = BACKBOARD_Z + 0.03 + BALL_RADIUS;
            ball.vz = -ball.vz * 0.62; ball.vx *= 0.8; ball.vy *= 0.85;
            ball.touchedRim = true;
            backboardFlashTimer = 0.25;

            var now = performance.now();
            if (now - ball.lastBounceTime > 150) {
                playThudSound();
                triggerShake(0.12, 0.18);
                spawnParticles(ball.x, ball.y, ball.z, 12, COURT_THEMES[currentCourtKey].particle);
                ball.lastBounceTime = now;
            }
        }
    }

    function checkRimCollision(previousX, previousY, previousZ) {
        var dx = ball.x - dynamicHoopX, dz = ball.z - HOOP_Z;
        var distanceToCenter = Math.sqrt(dx * dx + dz * dz);

        if (previousY > RIM_Y && ball.y <= RIM_Y && ball.vy < 0 && distanceToCenter <= RIM_HIT_RADIUS) {
            if (!ball.scored) {
                ball.scored = true;
                successfulShots++;
                rimFlashTimer = 0.45;

                streakCount++;
                if (streakCount > bestStreak) bestStreak = streakCount;

                var isMoneyBall = isCurrentBallMoneyBall();
                var basePoints = isMoneyBall ? 2 : 1;

                if (ball.isPerfectShot) {
                    basePoints *= 2;
                }

                var pointsAdded = streakCount > 1 ? (basePoints * streakCount) : basePoints;

                var labelText = "";
                if (ball.isPerfectShot) {
                    labelText = "⚡ PERFECT! +" + pointsAdded;
                } else if (isMoneyBall) {
                    labelText = "MONEY BALL! +" + pointsAdded;
                } else if (streakCount >= 3) {
                    labelText = "🔥 ON FIRE! x" + streakCount;
                } else {
                    labelText = "SWISH! +" + pointsAdded;
                }

                showPopup(labelText, "net");
                triggerFireworkExplosion(ball.x, ball.y, ball.z);

                score += pointsAdded;
                document.getElementById("scoreVal").textContent = score;

                playCheerSound();
                triggerShake(0.20, 0.25);

                return true;
            }
        }

        var angleToBall = Math.atan2(dz, dx);
        var nearestRingX = dynamicHoopX + Math.cos(angleToBall) * RIM_CENTER_RADIUS;
        var nearestRingZ = HOOP_Z + Math.sin(angleToBall) * RIM_CENTER_RADIUS;
        var nearestRingY = RIM_Y;

        var distToRingX = ball.x - nearestRingX, distToRingY = ball.y - nearestRingY, distToRingZ = ball.z - nearestRingZ;
        var distToTorusWire = Math.sqrt(distToRingX * distToRingX + distToRingY * distToRingY + distToRingZ * distToRingZ);
        var minDistToCollide = BALL_RADIUS + RIM_TUBE_RADIUS;

        if (distToTorusWire < minDistToCollide) {
            ball.touchedRim = true;
            rimFlashTimer = 0.30;
            var nx = distToRingX / distToTorusWire, ny = distToRingY / distToTorusWire, nz = distToRingZ / distToTorusWire;
            ball.x = nearestRingX + nx * minDistToCollide;
            ball.y = nearestRingY + ny * minDistToCollide;
            ball.z = nearestRingZ + nz * minDistToCollide;

            var dot = ball.vx * nx + ball.vy * ny + ball.vz * nz;
            if (dot < 0) {
                ball.vx = (ball.vx - 2 * dot * nx) * 0.65;
                ball.vy = (ball.vy - 2 * dot * ny) * 0.65;
                ball.vz = (ball.vz - 2 * dot * nz) * 0.65;

                var now = performance.now();
                if (now - ball.lastBounceTime > 120) {
                    playRimSound();
                    triggerShake(0.16, 0.22);
                    spawnParticles(ball.x, ball.y, ball.z, 15, [1.0, 0.0, 0.55]);
                    ball.lastBounceTime = now;
                }
            }
        }
        return false;
    }

    function updateNetPhysics(dt) {
        if (!netMesh) return;
        var totalVertices = netData.currentVertices.length / 6;

        if (ball.flying) {
            for (var i = 0; i < totalVertices; i++) {
                var ringIdx = Math.floor(i / netData.radialSegments);
                if (ringIdx === 0) continue;

                var vIdx = i * 6;
                var vxWorld = dynamicHoopX + netData.currentVertices[vIdx];
                var vyWorld = RIM_Y + netData.currentVertices[vIdx + 1];
                var vzWorld = HOOP_Z + netData.currentVertices[vIdx + 2];

                var dx = vxWorld - ball.x, dy = vyWorld - ball.y, dz = vzWorld - ball.z;
                var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < BALL_RADIUS + 0.05) {
                    var pushForce = (BALL_RADIUS + 0.05 - dist) * 12.0;
                    var nx = dx / (dist || 1), ny = dy / (dist || 1), nz = dz / (dist || 1);
                    var velIdx = i * 3;

                    netData.velocities[velIdx]     += (nx * pushForce + ball.vx * 0.15) * dt * 60;
                    netData.velocities[velIdx + 1] += (ny * pushForce + ball.vy * 0.15) * dt * 60;
                    netData.velocities[velIdx + 2] += (nz * pushForce + ball.vz * 0.15) * dt * 60;

                    ball.vx *= 0.985; ball.vy *= 0.99; ball.vz *= 0.985;

                    if (!ball.swishPlayed && Math.abs(ball.y - RIM_Y) < NET_HEIGHT) {
                        ball.swishPlayed = true; playSwish();
                        spawnParticles(ball.x, ball.y, ball.z, 20, [1.0, 0.0, 0.55]);
                    }
                }
            }
        }

        for (var i = 0; i < totalVertices; i++) {
            var ringIdx = Math.floor(i / netData.radialSegments);
            if (ringIdx === 0) continue;

            var vIdx = i * 6, velIdx = i * 3;
            var curX = netData.currentVertices[vIdx], curY = netData.currentVertices[vIdx + 1], curZ = netData.currentVertices[vIdx + 2];
            var baseX = netData.baseVertices[vIdx], baseY = netData.baseVertices[vIdx + 1], baseZ = netData.baseVertices[vIdx + 2];

            var stiffness = 120.0, damping = 0.82;
            var fx = (baseX - curX) * stiffness, fy = (baseY - curY) * stiffness, fz = (baseZ - curZ) * stiffness;

            netData.velocities[velIdx]     += fx * dt;
            netData.velocities[velIdx + 1] += fy * dt;
            netData.velocities[velIdx + 2] += fz * dt;

            netData.velocities[velIdx]     *= damping;
            netData.velocities[velIdx + 1] *= damping;
            netData.velocities[velIdx + 2] *= damping;

            netData.currentVertices[vIdx]     += netData.velocities[velIdx]     * dt;
            netData.currentVertices[vIdx + 1] += netData.velocities[velIdx + 1] * dt;
            netData.currentVertices[vIdx + 2] += netData.velocities[velIdx + 2] * dt;
        }

        GL.bindBuffer(GL.ARRAY_BUFFER, netMesh.vertex);
        GL.bufferSubData(GL.ARRAY_BUFFER, 0, new Float32Array(netData.currentVertices));
    }


    /* =========================================================
       UPDATE CAMERA (STABIL 100% PERSEDIAAN PERSPEKTIF RESET)
    ========================================================= */

    function updateCamera(dt) {
        var targetTheta = 0.0, targetPhi = 0.35, targetDist = 12.0, targetY = -0.5;

        if (gameState === 0 || gameState === 1 || gameState === 2 || gameState === 4 || gameState === 5) {
            // Menu & Overlay Camera Perspective
            targetTheta = 0.0; 
            targetPhi = 1.55; 
            targetDist = 14.5; 
            targetY = 0.0;

            cameraState.theta += (targetTheta - cameraState.theta) * 6.0 * dt;
            cameraState.phi   += (targetPhi - cameraState.phi) * 6.0 * dt;
            cameraState.dist  += (targetDist - cameraState.dist) * 6.0 * dt;
            cameraState.targetY += (targetY - cameraState.targetY) * 6.0 * dt;

            LIBS.set_I4(VIEWMATRIX);
            LIBS.translateZ(VIEWMATRIX, -cameraState.dist);
            LIBS.translateY(VIEWMATRIX, cameraState.targetY);

            LIBS.set_I4(ROOTMATRIX);
            LIBS.rotateX(ROOTMATRIX, cameraState.phi);
            LIBS.rotateY(ROOTMATRIX, cameraState.theta);
        } else if (gameState === 3) {
            var isLastShotContest = (selectedGameMode === "3ptcontest" && contestBallInSpot === 4 && ball.flying);

            if (isLastShotContest) {
                // === CAMERA FOLLOWING LAST BALL (BOLA KE-5) ===
                targetTheta = 0.0;
                targetPhi = 0.28;

                cameraState.theta += (targetTheta - cameraState.theta) * 6.0 * dt;
                cameraState.phi   += (targetPhi - cameraState.phi) * 6.0 * dt;

                LIBS.set_I4(VIEWMATRIX);
                LIBS.translateZ(VIEWMATRIX, -7.5);
                LIBS.translateY(VIEWMATRIX, -ball.y - 0.2);
                LIBS.translateX(VIEWMATRIX, -ball.x * 0.5);

                LIBS.set_I4(ROOTMATRIX);
                LIBS.rotateX(ROOTMATRIX, cameraState.phi);
                LIBS.rotateY(ROOTMATRIX, cameraState.theta);
                LIBS.translateZ(ROOTMATRIX, -ball.z);
            } else {
                // === PERSPEKTIF AWAL MURNI DENGAN MATRIKS DIBERSIHKAN (RESET I4) ===
                var dx = 0.0 - ballStartPos.x;
                var dz = HOOP_Z - ballStartPos.z;

                targetTheta = Math.atan2(dx, -dz);
                targetPhi = 0.30;
                
                var isClutchShot = (selectedGameMode === "timeattack" && gameTimeLeft <= 10) || ball.flying;
                targetDist = isClutchShot ? 9.2 : 11.5;
                targetY = -0.5;

                var shakeX = 0, shakeY = 0;
                if (cameraShakeTime > 0) {
                    cameraShakeTime -= dt;
                    shakeX = (Math.random() - 0.5) * cameraShakeIntensity;
                    shakeY = (Math.random() - 0.5) * cameraShakeIntensity;
                }

                cameraState.theta += (targetTheta - cameraState.theta) * 6.0 * dt;
                cameraState.phi   += (targetPhi - cameraState.phi) * 6.0 * dt;
                cameraState.dist  += (targetDist - cameraState.dist) * 6.0 * dt;
                cameraState.targetY += (targetY - cameraState.targetY) * 6.0 * dt;

                LIBS.set_I4(VIEWMATRIX);
                LIBS.translateZ(VIEWMATRIX, -cameraState.dist);
                LIBS.translateY(VIEWMATRIX, cameraState.targetY + shakeY);
                LIBS.translateX(VIEWMATRIX, shakeX);

                // RESET ROOTMATRIX AGAR ROTASI TIDAK MENUMPUK DI SETIAP FRAME
                LIBS.set_I4(ROOTMATRIX);
                LIBS.rotateX(ROOTMATRIX, cameraState.phi);
                LIBS.rotateY(ROOTMATRIX, cameraState.theta);
                LIBS.translateX(ROOTMATRIX, -ballStartPos.x);
                LIBS.translateZ(ROOTMATRIX, -ballStartPos.z);
            }
        }
    }

    function updateBall(dt) {
        if (gameState === 3 && ball.flying && !isPaused) {
            var previousX = ball.x, previousY = ball.y, previousZ = ball.z;

            var distToHoop = Math.sqrt(Math.pow(ball.x - dynamicHoopX, 2) + Math.pow(ball.y - RIM_Y, 2) + Math.pow(ball.z - HOOP_Z, 2));

            var isLastShotContest = (selectedGameMode === "3ptcontest" && contestBallInSpot === 4);
            if ((!ball.scored && distToHoop < 2.5 && ball.vy < 0.5 && ball.y >= RIM_Y - 0.3) || isLastShotContest) {
                timeScale = 0.70; 
            } else {
                timeScale = 1.0;
            }

            var simDt = dt * timeScale;

            ball.vx += windForce.x * simDt;
            ball.vy += GRAVITY * simDt;
            ball.vz += windForce.z * simDt;

            ball.x += ball.vx * simDt; ball.y += ball.vy * simDt; ball.z += ball.vz * simDt;
            ball.rotX += ball.vz * simDt * 2.2; ball.rotZ += ball.vx * simDt * 2.2;

            checkBackboardCollision();
            checkRimCollision(previousX, previousY, previousZ);

            if (ball.y < FLOOR_Y + BALL_RADIUS) {
                playFloorBounce();
                spawnParticles(ball.x, FLOOR_Y + BALL_RADIUS, ball.z, 14, COURT_THEMES[currentCourtKey].particle);
                if (!ball.scored) {
                    streakCount = 0;
                    showPopup("MISS", "miss");
                }
                
                if (selectedGameMode === "3ptcontest") {
                    advanceContestBallOrSpot();
                } else {
                    resetBall(); resetTimingGame();
                }
                return;
            }

            if (ball.z < HOOP_Z - 5 || ball.z > ballStartPos.z + 4 || Math.abs(ball.x) > 10) {
                if (!ball.scored) {
                    streakCount = 0;
                    showPopup("MISS", "miss");
                }

                if (selectedGameMode === "3ptcontest") {
                    advanceContestBallOrSpot();
                } else {
                    resetBall(); resetTimingGame();
                }
            }
        }
        updateNetPhysics(dt);
    }

    function drawSkybox() {
        drawPart(skyboxMesh, 0, 0, 0, 1, 1, 1, 0, 0, 0);
    }

    function drawHoop(dt) {
        var theme = COURT_THEMES[currentCourtKey];

        if (rimFlashTimer > 0) rimFlashTimer -= dt;
        if (backboardFlashTimer > 0) backboardFlashTimer -= dt;

        drawPart(poleMesh, dynamicHoopX, FLOOR_Y + 2.7, BACKBOARD_Z - 0.5, 1, 1, 1, 0, 0, 0);
        drawPart(baseMesh, dynamicHoopX, FLOOR_Y + 0.09, BACKBOARD_Z - 0.5, 1, 1, 1, 0, 0, 0);
        drawPart(armMesh, dynamicHoopX, BACKBOARD_Y, (BACKBOARD_Z + BACKBOARD_Z - 0.5) / 2, 1, 1, 1, Math.PI / 2, 0, 0);

        drawPart(backboardMesh, dynamicHoopX, BACKBOARD_Y, BACKBOARD_Z, 1, 1, 1, 0, 0, 0);

        if (backboardFlashTimer > 0) {
            drawPart(backboardLine, dynamicHoopX, BACKBOARD_Y, BACKBOARD_Z, 1.05, 1.05, 1.05, 0, 0, 0);
        } else {
            drawPart(backboardLine, dynamicHoopX, BACKBOARD_Y, BACKBOARD_Z, 1, 1, 1, 0, 0, 0);
        }
        drawPart(backboardLine2, dynamicHoopX, BACKBOARD_Y, BACKBOARD_Z, 1, 1, 1, 0, 0, 0);

        if (rimFlashTimer > 0) {
            drawPart(rimMesh, dynamicHoopX, RIM_Y, HOOP_Z, 1.12, 1.12, 1.12, 0, 0, 0);
        } else {
            drawPart(rimMesh, dynamicHoopX, RIM_Y, HOOP_Z, 1, 1, 1, 0, 0, 0);
        }

        drawPart(netMesh, dynamicHoopX, RIM_Y, HOOP_Z, 1, 1, 1, 0, 0, 0, GL.LINES);
    }

    function drawBall() {
        drawPart(ballMesh, ball.x, ball.y, ball.z, 1, 1, 1, ball.rotX, 0, ball.rotZ);
        drawPart(ballSeamH, ball.x, ball.y, ball.z, 1, 1, 1, ball.rotX, 0, ball.rotZ, GL.LINES);
        drawPart(ballSeamV, ball.x, ball.y, ball.z, 1, 1, 1, ball.rotX + Math.PI / 2, 0, ball.rotZ, GL.LINES);
    }

    function drawBallShadow() {
        var heightAboveFloor = Math.max(0, ball.y - (FLOOR_Y + BALL_RADIUS));
        var shadowScale = Math.max(0.2, 1.0 - (heightAboveFloor * 0.15));
        drawPart(shadowMesh, ball.x, FLOOR_Y + 0.01, ball.z, shadowScale, 1.0, shadowScale, 0, 0, 0);
    }

    function drawPlayerArm(dt) {
        if (gameState === 3 || gameState === 5) {
            if (armAnimProgress > 0) {
                armAnimProgress -= dt * 2.5;
            } else {
                armAnimProgress = 0;
            }

            var armRot = -0.5 + armAnimProgress * 0.9;
            var armX = ballStartPos.x + 0.40;
            var armY = ballStartPos.y - 0.35 + (1.0 - armAnimProgress) * 0.15;
            var armZ = ballStartPos.z + 0.35;

            drawPart(playerArmMesh, armX, armY, armZ, 1, 1, 1, armRot, 0, -0.2);
            drawPart(playerHandMesh, armX - 0.05, armY + 0.45, armZ - 0.20, 1, 1, 1, armRot + 0.6, 0, -0.1);
        }
    }

    function drawSpotMarkers() {
        if (gameState === 2 || selectedGameMode === "3ptcontest") {
            for (var key in SHOOTING_SPOTS) {
                var sp = SHOOTING_SPOTS[key];
                drawPart(spotMarkerMesh, sp.x, FLOOR_Y + 0.11, sp.z, 1, 1, 1, 0, 0, 0);
            }
        }
    }


    /* =========================================================
       INPUT LISTENERS
    ========================================================= */

    if (throwBtn) {
        throwBtn.addEventListener("click", function () { stopCurrentBar(); });
    }

    window.addEventListener("keydown", function (e) {
        if (e.code === "Space") {
            e.preventDefault();
            stopCurrentBar();
        }
        if (e.code === "Escape") {
            e.preventDefault();
            togglePause();
        }
        if (e.code === "KeyR") {
            e.preventDefault();
            if (gameState === 3 || gameState === 4 || gameState === 5) {
                restartCurrentGame();
            }
        }
    });

    window.addEventListener("click", function () { initAudio(); });
    window.addEventListener("keydown", function () { initAudio(); });

    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.clearDepth(1.0);

    buildCourtObjects();
    resetBall();
    updateHighScoreDisplay();

    var lastTime = performance.now();

    function animate(nowTime) {
        var dt = Math.min((nowTime - lastTime) / 1000, 0.05);
        lastTime = nowTime;

        GL.viewport(0, 0, CANVAS.width, CANVAS.height);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        if (gameState === 3 && !isPaused) {
            updateMovingHoop(dt);
            if (!ball.flying) {
                updateTimingBars(dt);
            }
        }

        updateCamera(dt);
        updateBall(dt);

        drawSkybox();
        drawPart(floorMesh, 0, FLOOR_Y, -3, 1, 1, 1, 0, 0, 0);
        drawPart(courtLinesMesh, 0, 0, 0, 1, 1, 1, 0, 0, 0, GL.LINES);

        if (gameState === 3 && !ball.flying && trajectoryMesh) {
            drawPart(trajectoryMesh, 0, 0, 0, 1, 1, 1, 0, 0, 0, GL.LINES);
        }

        drawSpotMarkers();
        drawHoop(dt);

        for (var i = 0; i < decoMeshes.length; i++) {
            var d = decoMeshes[i];
            drawPart(d.mesh, d.x, d.y, d.z, d.sx, d.sy, d.sz, d.rx, d.ry, d.rz);
        }

        drawBallShadow();
        drawBall();
        drawPlayerArm(dt);

        updateAndDrawTrail(dt);
        updateAndDrawParticles(dt);

        GL.flush();
        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

window.addEventListener("load", main);