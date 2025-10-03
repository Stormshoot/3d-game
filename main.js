(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 25,
    airAccel: 12,
    friction: 0.92,
    jumpPower: 5,
    jumpBoost: 1.05,
    gravity: -9.81,
    maxHSpeed: 100,
    coyoteTime: 0.25,
    jumpBuffer: 0.2
  };

  const WORLD_SIZE = 2000;
  let animationStarted = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccff);
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff,0x444444,0.7));
  const sun = new THREE.DirectionalLight(0xffffff,0.6);
  sun.position.set(5,10,5);
  scene.add(sun);

  // Ground
  const texLoader = new THREE.TextureLoader();
  const groundTex = texLoader.load("https://threejs.org/examples/textures/checker.png");
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(400,400);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.LinearMipMapLinearFilter;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE,WORLD_SIZE),
    new THREE.MeshStandardMaterial({ map: groundTex, side: THREE.DoubleSide })
  );
  ground.rotation.x=-Math.PI/2;
  scene.add(ground);
  const objects = [ground];

  // Player
  const player = {
    pos:new THREE.Vector3(0,PLAYER.eyeHeight,0),
    vel:new THREE.Vector3(),
    yaw:0,
    pitch:0,
    grounded:true,
    coyoteTimer:0,
    jumpBufferTimer:0,
    runCap: PLAYER.runSpeed
  };

  function updateCamera(){ camera.position.copy(player.pos); camera.rotation.set(player.pitch,player.yaw,0,"ZYX"); }

  // Input
  const keys={};
  const keyMap={
    'KeyW':'forward','ArrowUp':'forward',
    'KeyS':'back','ArrowDown':'back',
    'KeyA':'left','ArrowLeft':'left',
    'KeyD':'right','ArrowRight':'right',
    'ShiftLeft':'run','ShiftRight':'run',
    'Space':'jump','KeyP':'toggleLine'
  };

  addEventListener('keydown',e=>{
    if(keyMap[e.code]){
      keys[keyMap[e.code]]=true;e.preventDefault();
      if(keyMap[e.code]==='jump') player.jumpBufferTimer = PLAYER.jumpBuffer;
      if(keyMap[e.code]==='toggleLine') crossLine.visible=!crossLine.visible;
    }
  });
  addEventListener('keyup',e=>{ if(keyMap[e.code]) keys[keyMap[e.code]]=false; });

  // Pointer lock
  const overlay=document.getElementById('overlay');
  const startBtn=document.getElementById('startBtn');
  startBtn.addEventListener('click',()=>{
    renderer.domElement.requestPointerLock();
    if(!animationStarted){ animate(); animationStarted=true; }
  });
  document.addEventListener('pointerlockchange',()=>{
    overlay.style.display=(document.pointerLockElement===renderer.domElement)?'none':'';
  });

  document.addEventListener('mousemove',e=>{
    if(document.pointerLockElement!==renderer.domElement) return;
    const sens=0.0022;
    player.yaw -= e.movementX*sens;
    player.pitch -= e.movementY*sens;
    player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  });

  // Debug tracker
  const tracker = document.createElement('div');
  tracker.style.position='absolute';
  tracker.style.top='10px';
  tracker.style.left='10px';
  tracker.style.color='#fff';
  tracker.style.background='rgba(0,0,0,0.5)';
  tracker.style.padding='6px';
  tracker.style.fontFamily='monospace';
  tracker.style.whiteSpace='pre';
  document.body.appendChild(tracker);

  // Crosshair line
  const crossMat=new THREE.LineBasicMaterial({ color:0xffff00 });
  const crossGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-100)]);
  const crossLine=new THREE.Line(crossGeo,crossMat);
  crossLine.visible=false;
  camera.add(crossLine);
  scene.add(camera);

  function getCameraDir(){
    const f=(keys.forward?1:0)-(keys.back?1:0);
    const s=(keys.right?1:0)-(keys.left?1:0);
    const dir=new THREE.Vector3(s,0,-f);
    if(dir.lengthSq()===0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0),player.yaw);
    return dir;
  }

  // Explosions
  const raycaster=new THREE.Raycaster();
  const mouse=new THREE.Vector2(0,0);
  const explosions=[];
  document.addEventListener('mousedown',()=>{
    if(document.pointerLockElement!==renderer.domElement) return;
    raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObjects(objects);
    if(hits.length>0){
      const point=hits[0].point.clone();
      const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,16,16),new THREE.MeshBasicMaterial({ color:0xffdd00, transparent:true, opacity:0.25 }));
      sphere.position.copy(point);
      scene.add(sphere);
      explosions.push({mesh:sphere,time:0});

      // Spherical force (no upward bias)
      const toPlayer = player.pos.clone().sub(point);
      const dist = Math.max(0.5,toPlayer.length());
      toPlayer.normalize();
      const power = 120;
      player.vel.add(toPlayer.multiplyScalar(power/dist));
    }
  });

  let prevTime=performance.now()/1000;
  function animate(){
    const now=performance.now()/1000;
    const dt=Math.min(0.1,now-prevTime);
    prevTime=now;

    const dir=getCameraDir();
    const targetSpeed=(keys.run?PLAYER.runSpeed:PLAYER.walkSpeed);

    if(player.grounded) player.coyoteTimer=PLAYER.coyoteTime; else player.coyoteTimer-=dt;
    if(player.jumpBufferTimer>0) player.jumpBufferTimer-=dt;

    // Horizontal velocity with dynamic run cap
    const hVel = new THREE.Vector3(player.vel.x,0,player.vel.z);
    if(dir.lengthSq()>0){
      const accel = player.grounded?PLAYER.accel:PLAYER.airAccel;
      hVel.addScaledVector(dir,accel*dt);

      if(player.grounded && hVel.length() > player.runCap){
        hVel.setLength(player.runCap);
      }
    } else if(player.grounded){
      hVel.multiplyScalar(PLAYER.friction);
    }
    player.vel.x=hVel.x;
    player.vel.z=hVel.z;

    // Gravity
    player.vel.y += PLAYER.gravity*dt;

    // Jump
    if(player.jumpBufferTimer>0 && (player.grounded || player.coyoteTimer>0)){
      player.grounded=false;
      player.jumpBufferTimer=0;

      const hv=new THREE.Vector3(player.vel.x,0,player.vel.z).multiplyScalar(PLAYER.jumpBoost);
      player.vel.x=hv.x; player.vel.z=hv.z;

      const hSpeed = Math.sqrt(player.vel.x**2 + player.vel.z**2);
      const flatten = Math.min(hSpeed*0.08, PLAYER.jumpPower*0.6);
      player.vel.y = PLAYER.jumpPower - flatten;

      // multiply run cap by 1.05 each jump
      player.runCap *= 1.05;
    }

    // Reset run cap if speed <= walk speed
    const currentH = Math.sqrt(player.vel.x**2 + player.vel.z**2);
    if(currentH <= PLAYER.walkSpeed){
      player.runCap = PLAYER.runSpeed;
    }

    // Update position
    player.pos.addScaledVector(player.vel, dt);

    // Ground collision
    if(player.pos.y < PLAYER.eyeHeight){
      player.pos.y = PLAYER.eyeHeight;
      player.vel.y = 0;
      player.grounded=true;
    } else player.grounded=false;

    // World wrap
    if(player.pos.x > WORLD_SIZE/2) player.pos.x -= WORLD_SIZE;
    if(player.pos.x < -WORLD_SIZE/2) player.pos.x += WORLD_SIZE;
    if(player.pos.z > WORLD_SIZE/2) player.pos.z -= WORLD_SIZE;
    if(player.pos.z < -WORLD_SIZE/2) player.pos.z += WORLD_SIZE;

    // Explosion visuals
    for(let i=explosions.length-1;i>=0;i--){
      explosions[i].time += dt;
      explosions[i].mesh.scale.setScalar(1 + explosions[i].time*4);
      explosions[i].mesh.material.opacity = 0.25*(1 - explosions[i].time/0.5);
      if(explosions[i].time > 0.5){
        scene.remove(explosions[i].mesh);
        explosions.splice(i,1);
      }
    }

    // Update camera & tracker
    updateCamera();
    tracker.textContent=`X: ${player.pos.x.toFixed(2)} Y: ${player.pos.y.toFixed(2)} Z: ${player.pos.z.toFixed(2)}\nSpeed: ${currentH.toFixed(2)}  RunCap:${player.runCap.toFixed(2)}`;

    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  }

  addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
})();

  player.runCap = PLAYER.runSpeed;
}
