// Hologram vertex shader — audio-reactive vertex displacement.
//
// Uniforms:
//   uTime       — elapsed seconds
//   uBass       — 0..1 aggregated low-frequency amplitude
//   uMid        — 0..1 aggregated mid-frequency amplitude
//   uTreble     — 0..1 aggregated high-frequency amplitude
//   uAudioData  — N-bin float texture of the latest FFT frame
//   uAudioBins  — number of bins in uAudioData
//   uPacketLoss — 0..1 normalized packet loss (triggers glitch)
//
// Outputs varyings consumed by hologram.frag:
//   vNormal     — world-space normal
//   vViewDir    — direction from surface to camera
//   vUv         — texture coord
//   vDisplace   — scalar displacement magnitude (for fragment edge FX)
//   vPosition   — world-space position
//
// Uses simplex noise (Ashima Arts / Stefan Gustavson) for organic motion.

precision highp float;

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform sampler2D uAudioData;
uniform float uAudioBins;
uniform float uPacketLoss;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying float vDisplace;
varying vec3 vPosition;

// ─── 3D Simplex noise (Ashima) ──────────────────────────────
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Sample one audio bin (0..1) from the data texture.
float sampleAudio(float binIndex){
  float u = (binIndex + 0.5) / uAudioBins;
  // DataTexture carries raw float amplitudes in the R channel.
  return texture2D(uAudioData, vec2(u, 0.5)).r;
}

void main(){
  vUv = uv;
  vec3 nrm = normalize(normal);

  // Bass drives a large slow wobble; treble drives tiny fast jitter.
  float slowNoise = snoise(position * 1.2 + vec3(uTime * 0.35));
  float fastNoise = snoise(position * 6.0 + vec3(uTime * 3.5));

  float bassDisplace = slowNoise * uBass * 0.35;
  float trebleDisplace = fastNoise * uTreble * 0.08;
  float midDisplace = snoise(position * 3.0 + vec3(uTime * 1.2)) * uMid * 0.18;

  // Sample a few specific bins for local spatial pulses (ears of the mesh react differently to bass)
  float localSample = sampleAudio(floor(abs(uv.x) * (uAudioBins - 1.0)));
  float localPulse = (1.0 + localSample) * 0.04;

  // Glitch displacement proportional to packet loss
  float glitchSeed = step(0.92, fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453));
  float glitchOffset = glitchSeed * uPacketLoss * 0.25;

  float displace = bassDisplace + midDisplace + trebleDisplace + localPulse + glitchOffset;
  vec3 displaced = position + nrm * displace;

  vDisplace = displace;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vPosition = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * nrm);
  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
