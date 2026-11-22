/* GradientASCII: vanilla port of the React component (WebGL2).
   Usage: GradientASCII(element, { colors, shape, flip, ... }) -> dispose() | null (no WebGL2)
   Shapes: 'horizon' | 'rise'.  flip:true mirrors the shape vertically (glyphs stay upright). */
(() => {
  const MAX_COLORS = 8, MAX_CLICKS = 4, MAX_TRAIL = 24;
  const CLICK_LIFE = 1.2, TRAIL_LIFE = 0.7, TRAIL_STEP = 0.015, INTRO_SECONDS = 2.4;
  const CELL_W = 60, CELL_H = 100, COLS = 16, FONT_SCALE = 0.78;
  const SHAPES = { horizon: 0, rise: 1 }, CLICKS = { none: 0, wave: 1, burst: 2 };
  const DEFAULTS = {
    colors: ['#1e3fd8', '#f6f8ff', '#a5d8ff', '#38bdf8'], shape: 'horizon', flip: false,
    characters: ' =+xX0S8#@', cellSize: 18, density: 0.8, glyphOpacity: 0.85, glow: 0.2,
    flicker: 0.2, softness: 0.5, scale: 1, flow: 0.5, speed: 1, gradientOpacity: 0.9, grain: 0.08,
    mouseInteraction: true, scrambleRadius: 0.1, clickEffect: 'wave', intro: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  };

  const VERTEX = `#version 300 es
out vec2 vUv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

  const COMMON = `
float hash12(vec2 p){vec3 q=fract(vec3(p.xyx)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}`;

  const FIELD = `#version 300 es
precision highp float;
precision highp int;
uniform float uAspect,uTime,uScale,uSoftness,uFlow,uRadius,uIntro,uFrame,uFlip;
uniform int uShape,uCount,uClickEffect;
uniform vec3 uRamp[8];
uniform vec4 uTrail[24];
uniform vec4 uClicks[4];
uniform vec2 uSeed;
in vec2 vUv;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outAux;
${COMMON}
vec2 hash22(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(0.1031,0.103,0.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy)*2.0-1.0;}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.0-15.0)+10.0);
  float a=dot(hash22(i),f),b=dot(hash22(i+vec2(1,0)),f-vec2(1,0));
  float c=dot(hash22(i+vec2(0,1)),f-vec2(0,1)),d=dot(hash22(i+vec2(1,1)),f-vec2(1,1));
  return 0.5+0.5*mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
vec3 labToRgb(vec3 lab){
  float l=lab.x+0.3963377774*lab.y+0.2158037573*lab.z;
  float m=lab.x-0.1055613458*lab.y-0.0638541728*lab.z;
  float s=lab.x-0.0894841775*lab.y-1.2914855480*lab.z;
  l=l*l*l;m=m*m*m;s=s*s*s;
  return vec3(4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.7076147010*s);
}
vec3 encode(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));}
vec3 horizon(vec2 p,float time,out float order){
  float span=0.5*max(uAspect,1.0),x=p.x/span;
  float arch=-0.17-0.2*x*x+0.02*sin(time*0.6);
  float soft=mix(0.05,0.22,uSoftness),edge=p.y-arch;
  float rim=0.38*smoothstep(-soft,0.42,edge);
  vec2 sun=vec2(0.08*sin(time*0.31)*span,0.58);
  float spread=length((p-sun)/vec2(0.95*span,0.75));
  float sky=mix(0.55,1.0,smoothstep(0.2,0.95,spread));
  order=clamp(edge*1.3,0.0,1.0);
  return vec3(rim,sky,smoothstep(0.18,0.62,edge));
}
vec3 rise(vec2 p,float time,out float order){
  float wide=max(uAspect,0.9);
  vec2 center=vec2(0.05*sin(time*0.45)*wide,-0.55);
  vec2 radius=vec2(0.62*wide,1.1*(1.0+0.04*sin(time*0.8)));
  float d=length((p-center)/radius),soft=mix(0.6,1.15,uSoftness);
  float t=clamp(pow(clamp(1.0-d,0.0,1.0),soft)*1.35,0.0,1.0);
  order=clamp((d-0.2)*1.3,0.0,1.0);
  return vec3(t,t,0.0);
}
vec4 tone(float t){
  float x=smoothstep(0.3,1.0,t)*float(uCount-1);
  int i=int(floor(x));
  return vec4(mix(uRamp[i],uRamp[min(i+1,uCount-1)],fract(x)),smoothstep(0.0,0.38,t));
}
void main(){
  vec2 p=(vUv-0.5)*vec2(uAspect,1.0);
  float time=uTime;
  vec2 q=p/uScale; q.y*=uFlip;
  vec2 warp=vec2(noise(q*1.6+uSeed+vec2(0.0,time*0.3)),noise(q*1.6+uSeed.yx+vec2(4.3,-time*0.24)))-0.5;
  q+=warp*uFlow*0.18;
  float order=0.0; vec3 shape;
  if(uShape==0) shape=horizon(q,time,order); else shape=rise(q,time,order);
  float reveal=clamp((uIntro*1.45-order)/0.45,0.0,1.0);
  reveal=reveal*reveal*(3.0-2.0*reveal);
  float scramble=0.0;
  for(int i=0;i<24;i++){
    vec4 pt=uTrail[i]; if(pt.z<=0.0) continue;
    vec2 d=p-pt.xy; scramble=max(scramble,pt.z*exp(-dot(d,d)/(uRadius*uRadius)));
  }
  for(int i=0;i<4;i++){
    vec4 c=uClicks[i]; if(c.w<=0.0) continue;
    float d=length(p-c.xy);
    if(uClickEffect==1) scramble=max(scramble,exp(-pow((d-c.z*0.75)/0.06,2.0))*c.w);
    else if(uClickEffect==2){float size=0.08+0.22*(1.0-exp(-c.z*5.0));scramble=max(scramble,(1.0-smoothstep(size*0.6,size,d))*c.w);}
  }
  vec2 t=clamp(shape.xy*mix(0.7,1.0,reveal),0.0,1.0);
  vec4 mixed=mix(tone(t.x),tone(t.y),shape.z);
  vec3 color=encode(labToRgb(mixed.rgb));
  float alpha=mixed.a*reveal;
  float dither=(hash12(gl_FragCoord.xy+uFrame*13.7)-0.5)/255.0;
  outColor=clamp(vec4(color*alpha+dither,alpha+dither),0.0,1.0);
  outAux=vec4(reveal,scramble,0.0,1.0);
}`;

  const GLYPHS = `
uniform sampler2D uField,uAux,uAtlas;
uniform vec2 uResolution,uCell,uOffset,uAtlasGrid;
uniform float uCount,uDensity,uOpacity,uFlicker,uGlyphTime;
${COMMON}
float sampleGlyph(float index,vec2 local,vec2 coord){
  float col=mod(index,uAtlasGrid.x),row=floor(index/uAtlasGrid.x);
  vec2 uv=vec2((col+local.x)/uAtlasGrid.x,(row+1.0-local.y)/uAtlasGrid.y);
  vec2 cont=coord/uAtlasGrid;
  return textureGrad(uAtlas,uv,dFdx(cont),dFdy(cont)).a;
}
vec4 glyphAt(vec2 px){
  vec2 coord=(px-uOffset)/uCell,cell=floor(coord),local=coord-cell;
  vec2 uv=clamp(((cell+0.5)*uCell+uOffset)/uResolution,vec2(0.0),vec2(1.0));
  vec4 field=texture(uField,uv),aux=texture(uAux,uv);
  float value=dot(field.rgb,vec3(0.2126,0.7152,0.0722));
  float pick=hash12(cell),level=hash12(cell*1.73+4.1);
  float tick=floor(uGlyphTime*9.0+level*9.0);
  float wobble=(hash12(cell*2.31+tick*17.7)-0.5)*uFlicker*0.4+(level-0.5)*0.1;
  float tone=clamp(pow(value,0.75)+wobble,0.0,1.0);
  float index=floor(tone*(uCount-1.0)+0.5);
  float decode=max(aux.g,1.0-aux.r);
  if(decode>0.02){
    float f=floor(uGlyphTime*20.0);
    if(hash12(cell*3.7+f*5.3)<decode*1.25) index=1.0+floor(hash12(cell+f*1.37)*(uCount-1.0));
  }
  float present=step(pick,uDensity*mix(1.0,0.3+tone*1.1,0.55));
  float cutoff=smoothstep(0.03,0.1,value);
  float alpha=uOpacity*present*cutoff*sampleGlyph(index,local,coord)*mix(1.0,0.35+0.65*level,0.55);
  vec3 ink=field.rgb*0.9+vec3(0.03)*field.a;
  return vec4(ink*alpha,0.6*field.a*alpha);
}`;

  const HALO = `#version 300 es
precision highp float;
uniform float uDownscale;
in vec2 vUv; out vec4 outColor;
${GLYPHS}
void main(){outColor=glyphAt(gl_FragCoord.xy*uDownscale);}`;

  const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource; uniform vec2 uStep;
in vec2 vUv; out vec4 outColor;
void main(){
  vec4 s=texture(uSource,vUv)*0.2270270270;
  s+=texture(uSource,vUv+uStep*1.3846153846)*0.3162162162;
  s+=texture(uSource,vUv-uStep*1.3846153846)*0.3162162162;
  s+=texture(uSource,vUv+uStep*3.2307692308)*0.0702702703;
  s+=texture(uSource,vUv-uStep*3.2307692308)*0.0702702703;
  outColor=s;
}`;

  const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uHalo;
uniform float uGlow,uGradient,uGrain,uFrame;
in vec2 vUv; out vec4 outColor;
${GLYPHS}
void main(){
  vec4 color=texture(uField,vUv)*uGradient+glyphAt(gl_FragCoord.xy)+texture(uHalo,vUv)*uGlow;
  float grain=(hash12(gl_FragCoord.xy+uFrame*vec2(17.0,59.0))+hash12(gl_FragCoord.xy*1.31+uFrame*7.0)-1.0)*uGrain;
  color.rgb+=grain*(0.25+clamp(color.a,0.0,1.0))*0.5;
  color.a=clamp(color.a,0.0,1.0);
  color.rgb=clamp(color.rgb,0.0,color.a);
  outColor=color;
}`;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const toLab = ([r, g, b]) => {
    const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ];
  };

  const compile = (gl, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const link = (gl, fragSrc) => {
    const v = compile(gl, gl.VERTEX_SHADER, VERTEX), f = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    gl.attachShader(program, v);
    gl.attachShader(program, f);
    gl.linkProgram(program);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    const uniforms = {};
    for (let i = 0, n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  };

  const createTarget = (gl, count) => ({
    textures: Array.from({ length: count }, () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }),
    framebuffer: gl.createFramebuffer(), width: 0, height: 0
  });
  const sizeTarget = (gl, target, w, h) => {
    if (target.width === w && target.height === h) return;
    target.width = w; target.height = h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    target.textures.forEach((t, i) => {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const buildAtlas = (gl, characters, fontFamily) => {
    const list = [...new Set([...characters].filter(c => c !== '\n' && c !== '\r'))];
    if (!list.length) list.push(' ');
    const columns = Math.min(COLS, list.length), rows = Math.ceil(list.length / columns);
    const cv = document.createElement('canvas');
    cv.width = CELL_W * columns;
    cv.height = CELL_H * rows;
    const c = cv.getContext('2d');
    c.font = `300 ${Math.round(CELL_H * FONT_SCALE)}px ${fontFamily}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    list.forEach((ch, i) => c.fillText(ch, (i % columns) * CELL_W + CELL_W / 2, Math.floor(i / columns) * CELL_H + CELL_H / 2 + 3));
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, count: list.length, grid: [columns, rows] };
  };

  window.GradientASCII = (container, options = {}) => {
    const o = { ...DEFAULTS, ...options };
    const colors = (o.colors.length > 1 ? o.colors : [o.colors[0], o.colors[0]]).slice(0, MAX_COLORS);
    const s = {
      shape: SHAPES[o.shape] ?? 0, flip: o.flip ? -1 : 1, characters: o.characters || DEFAULTS.characters,
      cellSize: clamp(o.cellSize, 6, 64), density: clamp(o.density, 0, 1), glyphOpacity: clamp(o.glyphOpacity, 0, 1),
      glow: clamp(o.glow, 0, 2), flicker: clamp(o.flicker, 0, 1), softness: clamp(o.softness, 0, 1),
      scale: clamp(o.scale, 0.4, 2.5), flow: clamp(o.flow, 0, 2), speed: Math.max(0, o.speed),
      gradientOpacity: clamp(o.gradientOpacity, 0, 1), grain: clamp(o.grain, 0, 0.4),
      scrambleRadius: clamp(o.scrambleRadius, 0.02, 0.4), clickEffect: CLICKS[o.clickEffect] ?? 1
    };

    const canvas = document.createElement('canvas');
    canvas.className = 'gradient-ascii-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return null;
    const field = link(gl, FIELD), halo = link(gl, HALO), blur = link(gl, BLUR), composite = link(gl, COMPOSITE);
    if (!field || !halo || !blur || !composite) return null;
    container.append(canvas);

    const vao = gl.createVertexArray();
    const fieldTarget = createTarget(gl, 2), haloA = createTarget(gl, 1), haloB = createTarget(gl, 1);
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const ramp = new Float32Array(MAX_COLORS * 3);
    colors.forEach((c, i) => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#000';
      probe.fillStyle = c;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      ramp.set(toLab([r / 255, g / 255, b / 255]), i * 3);
    });

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const view = { width: 1, height: 1, ratio: 1 };
    const clickData = new Float32Array(MAX_CLICKS * 4), trailData = new Float32Array(MAX_TRAIL * 4);
    const clicks = [], trail = [], pointer = { x: 0, y: 0, inside: false };
    let atlas = buildAtlas(gl, s.characters, o.fontFamily);
    let time = 0, glyphTime = 0, introClock = o.intro && !reduce ? 0 : 1, frameSeed = 0, grainClock = 0;
    let raf = 0, last = 0, visible = true, disposed = false;

    document.fonts?.load?.(`300 64px ${o.fontFamily}`, s.characters).then(() => {
      if (disposed) return;
      gl.deleteTexture(atlas.texture);
      atlas = buildAtlas(gl, s.characters, o.fontFamily);
      draw();
    }, () => {});

    const bindGlyphs = (program, width, height) => {
      const u = program.uniforms;
      const cellH = s.cellSize * view.ratio, cellW = cellH * (CELL_W / CELL_H);
      [fieldTarget.textures[0], fieldTarget.textures[1], atlas.texture].forEach((t, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
      });
      gl.uniform1i(u.uField, 0); gl.uniform1i(u.uAux, 1); gl.uniform1i(u.uAtlas, 2);
      gl.uniform2f(u.uResolution, width, height);
      gl.uniform2f(u.uCell, cellW, cellH);
      gl.uniform2f(u.uOffset, (width - Math.ceil(width / cellW) * cellW) / 2, (height - Math.ceil(height / cellH) * cellH) / 2);
      gl.uniform2f(u.uAtlasGrid, atlas.grid[0], atlas.grid[1]);
      gl.uniform1f(u.uCount, atlas.count);
      gl.uniform1f(u.uDensity, s.density);
      gl.uniform1f(u.uOpacity, s.glyphOpacity);
      gl.uniform1f(u.uFlicker, reduce ? 0 : s.flicker);
      gl.uniform1f(u.uGlyphTime, glyphTime);
    };

    const pass = (target, program, count = 1) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.drawBuffers(Array.from({ length: count }, (_, i) => gl.COLOR_ATTACHMENT0 + i));
      gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
      gl.useProgram(program.program);
    };

    function draw() {
      const aspect = view.width / view.height;
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);

      pass(fieldTarget, field, 2);
      const fu = field.uniforms;
      gl.uniform1f(fu.uAspect, aspect); gl.uniform1f(fu.uTime, time); gl.uniform1i(fu.uShape, s.shape);
      gl.uniform3fv(fu.uRamp, ramp); gl.uniform1i(fu.uCount, colors.length);
      gl.uniform1f(fu.uScale, s.scale); gl.uniform1f(fu.uSoftness, s.softness); gl.uniform1f(fu.uFlow, s.flow);
      gl.uniform1f(fu.uFlip, s.flip); gl.uniform2f(fu.uSeed, 0, 0);
      gl.uniform4fv(fu.uTrail, trailData); gl.uniform1f(fu.uRadius, s.scrambleRadius);
      gl.uniform4fv(fu.uClicks, clickData); gl.uniform1i(fu.uClickEffect, s.clickEffect);
      gl.uniform1f(fu.uIntro, introClock); gl.uniform1f(fu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const glowing = s.glow > 0.001;
      if (glowing) {
        pass(haloA, halo);
        bindGlyphs(halo, canvas.width, canvas.height);
        gl.uniform1f(halo.uniforms.uDownscale, canvas.width / haloA.width);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        pass(haloB, blur);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(blur.uniforms.uSource, 0);
        gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
        gl.uniform2f(blur.uniforms.uStep, 1 / haloA.width, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, haloB.textures[0]);
        gl.uniform2f(blur.uniforms.uStep, 0, 1 / haloA.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      pass(null, composite);
      bindGlyphs(composite, canvas.width, canvas.height);
      const cu = composite.uniforms;
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
      gl.uniform1i(cu.uHalo, 3);
      gl.uniform1f(cu.uGlow, glowing ? s.glow : 0);
      gl.uniform1f(cu.uGradient, s.gradientOpacity);
      gl.uniform1f(cu.uGrain, s.grain);
      gl.uniform1f(cu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const resize = () => {
      view.width = Math.max(1, container.clientWidth);
      view.height = Math.max(1, container.clientHeight);
      view.ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      sizeTarget(gl, fieldTarget, Math.max(1, Math.round(canvas.width / 2)), Math.max(1, Math.round(canvas.height / 2)));
      const hw = Math.max(1, Math.round(canvas.width / 4)), hh = Math.max(1, Math.round(canvas.height / 4));
      sizeTarget(gl, haloA, hw, hh);
      sizeTarget(gl, haloB, hw, hh);
      draw();
      wake();
    };

    const updateInput = dt => {
      trail.forEach(p => { p.age += dt; });
      while (trail.length && trail[trail.length - 1].age > TRAIL_LIFE) trail.pop();
      for (let i = 0; i < MAX_TRAIL; i++) {
        const p = trail[i];
        if (!p) { trailData[i * 4 + 2] = 0; continue; }
        const k = 1 - p.age / TRAIL_LIFE;
        trailData.set([p.x, p.y, k * k, 0], i * 4);
      }
      clicks.forEach(c => { c.age += dt; });
      while (clicks.length && clicks[clicks.length - 1].age > CLICK_LIFE) clicks.pop();
      for (let i = 0; i < MAX_CLICKS; i++) {
        const c = clicks[i];
        if (!c) { clickData[i * 4 + 3] = 0; continue; }
        const k = c.age / CLICK_LIFE;
        clickData.set([c.x, c.y, c.age, Math.min(1, c.age / 0.08) * (1 - k) * (1 - k)], i * 4);
      }
    };

    const frame = now => {
      raf = 0;
      if (disposed || !visible || document.hidden) return;
      const dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 1 / 60;
      last = now;
      if (!reduce) { time += dt * s.speed * 0.5; glyphTime += dt * Math.max(s.speed, 0.15); }
      if (introClock < 1) introClock = Math.min(1, introClock + dt / INTRO_SECONDS);
      grainClock += dt;
      if (!reduce && grainClock > 1 / 24) { grainClock = 0; frameSeed = (frameSeed + 1) % 97; }
      updateInput(dt);
      draw();
      if (!reduce || introClock < 1 || clicks.length || trail.length) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    function wake() { if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(frame); }

    const locate = e => {
      const r = container.getBoundingClientRect();
      const x = (e.clientX - r.left) / Math.max(1, r.width), y = 1 - (e.clientY - r.top) / Math.max(1, r.height);
      pointer.inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      pointer.x = (x - 0.5) * (r.width / Math.max(1, r.height));
      pointer.y = y - 0.5;
    };
    const onMove = e => {
      locate(e);
      if (!pointer.inside || !o.mouseInteraction || reduce) return;
      const head = trail[0];
      const gap = head ? Math.hypot(pointer.x - head.x, pointer.y - head.y) : Infinity;
      if (gap < TRAIL_STEP) return;
      if (head && head.age < 0.1) {
        const steps = Math.min(6, Math.floor(gap / (TRAIL_STEP * 2)));
        for (let i = 1; i <= steps; i++) {
          const k = i / (steps + 1);
          trail.unshift({ x: head.x + (pointer.x - head.x) * k, y: head.y + (pointer.y - head.y) * k, age: 0 });
        }
      }
      trail.unshift({ x: pointer.x, y: pointer.y, age: 0 });
      trail.length = Math.min(trail.length, MAX_TRAIL);
      wake();
    };
    const onDown = e => {
      locate(e);
      if (!pointer.inside || !s.clickEffect || reduce) return;
      clicks.unshift({ x: pointer.x, y: pointer.y, age: 0 });
      if (clicks.length > MAX_CLICKS) clicks.pop();
      wake();
    };
    const onVisibility = () => { last = 0; wake(); };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    const io = new IntersectionObserver(entries => {
      visible = entries.some(en => en.isIntersecting);
      if (visible) { last = 0; wake(); }
    });
    io.observe(container);
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    return () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  };
})();