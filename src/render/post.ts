import * as T from 'three';

export function makePost(renderer: T.WebGLRenderer) {
  const world = new T.WebGLRenderTarget(1, 1, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new T.Scene();
  const geometry = new T.PlaneGeometry(2, 2);
  const material = new T.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      world: { value: world.texture }, pixel: { value: new T.Vector2(1, 1) },
      strength: { value: .22 }, grain: { value: 0 }, hit: { value: 0 }, warp: { value: 0 }, time: { value: 0 },
    },
    vertexShader: `varying vec2 screen; void main(){screen=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 screen; uniform sampler2D world; uniform vec2 pixel;
      uniform float strength;uniform float grain;uniform float hit;uniform float warp;uniform float time;
      vec3 bright(vec2 p){vec3 sampleColor=texture2D(world,p).rgb;return max(sampleColor-vec3(.43),0.);}
      void main(){
        vec2 p=screen;vec2 d=p-.5;vec2 q=p-d*dot(d,d)*warp*.1;
        vec3 base=texture2D(world,q).rgb; vec2 r=pixel*4.;
        vec3 halo=bright(q)*.24;
        halo+=(bright(q+vec2(r.x,0.))+bright(q-vec2(r.x,0.))+bright(q+vec2(0.,r.y))+bright(q-vec2(0.,r.y)))*.16;
        if(grain>0.)halo+=(bright(q+r*1.4)+bright(q-r*1.4)+bright(q+vec2(r.x,-r.y)*1.4)+bright(q+vec2(-r.x,r.y)*1.4))*.12;
        float noise=fract(sin(dot(gl_FragCoord.xy+time,vec2(12.9898,78.233)))*43758.5453)-.5;
        float edge=smoothstep(.17,.73,length(d));
        vec3 outColor=base+halo*strength+vec3(noise*grain)+edge*hit*vec3(.21,.032,.007);
        outColor+=edge*warp*vec3(.014,.043,.08);
        gl_FragColor=vec4(outColor,1.);
        #include <colorspace_fragment>
      }`,
  });
  const plane = new T.Mesh(geometry, material);
  plane.frustumCulled = false;
  scene.add(plane);
  return {
    resize(width: number, height: number) {
      world.setSize(width, height);
      material.uniforms.pixel.value.set(1 / width, 1 / height);
    },
    draw(main: T.Scene, viewpoint: T.Camera, high: boolean, time: number, hit: number, warp: number, reduced: boolean) {
      material.uniforms.strength.value = high ? .68 : .34;
      material.uniforms.grain.value = high ? .018 : 0;
      material.uniforms.hit.value = hit;
      material.uniforms.warp.value = warp;
      material.uniforms.time.value = reduced ? 0 : time * 55;
      renderer.setRenderTarget(world);
      renderer.render(main, viewpoint);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      world.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
