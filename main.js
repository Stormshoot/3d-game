import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 100,
    airAccel: 12,
    friction: 0.92,
    jumpPower: 10,
    jumpBoost: 1.03,
    gravity: -40,
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
    runCap: PLAYER.runSpeed,
    prevYaw: 0
  };

  function updateCamera(){ 
    camera.position.copy(player.pos); 
    camera.rotation.set(player.pitch,player.yaw,0,"ZYX"); 
  }

  // Input
  const keys={};
  const keyMap={
    'KeyW':'forward','ArrowUp':'forward',
    'KeyS':'back','ArrowDown':'back',
    'KeyA':'left','ArrowLeft':'left',
    'KeyD':'right','ArrowRight':'right',
    'ShiftLeft':'run','ShiftRight':'run',
    'Space':'jump'
  };

  addEventListener('keydown',e=>{
    if(keyMap[e.code]){
      keys[keyMap[e.code]]=true;e.preventDefault();
      if(keyMap[e.code]==='jump') player.jumpBufferTimer = PLAYER.jumpBuffer;
    }
  });
  addEventListener('keyup',e=>{ if(keyMap[e.code]) keys[keyMap[e.code]]=false; });

  // Overlay
  const overlay=document.getElementById('overlay');
  const startBtn=document.getElementById('startBtn');
  startBtn.addEventListener('click', () => {
    overlay.style.display='none';
    renderer.domElement.requestPointerLock();
  });

  // Mouse look
  document.addEventListener('mousemove',e=>{
    if(document.pointerLockElement!==renderer.domElement) return;
    const sens=0.0022;
    player.yaw -= e.movementX*sens;
    player.pitch -= e.movementY*sens;
    player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  });

  // HUD
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
  const explosions = [];
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(0,0);
  document.addEventListener('mousedown', ()=>{
    if(document.pointerLockElement!==renderer.domElement) return;
    raycaster.setFromCamera(mouse,camera);
    const hits = raycaster.intersectObjects(objects);
    if(hits.length>0){
      const point = hits[0].point.clone();
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1,16,16),
        new THREE.MeshBasicMaterial({ color:0xffdd00, transparent:true, opacity:0.25 })
      );
      sphere.position.copy(point);
      scene.add(sphere);
      explosions.push({mesh:sphere,time:0,point:point});

      const toPlayer = player.pos.clone().sub(point);
      const dist = toPlayer.length();
      if(dist < 50){
        const force = (50-dist)/50 * 120;
        toPlayer.normalize();
        player.vel.add(toPlayer.multiplyScalar(force));
      }
    }
  });

  // Animation
  let prevTime = performance.now()/1000;
  window.animate = function animate(){
    const now = performance.now()/1000;
    const dt = Math.min(0.1, now-prevTime);
    prevTime = now;

    const dir = getCameraDir();
    const targetSpeed = (keys.run?PLAYER.runSpeed:PLAYER.walkSpeed);

    if(player.grounded) player.coyoteTimer=PLAYER.coyoteTime; else player.coyoteTimer-=dt;
    if(player.jumpBufferTimer>0) player.jumpBufferTimer-=dt;

    // --- LOCK HORIZONTAL VELOCITY TO CAMERA ---
    const yawDelta = player.yaw - player.prevYaw;
    const horizVel = new THREE.Vector3(player.vel.x,0,player.vel.z);
    horizVel.applyAxisAngle(new THREE.Vector3(0,1,0), yawDelta); // rotate with camera
    player.vel.x = horizVel.x;
    player.vel.z = horizVel.z;
    player.prevYaw = player.yaw;

    // Apply input acceleration
    if(dir.lengthSq() > 0){
      const accel = player.grounded ? PLAYER.accel : PLAYER.airAccel;
      player.vel.x += dir.x*accel*dt;
      player.vel.z += dir.z*accel*dt;

      // Clamp to runCap
      const hSpeed = Math.sqrt(player.vel.x**2 + player.vel.z**2);
      if(hSpeed > player.runCap){
        player.vel.x = (player.vel.x/hSpeed)*player.runCap;
        player.vel.z = (player.vel.z/hSpeed)*player.runCap;
      }
    } else if(player.grounded){
      player.vel.x *= PLAYER.friction;
      player.vel.z *= PLAYER.friction;
    }

    // Gravity
    player.vel.y += PLAYER.gravity*dt;

    // Jump
    if(player.jumpBufferTimer>0 && (player.grounded || player.coyoteTimer>0)){
      player.grounded=false;
      player.jumpBufferTimer=0;

      const hv = new THREE.Vector3(player.vel.x,0,player.vel.z).multiplyScalar(PLAYER.jumpBoost);
      player.vel.x = hv.x;
      player.vel.z = hv.z;

      const hSpeed = Math.sqrt(player.vel.x**2 + player.vel.z**2);
      const flatten = Math.min(hSpeed*0.08, PLAYER.jumpPower*0.6);
      player.vel.y = PLAYER.jumpPower - flatten;

      player.runCap *= 1.05;
    }

    // Reset runCap if moving slowly
    const currentH = Math.sqrt(player.vel.x**2 + player.vel.z**2);
    if(currentH <= PLAYER.walkSpeed) player.runCap = PLAYER.runSpeed;

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

    // Explosions visuals
    for(let i=explosions.length-1;i>=0;i--){
      explosions[i].time += dt;
      explosions[i].mesh.scale.setScalar(1 + explosions[i].time*4);
      explosions[i].mesh.material.opacity = 0.25*(1 - explosions[i].time/0.5);
      if(explosions[i].time > 0.5){
        scene.remove(explosions[i].mesh);
        explosions.splice(i,1);
      }
    }

    updateCamera();
    tracker.textContent=`X: ${player.pos.x.toFixed(2)} Y: ${player.pos.y.toFixed(2)} Z: ${player.pos.z.toFixed(2)}\nSpeed: ${currentH.toFixed(2)} RunCap: ${player.runCap.toFixed(2)}`;

    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  };

  // Start animation on pointer lock
  document.addEventListener('pointerlockchange', () => {
    if(document.pointerLockElement === renderer.domElement && !animationStarted){
      animate();
      animationStarted = true;
    }
  });

  addEventListener('resize',()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
})();
