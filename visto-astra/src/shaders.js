export const vertex = `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.)).xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
export const earthFragment = `
uniform sampler2D dayMap,nightMap,detailMap,visitMap;
uniform vec3 sun;
uniform float time,clouds,visits;
varying vec2 vUv; varying vec3 vWorld,vNormal;
void main(){
 vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);
 vec3 detail=texture2D(detailMap,vUv).rgb;
 float h=detail.r;
 vec3 dp1=dFdx(vWorld),dp2=dFdy(vWorld);
 vec3 r1=cross(dp2,n),r2=cross(n,dp1);
 float det=dot(dp1,r1);
 vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
 vec3 bump=normalize(abs(det)*n-grad*.008);
 float light=dot(n,sun),diff=max(0.,dot(bump,sun));
 vec3 day=pow(texture2D(dayMap,vUv).rgb,vec3(2.2));
 vec3 night=pow(texture2D(nightMap,vUv).rgb,vec3(2.2));
 float ocean=1.-smoothstep(.1,.6,detail.g);
 day*=1.-ocean*.32;
 float wave=sin(vUv.x*2400.+time*.7)*sin(vUv.y*1600.-time*.4)*.006;
 float spec=pow(max(0.,dot(reflect(-sun,bump+wave),v)),80.)*ocean;
 float shadow=smoothstep(.22,.8,texture2D(detailMap,vUv+vec2(.002+time*.0006,.001)).b)*clouds;
 vec3 color=day*(.075+diff*1.55)*(1.-shadow*.35)+vec3(.7,.82,1.)*spec*.4;
 float darkness=1.-smoothstep(-.14,.08,light);
 color+=night*darkness*1.65;
 vec4 visit=texture2D(visitMap,vUv);
 color+=visit.rgb*visits*(.075+.04*diff);
 float fresnel=pow(1.-max(0.,dot(n,v)),3.);
 vec3 air=mix(vec3(.65,.19,.045),vec3(.075,.35,.7),smoothstep(-.15,.3,light));
 color+=air*fresnel*smoothstep(-.3,.5,light)*.6;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const cloudFragment=`
uniform sampler2D detailMap; uniform vec3 sun; uniform float time;
varying vec2 vUv; varying vec3 vWorld,vNormal;
void main(){float density=smoothstep(.2,.85,texture2D(detailMap,vUv+vec2(time*.0006,0.)).b);float light=dot(normalize(vNormal),sun);vec3 color=mix(vec3(.06,.09,.13),vec3(1.),smoothstep(-.2,.8,light));gl_FragColor=vec4(color,density*.77);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const atmosphereFragment=`
uniform vec3 sun; varying vec3 vWorld,vNormal;
void main(){vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);float rim=pow(max(0.,dot(n,-v)),1.15);float light=dot(n,sun);vec3 tint=mix(vec3(.65,.18,.05),vec3(.12,.43,.85),smoothstep(-.3,.35,light));float alpha=rim*smoothstep(-.5,.65,light)*1.7;gl_FragColor=vec4(tint,alpha);
 #include <colorspace_fragment>
}`;
export const routeVertex=`attribute float progress;varying float vProgress;void main(){vProgress=progress;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const routeFragment=`uniform vec3 color;uniform float time,reveal,opacity,record;varying float vProgress;void main(){if(vProgress>reveal)discard;if(record>.5&&fract(vProgress*25.)>.55)discard;float pulse=pow(max(0.,1.-abs(vProgress-fract(time*.13))/.07),2.);gl_FragColor=vec4(color,opacity*(.48+.52*pulse));}`;
