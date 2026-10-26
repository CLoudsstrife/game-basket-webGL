var LIBS = {};

LIBS.degToRad = function (angle) {
    return (angle * Math.PI) / 180;
};

LIBS.get_I4 = function () {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
};

LIBS.set_I4 = function (m) {
    m[0] = 1;  m[1] = 0;  m[2] = 0;  m[3] = 0;
    m[4] = 0;  m[5] = 1;  m[6] = 0;  m[7] = 0;
    m[8] = 0;  m[9] = 0;  m[10] = 1; m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
};

LIBS.translateX = function (m, t) { m[12] += t; };
LIBS.translateY = function (m, t) { m[13] += t; };
LIBS.translateZ = function (m, t) { m[14] += t; };

LIBS.multiply = function (a, b) {
    var out = new Float32Array(16);
    for (var col = 0; col < 4; col++) {
        for (var row = 0; row < 4; row++) {
            var sum = 0;
            for (var k = 0; k < 4; k++) {
                sum += a[k * 4 + row] * b[col * 4 + k];
            }
            out[col * 4 + row] = sum;
        }
    }
    return out;
};

LIBS.rotateX = function (m, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    var r = [1, 0, 0, 0,  0, c, s, 0,  0, -s, c, 0,  0, 0, 0, 1];
    var out = LIBS.multiply(m, r);
    for (var i = 0; i < 16; i++) m[i] = out[i];
};

LIBS.rotateY = function (m, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    var r = [c, 0, -s, 0,  0, 1, 0, 0,  s, 0, c, 0,  0, 0, 0, 1];
    var out = LIBS.multiply(m, r);
    for (var i = 0; i < 16; i++) m[i] = out[i];
};

LIBS.rotateZ = function (m, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    var r = [c, s, 0, 0,  -s, c, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1];
    var out = LIBS.multiply(m, r);
    for (var i = 0; i < 16; i++) m[i] = out[i];
};

LIBS.get_projection = function (angle, a, zMin, zMax) {
    var ang = Math.tan((angle * 0.5) * Math.PI / 180);
    return new Float32Array([
        0.5 / ang, 0, 0, 0,
        0, 0.5 * a / ang, 0, 0,
        0, 0, -(zMax + zMin) / (zMax - zMin), -1,
        0, 0, (-2 * zMax * zMin) / (zMax - zMin), 0
    ]);
};