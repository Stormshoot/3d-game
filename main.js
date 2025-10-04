(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 100,
    airAccel: 12,
    friction: 0.92,
    jumpPower: 10,
    jumpBoost: 1.05,
    gravity: -40,
    maxHSpeed: 100,
    coyoteTime: 0.25,
    jumpBuffer: 0.2
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff,0x444444,0.7);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xffffff,0.6);
  scene.add(sunLight);

  const sky = new THREE.Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);
  const skyU = sky.material.uniforms;
  skyU['turbidity'].value = 10;
  skyU['rayleigh'].value = 2;
  skyU['mieCoefficient'].value = 0.005;
  skyU['mieDirectionalG'].value = 0.8;
  const sun = new THREE.Vector3();
  let timeOfDay = 0;

  const sunSphere = new THREE.Mesh(
    new THREE.SphereGeometry(20,16,8),
    new THREE.MeshBasicMaterial({color:0xffffcc,emissive:0xffffcc})
  );
  scene.add(sunSphere);

  const texLoader = new THREE.TextureLoader();
  const groundTex = texLoader.load("https://threejs.org/examples/textures/checker.png");
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(200,200);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.NearestFilter;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000,2000),
    new THREE.MeshStandardMaterial({map:groundTex,side:THREE.DoubleSide})
  );
  ground.rotation.x=-Math.PI/2;
  scene.add(ground);
  const objects=[ground];

  const player = {
    pos: new THREE.Vector3(0,PLAYER.eyeHeight,0),
    vel: new THREE.Vector3(),
    explosionVel: new THREE.Vector3(),
    yaw:0,
    pitch:0,
    grounded:true,
    coyoteTimer:0,
    jumpBufferTimer:0,
    runCap:PLAYER.runSpeed
  };

  function updateCamera(){camera.position.copy(player.pos); camera.rotation.set(player.pitch,player.yaw,0,"ZYX");}

  const keys = {};
  const keyMap = {'KeyW':'forward','ArrowUp':'forward','KeyS':'back','ArrowDown':'back','KeyA':'left','ArrowLeft':'left','KeyD':'right','ArrowRight':'right','ShiftLeft':'run','ShiftRight':'run','Space':'jump'};

  addEventListener('keydown', e=>{
    if(keyMap[e.code]){
      keys[keyMap[e.code]]=true;
      e.preventDefault();
      if(keyMap[e.code]==='jump') player.jumpBufferTimer=PLAYER.jumpBuffer;
    }
  });
  addEventListener('keyup', e=>{if(keyMap[e.code]) keys[keyMap[e.code]]=false;});

  renderer.domElement.requestPointerLock();

  document.addEventListener('mousemove', e=>{
    if(document.pointerLockElement!==renderer.domElement) return;
    const sens=0.0022;
    player.yaw-=e.movementX*sens;
    player.pitch-=e.movementY*sens;
    player.pitch=Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01,player.pitch));
  });

  const tracker=document.createElement('div');
  tracker.style.position='absolute';
  tracker.style.top='10px';
  tracker.style.left='10px';
  tracker.style.color='#fff';
  tracker.style.background='rgba(0,0,0,0.5)';
  tracker.style.padding='6px';
  tracker.style.fontFamily='monospace';
  tracker.style.whiteSpace='pre';
  document.body.appendChild(tracker);

  function getCameraDir(){
    const f=(keys.forward?1:0)-(keys.back?1:0);
    const s=(keys.right?1:0)-(keys.left?1:0);
    const dir=new THREE.Vector3(s,0,-f);
    if(dir.lengthSq()===0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0),player.yaw);
    return dir;
  }

  const explosions=[];
  const raycaster=new THREE.Raycaster();
  const mouse=new THREE.Vector2(0,0);

  function spawnExplosionAt(point){
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,16,16),new THREE.MeshBasicMaterial({color:0xffdd00,transparent:true,opacity:0.25}));
    sphere.position.copy(point);
    scene.add(sphere);
    explosions.push({mesh:sphere,time:0,point:point});
    const toPlayer=player.pos.clone().sub(point);
    const dist=toPlayer.length();
    if(dist<50){
      const force=(50-dist)/50*120;
      toPlayer.normalize();
      player.explosionVel.add(toPlayer.multiplyScalar(force));
    }
  }

  const gun=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.25,1.2),new THREE.MeshStandardMaterial({color:0x222222}));
  body.position.set(0.4,-0.35,-0.6); gun.add(body);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.9,8),new THREE.MeshStandardMaterial({color:0x111111}));
  barrel.rotation.x=Math.PI/2; barrel.position.set(0.8,-0.35,-0.2); gun.add(barrel);
  const grip=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.4,0.15),new THREE.MeshStandardMaterial({color:0x111111}));
  grip.position.set(0.05,-0.6,-0.6); gun.add(grip);
  gun.position.set(0.6,-0.5,-0.9); camera.add(gun); scene.add(camera);

  let lastShot=0;
  const fireRate=0.12;
  function doMuzzleFlash(pos){
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,8),new THREE.MeshBasicMaterial({color:0xffee99,transparent:true,opacity:1}));
    m.position.copy(pos); scene.add(m);
    let t=0;
    const interval=setInterval(()=>{
      t+=0.016;
      m.scale.setScalar(1+t*6);
      m.material.opacity=Math.max(0,1-t*3);
      if(t>0.2){scene.remove(m); clearInterval(interval);}
    },16);
  }

  document.addEventListener('mousedown', e=>{
    if(document.pointerLockElement!==renderer.domElement) return;
    const now=performance.now()/1000;
    if(now-lastShot<fireRate) return;
    lastShot=now;
    const barrelWorld=new THREE.Vector3();
    barrel.getWorldPosition(barrelWorld);
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const muzzlePos=barrelWorld.clone().add(forward.clone().multiplyScalar(1.0));
    doMuzzleFlash(muzzlePos);
    raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObjects(objects);
    if(hits.length>0) spawnExplosionAt(hits[0].point.clone());
    else spawnExplosionAt(camera.position.clone().add(forward.multiplyScalar(500)));
    player.explosionVel.add(forward.clone().multiplyScalar(-3));
  });

  function applyExplosions(dt){
    for(let i=explosions.length-1;i>=0;i--){
      const ex=explosions[i];
      ex.time+=dt;
      ex.mesh.scale.setScalar(1+ex.time*4);
      ex.mesh.material.opacity=0.25*(1-ex.time/0.5);
      if(ex.time>0.5){ scene.remove(ex.mesh); explosions.splice(i,1); }
    }
  }

  let prevTime=performance.now()/1000;
  function animate(){
    requestAnimationFrame(animate);
    if(document.pointerLockElement!==renderer.domElement) return;
    const now=performance.now()/1000;
    const dt=Math.min(0.1,now-prevTime); prevTime=now;

    timeOfDay+=dt*60;
    if(timeOfDay>360) timeOfDay-=360;
    const phi=THREE.MathUtils.degToRad(90-(Math.sin(timeOfDay*Math.PI/180)*90));
    const theta=THREE.MathUtils.degToRad(timeOfDay);
    sun.setFromSphericalCoords(1,phi,theta);
    skyU['sunPosition'].value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(50);
    sunSphere.position.copy(sun).multiplyScalar(400);
    const brightness=Math.max(0,sun.y);
    sunLight.intensity=0.6*brightness; hemi.intensity=0.2+0.5*brightness;

    if(player.grounded) player.coyoteTimer=PLAYER.coyoteTime;
    else player.coyoteTimer-=dt;
    if(player.jumpBufferTimer>0) player.jumpBufferTimer-=dt;

    const dir=getCameraDir();
    let hVel=new THREE.Vector3(player.vel.x,0,player.vel.z);
    let currentSpeed=hVel.length();
    const targetSpeed=(keys.run?player.runCap:PLAYER.walkSpeed);

    if(dir.lengthSq()>0){
      if(currentSpeed<1e-4){ hVel.copy(dir.clone().multiplyScalar(targetSpeed)); currentSpeed=targetSpeed; }
      else{
        const accel=player.grounded?PLAYER.accel:PLAYER.airAccel;
        hVel.addScaledVector(dir,accel*dt);
        if(hVel.length()>targetSpeed) hVel.setLength(targetSpeed);
        currentSpeed=hVel.length();
        hVel.copy(dir.clone().multiplyScalar(currentSpeed));
      }
    }
    if(player.grounded && dir.lengthSq()===0) hVel.multiplyScalar(PLAYER.friction);
    player.vel.x=hVel.x+player.explosionVel.x;
    player.vel.z=hVel.z+player.explosionVel.z;
    player.vel.y+=PLAYER.gravity*dt;

    if(player.jumpBufferTimer>0&&(player.grounded||player.coyoteTimer>0)){
      player.grounded=false; player.jumpBufferTimer=0;
      const hv=new THREE.Vector3(player.vel.x,0,player.vel.z).multiplyScalar(PLAYER.jumpBoost);
      player.vel.x=hv.x+player.explosionVel.x; player.vel.z=hv.z+player.explosionVel.z;
      const hSpeed=Math.sqrt(player.vel.x*player.vel.x+player.vel.z*player.vel.z);
      const flatten=Math.min(hSpeed*0.08,PLAYER.jumpPower*0.6);
      player.vel.y=PLAYER.jumpPower-flatten;
      player.runCap*=PLAYER.jumpBoost;
    }

    player.pos.addScaledVector(player.vel,dt);
    const wrapLimit=1000;
    if(player.pos.x>wrapLimit) player.pos.x=-wrapLimit;
    if(player.pos.x<-wrapLimit) player.pos.x=wrapLimit;
    if(player.pos.z>wrapLimit) player.pos.z=-wrapLimit;
    if(player.pos.z<-wrapLimit) player.pos.z=wrapLimit;

    if(player.pos.y<PLAYER.eyeHeight){player.pos.y=PLAYER.eyeHeight;player.vel.y=0;player.grounded=true;} else player.grounded=false;

    let hSpeed=Math.sqrt(player.vel.x*player.vel.x+player.vel.z*player.vel.z);
    if(hSpeed>PLAYER.maxHSpeed){player.vel.x=player.vel.x/hSpeed*PLAYER.maxHSpeed;player.vel.z=player.vel.z/hSpeed*PLAYER.maxHSpeed;hSpeed=PLAYER.maxHSpeed;}
    if(hSpeed<=PLAYER.walkSpeed-0.5){player.vel.x=0;player.vel.z=0;hSpeed=0;player.runCap=PLAYER.runSpeed;}
    player.explosionVel.multiplyScalar(0.92);

    applyExplosions(dt);
    updateCamera();
    tracker.textContent=`X:${player.pos.x.toFixed(2)} Y:${player.pos.y.toFixed(2)} Z:${player.pos.z.toFixed(2)}\nSpeed:${hSpeed.toFixed(2)} runCap:${player.runCap.toFixed(2)}`;
    renderer.render(scene,camera);
  }
  animate();

  addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
})();
