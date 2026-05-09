// Hologram fragment shader — iridescent, scanlined, glitchy avatar.
//
// Uniforms:
//   uTime        — elapsed seconds
//   uPacketLoss  — 0..1 normalized packet loss — drives glitch intensity & chromatic aberration
//   uSentiment   — -1..1 signed sentiment score:
//                     < 0 → cool (blues/teals)
//                     = 0 → neutral (cyan/magenta iridescence)
//                     > 0 → warm (golds/corals)
//                 strong negative & high energy → reddens (angry)
//   uScanlineSpeed — scanline scroll speed (units/sec)
//
// Varyings come from hologram.vert.

precision highp float;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying float vDisplace;
varying vec3 vPosition;

uniform float uTime;
uniform float uPacketLoss;
uniform float uSentiment;
uniform float uScanlineSpeed;

// Cheap deterministic hash for glitch seed
float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// HSV → RGB for iridescence blending
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Sentiment → base hue shift. -1 cool (blue ~0.6), 0 cyan/magenta base,
// +1 warm (gold ~0.12). Strong negative nudges to red (~0.98).
vec3 sentimentColor(float sentiment){
  float angryBias = smoothstep(-1.0, -0.6, sentiment) * 0.0
                 + (1.0 - smoothstep(-1.0, -0.6, sentiment)) * 1.0; // 1 if very negative
  float coolHue = mix(0.98, 0.6, angryBias); // red↔blue blend on negative
  float warmHue = 0.12;
  float neutral = 0.52;

  vec3 cool = hsv2rgb(vec3(coolHue, 0.75, 0.95));
  vec3 warm = hsv2rgb(vec3(warmHue, 0.85, 1.0));
  vec3 mid  = hsv2rgb(vec3(neutral, 0.9, 1.0));

  if (sentiment < 0.0){
    return mix(mid, cool, clamp(-sentiment, 0.0, 1.0));
  }
  return mix(mid, warm, clamp(sentiment, 0.0, 1.0));
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);

  // Fresnel (edge glow)
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  // View-angle iridescence — shift hue by dot(N,V)
  float iridHue = fract(dot(N, V) * 1.3 + uTime * 0.04);
  vec3 iridescent = hsv2rgb(vec3(iridHue, 0.75, 1.0));

  // Blend sentiment-driven color with iridescent pattern
  vec3 sentCol = sentimentColor(clamp(uSentiment, -1.0, 1.0));
  vec3 baseCol = mix(sentCol, iridescent, 0.55);

  // Scanlines scrolling upward
  float scan = sin(vUv.y * 180.0 - uTime * uScanlineSpeed);
  float scanMask = smoothstep(0.8, 1.0, scan) * 0.35;

  // Horizontal glitch bands triggered by packet loss
  float bandY = floor(vUv.y * 40.0) / 40.0;
  float bandNoise = hash(vec2(bandY, floor(uTime * 12.0)));
  float glitchBand = step(1.0 - uPacketLoss * 0.9, bandNoise);
  float offsetAmt = (bandNoise - 0.5) * uPacketLoss * 0.08;

  // Apply horizontal UV shear for glitched bands
  vec2 glitchedUv = vec2(vUv.x + glitchBand * offsetAmt, vUv.y);

  // Chromatic aberration proportional to packet loss (displaces edge color)
  float aberration = 0.003 + uPacketLoss * 0.02;
  float r = baseCol.r + fresnel * 0.6;
  float g = baseCol.g + fresnel * 0.5;
  float b = baseCol.b + fresnel * 0.8;

  // Sample-like offset trick — we're procedural so tint channels instead
  vec3 aberrated = vec3(
    r * (1.0 + aberration * 2.0),
    g,
    b * (1.0 + aberration * 2.0)
  );

  // Scanline darkening
  vec3 col = aberrated - scanMask;

  // Boost at displaced peaks (simulates energy release)
  col += vDisplace * vec3(0.15, 0.2, 0.35);

  // Edge hotspots
  col += fresnel * vec3(0.4, 0.6, 1.0) * 0.7;

  // Low-alpha translucent hologram look
  float alpha = 0.55 + fresnel * 0.4 + scanMask * 0.1;
  alpha = clamp(alpha, 0.0, 1.0);

  // Glitch flicker for extreme packet loss
  float flicker = 1.0 - step(0.98, hash(vec2(floor(uTime * 30.0), 1.0))) * uPacketLoss * 0.7;
  col *= flicker;

  // Slight desaturation when sentiment is strongly negative (angry) — bleed to red
  if (uSentiment < -0.6){
    float angry = (-uSentiment - 0.6) / 0.4;
    col = mix(col, vec3(1.0, 0.15, 0.05) * length(col), clamp(angry, 0.0, 0.6));
  }

  // Apply glitch band UV shift as a tiny secondary tint to the final color
  col += glitchBand * vec3(0.05, -0.05, 0.1) * uPacketLoss;

  // Use glitchedUv to influence a subtle diagonal scan (prevents unused-variable removal)
  col += sin(glitchedUv.x * 60.0) * 0.01;

  gl_FragColor = vec4(col, alpha);
}
