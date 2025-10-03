(() => {
  const PLAYER = {
    eyeHeight: 1.65,
    walkSpeed: 3,
    runSpeed: 6,
    accel: 25,
    airAccel: 4,
    friction: 0.92,
    jumpPower: 5,
    jumpBoost: 1.05,  // 5% horizontal boost on jump
    gravity: -9.81,
    maxHSpeed: 100,
    coyoteTime: 0.25,
    jumpBuffer: 0.2
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccff);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(5, 10, 5);
  scene.add(sun);

  // Ground: big 200x200 grid
  const texLoader = new THREE.TextureLoader();
  const groundTex = texLoader.load("https://threejs.org/examples/textures/checker.png");
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(200, 200);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.NearestFilter;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ map: groundTex, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);

  // Player state
  const player = {
    pos: new THREE.Vector3(0, PLAYER.eyeHeight, 0),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    grounded: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0
  };

  function updateCamera(){
    camera.position.copy(player.pos);
    camera.rotation.set(player.pitch, player.yaw, 0, "ZYX");
  }

  // Input
  const keys = {};
  const keyMap = {
    'KeyW':'forward','ArrowUp':'forward',
    'KeyS':'back','ArrowDown':'back',
    'KeyA':'left','ArrowLeft':'left',
    'KeyD':'right','ArrowRight':'right',
    'ShiftLeft':'run','ShiftRight':'run',
    'Space':'jump'
  };

  addEventListener('keydown', e => {
    if(keyMap[e.code]){
      keys[keyMap[e.code]] = true;
      e.preventDefault();
      if(keyMap[e.code]==='jump'){
        player.jumpBufferTimer = PLAYER.jumpBuffer;
      }
    }
  });

  addEventListener('keyup', e => { if(keyMap[e.code]) keys[keyMap[e.code]] = false; });

  // Pointer lock
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  startBtn.addEventListener('click', ()=>renderer.domElement.requestPointerLock());

  document.addEventListener('pointerlockchange', ()=>{
    overlay.style.display = (document.pointerLockElement===renderer.domElement)?'none':'';
    if(document.pointerLockElement===renderer.domElement) requestAnimationFrame(animate);
  });

  document.addEventListener('mousemove', e => {
    if(document.pointerLockElement!==renderer.domElement) return;
    const sens = 0.0022;
    player.yaw -= e.movementX*sens;
    player.pitch -= e.movementY*sens;
    player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  });

  function getMoveDir(){
    const f = (keys.forward?1:0) - (keys.back?1:0);
    const s = (keys.right?1:0) - (keys.left?1:0);
    const dir = new THREE.Vector3(s,0,-f);
    if(dir.lengthSq()===0) return dir;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
    return dir;
  }

  let prevTime = performance.now()/1000;
  function animate(){
    const now = performance.now()/1000;
    const dt = Math.min(0.1, now-prevTime);
    prevTime = now;

    const dir = getMoveDir();
    const maxSpeed = (keys.run ? PLAYER.runSpeed : PLAYER.walkSpeed);

    // Update timers
    if(player.grounded) player.coyoteTimer = PLAYER.coyoteTime;
    else player.coyoteTimer -= dt;

    if(player.jumpBufferTimer > 0) player.jumpBufferTimer -= dt;

    // Horizontal movement (direct input)
    if(dir.lengthSq() > 0){
      const speed = (player.grounded ? maxSpeed : PLAYER.walkSpeed);
      player.vel.x += dir.x * speed * dt * (player.grounded ? PLAYER.accel : PLAYER.airAccel);
      player.vel.z += dir.z * speed * dt * (player.grounded ? PLAYER.accel : PLAYER.airAccel);
    }

    // Friction on ground
    if(player.grounded){
      player.vel.x *= PLAYER.friction;
      player.vel.z *= PLAYER.friction;
    }

    // Gravity
    player.vel.y += PLAYER.gravity * dt;

    // Apply jump if buffered
    if(player.jumpBufferTimer > 0 && (player.grounded || player.coyoteTimer > 0)){
      player.grounded = false;
      player.jumpBufferTimer = 0;

      // Preserve horizontal momentum with jump boost
      player.vel.x *= PLAYER.jumpBoost;
      player.vel.z *= PLAYER.jumpBoost;

      // Jump arc scaling
      const hSpeed = Math.sqrt(player.vel.x**2 + player.vel.z**2);
      const flatten = Math.min(hSpeed * 0.1, 3);
      player.vel.y = PLAYER.jumpPower - flatten;
    }

    // Update position
    player.pos.addScaledVector(player.vel, dt);

    // Ground collision
    if(player.pos.y < PLAYER.eyeHeight){
      player.pos.y = PLAYER.eyeHeight;
      player.vel.y = 0;
      player.grounded = true;
    } else player.grounded = false;

    // Horizontal velocity cap
    let hSpeed = Math.sqrt(player.vel.x**2 + player.vel.z**2);
    if(hSpeed > PLAYER.maxHSpeed){
      player.vel.x = (player.vel.x / hSpeed) * PLAYER.maxHSpeed;
      player.vel.z = (player.vel.z / hSpeed) * PLAYER.maxHSpeed;
      hSpeed = PLAYER.maxHSpeed;
    }

    // Speed reset
    if(hSpeed <= PLAYER.walkSpeed - 0.5){
      player.vel.x = 0;
      player.vel.z = 0;
    }

    updateCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
})();
